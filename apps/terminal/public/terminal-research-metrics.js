/* Frozen event-study arithmetic. No execution/equity curve or strategy Sharpe is implied. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WaveResearchMetrics = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const DAY = 86400000;
  const FORWARD = '2026-11-04';
  const STUDY = 'BTC_BB_LOWER_TOUCH_7D_v1';
  const ENDPOINT = 'https://data-api.binance.vision/api/v3/klines';
  const iso = t => new Date(t).toISOString().slice(0, 10);
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const snapshot = Object.freeze({
    studyId: STUDY, kind: 'published_snapshot', asOf: '2026-11-15',
    publishedAt: '2026-11-16T05:45:03.128228Z', forwardStart: FORWARD,
    completedTouches: 4, completedEpisodes: 0, pendingTouches: 5, pendingEpisodes: 0,
    baselineCount: 5, touchMean: -0.09190822279918645,
    baselineMean: -0.10441615836177034, episodeMean: null, episodeGap: null,
    sharpe: null, verdict: 'INCONCLUSIVE', quality: 'WARNING',
    // Rounded report event returns, NOT a rolling metric or reconstructed daily tape.
    eventReturns: Object.freeze([
      Object.freeze({date:'2026-11-11',value:-0.080602}),
      Object.freeze({date:'2026-11-12',value:-0.060824}),
      Object.freeze({date:'2026-11-13',value:-0.099283}),
      Object.freeze({date:'2026-11-15',value:-0.126923})
    ])
  });
  function rowsFromDaily(data) {
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data.start)) throw Error('Invalid daily start');
    const start = Date.parse(data.start + 'T00:00:00Z');
    if (!Number.isFinite(start) || iso(start) !== data.start) throw Error('Invalid daily start');
    if (!Array.isArray(data.c) || !data.c.length || !['o','h','l'].every(k => Array.isArray(data[k]) && data[k].length === data.c.length)) throw Error('Invalid OHLC lengths');
    return data.c.map((_, i) => {
      const row = {date:iso(start+i*DAY),time:start+i*DAY};
      ['o','h','l','c'].forEach(k => {
        if (data[k][i] === null || data[k][i] === '') throw Error('Missing OHLC');
        row[k] = Number(data[k][i]);
        if (!Number.isFinite(row[k]) || row[k] <= 0) throw Error('Invalid OHLC');
      });
      if (row.l > Math.min(row.o,row.c) || row.h < Math.max(row.o,row.c) || row.h < row.l) throw Error('OHLC violation');
      return row;
    });
  }
  function summary(events, baseline) {
    const done = events.filter(e => e.return7d !== null);
    const episodes = done.filter(e => e.episode);
    const baselineMean = mean(baseline.map(e => e.return7d));
    const touchMean = mean(done.map(e => e.return7d));
    const episodeMean = mean(episodes.map(e => e.return7d));
    return {completedTouches:done.length, completedEpisodes:episodes.length,
      pendingTouches:events.length-done.length,
      pendingEpisodes:events.filter(e => e.episode && e.return7d === null).length,
      baselineCount:baseline.length, baselineMean, touchMean, episodeMean,
      touchGap:touchMean === null || baselineMean === null ? null : touchMean-baselineMean,
      episodeGap:episodeMean === null || baselineMean === null ? null : episodeMean-baselineMean};
  }
  function compute(data, options) {
    options = options || {};
    const windowDays = options.windowDays === undefined ? 90 : options.windowDays;
    if (!Number.isInteger(windowDays) || windowDays < 1) throw Error('Invalid windowDays');
    const all = rowsFromDaily(data);
    const asOf = options.asOf || all[all.length-1].date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw Error('Invalid asOf');
    const rows = all.filter(r => r.date <= asOf);
    if (rows.length < 20) throw Error('Insufficient daily history');
    const events = [], baseline = [], touches = [];
    rows.forEach((row,i) => {
      if (i < 19) { touches.push(false); return; }
      const closes = rows.slice(i-19,i+1).map(r => r.c);
      const avg = mean(closes);
      const lower = avg - 2*Math.sqrt(mean(closes.map(c => (c-avg)**2)));
      const touch = row.l <= lower;
      const episode = touch && !touches.slice(Math.max(0,i-7),i).some(Boolean);
      touches.push(touch);
      const exit = rows[i+7];
      const record = {date:row.date, exitDate:iso(row.time+7*DAY), lower, close:row.c,
        episode, return7d:exit ? exit.c/row.c-1 : null};
      if (touch) events.push(record);
      if (exit) baseline.push(record);
    });
    // Completion-date window: outcomes appear only when the exit candle has closed.
    const series = rows.filter(r => r.date >= FORWARD).map(row => {
      const cutoff = iso(row.time-(windowDays-1)*DAY);
      const available = e => e.date >= FORWARD && e.exitDate <= row.date && e.exitDate >= cutoff;
      const s = summary(events.filter(available),baseline.filter(available));
      return {date:row.date,value:s.episodeGap,touchGap:s.touchGap,
        count:s.completedEpisodes,touchCount:s.completedTouches,baselineCount:s.baselineCount};
    });
    return {studyId:STUDY, asOf:rows[rows.length-1].date, forwardStart:FORWARD,
      windowDays, metric:'episode_mean_7d_minus_baseline', unit:'return_fraction',
      sharpe:null, sharpeStatus:'not_defined_for_event_study',
      historical:summary(events.filter(e => e.date < FORWARD && e.exitDate < FORWARD),baseline.filter(e => e.exitDate < FORWARD)),
      forward:summary(events.filter(e => e.date >= FORWARD),baseline.filter(e => e.date >= FORWARD)),
      series, events:events.filter(e => e.date >= FORWARD),
      verdict:'INCONCLUSIVE', historicalVerdict:'NO EDGE FOUND', quality:'WARNING'};
  }
  async function refresh(data, options) {
    options = options || {};
    const now = options.now === undefined ? Date.now() : Number(options.now);
    if (!Number.isFinite(now)) throw Error('Invalid clock');
    const closed = Math.floor(now/DAY)*DAY-DAY;
    const original = rowsFromDaily(data);
    const last = original[original.length-1];
    const fallback = error => ({data, result:compute(data,{asOf:iso(closed)}),
      refreshed:false, checkedAt:new Date(now).toISOString(), error, snapshot});
    if (last.time > closed) return fallback('Bundled data extends beyond closed UTC day');
    const fetcher = options.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!fetcher) return fallback('Fetch unavailable');
    const copy = {start:data.start,o:data.o.slice(),h:data.h.slice(),l:data.l.slice(),c:data.c.slice()};
    try {
      let cursor = last.time, overlap = false;
      while (cursor <= closed) {
        const response = await fetcher(ENDPOINT+'?symbol=BTCUSDT&interval=1d&startTime='+cursor+'&endTime='+(closed+DAY-1)+'&limit=1000', {signal:typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined});
        if (!response.ok) throw Error('Source HTTP '+response.status);
        const page = await response.json();
        if (!Array.isArray(page) || !page.length) throw Error('Incomplete daily source');
        for (const bar of page) {
          if (!Array.isArray(bar) || Number(bar[0]) !== cursor || Number(bar[6]) !== cursor+DAY-1 || cursor > closed) throw Error('Non-contiguous or unclosed daily source');
          if (!overlap) {
            if (!['o','h','l','c'].every((k,j) => Number(bar[j+1]) === last[k])) throw Error('Frozen-source overlap mismatch');
            overlap = true;
          } else ['o','h','l','c'].forEach((k,j) => copy[k].push(bar[j+1]));
          cursor += DAY;
        }
      }
      rowsFromDaily(copy); // All-or-nothing; never publish a partial or invalid extension.
      return {data:copy,result:compute(copy),refreshed:true,checkedAt:new Date(now).toISOString(),error:null,snapshot};
    } catch(error) { return fallback(error.message); }
  }
  return Object.freeze({compute, refresh, rowsFromDaily, snapshot, STUDY, FORWARD, ENDPOINT});
});
