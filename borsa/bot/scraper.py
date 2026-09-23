"""OpenInsider kazıyıcı: küme alımları + hisse bazlı alım geçmişi.

OpenInsider'ın tüm listeleri aynı `table.tinytable` yapısını kullanır, ama
sütunlar sayfaya göre değişir (küme sayfasında Company Name/Industry/Ins,
screener'da Insider Name/Title). Bu yüzden `parse_table` sütunları sıra
numarasıyla değil başlık adıyla eşler.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

import requests
from bs4 import BeautifulSoup

BASE_URL = "http://openinsider.com"
CLUSTER_URL = f"{BASE_URL}/latest-cluster-buys"
# fd=0 zorunlu: verilmezse screener yalnızca son günlerin dosyalamalarına
# bakar ve rutin alım kontrolü için gereken çok yıllık geçmiş gelmez.
# xp=1 yalnızca açık piyasa alımlarını (P - Purchase) döndürür.
SCREENER_URL = f"{BASE_URL}/screener?s={{ticker}}&xp=1&fd=0&td=0&cnt=1000&page=1"

HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) insider-bot/1.0"}
TIMEOUT = 20

# Başlık metni -> kayıt anahtarı. Listede olmayan başlıklar slug'a çevrilir.
COLUMN_KEYS = {
    "x": "flags",
    "filing date": "filing_date",
    "trade date": "trade_date",
    "ticker": "ticker",
    "company name": "company",
    "industry": "industry",
    "ins": "insiders",
    "insider name": "insider",
    "title": "title",
    "trade type": "trade_type",
    "price": "price",
    "qty": "qty",
    "owned": "owned",
    "δown": "delta_own",
    "value": "value",
    "1d": "ret_1d",
    "1w": "ret_1w",
    "1m": "ret_1m",
    "6m": "ret_6m",
}

NUMERIC = {"price", "qty", "owned", "value", "insiders"}
PERCENT = {"delta_own", "ret_1d", "ret_1w", "ret_1m", "ret_6m"}


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def _key(header: str) -> str:
    h = _clean(header).lower()
    return COLUMN_KEYS.get(h, re.sub(r"[^a-z0-9]+", "_", h).strip("_"))


def parse_number(text: str) -> float | None:
    """'$6.77', '+25,000', '+$1,317,500', '-1,200' -> float; boşsa None."""
    t = text.replace("$", "").replace(",", "").replace("+", "").strip()
    if not t or t == "-":
        return None
    try:
        return float(t)
    except ValueError:
        return None


def parse_percent(text: str) -> float | None:
    """'+22%' -> 22.0, '>999%' -> 999.0, 'New' -> inf (sıfırdan pozisyon)."""
    t = text.strip()
    if t.lower() == "new":
        return float("inf")
    t = t.replace("%", "").replace(">", "").replace("<", "")
    return parse_number(t)


def parse_date(text: str) -> date | None:
    m = re.match(r"(\d{4}-\d{2}-\d{2})", text.strip())
    return datetime.strptime(m.group(1), "%Y-%m-%d").date() if m else None


def parse_table(html: str) -> list[dict[str, Any]]:
    """OpenInsider `tinytable` tablosunu başlık adlarına göre ayrıştırır.

    Tablo yoksa (ör. screener sonuç bulamadı) boş liste döner.
    """
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", class_="tinytable")
    if table is None:
        return []

    head = table.find("thead")
    header_cells = head.find_all("th") if head else table.find("tr").find_all("th")
    keys = [_key(th.get_text()) for th in header_cells]
    if "ticker" not in keys:
        raise ValueError(f"Beklenmeyen tablo başlıkları: {keys}")

    body = table.find("tbody") or table
    records: list[dict[str, Any]] = []
    for tr in body.find_all("tr", recursive=False):
        cells = tr.find_all("td", recursive=False)
        if len(cells) != len(keys):
            continue
        rec: dict[str, Any] = {}
        for key, td in zip(keys, cells):
            raw = _clean(td.get_text())
            if key in NUMERIC:
                rec[key] = parse_number(raw)
            elif key in PERCENT:
                rec[key] = parse_percent(raw)
            elif key in ("filing_date", "trade_date"):
                rec[key] = parse_date(raw)
            else:
                rec[key] = raw
        rec["ticker"] = rec["ticker"].upper()
        records.append(rec)
    return records


def _get(url: str, session: requests.Session | None = None) -> str:
    resp = (session or requests).get(url, headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.text


def fetch_cluster_buys(session: requests.Session | None = None) -> list[dict[str, Any]]:
    """Son küme alımları (birden fazla içeriden kişinin aynı hissede alımı)."""
    return parse_table(_get(CLUSTER_URL, session))


def fetch_purchase_history(
    ticker: str, session: requests.Session | None = None
) -> list[dict[str, Any]]:
    """Bir hissenin tüm geçmiş açık piyasa alımları (içeriden kişi bazında)."""
    url = SCREENER_URL.format(ticker=requests.utils.quote(ticker.upper()))
    rows = parse_table(_get(url, session))
    return [r for r in rows if r.get("trade_type", "").startswith("P")]
