/* Registry for the Data Log page. Sector Research records provenance here
 * instead of printing it on the metric screen. Entries are replaced by key.
 *
 * entry = {
 *   page, key, title, symbol, fetchedAt,
 *   fields: [{ id, label, value, display, unit, source, note, links: [{title, url}] }]
 * }
 */
(function (root) {
  var entries = {};
  function record(key, entry) {
    if (!key || !entry) return;
    entries[String(key)] = entry;
  }
  function list() {
    return Object.keys(entries).map(function (key) { return entries[key]; });
  }
  root.WaveDataLog = { record: record, list: list, entries: entries };
})(window);
