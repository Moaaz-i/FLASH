# Structured Logging

FLASH DB includes a structured JSON logger for production observability.

## Quick Start

```js
import { logger } from '@moaaz-yahia-zakaria/flash-db';

// Automatic structured JSON output to stderr
logger.info('server', 'Flash DB started', { port: 3000, version: '2.1.0' });
// {"timestamp":"2025-01-15T10:30:00.000Z","level":"info","module":"server","message":"Flash DB started","port":3000,"version":"2.1.0"}

logger.warn('engine', 'Corrupt SSTable detected', { file: 'data.arc', reason: 'truncated' });
logger.error('client', 'Encryption failed', { error: 'Invalid key', collection: 'users' });
logger.debug('query', 'Evaluating filter', { filter: { status: 'active' }, results: 42 });
```

## Configuration

Set log level via environment variable:

```bash
# Default: info (shows info, warn, error)
FLASH_LOG_LEVEL=debug node app.js

# Available levels: debug, info, warn, error
```

## API

### `logger.info(module, message, context?)`
Logs an informational event.

### `logger.warn(module, message, context?)`
Logs a warning (recoverable issue).

### `logger.error(module, message, context?)`
Logs an error (failure that needs attention).

### `logger.debug(module, message, context?)`
Logs detailed debug information (verbose).

### `logger.setLevel(level)`
Dynamically change the log level at runtime.

## Sensitive Key Redaction

The logger automatically redacts sensitive fields:

- `secretKey`, `masterKey`, `password`, `token`, `authKey`

```js
logger.info('auth', 'Login attempt', { password: 'mysecret', username: 'alice' });
// {"level":"info","module":"auth","message":"Login attempt","password":"[REDACTED]","username":"alice"}
```

## Output Format

All log lines are single-line JSON (NDJSON), making them easy to parse with tools like:

- `jq` (command line)
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Datadog, Grafana Loki, CloudWatch Logs

```bash
# Pipe to jq for pretty printing
node app.js 2>&1 | jq .

# Filter by level
node app.js 2>&1 | jq 'select(.level == "error")'

# Filter by module
node app.js 2>&1 | jq 'select(.module == "engine")'
```

## Integration with Prometheus

For metrics alongside logs, use the FlashMetrics class:

```js
import { logger, FlashMetrics } from '@moaaz-yahia-zakaria/flash-db';

const metrics = new FlashMetrics();
logger.info('app', 'Request processed', { duration: 42 });
metrics.recordOp('find', 42);
```
