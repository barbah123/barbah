using System;
using UnityEngine;
using UnityEngine.UI;

namespace Barbah.Coop
{
    /// <summary>
    /// Giris / e-posta ile kayit / e-posta dogrulama ekranlari.
    /// Backend'de e-posta anahtari yoksa dogrulama kodu cevapta doner
    /// (dev_code) ve otomatik doldurulur — gelistirmeyi kolaylastirir.
    /// </summary>
    public class AuthUI : MonoBehaviour
    {
        private GameObject panel, loginBox, registerBox, verifyBox;
        private Transform contentRoot; // poster varsa sag bolum, yoksa panelin kendisi
        private InputField loginEmail, loginPassword;
        private InputField registerEmail, registerUsername, registerPassword;
        private InputField codeInput;
        private Text status, verifyInfo;
        private string pendingEmail;

        public GameObject Build(RectTransform root)
        {
            panel = UiFactory.Panel(root, "AuthPanel");
            contentRoot = panel.transform;

            // Giris posteri (Assets/Resources/PosterBadaland.png) varsa sol yariya koy,
            // form sag yarida kalir. Poster yoksa eski tam-ekran duzen kullanilir.
            var poster = Resources.Load<Texture2D>("PosterBadaland");
            if (poster != null)
            {
                var frame = new GameObject("PosterCerceve", typeof(RectTransform), typeof(RectMask2D));
                frame.transform.SetParent(panel.transform, false);
                var frameRect = (RectTransform)frame.transform;
                frameRect.anchorMin = new Vector2(0f, 0f);
                frameRect.anchorMax = new Vector2(0.44f, 1f);
                frameRect.offsetMin = Vector2.zero;
                frameRect.offsetMax = Vector2.zero;

                var posterGO = new GameObject("Poster", typeof(RectTransform), typeof(Image), typeof(AspectRatioFitter));
                posterGO.transform.SetParent(frame.transform, false);
                var posterImage = posterGO.GetComponent<Image>();
                posterImage.sprite = Sprite.Create(poster,
                    new Rect(0f, 0f, poster.width, poster.height), new Vector2(0.5f, 0.5f));
                posterImage.raycastTarget = false;
                var fitter = posterGO.GetComponent<AspectRatioFitter>();
                fitter.aspectRatio = (float)poster.width / poster.height;
                fitter.aspectMode = AspectRatioFitter.AspectMode.EnvelopeParent;

                var right = new GameObject("SagBolum", typeof(RectTransform));
                right.transform.SetParent(panel.transform, false);
                var rightRect = (RectTransform)right.transform;
                rightRect.anchorMin = new Vector2(0.44f, 0f);
                rightRect.anchorMax = new Vector2(1f, 1f);
                rightRect.offsetMin = Vector2.zero;
                rightRect.offsetMax = Vector2.zero;
                contentRoot = right.transform;
            }

            UiFactory.Label(contentRoot, "BADALAND", new Vector2(0.5f, 1f), new Vector2(0f, -150f),
                new Vector2(1200f, 160f), poster != null ? 92 : 110, FontStyle.Bold, UiTheme.Accent);
            UiFactory.Label(contentRoot, "iki kişilik macera", new Vector2(0.5f, 1f), new Vector2(0f, -250f),
                new Vector2(800f, 60f), 34, FontStyle.Italic, UiTheme.TextMuted);

            status = UiFactory.Label(contentRoot, "", new Vector2(0.5f, 0f), new Vector2(0f, 90f),
                new Vector2(1000f, 110f), 30, FontStyle.Normal, UiTheme.TextMuted);

            BuildLoginBox();
            BuildRegisterBox();
            BuildVerifyBox();
            ShowBox(loginBox);
            return panel;
        }

        public void OnShow()
        {
            ShowBox(loginBox);
            SetStatus("");
        }

        // ------------------------------------------------------------ kutular

        private void BuildLoginBox()
        {
            loginBox = UiFactory.Group(contentRoot, "GirisKutusu");
            var center = new Vector2(0.5f, 0.5f);

            loginEmail = UiFactory.Input(loginBox.transform, "E-posta", center, new Vector2(0f, 140f), new Vector2(620f, 90f));
            loginEmail.contentType = InputField.ContentType.EmailAddress;
            loginPassword = UiFactory.Input(loginBox.transform, "Parola", center, new Vector2(0f, 30f), new Vector2(620f, 90f), password: true);

            UiFactory.Button(loginBox.transform, "GİRİŞ YAP", center, new Vector2(0f, -95f), new Vector2(620f, 100f), DoLogin);
            UiFactory.Button(loginBox.transform, "HESABIN YOK MU? KAYIT OL", center, new Vector2(0f, -215f),
                new Vector2(620f, 84f), () => { ShowBox(registerBox); SetStatus(""); }, UiTheme.AccentSoft, 30, UiTheme.TextDark);
            UiFactory.Button(loginBox.transform, "MİSAFİR OLARAK OYNA", center, new Vector2(0f, -320f),
                new Vector2(620f, 76f), DoGuest, UiTheme.Disabled, 28, UiTheme.TextDark);
        }

        private void BuildRegisterBox()
        {
            registerBox = UiFactory.Group(contentRoot, "KayitKutusu");
            var center = new Vector2(0.5f, 0.5f);

            registerEmail = UiFactory.Input(registerBox.transform, "E-posta", center, new Vector2(0f, 195f), new Vector2(620f, 90f));
            registerEmail.contentType = InputField.ContentType.EmailAddress;
            registerUsername = UiFactory.Input(registerBox.transform, "Kullanıcı adı", center, new Vector2(0f, 85f), new Vector2(620f, 90f));
            registerPassword = UiFactory.Input(registerBox.transform, "Parola (en az 6 karakter)", center,
                new Vector2(0f, -25f), new Vector2(620f, 90f), password: true);

            UiFactory.Button(registerBox.transform, "KAYIT OL", center, new Vector2(0f, -150f), new Vector2(620f, 100f), DoRegister);
            UiFactory.Button(registerBox.transform, "GİRİŞE DÖN", center, new Vector2(0f, -270f),
                new Vector2(620f, 80f), () => { ShowBox(loginBox); SetStatus(""); }, UiTheme.AccentSoft, 30, UiTheme.TextDark);
        }

        private void BuildVerifyBox()
        {
            verifyBox = UiFactory.Group(contentRoot, "DogrulamaKutusu");
            var center = new Vector2(0.5f, 0.5f);

            verifyInfo = UiFactory.Label(verifyBox.transform, "", center, new Vector2(0f, 190f),
                new Vector2(900f, 110f), 32, FontStyle.Normal, UiTheme.TextDark);

            codeInput = UiFactory.Input(verifyBox.transform, "6 haneli kod", center, new Vector2(0f, 70f), new Vector2(620f, 100f));
            codeInput.characterLimit = 6;
            codeInput.contentType = InputField.ContentType.IntegerNumber;

            UiFactory.Button(verifyBox.transform, "DOĞRULA", center, new Vector2(0f, -60f), new Vector2(620f, 100f), DoVerify);
            UiFactory.Button(verifyBox.transform, "KODU TEKRAR GÖNDER", center, new Vector2(0f, -180f),
                new Vector2(620f, 80f), DoResend, UiTheme.AccentSoft, 30, UiTheme.TextDark);
            UiFactory.Button(verifyBox.transform, "GİRİŞE DÖN", center, new Vector2(0f, -285f),
                new Vector2(620f, 76f), () => { ShowBox(loginBox); SetStatus(""); }, UiTheme.Disabled, 28, UiTheme.TextDark);
        }

        private void ShowBox(GameObject box)
        {
            loginBox.SetActive(box == loginBox);
            registerBox.SetActive(box == registerBox);
            verifyBox.SetActive(box == verifyBox);
        }

        private void ShowVerify(string devCode)
        {
            ShowBox(verifyBox);
            verifyInfo.text = pendingEmail + " adresine 6 haneli doğrulama kodu gönderdik.";
            if (!string.IsNullOrEmpty(devCode))
            {
                codeInput.text = devCode;
                SetStatus("Geliştirme modu: e-posta servisi ayarlı değil, kod otomatik dolduruldu.");
            }
        }

        private void SetStatus(string message) => status.text = message;

        // ------------------------------------------------------------ islemler

        private async void DoLogin()
        {
            string email = loginEmail.text.Trim();
            string password = loginPassword.text;
            if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password))
            {
                SetStatus("E-posta ve parolanı gir.");
                return;
            }

            SetStatus("Giriş yapılıyor...");
            try
            {
                var resp = await ApiClient.PostAsync<AuthResponse>("/auth/login",
                    new LoginRequest { email = email, password = password });
                CompleteSignIn(resp);
            }
            catch (ApiException e)
            {
                var err = e.ParseBody<ApiError>();
                if (err != null && err.needs_verification)
                {
                    pendingEmail = email;
                    ShowVerify(err.dev_code);
                    if (string.IsNullOrEmpty(err.dev_code)) SetStatus(e.Message);
                }
                else SetStatus(e.Message);
            }
        }

        private async void DoRegister()
        {
            string email = registerEmail.text.Trim();
            string username = registerUsername.text.Trim();
            string password = registerPassword.text;
            if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(username) || string.IsNullOrEmpty(password))
            {
                SetStatus("Tüm alanları doldur.");
                return;
            }

            SetStatus("Kayıt yapılıyor...");
            try
            {
                var resp = await ApiClient.PostAsync<MessageResponse>("/auth/register",
                    new RegisterRequest { email = email, username = username, password = password });
                pendingEmail = email;
                ShowVerify(resp.dev_code);
                if (string.IsNullOrEmpty(resp.dev_code)) SetStatus("Kod e-postana gönderildi.");
            }
            catch (ApiException e)
            {
                SetStatus(e.Message);
            }
        }

        private async void DoVerify()
        {
            string code = codeInput.text.Trim();
            if (code.Length < 6)
            {
                SetStatus("6 haneli kodu gir.");
                return;
            }

            SetStatus("Doğrulanıyor...");
            try
            {
                var resp = await ApiClient.PostAsync<AuthResponse>("/auth/verify",
                    new VerifyRequest { email = pendingEmail, code = code });
                CompleteSignIn(resp);
            }
            catch (ApiException e)
            {
                SetStatus(e.Message);
            }
        }

        private async void DoResend()
        {
            SetStatus("Kod gönderiliyor...");
            try
            {
                var resp = await ApiClient.PostAsync<MessageResponse>("/auth/resend",
                    new EmailRequest { email = pendingEmail });
                if (!string.IsNullOrEmpty(resp.dev_code))
                {
                    codeInput.text = resp.dev_code;
                    SetStatus("Geliştirme modu: yeni kod otomatik dolduruldu.");
                }
                else SetStatus("Yeni kod e-postana gönderildi.");
            }
            catch (ApiException e)
            {
                SetStatus(e.Message);
            }
        }

        private void DoGuest()
        {
            PlayerSession.StartGuest();
            MenuFlow.Instance.ShowHome();
        }

        private void CompleteSignIn(AuthResponse resp)
        {
            if (resp == null || string.IsNullOrEmpty(resp.token))
            {
                SetStatus("Beklenmedik cevap, tekrar dene.");
                return;
            }
            ApiClient.Token = resp.token;
            PlayerSession.IsGuest = false;
            PlayerSession.Username = resp.user != null ? resp.user.username : "";
            MenuFlow.Instance.ShowHome();
        }
    }
}
