using Unity.Netcode;
using UnityEngine;
using UnityEngine.UI;

namespace Barbah.Coop
{
    /// <summary>
    /// Oyun ici arayuz: joystick, ziplama butonu, oda kodu ve
    /// "Bolum Tamamlandi" karti (odul bildirimi ile).
    /// </summary>
    public class HudUI : MonoBehaviour
    {
        private GameObject root;
        private Text roomCodeText;
        private GameObject completeCard;
        private Text completeInfo;
        private string roomCode = "";

        public GameObject Build(RectTransform canvasRoot)
        {
            root = UiFactory.Group(canvasRoot.transform, "HUD");

            // Joystick (sol alt)
            var joystickGO = new GameObject("Joystick", typeof(RectTransform), typeof(Image));
            joystickGO.transform.SetParent(root.transform, false);
            UiFactory.Place(joystickGO, new Vector2(0f, 0f), new Vector2(280f, 280f), new Vector2(330f, 330f));
            var joystickImage = joystickGO.GetComponent<Image>();
            joystickImage.sprite = UiFactory.Circle;
            joystickImage.color = new Color(0.3f, 0.22f, 0.12f, 0.30f);

            var handleGO = new GameObject("Tutamac", typeof(RectTransform), typeof(Image));
            handleGO.transform.SetParent(joystickGO.transform, false);
            var handleRect = UiFactory.Place(handleGO, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(135f, 135f));
            var handleImage = handleGO.GetComponent<Image>();
            handleImage.sprite = UiFactory.Circle;
            handleImage.color = new Color(1f, 1f, 1f, 0.85f);
            handleImage.raycastTarget = false;

            joystickGO.AddComponent<VirtualJoystick>().SetHandle(handleRect);

            // Ziplama butonu (sag alt)
            var jumpGO = new GameObject("ZiplaButonu", typeof(RectTransform), typeof(Image));
            jumpGO.transform.SetParent(root.transform, false);
            UiFactory.Place(jumpGO, new Vector2(1f, 0f), new Vector2(-280f, 280f), new Vector2(230f, 230f));
            var jumpImage = jumpGO.GetComponent<Image>();
            jumpImage.sprite = UiFactory.Circle;
            jumpImage.color = new Color(0.91f, 0.52f, 0.20f, 0.75f);
            jumpGO.AddComponent<JumpButton>();
            UiFactory.Label(jumpGO.transform, "ZIPLA", new Vector2(0.5f, 0.5f), Vector2.zero,
                new Vector2(220f, 70f), 38, FontStyle.Bold, Color.white);

            // Oda kodu (ust orta)
            roomCodeText = UiFactory.Label(root.transform, "", new Vector2(0.5f, 1f), new Vector2(0f, -60f),
                new Vector2(800f, 70f), 38, FontStyle.Bold, UiTheme.TextDark);

            BuildCompleteCard();

            LevelEvents.Completed += OnLevelCompleted;
            return root;
        }

        private void OnDestroy()
        {
            LevelEvents.Completed -= OnLevelCompleted;
        }

        private void BuildCompleteCard()
        {
            completeCard = UiFactory.Panel(root.transform, "BolumTamamlandi", new Color(0.1f, 0.08f, 0.05f, 0.65f));

            var card = new GameObject("Kart", typeof(RectTransform), typeof(Image));
            card.transform.SetParent(completeCard.transform, false);
            UiFactory.Place(card, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(900f, 500f));
            card.GetComponent<Image>().color = UiTheme.Bg;

            UiFactory.Label(card.transform, "BÖLÜM TAMAMLANDI!", new Vector2(0.5f, 1f), new Vector2(0f, -90f),
                new Vector2(860f, 110f), 64, FontStyle.Bold, UiTheme.Accent);

            completeInfo = UiFactory.Label(card.transform, "", new Vector2(0.5f, 0.5f), new Vector2(0f, 10f),
                new Vector2(820f, 160f), 38, FontStyle.Normal, UiTheme.TextDark);

            UiFactory.Button(card.transform, "MENÜYE DÖN", new Vector2(0.5f, 0f), new Vector2(0f, 90f),
                new Vector2(480f, 100f), ReturnToMenu, UiTheme.Accent, 40);

            completeCard.SetActive(false);
        }

        public void OnShow()
        {
            completeCard.SetActive(false);
            roomCodeText.text = string.IsNullOrEmpty(roomCode) ? "" : "ODA KODU: " + roomCode;
        }

        public void SetRoomCode(string code)
        {
            roomCode = code ?? "";
            if (roomCodeText != null)
                roomCodeText.text = string.IsNullOrEmpty(roomCode) ? "" : "ODA KODU: " + roomCode;
        }

        private async void OnLevelCompleted(int level, float timeSeconds)
        {
            if (root == null || !root.activeSelf) return;

            completeCard.SetActive(true);
            string baseInfo = "Bölüm " + level + " — Süre: " + timeSeconds.ToString("F1") + " sn";

            if (!PlayerSession.IsLoggedIn)
            {
                completeInfo.text = baseInfo + "\nÖdül kazanmak için e-posta ile giriş yap!";
                return;
            }

            completeInfo.text = baseInfo + "\nÖdül hesaplanıyor...";
            try
            {
                var resp = await ApiClient.PostAsync<CompleteResponse>("/progress/complete",
                    new CompleteRequest { level = level, time_seconds = timeSeconds });
                PlayerSession.Coins = resp.coins;
                completeInfo.text = baseInfo + "\n+" + resp.reward + " ★ kazandın!" +
                                    (resp.first_time ? " (ilk bitirme bonusu)" : "");
            }
            catch (ApiException e)
            {
                completeInfo.text = baseInfo + "\nÖdül alınamadı: " + e.Message;
            }
        }

        private void ReturnToMenu()
        {
            SetRoomCode("");
            var nm = NetworkManager.Singleton;
            if (nm != null) nm.Shutdown();
            MenuFlow.Instance.ShowHome();
        }
    }
}
