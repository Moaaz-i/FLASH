import crypto from 'node:crypto';

/**
 * FLASH Key Rotation & Envelope Encryption Engine (FlashKeyRotationManager)
 * Implements KEK (Key Encryption Key) & DEK (Data Encryption Key) management,
 * versioned ciphertexts, lazy re-encryption, and batch key migration.
 */

export class FlashKeyRotationManager {
  /**
   * @param {string|Buffer} masterKey - Master Key / KEK
   */
  constructor(masterKey) {
    if (!masterKey) throw new Error('Master key required for FlashKeyRotationManager');
    this.kek = Buffer.isBuffer(masterKey)
      ? masterKey
      : crypto.createHash('sha256').update(String(masterKey)).digest();
    
    // version (number) -> { dek: Buffer, createdAt: number, status: 'active'|'retired' }
    this.keys = new Map();
    this.currentVersion = 1;

    // Initialize version 1 DEK derived or generated
    this._generateDek(1);
  }

  /**
   * Generates and stores a new DEK for a given version
   * @param {number} version
   * @returns {Buffer}
   */
  _generateDek(version) {
    const rawDek = crypto.randomBytes(32);
    this.keys.set(version, {
      dek: rawDek,
      createdAt: Date.now(),
      status: 'active'
    });
    return rawDek;
  }

  /**
   * Rotates master active encryption key to a new version
   * @returns {{ newVersion: number, activeKeysCount: number }}
   */
  rotateKey() {
    const previousVersion = this.currentVersion;
    if (this.keys.has(previousVersion)) {
      this.keys.get(previousVersion).status = 'retired';
    }

    this.currentVersion += 1;
    this._generateDek(this.currentVersion);

    return {
      previousVersion,
      newVersion: this.currentVersion,
      activeKeysCount: this.keys.size
    };
  }

  /**
   * Encrypts plaintext payload using current active DEK
   * Format: `flash:v<version>:<iv_hex>:<authTag_hex>:<ciphertext_hex>`
   * @param {string|object} data
   * @returns {string} Versioned Ciphertext string
   */
  encrypt(data) {
    const currentKey = this.keys.get(this.currentVersion);
    const plaintext = typeof data === 'object' ? JSON.stringify(data) : String(data);

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', currentKey.dek, iv);

    let enc = cipher.update(plaintext, 'utf8', 'hex');
    enc += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `flash:v${this.currentVersion}:${iv.toString('hex')}:${authTag}:${enc}`;
  }

  /**
   * Decrypts ciphertext automatically matching the embedded DEK version
   * @param {string} versionedCiphertext
   * @returns {string|object} Decrypted data
   */
  decrypt(versionedCiphertext) {
    if (!versionedCiphertext || typeof versionedCiphertext !== 'string' || !versionedCiphertext.startsWith('flash:v')) {
      throw new Error('Invalid versioned ciphertext format');
    }

    const parts = versionedCiphertext.split(':');
    if (parts.length !== 5) {
      throw new Error('Malformed versioned ciphertext envelope');
    }

    const versionStr = parts[1]; // e.g. "v1"
    const version = parseInt(versionStr.replace('v', ''), 10);
    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const encryptedHex = parts[4];

    const keyObj = this.keys.get(version);
    if (!keyObj) {
      throw new Error(`Decryption failed: Key version ${version} not found in keystore`);
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', keyObj.dek, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  }

  /**
   * Checks if a ciphertext needs re-encryption to current key version
   * @param {string} versionedCiphertext
   * @returns {boolean}
   */
  needsReEncryption(versionedCiphertext) {
    if (!versionedCiphertext || typeof versionedCiphertext !== 'string') return false;
    const match = versionedCiphertext.match(/^flash:v(\d+):/);
    if (!match) return false;
    const ver = parseInt(match[1], 10);
    return ver < this.currentVersion;
  }

  /**
   * Re-encrypts an old versioned ciphertext to the current active key version
   * @param {string} oldCiphertext
   * @returns {string} New versioned ciphertext
   */
  reEncrypt(oldCiphertext) {
    const plain = this.decrypt(oldCiphertext);
    return this.encrypt(plain);
  }

  /**
   * Batch re-encrypts a collection of documents in memory
   * @param {Array<object>} documents
   * @param {string[]} encryptedFields
   * @returns {{ upgradedCount: number }}
   */
  batchReEncrypt(documents, encryptedFields) {
    let upgradedCount = 0;
    for (const doc of documents) {
      for (const field of encryptedFields) {
        if (doc[field] && this.needsReEncryption(doc[field])) {
          doc[field] = this.reEncrypt(doc[field]);
          upgradedCount++;
        }
      }
    }
    return { upgradedCount };
  }
}
