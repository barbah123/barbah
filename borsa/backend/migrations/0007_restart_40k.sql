-- Tek seferlik yeniden başlangıç (10 Tem 2026, kullanıcı talebi):
-- tüm işlem istatistikleri sıfırlanır, tüm portföyler $40.000 nakitle başlar.
-- starting_cash de güncellenir: Toplam K/Z, günlük zarar freni (%1.5 = $600)
-- ve pozisyon büyüklüğü hesapları yeni sermayeyi baz alır.
-- Korunanlar: manuel takip pozisyonları, seviye alarmları, sıcak sembol hafızası.

DELETE FROM positions;
DELETE FROM orders;
DELETE FROM bot_trades;
DELETE FROM signals;
DELETE FROM pulse_alerts;
UPDATE portfolios SET cash = 40000, starting_cash = 40000;
