/**
 * FLASH TimeSeries Downsampling & Rollup Engine (FlashTimeSeriesRollup)
 * Aggregates high-frequency IoT & telemetry series into downsampled time windows (Min, Max, Avg, Count).
 */
export class FlashTimeSeriesRollup {
  /**
   * Computes bucketed downsampling for time series points
   * @param {Array<{ timestamp: number, value: number }>} dataPoints
   * @param {number} windowSizeMs - Bucket interval (e.g. 60000 for 1 minute)
   * @returns {Array<{ bucketStart: number, count: number, min: number, max: number, avg: number, sum: number }>}
   */
  static rollup(dataPoints = [], windowSizeMs = 60000) {
    if (dataPoints.length === 0) return [];

    const buckets = new Map();

    for (const point of dataPoints) {
      const bucketStart = Math.floor(point.timestamp / windowSizeMs) * windowSizeMs;
      if (!buckets.has(bucketStart)) {
        buckets.set(bucketStart, {
          bucketStart,
          count: 0,
          sum: 0,
          min: point.value,
          max: point.value
        });
      }

      const b = buckets.get(bucketStart);
      b.count++;
      b.sum += point.value;
      if (point.value < b.min) b.min = point.value;
      if (point.value > b.max) b.max = point.value;
    }

    return Array.from(buckets.values())
      .sort((a, b) => a.bucketStart - b.bucketStart)
      .map(b => ({
        ...b,
        avg: b.count > 0 ? b.sum / b.count : 0
      }));
  }
}
