using UnityEngine;

namespace Barbah.Coop
{
    /// <summary>
    /// Bolum secim ekrani. Simdilik Bolum 1 oynanabilir; 2 ve 3 tasarim
    /// bilgileri geldikce acilacak.
    /// </summary>
    public class LevelsUI : MonoBehaviour
    {
        public GameObject Build(RectTransform root)
        {
            var panel = UiFactory.Panel(root, "Bolumler");
            var center = new Vector2(0.5f, 0.5f);

            UiFactory.Label(panel.transform, "BÖLÜMLER", new Vector2(0.5f, 1f), new Vector2(0f, -120f),
                new Vector2(900f, 120f), 72, FontStyle.Bold, UiTheme.Accent);

            UiFactory.Button(panel.transform, "BÖLÜM 1 — KAPI BULMACASI", center, new Vector2(0f, 110f),
                new Vector2(820f, 120f), () =>
                {
                    MenuFlow.Instance.SelectedLevel = 1;
                    MenuFlow.Instance.ShowPlay();
                }, UiTheme.Accent, 40);

            var level2 = UiFactory.Button(panel.transform, "BÖLÜM 2 — YAKINDA", center, new Vector2(0f, -35f),
                new Vector2(820f, 110f), null, UiTheme.Disabled, 36, UiTheme.TextMuted);
            level2.interactable = false;

            var level3 = UiFactory.Button(panel.transform, "BÖLÜM 3 — YAKINDA", center, new Vector2(0f, -170f),
                new Vector2(820f, 110f), null, UiTheme.Disabled, 36, UiTheme.TextMuted);
            level3.interactable = false;

            UiFactory.Button(panel.transform, "GERİ", new Vector2(0.5f, 0f), new Vector2(0f, 80f),
                new Vector2(400f, 80f), () => MenuFlow.Instance.ShowHome(), UiTheme.AccentSoft, 32, UiTheme.TextDark);

            return panel;
        }
    }
}
