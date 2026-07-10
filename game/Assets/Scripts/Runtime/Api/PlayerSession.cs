using System;
using UnityEngine;

namespace Barbah.Coop
{
    /// <summary>
    /// Yerel oturum durumu: giris/misafir bilgisi, secili karakter,
    /// takili esyalar ve altin. Sunucudan gelen profil buraya yazilir;
    /// oyun ici sistemler (PlayerAvatar vb.) buradan okur.
    /// </summary>
    public static class PlayerSession
    {
        private const string GuestKey = "badaland_guest";
        private const string UsernameKey = "badaland_username";
        private const string CoinsKey = "badaland_coins";
        private const string CharacterKey = "badaland_character";
        private const string EquippedKey = "badaland_equipped";

        public static bool IsGuest
        {
            get => PlayerPrefs.GetInt(GuestKey, 0) == 1;
            set { PlayerPrefs.SetInt(GuestKey, value ? 1 : 0); PlayerPrefs.Save(); }
        }

        public static bool IsLoggedIn => !IsGuest && ApiClient.HasToken;

        public static string Username
        {
            get => PlayerPrefs.GetString(UsernameKey, IsGuest ? "Misafir" : "");
            set { PlayerPrefs.SetString(UsernameKey, value ?? ""); PlayerPrefs.Save(); }
        }

        public static int Coins
        {
            get => PlayerPrefs.GetInt(CoinsKey, 0);
            set { PlayerPrefs.SetInt(CoinsKey, value); PlayerPrefs.Save(); }
        }

        public static string CharacterId
        {
            get => PlayerPrefs.GetString(CharacterKey, "tilki");
            set { PlayerPrefs.SetString(CharacterKey, value ?? "tilki"); PlayerPrefs.Save(); }
        }

        public static string[] Equipped
        {
            get
            {
                string csv = PlayerPrefs.GetString(EquippedKey, "");
                return string.IsNullOrEmpty(csv)
                    ? Array.Empty<string>()
                    : csv.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
            }
            set { PlayerPrefs.SetString(EquippedKey, string.Join(",", value ?? Array.Empty<string>())); PlayerPrefs.Save(); }
        }

        public static void ApplyProfile(ProfileResponse profile)
        {
            if (profile == null) return;
            IsGuest = false;
            Username = profile.user?.username ?? "";
            Coins = profile.coins;
            CharacterId = profile.character;
            Equipped = profile.equipped ?? Array.Empty<string>();
        }

        public static void StartGuest()
        {
            ApiClient.Token = "";
            IsGuest = true;
            Username = "Misafir";
            Coins = 0;
            Equipped = Array.Empty<string>();
        }

        public static void Logout()
        {
            ApiClient.Token = "";
            IsGuest = false;
            Username = "";
            Coins = 0;
            Equipped = Array.Empty<string>();
        }
    }
}
