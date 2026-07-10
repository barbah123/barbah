-- Tek seferlik sıfırlama (8 Tem 2026, kullanıcı talebi): tüm paper portföyler
-- başlangıç bakiyesine döner, bot/manuel paper işlem geçmişi temizlenir.
-- Korunanlar: manuel takip pozisyonları (tracked_positions — gerçek hesap işlemi),
-- seviye alarmları, nabız alarm geçmişi ve sıcak sembol hafızası.

DELETE FROM positions;
DELETE FROM orders;
DELETE FROM bot_trades;
DELETE FROM signals;
UPDATE portfolios SET cash = starting_cash;
