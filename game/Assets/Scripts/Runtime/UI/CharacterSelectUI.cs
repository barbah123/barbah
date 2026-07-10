using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Barbah.Coop
{
    /// <summary>
    /// Karakter secim ekrani: sahip olunan hayvanlardan biri secilir.
    /// Misafir oyuncular yalnizca ucretsiz karakterleri kullanabilir.
    /// </summary>
    public class CharacterSelectUI : MonoBehaviour
    {
        private GameObject panel;
        private Text statusText;
        private RectTransform listContent;
        private bool busy;

        public GameObject Build(RectTransform root)
        {
            panel = UiFactory.Panel(root, "Karakterim");

            UiFactory.Label(panel.transform, "KARAKTERİM", new Vector2(0.5f, 1f), new Vector2(0f, -95f),
                new Vector2(800f, 110f), 68, FontStyle.Bold, UiTheme.Accent);
            statusText = UiFactory.Label(panel.transform, "", new Vector2(0.5f, 1f), new Vector2(0f, -185f),
                new Vector2(1500f, 60f), 30, FontStyle.Normal, UiTheme.TextMuted);

            listContent = UiFactory.ScrollList(panel.transform, new Vector2(0.5f, 0.5f),
                new Vector2(0f, -55f), new Vector2(1560f, 660f));

            UiFactory.Button(panel.transform, "GERİ", new Vector2(0.5f, 0f), new Vector2(0f, 70f),
                new Vector2(400f, 80f), () => MenuFlow.Instance.ShowHome(), UiTheme.AccentSoft, 32, UiTheme.TextDark);

            return panel;
        }

        public void OnShow() => Reload();

        private async void Reload()
        {
            UiFactory.Clear(listContent);
            statusText.text = "";

            var owned = new HashSet<string>();
            if (PlayerSession.IsLoggedIn)
            {
                statusText.text = "Yükleniyor...";
                try
                {
                    var profile = await ApiClient.GetAsync<ProfileResponse>("/me");
                    PlayerSession.ApplyProfile(profile);
                    if (profile.owned_characters != null)
                        foreach (string id in profile.owned_characters) owned.Add(id);
                    statusText.text = "";
                }
                catch (ApiException e)
                {
                    statusText.text = e.Message;
                }
            }
            else
            {
                statusText.text = "Misafir hesapla yalnızca ücretsiz karakterler kullanılabilir.";
            }

            foreach (var def in CharacterCatalog.All)
                AddRow(def, def.Price == 0 || owned.Contains(def.Id));
        }

        private void AddRow(CharacterDef def, bool owned)
        {
            var row = UiFactory.Row(listContent, 100f);

            // Kucuk renk onizlemesi
            var swatch = new GameObject("Renk", typeof(RectTransform), typeof(Image));
            swatch.transform.SetParent(row, false);
            UiFactory.Place(swatch, new Vector2(0f, 0.5f), new Vector2(70f, 0f), new Vector2(64f, 64f));
            var swatchImage = swatch.GetComponent<Image>();
            swatchImage.sprite = UiFactory.Circle;
            swatchImage.color = def.Body;
            swatchImage.raycastTarget = false;

            UiFactory.Label(row, def.Name, new Vector2(0f, 0.5f), new Vector2(430f, 0f),
                new Vector2(600f, 80f), 36, FontStyle.Bold, UiTheme.TextDark, TextAnchor.MiddleLeft);

            bool selected = PlayerSession.CharacterId == def.Id;
            if (selected)
            {
                UiFactory.Label(row, "SEÇİLİ ✓", new Vector2(1f, 0.5f), new Vector2(-150f, 0f),
                    new Vector2(240f, 80f), 32, FontStyle.Bold, UiTheme.Good);
            }
            else if (owned)
            {
                UiFactory.Button(row, "SEÇ", new Vector2(1f, 0.5f), new Vector2(-150f, 0f),
                    new Vector2(220f, 76f), () => Select(def.Id), UiTheme.Good, 32);
            }
            else
            {
                UiFactory.Label(row, "Markette: " + def.Price + " ★", new Vector2(1f, 0.5f), new Vector2(-230f, 0f),
                    new Vector2(400f, 80f), 30, FontStyle.Italic, UiTheme.TextMuted);
            }
        }

        private async void Select(string id)
        {
            if (busy) return;
            busy = true;

            if (PlayerSession.IsLoggedIn)
            {
                try
                {
                    await ApiClient.PostAsync<SelectCharacterResponse>("/me/character",
                        new CharacterRequest { character = id });
                    PlayerSession.CharacterId = id;
                }
                catch (ApiException e)
                {
                    statusText.text = e.Message;
                    busy = false;
                    return;
                }
            }
            else
            {
                PlayerSession.CharacterId = id; // misafir: yalnizca yerel
            }

            statusText.text = CharacterCatalog.Get(id).Name + " seçildi!";
            busy = false;
            Reload();
        }
    }
}
