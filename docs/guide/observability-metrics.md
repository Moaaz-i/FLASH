# Observability & Prometheus Metrics

**FLASH DB** comes with built-in real-time telemetry, OpenMetrics / Prometheus export, structured logging, and latency histograms via `FlashMetrics` and `logger`.

---

## Live Prometheus Telemetry Endpoint

When running `FlashServer`, the `/metrics` endpoint is automatically exposed on port `6742`:

```bash
curl http://localhost:6742/metrics
```

### Example Exposition Output

```text
# HELP flash_uptime_seconds Total database server uptime in seconds
# TYPE flash_uptime_seconds gauge
flash_uptime_seconds 3482

# HELP flash_operations_total Total operations executed by type
# TYPE flash_operations_total counter
flash_operations_total{op="insert"} 84210
flash_operations_total{op="find"} 320490
flash_operations_total{op="update"} 12400
flash_operations_total{op="delete"} 2100
flash_operations_total{op="flush"} 45
flash_operations_total{op="compact"} 6

# HELP flash_db_ops_duration_ms Operation latency histogram
# TYPE flash_db_ops_duration_ms histogram
flash_db_ops_duration_ms_bucket{op="find",le="1"} 0
flash_db_ops_duration_ms_bucket{op="find",le="5"} 1
flash_db_ops_duration_ms_bucket{op="find",le="10"} 1
flash_db_ops_duration_ms_bucket{op="find",le="25"} 1
flash_db_ops_duration_ms_bucket{op="find",le="+Inf"} 1
flash_db_ops_duration_ms_sum{op="find"} 2.3
flash_db_ops_duration_ms_count{op="find"} 1

# HELP flash_db_errors_total Total error count per operation
# TYPE flash_db_errors_total counter
flash_db_errors_total{op="insert"} 1

# TYPE flash_db_custom_gauge gauge
flash_db_custom_gauge{name="collection_users_count"} 1523

# TYPE flash_db_collection_size_bytes gauge
flash_db_collection_size_bytes{name="users"} 1048576
```

---

## `FlashMetrics` API

| Method | Description |
|--------|-------------|
| `recordOp(op, durationMs)` | Record operation latency (find, insert, update, delete, flush, compact) |
| `recordError(op)` | Record an error for an operation type |
| `setGauge(name, value)` | Set a custom gauge (e.g., collection document counts, storage size) |
| `toPrometheus()` | Export all metrics in Prometheus exposition format (including histograms) |

### Latency Histograms

Every operation type gets its own latency histogram with configurable buckets (default: 0.5, 1, 5, 10, 25, 50, 100, 250, 500, 1000 ms):

```js
import { FlashMetrics } from 'flash-db';

const metrics = new FlashMetrics({
  latencyBuckets: [0.5, 1, 5, 10, 25, 50, 100, 250, 500, 1000]
});

// Record operation latencies
metrics.recordOp('find', 2.3);
metrics.recordOp('insert', 15.7);
metrics.recordOp('flush', 45.2);

// Record errors
metrics.recordError('insert');

// Custom gauges
metrics.setGauge('collection_users_count', 1523);
metrics.setGauge('collection_users_size_bytes', 1048576);

// Export for Prometheus (includes histograms + error counters + gauges)
const prometheusOutput = metrics.toPrometheus();
```

### Standalone Integration

You can also integrate `FlashMetrics` into custom Express, Fastify, or Velociradix servers:

```javascript
import { FlashMetrics } from 'flash-db';

const metrics = new FlashMetrics();

// Record operation duration
const start = Date.now();
// ... execute database write ...
metrics.recordOp('insert', Date.now() - start);

// Expose on custom HTTP route
app.get('/metrics', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metrics.toPrometheus());
});
```

---

## Structured Logging

FLASH DB includes a structured JSON logger for production observability:

```js
import { logger } from 'flash-db';

// Info: general events
logger.info('server', 'Flash DB started', { port: 3000, version: '2.1.0' });

// Warning: recoverable issues
logger.warn('engine', 'Corrupt SSTable skipped', { file: 'data.arc', reason: 'truncated' });

// Error: failures requiring attention
logger.error('client', 'Encryption failed', { error: 'Invalid key', collection: 'users' });

// Debug: detailed internals
logger.debug('query', 'Evaluating filter', { filter: { status: 'active' }, results: 42 });
```

**Output format:** Single-line JSON to stderr, compatible with ELK, Datadog, Grafana Loki, CloudWatch, and `jq`.

```json
{"timestamp":"2025-01-15T10:30:00.000Z","level":"info","module":"server","message":"Flash DB started","port":3000}
```

**Log levels:** `debug` | `info` | `warn` | `error` — set via `FLASH_LOG_LEVEL` env var.

**Sensitive key redaction:** Fields like `secretKey`, `masterKey`, `password`, `token`, `authKey` are automatically redacted to `[REDACTED]`.

See [Structured Logging](/guide/structured-logging) for full details.

---

## Built-in Server Metrics

`FlashServer.start()` automatically tracks:

- Request counts and error counts per route
- Latency histograms per operation type
- Storage gauges for each collection (`collection_size_bytes`, `collection_count`)
- Uptime counter (`flash_uptime_seconds`)

```bash
# Query metrics from the running server
curl http://localhost:6742/metrics | grep flash_db
```
