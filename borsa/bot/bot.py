"""Telegram botu: OpenInsider küme alımlarını puanlayıp gönderir.

Kullanım:
  python bot.py              # Telegram botunu başlatır (TELEGRAM_BOT_TOKEN gerekli)
  python bot.py --summary    # Telegram olmadan konsola özet tablo basar

Ortam değişkenleri:
  TELEGRAM_BOT_TOKEN  zorunlu (bot modu)
  TELEGRAM_CHAT_ID    verilirse yeni küme alımları bu sohbete otomatik gönderilir
  SCAN_MINUTES        otomatik tarama aralığı, varsayılan 60
  MIN_SCORE           otomatik gönderim eşiği, varsayılan 40
  SEEN_FILE           gönderilmiş kayıtların tutulduğu dosya, varsayılan seen.json
"""

from __future__ import annotations

import argparse
import html
import json
import logging
import os
import sys
import time
from pathlib import Path

import requests

import scoring
import scraper

log = logging.getLogger("insider-bot")

REQUEST_DELAY = 0.5  # OpenInsider'a nazik olmak için istekler arası bekleme


def assess_all(records, session=None, delay=REQUEST_DELAY):
    """Her kaydı hisse geçmişiyle puanlar; geçmiş hisse başına bir kez çekilir."""
    session = session or requests.Session()
    cache: dict[str, list] = {}
    out = []
    for rec in records:
        t = rec["ticker"]
        if t not in cache:
            try:
                cache[t] = scraper.fetch_purchase_history(t, session)
            except requests.RequestException as e:
                log.warning("%s geçmişi alınamadı: %s", t, e)
                cache[t] = []
            time.sleep(delay)
        out.append((rec, scoring.assess(rec, cache[t])))
    out.sort(key=lambda p: p[1].score, reverse=True)
    return out


def format_summary(pairs) -> str:
    lines = [f"{'Hisse':<6} {'Puan':>4} {'Not':<3} {'Kişi':>4} {'Tutar':>12} {'İşlem':<10} Rutin"]
    for rec, a in pairs:
        routine = f"{len(a.routine_insiders)}/{len(a.cluster_insiders)}" if a.cluster_insiders else "-"
        lines.append(
            f"{rec['ticker']:<6} {a.score:>4} {a.grade:<3} {int(rec.get('insiders') or 0):>4} "
            f"{'$' + format(int(rec.get('value') or 0), ','):>12} {str(rec.get('trade_date')):<10} {routine}"
        )
    return "\n".join(lines)


def format_alert(rec, a) -> str:
    return (
        f"<b>{html.escape(rec['ticker'])}</b> — {html.escape(rec.get('company', ''))}\n"
        f"Puan: <b>{a.score}</b> ({a.grade}) · {int(rec.get('insiders') or 0)} kişi · "
        f"${int(rec.get('value') or 0):,} · ${rec.get('price') or 0:.2f}\n"
        f"İşlem: {rec.get('trade_date')} · Dosyalama: {rec.get('filing_date')}\n"
        f"<i>{html.escape(', '.join(a.reasons))}</i>\n"
        f"http://openinsider.com/{html.escape(rec['ticker'])}"
    )


class Telegram:
    def __init__(self, token: str):
        self.api = f"https://api.telegram.org/bot{token}"
        self.session = requests.Session()

    def call(self, method: str, **params):
        r = self.session.post(f"{self.api}/{method}", json=params, timeout=40)
        r.raise_for_status()
        return r.json()["result"]

    def send(self, chat_id, text: str):
        # Telegram sınırı 4096 karakter; uzun mesajları satır sınırında böl.
        chunk = ""
        for line in text.split("\n"):
            if len(chunk) + len(line) + 1 > 4000:
                self.call("sendMessage", chat_id=chat_id, text=chunk, parse_mode="HTML",
                          disable_web_page_preview=True)
                chunk = ""
            chunk += line + "\n"
        if chunk.strip():
            self.call("sendMessage", chat_id=chat_id, text=chunk, parse_mode="HTML",
                      disable_web_page_preview=True)


HELP = (
    "OpenInsider küme alım botu\n"
    "/kume [n] — en yüksek puanlı n küme alımı (varsayılan 10)\n"
    "/kontrol TICKER — hissenin son alımları ve rutin alıcılar"
)


def handle(tg: Telegram, chat_id, text: str):
    parts = text.strip().split()
    cmd = parts[0].split("@")[0].lower() if parts else ""
    if cmd in ("/start", "/help", "/yardim"):
        tg.send(chat_id, HELP)
    elif cmd == "/kume":
        n = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 10
        tg.send(chat_id, "Taranıyor, biraz sürebilir…")
        pairs = assess_all(scraper.fetch_cluster_buys())[:n]
        tg.send(chat_id, "\n\n".join(format_alert(r, a) for r, a in pairs) or "Kayıt yok.")
    elif cmd == "/kontrol" and len(parts) > 1:
        ticker = parts[1].upper()
        hist = scraper.fetch_purchase_history(ticker)
        if not hist:
            tg.send(chat_id, f"{html.escape(ticker)} için alım kaydı yok.")
            return
        last = hist[0]["trade_date"]
        names = scoring.cluster_insiders({"trade_date": last}, hist)
        rows = [
            f"• {html.escape(n)} — {'RUTİN' if scoring.is_routine(n, last, hist) else 'fırsatçı'}"
            for n in names
        ]
        tg.send(chat_id, f"<b>{html.escape(ticker)}</b>: {len(hist)} alım kaydı, son işlem {last}\n"
                         + "\n".join(rows))
    else:
        tg.send(chat_id, HELP)


def load_seen(path: Path) -> set[str]:
    try:
        return set(json.loads(path.read_text()))
    except (OSError, ValueError):
        return set()


def scan_and_push(tg: Telegram, chat_id, seen: set[str], seen_file: Path, min_score: int):
    pairs = assess_all(scraper.fetch_cluster_buys())
    for rec, a in pairs:
        key = f"{rec['ticker']}|{rec.get('filing_date')}"
        if key in seen:
            continue
        seen.add(key)
        if a.score >= min_score:
            tg.send(chat_id, format_alert(rec, a))
    seen_file.write_text(json.dumps(sorted(seen)))


def run_bot():
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        sys.exit("TELEGRAM_BOT_TOKEN ortam değişkeni gerekli.")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    scan_every = int(os.environ.get("SCAN_MINUTES", "60")) * 60
    min_score = int(os.environ.get("MIN_SCORE", "40"))
    seen_file = Path(os.environ.get("SEEN_FILE", "seen.json"))
    seen = load_seen(seen_file)

    tg = Telegram(token)
    me = tg.call("getMe")
    log.info("Bot başladı: @%s", me.get("username"))

    offset = None
    next_scan = time.time() if chat_id else float("inf")
    while True:
        if time.time() >= next_scan:
            try:
                scan_and_push(tg, chat_id, seen, seen_file, min_score)
            except Exception:
                log.exception("Otomatik tarama başarısız")
            next_scan = time.time() + scan_every
        try:
            updates = tg.call("getUpdates", offset=offset, timeout=30)
        except requests.RequestException as e:
            log.warning("getUpdates hatası: %s", e)
            time.sleep(5)
            continue
        for u in updates:
            offset = u["update_id"] + 1
            msg = u.get("message") or {}
            if "text" in msg:
                try:
                    handle(tg, msg["chat"]["id"], msg["text"])
                except Exception:
                    log.exception("Komut işlenemedi: %s", msg["text"])


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    p = argparse.ArgumentParser()
    p.add_argument("--summary", action="store_true", help="konsola özet tablo bas ve çık")
    args = p.parse_args()
    if args.summary:
        print(format_summary(assess_all(scraper.fetch_cluster_buys())))
    else:
        run_bot()


if __name__ == "__main__":
    main()
