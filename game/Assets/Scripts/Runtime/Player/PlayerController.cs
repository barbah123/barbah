using Unity.Netcode;
using UnityEngine;

namespace Barbah.Coop
{
    /// <summary>
    /// PK XD tarzi ucuncu sahis karakter kontrolu:
    /// joystick kameraya gore yon verir, karakter gittigi yone doner,
    /// ziplama + cift ziplama vardir. Hareket, sahibi olan oyuncunun
    /// cihazinda hesaplanir ve ClientNetworkTransform ile senkronlanir.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public class PlayerController : NetworkBehaviour
    {
        [Header("Hareket")]
        [SerializeField] private float moveSpeed = 6f;
        [SerializeField] private float rotationSpeed = 14f;

        [Header("Ziplama")]
        [SerializeField] private float jumpHeight = 2.1f;
        [SerializeField] private float gravity = -28f;
        [SerializeField] private int maxJumps = 2;

        private CharacterController controller;
        private OrbitCamera orbitCamera;
        private float verticalVelocity;
        private int jumpsUsed;

        private void Awake()
        {
            controller = GetComponent<CharacterController>();
        }

        public override void OnNetworkSpawn()
        {
            // Her oyuncuya kimligine gore farkli bir renk ver.
            var rend = GetComponentInChildren<Renderer>();
            if (rend != null)
                rend.material.color = Color.HSVToRGB((OwnerClientId * 0.37f) % 1f, 0.6f, 1f);

            if (!IsOwner) return;

            orbitCamera = FindFirstObjectByType<OrbitCamera>();
            if (orbitCamera != null) orbitCamera.target = transform;

            // Rastgele bir noktada dogmak icin isinlarken CharacterController kapatilmali.
            controller.enabled = false;
            transform.position = new Vector3(Random.Range(-3f, 3f), 1.2f, Random.Range(-3f, 3f));
            controller.enabled = true;
        }

        private void Update()
        {
            if (!IsOwner || !controller.enabled) return;

            Vector2 stick = MobileControls.Move;

#if UNITY_EDITOR || UNITY_STANDALONE
            // Editorde test icin klavye: WASD/ok tuslari + bosluk.
            if (stick.sqrMagnitude < 0.01f)
                stick = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
            if (Input.GetKeyDown(KeyCode.Space))
                MobileControls.QueueJump();
#endif

            stick = Vector2.ClampMagnitude(stick, 1f);

            Vector3 forward = orbitCamera != null ? orbitCamera.FlatForward : Vector3.forward;
            Vector3 right = orbitCamera != null ? orbitCamera.FlatRight : Vector3.right;
            Vector3 move = forward * stick.y + right * stick.x;

            if (controller.isGrounded)
            {
                jumpsUsed = 0;
                if (verticalVelocity < 0f) verticalVelocity = -2f;
            }

            if (MobileControls.ConsumeJump() && jumpsUsed < maxJumps)
            {
                verticalVelocity = Mathf.Sqrt(jumpHeight * -2f * gravity);
                jumpsUsed++;
            }

            verticalVelocity += gravity * Time.deltaTime;
            controller.Move((move * moveSpeed + Vector3.up * verticalVelocity) * Time.deltaTime);

            if (move.sqrMagnitude > 0.01f)
            {
                transform.rotation = Quaternion.Slerp(
                    transform.rotation,
                    Quaternion.LookRotation(move),
                    rotationSpeed * Time.deltaTime);
            }
        }
    }
}
