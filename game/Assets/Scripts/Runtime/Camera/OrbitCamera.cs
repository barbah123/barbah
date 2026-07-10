using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;

namespace Barbah.Coop
{
    /// <summary>
    /// PK XD tarzi takip kamerasi: karakteri arkadan izler, UI disindaki
    /// herhangi bir noktaya dokunup surukleyerek etrafinda dondurulur.
    /// Editorde sag fare tusu ile dondurulur.
    /// </summary>
    public class OrbitCamera : MonoBehaviour
    {
        public Transform target;

        [SerializeField] private float distance = 6.5f;
        [SerializeField] private float focusHeight = 1.6f;
        [SerializeField] private float minPitch = 8f;
        [SerializeField] private float maxPitch = 65f;
        [SerializeField] private float touchSensitivity = 0.22f;
        [SerializeField] private float mouseSensitivity = 3f;

        private float yaw;
        private float pitch = 28f;
        private readonly HashSet<int> cameraFingers = new HashSet<int>();

        /// <summary>Kameranin yere paralel bakis yonu (oyuncu hareketi icin).</summary>
        public Vector3 FlatForward
        {
            get { Vector3 f = transform.forward; f.y = 0f; return f.normalized; }
        }

        public Vector3 FlatRight
        {
            get { Vector3 r = transform.right; r.y = 0f; return r.normalized; }
        }

        private void Update()
        {
            for (int i = 0; i < Input.touchCount; i++)
            {
                Touch touch = Input.GetTouch(i);
                switch (touch.phase)
                {
                    case TouchPhase.Began:
                        if (!IsOverUI(touch.fingerId)) cameraFingers.Add(touch.fingerId);
                        break;
                    case TouchPhase.Ended:
                    case TouchPhase.Canceled:
                        cameraFingers.Remove(touch.fingerId);
                        break;
                    case TouchPhase.Moved:
                        if (cameraFingers.Contains(touch.fingerId))
                        {
                            yaw += touch.deltaPosition.x * touchSensitivity;
                            pitch = Mathf.Clamp(pitch - touch.deltaPosition.y * touchSensitivity, minPitch, maxPitch);
                        }
                        break;
                }
            }

#if UNITY_EDITOR || UNITY_STANDALONE
            if (Input.GetMouseButton(1))
            {
                yaw += Input.GetAxis("Mouse X") * mouseSensitivity;
                pitch = Mathf.Clamp(pitch - Input.GetAxis("Mouse Y") * mouseSensitivity, minPitch, maxPitch);
            }
#endif
        }

        private void LateUpdate()
        {
            if (target == null) return;

            Quaternion rotation = Quaternion.Euler(pitch, yaw, 0f);
            Vector3 focus = target.position + Vector3.up * focusHeight;
            transform.position = focus - rotation * Vector3.forward * distance;
            transform.rotation = rotation;
        }

        private static bool IsOverUI(int fingerId)
        {
            return EventSystem.current != null && EventSystem.current.IsPointerOverGameObject(fingerId);
        }
    }
}
