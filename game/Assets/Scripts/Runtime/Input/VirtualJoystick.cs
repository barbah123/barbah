using UnityEngine;
using UnityEngine.EventSystems;

namespace Barbah.Coop
{
    /// <summary>
    /// PK XD tarzi sanal joystick. Ekranin sol altindaki daireye dokunup
    /// surukleyerek karakter yonlendirilir.
    /// </summary>
    public class VirtualJoystick : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        [SerializeField] private RectTransform handle;
        [SerializeField, Range(0.1f, 1f)] private float handleRange = 0.75f;

        private RectTransform baseRect;
        private float radius;

        private void Awake()
        {
            baseRect = (RectTransform)transform;
            radius = baseRect.sizeDelta.x * 0.5f;
        }

        public void OnPointerDown(PointerEventData eventData) => OnDrag(eventData);

        public void OnDrag(PointerEventData eventData)
        {
            RectTransformUtility.ScreenPointToLocalPointInRectangle(
                baseRect, eventData.position, eventData.pressEventCamera, out Vector2 local);

            Vector2 value = Vector2.ClampMagnitude(local / radius, 1f);
            handle.anchoredPosition = value * radius * handleRange;
            MobileControls.Move = value;
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            handle.anchoredPosition = Vector2.zero;
            MobileControls.Move = Vector2.zero;
        }

        public void SetHandle(RectTransform handleRect) => handle = handleRect;
    }
}
