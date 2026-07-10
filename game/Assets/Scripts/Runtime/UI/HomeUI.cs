using UnityEngine;
using UnityEngine.UI;

namespace Barbah.Coop
{
    /// <summary>Ana menu: Bolumler, Market, Karakterim, Cikis.</summary>
    public class HomeUI : MonoBehaviour
    {
        private GameObject panel;
        private Text welcomeText, coinsText;

        public GameObject Build(RectTransform root)
        {
            panel = UiFactory.Panel(root, "AnaMenu");
            var center = new Vector2(0.5f, 0.5f);

            UiFactory.Label(panel.transform, "BADALAND", new Vector2(0.5f, 1f), new Vector2(0f, -140f),
                new Vector2(1200f, 150f), 100, FontStyle.Bold, UiTheme.Accent);

            welcomeText = UiFactory.Label(panel.transform, "", new Vector2(0.5f, 1f), new Vector2(0f, -250f),
                new Vector2(900f, 60f), 36, FontStyle.Normal, UiTheme.TextDark);

            coinsText = UiFactory.Label(panel.transform, "", new Vector2(1f, 1f), new Vector2(-180f, -70f),
                new Vector2(320f, 70f), 40, FontStyle.Bold, UiTheme.Accent);

            UiFactory.Button(panel.transform, "BÖLÜMLER", center, new Vector2(0f, 90f), new Vector2(640f, 120f),
                () => MenuFlow.Instance.ShowLevels(), UiTheme.Accent, 48);
            UiFactory.Button(panel.transform, "MARKET", center, new Vector2(0f, -55f), new Vector2(640f, 110f),
                () => MenuFlow.Instance.ShowMarket());
            UiFactory.Button(panel.transform, "KARAKTERİM", center, new Vector2(0f, -190f), new Vector2(640f, 110f),
                () => MenuFlow.Instance.ShowCharacters());
            UiFactory.Button(panel.transform, "ÇIKIŞ YAP", new Vector2(0.5f, 0f), new Vector2(0f, 80f),
                new Vector2(400f, 76f), DoLogout, UiTheme.Disabled, 28, UiTheme.TextDark);

            return panel;
        }

        public async void OnShow()
        {
            UpdateLabels();

            if (!PlayerSession.IsLoggedIn) return;
            try
            {
                var profile = await ApiClient.GetAsync<ProfileResponse>("/me");
                PlayerSession.ApplyProfile(profile);
                UpdateLabels();
            }
            catch (ApiException e)
            {
                if (e.StatusCode == 401)
                {
                    // Oturum suresi dolmus — giris ekranina don.
                    PlayerSession.Logout();
                    MenuFlow.Instance.ShowAuth();
                }
            }
        }

        private void UpdateLabels()
        {
            string name = PlayerSession.Username;
            welcomeText.text = string.IsNullOrEmpty(name) ? "" : "Hoş geldin, " + name + "!";
            coinsText.text = PlayerSession.IsGuest ? "" : PlayerSession.Coins + " ★";
        }

        private void DoLogout()
        {
            PlayerSession.Logout();
            MenuFlow.Instance.ShowAuth();
        }
    }
}
