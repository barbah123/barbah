using System;
using UnityEngine;
using UnityEngine.UI;

namespace Barbah.Coop
{
    /// <summary>Badaland arayuz renkleri — sicak/krem tema (referans gorsellere uygun).</summary>
    public static class UiTheme
    {
        public static readonly Color Bg = new Color(0.96f, 0.92f, 0.85f);
        public static readonly Color Card = new Color(1f, 1f, 1f, 0.75f);
        public static readonly Color Accent = new Color(0.91f, 0.52f, 0.20f);
        public static readonly Color AccentSoft = new Color(0.93f, 0.72f, 0.45f);
        public static readonly Color TextDark = new Color(0.33f, 0.22f, 0.12f);
        public static readonly Color TextMuted = new Color(0.55f, 0.47f, 0.38f);
        public static readonly Color Good = new Color(0.30f, 0.62f, 0.32f);
        public static readonly Color Disabled = new Color(0.78f, 0.73f, 0.66f);
    }

    /// <summary>
    /// Calisma zamaninda uGUI kurmak icin yardimcilar. Tum menuler kodla
    /// kurulur; boylece sahneyi yeniden olusturmadan arayuz gelistirilebilir.
    /// </summary>
    public static class UiFactory
    {
        private static Font font;
        public static Font DefaultFont =>
            font != null ? font : font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");

        private static Sprite circle;
        /// <summary>Calisma zamaninda uretilen daire sprite (joystick/butonlar icin).</summary>
        public static Sprite Circle
        {
            get
            {
                if (circle != null) return circle;
                const int size = 128;
                var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
                float r = size / 2f - 1f;
                var center = new Vector2(size / 2f, size / 2f);
                var pixels = new Color[size * size];
                for (int y = 0; y < size; y++)
                    for (int x = 0; x < size; x++)
                    {
                        float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), center);
                        float a = Mathf.Clamp01(r - d); // kenarda 1px yumusatma
                        pixels[y * size + x] = new Color(1f, 1f, 1f, a);
                    }
                tex.SetPixels(pixels);
                tex.Apply();
                circle = Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f));
                return circle;
            }
        }

        public static RectTransform Place(GameObject go, Vector2 anchor, Vector2 position, Vector2 size)
        {
            var rect = (RectTransform)go.transform;
            rect.anchorMin = anchor;
            rect.anchorMax = anchor;
            rect.anchoredPosition = position;
            rect.sizeDelta = size;
            return rect;
        }

        public static void Stretch(GameObject go)
        {
            var rect = (RectTransform)go.transform;
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;
        }

        /// <summary>Tam ekran, arka planli panel.</summary>
        public static GameObject Panel(Transform parent, string name, Color? bg = null)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            Stretch(go);
            go.GetComponent<Image>().color = bg ?? UiTheme.Bg;
            return go;
        }

        /// <summary>Tam ekran, gorunmez grup (alt paneller icin).</summary>
        public static GameObject Group(Transform parent, string name)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            Stretch(go);
            return go;
        }

        public static Text Label(Transform parent, string text, Vector2 anchor, Vector2 position,
            Vector2 size, int fontSize, FontStyle style = FontStyle.Normal,
            Color? color = null, TextAnchor align = TextAnchor.MiddleCenter)
        {
            var go = new GameObject("Metin", typeof(RectTransform));
            go.transform.SetParent(parent, false);
            Place(go, anchor, position, size);
            var label = go.AddComponent<Text>();
            label.font = DefaultFont;
            label.text = text;
            label.fontSize = fontSize;
            label.fontStyle = style;
            label.alignment = align;
            label.color = color ?? UiTheme.TextDark;
            label.raycastTarget = false;
            return label;
        }

        public static Button Button(Transform parent, string label, Vector2 anchor, Vector2 position,
            Vector2 size, Action onClick, Color? bg = null, int fontSize = 40, Color? textColor = null)
        {
            var go = new GameObject("Buton_" + label, typeof(RectTransform), typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);
            Place(go, anchor, position, size);
            var image = go.GetComponent<Image>();
            image.color = bg ?? UiTheme.Accent;

            var button = go.GetComponent<Button>();
            button.targetGraphic = image;
            if (onClick != null) button.onClick.AddListener(() => onClick());

            Label(go.transform, label, new Vector2(0.5f, 0.5f), Vector2.zero, size,
                fontSize, FontStyle.Bold, textColor ?? Color.white);
            return button;
        }

        public static InputField Input(Transform parent, string placeholder, Vector2 anchor,
            Vector2 position, Vector2 size, bool password = false)
        {
            var go = new GameObject("Giris_" + placeholder, typeof(RectTransform), typeof(Image), typeof(InputField));
            go.transform.SetParent(parent, false);
            Place(go, anchor, position, size);
            go.GetComponent<Image>().color = Color.white;

            var input = go.GetComponent<InputField>();
            input.targetGraphic = go.GetComponent<Image>();
            if (password) input.contentType = InputField.ContentType.Password;

            Vector2 innerSize = size - new Vector2(40f, 16f);
            var placeholderText = Label(go.transform, placeholder, new Vector2(0.5f, 0.5f), Vector2.zero,
                innerSize, Mathf.RoundToInt(size.y * 0.42f), FontStyle.Italic, UiTheme.TextMuted, TextAnchor.MiddleLeft);
            var valueText = Label(go.transform, "", new Vector2(0.5f, 0.5f), Vector2.zero,
                innerSize, Mathf.RoundToInt(size.y * 0.42f), FontStyle.Normal, UiTheme.TextDark, TextAnchor.MiddleLeft);
            valueText.supportRichText = false;

            input.placeholder = placeholderText;
            input.textComponent = valueText;
            return input;
        }

        /// <summary>Dikey kaydirilabilir liste; satirlarin ekleneceği content'i dondurur.</summary>
        public static RectTransform ScrollList(Transform parent, Vector2 anchor, Vector2 position, Vector2 size)
        {
            var frame = new GameObject("Liste", typeof(RectTransform), typeof(Image),
                typeof(RectMask2D), typeof(ScrollRect));
            frame.transform.SetParent(parent, false);
            Place(frame, anchor, position, size);
            frame.GetComponent<Image>().color = new Color(1f, 1f, 1f, 0.45f);

            var content = new GameObject("Icerik", typeof(RectTransform),
                typeof(VerticalLayoutGroup), typeof(ContentSizeFitter));
            content.transform.SetParent(frame.transform, false);
            var contentRect = (RectTransform)content.transform;
            contentRect.anchorMin = new Vector2(0f, 1f);
            contentRect.anchorMax = new Vector2(1f, 1f);
            contentRect.pivot = new Vector2(0.5f, 1f);
            contentRect.offsetMin = Vector2.zero;
            contentRect.offsetMax = Vector2.zero;

            var layout = content.GetComponent<VerticalLayoutGroup>();
            layout.padding = new RectOffset(16, 16, 16, 16);
            layout.spacing = 12f;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;

            content.GetComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            var scroll = frame.GetComponent<ScrollRect>();
            scroll.content = contentRect;
            scroll.horizontal = false;
            scroll.vertical = true;
            scroll.scrollSensitivity = 30f;

            return contentRect;
        }

        /// <summary>Listeye sabit yukseklikte bir satir ekler.</summary>
        public static RectTransform Row(RectTransform content, float height, Color? bg = null)
        {
            var go = new GameObject("Satir", typeof(RectTransform), typeof(Image), typeof(LayoutElement));
            go.transform.SetParent(content, false);
            go.GetComponent<Image>().color = bg ?? UiTheme.Card;
            go.GetComponent<LayoutElement>().preferredHeight = height;
            return (RectTransform)go.transform;
        }

        public static void Clear(RectTransform content)
        {
            for (int i = content.childCount - 1; i >= 0; i--)
                UnityEngine.Object.Destroy(content.GetChild(i).gameObject);
        }
    }
}
