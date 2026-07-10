using UnityEngine;
using UnityEngine.EventSystems;

namespace Barbah.Coop
{
    /// <summary>Ekranin sag altindaki ziplama butonu.</summary>
    public class JumpButton : MonoBehaviour, IPointerDownHandler
    {
        public void OnPointerDown(PointerEventData eventData) => MobileControls.QueueJump();
    }
}
