using System;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace Barbah.Coop
{
    /// <summary>Sunucudan donen hatayi (Turkce mesaj + govde) tasir.</summary>
    public class ApiException : Exception
    {
        public readonly long StatusCode;
        public readonly string Body;

        public ApiException(string message, long statusCode, string body) : base(message)
        {
            StatusCode = statusCode;
            Body = body;
        }

        public T ParseBody<T>()
        {
            try { return JsonUtility.FromJson<T>(Body); }
            catch { return default; }
        }
    }

    /// <summary>Badaland API istemcisi (game/backend'deki Cloudflare Worker).</summary>
    public static class ApiClient
    {
        // GitHub Actions (deploy-badaland.yml) main'e merge edilince backend'i
        // otomatik olarak bu adrese deploy eder (diger projelerle ayni kalip).
        public const string BaseUrl = "https://badaland-api.barbah.workers.dev";

        private const string TokenKey = "badaland_token";

        public static string Token
        {
            get => PlayerPrefs.GetString(TokenKey, "");
            set { PlayerPrefs.SetString(TokenKey, value ?? ""); PlayerPrefs.Save(); }
        }

        public static bool HasToken => !string.IsNullOrEmpty(Token);

        public static Task<T> GetAsync<T>(string path) => SendAsync<T>(path, "GET", null);

        public static Task<T> PostAsync<T>(string path, object body) =>
            SendAsync<T>(path, "POST", body != null ? JsonUtility.ToJson(body) : "{}");

        private static async Task<T> SendAsync<T>(string path, string method, string jsonBody)
        {
            using var request = new UnityWebRequest(BaseUrl + path, method);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.timeout = 15;
            if (jsonBody != null)
            {
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(jsonBody));
                request.SetRequestHeader("Content-Type", "application/json");
            }
            if (HasToken) request.SetRequestHeader("Authorization", "Bearer " + Token);

            var operation = request.SendWebRequest();
            while (!operation.isDone) await Task.Yield();

            string responseText = request.downloadHandler.text;

            if (request.result != UnityWebRequest.Result.Success && request.responseCode == 0)
                throw new ApiException("Sunucuya ulaşılamadı — internet bağlantını kontrol et.", 0, "");

            if (request.responseCode >= 400)
            {
                string message = "Bir şeyler ters gitti.";
                try
                {
                    var err = JsonUtility.FromJson<ApiError>(responseText);
                    if (!string.IsNullOrEmpty(err?.error)) message = err.error;
                }
                catch { /* govde JSON degilse genel mesaj kalir */ }
                throw new ApiException(message, request.responseCode, responseText);
            }

            return JsonUtility.FromJson<T>(responseText);
        }
    }
}
