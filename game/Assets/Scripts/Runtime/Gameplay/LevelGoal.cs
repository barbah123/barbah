using Unity.Netcode;
using UnityEngine;

namespace Barbah.Coop
{
    /// <summary>
    /// Bolum hedef alani: TUM bagli oyuncular ayni anda bu alanin icinde
    /// durursa bolum tamamlanir (It Takes Two — birlikte bitirilir).
    /// Sure, iki oyuncu da baglandigi andan itibaren sayilir.
    /// </summary>
    public class LevelGoal : NetworkBehaviour
    {
        public int levelId = 1;
        [SerializeField] private float radius = 3f;

        private readonly NetworkVariable<bool> completed = new NetworkVariable<bool>(false);
        private float startTime = -1f;

        private void Update()
        {
            if (!IsServer || !IsSpawned || completed.Value) return;

            var clients = NetworkManager.Singleton.ConnectedClientsList;
            if (clients.Count == 0) return;

            if (startTime < 0f && clients.Count >= ConnectionManager.MaxPlayers)
                startTime = Time.time;

            foreach (var client in clients)
            {
                var player = client.PlayerObject;
                if (player == null) return;

                Vector3 diff = player.transform.position - transform.position;
                Vector2 flat = new Vector2(diff.x, diff.z);
                if (flat.magnitude > radius || Mathf.Abs(diff.y) > 3f) return;
            }

            completed.Value = true;
            float duration = startTime >= 0f ? Time.time - startTime : 0f;
            CompleteClientRpc(levelId, duration);
        }

        [ClientRpc]
        private void CompleteClientRpc(int level, float duration)
        {
            LevelEvents.RaiseCompleted(level, duration);
        }
    }
}
