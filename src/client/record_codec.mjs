import { FlashBinary } from "../binary/flash_binary.mjs";
import { FlashStorageCompact } from "../engine/storage_compact.mjs";

/**
 * Default buffer pipeline — encrypt/serialize on write, partial field read on decrypt.
 * Keeps engine records as FlashBinary buffers end-to-end; skips full deserialize on hot paths.
 */
export class FlashRecordCodec {
  /**
   * Plain document → encrypted FlashBinary buffer (single serialize at boundary).
   * @param {import('./flash_client.mjs').FlashClient} client
   * @param {object} doc
   * @returns {Buffer}
   */
  static toBuffer(client, doc) {
    const encrypted = client.encryptDocument(doc);
    const payload =
      client.storageProfile === "compact"
        ? FlashStorageCompact.flattenRecord(encrypted)
        : encrypted;
    return FlashBinary.serialize(payload);
  }

  /**
   * @param {import('./flash_client.mjs').FlashClient} client
   * @param {Buffer} buf
   */
  static _expandIfCompact(client, buf) {
    if (!Buffer.isBuffer(buf) || client.storageProfile !== "compact") {
      return buf;
    }
    try {
      const flat = FlashBinary.deserialize(buf);
      return FlashStorageCompact.expandRecord(flat);
    } catch {
      return FlashBinary.deserialize(buf);
    }
  }

  /**
   * @param {Buffer} buf
   * @param {import('./flash_client.mjs').FlashClient} [client]
   */
  static toEncryptedEnvelope(buf, client = null) {
    try {
      const flat = FlashBinary.deserialize(buf);
      const record = FlashStorageCompact.expandRecord(flat);
      if (record._enc && Object.keys(record._enc).length > 0) {
        return {
          _id: record._id,
          _enc: record._enc,
          _plain: record._plain || {},
          _homo: record._homo || {},
        };
      }
    } catch {
      // fall through to partial field read
    }

    return {
      _id: FlashRecordCodec.extractId(buf),
      _enc: FlashBinary.getField(buf, "_enc") || {},
      _plain: FlashRecordCodec.extractPlain(buf) || {},
      _homo: FlashBinary.getField(buf, "_homo") || {},
    };
  }

  /**
   * @param {Buffer|object} bufOrObj
   * @returns {string|null}
   */
  static extractId(bufOrObj) {
    if (Buffer.isBuffer(bufOrObj)) {
      const id = FlashBinary.getField(bufOrObj, "_id");
      return id != null ? String(id) : null;
    }
    return bufOrObj?._id != null ? String(bufOrObj._id) : null;
  }

  /**
   * @param {Buffer} buf
   * @returns {object|null}
   */
  static extractBlind(buf) {
    if (!Buffer.isBuffer(buf)) return buf?._blind ?? null;
    return FlashBinary.getField(buf, "_blind") ?? null;
  }

  /**
   * @param {Buffer} buf
   * @returns {object|null}
   */
  static extractPlain(buf) {
    if (!Buffer.isBuffer(buf)) return buf?._plain ?? null;
    return FlashBinary.getField(buf, "_plain") ?? null;
  }

  /**
   * Encrypted buffer → plaintext document for API consumers.
   * @param {import('./flash_client.mjs').FlashClient} client
   * @param {Buffer|object} bufOrObj
   * @returns {object}
   */
  static decrypt(client, bufOrObj) {
    if (!Buffer.isBuffer(bufOrObj)) {
      return client.decryptDocument(bufOrObj);
    }

    const envelope = FlashRecordCodec.toEncryptedEnvelope(bufOrObj, client);
    if (!envelope._enc || Object.keys(envelope._enc).length === 0) {
      try {
        return client.decryptDocument(FlashBinary.deserialize(bufOrObj));
      } catch {
        return {};
      }
    }
    return client.decryptDocument(envelope);
  }

  /**
   * Decrypt only requested fields — skips AES for omitted columns.
   * @param {import('./flash_client.mjs').FlashClient} client
   * @param {Buffer|object} bufOrObj
   * @param {string[]} fields
   * @returns {object}
   */
  static decryptFields(client, bufOrObj, fields = []) {
    if (!fields || fields.length === 0) {
      return FlashRecordCodec.decrypt(client, bufOrObj);
    }

    const envelope = Buffer.isBuffer(bufOrObj)
      ? FlashRecordCodec.toEncryptedEnvelope(bufOrObj, client)
      : bufOrObj;

    if (!envelope?._enc) {
      return FlashRecordCodec.decrypt(client, bufOrObj);
    }

    const fieldSet = new Set(fields);
    fieldSet.add("_id");

    const doc = { _id: envelope._id };
    const recordId = String(envelope._id);

    for (const [key, ciphertext] of Object.entries(envelope._enc)) {
      if (!fieldSet.has(key)) continue;
      try {
        doc[key] = client.cipher.decrypt(ciphertext, {
          asJson: true,
          aad: client._buildAAD(recordId, key),
        });
      } catch {
        doc[key] = null;
      }
    }

    if (envelope._plain) {
      for (const [key, val] of Object.entries(envelope._plain)) {
        if (fieldSet.has(key)) doc[key] = val;
      }
    }

    return doc;
  }

  /**
   * @param {Buffer|object} docOrBuf
   * @returns {Buffer}
   */
  static ensureBuffer(docOrBuf) {
    if (Buffer.isBuffer(docOrBuf)) return docOrBuf;
    return FlashBinary.serialize(docOrBuf);
  }

  /** @param {Buffer} buf */
  static encodeForWire(buf) {
    return { _flashRecord: buf.toString("base64") };
  }

  /** @param {Buffer|object} payload */
  static decodeFromWire(payload) {
    if (Buffer.isBuffer(payload)) return payload;
    if (payload?._flashRecord) {
      return Buffer.from(payload._flashRecord, "base64");
    }
    if (payload && typeof payload === "object") {
      return FlashBinary.serialize(payload);
    }
    throw new Error("Invalid wire record payload");
  }
}
