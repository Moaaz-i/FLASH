import { reportError } from "../core/report_error.mjs";
import { collectSecretMistakes } from "../security/trust_guard.mjs";

const CLIENT_ROOT_KEYS = new Set([
  "secretKey",
  "dbName",
  "storagePath",
  "inMemory",
  "uri",
  "url",
  "authKey",
  "pqcHardened",
  "autoTimestamps",
  "fieldPolicy",
  "storageProfile",
  "engineOptions",
  "salt",
  "userId",
  "allowPlaintextFields",
]);

const DATABASE_OPTION_KEYS = new Set([
  "storagePath",
  "inMemory",
  "engineOptions",
]);

const SERVER_OPTION_KEYS = new Set([
  "port",
  "host",
  "storagePath",
  "authKey",
  "dbName",
  "engineOptions",
  "rbac",
  "allowPublicBind",
]);

const ENGINE_OPTION_KEYS = new Set([
  "durability",
  "performanceProfile",
  "memtableThreshold",
  "useWorkerFlush",
  "deferMerkleOnWrite",
  "disableMerkle",
  "skipIndexPersist",
  "compressionLevel",
  "storageProfile",
  "trash",
  "deletionLog",
  "trashSecret",
  "deletionLogSecret",
]);

const TRASH_KEYS = new Set(["enabled", "maxEntries", "maxBytes", "maxAgeMs"]);
const DELETION_LOG_KEYS = new Set(["enabled"]);
const ENGINE_ONLY_ON_ROOT = new Set(["deletionLog", "trash"]);

const DURABILITY = new Set(["strict", "balanced", "throughput"]);
const PERF_PROFILES = new Set(["strict", "balanced", "turbo"]);
const STORAGE_PROFILES = new Set(["standard", "compact"]);
const ENGINE_BOOLEANS = [
  "useWorkerFlush",
  "deferMerkleOnWrite",
  "disableMerkle",
  "skipIndexPersist",
];

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {string} message
 * @param {string} key
 */
export function mistake(message, key) {
  const err = new Error(message);
  err.flashKey = key;
  return err;
}

/**
 * @param {Error[]} mistakes
 */
export function throwIfMistakes(mistakes) {
  if (mistakes.length === 1) throw reportError(mistakes[0]);
  if (mistakes.length > 1) throw reportError.all(mistakes);
}

function assertBoolean(value, path, mistakes) {
  if (value != null && typeof value !== "boolean") {
    mistakes.push(mistake(`${path} must be a boolean`, path));
  }
}

function assertFiniteNumber(value, path, mistakes, { min, max } = {}) {
  if (value == null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    mistakes.push(mistake(`${path} must be a finite number`, path));
    return;
  }
  if (min != null && value < min) {
    mistakes.push(mistake(`${path} must be >= ${min}`, path));
  }
  if (max != null && value > max) {
    mistakes.push(mistake(`${path} must be <= ${max}`, path));
  }
}

function assertEnum(value, path, allowed, mistakes) {
  if (value == null) return;
  if (!allowed.has(value)) {
    mistakes.push(
      mistake(`${path} is invalid; use ${[...allowed].join(" | ")}`, path),
    );
  }
}

/**
 * @param {object} engine
 * @param {string} [prefix]
 * @returns {Error[]}
 */
export function collectEngineOptionMistakes(engine, prefix = "engineOptions") {
  const mistakes = [];
  if (engine == null) return mistakes;
  if (!isPlainObject(engine)) {
    mistakes.push(mistake(`${prefix} must be an object`, prefix));
    return mistakes;
  }

  for (const key of Object.keys(engine)) {
    if (!ENGINE_OPTION_KEYS.has(key)) {
      mistakes.push(mistake(`unknown ${prefix}.${key}`, `${prefix}.${key}`));
    }
  }

  assertEnum(engine.durability, `${prefix}.durability`, DURABILITY, mistakes);
  assertEnum(
    engine.performanceProfile,
    `${prefix}.performanceProfile`,
    PERF_PROFILES,
    mistakes,
  );
  assertEnum(
    engine.storageProfile,
    `${prefix}.storageProfile`,
    STORAGE_PROFILES,
    mistakes,
  );
  assertFiniteNumber(
    engine.memtableThreshold,
    `${prefix}.memtableThreshold`,
    mistakes,
    { min: 1 },
  );
  assertFiniteNumber(
    engine.compressionLevel,
    `${prefix}.compressionLevel`,
    mistakes,
    { min: 1, max: 9 },
  );
  for (const key of ENGINE_BOOLEANS) {
    assertBoolean(engine[key], `${prefix}.${key}`, mistakes);
  }

  if (engine.trash != null) {
    if (!isPlainObject(engine.trash)) {
      mistakes.push(
        mistake(`${prefix}.trash must be an object`, `${prefix}.trash`),
      );
    } else {
      for (const key of Object.keys(engine.trash)) {
        if (!TRASH_KEYS.has(key)) {
          mistakes.push(
            mistake(
              key === "deletionLog"
                ? `${prefix}.trash.deletionLog is invalid; use ${prefix}.deletionLog`
                : `unknown ${prefix}.trash.${key}`,
              `${prefix}.trash.${key}`,
            ),
          );
        }
      }
      assertBoolean(engine.trash.enabled, `${prefix}.trash.enabled`, mistakes);
      assertFiniteNumber(
        engine.trash.maxEntries,
        `${prefix}.trash.maxEntries`,
        mistakes,
        { min: 0 },
      );
      assertFiniteNumber(
        engine.trash.maxBytes,
        `${prefix}.trash.maxBytes`,
        mistakes,
        { min: 0 },
      );
      assertFiniteNumber(
        engine.trash.maxAgeMs,
        `${prefix}.trash.maxAgeMs`,
        mistakes,
        { min: 0 },
      );
    }
  }

  if (engine.deletionLog != null) {
    if (!isPlainObject(engine.deletionLog)) {
      mistakes.push(
        mistake(
          `${prefix}.deletionLog must be an object`,
          `${prefix}.deletionLog`,
        ),
      );
    } else {
      for (const key of Object.keys(engine.deletionLog)) {
        if (!DELETION_LOG_KEYS.has(key)) {
          mistakes.push(
            mistake(
              `unknown ${prefix}.deletionLog.${key}`,
              `${prefix}.deletionLog.${key}`,
            ),
          );
        }
      }
      assertBoolean(
        engine.deletionLog.enabled,
        `${prefix}.deletionLog.enabled`,
        mistakes,
      );
    }
  }

  return mistakes;
}

function collectForeignUriMistakes(config) {
  const mistakes = [];
  for (const key of ["uri", "url"]) {
    const value = config[key];
    if (typeof value !== "string") continue;
    if (
      /^(mongodb(\+srv)?|postgres(?:ql)?|mysql|redis|amqp|kafka):\/\//i.test(
        value,
      )
    ) {
      mistakes.push(
        mistake(
          `FlashClient.${key} must be a FLASH server URL (flash://, http://, or https://)`,
          key,
        ),
      );
    }
  }
  return mistakes;
}

/**
 * Reject unknown or misplaced FlashClient options. Fact only — then print + throw.
 * @param {object} config
 */
export function assertClientConfig(config = {}) {
  reportError.watch();
  const mistakes = [];

  for (const key of Object.keys(config)) {
    if (ENGINE_ONLY_ON_ROOT.has(key) && config[key] != null) {
      mistakes.push(
        mistake(
          `${key} must be engineOptions.${key}, not a FlashClient root key`,
          key,
        ),
      );
      continue;
    }
    if (!CLIENT_ROOT_KEYS.has(key)) {
      mistakes.push(mistake(`unknown FlashClient option: ${key}`, key));
    }
  }

  assertBoolean(config.inMemory, "inMemory", mistakes);
  assertBoolean(config.pqcHardened, "pqcHardened", mistakes);
  assertBoolean(config.allowPlaintextFields, "allowPlaintextFields", mistakes);
  assertEnum(
    config.storageProfile,
    "storageProfile",
    STORAGE_PROFILES,
    mistakes,
  );

  if (config.fieldPolicy != null && !isPlainObject(config.fieldPolicy)) {
    mistakes.push(mistake("fieldPolicy must be an object", "fieldPolicy"));
  } else if (config.fieldPolicy && config.allowPlaintextFields !== true) {
    for (const [field, policy] of Object.entries(config.fieldPolicy)) {
      if (policy === "plaintext") {
        mistakes.push(
          mistake(
            `fieldPolicy.${field}=plaintext stores values in the clear; pass allowPlaintextFields: true only if you accept that leak`,
            "fieldPolicy",
          ),
        );
      }
    }
  }

  mistakes.push(...collectSecretMistakes(config.secretKey, "secretKey"));
  const foreignUri = collectForeignUriMistakes(config);
  mistakes.push(...foreignUri);
  if ((config.uri || config.url) && foreignUri.length === 0) {
    if (!config.authKey) {
      mistakes.push(
        mistake("FlashClient.uri requires authKey for the remote FlashServer", "authKey"),
      );
    } else {
      mistakes.push(...collectSecretMistakes(config.authKey, "authKey"));
    }
  }
  mistakes.push(...collectEngineOptionMistakes(config.engineOptions));
  throwIfMistakes(mistakes);
}

/**
 * @param {object} [options]
 */
export function assertDatabaseOptions(options = {}) {
  reportError.watch();
  const mistakes = [];
  for (const key of Object.keys(options)) {
    if (!DATABASE_OPTION_KEYS.has(key)) {
      mistakes.push(mistake(`unknown FlashDatabase option: ${key}`, key));
    }
  }
  assertBoolean(options.inMemory, "inMemory", mistakes);
  mistakes.push(...collectEngineOptionMistakes(options.engineOptions));
  throwIfMistakes(mistakes);
}

/**
 * @param {object} [options]
 */
export function assertServerOptions(options = {}) {
  reportError.watch();
  const mistakes = [];
  for (const key of Object.keys(options)) {
    if (!SERVER_OPTION_KEYS.has(key)) {
      mistakes.push(mistake(`unknown FlashServer option: ${key}`, key));
    }
  }
  if (options.port != null) {
    assertFiniteNumber(options.port, "port", mistakes, { min: 1, max: 65535 });
  }
  assertBoolean(options.allowPublicBind, "allowPublicBind", mistakes);
  if (!options.authKey) {
    mistakes.push(
      mistake("FlashServer requires authKey (do not expose an unauthenticated daemon)", "authKey"),
    );
  } else {
    mistakes.push(...collectSecretMistakes(options.authKey, "authKey"));
  }
  mistakes.push(...collectEngineOptionMistakes(options.engineOptions));
  throwIfMistakes(mistakes);
}

/**
 * @param {object} engine
 */
export function assertEngineOptions(engine) {
  reportError.watch();
  throwIfMistakes(collectEngineOptionMistakes(engine));
}

/**
 * @param {{ inMemory?: boolean, trashVault?: object|null }} db
 */
export function requireTrashVault(db) {
  if (db?.inMemory) {
    throw reportError(
      mistake("trash is disabled when inMemory is true", "inMemory"),
    );
  }
  if (!db?.trashVault) {
    throw reportError(
      mistake("engineOptions.trash is disabled", "engineOptions.trash"),
    );
  }
  return db.trashVault;
}

/**
 * @param {{ deletionLog?: object|null }} db
 */
export function requireDeletionLog(db) {
  if (!db?.deletionLog) {
    throw reportError(
      mistake(
        "engineOptions.deletionLog is disabled",
        "engineOptions.deletionLog",
      ),
    );
  }
  return db.deletionLog;
}
