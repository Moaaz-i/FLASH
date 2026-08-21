import { FlashBlindIndex } from "../crypto/blind_index.mjs";

/**
 * Compact on-disk record layout — flattens _enc to binary top-level fields,
 * omits empty blind/homo shells, skips honey-padded ngrams when searchable.
 */
export class FlashStorageCompact {
  static _asBuffer(value) {
    if (Buffer.isBuffer(value)) return value;
    if (typeof value === "string") return Buffer.from(value, "base64");
    return Buffer.from(String(value), "utf-8");
  }

  /**
   * @param {object|null|undefined} blind
   * @returns {object|null}
   */
  static _compactBlind(blind) {
    if (!blind || typeof blind !== "object") return null;

    const exact = { ...(blind.exact || {}) };
    const ngrams = { ...(blind.ngrams || {}) };
    const range = { ...(blind.range || {}) };

    if (
      Object.keys(exact).length === 0 &&
      Object.keys(ngrams).length === 0 &&
      Object.keys(range).length === 0
    ) {
      return null;
    }

    return { exact, ngrams, range };
  }

  /**
   * @param {object} record
   * @returns {object}
   */
  static flattenRecord(record) {
    const out = { _id: record._id };

    for (const [field, ct] of Object.entries(record._enc || {})) {
      out[`_x.${field}`] = FlashStorageCompact._asBuffer(ct);
    }

    if (record._plain && Object.keys(record._plain).length > 0) {
      out._plain = record._plain;
    }

    const blind = FlashStorageCompact._compactBlind(record._blind);
    if (blind) out._blind = blind;

    if (record._homo && Object.keys(record._homo).length > 0) {
      out._homo = record._homo;
    }

    return out;
  }

  /**
   * @param {object} flat
   * @returns {object}
   */
  static expandRecord(flat) {
    if (!flat || typeof flat !== "object") return flat;

    const hasFlatEnc = Object.keys(flat).some((k) => k.startsWith("_x."));
    if (!hasFlatEnc && flat._enc) return flat;

    const record = {
      _id: flat._id,
      _enc: flat._enc ? { ...flat._enc } : {},
      _plain: flat._plain || {},
      _homo: flat._homo || {},
    };

    for (const [key, val] of Object.entries(flat)) {
      if (key.startsWith("_x.")) {
        record._enc[key.slice(3)] = FlashStorageCompact._asBuffer(val);
      }
    }

    if (flat._blind) record._blind = flat._blind;
    return record;
  }
}
