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
    /// Tek tikla oyun sahnesini kurar: oyuncu prefab'i, test dunyasi
    /// (zemin, platformlar, co-op kapi bulmacasi), NetworkManager,
    /// kamera ve tum UI (menu + joystick + ziplama butonu).
    /// Unity menusu: Barbah > Oyun Sahnesini Kur
    /// </summary>
    public static class GameSceneBuilder
    {
        private const string Root = "Assets/Game";
        private const string ScenePath = Root + "/Scenes/Main.unity";

        [MenuItem("Barbah/Oyun Sahnesini Kur")]
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
                "Barbah Co-op",
                "Sahne kuruldu!\n\nPlay'e basarak deneyebilirsin.\n" +
                "Online test icin once Project Settings > Services'ten projeyi bagla ve Relay'i etkinlestir.",
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
            string path = Root + "/Prefabs/Player.prefab";
            var existing = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (existing != null) return existing;

            var root = new GameObject("Player");

            var cc = root.AddComponent<CharacterController>();
            cc.height = 1.8f;
            cc.radius = 0.35f;
            cc.center = new Vector3(0f, 0.95f, 0f);

            Material playerMat = Mat("Player", Color.white);
            CreatePart(PrimitiveType.Capsule, root.transform, new Vector3(0f, 0.95f, 0f),
                new Vector3(0.7f, 0.9f, 0.7f), playerMat);
            // Yon gostergesi (burun) — karakterin nereye baktigi belli olsun.
            CreatePart(PrimitiveType.Cube, root.transform, new Vector3(0f, 1.45f, 0.38f),
                new Vector3(0.22f, 0.22f, 0.22f), playerMat);

            root.AddComponent<NetworkObject>();
            root.AddComponent<ClientNetworkTransform>();
            root.AddComponent<PlayerController>();

            var prefab = PrefabUtility.SaveAsPrefabAsset(root, path);
            Object.DestroyImmediate(root);
            return prefab;
        }

        // ---------------------------------------------------------- dunya

        private static void BuildWorld()
        {
            // Zemin
            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Zemin";
            ground.transform.localScale = new Vector3(8f, 1f, 8f);
            ground.GetComponent<Renderer>().sharedMaterial = Mat("Zemin", new Color(0.36f, 0.55f, 0.36f));

            // Ziplama testi icin merdiven platformlar
            Material platMat = Mat("Platform", new Color(0.62f, 0.5f, 0.4f));
            CreateBlock("Platform1", new Vector3(-10f, 0.5f, 0f), new Vector3(3f, 1f, 3f), platMat);
            CreateBlock("Platform2", new Vector3(-13f, 1.5f, 3f), new Vector3(3f, 1f, 3f), platMat);
            CreateBlock("Platform3", new Vector3(-10f, 2.5f, 6f), new Vector3(3f, 1f, 3f), platMat);

            // Co-op bulmaca: iki plaka + duvar + kapi
            Material plateMat = Mat("Plaka", new Color(1f, 0.55f, 0.15f));
            var plateA = CreatePlate("PlakaA", new Vector3(-6f, 0.08f, 8f), plateMat);
            var plateB = CreatePlate("PlakaB", new Vector3(6f, 0.08f, 8f), plateMat);

            Material wallMat = Mat("Duvar", new Color(0.55f, 0.55f, 0.6f));
            CreateBlock("DuvarSol", new Vector3(-5.9f, 2.5f, 12f), new Vector3(8.2f, 5f, 0.4f), wallMat);
            CreateBlock("DuvarSag", new Vector3(5.9f, 2.5f, 12f), new Vector3(8.2f, 5f, 0.4f), wallMat);

            var door = CreateBlock("Kapi", new Vector3(0f, 2.5f, 12f), new Vector3(3.6f, 5f, 0.4f),
                Mat("Kapi", new Color(0.25f, 0.45f, 0.9f)));
            door.AddComponent<NetworkObject>();
            var coopDoor = door.AddComponent<CoopDoor>();
            coopDoor.plateA = plateA;
            coopDoor.plateB = plateB;

            // Kapinin arkasindaki odul
            CreateBlock("Odul", new Vector3(0f, 0.5f, 16f), Vector3.one,
                Mat("Odul", new Color(1f, 0.85f, 0.2f)));
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

        // ---------------------------------------------------------- UI

        private static void BuildUI()
        {
            var canvasGO = new GameObject("Canvas",
                typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var canvas = canvasGO.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGO.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 0.5f;

            new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));

            // ---- Menu paneli
            var menu = UIObject("MenuPanel", canvasGO.transform);
            Stretch(menu);
            var menuBg = menu.AddComponent<Image>();
            menuBg.color = new Color(0.08f, 0.09f, 0.13f, 0.96f);

            MakeText(menu.transform, "Baslik", "BARBAH CO-OP",
                new Vector2(0.5f, 0.5f), new Vector2(0f, 260f), new Vector2(1000f, 120f), 76, FontStyle.Bold);

            var hostButton = MakeButton(menu.transform, "OdaKurButonu", "ODA KUR",
                new Vector2(0f, 80f), new Vector2(440f, 110f));

            var joinInput = MakeInputField(menu.transform, "KodGirisi", "ODA KODU",
                new Vector2(0f, -80f), new Vector2(440f, 90f));

            var joinButton = MakeButton(menu.transform, "KatilButonu", "KATIL",
                new Vector2(0f, -210f), new Vector2(440f, 110f));

            var statusText = MakeText(menu.transform, "Durum", "",
                new Vector2(0.5f, 0.5f), new Vector2(0f, -360f), new Vector2(1200f, 120f), 32, FontStyle.Normal);

            // ---- Oyun ici HUD
            var hud = UIObject("HUD", canvasGO.transform);
            Stretch(hud);

            var joinCodeText = MakeText(hud.transform, "OdaKodu", "",
                new Vector2(0.5f, 1f), new Vector2(0f, -60f), new Vector2(800f, 80f), 40, FontStyle.Bold);

            BuildJoystick(hud.transform);
            BuildJumpButton(hud.transform);

            hud.SetActive(false);

            // ---- Baglanti
            var ui = canvasGO.AddComponent<MainMenuUI>();
            ui.menuPanel = menu;
            ui.hudPanel = hud;
            ui.hostButton = hostButton;
            ui.joinButton = joinButton;
            ui.joinInput = joinInput;
            ui.statusText = statusText;
            ui.joinCodeText = joinCodeText;
        }

        private static void BuildJoystick(Transform parent)
        {
            var baseGO = UIObject("Joystick", parent);
            var baseRect = SetRect(baseGO, new Vector2(0f, 0f), new Vector2(280f, 280f), new Vector2(340f, 340f));
            var baseImage = baseGO.AddComponent<Image>();
            baseImage.sprite = BuiltinSprite("UI/Skin/Background.psd");
            baseImage.type = Image.Type.Sliced;
            baseImage.color = new Color(1f, 1f, 1f, 0.35f);

            var handleGO = UIObject("Tutamac", baseGO.transform);
            var handleRect = SetRect(handleGO, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(140f, 140f));
            var handleImage = handleGO.AddComponent<Image>();
            handleImage.sprite = BuiltinSprite("UI/Skin/Knob.psd");
            handleImage.color = new Color(1f, 1f, 1f, 0.8f);
            handleImage.raycastTarget = false;

            var joystick = baseGO.AddComponent<VirtualJoystick>();
            joystick.SetHandle(handleRect);
        }

        private static void BuildJumpButton(Transform parent)
        {
            var go = UIObject("ZiplaButonu", parent);
            SetRect(go, new Vector2(1f, 0f), new Vector2(-280f, 280f), new Vector2(240f, 240f));
            var image = go.AddComponent<Image>();
            image.sprite = BuiltinSprite("UI/Skin/Knob.psd");
            image.color = new Color(1f, 1f, 1f, 0.6f);
            go.AddComponent<JumpButton>();

            MakeText(go.transform, "Etiket", "ZIPLA",
                new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(240f, 80f), 40, FontStyle.Bold)
                .color = new Color(0.1f, 0.1f, 0.15f);
        }

        // ---------------------------------------------------------- UI yardimcilari

        private static GameObject UIObject(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            return go;
        }

        private static void Stretch(GameObject go)
        {
            var rect = (RectTransform)go.transform;
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;
        }

        private static RectTransform SetRect(GameObject go, Vector2 anchor, Vector2 position, Vector2 size)
        {
            var rect = (RectTransform)go.transform;
            rect.anchorMin = anchor;
            rect.anchorMax = anchor;
            rect.anchoredPosition = position;
            rect.sizeDelta = size;
            return rect;
        }

        private static Text MakeText(Transform parent, string name, string content,
            Vector2 anchor, Vector2 position, Vector2 size, int fontSize, FontStyle style)
        {
            var go = UIObject(name, parent);
            SetRect(go, anchor, position, size);
            var text = go.AddComponent<Text>();
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            text.text = content;
            text.fontSize = fontSize;
            text.fontStyle = style;
            text.alignment = TextAnchor.MiddleCenter;
            text.color = Color.white;
            text.raycastTarget = false;
            return text;
        }

        private static Button MakeButton(Transform parent, string name, string label,
            Vector2 position, Vector2 size)
        {
            var go = UIObject(name, parent);
            SetRect(go, new Vector2(0.5f, 0.5f), position, size);
            var image = go.AddComponent<Image>();
            image.sprite = BuiltinSprite("UI/Skin/UISprite.psd");
            image.type = Image.Type.Sliced;
            image.color = new Color(0.2f, 0.55f, 1f);

            var button = go.AddComponent<Button>();
            button.targetGraphic = image;

            MakeText(go.transform, "Etiket", label,
                new Vector2(0.5f, 0.5f), Vector2.zero, size, 44, FontStyle.Bold);

            return button;
        }

        private static InputField MakeInputField(Transform parent, string name, string placeholder,
            Vector2 position, Vector2 size)
        {
            var go = UIObject(name, parent);
            SetRect(go, new Vector2(0.5f, 0.5f), position, size);
            var image = go.AddComponent<Image>();
            image.sprite = BuiltinSprite("UI/Skin/InputFieldBackground.psd");
            image.type = Image.Type.Sliced;

            var input = go.AddComponent<InputField>();
            input.targetGraphic = image;
            input.characterLimit = 8;

            var placeholderText = MakeText(go.transform, "YerTutucu", placeholder,
                new Vector2(0.5f, 0.5f), Vector2.zero, size - new Vector2(40f, 20f), 40, FontStyle.Italic);
            placeholderText.color = new Color(0.4f, 0.4f, 0.45f);

            var valueText = MakeText(go.transform, "Metin", "",
                new Vector2(0.5f, 0.5f), Vector2.zero, size - new Vector2(40f, 20f), 40, FontStyle.Bold);
            valueText.color = new Color(0.1f, 0.1f, 0.15f);
            valueText.supportRichText = false;

            input.placeholder = placeholderText;
            input.textComponent = valueText;
            return input;
        }

        private static Sprite BuiltinSprite(string path)
        {
            return AssetDatabase.GetBuiltinExtraResource<Sprite>(path);
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

        // ---------------------------------------------------------- parcalar

        private static void CreatePart(PrimitiveType type, Transform parent,
            Vector3 localPosition, Vector3 localScale, Material mat)
        {
            var part = GameObject.CreatePrimitive(type);
            Object.DestroyImmediate(part.GetComponent<Collider>());
            part.transform.SetParent(parent, false);
            part.transform.localPosition = localPosition;
            part.transform.localScale = localScale;
            part.GetComponent<Renderer>().sharedMaterial = mat;
        }
    }
}
