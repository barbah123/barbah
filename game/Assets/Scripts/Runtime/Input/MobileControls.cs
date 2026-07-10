using UnityEngine;

namespace Barbah.Coop
{
    /// <summary>
    /// Ekran ustu kontrollerden (joystick, ziplama butonu) gelen girdinin
    /// oyuncu kontrolcusune aktarildigi ortak nokta.
    /// </summary>
    public static class MobileControls
    {
        /// <summary>Joystick yonu, -1..1 araliginda.</summary>
        public static Vector2 Move;

        private static bool jumpQueued;

        public static void QueueJump() => jumpQueued = true;

        public static bool ConsumeJump()
        {
            if (!jumpQueued) return false;
            jumpQueued = false;
            return true;
        }
    }
}
