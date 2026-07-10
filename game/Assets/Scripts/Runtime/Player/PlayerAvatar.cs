using Unity.Collections;
using Unity.Netcode;
using UnityEngine;

namespace Barbah.Coop
{
    /// <summary>
    /// Oyuncunun secili hayvan karakterini ve takili esyalarini tum
    /// cihazlara senkronlar; gorunumu CharacterAppearance ile kurar.
    /// </summary>
    public class PlayerAvatar : NetworkBehaviour
    {
        private readonly NetworkVariable<FixedString32Bytes> characterId =
            new NetworkVariable<FixedString32Bytes>(default,
                NetworkVariableReadPermission.Everyone, NetworkVariableWritePermission.Owner);

        private readonly NetworkVariable<FixedString128Bytes> equippedCsv =
            new NetworkVariable<FixedString128Bytes>(default,
                NetworkVariableReadPermission.Everyone, NetworkVariableWritePermission.Owner);

        public override void OnNetworkSpawn()
        {
            characterId.OnValueChanged += OnAppearanceChanged;
            equippedCsv.OnValueChanged += OnAppearanceChanged;

            if (IsOwner)
            {
                characterId.Value = PlayerSession.CharacterId;
                equippedCsv.Value = string.Join(",", PlayerSession.Equipped);
            }

            Rebuild();
        }

        public override void OnNetworkDespawn()
        {
            characterId.OnValueChanged -= OnAppearanceChanged;
            equippedCsv.OnValueChanged -= OnAppearanceChanged;
        }

        private void OnAppearanceChanged<T>(T previous, T current) => Rebuild();

        private void Rebuild()
        {
            string id = characterId.Value.ToString();
            if (string.IsNullOrEmpty(id)) id = "tilki";

            string csv = equippedCsv.Value.ToString();
            string[] items = string.IsNullOrEmpty(csv)
                ? System.Array.Empty<string>()
                : csv.Split(',');

            CharacterAppearance.Build(transform, id, items);
        }
    }
}
