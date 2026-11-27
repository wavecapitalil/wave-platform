// Industry breakdowns for the macro dialog. One registry entry and one public
// data file per indicator. Only JOLTS is implemented.
//
// JOLTS rows are the Table 1 seasonally adjusted job-openings levels that
// partition total nonfarm. Nested rows (durable goods, retail, finance and
// insurance, and so on) are omitted so they are not added twice. Series IDs
// were checked against data.bls.gov industry labels on 2026-11-27.
import fs from 'node:fs';
import path from 'node:path';

export const ROUNDING_BOUND = 5;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const DATA_DIR = path.join(ROOT, 'apps/terminal/public/data/macro-breakdowns');
const API = 'https://api.bls.gov/publicAPI/v1/timeseries/data/';

export const BREAKDOWNS = {
  jolts: {
    id: 'jolts',
    kind: 'level_change',
    title: {en: 'Job openings by industry', he: 'משרות פנויות לפי ענף'},
    unit: {en: 'Thousands of openings, seasonally adjusted', he: 'אלפי משרות פנויות, מנוכה עונתיות'},
    source: 'U.S. Bureau of Labor Statistics · JOLTS',
    table: 'JOLTS Table 1 · job openings level by industry · seasonally adjusted · thousands',
    headline: {
      series: 'JTS000000000000000JOL',
      fred: 'JTSJOL',
      name: 'Total nonfarm',
      he: 'סך כל המשק הלא-חקלאי'
    },
    industries: [
      {key: 'mining', series: 'JTS110099000000000JOL', name: 'Mining and logging', he: 'כרייה וכריתת עצים'},
      {key: 'construction', series: 'JTS230000000000000JOL', name: 'Construction', he: 'בנייה'},
      {key: 'manufacturing', series: 'JTS300000000000000JOL', name: 'Manufacturing', he: 'תעשייה'},
      {key: 'trade', series: 'JTS400000000000000JOL', name: 'Trade, transportation, and utilities', he: 'מסחר, תחבורה ותשתיות'},
      {key: 'information', series: 'JTS510000000000000JOL', name: 'Information', he: 'מידע'},
      {key: 'financial', series: 'JTS510099000000000JOL', name: 'Financial activities', he: 'פעילות פיננסית'},
      {key: 'professional', series: 'JTS540099000000000JOL', name: 'Professional and business services', he: 'שירותים מקצועיים ועסקיים'},
      {key: 'education', series: 'JTS600000000000000JOL', name: 'Private education and health services', he: 'חינוך ובריאות פרטיים'},
      {key: 'leisure', series: 'JTS700000000000000JOL', name: 'Leisure and hospitality', he: 'פנאי ואירוח'},
      {key: 'other', series: 'JTS810000000000000JOL', name: 'Other services', he: 'שירותים אחרים'},
      {key: 'government', series: 'JTS900000000000000JOL', name: 'Government', he: 'ממשלה'}
    ]
  }
};

const iso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-01$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const integer = (n) => typeof n === 'number' && Number.isInteger(n);
function previousMonth(period) {
  const d = new Date(period + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}
function seriesUrl(id) {
  return 'https://data.bls.gov/timeseries/' + id;
}
function readLevel(point) {
  if (!point || typeof point.value !== 'string' || !/^-?\d+$/.test(point.value)) throw Error('Invalid BLS observation');
  const value = Number(point.value);
  if (!integer(value)) throw Error('Invalid BLS observation');
  return {value, preliminary: (point.footnotes || []).some((f) => f && f.code === 'P')};
}
function periodOf(point) {
  const month = /^M(0[1-9]|1[0-2])$/.exec(point && point.period || '');
  if (!month || !/^\d{4}$/.test(point.year || '')) return null;
  const period = point.year + '-' + month[1] + '-01';
  if (!iso(period)) throw Error('Invalid observation date');
  return period;
}

export function buildBreakdown(spec, payload, fetchedAt, fredCsv) {
  if (!spec || !Array.isArray(spec.industries) || new Set(spec.industries.map((x) => x.series)).size !== spec.industries.length) throw Error('Invalid breakdown spec');
  if (spec.industries.some((x) => x.series === spec.headline.series)) throw Error('Headline series is not an industry row');
  if (!payload || payload.status !== 'REQUEST_SUCCEEDED' || !payload.Results || !Array.isArray(payload.Results.series)) throw Error('Invalid BLS response');
  const messages = payload.message || [];
  if (messages.some((m) => /does not exist|not found/i.test(m))) throw Error('BLS series rejected');
  const wanted = [spec.headline.series, ...spec.industries.map((x) => x.series)];
  const byId = new Map();
  for (const series of payload.Results.series) {
    if (byId.has(series.seriesID)) throw Error('Duplicate BLS series');
    const observations = new Map();
    for (const point of series.data || []) {
      const period = periodOf(point);
      if (!period) continue;
      if (observations.has(period)) throw Error('Duplicate period');
      observations.set(period, readLevel(point));
    }
    if (!observations.size) throw Error('No observations');
    byId.set(series.seriesID, observations);
  }
  if (wanted.some((id) => !byId.has(id))) throw Error('Missing BLS series');
  const periods = [...byId.get(spec.headline.series).keys()].filter((period) => spec.industries.every((row) => byId.get(row.series).has(period))).sort();
  if (!periods.length) throw Error('No observations');
  const present = new Set(periods);
  let maxAbs = 0;
  const rows = periods.map((period) => {
    const headline = byId.get(spec.headline.series).get(period);
    const priorPeriod = previousMonth(period);
    const industries = spec.industries.map((row) => {
      const current = byId.get(row.series).get(period);
      const priorPoint = present.has(priorPeriod) ? byId.get(row.series).get(priorPeriod) : null;
      const prior = priorPoint ? priorPoint.value : null;
      return {
        key: row.key,
        series: row.series,
        name: row.name,
        he: row.he,
        value: current.value,
        prior,
        change: prior === null ? null : current.value - prior
      };
    });
    const sum = industries.reduce((total, row) => total + row.value, 0);
    const residual = headline.value - sum;
    if (!integer(residual) || Math.abs(residual) > ROUNDING_BOUND) throw Error('Industry total does not reconcile');
    maxAbs = Math.max(maxAbs, Math.abs(residual));
    return {
      period,
      prior_period: priorPeriod,
      preliminary: headline.preliminary,
      headline: headline.value,
      sum,
      residual,
      reconciled: true,
      rows: industries
    };
  });
  const crosscheck = crosscheckFred(spec, rows, fredCsv);
  return {
    id: spec.id,
    kind: spec.kind,
    title: spec.title,
    unit: spec.unit,
    source: spec.source,
    table: spec.table,
    history_basis: 'latest_revised',
    api: API,
    fetched_at: fetchedAt,
    rounding_bound: ROUNDING_BOUND,
    max_abs_residual: maxAbs,
    headline_series: spec.headline.series,
    fred_series: spec.headline.fred,
    headline_crosscheck: crosscheck,
    series: [
      {role: 'headline', series: spec.headline.series, fred: spec.headline.fred, name: spec.headline.name, he: spec.headline.he, url: seriesUrl(spec.headline.series)},
      ...spec.industries.map((row) => ({role: 'industry', key: row.key, series: row.series, name: row.name, he: row.he, url: seriesUrl(row.series)}))
    ],
    periods: rows
  };
}

export function crosscheckFred(spec, periods, csv) {
  if (!csv) return {fred: spec.headline.fred, status: 'unavailable', compared_periods: 0, max_abs_difference: null};
  const lines = csv.trim().split(/\r?\n/);
  const header = lines.shift()?.replace(/^\uFEFF/, '').split(',');
  if (!header || header.length !== 2 || !['observation_date', 'DATE'].includes(header[0]) || header[1] !== spec.headline.fred) throw Error('Unexpected FRED schema');
  const values = new Map();
  for (const line of lines) {
    const cells = line.split(',');
    if (cells.length !== 2 || !iso(cells[0])) throw Error('Invalid FRED observation');
    if (cells[1] === '.' || cells[1] === '') continue;
    if (!/^-?\d+$/.test(cells[1])) throw Error('Invalid FRED observation');
    if (values.has(cells[0])) throw Error('Duplicate FRED period');
    values.set(cells[0], Number(cells[1]));
  }
  let compared = 0;
  let maxAbs = 0;
  for (const period of periods) {
    if (!values.has(period.period)) continue;
    compared += 1;
    maxAbs = Math.max(maxAbs, Math.abs(period.headline - values.get(period.period)));
  }
  if (!compared) throw Error('FRED overlap unavailable');
  if (maxAbs !== 0) throw Error('FRED headline does not match BLS');
  return {fred: spec.headline.fred, status: 'matched', compared_periods: compared, max_abs_difference: maxAbs};
}

export function validatePublished(doc, spec) {
  if (!doc || doc.id !== spec.id || doc.kind !== spec.kind || doc.rounding_bound !== ROUNDING_BOUND) throw Error('Unexpected breakdown file');
  if (doc.headline_series !== spec.headline.series || doc.fred_series !== spec.headline.fred) throw Error('Unexpected headline series');
  if (!Array.isArray(doc.periods) || !doc.periods.length || !Number.isFinite(Date.parse(doc.fetched_at))) throw Error('Invalid breakdown file');
  const ids = spec.industries.map((row) => row.series);
  if (!Array.isArray(doc.series) || doc.series.filter((row) => row.role === 'industry').map((row) => row.series).join() !== ids.join()) throw Error('Unexpected industry series');
  let maxAbs = 0;
  const byPeriod = new Map();
  for (const period of doc.periods) {
    if (!iso(period.period) || period.prior_period !== previousMonth(period.period) || byPeriod.has(period.period)) throw Error('Invalid breakdown period');
    if (typeof period.preliminary !== 'boolean' || !integer(period.headline) || !integer(period.sum) || !integer(period.residual) || period.reconciled !== true) throw Error('Invalid breakdown period');
    if (!Array.isArray(period.rows) || period.rows.length !== spec.industries.length) throw Error('Incomplete industry partition');
    let sum = 0;
    period.rows.forEach((row, index) => {
      const expected = spec.industries[index];
      if (row.key !== expected.key || row.series !== expected.series || row.name !== expected.name || row.he !== expected.he || !integer(row.value)) throw Error('Unexpected industry row');
      const priorPeriod = byPeriod.get(period.prior_period);
      const prior = priorPeriod ? priorPeriod.rows[index].value : null;
      const change = prior === null ? null : row.value - prior;
      if (row.prior !== prior || row.change !== change) throw Error('Industry change does not match prior month');
      sum += row.value;
    });
    if (sum !== period.sum || period.headline - period.sum !== period.residual || Math.abs(period.residual) > ROUNDING_BOUND) throw Error('Industry total does not reconcile');
    maxAbs = Math.max(maxAbs, Math.abs(period.residual));
    byPeriod.set(period.period, period);
  }
  if (doc.max_abs_residual !== maxAbs) throw Error('Recorded residual does not match');
  const cross = doc.headline_crosscheck;
  if (!cross || cross.fred !== spec.headline.fred) throw Error('Missing headline cross-check');
  if (cross.status === 'matched') {
    if (cross.max_abs_difference !== 0 || !integer(cross.compared_periods) || cross.compared_periods < 1) throw Error('FRED headline does not match BLS');
  } else if (cross.status !== 'unavailable' || cross.compared_periods !== 0 || cross.max_abs_difference !== null) throw Error('Invalid headline cross-check');
  return doc;
}

export function registryDocument() {
  return {
    version: 1,
    indicators: Object.fromEntries(Object.values(BREAKDOWNS).map((spec) => [spec.id, {file: spec.id + '.json', kind: spec.kind}]))
  };
}

function writeFiles(doc) {
  fs.mkdirSync(DATA_DIR, {recursive: true});
  fs.writeFileSync(path.join(DATA_DIR, 'registry.json'), JSON.stringify(registryDocument(), null, 2) + '\n');
  fs.writeFileSync(path.join(DATA_DIR, doc.id + '.json'), JSON.stringify(doc, null, 2) + '\n');
}

export function checkFiles() {
  const registry = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'registry.json'), 'utf8'));
  const expected = registryDocument();
  if (JSON.stringify(registry) !== JSON.stringify(expected)) throw Error('Breakdown registry does not match the implemented indicators');
  for (const [id, entry] of Object.entries(registry.indicators)) {
    const spec = BREAKDOWNS[id];
    if (!spec || entry.file !== id + '.json' || entry.kind !== spec.kind) throw Error('Unknown breakdown indicator');
    validatePublished(JSON.parse(fs.readFileSync(path.join(DATA_DIR, entry.file), 'utf8')), spec);
  }
  return registry;
}

async function fetchBls(spec, now) {
  const end = new Date(now).getUTCFullYear();
  const response = await fetch(API, {
    method: 'POST',
    headers: {'content-type': 'application/json', 'user-agent': 'wave-platform-macro/1.0'},
    body: JSON.stringify({
      seriesid: [spec.headline.series, ...spec.industries.map((row) => row.series)],
      startyear: String(end - 2),
      endyear: String(end)
    }),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw Error('BLS returned HTTP ' + response.status);
  return response.json();
}

async function fetchFred(spec) {
  try {
    const response = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + spec.headline.fred, {
      headers: {'user-agent': 'wave-platform-macro/1.0'},
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) return null;
    return response.text();
  } catch {
    return null;
  }
}

async function refresh(now = Date.now()) {
  const spec = BREAKDOWNS.jolts;
  const [payload, fred] = await Promise.all([fetchBls(spec, now), fetchFred(spec)]);
  const doc = buildBreakdown(spec, payload, new Date(now).toISOString(), fred);
  validatePublished(doc, spec);
  writeFiles(doc);
  const latest = doc.periods.at(-1);
  console.log(JSON.stringify({
    id: doc.id,
    fetched_at: doc.fetched_at,
    latest: latest.period,
    preliminary: latest.preliminary,
    headline: latest.headline,
    sum: latest.sum,
    residual: latest.residual,
    max_abs_residual: doc.max_abs_residual,
    periods: doc.periods.length,
    fred: doc.headline_crosscheck
  }));
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) {
  const command = process.argv[2] || '--check';
  if (command === '--check') checkFiles();
  else if (command === '--write') await refresh();
  else throw Error('Use --check or --write');
}
