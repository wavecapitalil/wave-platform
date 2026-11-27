import assert from "node:assert/strict";
import test from "node:test";
import {
  inSession,
  lastCloseMs,
  needsRefresh,
  sessionMove,
  zonedTime,
} from "../supabase/functions/wave-data/sector-pulse.ts";

function ts(year, month, day, hour, minute) {
  return Math.floor(zonedTime(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    hour * 60 + minute,
  ) / 1000);
}

test("16:00 ET is 21:00 UTC in November", () => {
  assert.equal(new Date(zonedTime("2026-11-27", 16 * 60)).toISOString(), "2026-11-27T21:00:00.000Z");
  assert.equal(new Date(zonedTime("2026-11-27", 9 * 60 + 30)).toISOString(), "2026-11-27T14:30:00.000Z");
});

test("open session uses the prior completed close", () => {
  const move = sessionMove(
    {regularMarketPrice: 157.31, regularMarketTime: ts(2026, 11, 27, 9, 35), previousClose: 155.82},
    [ts(2026, 11, 24, 9, 30), ts(2026, 11, 25, 9, 30), ts(2026, 11, 27, 9, 30)],
    [160.69, 155.79, 157.1],
  );
  assert.equal(move.session, "2026-11-27");
  assert.equal(move.previous_session, "2026-11-25");
  assert.equal(move.previous_close, 155.79);
  assert.equal(move.price, 157.31);
  assert.equal(move.pct, Math.round((157.31 - 155.79) / 155.79 * 100 * 10000) / 10000);
});

test("same-day bar is not the baseline", () => {
  const move = sessionMove(
    {regularMarketPrice: 157.31, regularMarketTime: ts(2026, 11, 27, 9, 40), previousClose: 155.79},
    [ts(2026, 11, 27, 9, 30)],
    [157.31],
  );
  assert.equal(move.previous_close, 155.79);
  assert.notEqual(move.pct, 0);
});

test("cash session refreshes after 30 minutes", () => {
  const now = new Date("2026-11-27T14:40:00Z");
  assert.equal(inSession(now), true);
  assert.equal(needsRefresh("2026-11-27T14:20:00Z", now), false);
  assert.equal(needsRefresh("2026-11-27T14:09:00Z", now), true);
  assert.equal(needsRefresh("2026-11-27T08:09:00Z", now), true);
});

test("outside the session a close already captured is kept", () => {
  const saturday = new Date("2026-11-28T15:00:00Z");
  assert.equal(inSession(saturday), false);
  assert.equal(needsRefresh("2026-11-27T21:10:00Z", saturday), false);
  assert.equal(needsRefresh("2026-11-27T20:00:00Z", saturday), true);
});

test("Thanksgiving does not count as a session", () => {
  const thursday = new Date("2026-11-26T15:00:00Z");
  assert.equal(inSession(thursday), false);
  assert.equal(needsRefresh("2026-11-25T21:10:00Z", thursday), false);
});

test("Friday before the open keeps the prior close", () => {
  const early = new Date("2026-11-27T13:00:00Z");
  assert.equal(inSession(early), false);
  assert.equal(new Date(lastCloseMs(early)).toISOString(), "2026-11-25T21:00:00.000Z");
  assert.equal(needsRefresh("2026-11-27T08:09:00Z", early), false);
});
