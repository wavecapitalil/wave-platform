/* Pure display model for Fundamental Charts, independent of Chart.js and DOM.
 * Build from the FULL returned history before restricting the visible range.
 * Date-only inputs do not establish fiscal-quarter labels: chart keys use the
 * reporting-end calendar year/quarter. A unique end date 350–380 days earlier
 * is the prior-year comparator (including 52/53-week reporting calendars).
 * Explicit fiscalYear/fiscalQuarter metadata takes precedence when supplied.
 * Missing periods never become positional lags, zero values, or interpolations.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof define === 'function' && define.amd) define([], function () { return api; });
  if (root) root.WaveFundamentalChart = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  var DAY = 86400000;
  var LABELS = {
    revenue: 'Total Revenue', gross_profit: 'Gross Profit', operating_income: 'Operating Income',
    net_income: 'Net Income', eps_diluted: 'EPS (Diluted)', free_cash_flow: 'Free Cash Flow',
    capex: 'CapEx', rd_expense: 'R&D Expense', gross_margin: 'Gross Margin %',
    operating_margin: 'Operating Margin %', net_margin: 'Net Margin %',
    revenue_growth: 'Revenue Growth %', op_income_growth: 'Op. Income Growth %',
    net_income_growth: 'Net Income Growth %'
  };
  var PERCENTAGE_METRICS = {
    gross_margin: true, operating_margin: true, net_margin: true,
    revenue_growth: true, op_income_growth: true, net_income_growth: true
  };
  var EARNINGS_METRICS = {
    gross_profit: true, operating_income: true, net_income: true,
    eps_diluted: true, free_cash_flow: true
  };

  function numeric(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !value.trim()) return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function integer(value, min, max) {
    var number = numeric(value);
    return number != null && Number.isInteger(number) && number >= min && number <= max ? number : null;
  }

  function ownObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function firstDefined(a, b) { return a !== undefined && a !== null ? a : b; }

  function periodInfo(input, period) {
    var row = ownObject(input);
    var date = typeof input === 'string' || typeof input === 'number' ? String(input) :
      String(firstDefined(row.date, firstDefined(row.period_end, row.key)) || '');
    date = date.trim();
    var full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    var stamp = null, year = null, quarter = null;
    if (full) {
      var y = Number(full[1]), m = Number(full[2]), d = Number(full[3]);
      var parsed = new Date(Date.UTC(y, m - 1, d));
      if (y >= 1000 && parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d) {
        stamp = parsed.getTime(); year = y; quarter = Math.ceil(m / 3);
      }
    }
    var yearLabel = /^(\d{4})$/.exec(date);
    var quarterLabel = /^(\d{4}) Q([1-4])$/.exec(date);
    if (yearLabel && period === 'annual') year = integer(yearLabel[1], 1000, 9999);
    if (quarterLabel) {
      year = integer(quarterLabel[1], 1000, 9999);
      quarter = Number(quarterLabel[2]);
    }

    var fiscalYear = integer(firstDefined(row.fiscalYear, row.fiscal_year), 1000, 9999);
    var fiscalQuarterValue = firstDefined(row.fiscalQuarter, row.fiscal_quarter);
    if (typeof fiscalQuarterValue === 'string') fiscalQuarterValue = fiscalQuarterValue.replace(/^Q/i, '');
    var fiscalQuarter = integer(fiscalQuarterValue, 1, 4);
    var fiscal = fiscalYear != null && (period === 'annual' || fiscalQuarter != null);
    if (fiscal) { year = fiscalYear; quarter = fiscalQuarter; }
    if (year == null || (period === 'quarterly' && quarter == null)) return null;
    return {
      key: String(year) + (period === 'quarterly' ? ' Q' + quarter : ''),
      date: date || null, timestamp: stamp, year: year, quarter: quarter,
      fiscal: fiscal, basis: fiscal ? 'reported fiscal period' : stamp != null ? 'reporting-end calendar period' : 'reported period label'
    };
  }

  function periodKey(input, period) {
    var info = periodInfo(input, period === 'quarterly' ? 'quarterly' : 'annual');
    return info ? info.key : null;
  }

  function isPercentageMetric(metric) { return PERCENTAGE_METRICS[metric] === true; }

  function negativeBaseReason(current, previous, metric) {
    if (!EARNINGS_METRICS[metric]) return 'Negative prior-year base; relative percentage growth is not meaningful';
    if (current > 0) return 'Loss to profit; negative prior-year base';
    if (current === 0) return 'Loss to break-even; negative prior-year base';
    if (current > previous) return 'Loss reduction; negative prior-year base';
    if (current < previous) return 'Loss widened; negative prior-year base';
    return 'Loss unchanged; negative prior-year base';
  }

  function relativeGrowth(current, previous, metric) {
    current = numeric(current); previous = numeric(previous);
    if (current == null) return { value: null, status: 'missing-current', reason: 'Current value unavailable' };
    if (previous == null) return { value: null, status: 'missing-prior', reason: 'Comparable prior-year value unavailable' };
    // CapEx is reported as a signed cash outflow. Growth is explicitly the
    // relative change in spending magnitude, never earnings-loss growth.
    var magnitude = metric === 'capex';
    var base = magnitude ? Math.abs(previous) : previous;
    var value = magnitude ? Math.abs(current) : current;
    if (base === 0) return { value: null, status: 'zero-base', reason: 'Zero prior-year base; relative percentage growth is undefined' };
    if (base < 0) return { value: null, status: 'negative-base', reason: negativeBaseReason(current, previous, metric) };
    var growth = (value / base - 1) * 100;
    if (!Number.isFinite(growth)) return { value: null, status: 'non-finite', reason: 'Relative percentage growth exceeds the supported numeric range' };
    return { value: Object.is(growth, -0) ? 0 : growth, status: 'ok', reason: null };
  }

  function sameObservation(a, b) {
    return a.info.date === b.info.date && a.info.fiscal === b.info.fiscal &&
      a.info.key === b.info.key && a.rawValue === b.rawValue &&
      a.sourceReason === b.sourceReason && a.sourceStatus === b.sourceStatus;
  }

  function priorCandidates(current, rows, period) {
    var c = current.info;
    if (c.fiscal) {
      return { basis: 'reported fiscal period', rows: rows.filter(function (previous) {
        var p = previous.info;
        return p.fiscal && p.year === c.year - 1 && (period === 'annual' || p.quarter === c.quarter);
      }) };
    }
    if (c.timestamp != null) {
      return { basis: 'reporting end dates 350–380 days apart', rows: rows.filter(function (previous) {
        var p = previous.info;
        if (p.fiscal || p.timestamp == null) return false;
        var days = (c.timestamp - p.timestamp) / DAY;
        return days >= 350 && days <= 380;
      }) };
    }
    return { basis: 'same reporting-period label one year earlier', rows: rows.filter(function (previous) {
      var p = previous.info;
      return !p.fiscal && p.timestamp == null && p.year === c.year - 1 &&
        (period === 'annual' || p.quarter === c.quarter);
    }) };
  }

  /* Returns one point per chart key. Conflicting observations in a reporting
   * bucket remain an explicit N/A; neither input order nor a last-write wins.
   * status/reason describe the active mode. growthStatus/growthReason always
   * describe YoY availability even when an ordinary value can still display.
   */
  function buildSeries(data, options) {
    options = ownObject(options);
    var period = options.period || 'annual', mode = options.mode || 'values', metric = options.metric || '';
    if (period !== 'annual' && period !== 'quarterly') throw new TypeError('period must be annual or quarterly');
    if (mode !== 'values' && mode !== 'growth') throw new TypeError('mode must be values or growth');
    var rows = [];
    (Array.isArray(data) ? data : []).forEach(function (input) {
      var row = ownObject(input), info = periodInfo(row, period);
      if (!info) return;
      var normalized = {
        info: info, rawValue: numeric(row.value),
        reportedFiscalYear: row.period_verified === true ? integer(row.reportedFiscalYear, 1900, 2200) : null,
        reportedFiscalQuarter: row.period_verified === true ? integer(row.reportedFiscalQuarter, 1, 4) : null,
        actualPeriodEnd: row.period_verified === true && typeof row.period_end === 'string' ? row.period_end : null,
        sourceReason: typeof row.reason === 'string' && row.reason ? row.reason : null,
        sourceStatus: typeof row.status === 'string' && row.status !== 'ok' ? row.status : null
      };
      if (!rows.some(function (existing) { return sameObservation(existing, normalized); })) rows.push(normalized);
    });
    var grouped = Object.create(null);
    rows.forEach(function (row) { (grouped[row.info.key] || (grouped[row.info.key] = [])).push(row); });
    return Object.keys(grouped).sort().map(function (key) {
      var group = grouped[key], row = group[0], info = row.info;
      var ambiguous = group.length > 1;
      var valueStatus = ambiguous ? 'ambiguous-period' : row.rawValue == null ? row.sourceStatus || 'missing-current' : 'ok';
      var valueReason = ambiguous ? 'Multiple observations share this reporting period; a unique value is unavailable' :
        row.rawValue == null ? row.sourceReason || 'Current value unavailable' : null;
      var match = priorCandidates(row, rows, period), prior = match.rows.length === 1 ? match.rows[0] : null;
      var growth;
      if (valueStatus !== 'ok') growth = { value: null, status: valueStatus, reason: valueReason };
      else if (match.rows.length > 1) growth = { value: null, status: 'ambiguous-prior', reason: 'Multiple prior-year reports match; a unique comparison is unavailable' };
      else if (!prior) growth = { value: null, status: 'missing-prior', reason: 'Comparable prior-year period unavailable' };
      else {
        growth = relativeGrowth(row.rawValue, prior.rawValue, metric);
        if (prior.rawValue == null && prior.sourceReason) growth.reason = 'Prior-year value unavailable: ' + prior.sourceReason;
      }
      var rawValue = ambiguous ? null : row.rawValue;
      return {
        key: key, date: ambiguous ? null : info.date, periodBasis: info.basis,
        fiscalYear: info.fiscal ? info.year : null,
        fiscalQuarter: info.fiscal && period === 'quarterly' ? info.quarter : null,
        reportedFiscalYear: ambiguous ? null : row.reportedFiscalYear,
        reportedFiscalQuarter: ambiguous ? null : row.reportedFiscalQuarter,
        actualPeriodEnd: ambiguous ? null : row.actualPeriodEnd,
        sourceDates: group.map(function (item) { return item.info.date; }).sort(),
        value: mode === 'growth' ? growth.value : rawValue,
        rawValue: rawValue, priorValue: prior ? prior.rawValue : null,
        priorDate: prior ? prior.info.date : null, priorKey: prior ? prior.info.key : null,
        priorActualPeriodEnd: prior ? prior.actualPeriodEnd : null,
        growthPct: growth.value, comparisonBasis: match.basis,
        valueStatus: valueStatus, valueReason: valueReason,
        growthStatus: growth.status, growthReason: growth.reason,
        status: mode === 'growth' ? growth.status : valueStatus,
        reason: mode === 'growth' ? growth.reason : valueReason
      };
    });
  }

  function formatPercent(value) {
    value = numeric(value);
    if (value == null) return 'N/A';
    if (Math.abs(value) < 0.05) value = 0;
    return (value > 0 ? '+' : '') + value.toFixed(1) + '%';
  }

  function formatValue(value, metric, mode) {
    value = numeric(value);
    if (value == null) return 'N/A';
    if (mode === 'growth' || isPercentageMetric(metric)) return formatPercent(value);
    var magnitude = Math.abs(value), sign = value < 0 ? '-' : '';
    if (magnitude >= 1e12) return sign + (magnitude / 1e12).toFixed(2) + 'T';
    if (magnitude >= 1e9) return sign + (magnitude / 1e9).toFixed(1) + 'B';
    if (magnitude >= 1e6) return sign + (magnitude / 1e6).toFixed(1) + 'M';
    if (metric === 'eps_diluted') return value.toFixed(2);
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function metricLabel(metric, mode) {
    var label = LABELS[metric] || String(metric || 'Value');
    if (mode !== 'growth') return label;
    if (metric === 'capex') return 'CapEx cash-outflow magnitude · YoY (%)';
    return label + (isPercentageMetric(metric) ? ' · YoY relative change (%)' : ' · YoY growth (%)');
  }

  function reportingPeriod(period) {
    if (!period || !integer(period.fiscal_year, 1900, 2200) || !period.period_end) return '';
    return 'FY' + period.fiscal_year + (period.fiscal_quarter ? ' Q' + period.fiscal_quarter : '') +
      ' · ended ' + period.period_end;
  }

  function reportingSummary(result, period) {
    var r = ownObject(result.reporting), latest = period === 'annual' ? r.latest_annual : r.latest_quarterly;
    if (r.status === 'verified' && latest) {
      var text = 'Latest verified ' + (period === 'annual' ? 'full year: ' : 'quarter: ') + reportingPeriod(latest) + '.';
      var filing = period === 'annual' ? r.latest_annual_filing : r.latest_quarterly_filing;
      if (filing && filing.period_end > latest.period_end) text += ' A newer SEC filing exists (period ended ' + filing.period_end + '); its fiscal-period metadata is not available here.';
      if (period === 'annual' && r.filing_coverage_verified && r.latest_quarterly && r.latest_quarterly.fiscal_year > latest.fiscal_year) {
        text += ' FY' + r.latest_quarterly.fiscal_year + ' quarterly results exist through Q' + r.latest_quarterly.fiscal_quarter +
          '; that full-year report is not yet available in the retrieved reports.';
      }
      return text;
    }
    return r.status === 'stale' ? 'Reporting calendar check is out of date; publication status is unconfirmed.' :
      'Verified fiscal reporting dates are unavailable; shown dates are provider period labels.';
  }

  function missingPoint(result, key, period) {
    var r = ownObject(result.reporting), year = integer(key, 1900, 2200);
    var point = {value:null, status:'source-unavailable', reason:'No value is available from the data source for this period; publication status is unconfirmed.'};
    if (r.status !== 'verified') {
      if (r.status === 'stale') point.reason = 'The reporting calendar check is out of date; publication status is unconfirmed.';
      return point;
    }
    var periods = period === 'annual' ? r.annual_periods : r.quarterly_periods;
    var fiscalKeys = (result.data || []).length && result.data.every(function(row){return row.fiscalYear && (period === 'annual' || row.fiscalQuarter);});
    var reported = (Array.isArray(periods) ? periods : []).find(function(p){
      return (fiscalKeys ? String(p.fiscal_year) + (period === 'quarterly' ? ' Q' + p.fiscal_quarter : '') : periodKey(p.period_end,period)) === key;
    });
    if (reported) {
      point.status = 'metric-unavailable';
      point.reason = 'The ' + reportingPeriod(reported) + ' report is available, but this metric is missing from the data source.';
      return point;
    }
    var latestFiling = period === 'annual' ? r.latest_annual_filing : r.latest_quarterly_filing;
    if (!fiscalKeys && latestFiling && periodKey(latestFiling.period_end,period) === key) {
      point.status = 'metric-unavailable';
      point.reason = 'A SEC filing for a period ended ' + latestFiling.period_end + ' is available, but this metric or its fiscal-period metadata is unavailable.';
      return point;
    }
    var annual = r.latest_annual, quarter = r.latest_quarterly;
    var alignedAnnualLabels = fiscalKeys || (r.annual_periods || []).every(function(p){return String(p.fiscal_year) === String(p.period_end).slice(0,4);});
    if (period === 'annual' && year && annual && quarter && r.filing_coverage_verified && alignedAnnualLabels && annual.fiscal_year < year && quarter.fiscal_year === year) {
      point.status = 'annual-not-yet-available';
      point.reason = 'Full-year FY' + year + ' report not yet available in the retrieved reports. Quarterly results exist through FY' +
        quarter.fiscal_year + ' Q' + quarter.fiscal_quarter + ' (ended ' + quarter.period_end + '). Latest full year: ' + reportingPeriod(annual) + '.';
    }
    return point;
  }

  function pointPeriod(point) {
    var year = point.reportedFiscalYear || point.fiscalYear;
    var quarter = point.reportedFiscalQuarter || point.fiscalQuarter;
    var end = point.actualPeriodEnd || point.date;
    if (year) return 'FY' + year + (quarter ? ' Q' + quarter : '') + (end ? ' · ended ' + end : '');
    return point.date ? 'Provider period: ' + point.date : '';
  }

  return {
    buildSeries: buildSeries, periodKey: periodKey, relativeGrowth: relativeGrowth,
    numeric: numeric, isPercentageMetric: isPercentageMetric,
    formatValue: formatValue, formatPercent: formatPercent, metricLabel: metricLabel,
    missingPoint: missingPoint, reportingSummary: reportingSummary, pointPeriod: pointPeriod
  };
});
