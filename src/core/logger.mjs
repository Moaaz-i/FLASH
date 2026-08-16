const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL_NAMES = { 0: 'DEBUG', 1: 'INFO', 2: 'WARN', 3: 'ERROR' };

// Fields whose values must never appear in structured logs.
const SENSITIVE_KEY_PATTERNS = [
  /secret/i,
  /password/i,
  /key/i,
  /token/i,
  /auth/i,
  /passphrase/i,
];

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERNS.some(p => p.test(k))) {
      out[k] = typeof v === 'string' ? '***REDACTED***' : '[redacted]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Structured JSON logger for FLASH DB internals.
 * Every log line is a single JSON object written to stderr so stdout
 * (REPL, server responses) is never polluted.
 *
 * Usage:
 *   import { logger } from './logger.mjs';
 *   logger.info('FlashCollection', 'flush completed', { sstables: 3, durationMs: 42 });
 */
class FlashLogger {
  constructor(minLevel = 'info') {
    this.minLevel = LEVELS[minLevel] ?? LEVELS.info;
  }

  /**
   * Set the minimum log level at runtime.
   * @param {'debug'|'info'|'warn'|'error'} level
   */
  setLevel(level) {
    this.minLevel = LEVELS[level] ?? LEVELS.info;
  }

  _emit(level, module, message, context) {
    if (level < this.minLevel) return;
    const entry = {
      ts: new Date().toISOString(),
      level: LEVEL_NAMES[level],
      module,
      msg: message,
    };
    if (context && typeof context === 'object' && Object.keys(context).length > 0) {
      entry.ctx = redact(context);
    }
    process.stderr.write(JSON.stringify(entry) + '\n');
  }

  debug(module, message, context) {
    this._emit(LEVELS.debug, module, message, context);
  }

  info(module, message, context) {
    this._emit(LEVELS.info, module, message, context);
  }

  warn(module, message, context) {
    this._emit(LEVELS.warn, module, message, context);
  }

  error(module, message, context) {
    this._emit(LEVELS.error, module, message, context);
  }
}

export const logger = new FlashLogger(
  process.env.FLASH_LOG_LEVEL || 'info',
);
