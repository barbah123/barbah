using System;
using Unity.Netcode;
using UnityEngine;
using UnityEngine.UI;

namespace Barbah.Coop
{
    /// <summary>
    /// Ana menu: "Oda Kur" ile kod uretilir, arkadasa gonderilir;
    /// arkadas kodu girip "Katil" der. Baglanti kurulunca menu kapanir,
    /// oyun ici kontroller (joystick + ziplama) acilir.
    /// </summary>
    public class MainMenuUI : MonoBehaviour
    {
        public GameObject menuPanel;
        public GameObject hudPanel;
        public Button hostButton;
        public Button joinButton;
        public InputField joinInput;
        public Text statusText;
        public Text joinCodeText;

        private async void Start()
        {
            hostButton.onClick.AddListener(OnHostClicked);
            joinButton.onClick.AddListener(OnJoinClicked);

            var nm = NetworkManager.Singleton;
            nm.OnClientConnectedCallback += OnClientConnected;
            nm.OnClientDisconnectCallback += OnClientDisconnected;

            SetInteractable(false);
            SetStatus("Unity servislerine baglaniliyor...");
            try
            {
                await ConnectionManager.Instance.InitializeAsync();
                SetStatus("Hazir — oda kur ya da kodla katil.");
                SetInteractable(true);
            }
            catch (Exception e)
            {
                SetStatus("Servis hatasi: " + e.Message +
                          "\nUnity'de Project Settings > Services'ten projeyi bagladigindan emin ol.");
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

        private async void OnHostClicked()
        {
            SetInteractable(false);
            SetStatus("Oda kuruluyor...");
            try
            {
                string code = await ConnectionManager.Instance.StartHostAsync();
                joinCodeText.text = "ODA KODU: " + code;
                SetStatus("Oda kuruldu! Kodu arkadasina gonder: " + code);
            }
            catch (Exception e)
            {
                SetStatus("Oda kurulamadi: " + e.Message);
                SetInteractable(true);
            }
        }

        private async void OnJoinClicked()
        {
            string code = joinInput.text.Trim().ToUpperInvariant();
            if (code.Length < 6)
            {
                SetStatus("Gecerli bir oda kodu gir (6 karakter).");
                return;
            }

            SetInteractable(false);
            SetStatus("Odaya baglaniliyor...");
            try
            {
                await ConnectionManager.Instance.JoinAsync(code);
            }
            catch (Exception e)
            {
                SetStatus("Katilinamadi: " + e.Message);
                SetInteractable(true);
            }
        }

        private void OnClientConnected(ulong clientId)
        {
            if (clientId != NetworkManager.Singleton.LocalClientId) return;
            menuPanel.SetActive(false);
            hudPanel.SetActive(true);
        }

        private void OnClientDisconnected(ulong clientId)
        {
            if (clientId != NetworkManager.Singleton.LocalClientId) return;
            hudPanel.SetActive(false);
            menuPanel.SetActive(true);
            joinCodeText.text = "";
            SetStatus("Baglanti koptu.");
            SetInteractable(true);
        }

        private void SetStatus(string message)
        {
            if (statusText != null) statusText.text = message;
        }

        private void SetInteractable(bool value)
        {
            hostButton.interactable = value;
            joinButton.interactable = value;
            joinInput.interactable = value;
        }
    }
}
