/** Regular-session SPDR sector moves for the homepage pulse.
 * Chart URL, no key:
 * https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=10d&interval=1d&includePrePost=false
 * The chart host is unofficial and can rate-limit. A failed refresh keeps the stored snapshot.
 */

export const SECTOR_DATASET = "sectors:sp500";
export const SECTOR_LOCK = "sectors:sp500:lock";
export const LOCK_MS = 20_000;
export const FRESH_MS = 30 * 60 * 1000;
export const SOURCE = "Yahoo Finance chart API regular session";
export const LOGIC_VERSION = "sector_strength_v1.1";
const NY = "America/New_York";
const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;

export const SECTORS: [string, string][] = [
  ["XLK", "Technology"],
  ["XLC", "Comm. Services"],
  ["XLY", "Consumer Disc."],
  ["XLF", "Financials"],
  ["XLI", "Industrials"],
  ["XLV", "Healthcare"],
  ["XLP", "Consumer Staples"],
  ["XLB", "Materials"],
  ["XLE", "Energy"],
  ["XLRE", "Real Estate"],
  ["XLU", "Utilities"],
];

const CHART = "https://query1.finance.yahoo.com/v8/finance/chart/";

/** Full NYSE closures. Early closes stay inside the regular 09:30–16:00 window. */
const HOLIDAYS = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function part(now: Date, type: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return parts.find((p) => p.type === type)?.value || "";
}

export function nyParts(now: Date) {
  let hour = Number(part(now, "hour"));
  if (hour === 24) hour = 0;
  const minute = Number(part(now, "minute"));
  return {
    weekday: part(now, "weekday"),
    date: `${part(now, "year")}-${part(now, "month")}-${part(now, "day")}`,
    minutes: hour * 60 + minute,
  };
}

function zoneOffsetMs(utcMs: number): number {
  const d = new Date(utcMs);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const g = (type: string) => Number(fmt.find((p) => p.type === type)?.value);
  let hour = g("hour");
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), hour, g("minute"), g("second"));
  return asUtc - utcMs;
}

export function zonedTime(date: string, minutes: number): number {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const stamp = `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`;
  const guess = Date.parse(stamp);
  return guess - zoneOffsetMs(guess - zoneOffsetMs(guess));
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function isWeekendDate(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

function previousTradingDay(date: string): string {
  let cursor = shiftDate(date, -1);
  while (isWeekendDate(cursor) || HOLIDAYS.has(cursor)) cursor = shiftDate(cursor, -1);
  return cursor;
}

export function inSession(now: Date): boolean {
  const p = nyParts(now);
  if (p.weekday === "Sat" || p.weekday === "Sun" || HOLIDAYS.has(p.date)) return false;
  return p.minutes >= OPEN_MIN && p.minutes < CLOSE_MIN;
}

/** UTC millis of the most recent weekday 16:00 ET close at or before now. */
export function lastCloseMs(now: Date): number {
  const p = nyParts(now);
  const closedToday = p.weekday !== "Sat" && p.weekday !== "Sun" && !HOLIDAYS.has(p.date) && p.minutes >= CLOSE_MIN;
  const date = closedToday ? p.date : previousTradingDay(p.date);
  return zonedTime(date, CLOSE_MIN);
}

export function needsRefresh(calculatedAt: string | null | undefined, now: Date): boolean {
  const calculated = calculatedAt ? Date.parse(calculatedAt) : NaN;
  if (!Number.isFinite(calculated)) return true;
  if (inSession(now)) return now.getTime() - calculated >= FRESH_MS;
  return calculated < lastCloseMs(now);
}

function nyDate(timestamp: number): string {
  return nyParts(new Date(timestamp * 1000)).date;
}

export function sessionMove(meta: Record<string, unknown>, timestamps: unknown[], closes: unknown[]) {
  if (!meta || typeof meta !== "object") throw new Error("chart meta missing");
  const price = num(meta.regularMarketPrice);
  const liveTs = num(meta.regularMarketTime);
  if (price === null || price <= 0 || liveTs === null) throw new Error("regular session price unavailable");
  const liveDay = nyDate(liveTs);
  const byDay = new Map<string, number>();
  for (let i = 0; i < Math.max(timestamps.length, closes.length); i++) {
    const ts = num(timestamps[i]);
    const close = num(closes[i]);
    if (ts === null || close === null || close <= 0) continue;
    byDay.set(nyDate(ts), close);
  }
  const prior = [...byDay.keys()].filter((day) => day < liveDay).sort();
  let prevClose: number | null;
  let prevDay: string | null = null;
  if (prior.length) {
    prevDay = prior[prior.length - 1];
    prevClose = byDay.get(prevDay) ?? null;
  } else {
    prevClose = num(meta.previousClose);
  }
  if (prevClose === null || prevClose <= 0) throw new Error("prior session close unavailable");
  return {
    price: round4(price),
    pct: round4((price - prevClose) / prevClose * 100),
    session: liveDay,
    previous_close: round4(prevClose),
    previous_session: prevDay,
  };
}

async function chart(symbol: string) {
  const url = `${CHART}${encodeURIComponent(symbol)}?range=10d&interval=1d&includePrePost=false`;
  let last: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {"accept": "application/json", "user-agent": "Mozilla/5.0 WAVE"},
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`${symbol} ${response.status}`);
      const body = await response.json();
      const result = body?.chart?.result?.[0];
      if (!result) throw new Error(`${symbol} empty chart`);
      return result;
    } catch (error) {
      last = error;
    }
  }
  throw new Error(`${symbol}: ${last instanceof Error ? last.message : "chart failed"}`);
}

export async function collectSectorRows() {
  const rows = await Promise.all(SECTORS.map(async ([symbol, name]) => {
    const result = await chart(symbol);
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const move = sessionMove(result.meta || {}, result.timestamp || [], closes);
    return {symbol, name, price: move.price, pct: move.pct, session: move.session};
  }));
  if (rows.length !== SECTORS.length) throw new Error("incomplete sector set");
  const session = rows.map((row) => row.session).sort().at(-1) || "";
  const sectors = rows
    .map(({symbol, name, price, pct}) => ({symbol, name, price, pct}))
    .sort((a, b) => b.pct - a.pct);
  return {sectors, session};
}

export function snapshotRecord(data: {sectors: unknown[]; session: string}, now: Date) {
  const iso = now.toISOString();
  return {
    dataset_key: SECTOR_DATASET,
    dataset_group: "sectors",
    data,
    source: SOURCE,
    source_timestamp: iso,
    fetched_at: iso,
    calculated_at: iso,
    expires_at: new Date(now.getTime() + (inSession(now) ? FRESH_MS : 12 * 60 * 60 * 1000)).toISOString(),
    logic_version: LOGIC_VERSION,
    freshness: inSession(now) ? "30m_ondemand" : "session_close",
    stale: false,
    fallback: false,
    status: "ok",
    error: null,
    updated_at: iso,
  };
}

export function lockRecord(now: Date) {
  const iso = now.toISOString();
  return {
    dataset_key: SECTOR_LOCK,
    dataset_group: "sectors",
    data: {},
    source: "sector refresh lock",
    source_timestamp: iso,
    fetched_at: iso,
    calculated_at: iso,
    expires_at: new Date(now.getTime() + LOCK_MS).toISOString(),
    logic_version: LOGIC_VERSION,
    freshness: "lock",
    stale: false,
    fallback: false,
    status: "ok",
    error: null,
    updated_at: iso,
  };
}
