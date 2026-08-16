/**
 * FLASH Observability & Prometheus Metrics Exporter (FlashMetrics)
 * Provides standardized OpenMetrics / Prometheus exposition format for database telemetry.
 *
 * Includes:
 *  - Operation counters (insert/find/update/delete/flush/compact)
 *  - Latency histograms with configurable bucket boundaries
 *  - Error counters per operation type
 *  - Storage-level gauges (SSTable count, memtable bytes, WAL size)
 *  - Uptime gauge
 */

const DEFAULT_LATENCY_BUCKETS = [0.5, 1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000, Infinity];

export class FlashMetrics {
  /**
   * @param {object} [options]
   * @param {number[]} [options.latencyBuckets] - Upper bounds in ms (default: 0.5..Inf)
   */
  constructor(options = {}) {
    this.opsCount = new Map(); // opType -> count
    this.latencies = new Map(); // opType -> totalMs
    this.errors = new Map(); // opType -> error count
    this.gauges = new Map(); // name -> value
    this.histograms = new Map(); // opType -> { buckets: Map<number, count>, count, sum }
    this.buckets = options.latencyBuckets || DEFAULT_LATENCY_BUCKETS;
    this.startTime = Date.now();
  }

  /**
   * Records execution of a successful operation.
   * @param {'insert'|'find'|'update'|'delete'|'flush'|'compact'} op
   * @param {number} durationMs
   */
  recordOp(op, durationMs) {
    this.opsCount.set(op, (this.opsCount.get(op) || 0) + 1);
    this.latencies.set(op, (this.latencies.get(op) || 0) + durationMs);

    // Histogram bucket counting
    if (!this.histograms.has(op)) {
      this.histograms.set(op, { buckets: new Map(), count: 0, sum: 0 });
    }
    const h = this.histograms.get(op);
    h.count++;
    h.sum += durationMs;
    for (const bound of this.buckets) {
      const bucketKey = String(bound);
      if (durationMs <= bound) {
        h.buckets.set(bucketKey, (h.buckets.get(bucketKey) || 0) + 1);
      }
    }
  }

  /**
   * Records a failed operation.
   * @param {'insert'|'find'|'update'|'delete'|'flush'|'compact'} op
   */
  recordError(op) {
    this.errors.set(op, (this.errors.get(op) || 0) + 1);
  }

  /**
   * Sets a gauge metric value.
   * @param {string} name
   * @param {number} value
   */
  setGauge(name, value) {
    this.gauges.set(name, value);
  }

  /**
   * Returns formatted Prometheus exposition text.
   * @returns {string}
   */
  toPrometheus() {
    const lines = [];
    const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);

    // --- Uptime ---
    lines.push('# HELP flash_uptime_seconds Total database server uptime in seconds');
    lines.push('# TYPE flash_uptime_seconds gauge');
    lines.push(`flash_uptime_seconds ${uptimeSec}`);

    // --- Operation counters ---
    lines.push('# HELP flash_operations_total Total operations executed by type');
    lines.push('# TYPE flash_operations_total counter');
    for (const [op, count] of this.opsCount.entries()) {
      lines.push(`flash_operations_total{op="${op}"} ${count}`);
    }

    // --- Error counters ---
    if (this.errors.size > 0) {
      lines.push('# HELP flash_errors_total Total failed operations by type');
      lines.push('# TYPE flash_errors_total counter');
      for (const [op, count] of this.errors.entries()) {
        lines.push(`flash_errors_total{op="${op}"} ${count}`);
      }
    }

    // --- Latency cumulative ---
    lines.push('# HELP flash_operation_latency_ms_total Cumulative latency in ms by op');
    lines.push('# TYPE flash_operation_latency_ms_total counter');
    for (const [op, totalMs] of this.latencies.entries()) {
      lines.push(`flash_operation_latency_ms_total{op="${op}"} ${totalMs.toFixed(3)}`);
    }

    // --- Latency histograms ---
    for (const [op, h] of this.histograms.entries()) {
      if (h.count === 0) continue;
      lines.push(`# HELP flash_latency_ms_bucket{op="${op}"} Latency distribution`);
      lines.push(`# TYPE flash_latency_ms_bucket{op="${op}"} histogram`);
      let cumulative = 0;
      for (const bound of this.buckets) {
        const bucketKey = String(bound);
        const c = h.buckets.get(bucketKey) || 0;
        cumulative += c;
        const le = bound === Infinity ? '+Inf' : String(bound);
        lines.push(`flash_latency_ms_bucket{op="${op}",le="${le}"} ${cumulative}`);
      }
      lines.push(`flash_latency_ms_count{op="${op}"} ${h.count}`);
      lines.push(`flash_latency_ms_sum{op="${op}"} ${h.sum.toFixed(3)}`);
    }

    // --- Gauges ---
    for (const [name, val] of this.gauges.entries()) {
      lines.push(`# TYPE flash_${name} gauge`);
      lines.push(`flash_${name} ${val}`);
    }

    return lines.join('\n') + '\n';
  }
}
