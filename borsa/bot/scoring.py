"""Küme alımlarını 0-100 arası puanlar.

Kurallar (her biri `reasons` listesinde gerekçesiyle döner):
  Alıcı sayısı    2 kişi +10, 3-4 kişi +20, 5+ kişi +30
  Toplam tutar    ≥$100K +5, ≥$500K +10, ≥$1M +15, ≥$5M +25
  Pozisyon artışı yeni pozisyon veya ≥%20 +15, ≥%10 +10, ≥%5 +5
  Tazelik         işlem ≤7 gün önce +10, ≤30 gün önce +5
  Kuruş hisse     fiyat < $1  -10
  Rutin alım      kümedeki herkes rutin -25, bir kısmı rutin -10,
                  geçmiş var ve kimse rutin değil +5

"Rutin alıcı" iki şekilde tanınır:
  * Yıllık (Cohen-Malloy-Pomorski): önceki 3 yılın her birinde aynı takvim
    ayında alım yapmış içeriden kişi.
  * Sık: önceki 6 takvim ayının en az 4'ünde alım yapmış kişi (aylık planlı
    alımlar; çok yıllık geçmişi olmayan yeni kayıtlı şirketlerde de yakalanır).
Rutin alımlar bilgi taşımaz; fırsatçı (rutin olmayan) alımlar getiriyi tahmin eder.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

ROUTINE_YEARS = 3
FREQUENT_LOOKBACK_MONTHS = 6
FREQUENT_MIN_MONTHS = 4
CLUSTER_WINDOW_DAYS = 30


@dataclass
class Assessment:
    ticker: str
    score: int
    grade: str
    reasons: list[str] = field(default_factory=list)
    routine_insiders: list[str] = field(default_factory=list)
    cluster_insiders: list[str] = field(default_factory=list)


def is_routine(insider: str, trade_date: date, history: list[dict[str, Any]]) -> bool:
    """`insider` yıllık ya da sık (aylık) rutinle mi alıyor? Bkz. modül açıklaması."""
    months = {
        (r["trade_date"].year, r["trade_date"].month)
        for r in history
        if r.get("insider") == insider and r.get("trade_date")
    }
    yearly = all(
        (trade_date.year - k, trade_date.month) in months
        for k in range(1, ROUTINE_YEARS + 1)
    )
    idx = trade_date.year * 12 + trade_date.month - 1
    prior = {divmod(idx - k, 12) for k in range(1, FREQUENT_LOOKBACK_MONTHS + 1)}
    prior = {(y, m + 1) for y, m in prior}
    return yearly or len(months & prior) >= FREQUENT_MIN_MONTHS


def cluster_insiders(record: dict[str, Any], history: list[dict[str, Any]]) -> list[str]:
    """Küme kaydının arkasındaki kişiler.

    Küme sayfasındaki işlem tarihi kümenin ilk işlemidir; diğer üyeler sonraki
    günlerde alıp birlikte dosyalayabilir. Bu yüzden pencere işlem tarihinden
    30 gün öncesinden dosyalama tarihine kadar uzanır.
    """
    td = record.get("trade_date")
    if not td:
        return []
    start = td - timedelta(days=CLUSTER_WINDOW_DAYS)
    end = max(td, record.get("filing_date") or td)
    names = []
    for r in history:
        d = r.get("trade_date")
        name = r.get("insider")
        if d and name and start <= d <= end and name not in names:
            names.append(name)
    return names


def _grade(score: int) -> str:
    if score >= 60:
        return "A"
    if score >= 40:
        return "B"
    if score >= 20:
        return "C"
    return "D"


def assess(
    record: dict[str, Any],
    history: list[dict[str, Any]] | None = None,
    today: date | None = None,
) -> Assessment:
    """Bir küme alımı kaydını puanlar. `history` verilmezse rutin kontrolü atlanır."""
    today = today or date.today()
    score = 0
    reasons: list[str] = []

    n = int(record.get("insiders") or 0)
    if n >= 5:
        score += 30
        reasons.append(f"{n} içeriden alıcı (+30)")
    elif n >= 3:
        score += 20
        reasons.append(f"{n} içeriden alıcı (+20)")
    elif n >= 2:
        score += 10
        reasons.append(f"{n} içeriden alıcı (+10)")

    value = record.get("value") or 0
    for limit, pts, label in ((5e6, 25, "$5M"), (1e6, 15, "$1M"), (5e5, 10, "$500K"), (1e5, 5, "$100K")):
        if value >= limit:
            score += pts
            reasons.append(f"tutar ≥{label} (+{pts})")
            break

    d_own = record.get("delta_own")
    if d_own is not None:
        if d_own == float("inf") or d_own >= 20:
            score += 15
            reasons.append("yeni pozisyon" if d_own == float("inf") else f"pozisyon +%{d_own:.0f}")
            reasons[-1] += " (+15)"
        elif d_own >= 10:
            score += 10
            reasons.append(f"pozisyon +%{d_own:.0f} (+10)")
        elif d_own >= 5:
            score += 5
            reasons.append(f"pozisyon +%{d_own:.0f} (+5)")

    td = record.get("trade_date")
    if td:
        age = (today - td).days
        if age <= 7:
            score += 10
            reasons.append(f"{age} gün önce (+10)")
        elif age <= 30:
            score += 5
            reasons.append(f"{age} gün önce (+5)")

    price = record.get("price")
    if price is not None and price < 1:
        score -= 10
        reasons.append("kuruş hisse (-10)")

    routine: list[str] = []
    members: list[str] = []
    if history and td:
        members = cluster_insiders(record, history)
        routine = [m for m in members if is_routine(m, td, history)]
        if members and len(routine) == len(members):
            score -= 25
            reasons.append("tüm alıcılar rutin (-25)")
        elif routine:
            score -= 10
            reasons.append(f"{len(routine)}/{len(members)} alıcı rutin (-10)")
        elif members:
            score += 5
            reasons.append("fırsatçı alım, rutin yok (+5)")

    score = max(0, min(100, score))
    return Assessment(
        ticker=record.get("ticker", "?"),
        score=score,
        grade=_grade(score),
        reasons=reasons,
        routine_insiders=routine,
        cluster_insiders=members,
    )
