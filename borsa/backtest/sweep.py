#!/usr/bin/env python3
"""Eşik taraması: 'yeni' kural setinin parametrelerini önbellekteki veriyle tarar.

Aşama 1 — tek boyut: her parametre tek başına oynatılır (diğerleri bazda).
Aşama 2 — ızgara: en etkili üç boyutun kaba ızgarası.
Çıktı: PF + net + maxDD tablosu; results_sweep.json'a da yazılır.

Not: 6 aylık tek pencerede optimizasyon aşırı-uyum riski taşır — kazanan
eşikler 'geniş plato' üzerindeyse güvenilir, tek sivri nokta ise şüphelidir.
"""

import json
import os
import sys
from datetime import datetime, timedelta

import engine


def trading_days(start, end):
    d0 = datetime.strptime(start, '%Y-%m-%d').date()
    d1 = datetime.strptime(end, '%Y-%m-%d').date()
    days = []
    d = d0
    while d <= d1:
        if d.weekday() < 5:
            ds = d.isoformat()
            try:
                if engine.daily_bars(ds).get('count', 0) > 500:
                    days.append(ds)
            except Exception:
                pass
        d += timedelta(days=1)
    return days


def run(days, day_data, cfg, params):
    """params: engine sabitlerine geçici değerler."""
    saved = {k: getattr(engine, k) for k in params}
    for k, v in params.items():
        setattr(engine, k, v)
    try:
        equity = engine.START_EQUITY
        all_closed = []
        peak, maxdd = equity, 0.0
        for ds in days[1:]:
            prev_map, avg20_map, breadth, series = day_data[ds]
            closed, pnl = engine.run_day(ds, prev_map, avg20_map, breadth, series, cfg, equity)
            equity += pnl
            all_closed.extend(closed)
            peak = max(peak, equity)
            maxdd = max(maxdd, peak - equity)
        wins = sum(1 for c in all_closed if c[1] > 0)
        gw = sum(c[1] for c in all_closed if c[1] > 0)
        gl = sum(c[1] for c in all_closed if c[1] <= 0)
        return {
            'trades': len(all_closed),
            'winrate': wins / len(all_closed) * 100 if all_closed else 0,
            'net': equity - engine.START_EQUITY,
            'pf': (gw / abs(gl)) if gl else float('inf'),
            'maxdd': maxdd,
        }
    finally:
        for k, v in saved.items():
            setattr(engine, k, v)


def fmt(name, r):
    return (f"{name:<38} işlem={r['trades']:>3} isabet=%{r['winrate']:>2.0f} "
            f"net=${r['net']:>+8,.0f} PF={r['pf']:>5.2f} maxDD=${r['maxdd']:>6,.0f}")


def main():
    start, end = '2026-03-23', '2026-09-23'
    days = trading_days(start, end)
    print(f'{len(days)} gün, veriler yükleniyor (önbellekten)...', file=sys.stderr)
    day_data = {}
    for i, ds in enumerate(days):
        if i == 0:
            continue
        day_data[ds] = engine.prepare_day(ds, days, i)

    cfg_new = {'regime': True, 'volstop': True, 'inplay': True}
    results = {}

    def record(name, params, cfg=cfg_new):
        r = run(days, day_data, cfg, params)
        results[name] = {'params': params, **r}
        print(fmt(name, r))

    print('\n--- BAZ ---')
    record('baz (relvol1.5 rejim1.3 frac0.35 1.5R)', {})

    print('\n--- 1) Hacim kapısı eşiği ---')
    for v in (1.0, 1.2, 2.0, 3.0):
        record(f'relvol={v}', {'IN_PLAY_MIN_RELVOL': v})

    print('\n--- 2) Rejim oranı ---')
    for v in (1.0, 1.15, 1.5, 2.0):
        record(f'rejim={v}', {'REGIME_RATIO': v})

    print('\n--- 3) Stop genişliği (aralık kesri) ---')
    for v in (0.25, 0.45, 0.6):
        record(f'frac={v}', {'VOL_STOP_FRACTION': v})

    print('\n--- 4) Hedef R katı ---')
    for v in (1.2, 2.0, 2.5):
        record(f'rr={v}', {'RISK_REWARD': v})

    # Aşama 2: tek-boyut kazananlarının kaba ızgarası
    best_rel = max((1.0, 1.2, 1.5, 2.0, 3.0),
                   key=lambda v: results.get(f'relvol={v}', results['baz (relvol1.5 rejim1.3 frac0.35 1.5R)'])['net'] if v != 1.5 else results['baz (relvol1.5 rejim1.3 frac0.35 1.5R)']['net'])
    print('\n--- 5) Izgara: relvol x rejim x rr ---')
    for rel in (1.2, 1.5, 2.0):
        for reg in (1.15, 1.3, 1.5):
            for rr in (1.5, 2.0):
                record(f'grid rel={rel} reg={reg} rr={rr}',
                       {'IN_PLAY_MIN_RELVOL': rel, 'REGIME_RATIO': reg, 'RISK_REWARD': rr})

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'results_sweep.json')
    with open(out, 'w') as f:
        json.dump(results, f, default=str)
    print(f'\nyazıldı: {out}')

    top = sorted(results.items(), key=lambda kv: kv[1]['net'], reverse=True)[:8]
    print('\n=== NET sıralı ilk 8 ===')
    for name, r in top:
        print(fmt(name, r))


if __name__ == '__main__':
    main()
