using UnityEngine;

namespace Barbah.Coop
{
    /// <summary>
    /// Ekran akisi: Giris/Kayit → Ana Menu → Bolumler → Birlikte Oyna → Oyun.
    /// Tum paneller calisma zamaninda kurulur; bu sinif hangi panelin
    /// gorunecegini yonetir.
    /// </summary>
    [RequireComponent(typeof(AuthUI))]
    [RequireComponent(typeof(HomeUI))]
    [RequireComponent(typeof(LevelsUI))]
    [RequireComponent(typeof(PlayUI))]
    [RequireComponent(typeof(MarketUI))]
    [RequireComponent(typeof(CharacterSelectUI))]
    [RequireComponent(typeof(HudUI))]
    public class MenuFlow : MonoBehaviour
    {
        public static MenuFlow Instance { get; private set; }

        /// <summary>Bolumler ekranindan secilen bolum.</summary>
        public int SelectedLevel = 1;

        private AuthUI auth;
        private HomeUI home;
        private LevelsUI levels;
        private PlayUI play;
        private MarketUI market;
        private CharacterSelectUI characters;
        private HudUI hud;

        private GameObject authPanel, homePanel, levelsPanel, playPanel, marketPanel, charactersPanel, hudRoot;
        private GameObject[] menuPanels;

        public HudUI Hud => hud;

        private void Awake()
        {
            Instance = this;

            auth = GetComponent<AuthUI>();
            home = GetComponent<HomeUI>();
            levels = GetComponent<LevelsUI>();
            play = GetComponent<PlayUI>();
            market = GetComponent<MarketUI>();
            characters = GetComponent<CharacterSelectUI>();
            hud = GetComponent<HudUI>();

            var root = (RectTransform)transform;
            authPanel = auth.Build(root);
            homePanel = home.Build(root);
            levelsPanel = levels.Build(root);
            playPanel = play.Build(root);
            marketPanel = market.Build(root);
            charactersPanel = characters.Build(root);
            hudRoot = hud.Build(root);

            menuPanels = new[] { authPanel, homePanel, levelsPanel, playPanel, marketPanel, charactersPanel };
        }

        private void Start()
        {
            if (PlayerSession.IsLoggedIn || PlayerSession.IsGuest) ShowHome();
            else ShowAuth();
        }

        private void ShowOnly(GameObject target)
        {
            foreach (var panel in menuPanels)
                panel.SetActive(panel == target);
            hudRoot.SetActive(false);
        }

        public void ShowAuth() { ShowOnly(authPanel); auth.OnShow(); }
        public void ShowHome() { ShowOnly(homePanel); home.OnShow(); }
        public void ShowLevels() { ShowOnly(levelsPanel); }
        public void ShowPlay() { ShowOnly(playPanel); play.OnShow(); }
        public void ShowMarket() { ShowOnly(marketPanel); market.OnShow(); }
        public void ShowCharacters() { ShowOnly(charactersPanel); characters.OnShow(); }

        public void ShowGameHud()
        {
            foreach (var panel in menuPanels) panel.SetActive(false);
            hudRoot.SetActive(true);
            hud.OnShow();
        }
    }
}
