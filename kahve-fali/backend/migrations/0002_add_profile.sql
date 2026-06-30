-- Fal kişiselleştirme için opsiyonel profil bilgileri.
ALTER TABLE user_settings ADD COLUMN birth_date TEXT;       -- YYYY-MM-DD
ALTER TABLE user_settings ADD COLUMN gender TEXT;           -- kadin | erkek | diger
ALTER TABLE user_settings ADD COLUMN marital_status TEXT;   -- bekar | evli | iliskisi_var | diger
