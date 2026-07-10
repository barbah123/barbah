using System.Collections.Generic;
using UnityEngine;

namespace Barbah.Coop
{
    public class CosmeticDef
    {
        public string Id;
        public string Name;
        public string Slot; // sapka / gozluk / sirt
        public int Price;
    }

    /// <summary>
    /// PK XD tarzi kiyafet/aksesuar katalogu. ID'ler backend katalogu ile
    /// birebir aynidir. Gorseller simdilik primitiflerden kurulur.
    /// </summary>
    public static class CosmeticCatalog
    {
        public static readonly List<CosmeticDef> All = new List<CosmeticDef>
        {
            new CosmeticDef { Id = "sapka_parti", Name = "Parti Şapkası", Slot = "sapka", Price = 100 },
            new CosmeticDef { Id = "sapka_kovboy", Name = "Kovboy Şapkası", Slot = "sapka", Price = 200 },
            new CosmeticDef { Id = "sapka_tac", Name = "Altın Taç", Slot = "sapka", Price = 500 },
            new CosmeticDef { Id = "gozluk_kare", Name = "Kare Gözlük", Slot = "gozluk", Price = 100 },
            new CosmeticDef { Id = "gozluk_pilot", Name = "Pilot Gözlüğü", Slot = "gozluk", Price = 250 },
            new CosmeticDef { Id = "sirt_canta", Name = "Sırt Çantası", Slot = "sirt", Price = 150 },
            new CosmeticDef { Id = "sirt_roket", Name = "Roket Çantası", Slot = "sirt", Price = 600 },
        };

        public static CosmeticDef Get(string id)
        {
            foreach (var def in All)
                if (def.Id == id) return def;
            return null;
        }

        /// <summary>Takili esyanin gorselini karakterin uzerine kurar.</summary>
        public static void Attach(Transform visualRoot, string itemId)
        {
            switch (itemId)
            {
                case "sapka_parti":
                    CharacterAppearance.Part(visualRoot, PrimitiveType.Cylinder,
                        new Vector3(0f, 1.82f, 0f), new Vector3(0.16f, 0.20f, 0.16f), new Color(0.95f, 0.30f, 0.35f));
                    CharacterAppearance.Part(visualRoot, PrimitiveType.Sphere,
                        new Vector3(0f, 2.04f, 0f), Vector3.one * 0.10f, new Color(1f, 0.9f, 0.3f));
                    break;

                case "sapka_kovboy":
                    CharacterAppearance.Part(visualRoot, PrimitiveType.Cylinder,
                        new Vector3(0f, 1.72f, 0f), new Vector3(0.50f, 0.02f, 0.50f), new Color(0.5f, 0.33f, 0.18f));
                    CharacterAppearance.Part(visualRoot, PrimitiveType.Cylinder,
                        new Vector3(0f, 1.82f, 0f), new Vector3(0.24f, 0.10f, 0.24f), new Color(0.5f, 0.33f, 0.18f));
                    break;

                case "sapka_tac":
                    CharacterAppearance.Part(visualRoot, PrimitiveType.Cylinder,
                        new Vector3(0f, 1.78f, 0f), new Vector3(0.28f, 0.08f, 0.28f), new Color(1f, 0.8f, 0.2f));
                    CharacterAppearance.Part(visualRoot, PrimitiveType.Sphere,
                        new Vector3(0f, 1.90f, 0f), Vector3.one * 0.08f, new Color(0.9f, 0.2f, 0.3f));
                    break;

                case "gozluk_kare":
                    CharacterAppearance.Part(visualRoot, PrimitiveType.Cube,
                        new Vector3(-0.14f, 1.42f, 0.28f), new Vector3(0.16f, 0.12f, 0.04f), new Color(0.15f, 0.15f, 0.18f));
                    CharacterAppearance.Part(visualRoot, PrimitiveType.Cube,
                        new Vector3(0.14f, 1.42f, 0.28f), new Vector3(0.16f, 0.12f, 0.04f), new Color(0.15f, 0.15f, 0.18f));
                    break;

                case "gozluk_pilot":
                    CharacterAppearance.Part(visualRoot, PrimitiveType.Sphere,
                        new Vector3(-0.14f, 1.42f, 0.28f), new Vector3(0.16f, 0.14f, 0.06f), new Color(0.75f, 0.85f, 0.95f));
                    CharacterAppearance.Part(visualRoot, PrimitiveType.Sphere,
                        new Vector3(0.14f, 1.42f, 0.28f), new Vector3(0.16f, 0.14f, 0.06f), new Color(0.75f, 0.85f, 0.95f));
                    break;

                case "sirt_canta":
                    CharacterAppearance.Part(visualRoot, PrimitiveType.Cube,
                        new Vector3(0f, 0.85f, -0.32f), new Vector3(0.36f, 0.44f, 0.18f), new Color(0.75f, 0.30f, 0.22f));
                    break;

                case "sirt_roket":
                    CharacterAppearance.Part(visualRoot, PrimitiveType.Capsule,
                        new Vector3(0f, 0.85f, -0.34f), new Vector3(0.22f, 0.28f, 0.22f), new Color(0.7f, 0.72f, 0.76f));
                    CharacterAppearance.Part(visualRoot, PrimitiveType.Sphere,
                        new Vector3(0f, 0.52f, -0.34f), new Vector3(0.14f, 0.18f, 0.14f), new Color(1f, 0.55f, 0.15f));
                    break;
            }
        }
    }
}
