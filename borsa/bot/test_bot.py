"""Çevrimdışı testler. Çalıştırma: python test_bot.py

Fikstürler openinsider.com'un canlı HTML'inden (Eylül 2026) kısaltılmıştır.
"""

import unittest
from datetime import date
from unittest import mock

import bot
import scoring
import scraper

TIP = (
    "onmouseover=\"Tip('<img src=\\'https://www.profitspi.com/stock/stock-charts.ashx?chart={t}\\' "
    "width=\\'360px\\'>', DELAY, 1)\" onmouseout=\"UnTip()\""
)

CLUSTER_HTML = f"""<html><body>
<table width="100%" class="tinytable"><thead><tr>
<th width="31"><h3>X</h3></th><th><h3>Filing&nbsp;Date</h3></th><th><h3>Trade&nbsp;Date</h3></th>
<th><h3>Ticker</h3></th><th><h3>Company&nbsp;Name</h3></th><th><h3>Industry</h3></th><th><h3>Ins</h3></th>
<th><h3>Trade&nbsp;Type&nbsp;&nbsp;</h3></th><th><h3>Price</h3></th><th><h3>Qty</h3></th><th><h3>Owned</h3></th>
<th><h3>&Delta;Own</h3></th><th><h3>Value</h3></th><th><h3>1d</h3></th><th><h3>1w</h3></th>
<th><h3>1m</h3></th><th><h3>6m</h3></th></tr></thead><tbody>
<tr style="background:#edffed"><td align=right>M</td><td align=right><div><a href="/RWAY">2026-09-22 20:10:27</a></div></td><td align=right><div>2026-09-21</div></td><td><b> <a href="/RWAY" {TIP.format(t="RWAY")}>RWAY</a></b></td><td><a href="/RWAY">Runway Growth Finance Corp.</a></td><td><a href="/industry/x">Closed-End Funds</a></td><td>3</td><td>P - Purchase</td><td align=right>$6.77</td><td align=right>+25,000</td><td align=right>29,840</td><td align=right>+517%</td><td align=right>+$169,183</td><td align=right></td><td align=right></td><td align=right></td><td align=right></td></tr>
<tr style="background:#dfffdf"><td align=right></td><td align=right><div><a href="/BBD">2026-09-22 11:23:05</a></div></td><td align=right><div>2026-09-18</div></td><td><b> <a href="/BBD" {TIP.format(t="BBD")}>BBD</a></b></td><td><a href="/BBD">Bank Bradesco</a></td><td><a href="/industry/y">State Commercial Banks</a></td><td>21</td><td>P - Purchase</td><td align=right>$17.99</td><td align=right>+1,609,508</td><td align=right>12,279,580</td><td align=right>+15%</td><td align=right>+$28,952,210</td><td align=right>-1%</td><td align=right></td><td align=right></td><td align=right></td></tr>
</tbody></table></body></html>"""

SCREENER_HEAD = """<table class="tinytable"><thead><tr>
<th><h3>X</h3></th><th><h3>Filing&nbsp;Date</h3></th><th><h3>Trade&nbsp;Date</h3></th><th><h3>Ticker</h3></th>
<th><h3>Insider&nbsp;Name</h3></th><th><h3>Title</h3></th><th><h3>Trade&nbsp;Type&nbsp;&nbsp;</h3></th>
<th><h3>Price</h3></th><th><h3>Qty</h3></th><th><h3>Owned</h3></th><th><h3>&Delta;Own</h3></th>
<th><h3>Value</h3></th><th><h3>1d</h3></th><th><h3>1w</h3></th><th><h3>1m</h3></th><th><h3>6m</h3></th>
</tr></thead><tbody>"""


def screener_row(name, trade_date, trade_type="P - Purchase", d_own="+22%"):
    return (
        f'<tr style="background:#e9ffe9"><td align=right></td><td align=right><div>'
        f'<a href="http://www.sec.gov/x.xml" title="SEC Form 4">{trade_date} 11:23:05</a></div></td>'
        f"<td align=right><div>{trade_date}</div></td>"
        f'<td><b> <a href="/BBD" {TIP.format(t="BBD")}>BBD</a></b></td>'
        f'<td><a href="/insider/x/1" title="31,266 direct shares\nOsasco">{name}</a></td><td>Dir</td>'
        f"<td>{trade_type}</td><td align=right>$17.98</td><td align=right>+31,266</td>"
        f"<td align=right>31,266</td><td align=right>{d_own}</td><td align=right>+$562,163</td>"
        f"<td align=right></td><td align=right></td><td align=right></td><td align=right></td></tr>"
    )


def screener_html(rows):
    return f"<html><body>{SCREENER_HEAD}{''.join(rows)}</tbody></table></body></html>"


class ParseTableTest(unittest.TestCase):
    def test_cluster_page(self):
        recs = scraper.parse_table(CLUSTER_HTML)
        self.assertEqual([r["ticker"] for r in recs], ["RWAY", "BBD"])
        bbd = recs[1]
        self.assertEqual(bbd["company"], "Bank Bradesco")
        self.assertEqual(bbd["insiders"], 21)
        self.assertEqual(bbd["price"], 17.99)
        self.assertEqual(bbd["qty"], 1_609_508)
        self.assertEqual(bbd["value"], 28_952_210)
        self.assertEqual(bbd["delta_own"], 15)
        self.assertEqual(bbd["ret_1d"], -1)
        self.assertIsNone(bbd["ret_1w"])
        self.assertEqual(bbd["trade_date"], date(2026, 9, 18))
        self.assertEqual(bbd["filing_date"], date(2026, 9, 22))
        self.assertEqual(recs[0]["flags"], "M")

    def test_screener_page_uses_its_own_columns(self):
        recs = scraper.parse_table(screener_html([screener_row("Caffarelli Paulo", "2026-09-18", d_own="New")]))
        self.assertEqual(recs[0]["insider"], "Caffarelli Paulo")
        self.assertEqual(recs[0]["title"], "Dir")
        self.assertEqual(recs[0]["delta_own"], float("inf"))
        self.assertNotIn("company", recs[0])

    def test_no_table_returns_empty(self):
        self.assertEqual(scraper.parse_table("<html><body>No results</body></html>"), [])

    def test_unexpected_headers_raise(self):
        with self.assertRaises(ValueError):
            scraper.parse_table('<table class="tinytable"><tr><th>Foo</th></tr></table>')

    def test_number_parsing(self):
        self.assertEqual(scraper.parse_number("+$1,317,500"), 1_317_500)
        self.assertEqual(scraper.parse_number("-1,200"), -1200)
        self.assertIsNone(scraper.parse_number(""))
        self.assertEqual(scraper.parse_percent(">999%"), 999)


class FetchTest(unittest.TestCase):
    def test_screener_url_requests_full_purchase_history(self):
        # fd=0 olmadan screener yalnızca son günleri döndürür.
        url = scraper.SCREENER_URL.format(ticker="BBD")
        self.assertIn("s=BBD", url)
        self.assertIn("xp=1", url)
        self.assertIn("fd=0", url)

    def test_fetch_purchase_history_filters_non_purchases(self):
        page = screener_html([
            screener_row("A", "2026-09-18"),
            screener_row("B", "2026-09-17", trade_type="S - Sale"),
        ])
        with mock.patch.object(scraper, "_get", return_value=page) as get:
            hist = scraper.fetch_purchase_history("bbd")
        self.assertIn("s=BBD", get.call_args[0][0])
        self.assertEqual([h["insider"] for h in hist], ["A"])

    def test_fetch_cluster_buys(self):
        with mock.patch.object(scraper, "_get", return_value=CLUSTER_HTML):
            self.assertEqual(len(scraper.fetch_cluster_buys()), 2)


def hist(name, *dates):
    return [{"insider": name, "trade_date": date.fromisoformat(d)} for d in dates]


class ScoringTest(unittest.TestCase):
    TODAY = date(2026, 9, 23)

    def rec(self, **kw):
        base = dict(ticker="X", insiders=3, value=2e6, delta_own=25.0, price=10.0,
                    trade_date=date(2026, 9, 18))
        base.update(kw)
        return base

    def test_is_routine(self):
        h = hist("A", "2023-09-02", "2024-09-10", "2025-09-15")
        self.assertTrue(scoring.is_routine("A", date(2026, 9, 18), h))
        self.assertFalse(scoring.is_routine("A", date(2026, 10, 1), h))
        self.assertFalse(scoring.is_routine("A", date(2026, 9, 18), h[1:]))

    def test_base_score_without_history(self):
        a = scoring.assess(self.rec(), today=self.TODAY)
        # 3 kişi +20, ≥$1M +15, +%25 +15, 5 gün +10
        self.assertEqual(a.score, 60)
        self.assertEqual(a.grade, "A")

    def test_all_routine_penalised(self):
        h = hist("A", "2026-09-18", "2023-09-01", "2024-09-01", "2025-09-01")
        a = scoring.assess(self.rec(), h, today=self.TODAY)
        self.assertEqual(a.routine_insiders, ["A"])
        self.assertEqual(a.score, 35)

    def test_partial_routine_and_opportunistic(self):
        h = hist("A", "2026-09-18", "2023-09-01", "2024-09-01", "2025-09-01") + hist("B", "2026-09-15")
        self.assertEqual(scoring.assess(self.rec(), h, today=self.TODAY).score, 50)
        self.assertEqual(scoring.assess(self.rec(), hist("B", "2026-09-15"), today=self.TODAY).score, 65)

    def test_is_routine_frequent_monthly_buyer(self):
        h = hist("A", "2026-04-05", "2026-05-05", "2026-06-05", "2026-07-05")
        self.assertTrue(scoring.is_routine("A", date(2026, 8, 18), h))
        self.assertFalse(scoring.is_routine("A", date(2026, 8, 18), h[1:]))
        # Yıl dönümünü aşan pencere: Eyl-Ara 2025 -> Ocak 2026 işlemi
        h = hist("B", "2025-09-05", "2025-10-05", "2025-11-05", "2025-12-05")
        self.assertTrue(scoring.is_routine("B", date(2026, 1, 10), h))

    def test_cluster_members_include_trades_until_filing(self):
        # Küme sayfasındaki işlem tarihi ilk işlemdir; sonraki alımlar da kümeye dahil.
        rec = self.rec(trade_date=date(2026, 8, 7), filing_date=date(2026, 8, 12))
        h = hist("A", "2026-08-07") + hist("B", "2026-08-10") + hist("LATE", "2026-08-20")
        self.assertEqual(scoring.cluster_insiders(rec, h), ["A", "B"])

    def test_old_trades_outside_window_not_in_cluster(self):
        h = hist("A", "2026-09-18") + hist("OLD", "2026-01-01")
        self.assertEqual(scoring.cluster_insiders(self.rec(), h), ["A"])

    def test_penny_and_clamp(self):
        a = scoring.assess(self.rec(insiders=1, value=0, delta_own=None, price=0.5,
                                    trade_date=date(2026, 1, 1)), today=self.TODAY)
        self.assertEqual(a.score, 0)
        self.assertEqual(a.grade, "D")


class BotTest(unittest.TestCase):
    def test_assess_all_caches_history_and_sorts(self):
        recs = scraper.parse_table(CLUSTER_HTML) + scraper.parse_table(CLUSTER_HTML)[1:]
        with mock.patch.object(scraper, "fetch_purchase_history", return_value=[]) as f:
            pairs = bot.assess_all(recs, session=mock.Mock(), delay=0)
        self.assertEqual(f.call_count, 2)
        scores = [a.score for _, a in pairs]
        self.assertEqual(scores, sorted(scores, reverse=True))
        self.assertIn("BBD", bot.format_summary(pairs))

    def test_alert_escapes_html(self):
        rec = dict(ticker="X", company="A&B <Corp>", insiders=2, value=1, price=1,
                   trade_date=None, filing_date=None)
        text = bot.format_alert(rec, scoring.assess(rec))
        self.assertIn("A&amp;B &lt;Corp&gt;", text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
