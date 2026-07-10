using System;

namespace Barbah.Coop
{
    /// <summary>Bolum olaylarinin UI'ya duyuruldugu ortak nokta.</summary>
    public static class LevelEvents
    {
        /// <summary>(bolum no, sure saniye)</summary>
        public static event Action<int, float> Completed;

        public static void RaiseCompleted(int level, float timeSeconds) =>
            Completed?.Invoke(level, timeSeconds);
    }
}
