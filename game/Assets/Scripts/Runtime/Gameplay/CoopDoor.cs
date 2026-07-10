using Unity.Netcode;
using UnityEngine;

namespace Barbah.Coop
{
    /// <summary>
    /// Iki basma plakasi AYNI ANDA basili oldugunda yukari kayarak acilan
    /// kapi. Tek kisi acamaz — is birligi sart (It Takes Two ruhu).
    /// </summary>
    public class CoopDoor : NetworkBehaviour
    {
        public CoopPressurePlate plateA;
        public CoopPressurePlate plateB;

        [SerializeField] private float openHeight = 4.5f;
        [SerializeField] private float moveSpeed = 3f;

        private readonly NetworkVariable<bool> open = new NetworkVariable<bool>(false);
        private Vector3 closedPosition;

        private void Awake()
        {
            closedPosition = transform.position;
        }

        private void Update()
        {
            if (IsServer && IsSpawned && plateA != null && plateB != null)
                open.Value = plateA.IsPressed && plateB.IsPressed;

            Vector3 target = closedPosition + (open.Value ? Vector3.up * openHeight : Vector3.zero);
            transform.position = Vector3.MoveTowards(transform.position, target, moveSpeed * Time.deltaTime);
        }
    }
}
