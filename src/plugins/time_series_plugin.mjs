/**
 * FLASH Time-Series & Downsampling Plugin (FlashTimeSeriesPlugin)
 * Columnar bucketing ($timeBucket), rolling window aggregations, and IoT stream downsampling
 */
export class FlashTimeSeriesPlugin {
  /**
   * Buckets documents into fixed temporal windows (e.g. '1m', '5m', '1h', '1d')
   * @param {Array<object>} docs
   * @param {string} timeField - e.g. 'timestamp'
   * @param {string|number} interval - e.g. '1m', '5m', '1h', '1d' or milliseconds
   * @param {object} aggregations - e.g. { avgTemp: { $avg: 'temperature' }, maxPressure: { $max: 'pressure' } }
   */
  static bucket(docs, timeField, interval, aggregations = {}) {
    const intervalMs = typeof interval === 'number' ? interval : this._parseInterval(interval);
    const buckets = new Map(); // bucketKey -> Array<doc>

    for (const doc of docs) {
      const rawTime = doc[timeField];
      if (!rawTime) continue;
      const ts = new Date(rawTime).getTime();
      const bucketTime = Math.floor(ts / intervalMs) * intervalMs;

      if (!buckets.has(bucketTime)) {
        buckets.set(bucketTime, []);
      }
      buckets.get(bucketTime).push(doc);
    }

    const results = [];
    for (const [bucketTime, bucketDocs] of buckets.entries()) {
      const item = {
        _id: new Date(bucketTime).toISOString(),
        bucketStart: bucketTime,
        count: bucketDocs.length
      };

      for (const [outField, aggSpec] of Object.entries(aggregations)) {
        const [op, inField] = Object.entries(aggSpec)[0];
        const values = bucketDocs.map(d => Number(d[inField])).filter(v => !isNaN(v));

        if (op === '$avg') {
          item[outField] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        } else if (op === '$sum') {
          item[outField] = values.reduce((a, b) => a + b, 0);
        } else if (op === '$min') {
          item[outField] = values.length ? Math.min(...values) : 0;
        } else if (op === '$max') {
          item[outField] = values.length ? Math.max(...values) : 0;
        } else if (op === '$first') {
          item[outField] = bucketDocs[0] ? bucketDocs[0][inField] : null;
        } else if (op === '$last') {
          item[outField] = bucketDocs[bucketDocs.length - 1] ? bucketDocs[bucketDocs.length - 1][inField] : null;
        }
      }

      results.push(item);
    }

    results.sort((a, b) => a.bucketStart - b.bucketStart);
    return results;
  }

  static _parseInterval(str) {
    const num = parseInt(str, 10);
    if (str.endsWith('s')) return num * 1000;
    if (str.endsWith('m')) return num * 60 * 1000;
    if (str.endsWith('h')) return num * 3600 * 1000;
    if (str.endsWith('d')) return num * 86400 * 1000;
    return num;
  }
}
