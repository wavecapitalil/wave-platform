/* Year-by-year equity workbook. All money and shares are in millions; prices are
 * currency/share. Rates are percentage points (5 means 5%), not fractions.
 * Each year's cash/debt/claims are YEAR-END balances after all funding flows.
 * Gross buyback and dilution rates both apply to that year's opening shares.
 * The model never estimates repurchase spending or subtracts it a second time.
 *
 * calculate({revenue, shares, price?}, [{growth, margin, buyback, dilution,
 *   multiple, cash, debt, claims, capitalConfirmed?}, ...]) returns:
 * {valid, errors, warnings, base, years, forecast, rows}. rows aliases forecast.
 * A valid:false result still contains every independently calculable value.
 * Missing/invalid values are null, never zero; errors identify year and field.
 * Row valid means inputs/dependencies are complete; valuationValid means a
 * finite multiple-derived price exists. Nonpositive EBIT has no such price.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof define === 'function' && define.amd) define([], function () { return api; });
  if (root) root.WaveEquityWorkbook = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';
  var MAX_YEARS = 10;
  var MAX_BALANCE = 1e12;

  function numeric(value) {
    if (value === null || value === undefined || typeof value === 'boolean') return null;
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !value.trim()) return null;
    var result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function addWarning(list, code) { if (list.indexOf(code) === -1) list.push(code); }
  function addError(list, year, field, code, dependencies) {
    var error = { year: year, field: field, code: code };
    if (dependencies) error.dependsOn = dependencies;
    list.push(error);
  }
  function read(source, key, min, max, exclusiveMin, exclusiveMax, year, errors) {
    var value = numeric(source[key]);
    if (value === null) addError(errors, year, key, 'required');
    else if (value < min || value > max || (exclusiveMin && value === min) || (exclusiveMax && value === max)) {
      addError(errors, year, key, 'range');
      return null;
    }
    return value;
  }
  function derive(row, field, inputs, dependencies, operation) {
    if (inputs.some(function (value) { return value === null; })) {
      addError(row.errors, row.year, field, 'dependency', dependencies);
      return null;
    }
    var value = operation();
    if (!Number.isFinite(value)) {
      addError(row.errors, row.year, field, 'overflow');
      return null;
    }
    return value === 0 ? 0 : value;
  }

  function calculate(rawBase, assumptionsArray) {
    var errors = [], warnings = [], forecast = [];
    var base = object(rawBase);
    var normalizedBase = {
      revenue: read(base, 'revenue', 0, MAX_BALANCE, false, false, 0, errors),
      shares: read(base, 'shares', 0, MAX_BALANCE, true, false, 0, errors),
      price: numeric(base.price)
    };
    if (normalizedBase.price !== null && normalizedBase.price <= 0) normalizedBase.price = null;
    var result = { valid: false, errors: errors, warnings: warnings, base: normalizedBase,
      years: 0, forecast: forecast, rows: forecast };
    if (!Array.isArray(assumptionsArray)) {
      addError(errors, null, 'assumptions', 'array');
      return result;
    }
    if (assumptionsArray.length > MAX_YEARS) {
      addError(errors, null, 'years', 'range');
      return result;
    }
    result.years = assumptionsArray.length;
    var previousRevenue = normalizedBase.revenue, previousShares = normalizedBase.shares;

    for (var index = 0; index < assumptionsArray.length; index++) {
      var assumption = object(assumptionsArray[index]);
      var row = { year: index + 1, valid: false, valuationValid: false, errors: [], warnings: [],
        revenue: null, growth: null, ebit: null, margin: null,
        startShares: previousShares, shares: null, shareChange: null, shareChangePct: null,
        buyback: null, dilution: null, buybackShares: null, dilutionShares: null,
        multiple: null, ev: null, cash: null, debt: null, claims: null,
        equity: null, price: null, upside: null, capitalConfirmed: assumption.capitalConfirmed === true };

      row.growth = read(assumption, 'growth', -100, 300, false, false, row.year, row.errors);
      row.margin = read(assumption, 'margin', -100, 100, false, false, row.year, row.errors);
      row.buyback = read(assumption, 'buyback', 0, 100, false, true, row.year, row.errors);
      row.dilution = read(assumption, 'dilution', 0, 100, false, false, row.year, row.errors);
      row.multiple = read(assumption, 'multiple', 0, 100, false, false, row.year, row.errors);
      row.cash = read(assumption, 'cash', 0, MAX_BALANCE, false, false, row.year, row.errors);
      row.debt = read(assumption, 'debt', 0, MAX_BALANCE, false, false, row.year, row.errors);
      row.claims = read(assumption, 'claims', 0, MAX_BALANCE, false, false, row.year, row.errors);

      row.revenue = derive(row, 'revenue', [previousRevenue, row.growth], ['previousRevenue', 'growth'], function () {
        return previousRevenue * (1 + row.growth / 100);
      });
      row.ebit = derive(row, 'ebit', [row.revenue, row.margin], ['revenue', 'margin'], function () {
        return row.revenue * row.margin / 100;
      });
      row.buybackShares = derive(row, 'buybackShares', [previousShares, row.buyback], ['startShares', 'buyback'], function () {
        return previousShares * row.buyback / 100;
      });
      row.dilutionShares = derive(row, 'dilutionShares', [previousShares, row.dilution], ['startShares', 'dilution'], function () {
        return previousShares * row.dilution / 100;
      });
      row.shareChangePct = derive(row, 'shareChangePct', [row.buyback, row.dilution], ['buyback', 'dilution'], function () {
        return row.dilution - row.buyback;
      });
      row.shares = derive(row, 'shares', [previousShares, row.buyback, row.dilution], ['startShares', 'buyback', 'dilution'], function () {
        return previousShares * (1 - row.buyback / 100 + row.dilution / 100);
      });
      if (row.shares !== null && row.shares <= 0) {
        addError(row.errors, row.year, 'shares', 'underflow');
        row.shares = null;
      }
      row.shareChange = derive(row, 'shareChange', [previousShares, row.shares], ['startShares', 'shares'], function () {
        return row.shares - previousShares;
      });

      if (Math.abs(row.growth) > 50 || row.buyback > 20 || row.dilution > 20 || row.multiple > 50) {
        addWarning(row.warnings, 'extreme_assumptions');
      }
      if ((row.buyback > 0 || row.dilution > 0) && !row.capitalConfirmed) {
        addWarning(row.warnings, 'capital_balances_unconfirmed');
      }

      if (row.ebit !== null && row.ebit <= 0) {
        // An EBIT multiple is not a meaningful valuation for zero/negative EBIT.
        addWarning(row.warnings, 'nonpositive_ebit');
      } else {
        row.ev = derive(row, 'ev', [row.ebit, row.multiple], ['ebit', 'multiple'], function () {
          return row.ebit * row.multiple;
        });
        row.equity = derive(row, 'equity', [row.ev, row.cash, row.debt, row.claims], ['ev', 'cash', 'debt', 'claims'], function () {
          return row.ev + row.cash - row.debt - row.claims;
        });
        if (row.equity !== null && row.equity < 0) addWarning(row.warnings, 'equity_deficit');
        row.price = derive(row, 'price', [row.equity, row.shares], ['equity', 'shares'], function () {
          return Math.max(0, row.equity) / row.shares;
        });
        if (row.price !== null) {
          if (normalizedBase.price !== null) {
            row.upside = derive(row, 'upside', [row.price, normalizedBase.price], ['price', 'currentPrice'], function () {
              return (row.price / normalizedBase.price - 1) * 100;
            });
          } else addWarning(row.warnings, 'missing_current_price');
        }
      }
      row.valid = row.errors.length === 0;
      row.valuationValid = row.price !== null;
      forecast.push(row);
      Array.prototype.push.apply(errors, row.errors);
      row.warnings.forEach(function (code) { addWarning(warnings, code); });
      previousRevenue = row.revenue;
      previousShares = row.shares;
    }
    result.valid = errors.length === 0;
    return result;
  }

  return { calculate: calculate, numeric: numeric, MAX_YEARS: MAX_YEARS };
});
