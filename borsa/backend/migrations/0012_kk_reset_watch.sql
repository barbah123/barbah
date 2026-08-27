-- Breakout kurulum kriterleri sıkılaştı (derinlik, pivota uzaklık, hacim
-- kuruması artık yapısal koşul; kısa bayraklarda mutlak ölçüler). kk_watch bir
-- ÖNBELLEKTİR: içindeki satırlar eski kurallarla hesaplanmış pivot/tetik
-- seviyeleri taşır ve dönen tarama onlara ancak 20 saatlik TTL dolunca döner —
-- yani düzeltme yayına girse bile eski kurulumlar bir gün daha tetiklenebilirdi.
-- Tabloyu boşaltmak yeterli: dönen tarama "hiç bakılmamış" sembolleri en önce
-- ele aldığı için havuz yeni kurallarla kendini birkaç saat içinde doldurur.
-- (kk_signals'a dokunulmaz: sinyal geçmişi ve soğuma kayıtları korunur.)
DELETE FROM kk_watch;
