using System.Collections.Generic;
using UnityEngine;

namespace Barbah.Coop
{
    public enum EarStyle { None, Pointy, Round, Long, Tuft }
    public enum TailStyle { None, Bushy, Curly, Stub, Long }
    public enum NoseStyle { Black, BeakSmall, BeakBig, Snout }
    public enum ExtraStyle { None, Spikes, Antlers, Gills }

    /// <summary>Bir hayvan karakterin tanimi ve yer tutucu gorunum parametreleri.</summary>
    public class CharacterDef
    {
        public string Id;
        public string Name;
        public int Price;          // 0 = ucretsiz
        public Color Body;
        public Color Belly;
        public Color Head;
        public EarStyle Ears;
        public TailStyle Tail;
        public NoseStyle Nose;
        public ExtraStyle Extra;
    }

    /// <summary>
    /// Referans gorsellerdeki hayvanlar. ID'ler ve fiyatlar backend'deki
    /// (game/backend/src/catalog.ts) katalogla birebir ayni olmalidir.
    /// Gercek 3D modeller gelene kadar gorunumler primitiflerden kurulur.
    /// </summary>
    public static class CharacterCatalog
    {
        private static Color C(float r, float g, float b) => new Color(r, g, b);

        public static readonly List<CharacterDef> All = new List<CharacterDef>
        {
            new CharacterDef { Id = "tilki", Name = "Tilki", Price = 0,
                Body = C(0.93f, 0.48f, 0.18f), Belly = C(0.98f, 0.94f, 0.86f), Head = C(0.93f, 0.48f, 0.18f),
                Ears = EarStyle.Pointy, Tail = TailStyle.Bushy, Nose = NoseStyle.Black },

            new CharacterDef { Id = "tavsan", Name = "Tavşan", Price = 0,
                Body = C(0.87f, 0.76f, 0.60f), Belly = C(0.98f, 0.94f, 0.88f), Head = C(0.87f, 0.76f, 0.60f),
                Ears = EarStyle.Long, Tail = TailStyle.Stub, Nose = NoseStyle.Black },

            new CharacterDef { Id = "baykus", Name = "Baykuş", Price = 300,
                Body = C(0.55f, 0.42f, 0.28f), Belly = C(0.93f, 0.87f, 0.74f), Head = C(0.55f, 0.42f, 0.28f),
                Ears = EarStyle.Tuft, Tail = TailStyle.None, Nose = NoseStyle.BeakSmall },

            new CharacterDef { Id = "penguen", Name = "Penguen", Price = 300,
                Body = C(0.13f, 0.14f, 0.17f), Belly = C(0.97f, 0.97f, 0.97f), Head = C(0.13f, 0.14f, 0.17f),
                Ears = EarStyle.None, Tail = TailStyle.Stub, Nose = NoseStyle.BeakSmall },

            new CharacterDef { Id = "domuz", Name = "Domuzcuk", Price = 300,
                Body = C(0.96f, 0.72f, 0.70f), Belly = C(0.98f, 0.82f, 0.80f), Head = C(0.96f, 0.72f, 0.70f),
                Ears = EarStyle.Round, Tail = TailStyle.Curly, Nose = NoseStyle.Snout },

            new CharacterDef { Id = "sincap", Name = "Sincap", Price = 400,
                Body = C(0.80f, 0.44f, 0.18f), Belly = C(0.97f, 0.90f, 0.78f), Head = C(0.80f, 0.44f, 0.18f),
                Ears = EarStyle.Round, Tail = TailStyle.Bushy, Nose = NoseStyle.Black },

            new CharacterDef { Id = "kirpi", Name = "Kirpi", Price = 400,
                Body = C(0.92f, 0.85f, 0.70f), Belly = C(0.96f, 0.91f, 0.80f), Head = C(0.92f, 0.85f, 0.70f),
                Ears = EarStyle.Round, Tail = TailStyle.None, Nose = NoseStyle.Black, Extra = ExtraStyle.Spikes },

            new CharacterDef { Id = "kurt", Name = "Kurt", Price = 500,
                Body = C(0.55f, 0.55f, 0.58f), Belly = C(0.85f, 0.85f, 0.86f), Head = C(0.55f, 0.55f, 0.58f),
                Ears = EarStyle.Pointy, Tail = TailStyle.Long, Nose = NoseStyle.Black },

            new CharacterDef { Id = "kartal", Name = "Kartal", Price = 500,
                Body = C(0.35f, 0.24f, 0.15f), Belly = C(0.40f, 0.28f, 0.18f), Head = C(0.97f, 0.96f, 0.94f),
                Ears = EarStyle.None, Tail = TailStyle.Stub, Nose = NoseStyle.BeakBig },

            new CharacterDef { Id = "flamingo", Name = "Flamingo", Price = 600,
                Body = C(0.97f, 0.60f, 0.62f), Belly = C(0.99f, 0.72f, 0.74f), Head = C(0.97f, 0.60f, 0.62f),
                Ears = EarStyle.None, Tail = TailStyle.Stub, Nose = NoseStyle.BeakBig },

            new CharacterDef { Id = "aksolotl", Name = "Aksolotl", Price = 800,
                Body = C(0.97f, 0.76f, 0.78f), Belly = C(0.99f, 0.85f, 0.86f), Head = C(0.97f, 0.76f, 0.78f),
                Ears = EarStyle.None, Tail = TailStyle.Long, Nose = NoseStyle.Black, Extra = ExtraStyle.Gills },

            new CharacterDef { Id = "geyik", Name = "Geyik", Price = 800,
                Body = C(0.62f, 0.44f, 0.26f), Belly = C(0.92f, 0.86f, 0.72f), Head = C(0.62f, 0.44f, 0.26f),
                Ears = EarStyle.Round, Tail = TailStyle.Stub, Nose = NoseStyle.Black, Extra = ExtraStyle.Antlers },
        };

        public static CharacterDef Get(string id)
        {
            foreach (var def in All)
                if (def.Id == id) return def;
            return All[0]; // bilinmeyen id -> tilki
        }
    }
}
