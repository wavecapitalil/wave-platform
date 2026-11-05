"""Catalyst calendar classification and parsing. No network."""

import unittest
from datetime import date, datetime
from zoneinfo import ZoneInfo

from services.catalysts import (
    anchor_date,
    assemble,
    buyback_line,
    classify_reaction,
    confirms_13d_subject,
    dedup,
    material_category,
    parse_earnings_calendar,
    parse_efts,
    parse_fda,
    parse_news,
    parse_sec_filings,
)


def sessions():
    closes = [100, 100, 101, 100, 110, 112, 111, 109]
    dates = ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05", "2024-01-08", "2024-01-09", "2024-01-10", "2024-01-11"]
    return [{"date": date, "close": close} for date, close in zip(dates, closes)]


class ReactionTests(unittest.TestCase):
    def test_rally_uses_prior_close_to_three_sessions_after(self):
        # Event session Jan 3 (index 1). Prior Jan 2 = 100. Three sessions later = Jan 8 = 110.
        result = classify_reaction("2024-01-03", sessions(), "2024-01-11")
        self.assertEqual(result["outcome"], "positive")
        self.assertEqual(result["reaction_pct"], 10.0)
        self.assertEqual(result["session_date"], "2024-01-03")

    def test_drop(self):
        rows = [{"date": f"2024-02-{day:02d}", "close": close} for day, close in enumerate([50, 40, 39, 38, 37, 36], start=1)]
        # Feb 1 is a Thursday in 2024... don't rely on weekdays; the function only needs the date order.
        result = classify_reaction(rows[1]["date"], rows, "2024-02-20")
        self.assertEqual(result["outcome"], "negative")

    def test_flat_inside_one_percent_is_unclassified(self):
        rows = [{"date": f"2024-03-{day:02d}", "close": 100 if day < 5 else 100.4} for day in range(1, 8)]
        result = classify_reaction("2024-03-02", rows, "2024-03-20")
        self.assertEqual(result["outcome"], "flat")
        self.assertLess(abs(result["reaction_pct"]), 1)

    def test_future_source_date_is_upcoming_without_a_reaction(self):
        result = classify_reaction("2024-04-01", sessions(), "2024-01-11", "2024-04-01")
        self.assertEqual(result["outcome"], "upcoming")
        self.assertIsNone(result["reaction_pct"])

    def test_after_close_anchor_is_not_labeled_upcoming(self):
        result = classify_reaction("2024-01-12", sessions(), "2024-01-11", "2024-01-11")
        self.assertEqual(result["outcome"], "pending")
        self.assertIsNone(result["reaction_pct"])

    def test_incomplete_window_is_pending(self):
        result = classify_reaction("2024-01-09", sessions(), "2024-01-11")
        self.assertEqual(result["outcome"], "pending")
        self.assertEqual(result["session_date"], "2024-01-09")

    def test_no_prior_close_is_pending(self):
        result = classify_reaction("2024-01-02", sessions(), "2024-01-11")
        self.assertEqual(result["outcome"], "pending")

    def test_distant_date_is_dropped(self):
        self.assertIsNone(classify_reaction("2020-01-02", sessions(), "2024-01-11"))

    def test_anchor_after_the_close_moves_to_the_next_day(self):
        stamp = datetime(2024, 1, 3, 16, 5, tzinfo=ZoneInfo("America/New_York"))
        self.assertEqual(anchor_date("2024-01-03", stamp, "timestamp"), "2024-01-04")
        morning = datetime(2024, 1, 3, 10, 0, tzinfo=ZoneInfo("America/New_York"))
        self.assertEqual(anchor_date("2024-01-03", morning, "timestamp"), "2024-01-03")
        self.assertEqual(anchor_date("2024-01-03", None, "next_session"), "2024-01-04")
        self.assertEqual(anchor_date("2024-01-03", None, "as_dated"), "2024-01-03")


class ParseTests(unittest.TestCase):
    def test_sec_items_keep_known_codes_and_skip_other_forms(self):
        payload = {"filings": {"recent": {
            "form": ["8-K", "10-K", "8-K", "SC 13D"],
            "filingDate": ["2024-01-03", "2024-01-04", "2024-01-05", "2024-01-05"],
            "acceptanceDateTime": ["2024-01-03T21:05:00Z", "", "", ""],
            "accessionNumber": ["0000320193-24-000001", "0000320193-24-000002", "0000320193-24-000003", "0000320193-24-000004"],
            "primaryDocument": ["earn.htm", "annual.htm", "officer.htm", "13d.htm"],
            "items": ["2.02,9.01", "", "5.02", ""],
        }}}
        rows = parse_sec_filings(payload, "0000320193", "AAPL", "2024-06-01")
        self.assertEqual([row["type"] for row in rows], ["earnings", "governance"])
        self.assertEqual(rows[1]["line"], "Item 5.02 officer, director or compensation disclosure")
        self.assertTrue(rows[0]["url"].startswith("https://www.sec.gov/Archives/edgar/data/320193/"))
        self.assertNotIn("CEO", rows[1]["line"])

    def test_buyback_and_13d_require_real_hit_fields(self):
        payload = {"hits": {"hits": [
            {"_source": {"form": "8-K", "file_date": "2024-05-02", "adsh": "0000320193-24-000069", "ciks": ["0000320193"]}},
            {"_source": {"form": "10-K", "file_date": "2024-05-03", "adsh": "0000320193-24-000070", "ciks": ["0000320193"]}},
            {"_source": {"form": "SC 13D", "file_date": "not-a-date", "adsh": "0000000000-24-000001", "ciks": ["0000000001"]}},
        ]}}
        buybacks = parse_efts(payload, "buyback", "AAPL", "0000320193")
        self.assertEqual(len(buybacks), 1)
        self.assertEqual(buybacks[0]["type"], "buyback")
        self.assertNotIn("$", buybacks[0]["line"])
        activists = parse_efts({"hits": {"hits": [{
            "_source": {
                "form": "SC 13D",
                "file_date": "2024-06-01",
                "adsh": "0001067983-24-000001",
                "ciks": ["0001067983"],
                "display_names": ["Berkshire Hathaway Inc  (CIK 0001067983)"],
            }
        }]}}, "activist", "AAPL")
        self.assertEqual(activists[0]["line"], "Schedule 13D — Berkshire Hathaway Inc")

    def test_news_without_a_date_or_category_is_dropped(self):
        rows = parse_news([
            {"title": "Apple reports quarterly results", "link": "https://news.example.com/a", "providerPublishTime": 1700000000},
            {"title": "Apple reports quarterly results", "link": "https://news.example.com/b"},
            {"title": "Analysts discuss the chart", "link": "https://news.example.com/c", "providerPublishTime": 1700000000},
            {"content": {"title": "Company to present at a conference", "canonicalUrl": {"url": "https://news.example.com/d"}, "pubDate": "2024-01-03T15:00:00Z"}},
        ], "AAPL", "2024-06-01")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["type"], "earnings")
        self.assertTrue(rows[0]["line"].startswith("Apple reports"))

    def test_earnings_range_is_not_turned_into_a_date(self):
        self.assertEqual(parse_earnings_calendar({"Earnings Date": ["2024-04-30", "2024-05-02"]}, "AAPL", "2024-04-01"), [])
        rows = parse_earnings_calendar({"Earnings Date": ["2024-05-02"]}, "AAPL", "2024-04-01")
        self.assertEqual(rows[0]["date"], "2024-05-02")
        self.assertEqual(rows[0]["line"], "Earnings date")
        dated = parse_earnings_calendar({"Earnings Date": [date(2024, 5, 2)]}, "AAPL", "2024-04-01")
        self.assertEqual(dated[0]["date"], "2024-05-02")

    def test_fda_keeps_dated_statuses_only(self):
        payload = {"results": [{"application_number": "NDA123456", "openfda": {"brand_name": ["Examplexa"]}, "submissions": [
            {"submission_status_date": "20240315", "submission_status": "AP"},
            {"submission_status_date": "20240316", "submission_status": "XX"},
            {"submission_status": "AP"},
        ]}]}
        rows = parse_fda(payload, "PFE")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["line"], "FDA Approval · Examplexa")
        self.assertIn("ApplNo=123456", rows[0]["url"])

    def test_13d_requires_the_issuer_on_the_cover(self):
        apple = "Name of Issuer Apple Inc. Common stock"
        lookalike = "Name of Issuer Apple Hospitality REIT, Inc. The filing also cites Apple Inc. products."
        unrelated = "Name of Issuer Mirion Technologies, Inc. Reference to Apple Inc. appears in a footnote."
        self.assertTrue(confirms_13d_subject(apple, "Apple Inc.", "AAPL"))
        self.assertFalse(confirms_13d_subject(lookalike, "Apple Inc.", "AAPL"))
        self.assertFalse(confirms_13d_subject(unrelated, "Apple Inc.", "AAPL"))

    def test_buyback_line_uses_only_an_authorization_in_the_text(self):
        text = "The board of directors has also authorized an additional program to repurchase up to $100 billion of common stock."
        self.assertEqual(buyback_line(text), "Share repurchase authorization of $100 billion")
        self.assertIsNone(buyback_line("The company repurchased shares during the quarter."))

    def test_headline_category(self):
        self.assertEqual(material_category("Board appoints a new chief executive"), "leadership")
        self.assertIsNone(material_category("Management will report earnings on Thursday"))


class AssembleTests(unittest.TestCase):
    def test_empty_events_do_not_invent_catalysts(self):
        payload = assemble("AAPL", "2024-01-11", sessions(), "USD", [], [{"name": "SEC EDGAR submissions", "status": "empty", "rows": 0}])
        self.assertEqual(payload["catalysts"], [])
        self.assertGreaterEqual(len(payload["points"]), 2)
        self.assertIn("Reaction window", payload["methodology"])

    def test_dots_follow_the_classified_outcome(self):
        events = [
            {"id": "e1", "date": "2024-01-03", "anchor": "2024-01-03", "type": "earnings", "line": "Quarterly results disclosure", "url": "https://www.sec.gov/a", "source": "SEC EDGAR", "origin": "sec"},
            {"id": "e2", "date": "2024-02-01", "anchor": "2024-02-01", "type": "earnings", "line": "Earnings date", "url": None, "source": "Yahoo Finance", "origin": "earnings"},
            {"id": "bad", "date": "2024-01-04", "anchor": "2024-01-04", "type": "news", "line": "", "url": "https://news.example.com/x", "source": "Yahoo Finance", "origin": "news"},
        ]
        payload = assemble("AAPL", "2024-01-11", sessions(), "USD", events, [])
        by_id = {row["id"]: row for row in payload["catalysts"]}
        self.assertEqual(set(by_id), {"e1", "e2"})
        self.assertEqual(by_id["e1"]["outcome"], "positive")
        self.assertEqual(by_id["e2"]["outcome"], "upcoming")
        self.assertIsNone(by_id["e2"]["reaction_pct"])
        self.assertEqual(payload["points"][by_id["e1"]["plot_index"]]["date"], "2024-01-03")
        self.assertEqual(payload["points"][by_id["e2"]["plot_index"]]["date"], "2024-02-01")
        self.assertIsNone(payload["points"][by_id["e2"]["plot_index"]]["close"])
        self.assertEqual(by_id["e2"]["plot_close"], sessions()[-1]["close"])

    def test_nearby_earnings_prefer_the_filing(self):
        rows = dedup([
            {"date": "2024-01-04", "type": "earnings", "origin": "earnings", "url": None, "line": "Earnings date"},
            {"date": "2024-01-03", "type": "earnings", "origin": "sec", "url": "https://www.sec.gov/a", "line": "Quarterly results disclosure"},
        ])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["origin"], "sec")


if __name__ == "__main__":
    unittest.main()
