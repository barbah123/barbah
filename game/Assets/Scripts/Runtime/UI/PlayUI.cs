using System;
using Unity.Netcode;
using UnityEngine;
using UnityEngine.UI;

namespace Barbah.Coop
{
    /// <summary>
    /// Birlikte oyna ekrani: oda kur (kod uret) veya arkadasinin koduyla
    /// katil. Baglanti kurulunca HUD'a gecilir.
    /// </summary>
    public class PlayUI : MonoBehaviour
    {
        private GameObject panel;
        private Button hostButton, joinButton;
        private InputField codeInput;
        private Text status, levelLabel;
        private bool servicesReady;

        public GameObject Build(RectTransform root)
        {
            panel = UiFactory.Panel(root, "BirlikteOyna");
            var center = new Vector2(0.5f, 0.5f);

            UiFactory.Label(panel.transform, "BİRLİKTE OYNA", new Vector2(0.5f, 1f), new Vector2(0f, -120f),
                new Vector2(900f, 120f), 72, FontStyle.Bold, UiTheme.Accent);
            levelLabel = UiFactory.Label(panel.transform, "", new Vector2(0.5f, 1f), new Vector2(0f, -215f),
                new Vector2(700f, 60f), 34, FontStyle.Normal, UiTheme.TextMuted);

            hostButton = UiFactory.Button(panel.transform, "ODA KUR", center, new Vector2(0f, 110f),
                new Vector2(620f, 110f), DoHost, UiTheme.Accent, 44);

            codeInput = UiFactory.Input(panel.transform, "ODA KODU", center, new Vector2(0f, -30f), new Vector2(620f, 95f));
            codeInput.characterLimit = 8;

            joinButton = UiFactory.Button(panel.transform, "KATIL", center, new Vector2(0f, -155f),
                new Vector2(620f, 110f), DoJoin, UiTheme.Accent, 44);

            status = UiFactory.Label(panel.transform, "", new Vector2(0.5f, 0f), new Vector2(0f, 190f),
                new Vector2(1400f, 100f), 30, FontStyle.Normal, UiTheme.TextMuted);

            UiFactory.Button(panel.transform, "GERİ", new Vector2(0.5f, 0f), new Vector2(0f, 80f),
                new Vector2(400f, 80f), () => MenuFlow.Instance.ShowLevels(), UiTheme.AccentSoft, 32, UiTheme.TextDark);

            return panel;
        }

        private void Start()
        {
            var nm = NetworkManager.Singleton;
            if (nm != null)
            {
                nm.OnClientConnectedCallback += OnClientConnected;
                nm.OnClientDisconnectCallback += OnClientDisconnected;
            }
        }

        private void OnDestroy()
        {
            var nm = NetworkManager.Singleton;
            if (nm != null)
            {
                nm.OnClientConnectedCallback -= OnClientConnected;
                nm.OnClientDisconnectCallback -= OnClientDisconnected;
            }
        }

        public async void OnShow()
        {
            levelLabel.text = "Bölüm " + MenuFlow.Instance.SelectedLevel;
            SetBusy(false);

            if (servicesReady)
            {
                SetStatus("Hazır — oda kur ya da kodla katıl.");
                return;
            }

            SetBusy(true);
            SetStatus("Unity servislerine bağlanılıyor...");
            try
            {
                await ConnectionManager.Instance.InitializeAsync();
                servicesReady = true;
                SetStatus("Hazır — oda kur ya da kodla katıl.");
                SetBusy(false);
            }
            catch (Exception e)
            {
                SetStatus("Servis hatası: " + e.Message +
                          "\nUnity'de Project Settings > Services'ten projeyi bağladığından emin ol.");
            }
        }

        private async void DoHost()
        {
            SetBusy(true);
            SetStatus("Oda kuruluyor...");
            try
            {
                string code = await ConnectionManager.Instance.StartHostAsync();
                MenuFlow.Instance.Hud.SetRoomCode(code);
                SetStatus("Oda kuruldu! Kod: " + code);
            }
            catch (Exception e)
            {
                SetStatus("Oda kurulamadı: " + e.Message);
                SetBusy(false);
            }
        }

        private async void DoJoin()
        {
            string code = codeInput.text.Trim().ToUpperInvariant();
            if (code.Length < 6)
            {
                SetStatus("Geçerli bir oda kodu gir (6 karakter).");
                return;
            }

            SetBusy(true);
            SetStatus("Odaya bağlanılıyor...");
            try
            {
                await ConnectionManager.Instance.JoinAsync(code);
                MenuFlow.Instance.Hud.SetRoomCode(code);
            }
            catch (Exception e)
            {
                SetStatus("Katılınamadı: " + e.Message);
                SetBusy(false);
            }
        }

        private void OnClientConnected(ulong clientId)
        {
            if (clientId != NetworkManager.Singleton.LocalClientId) return;
            MenuFlow.Instance.ShowGameHud();
        }

        private void OnClientDisconnected(ulong clientId)
        {
            if (clientId != NetworkManager.Singleton.LocalClientId) return;
            MenuFlow.Instance.ShowHome();
        }

        private void SetStatus(string message) => status.text = message;

        private void SetBusy(bool busy)
        {
            hostButton.interactable = !busy;
            joinButton.interactable = !busy;
            codeInput.interactable = !busy;
        }
    }
}
