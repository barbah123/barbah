using Unity.Netcode;
using UnityEngine;

namespace Barbah.Coop
{
    /// <summary>
    /// It Takes Two tarzi basma plakasi: uzerinde bir oyuncu durdugunda
    /// aktif olur. Iki plakanin ayni anda basili olmasi kapiyi acar.
    /// Durum sunucuda hesaplanir, tum cihazlara senkronlanir.
    /// </summary>
    public class CoopPressurePlate : NetworkBehaviour
    {
        [SerializeField] private float radius = 1.6f;
        [SerializeField] private Color idleColor = new Color(1f, 0.55f, 0.15f);
        [SerializeField] private Color pressedColor = new Color(0.25f, 0.9f, 0.35f);

        private readonly NetworkVariable<bool> pressed = new NetworkVariable<bool>(false);
        private Renderer plateRenderer;

        public bool IsPressed => pressed.Value;

        private void Awake()
        {
            plateRenderer = GetComponentInChildren<Renderer>();
        }

        public override void OnNetworkSpawn()
        {
            pressed.OnValueChanged += OnPressedChanged;
            OnPressedChanged(false, pressed.Value);
        }

        public override void OnNetworkDespawn()
        {
            pressed.OnValueChanged -= OnPressedChanged;
        }

        private void Update()
        {
            if (!IsServer || !IsSpawned) return;
            pressed.Value = AnyPlayerOnPlate();
        }

        private bool AnyPlayerOnPlate()
        {
            foreach (var client in NetworkManager.Singleton.ConnectedClientsList)
            {
                var player = client.PlayerObject;
                if (player == null) continue;

                Vector3 diff = player.transform.position - transform.position;
                Vector2 flat = new Vector2(diff.x, diff.z);
                if (flat.magnitude <= radius && Mathf.Abs(diff.y) < 2.5f)
                    return true;
            }
            return false;
        }

        private void OnPressedChanged(bool previous, bool current)
        {
            if (plateRenderer != null)
                plateRenderer.material.color = current ? pressedColor : idleColor;
        }
    }
}
