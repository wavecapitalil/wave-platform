#!/usr/bin/env python3
"""Build the Uber tracker bundle from checked-in CSV/JSON. Null stays null."""

from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "apps" / "terminal" / "public" / "data" / "uber-tracker"
SEC_URL = "https://www.sec.gov/Archives/edgar/data/1543151/000154315126000039/uberq326earningspressrelea.htm"
FLAT_BAND_PCT = 3.0
CONSENSUS_BAND_PP = 2.0

SEC_LABELS = {
    "Trips_millions": {"he": "נסיעות", "en": "Trips", "unit": "million trips", "headline_note_he": "הכותרת בדוח מעגלת 4,061 מיליון ל-4.1 מיליארד.", "headline_note_en": "The exhibit headline rounds 4,061 million to 4.1 billion."},
    "Gross_Bookings_USD_m": {"he": "הזמנות ברוטו", "en": "Gross Bookings", "unit": "USD million", "headline_note_he": "הכותרת בדוח מעגלת 59,819 מיליון דולר ל-59.8 מיליארד.", "headline_note_en": "The exhibit headline rounds $59,819 million to $59.8 billion."},
    "Mobility_GB_USD_m": {"he": "הזמנות ברוטו Mobility", "en": "Mobility Gross Bookings", "unit": "USD million", "headline_note_he": "", "headline_note_en": ""},
    "Delivery_GB_USD_m": {"he": "הזמנות ברוטו Delivery", "en": "Delivery Gross Bookings", "unit": "USD million", "headline_note_he": "", "headline_note_en": ""},
    "Revenue_USD_m": {"he": "הכנסות", "en": "Revenue", "unit": "USD million", "headline_note_he": "", "headline_note_en": ""},
    "MAPCs_m": {"he": "צרכנים פעילים חודשית", "en": "MAPCs", "unit": "million consumers", "headline_note_he": "", "headline_note_en": ""},
    "NonGAAP_EPS": {"he": "רווח למניה Non-GAAP", "en": "Non-GAAP EPS", "unit": "USD", "headline_note_he": "", "headline_note_en": ""},
}


def read_csv(name: str) -> list[dict]:
    with (DATA / name).open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def blank(value: str | None):
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def num(value: str | None):
    text = blank(value)
    if text is None:
        return None
    return float(text) if "." in text else int(text)


def pct_change(latest, prior):
    if latest is None or prior in (None, 0):
        return None
    return (latest - prior) / prior * 100


def direction(change):
    if change is None:
        return "unobserved"
    if change > FLAT_BAND_PCT:
        return "improving"
    if change < -FLAT_BAND_PCT:
        return "deteriorating"
    return "stable"


def basket_index(components: list):
    """Sum a fixed basket only when every component was observed. Null is not zero."""
    if not components or any(item is None for item in components):
        return None
    return round(sum(components), 2)


def promo_share(on_promo, restaurants):
    if on_promo is None or restaurants in (None, 0):
        return None
    return round(on_promo / restaurants * 100, 1)


def consensus_score(panel_yoy, consensus_yoy):
    if panel_yoy is None or consensus_yoy is None:
        return "unscored"
    gap = panel_yoy - consensus_yoy
    if gap > CONSENSUS_BAND_PP:
        return "hot"
    if gap < -CONSENSUS_BAND_PP:
        return "cold"
    return "in-line"


def empty_chart(chart_id, title_he, title_en, shows_he, shows_en, not_he, not_en, unit):
    return {
        "id": chart_id,
        "title_he": title_he,
        "title_en": title_en,
        "shows_he": shows_he,
        "shows_en": shows_en,
        "does_not_show_he": not_he,
        "does_not_show_en": not_en,
        "unit": unit,
        "kind": "unobserved",
        "points": [],
    }


def load_fetch_log() -> list[dict]:
    path = DATA / "fetch_log.jsonl"
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def inference(nyc, lax):
    first, last = nyc[0], nyc[-1]
    may = next(row for row in nyc if row["month"] == "2026-05")
    aug = next(row for row in lax if row["month"] == "2026-09")
    jun = next(row for row in lax if row["month"] == "2026-06")
    nyc_full = pct_change(last["uber_trips_per_day"], first["uber_trips_per_day"])
    nyc_recent = pct_change(last["uber_trips_per_day"], may["uber_trips_per_day"])
    components = [
        {"id": "nyc_uber_daily_full_window", "change_pct": round(nyc_full, 2), "read": direction(nyc_full),
         "detail": f"{first['month']} to {last['month']}"},
        {"id": "nyc_uber_daily_may_to_aug", "change_pct": round(nyc_recent, 2), "read": direction(nyc_recent),
         "detail": "2026-05 to 2026-08, not seasonally adjusted"},
        {"id": "lax_tnc_latest_month_yoy", "change_pct": aug["yoy_pct"], "read": direction(aug["yoy_pct"]),
         "detail": aug["month"]},
        {"id": "lax_tnc_ytd_yoy", "change_pct": aug["ytd_yoy_pct"], "read": direction(aug["ytd_yoy_pct"]),
         "detail": f"year to {aug['month']}"},
        {"id": "lax_tnc_june_yoy", "change_pct": jun["yoy_pct"], "read": direction(jun["yoy_pct"]),
         "detail": jun["month"]},
    ]
    reads = {row["read"] for row in components}
    # Disagreement across the public volume proxies, with the quote panel still empty, is a stable read.
    # An empty quote is not scored as zero.
    label = "stable" if reads != {"improving"} and reads != {"deteriorating"} else next(iter(reads))
    if label == "improving" and "deteriorating" in reads:
        label = "stable"
    share_first = first["uber_share_pct"]
    share_last = last["uber_share_pct"]
    line_he = (
        f"יציב — נפח יומי של Uber בניו יורק {nyc_full:+.1f}% מ-{first['month']} ל-{last['month']} "
        f"(מ-2026-05 עד 2026-08 {nyc_recent:+.1f}%, בלי התאמה עונתית), "
        f"נתח Uber מול Lyft {share_last}% אחרי {share_first}%. "
        f"ב-LAX נפח TNC מתחילת השנה {aug['ytd_yoy_pct']:+.1f}% והחודש האחרון {aug['yoy_pct']:+.1f}%. "
        "סל המחירים, ההמתנה והסא'רג' לא נצפו."
    )
    line_en = (
        f"Stable — NYC Uber daily volume {nyc_full:+.1f}% from {first['month']} to {last['month']} "
        f"(May to August 2026 {nyc_recent:+.1f}%, not seasonally adjusted), "
        f"Uber share versus Lyft {share_last}% after {share_first}%. "
        f"LAX TNC year-to-date {aug['ytd_yoy_pct']:+.1f}% and the latest month {aug['yoy_pct']:+.1f}%. "
        "The fare, wait, and surge basket is unobserved."
    )
    return {
        "label": label,
        "label_he": {"improving": "משתפר", "stable": "יציב", "deteriorating": "נחלש"}[label],
        "label_en": label,
        "kind": "inference",
        "flat_band_pct": FLAT_BAND_PCT,
        "line_he": line_he,
        "line_en": line_en,
        "components": components,
        "excluded": [
            "SEC growth rates are facts about the company print, not inputs to this proxy read.",
            "Driver-guarantee ads are a single date, so they have no direction.",
            "Empty fare, ETA, surge, Eats, and consensus series are unobserved, not zero.",
        ],
        "not_a_recommendation": True,
    }


def build() -> dict:
    routes = read_csv("route_basket.csv")
    nyc_raw = read_csv("nyc_hvfhv_monthly.csv")
    lax_raw = read_csv("lax_tnc_monthly.csv")
    bonuses_raw = read_csv("driver_signup_bonuses.csv")
    sec_raw = read_csv("sec_q3_2026.csv")
    guide = json.loads((DATA / "sec_q4_2026_guide.json").read_text(encoding="utf-8"))
    quotes = read_csv("drive_quotes.csv")
    eats_customer = read_csv("eats_customer.csv")
    eats_basket = read_csv("eats_basket.csv")
    eats_merchant = read_csv("eats_merchant.csv")
    fetches = load_fetch_log()

    nyc = []
    for row in nyc_raw:
        note = blank(row.get("notes")) or ""
        urls = [part.strip() for part in note.split(";") if part.strip().startswith("http")]
        nyc.append({
            "month": row["month"],
            "uber_trips_per_day": num(row["uber_trips_per_day"]),
            "lyft_trips_per_day": num(row["lyft_trips_per_day"]),
            "uber_share_pct": num(row["uber_share_pct"]),
            "uber_month_est": num(row["uber_month_est"]),
            "lyft_month_est": num(row["lyft_month_est"]),
            "hv_total_per_day": num(row["hv_total_per_day"]),
            "kind": "fact",
            "proxy_for": None,
            "source": row["source"],
            "source_pulled": row["source_pulled"],
            "source_urls": urls,
            "timezone": "America/New_York",
        })
    lax = []
    for row in lax_raw:
        lax.append({
            "month": row["month"],
            "tnc_monthly": num(row["tnc_monthly"]),
            "tnc_daily_avg": num(row["tnc_daily_avg"]),
            "yoy_pct": num(row["yoy_pct"]),
            "ytd_tnc": num(row["ytd_tnc"]),
            "ytd_yoy_pct": num(row["ytd_yoy_pct"]),
            "source_url": row["source_url"],
            "collected": row["collected"],
            "kind": "fact",
            "proxy_for": None,
            "timezone": "America/Los_Angeles",
        })
    bonuses = []
    for row in bonuses_raw:
        bonuses.append({
            "city": row["city"],
            "guarantee_usd": num(row["guarantee_usd"]),
            "trips_required": num(row["trips_required"]),
            "window_days": num(row["window_days"]),
            "verified_date": row["verified_date"],
            "source_url": row["source_url"],
            "caveat": row["caveat"],
            "kind": "fact",
            "proxy_for": None,
            "timezone": "Asia/Jerusalem",
        })
    sec = []
    for row in sec_raw:
        labels = SEC_LABELS[row["metric"]]
        sec.append({
            "metric": row["metric"],
            "label_he": labels["he"],
            "label_en": labels["en"],
            "unit": labels["unit"],
            "headline_note_he": labels["headline_note_he"],
            "headline_note_en": labels["headline_note_en"],
            "q3_2025": num(row["q3_2025"]),
            "q3_2026": num(row["q3_2026"]),
            "yoy_pct": num(row["yoy_pct"]),
            "cc_yoy_pct": num(row["cc_yoy_pct"]),
            "kind": "fact",
            "source_url": SEC_URL,
            "source_title": row["source"],
            "printed_at": "2026-11-04",
            "period": "2026-Q3",
        })

    cities = []
    for row in routes:
        if row["city"] not in cities:
            cities.append(row["city"])
    address_plan = []
    for city in cities:
        for role in ("home", "office"):
            address_plan.append({
                "city": city,
                "address_id": f"{city}-{role}",
                "role": role,
                "address_label": None,
                "status": "unobserved",
            })

    last_attempt = fetches[-1] if fetches else None
    generated_at = (last_attempt or {}).get("at")
    bundle = {
        "schema": "wave.uber-tracker.bundle.v1",
        "generated_at": generated_at,
        "timezone": "Asia/Jerusalem",
        "utc_offset_standard": "+02:00",
        "baseline_pull": {
            "collected_on": "2026-11-05",
            "timezone": "Asia/Jerusalem",
            "utc_offset": "+02:00",
            "clock_time_logged": False,
            "note_he": "משיכת הבסיס מתוארכת ל-5 בנובמבר 2026, Asia/Jerusalem (UTC+2). בלוג האיסוף אין שעת שעון.",
            "note_en": "Baseline pull is dated 5 November 2026, Asia/Jerusalem (UTC+2). The collection log has no clock time.",
        },
        "last_attempt": last_attempt,
        "cadence": json.loads((DATA / "schema.json").read_text(encoding="utf-8"))["cadence"],
        "inference": inference(nyc, lax),
        "sec_print": sec,
        "q4_guide": guide,
        "consensus": {
            "mobility": None,
            "delivery": None,
            "band_pp": CONSENSUS_BAND_PP,
            "mobility_score": consensus_score(None, None),
            "delivery_score": consensus_score(None, None),
            "note_he": "אין קונצנזוס מכירות שנצפה, ואין מדד פאנל. לא ניתן ציון hot / in-line / cold. הדפסת ה-SEC אינה מחליפה אף אחד מהם.",
            "note_en": "No observed sell-side consensus and no panel index. hot / in-line / cold is not scored. The SEC print stands in for neither.",
        },
        "route_basket": routes,
        "cities": cities,
        "address_plan": address_plan,
        "dish_basket": {
            "target_per_city": "15-20",
            "dishes_named": 0,
            "points": [basket_index([])],
            "note_he": "סל המנות לא ננעל בשמות ובמחירים. אין מדד עלות, והוא אינו AOV.",
            "note_en": "The dish list is not locked to names or prices. There is no cost index, and it is not AOV.",
        },
        "series": {
            "nyc_hvfhv": {"kind": "fact", "observations": nyc},
            "lax_tnc": {"kind": "fact", "observations": lax},
            "driver_bonuses": {"kind": "fact", "observations": bonuses},
            "drive_quotes": {"kind": "unobserved", "observations": quotes},
            "eats_customer": {"kind": "unobserved", "observations": eats_customer},
            "eats_basket": {"kind": "unobserved", "observations": eats_basket},
            "eats_merchant": {"kind": "unobserved", "observations": eats_merchant},
        },
        "charts": {
            "drive_price_index": empty_chart(
                "drive_price_index", "מדד מחיר לפי עיר", "Price index by city",
                "מחיר מצוטט לאותו מסלול, ובארה\"ב גם מול Lyft, לאורך זמן.",
                "Quoted price on the same route, and versus Lyft in the US, over time.",
                "זה לא מספר נסיעות. מחיר גבוה יכול להיות ביקוש חזק או מעט נהגים.",
                "This is not a trip count. A high price can be strong demand or thin driver supply.",
                "index",
            ),
            "drive_eta": empty_chart(
                "drive_eta", "זמן המתנה לפי עיר", "ETA by city",
                "דקות עד איסוף במסלול הקבוע, באותה שעה מקומית.",
                "Minutes to pickup on the fixed route, at the same local time.",
                "זה לא משך הנסיעה כולה ולא זמן הגעה של Eats.",
                "This is not the full trip duration and not an Eats ETA.",
                "minutes",
            ),
            "drive_surge": empty_chart(
                "drive_surge", "סא'רג' ושיעור אין רכבים", "Surge and no-cars rate",
                "מכפיל או סימון עומס, והאם המסך הראה שאין רכבים.",
                "A multiplier or busy flag, and whether the screen showed no cars.",
                "בלי הקריאה עצמה אי אפשר להסיק מחסור בנהגים.",
                "Without the reading itself this cannot be read as a driver shortage.",
                "share",
            ),
            "drive_tightness": empty_chart(
                "drive_tightness", "דירוג צפיפות מול התקופה הקודמת", "Tightness versus last period",
                "דירוג ערים כשיהיו מחיר, המתנה ואין-רכבים לאותו מסלול ולתקופה קודמת.",
                "A city rank once price, wait, and no-cars exist for the same route and a prior period.",
                "מודעות הבונוס לנהגים אינן הדירוג הזה. אין תקופה קודמת של ציטוטים.",
                "Driver-guarantee ads are not this rank. There is no prior quote period.",
                "rank",
            ),
            "eats_coverage": empty_chart(
                "eats_coverage", "כיסוי מסעדות לפי עיר", "Restaurant coverage by city",
                "מספר מסעדות בכתובת הקבועה לאורך זמן.",
                "Restaurant count at the fixed address over time.",
                "זה לא מספר הזמנות ולא משתמשים פעילים.",
                "This is not an order count and not active users.",
                "restaurants",
            ),
            "eats_eta": empty_chart(
                "eats_eta", "זמן אספקה ממוצע לפי עיר", "Average ETA by city",
                "ETA שמוצג באותה כתובת ובאותו חלון זמן.",
                "The ETA shown at the same address and time window.",
                "זה לא זמן אספקה ממוצע אמיתי של כל ההזמנות בעיר.",
                "This is not the true average delivery time of every order in the city.",
                "minutes",
            ),
            "eats_cost": empty_chart(
                "eats_cost", "מדד עלות הזמנה לפי עיר", "Order-cost index by city",
                "סכום מנות קבועות, משלוח, טיפ מוצע ועמלות. פרוקסי לסל.",
                "Fixed dishes plus delivery, suggested tip, and fees. A basket proxy.",
                "זה לא AOV. רכיב חסר משאיר את המדד ריק ולא אפס.",
                "This is not AOV. A missing component leaves the index empty, not zero.",
                "local currency",
            ),
            "eats_promo": empty_chart(
                "eats_promo", "עוצמת מבצעים", "Promo intensity",
                "חלק המסעדות עם מבצע, ועומק ההנחה שמוצג.",
                "Share of restaurants on promo, and the visible discount depth.",
                "באנר שלא נצפה אינו אפס מבצעים.",
                "An unobserved banner is not zero promotions.",
                "percent",
            ),
            "eats_expansion": empty_chart(
                "eats_expansion", "התרחבות הפאנל", "Panel expansion",
                "כמה ערים פעילות, ומתי עיר חדשה נכנסה.",
                "How many panel cities are active, and when a new city entered.",
                "עיר שמוגדרת בסל אבל בלי קריאה אינה עיר שנכנסה. אין שבועות עד בשלות.",
                "A city listed in the basket without a reading has not entered. Weeks to maturity are unobserved.",
                "cities",
            ),
            "eats_coverage_vs_eta": empty_chart(
                "eats_coverage_vs_eta", "כיסוי מול זמן אספקה", "Coverage versus ETA",
                "שינוי כיסוי מול שינוי ETA באותה כתובת. כיסוי עולה ו-ETA עולה: צמיחה שבירה. כיסוי עולה ו-ETA יציב: אימוץ בריא.",
                "Coverage change versus ETA change at the same address. Coverage up and ETA up: fragile growth. Coverage up and ETA stable: healthy adoption.",
                "אין עיר על הגרף. המיפוי הוא כלל קריאה, לא תוצאה.",
                "No city is plotted. The mapping is a reading rule, not a result.",
                "change",
            ),
        },
    }
    # The basket calculator is exercised so an empty component list cannot become a numeric index.
    if bundle["dish_basket"]["points"] != [None]:
        raise SystemExit("empty basket must stay null")
    bundle["dish_basket"]["points"] = []
    return bundle


def main():
    bundle = build()
    target = DATA / "bundle.json"
    target.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {target} cities={len(bundle['cities'])} routes={len(bundle['route_basket'])} inference={bundle['inference']['label']}")


if __name__ == "__main__":
    main()
