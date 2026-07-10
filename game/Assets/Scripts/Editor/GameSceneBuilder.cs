using Unity.Netcode;
using Unity.Netcode.Transports.UTP;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Barbah.Coop.EditorTools
{
    /// <summary>
    /// Tek tikla Badaland sahnesini kurar: oyuncu prefab'i, test dunyasi
    /// (Bolum 1: co-op kapi bulmacasi + hedef alani), NetworkManager,
    /// kamera ve arayuz tasiyicisi. Menuler calisma zamaninda kodla
    /// kurulur (MenuFlow + UiFactory) — arayuzu degistirmek icin sahneyi
    /// yeniden olusturmak gerekmez.
    /// Unity menusu: Badaland > Oyun Sahnesini Kur
    /// </summary>
    public static class GameSceneBuilder
    {
        private const string Root = "Assets/Game";
        private const string ScenePath = Root + "/Scenes/Main.unity";
        private const string PlayerPrefabPath = Root + "/Prefabs/Player.prefab";

        [MenuItem("Badaland/Oyun Sahnesini Kur")]
        public static void Build()
        {
            EnsureFolders();

            GameObject playerPrefab = BuildPlayerPrefab();

            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);

            BuildWorld();
            BuildNetwork(playerPrefab);
            SetupCamera();
            BuildUI();

            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();

            EditorUtility.DisplayDialog(
                "Badaland",
                "Sahne kuruldu!\n\nPlay'e basarak deneyebilirsin.\n" +
                "Online test icin Project Settings > Services'ten projeyi bagla ve Relay'i etkinlestir.\n" +
                "Hesap/market icin game/backend'i deploy edip ApiClient.BaseUrl'i guncelle.",
                "Tamam");
        }

        // ---------------------------------------------------------- klasorler

        private static void EnsureFolders()
        {
            CreateFolder("Assets", "Game");
            CreateFolder(Root, "Scenes");
            CreateFolder(Root, "Prefabs");
            CreateFolder(Root, "Materials");
        }

        private static void CreateFolder(string parent, string name)
        {
            if (!AssetDatabase.IsValidFolder(parent + "/" + name))
                AssetDatabase.CreateFolder(parent, name);
        }

        // ---------------------------------------------------------- oyuncu

        private static GameObject BuildPlayerPrefab()
        {
            // Her kurulumda guncel bilesenlerle bastan olustur.
            AssetDatabase.DeleteAsset(PlayerPrefabPath);

            var root = new GameObject("Player");

            var cc = root.AddComponent<CharacterController>();
            cc.height = 1.8f;
            cc.radius = 0.35f;
            cc.center = new Vector3(0f, 0.95f, 0f);

            root.AddComponent<NetworkObject>();
            root.AddComponent<ClientNetworkTransform>();
            root.AddComponent<PlayerController>();
            // Gorunum (secili hayvan + kiyafetler) calisma zamaninda kurulur.
            root.AddComponent<PlayerAvatar>();

            var prefab = PrefabUtility.SaveAsPrefabAsset(root, PlayerPrefabPath);
            Object.DestroyImmediate(root);
            return prefab;
        }

        // ---------------------------------------------------------- dunya (Bolum 1)

        private static void BuildWorld()
        {
            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Zemin";
            ground.transform.localScale = new Vector3(8f, 1f, 8f);
            ground.GetComponent<Renderer>().sharedMaterial = Mat("Zemin", new Color(0.55f, 0.68f, 0.42f));

            // Ziplama testi icin merdiven platformlar
            Material platMat = Mat("Platform", new Color(0.72f, 0.58f, 0.42f));
            CreateBlock("Platform1", new Vector3(-10f, 0.5f, 0f), new Vector3(3f, 1f, 3f), platMat);
            CreateBlock("Platform2", new Vector3(-13f, 1.5f, 3f), new Vector3(3f, 1f, 3f), platMat);
            CreateBlock("Platform3", new Vector3(-10f, 2.5f, 6f), new Vector3(3f, 1f, 3f), platMat);

            // Co-op bulmaca: iki plaka ayni anda basilirsa kapi acilir
            Material plateMat = Mat("Plaka", new Color(1f, 0.55f, 0.15f));
            var plateA = CreatePlate("PlakaA", new Vector3(-6f, 0.08f, 8f), plateMat);
            var plateB = CreatePlate("PlakaB", new Vector3(6f, 0.08f, 8f), plateMat);

            Material wallMat = Mat("Duvar", new Color(0.62f, 0.58f, 0.52f));
            CreateBlock("DuvarSol", new Vector3(-5.9f, 2.5f, 12f), new Vector3(8.2f, 5f, 0.4f), wallMat);
            CreateBlock("DuvarSag", new Vector3(5.9f, 2.5f, 12f), new Vector3(8.2f, 5f, 0.4f), wallMat);

            var door = CreateBlock("Kapi", new Vector3(0f, 2.5f, 12f), new Vector3(3.6f, 5f, 0.4f),
                Mat("Kapi", new Color(0.25f, 0.45f, 0.9f)));
            door.AddComponent<NetworkObject>();
            var coopDoor = door.AddComponent<CoopDoor>();
            coopDoor.plateA = plateA;
            coopDoor.plateB = plateB;

            // Kapinin arkasindaki hedef alani: iki oyuncu birlikte basarsa bolum biter
            var goal = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            goal.name = "Hedef";
            goal.transform.position = new Vector3(0f, 0.06f, 16f);
            goal.transform.localScale = new Vector3(3f, 0.06f, 3f);
            goal.GetComponent<Renderer>().sharedMaterial = Mat("Hedef", new Color(1f, 0.85f, 0.2f));
            goal.AddComponent<NetworkObject>();
            goal.AddComponent<LevelGoal>().levelId = 1;
        }

        private static CoopPressurePlate CreatePlate(string name, Vector3 position, Material mat)
        {
            var plate = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            plate.name = name;
            plate.transform.position = position;
            plate.transform.localScale = new Vector3(1.6f, 0.08f, 1.6f);
            plate.GetComponent<Renderer>().sharedMaterial = mat;
            plate.AddComponent<NetworkObject>();
            return plate.AddComponent<CoopPressurePlate>();
        }

        private static GameObject CreateBlock(string name, Vector3 position, Vector3 scale, Material mat)
        {
            var block = GameObject.CreatePrimitive(PrimitiveType.Cube);
            block.name = name;
            block.transform.position = position;
            block.transform.localScale = scale;
            block.GetComponent<Renderer>().sharedMaterial = mat;
            return block;
        }

        // ---------------------------------------------------------- ag

        private static void BuildNetwork(GameObject playerPrefab)
        {
            var go = new GameObject("NetworkManager");
            var nm = go.AddComponent<NetworkManager>();
            var transport = go.AddComponent<UnityTransport>();

            if (nm.NetworkConfig == null) nm.NetworkConfig = new NetworkConfig();
            nm.NetworkConfig.NetworkTransport = transport;
            nm.NetworkConfig.PlayerPrefab = playerPrefab;

            new GameObject("ConnectionManager").AddComponent<ConnectionManager>();
        }

        private static void SetupCamera()
        {
            var cam = Camera.main;
            if (cam == null) return;
            cam.transform.position = new Vector3(0f, 7f, -10f);
            cam.transform.rotation = Quaternion.Euler(28f, 0f, 0f);
            cam.gameObject.AddComponent<OrbitCamera>();
        }

        // ---------------------------------------------------------- arayuz

        private static void BuildUI()
        {
            var canvasGO = new GameObject("GameUI",
                typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var canvas = canvasGO.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGO.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 0.5f;

            // Paneller calisma zamaninda MenuFlow tarafindan kurulur.
            canvasGO.AddComponent<AuthUI>();
            canvasGO.AddComponent<HomeUI>();
            canvasGO.AddComponent<LevelsUI>();
            canvasGO.AddComponent<PlayUI>();
            canvasGO.AddComponent<MarketUI>();
            canvasGO.AddComponent<CharacterSelectUI>();
            canvasGO.AddComponent<HudUI>();
            canvasGO.AddComponent<MenuFlow>();

            new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
        }

        private static Material Mat(string name, Color color)
        {
            string path = Root + "/Materials/" + name + ".mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null)
            {
                mat = new Material(Shader.Find("Standard")) { color = color };
                AssetDatabase.CreateAsset(mat, path);
            }
            return mat;
        }
    }
}
