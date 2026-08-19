/**
 * Minimal BSON codec (zero-deps) for FLASH wire protocol.
 */
export class FlashBSON {
  static encode(value) {
    const parts = [];
    const docBuf = this._encodeDocument(value, parts);
    return Buffer.concat([docBuf, ...parts]);
  }

  static decode(buf, offset = 0) {
    const { value, nextOffset } = this._decodeDocument(buf, offset);
    return { value, nextOffset };
  }

  static _encodeDocument(doc, parts) {
    const bodyParts = [];
    for (const [key, val] of Object.entries(doc)) {
      bodyParts.push(this._encodeElement(key, val, parts));
    }
    bodyParts.push(Buffer.from([0]));
    const body = Buffer.concat(bodyParts);
    const size = Buffer.allocUnsafe(4);
    size.writeInt32LE(4 + body.length, 0);
    return Buffer.concat([size, body]);
  }

  static _encodeElement(key, val, parts) {
    const keyBuf = Buffer.from(`${key}\0`, "utf-8");
    if (val === null) {
      return Buffer.concat([Buffer.from([0x0a]), keyBuf]);
    }
    if (typeof val === "boolean") {
      return Buffer.concat([
        Buffer.from([0x08]),
        keyBuf,
        Buffer.from([val ? 1 : 0]),
      ]);
    }
    if (typeof val === "number" && Number.isInteger(val)) {
      const n = Buffer.allocUnsafe(4);
      n.writeInt32LE(val, 0);
      return Buffer.concat([Buffer.from([0x10]), keyBuf, n]);
    }
    if (typeof val === "number") {
      const n = Buffer.allocUnsafe(8);
      n.writeDoubleLE(val, 0);
      return Buffer.concat([Buffer.from([0x01]), keyBuf, n]);
    }
    if (typeof val === "string") {
      const s = Buffer.from(val, "utf-8");
      const len = Buffer.allocUnsafe(4);
      len.writeInt32LE(s.length + 1, 0);
      return Buffer.concat([
        Buffer.from([0x02]),
        keyBuf,
        len,
        s,
        Buffer.from([0]),
      ]);
    }
    if (val && val._bsontype === "ObjectId") {
      return Buffer.concat([Buffer.from([0x07]), keyBuf, val.id]);
    }
    if (Buffer.isBuffer(val)) {
      const len = Buffer.allocUnsafe(4);
      len.writeInt32LE(val.length, 0);
      return Buffer.concat([
        Buffer.from([0x05]),
        keyBuf,
        len,
        Buffer.from([0x00]),
        val,
      ]);
    }
    if (Array.isArray(val)) {
      const arrDoc = {};
      val.forEach((v, i) => {
        arrDoc[String(i)] = v;
      });
      const encoded = this._encodeDocument(arrDoc, parts);
      return Buffer.concat([Buffer.from([0x04]), keyBuf, encoded]);
    }
    if (typeof val === "object") {
      const encoded = this._encodeDocument(val, parts);
      return Buffer.concat([Buffer.from([0x03]), keyBuf, encoded]);
    }
    const s = Buffer.from(String(val), "utf-8");
    const len = Buffer.allocUnsafe(4);
    len.writeInt32LE(s.length + 1, 0);
    return Buffer.concat([
      Buffer.from([0x02]),
      keyBuf,
      len,
      s,
      Buffer.from([0]),
    ]);
  }

  static _decodeDocument(buf, offset) {
    const size = buf.readInt32LE(offset);
    const end = offset + size;
    let pos = offset + 4;
    const doc = {};

    while (pos < end - 1) {
      const type = buf.readUInt8(pos++);
      if (type === 0x00) break;
      const nameEnd = buf.indexOf(0, pos);
      const name = buf.toString("utf-8", pos, nameEnd);
      pos = nameEnd + 1;

      switch (type) {
        case 0x01: {
          doc[name] = buf.readDoubleLE(pos);
          pos += 8;
          break;
        }
        case 0x02: {
          const strLen = buf.readInt32LE(pos);
          doc[name] = buf.toString("utf-8", pos + 4, pos + 4 + strLen - 1);
          pos += 4 + strLen;
          break;
        }
        case 0x03: {
          const nested = this._decodeDocument(buf, pos);
          doc[name] = nested.value;
          pos = nested.nextOffset;
          break;
        }
        case 0x04: {
          const nested = this._decodeDocument(buf, pos);
          const arr = [];
          for (let i = 0; nested.value[String(i)] !== undefined; i++) {
            arr.push(nested.value[String(i)]);
          }
          doc[name] = arr;
          pos = nested.nextOffset;
          break;
        }
        case 0x05: {
          const binLen = buf.readInt32LE(pos);
          pos += 4;
          pos += 1;
          doc[name] = buf.subarray(pos, pos + binLen);
          pos += binLen;
          break;
        }
        case 0x07: {
          doc[name] = {
            _bsontype: "ObjectId",
            id: buf.subarray(pos, pos + 12),
          };
          pos += 12;
          break;
        }
        case 0x08: {
          doc[name] = buf.readUInt8(pos) === 1;
          pos += 1;
          break;
        }
        case 0x0a: {
          doc[name] = null;
          break;
        }
        case 0x10: {
          doc[name] = buf.readInt32LE(pos);
          pos += 4;
          break;
        }
        case 0x12: {
          doc[name] = Number(buf.readBigInt64LE(pos));
          pos += 8;
          break;
        }
        default:
          throw new Error(`Unsupported BSON type 0x${type.toString(16)}`);
      }
    }

    return { value: doc, nextOffset: end };
  }

  static objectId(hex = null) {
    const id = hex
      ? Buffer.from(hex.padEnd(24, "0").slice(0, 24), "hex")
      : Buffer.from(cryptoRandomObjectId(), "hex");
    return { _bsontype: "ObjectId", id };
  }
}

function cryptoRandomObjectId() {
  const b = Buffer.allocUnsafe(12);
  for (let i = 0; i < 12; i++) b[i] = Math.floor(Math.random() * 256);
  return b.toString("hex");
}
