#!/usr/bin/env python3
"""Borsa trader botu backtest motoru.

Botun MEKANİK çekirdeğini tarihsel 5 dk mumlarla gün gün yeniden oynatır.
Veri, Worker'ın admin proxy uçlarından gelir (Massive anahtarı dışarı çıkmaz)
ve diske önbelleğe alınır; aynı pencere ikinci kez saniyeler içinde koşar.

Bilinçli yaklaşımlar / kısıtlar:
- 15 dk veri gecikmesi simüle edilir: t anındaki karar, t-15dk kapanışıyla verilir
  ve dolgu da o (gecikmeli) fiyattan yapılır — kağıt botun gerçek davranışı.
- İstihbarat katmanı (haber/Reddit/Stocktwits) tarihsel olarak yok: ne engel ne boost.
- Rejim genişliği gün-statik yaklaşıklanır (o günün tam-gün yükselen/düşen sayısı);
  gün içi zamana bağlı genişlik tüm evrenin gün-içi verisini isterdi.
- Aday ÇEKİMİ (hangi sembollerin gün-içi verisi indirilecek) tam-gün yükseğine
  bakar — bu bir üst-küme seçimidir, işlem KARARLARI yalnızca görünür veriyle verilir.
- Nabız/açılış-lideri girişleri simüle edilmez (katalizör şartı yeniden üretilemez);
  sonuçlar yalnızca düzenli döngü girişlerini ölçer.

Kullanım:
  python3 engine.py --start 2026-03-24 --end 2026-09-23 --config old
  python3 engine.py --start 2026-03-24 --end 2026-09-23 --config new
  python3 engine.py ... --config both   # ikisini aynı veriyle koşar
"""

import argparse
import json
import math
import os
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

BASE = 'https://borsa-paper-api.barbah.workers.dev'
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache')

# --- Bot parametreleri (canlı config ile hizalı) ---
START_EQUITY = 40_000.0
RISK_PCT = 1.0            # işlem başına risk (özkaynak %)
MAX_POSITIONS = 3
MAX_POSITION_PCT = 20.0   # tek pozisyon tavanı (özkaynak %)
FIXED_STOP_PCT = 2.0      # eski kurallar
FIXED_TARGET_PCT = 3.0
MIN_DAY, MAX_DAY = 1.5, 6.0        # gün değişimi bandı
MIN_MOM, MAX_MOM = 1.5, 4.0        # 30 dk momentum bandı
SESSION_OPEN = 13 * 60 + 30        # UTC dakika
SESSION_CLOSE = 20 * 60
WARMUP_MIN = SESSION_OPEN + 45     # 14:15'e kadar giriş yok
CHOP_START, CHOP_END = 15 * 60 + 30, 18 * 60
FLATTEN_MIN = SESSION_CLOSE - 10   # 19:50 tümünü kapat
TIME_STOP_MIN = 180                # 3 saatte kâra geçemeyen kapanır
COOLDOWN_MIN = 60
DAILY_BRAKE_PCT = 1.5
DATA_DELAY_MIN = 15
CYCLE_MIN = 10
# Yeni kurallar
REGIME_RATIO = 1.3
VOL_STOP_FRACTION, VOL_STOP_MIN, VOL_STOP_MAX = 0.35, 1.5, 4.0
RISK_REWARD = 1.5
IN_PLAY_MIN_RELVOL = 1.5
# Aday çekim üst-kümesi
FETCH_TOP_PER_DAY = 25
MIN_PRICE, MAX_PRICE = 3.0, 800.0
MIN_DOLLAR_VOL = 2_000_000


def http_json(path, retries=4):
    """curl ile çek: bu konteynerin çıkış proxy'si urllib'i 403'lüyor, curl'ü değil."""
    import subprocess
    url = BASE + path
    for i in range(retries):
        try:
            out = subprocess.run(
                ['curl', '-sS', '--max-time', '45', url],
                capture_output=True, timeout=60, check=True,
            )
            return json.loads(out.stdout.decode())
        except Exception:
            if i == retries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def cached(key, fetch):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, key + '.json')
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    data = fetch()
    with open(p, 'w') as f:
        json.dump(data, f)
    return data


def daily_bars(d: str):
    return cached(f'daily_{d}', lambda: http_json(f'/api/admin/daily-bars?date={d}'))


def intraday(symbol: str, d: str):
    day = datetime.strptime(d, '%Y-%m-%d').replace(tzinfo=timezone.utc)
    frm = int(day.replace(hour=8).timestamp() * 1000)
    to = int(day.replace(hour=21).timestamp() * 1000)
    key = f'aggs_{symbol}_{d}'
    return cached(key, lambda: http_json(f'/api/admin/aggs?symbol={symbol}&from={frm}&to={to}'))


class Trade:
    __slots__ = ('symbol', 'qty', 'entry', 'stop', 'target', 'opened_min', 'reason')

    def __init__(self, symbol, qty, entry, stop, target, opened_min, reason):
        self.symbol, self.qty, self.entry = symbol, qty, entry
        self.stop, self.target, self.opened_min = stop, target, opened_min
        self.reason = reason


def visible_index(bars, minute_utc):
    """t dakikasında GÖRÜNÜR son barın indeksi (15 dk gecikme)."""
    cutoff = minute_utc - DATA_DELAY_MIN
    idx = -1
    for i, b in enumerate(bars):
        bm = b['_min']
        if bm <= cutoff:
            idx = i
        else:
            break
    return idx


def run_day(d, prev_map, avg20_map, breadth, series, cfg, equity):
    """Bir günü oynat. Döner: (trades_closed, day_pnl, equity_sonu)."""
    open_trades = []
    closed = []
    cooldown = {}
    day_realized = 0.0
    cash = equity  # gün içi tamamı nakit varsayımı (bot da EOD flatten yapıyor)

    minute = SESSION_OPEN
    while minute < SESSION_CLOSE:
        # --- Çıkış yönetimi ---
        for tr in list(open_trades):
            bars = series[tr.symbol]
            vi = visible_index(bars, minute)
            if vi < 0:
                continue
            price = bars[vi]['c']
            exit_reason = None
            if price <= tr.stop:
                exit_reason = 'stop'
            elif price >= tr.target:
                exit_reason = 'hedef'
            elif minute - tr.opened_min >= TIME_STOP_MIN and price <= tr.entry:
                exit_reason = 'zaman'
            elif minute >= FLATTEN_MIN:
                exit_reason = 'eod'
            if exit_reason:
                pnl = (price - tr.entry) * tr.qty
                day_realized += pnl
                cash += tr.qty * price
                closed.append((tr.symbol, pnl, exit_reason, tr.reason))
                open_trades.remove(tr)
                cooldown[tr.symbol] = minute

        # --- Girişler ---
        can_enter = (
            minute >= WARMUP_MIN
            and not (CHOP_START <= minute < CHOP_END)
            and minute < FLATTEN_MIN
            and len(open_trades) < MAX_POSITIONS
            and day_realized > -(equity * DAILY_BRAKE_PCT / 100)
        )
        if can_enter and cfg['regime'] and breadth['dec'] > breadth['adv'] * REGIME_RATIO:
            can_enter = False

        if can_enter:
            candidates = []
            for sym, bars in series.items():
                if sym in (t.symbol for t in open_trades):
                    continue
                if sym in cooldown and minute - cooldown[sym] < COOLDOWN_MIN:
                    continue
                vi = visible_index(bars, minute)
                if vi < 7:
                    continue
                price = bars[vi]['c']
                prev = prev_map.get(sym)
                if not prev or price < MIN_PRICE:
                    continue
                day_pct = (price / prev - 1) * 100
                mom_pct = (price / bars[vi - 6]['c'] - 1) * 100 if bars[vi - 6]['c'] else 0
                if not (MIN_DAY <= day_pct <= MAX_DAY):
                    continue
                if not (MIN_MOM <= mom_pct <= MAX_MOM):
                    continue
                # In-play kapısı (yeni): bugünkü kümülatif hacim vs 20g ort. (gün oranlı)
                if cfg['inplay']:
                    cum_vol = sum(b['v'] for b in bars[: vi + 1])
                    frac = max(0.05, (minute - DATA_DELAY_MIN - SESSION_OPEN) / (SESSION_CLOSE - SESSION_OPEN))
                    avg20 = avg20_map.get(sym)
                    if avg20 and avg20 > 0:
                        rel = cum_vol / (avg20 * frac)
                        if rel < IN_PLAY_MIN_RELVOL:
                            continue
                rank = mom_pct * 2 - max(0.0, day_pct - 4)
                hi = max(b['h'] for b in bars[: vi + 1])
                lo = min(b['l'] for b in bars[: vi + 1])
                range_pct = (hi - lo) / prev * 100
                candidates.append((rank, sym, price, range_pct))
            candidates.sort(reverse=True)
            slots = MAX_POSITIONS - len(open_trades)
            for rank, sym, price, range_pct in candidates[:slots]:
                if cfg['volstop'] and range_pct > 0:
                    stop_pct = min(max(range_pct * VOL_STOP_FRACTION, VOL_STOP_MIN), VOL_STOP_MAX)
                    target_pct = stop_pct * RISK_REWARD
                else:
                    stop_pct, target_pct = FIXED_STOP_PCT, FIXED_TARGET_PCT
                risk_amt = equity * RISK_PCT / 100
                stop_dist = price * stop_pct / 100
                qty = int(risk_amt / stop_dist)
                qty = min(qty, int(equity * MAX_POSITION_PCT / 100 / price), int(cash / price))
                if qty < 1:
                    continue
                cash -= qty * price
                open_trades.append(
                    Trade(sym, qty, price, price * (1 - stop_pct / 100), price * (1 + target_pct / 100), minute, f'stop%{stop_pct:.1f}')
                )
        minute += CYCLE_MIN

    # Seans sonunda hâlâ açık kalan (veri bitti vs.) son görünür fiyattan kapat
    for tr in open_trades:
        bars = series[tr.symbol]
        price = bars[-1]['c']
        pnl = (price - tr.entry) * tr.qty
        day_realized += pnl
        closed.append((tr.symbol, pnl, 'eod', tr.reason))

    return closed, day_realized


def prepare_day(d, all_days, day_idx):
    """Bir günün verisini kur: prev kapanışlar, 20g ort. hacim, genişlik, aday serileri."""
    bars_today = daily_bars(d)['bars']
    prev_d = all_days[day_idx - 1]
    bars_prev = daily_bars(prev_d)['bars']
    prev_map = {b['symbol']: b['c'] for b in bars_prev}

    # 20 günlük ortalama dolar-değil ADET hacmi (in-play için)
    hist = {}
    for pd in all_days[max(0, day_idx - 20): day_idx]:
        for b in daily_bars(pd)['bars']:
            hist.setdefault(b['symbol'], []).append(b['v'])
    avg20_map = {s: sum(v) / len(v) for s, v in hist.items() if v}

    adv = sum(1 for b in bars_today if prev_map.get(b['symbol']) and b['c'] > prev_map[b['symbol']])
    dec = sum(1 for b in bars_today if prev_map.get(b['symbol']) and b['c'] < prev_map[b['symbol']])

    # Aday üst-kümesi: gün içinde banda girmiş OLABİLECEK likit isimler
    cands = []
    for b in bars_today:
        prev = prev_map.get(b['symbol'])
        if not prev or not (MIN_PRICE <= b['c'] <= MAX_PRICE):
            continue
        if b['c'] * b['v'] < MIN_DOLLAR_VOL:
            continue
        hi_pct = (b['h'] / prev - 1) * 100
        if hi_pct < MIN_DAY:
            continue
        cands.append((b['c'] * b['v'], b['symbol']))
    cands.sort(reverse=True)
    picks = [s for _, s in cands[:FETCH_TOP_PER_DAY]]

    series = {}
    def load(sym):
        try:
            data = intraday(sym, d)
            bars = data.get('candles', [])
            out = []
            for c in bars:
                dt = datetime.fromtimestamp(c['t'], tz=timezone.utc)
                if dt.strftime('%Y-%m-%d') != d:
                    continue
                c['_min'] = dt.hour * 60 + dt.minute
                out.append(c)
            if len(out) >= 20:
                series[sym] = out
        except Exception:
            pass
    with ThreadPoolExecutor(max_workers=6) as ex:
        list(ex.map(load, picks))
    return prev_map, avg20_map, {'adv': adv, 'dec': dec}, series


CONFIGS = {
    'old': {'regime': False, 'volstop': False, 'inplay': False},
    'new': {'regime': True, 'volstop': True, 'inplay': True},
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--start', required=True)
    ap.add_argument('--end', required=True)
    ap.add_argument('--config', default='both', choices=['old', 'new', 'both'])
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    # İşlem günleri: hafta içi + daily-bars boş dönmeyenler
    d0 = datetime.strptime(args.start, '%Y-%m-%d').date()
    d1 = datetime.strptime(args.end, '%Y-%m-%d').date()
    days = []
    d = d0
    while d <= d1:
        if d.weekday() < 5:
            ds = d.isoformat()
            try:
                if daily_bars(ds).get('count', 0) > 500:
                    days.append(ds)
            except Exception:
                pass
        d += timedelta(days=1)
    print(f'{len(days)} işlem günü ({days[0]} → {days[-1]})', file=sys.stderr)

    cfg_names = ['old', 'new'] if args.config == 'both' else [args.config]
    results = {}
    day_cache = {}
    for name in cfg_names:
        cfg = CONFIGS[name]
        equity = START_EQUITY
        all_closed = []
        daily = []
        for i, ds in enumerate(days):
            if i == 0:
                continue  # ilk gün prev yok
            if ds not in day_cache:
                day_cache[ds] = prepare_day(ds, days, i)
            prev_map, avg20_map, breadth, series = day_cache[ds]
            closed, pnl = run_day(ds, prev_map, avg20_map, breadth, series, cfg, equity)
            equity += pnl
            all_closed.extend([(ds,) + c for c in closed])
            daily.append((ds, pnl, equity, len(closed)))
            if i % 20 == 0:
                print(f'  [{name}] {ds}: equity ${equity:,.0f}', file=sys.stderr)
        wins = [c for c in all_closed if c[2] > 0]
        losses = [c for c in all_closed if c[2] <= 0]
        gw = sum(c[2] for c in wins)
        gl = sum(c[2] for c in losses)
        peak, maxdd = START_EQUITY, 0.0
        for _, _, eq, _ in daily:
            peak = max(peak, eq)
            maxdd = max(maxdd, peak - eq)
        results[name] = {
            'trades': len(all_closed), 'wins': len(wins),
            'net': equity - START_EQUITY, 'final': equity,
            'gross_win': gw, 'gross_loss': gl,
            'pf': (gw / abs(gl)) if gl else float('inf'),
            'maxdd': maxdd,
            'daily': daily, 'closed': all_closed,
        }

    out = args.out or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'results.json')
    with open(out, 'w') as f:
        json.dump(results, f, default=str)
    for name, r in results.items():
        wr = r['wins'] / r['trades'] * 100 if r['trades'] else 0
        print(f"\n=== {name.upper()} ===")
        print(f"işlem: {r['trades']} | isabet: %{wr:.0f} | NET: ${r['net']:+,.0f} → ${r['final']:,.0f}")
        print(f"PF: {r['pf']:.2f} | brüt +${r['gross_win']:,.0f} / ${r['gross_loss']:,.0f} | maxDD: ${r['maxdd']:,.0f}")


if __name__ == '__main__':
    main()
