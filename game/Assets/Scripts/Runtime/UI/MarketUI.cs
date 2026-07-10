using UnityEngine;
using UnityEngine.UI;

namespace Barbah.Coop
{
    /// <summary>
    /// PK XD tarzi market: hayvan karakterler ve kiyafet/aksesuarlar
    /// altinla satin alinir, esyalar tak/cikar yapilir.
    /// </summary>
    public class MarketUI : MonoBehaviour
    {
        private GameObject panel;
        private Text coinsText, statusText;
        private RectTransform listContent;
        private bool busy;

        public GameObject Build(RectTransform root)
        {
            panel = UiFactory.Panel(root, "Market");

            UiFactory.Label(panel.transform, "MARKET", new Vector2(0.5f, 1f), new Vector2(0f, -95f),
                new Vector2(700f, 110f), 68, FontStyle.Bold, UiTheme.Accent);
            coinsText = UiFactory.Label(panel.transform, "", new Vector2(1f, 1f), new Vector2(-180f, -70f),
                new Vector2(320f, 70f), 40, FontStyle.Bold, UiTheme.Accent);
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
            coinsText.text = "";

            if (!PlayerSession.IsLoggedIn)
            {
                statusText.text = "Market için e-posta ile giriş yapmalısın (misafir hesap market kullanamaz).";
                return;
            }

            statusText.text = "Yükleniyor...";
            try
            {
                var market = await ApiClient.GetAsync<MarketResponse>("/market");
                PlayerSession.Coins = market.coins;
                coinsText.text = market.coins + " ★";
                statusText.text = "";
                BuildList(market);
            }
            catch (ApiException e)
            {
                statusText.text = e.Message;
            }
        }

        private void BuildList(MarketResponse market)
        {
            AddHeader("KARAKTERLER");
            foreach (var character in market.characters)
                AddCharacterRow(character);

            AddHeader("KIYAFET & AKSESUAR");
            foreach (var item in market.items)
                AddItemRow(item);
        }

        private void AddHeader(string title)
        {
            var row = UiFactory.Row(listContent, 70f, new Color(0f, 0f, 0f, 0f));
            UiFactory.Label(row, title, new Vector2(0f, 0.5f), new Vector2(240f, 0f),
                new Vector2(460f, 60f), 38, FontStyle.Bold, UiTheme.TextDark, TextAnchor.MiddleLeft);
        }

        private void AddCharacterRow(MarketCharacterDto character)
        {
            var row = UiFactory.Row(listContent, 100f);
            UiFactory.Label(row, character.name, new Vector2(0f, 0.5f), new Vector2(330f, 0f),
                new Vector2(620f, 80f), 36, FontStyle.Bold, UiTheme.TextDark, TextAnchor.MiddleLeft);

            if (character.selected)
            {
                UiFactory.Label(row, "SEÇİLİ ✓", new Vector2(1f, 0.5f), new Vector2(-150f, 0f),
                    new Vector2(240f, 80f), 32, FontStyle.Bold, UiTheme.Good);
            }
            else if (character.owned)
            {
                UiFactory.Button(row, "SEÇ", new Vector2(1f, 0.5f), new Vector2(-150f, 0f),
                    new Vector2(220f, 76f), () => SelectCharacter(character.id), UiTheme.Good, 32);
            }
            else
            {
                UiFactory.Label(row, character.price + " ★", new Vector2(1f, 0.5f), new Vector2(-420f, 0f),
                    new Vector2(240f, 80f), 34, FontStyle.Bold, UiTheme.Accent);
                UiFactory.Button(row, "SATIN AL", new Vector2(1f, 0.5f), new Vector2(-150f, 0f),
                    new Vector2(220f, 76f), () => Buy("character", character.id), UiTheme.Accent, 30);
            }
        }

        private void AddItemRow(MarketItemDto item)
        {
            var row = UiFactory.Row(listContent, 100f);
            UiFactory.Label(row, item.name, new Vector2(0f, 0.5f), new Vector2(330f, 0f),
                new Vector2(620f, 80f), 36, FontStyle.Bold, UiTheme.TextDark, TextAnchor.MiddleLeft);
            UiFactory.Label(row, SlotName(item.slot), new Vector2(0f, 0.5f), new Vector2(760f, 0f),
                new Vector2(240f, 80f), 28, FontStyle.Italic, UiTheme.TextMuted, TextAnchor.MiddleLeft);

            if (!item.owned)
            {
                UiFactory.Label(row, item.price + " ★", new Vector2(1f, 0.5f), new Vector2(-420f, 0f),
                    new Vector2(240f, 80f), 34, FontStyle.Bold, UiTheme.Accent);
                UiFactory.Button(row, "SATIN AL", new Vector2(1f, 0.5f), new Vector2(-150f, 0f),
                    new Vector2(220f, 76f), () => Buy("item", item.id), UiTheme.Accent, 30);
            }
            else if (item.equipped)
            {
                UiFactory.Button(row, "ÇIKAR", new Vector2(1f, 0.5f), new Vector2(-150f, 0f),
                    new Vector2(220f, 76f), () => Equip(item.id, false), UiTheme.Disabled, 30, UiTheme.TextDark);
            }
            else
            {
                UiFactory.Button(row, "TAK", new Vector2(1f, 0.5f), new Vector2(-150f, 0f),
                    new Vector2(220f, 76f), () => Equip(item.id, true), UiTheme.Good, 32);
            }
        }

        private static string SlotName(string slot)
        {
            switch (slot)
            {
                case "sapka": return "Şapka";
                case "gozluk": return "Gözlük";
                case "sirt": return "Sırt";
                default: return slot;
            }
        }

        private async void Buy(string type, string id)
        {
            if (busy) return;
            busy = true;
            statusText.text = "Satın alınıyor...";
            try
            {
                var resp = await ApiClient.PostAsync<BuyResponse>("/market/buy", new BuyRequest { type = type, id = id });
                PlayerSession.Coins = resp.coins;
                statusText.text = "Satın alındı!";
            }
            catch (ApiException e)
            {
                statusText.text = e.Message;
            }
            busy = false;
            Reload();
        }

        private async void Equip(string itemId, bool equip)
        {
            if (busy) return;
            busy = true;
            try
            {
                var resp = await ApiClient.PostAsync<EquipResponse>("/market/equip",
                    new EquipRequest { item_id = itemId, equip = equip });
                PlayerSession.Equipped = resp.equipped ?? new string[0];
                statusText.text = equip ? "Takıldı!" : "Çıkarıldı.";
            }
            catch (ApiException e)
            {
                statusText.text = e.Message;
            }
            busy = false;
            Reload();
        }

        private async void SelectCharacter(string id)
        {
            if (busy) return;
            busy = true;
            try
            {
                await ApiClient.PostAsync<SelectCharacterResponse>("/me/character",
                    new CharacterRequest { character = id });
                PlayerSession.CharacterId = id;
                statusText.text = CharacterCatalog.Get(id).Name + " seçildi!";
            }
            catch (ApiException e)
            {
                statusText.text = e.Message;
            }
            busy = false;
            Reload();
        }
    }
}
