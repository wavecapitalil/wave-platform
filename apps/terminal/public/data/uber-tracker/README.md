# UBER TRACKER — collection notes

These notes used to appear on the tracker page. The page now shows the figures, the reported period, a short fact or inference badge, and a plain methodology. The details below stay here so the collection record is not lost. They are not product copy.

The workflow schedule is unchanged: public checks at 08:00, 12:00, 17:30 and 23:00 Asia/Jerusalem standard time (UTC+2), plus an Eats basket window on Monday at 09:00. During Israel summer time (UTC+3) the same UTC cron runs one hour earlier on the Jerusalem clock. The job polls public URLs. It does not log into Uber, Lyft or Eats, and a failed fetch is not a new observation. This is a scheduled poll, not a price tick.

## Baseline

The checked-in baseline was collected on 2026-11-05, Asia/Jerusalem (UTC+2). The collection log has a date and no clock time. The sentence that used to open the page was: "משיכת בסיס: 2026-11-05 Asia/Jerusalem (UTC+2). שעת השעון לא נרשמה."

A later public check is recorded in `fetch_log.jsonl`. The page used to print the ISO timestamp, the timezone, how many new observations were written, and how many sources answered (for example 15/16). A source that does not answer is left as the previous row. It is not filled with zero.

## How the stored numbers are built

NYC monthly totals are the raw counts from each month's TLC parquet (`hvfhs_license_num` HV0003 for Uber, HV0005 for Lyft), for September 2025 through September 2026. September 2026 is Uber 15,412,555 and Lyft 5,575,126, counted from `fhvhv_tripdata_2026-09.parquet`. The daily average on the page is that raw total divided by the number of days in the month. It is not a rounded daily figure multiplied back by 30. Uber share is Uber divided by Uber plus Lyft. Year-over-year compares daily averages with the same month a year earlier. September 2025 has no prior September in this file, so its year-over-year cell stays empty. An empty cell is unobserved. It is not stored or plotted as zero.

The September 2026 count was taken at 2026-11-06T10:57:46+02:00, Asia/Jerusalem. The same `collected_at` stamp is on the other NYC rows in `nyc_hvfhv_monthly.csv`. The monthly TLC file usually arrives two to three months after the month ends.

LAX rows are the columns printed in the LAWA ground-transport reports. Only the months that were in the baseline are stored. Missing months are not interpolated. The series is airport TNC trips, not Uber alone and not citywide Los Angeles. June 2025 has no year-over-year pair in the file, so those cells stay empty.

Driver-guarantee ads are one public snapshot verified on 5 November 2026 from an independent referral site. They are not driver counts, not earnings per trip, and not a tightness rank. There is no prior period.

Q3 2026 figures are the Exhibit 99.1 table, filed 4 November 2026. The exhibit headline rounds some figures (trips to 4.1 billion, gross bookings to $59.8 billion). The page shows the table values. Constant-currency growth is the column the company printed. The Q4 range, $63.25–65.25 billion and +18–22% constant currency, is the company outlook, not a sell-side consensus. The filing assumes about a 1 percentage-point currency headwind to reported growth.

## Proxy read

The overall label is an inference from the public volume proxies only. Each component is improving above +3%, deteriorating below −3%, and stable inside that band. The label is stable unless every scored component agrees. The scored components are the NYC Uber daily change across the full window, the NYC change since May 2026 (not seasonally adjusted), the latest LAX month year-over-year, the LAX year-to-date change, and the June 2026 LAX year-over-year. SEC growth rates are facts about the print and are not inputs. The driver ads are a single date, so they have no direction. Empty fare, wait, surge, Eats and consensus series are unobserved, not zero.

A high quoted price can be strong demand or thin driver supply. Separating them needs the wait and a no-cars flag. The basket is 46 routes in 15 cities. No quote has been recorded.

Coverage up with ETAs up would be read as fragile growth. Coverage up with stable ETAs would be read as healthy adoption. No city is plotted.

Consensus is hot when a panel index is more than 2 percentage points above an observed consensus, in line within 2 points, and cold more than 2 points below. If either input is missing, the score is unscored. The SEC print does not stand in for the panel or the consensus.

The dish basket sums fixed dishes, delivery, suggested tip and fees only when every component is present. A missing component leaves the index empty. It is a basket proxy, not AOV. Promo share is restaurants on promo divided by restaurants observed, and only when both counts exist.

## Files

`schema.json` describes one reading: timestamp, timezone, city, product, value, source URL, and fact versus inference. `bundle.json` is what the page loads. History is in `route_basket.csv`, `nyc_hvfhv_monthly.csv`, `lax_tnc_monthly.csv`, `driver_signup_bonuses.csv` and `sec_q3_2026.csv`, with the Q4 outlook in `sec_q4_2026_guide.json`. `drive_quotes.csv`, `eats_customer.csv`, `eats_basket.csv` and `eats_merchant.csv` are headers only. `fetch_log.jsonl` is the public-check log. `collection_log_2026-11-05.md` is the original collection note.

In-app fares, ETAs, restaurant coverage, promos and the dish basket need a signed-in session. This job does not log in, and it does not invent a row.
