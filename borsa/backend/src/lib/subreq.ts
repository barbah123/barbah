// ALT-İSTEK SAYACI (tanı) — 7 Eyl: zenginleştirme 20'ye inmişken bile
// "Too many subrequests" alındı; kâğıt üstündeki hesap ~36'ydı. Gerçek sayıyı
// görmeden bütçe ayarı yapılamıyor. runTraderCycle başında sıfırlanır; her dış
// fetch (Massive, Yahoo, Telegram) bump ile sayılır ve rapor gönderim hatasına
// [fetch=N] olarak eklenir. Modül durumu izolasyon örneği başına yaşar: aynı
// izolasyonda peş peşe istekler sayacı paylaşır, bu yüzden yalnızca reset
// sonrası değer anlamlıdır.
let n = 0;
export function bumpSubreq(): void {
  n++;
}
export function subreqCount(): number {
  return n;
}
export function resetSubreq(): void {
  n = 0;
}
