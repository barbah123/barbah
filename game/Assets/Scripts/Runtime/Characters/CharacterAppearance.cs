using System.Collections.Generic;
using UnityEngine;

namespace Barbah.Coop
{
    /// <summary>
    /// Secilen hayvana gore yer tutucu karakter gorunumunu primitiflerden
    /// kurar (govde, kafa, kulak, kuyruk, gaga/burun + takili esyalar).
    /// Gercek 3D modeller geldiginde sadece bu sinif degisecek.
    /// </summary>
    public static class CharacterAppearance
    {
        private const string VisualRootName = "Gorunum";

        private static readonly Color Dark = new Color(0.12f, 0.10f, 0.10f);

        public static void Build(Transform parent, string characterId, IEnumerable<string> equippedItems)
        {
            // Onceki gorunumu temizle
            var old = parent.Find(VisualRootName);
            if (old != null) Object.Destroy(old.gameObject);

            var def = CharacterCatalog.Get(characterId);

            var root = new GameObject(VisualRootName).transform;
            root.SetParent(parent, false);

            // Govde + gobek
            Part(root, PrimitiveType.Capsule, new Vector3(0f, 0.62f, 0f), new Vector3(0.72f, 0.55f, 0.66f), def.Body);
            Part(root, PrimitiveType.Sphere, new Vector3(0f, 0.60f, 0.16f), new Vector3(0.46f, 0.52f, 0.36f), def.Belly);

            // Kafa + gozler
            Part(root, PrimitiveType.Sphere, new Vector3(0f, 1.38f, 0f), Vector3.one * 0.62f, def.Head);
            Part(root, PrimitiveType.Sphere, new Vector3(-0.14f, 1.44f, 0.24f), Vector3.one * 0.10f, Dark);
            Part(root, PrimitiveType.Sphere, new Vector3(0.14f, 1.44f, 0.24f), Vector3.one * 0.10f, Dark);

            BuildNose(root, def);
            BuildEars(root, def);
            BuildTail(root, def);
            BuildExtra(root, def);

            if (equippedItems != null)
                foreach (string itemId in equippedItems)
                    CosmeticCatalog.Attach(root, itemId);
        }

        private static void BuildNose(Transform root, CharacterDef def)
        {
            switch (def.Nose)
            {
                case NoseStyle.Black:
                    Part(root, PrimitiveType.Sphere, new Vector3(0f, 1.32f, 0.29f), Vector3.one * 0.09f, Dark);
                    break;
                case NoseStyle.BeakSmall:
                    Part(root, PrimitiveType.Sphere, new Vector3(0f, 1.34f, 0.30f),
                        new Vector3(0.14f, 0.10f, 0.16f), new Color(0.95f, 0.65f, 0.15f));
                    break;
                case NoseStyle.BeakBig:
                    Part(root, PrimitiveType.Sphere, new Vector3(0f, 1.34f, 0.36f),
                        new Vector3(0.16f, 0.12f, 0.34f), new Color(0.95f, 0.70f, 0.15f));
                    break;
                case NoseStyle.Snout:
                    Part(root, PrimitiveType.Sphere, new Vector3(0f, 1.34f, 0.28f),
                        new Vector3(0.22f, 0.16f, 0.14f), new Color(0.92f, 0.58f, 0.56f));
                    break;
            }
        }

        private static void BuildEars(Transform root, CharacterDef def)
        {
            switch (def.Ears)
            {
                case EarStyle.Pointy:
                    Part(root, PrimitiveType.Cube, new Vector3(-0.20f, 1.72f, 0f),
                        new Vector3(0.16f, 0.26f, 0.08f), def.Body, new Vector3(0f, 0f, 20f));
                    Part(root, PrimitiveType.Cube, new Vector3(0.20f, 1.72f, 0f),
                        new Vector3(0.16f, 0.26f, 0.08f), def.Body, new Vector3(0f, 0f, -20f));
                    break;
                case EarStyle.Round:
                    Part(root, PrimitiveType.Sphere, new Vector3(-0.22f, 1.68f, 0f), Vector3.one * 0.20f, def.Body);
                    Part(root, PrimitiveType.Sphere, new Vector3(0.22f, 1.68f, 0f), Vector3.one * 0.20f, def.Body);
                    break;
                case EarStyle.Long:
                    Part(root, PrimitiveType.Capsule, new Vector3(-0.16f, 1.90f, 0f),
                        new Vector3(0.14f, 0.28f, 0.10f), def.Body, new Vector3(0f, 0f, 8f));
                    Part(root, PrimitiveType.Capsule, new Vector3(0.16f, 1.90f, 0f),
                        new Vector3(0.14f, 0.28f, 0.10f), def.Body, new Vector3(0f, 0f, -8f));
                    break;
                case EarStyle.Tuft:
                    Part(root, PrimitiveType.Cube, new Vector3(-0.20f, 1.74f, 0f),
                        new Vector3(0.10f, 0.18f, 0.06f), def.Body, new Vector3(0f, 0f, 25f));
                    Part(root, PrimitiveType.Cube, new Vector3(0.20f, 1.74f, 0f),
                        new Vector3(0.10f, 0.18f, 0.06f), def.Body, new Vector3(0f, 0f, -25f));
                    break;
            }
        }

        private static void BuildTail(Transform root, CharacterDef def)
        {
            switch (def.Tail)
            {
                case TailStyle.Bushy:
                    Part(root, PrimitiveType.Capsule, new Vector3(0f, 0.66f, -0.42f),
                        new Vector3(0.26f, 0.34f, 0.26f), def.Body, new Vector3(-40f, 0f, 0f));
                    break;
                case TailStyle.Curly:
                    Part(root, PrimitiveType.Sphere, new Vector3(0f, 0.72f, -0.38f),
                        new Vector3(0.14f, 0.14f, 0.14f), def.Body);
                    break;
                case TailStyle.Stub:
                    Part(root, PrimitiveType.Sphere, new Vector3(0f, 0.58f, -0.36f),
                        Vector3.one * 0.16f, def.Belly);
                    break;
                case TailStyle.Long:
                    Part(root, PrimitiveType.Capsule, new Vector3(0f, 0.52f, -0.50f),
                        new Vector3(0.16f, 0.30f, 0.16f), def.Body, new Vector3(-65f, 0f, 0f));
                    break;
            }
        }

        private static void BuildExtra(Transform root, CharacterDef def)
        {
            switch (def.Extra)
            {
                case ExtraStyle.Spikes:
                    for (int i = 0; i < 3; i++)
                        Part(root, PrimitiveType.Cube,
                            new Vector3(0f, 0.95f + i * 0.18f, -0.28f + i * 0.02f),
                            new Vector3(0.5f - i * 0.1f, 0.14f, 0.14f),
                            new Color(0.45f, 0.35f, 0.24f), new Vector3(45f, 0f, 0f));
                    break;
                case ExtraStyle.Antlers:
                    Part(root, PrimitiveType.Cube, new Vector3(-0.20f, 1.88f, 0f),
                        new Vector3(0.06f, 0.34f, 0.06f), new Color(0.55f, 0.45f, 0.32f), new Vector3(0f, 0f, 15f));
                    Part(root, PrimitiveType.Cube, new Vector3(0.20f, 1.88f, 0f),
                        new Vector3(0.06f, 0.34f, 0.06f), new Color(0.55f, 0.45f, 0.32f), new Vector3(0f, 0f, -15f));
                    break;
                case ExtraStyle.Gills:
                    Part(root, PrimitiveType.Cube, new Vector3(-0.32f, 1.44f, 0f),
                        new Vector3(0.06f, 0.20f, 0.10f), new Color(0.95f, 0.35f, 0.45f), new Vector3(0f, 0f, 30f));
                    Part(root, PrimitiveType.Cube, new Vector3(0.32f, 1.44f, 0f),
                        new Vector3(0.06f, 0.20f, 0.10f), new Color(0.95f, 0.35f, 0.45f), new Vector3(0f, 0f, -30f));
                    break;
            }
        }

        /// <summary>Carpismasiz, renkli bir primitif parca olusturur.</summary>
        public static GameObject Part(Transform parent, PrimitiveType type,
            Vector3 localPosition, Vector3 localScale, Color color, Vector3? localEuler = null)
        {
            var go = GameObject.CreatePrimitive(type);
            Object.Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPosition;
            go.transform.localScale = localScale;
            if (localEuler.HasValue) go.transform.localEulerAngles = localEuler.Value;
            go.GetComponent<Renderer>().material = NewMaterial(color);
            return go;
        }

        private static Material NewMaterial(Color color)
        {
            // Sahnedeki materyaller Standard shader kullandigi icin build'e dahildir.
            var mat = new Material(Shader.Find("Standard")) { color = color };
            return mat;
        }
    }
}
