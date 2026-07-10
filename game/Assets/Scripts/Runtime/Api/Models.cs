using System;

namespace Barbah.Coop
{
    // ---- Istekler ----

    [Serializable] public class RegisterRequest { public string email, username, password; }
    [Serializable] public class LoginRequest { public string email, password; }
    [Serializable] public class VerifyRequest { public string email, code; }
    [Serializable] public class EmailRequest { public string email; }
    [Serializable] public class CharacterRequest { public string character; }
    [Serializable] public class BuyRequest { public string type, id; }
    [Serializable] public class EquipRequest { public string item_id; public bool equip; }
    [Serializable] public class CompleteRequest { public int level; public float time_seconds; }

    // ---- Cevaplar ----

    [Serializable] public class UserDto { public string id, email, username; }

    [Serializable]
    public class AuthResponse
    {
        public string token;
        public UserDto user;
    }

    [Serializable]
    public class MessageResponse
    {
        public bool ok;
        public string message;
        public string dev_code; // backend'de e-posta anahtari yoksa doner (gelistirme)
    }

    [Serializable]
    public class ApiError
    {
        public string error;
        public bool needs_verification;
        public string dev_code;
    }

    [Serializable]
    public class ProgressRow
    {
        public int level;
        public int completions;
        public float best_time;
    }

    [Serializable]
    public class ProfileResponse
    {
        public UserDto user;
        public int coins;
        public string character;
        public string[] owned_characters;
        public string[] owned_items;
        public string[] equipped;
        public ProgressRow[] progress;
    }

    [Serializable]
    public class MarketCharacterDto
    {
        public string id, name;
        public int price;
        public bool owned, selected;
    }

    [Serializable]
    public class MarketItemDto
    {
        public string id, name, slot;
        public int price;
        public bool owned, equipped;
    }

    [Serializable]
    public class MarketResponse
    {
        public int coins;
        public MarketCharacterDto[] characters;
        public MarketItemDto[] items;
    }

    [Serializable] public class BuyResponse { public bool ok; public int coins; }
    [Serializable] public class EquipResponse { public bool ok; public string[] equipped; }
    [Serializable] public class SelectCharacterResponse { public bool ok; public string character; }

    [Serializable]
    public class CompleteResponse
    {
        public bool ok;
        public int reward;
        public bool first_time;
        public int coins;
    }
}
