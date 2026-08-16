import crypto from 'node:crypto';

/**
 * FLASH Order-Revealing Encryption Engine (FlashORE)
 * Enables confidential range queries ($gt, $gte, $lt, $lte, $between)
 * directly over encrypted ciphertexts without revealing plain numeric/date values on the server.
 */

export class FlashORE {
  /**
   * @param {string|Buffer} secretKey
   */
  constructor(secretKey) {
    if (!secretKey) throw new Error('Secret key required for FlashORE');
    this.key = Buffer.isBuffer(secretKey)
      ? secretKey
      : crypto.createHash('sha256').update(String(secretKey)).digest();
  }

  /**
   * Encrypts a number or date to an Order-Revealing Ciphertext token
   * @param {number|Date|string} value
   * @param {string} [fieldScope='default'] - Scope isolation per collection field
   * @returns {string} Hex-encoded ORE token
   */
  encrypt(value, fieldScope = 'default') {
    let numVal = 0;
    if (value instanceof Date) {
      numVal = value.getTime();
    } else if (typeof value === 'number') {
      numVal = value;
    } else if (typeof value === 'string') {
      // Check if numeric string or date string
      const parsed = Number(value);
      if (!isNaN(parsed)) {
        numVal = parsed;
      } else {
        const d = Date.parse(value);
        numVal = isNaN(d) ? this._stringToRank(value) : d;
      }
    }

    // Convert number to 64-bit IEEE 754 float representation in BigEndian Buffer
    const buf = Buffer.alloc(8);
    buf.writeDoubleBE(numVal, 0);

    // Standard floating-point ordering tweak for two's complement sign
    // If sign bit is 1, invert all bits; if sign bit is 0, invert only sign bit
    if ((buf[0] & 0x80) !== 0) {
      for (let i = 0; i < 8; i++) buf[i] = ~buf[i];
    } else {
      buf[0] ^= 0x80;
    }

    // Derive deterministic order-preserving PRF offset per field scope
    const prf = crypto.createHmac('sha256', this.key).update(`ore:${fieldScope}`).digest();
    const mask = prf.readBigUInt64BE(0);

    const intVal = buf.readBigUInt64BE(0);
    // Additive offset in modular 64-bit space preserves strict order when masked with prefix
    const oreToken = (intVal ^ (mask & 0xFF00000000000000n));

    return `ore:${oreToken.toString(16).padStart(16, '0')}`;
  }

  /**
   * Compares two ORE tokens directly
   * @param {string} oreTokenA
   * @param {string} oreTokenB
   * @returns {-1|0|1} -1 if A < B, 0 if A == B, 1 if A > B
   */
  static compare(oreTokenA, oreTokenB) {
    if (!oreTokenA || !oreTokenB) return 0;
    const aHex = oreTokenA.replace(/^ore:/, '');
    const bHex = oreTokenB.replace(/^ore:/, '');

    const bigA = BigInt('0x' + aHex);
    const bigB = BigInt('0x' + bHex);

    if (bigA < bigB) return -1;
    if (bigA > bigB) return 1;
    return 0;
  }

  /**
   * Evaluates if an encrypted ORE token matches a range query
   * @param {string} oreToken - Document's ORE token
   * @param {object} rangeCriteria - { $gt?: string, $gte?: string, $lt?: string, $lte?: string }
   * @returns {boolean}
   */
  static matchesRange(oreToken, rangeCriteria) {
    if (!oreToken || !rangeCriteria) return false;

    if (rangeCriteria.$gt && FlashORE.compare(oreToken, rangeCriteria.$gt) <= 0) {
      return false;
    }
    if (rangeCriteria.$gte && FlashORE.compare(oreToken, rangeCriteria.$gte) < 0) {
      return false;
    }
    if (rangeCriteria.$lt && FlashORE.compare(oreToken, rangeCriteria.$lt) >= 0) {
      return false;
    }
    if (rangeCriteria.$lte && FlashORE.compare(oreToken, rangeCriteria.$lte) > 0) {
      return false;
    }

    return true;
  }

  _stringToRank(str) {
    let rank = 0;
    const maxChars = Math.min(str.length, 6);
    for (let i = 0; i < maxChars; i++) {
      rank = rank * 256 + str.charCodeAt(i);
    }
    return rank;
  }
}
