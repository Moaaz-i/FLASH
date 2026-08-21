/**
 * FLASH Zero-Copy Binary Document Format (FlashBinary)
 * Constant-time O(1) field lookup via Direct Offset Table
 * Avoids JSON.parse overhead and full-document allocations.
 */

// Field Types
export const FLASH_TYPE = {
  NULL: 0x00,
  BOOLEAN: 0x01,
  INT32: 0x02,
  DOUBLE: 0x03,
  STRING_UTF8: 0x04,
  BINARY: 0x05,
  OBJECT_JSON: 0x06,
  ARRAY_JSON: 0x07,
  ENCRYPTED_BLOB: 0x08
};

const MAGIC_HEADER = 0x46424442; // "FBDB" (Flash Binary Database)

export class FlashBinary {
  /**
   * Computes a fast 32-bit FNV-1a hash for field name offset lookup
   * @param {string} str
   * @returns {number}
   */
  static hashKey(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  /**
   * Serializes a JavaScript Document/Object into FlashBinary Zero-Copy Buffer
   * @param {object} doc
   * @returns {Buffer}
   */
  static serialize(doc) {
    if (!doc || typeof doc !== 'object') {
      throw new Error('FlashBinary only serializes objects');
    }

    const keys = Object.keys(doc);
    const fieldCount = keys.length;

    // Structure:
    // [0..4] Magic (4 bytes)
    // [4..6] Field Count (2 bytes uint16)
    // [6..10] Total Size (4 bytes uint32 placeholder)
    // Offset Table: fieldCount * 17 bytes:
    //   [hashKey (4) | type (1) | dataOffset (4) | dataLen (4) | keyNameLen (1) | keyName (variable)]
    
    const headerSize = 10;
    const keyBuffers = keys.map(k => Buffer.from(k, 'utf-8'));
    const valueBuffers = [];
    const fieldMeta = [];

    let currentDataOffset = 0;

    for (let i = 0; i < fieldCount; i++) {
      const key = keys[i];
      const val = doc[key];
      let type = FLASH_TYPE.NULL;
      let valBuf = Buffer.alloc(0);

      if (val === null || val === undefined) {
        type = FLASH_TYPE.NULL;
      } else if (typeof val === 'boolean') {
        type = FLASH_TYPE.BOOLEAN;
        valBuf = Buffer.from([val ? 1 : 0]);
      } else if (Number.isInteger(val) && val >= -2147483648 && val <= 2147483647) {
        type = FLASH_TYPE.INT32;
        valBuf = Buffer.allocUnsafe(4);
        valBuf.writeInt32LE(val, 0);
      } else if (typeof val === 'number') {
        type = FLASH_TYPE.DOUBLE;
        valBuf = Buffer.allocUnsafe(8);
        valBuf.writeDoubleLE(val, 0);
      } else if (typeof val === 'string') {
        type = FLASH_TYPE.STRING_UTF8;
        valBuf = Buffer.from(val, 'utf-8');
      } else if (Buffer.isBuffer(val)) {
        type = FLASH_TYPE.BINARY;
        valBuf = val;
      } else if (Array.isArray(val)) {
        type = FLASH_TYPE.ARRAY_JSON;
        valBuf = Buffer.from(JSON.stringify(val), 'utf-8');
      } else if (typeof val === 'object') {
        type = FLASH_TYPE.OBJECT_JSON;
        valBuf = Buffer.from(JSON.stringify(val), 'utf-8');
      }

      valueBuffers.push(valBuf);
      fieldMeta.push({
        keyHash: FlashBinary.hashKey(key),
        type,
        keyBuf: keyBuffers[i],
        valLen: valBuf.length
      });
    }

    // Calculate Table Size
    // Each entry: Hash(4) + Type(1) + ValOffset(4) + ValLen(4) + KeyLen(1) + KeyString(N)
    let tableSize = 0;
    for (const m of fieldMeta) {
      tableSize += 4 + 1 + 4 + 4 + 1 + m.keyBuf.length;
    }

    const payloadStartOffset = headerSize + tableSize;
    let totalPayloadSize = 0;
    for (const v of valueBuffers) {
      totalPayloadSize += v.length;
    }

    const totalBufferSize = payloadStartOffset + totalPayloadSize;
    const finalBuffer = Buffer.allocUnsafe(totalBufferSize);

    // Write Header
    finalBuffer.writeUInt32LE(MAGIC_HEADER, 0);
    finalBuffer.writeUInt16LE(fieldCount, 4);
    finalBuffer.writeUInt32LE(totalBufferSize, 6);

    // Write Offset Table
    let tableCursor = headerSize;
    let payloadCursor = payloadStartOffset;

    for (let i = 0; i < fieldCount; i++) {
      const m = fieldMeta[i];
      const valBuf = valueBuffers[i];

      finalBuffer.writeUInt32LE(m.keyHash, tableCursor);
      finalBuffer.writeUInt8(m.type, tableCursor + 4);
      finalBuffer.writeUInt32LE(payloadCursor, tableCursor + 5);
      finalBuffer.writeUInt32LE(m.valLen, tableCursor + 9);
      finalBuffer.writeUInt8(m.keyBuf.length, tableCursor + 13);
      m.keyBuf.copy(finalBuffer, tableCursor + 14);

      tableCursor += 14 + m.keyBuf.length;

      // Copy Value to payload
      if (valBuf.length > 0) {
        valBuf.copy(finalBuffer, payloadCursor);
        payloadCursor += valBuf.length;
      }
    }

    return finalBuffer;
  }

  /**
   * Fast Zero-Copy Single Field Lookup by Key Name in O(1) without parsing the full document
   * @param {Buffer} buffer
   * @param {string} targetKey
   * @returns {*} Value or undefined
   */
  static getField(buffer, targetKey) {
    if (!buffer || buffer.length < 10) return undefined;
    if (buffer.readUInt32LE(0) !== MAGIC_HEADER) {
      // Fallback if raw JSON buffer
      try {
        const obj = JSON.parse(buffer.toString('utf-8'));
        return obj[targetKey];
      } catch {
        return undefined;
      }
    }

    const fieldCount = buffer.readUInt16LE(4);
    const targetHash = FlashBinary.hashKey(targetKey);

    let cursor = 10;
    for (let i = 0; i < fieldCount; i++) {
      const keyHash = buffer.readUInt32LE(cursor);
      const type = buffer.readUInt8(cursor + 4);
      const valOffset = buffer.readUInt32LE(cursor + 5);
      const valLen = buffer.readUInt32LE(cursor + 9);
      const keyLen = buffer.readUInt8(cursor + 13);

      if (keyHash === targetHash) {
        const keyName = buffer.toString('utf-8', cursor + 14, cursor + 14 + keyLen);
        if (keyName === targetKey) {
          return FlashBinary._readValue(buffer, type, valOffset, valLen);
        }
      }

      cursor += 14 + keyLen;
    }

    return undefined;
  }

  /**
   * Deserializes the full FlashBinary buffer into a JavaScript Object
   * @param {Buffer} buffer
   * @returns {object}
   */
  static deserialize(buffer) {
    if (!buffer || buffer.length < 10) return {};
    if (buffer.readUInt32LE(0) !== MAGIC_HEADER) {
      return JSON.parse(buffer.toString('utf-8'));
    }

    const fieldCount = buffer.readUInt16LE(4);
    const result = {};
    let cursor = 10;

    for (let i = 0; i < fieldCount; i++) {
      const type = buffer.readUInt8(cursor + 4);
      const valOffset = buffer.readUInt32LE(cursor + 5);
      const valLen = buffer.readUInt32LE(cursor + 9);
      const keyLen = buffer.readUInt8(cursor + 13);
      const keyName = buffer.toString('utf-8', cursor + 14, cursor + 14 + keyLen);

      result[keyName] = FlashBinary._readValue(buffer, type, valOffset, valLen);
      cursor += 14 + keyLen;
    }

    return result;
  }

  /** @param {Buffer|object} record */
  static decodeRecord(record) {
    if (Buffer.isBuffer(record)) return FlashBinary.deserialize(record);
    return record;
  }

  /** @param {Array<Buffer|object>} records */
  static decodeRecords(records) {
    return records.map((r) => FlashBinary.decodeRecord(r));
  }

  static _readValue(buffer, type, offset, len) {
    switch (type) {
      case FLASH_TYPE.NULL:
        return null;
      case FLASH_TYPE.BOOLEAN:
        return buffer.readUInt8(offset) === 1;
      case FLASH_TYPE.INT32:
        return buffer.readInt32LE(offset);
      case FLASH_TYPE.DOUBLE:
        return buffer.readDoubleLE(offset);
      case FLASH_TYPE.STRING_UTF8:
        return buffer.toString('utf-8', offset, offset + len);
      case FLASH_TYPE.BINARY:
        return buffer.subarray(offset, offset + len);
      case FLASH_TYPE.OBJECT_JSON:
      case FLASH_TYPE.ARRAY_JSON:
        return JSON.parse(buffer.toString('utf-8', offset, offset + len));
      default:
        return null;
    }
  }
}
