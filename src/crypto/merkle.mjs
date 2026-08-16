import crypto from 'node:crypto';

/**
 * FLASH Merkle Tree Engine (FlashMerkle)
 * Generates cryptographic state roots and tamper-proof verification proofs for collections and records
 */
export class FlashMerkle {
  /**
   * @param {Array<string|Buffer>} leafHashes - Array of leaf hashes
   */
  constructor(leafHashes = []) {
    this.leaves = leafHashes.map(h => Buffer.isBuffer(h) ? h : Buffer.from(String(h), 'hex'));
    this.layers = [];
    this._buildTree();
  }

  static hash(data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf-8');
    return crypto.createHash('sha256').update(buf).digest();
  }

  _buildTree() {
    if (this.leaves.length === 0) {
      this.layers = [[FlashMerkle.hash('empty_flash_merkle_root')]];
      return;
    }

    this.layers = [this.leaves];
    let currentLayer = this.leaves;

    while (currentLayer.length > 1) {
      const nextLayer = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : left;
        const combined = Buffer.concat([left, right]);
        nextLayer.push(FlashMerkle.hash(combined));
      }
      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }
  }

  /**
   * Returns root hash of the collection in Hex format
   * @returns {string}
   */
  getRoot() {
    if (this.layers.length === 0 || this.layers[this.layers.length - 1].length === 0) {
      return '';
    }
    return this.layers[this.layers.length - 1][0].toString('hex');
  }

  /**
   * Generates a cryptographic Merkle Proof for a leaf at index
   * @param {number} index
   * @returns {Array<{ position: 'left'|'right', data: string }>}
   */
  getProof(index) {
    if (index < 0 || index >= this.leaves.length) return null;
    const proof = [];
    let currentIndex = index;

    for (let layerIndex = 0; layerIndex < this.layers.length - 1; layerIndex++) {
      const layer = this.layers[layerIndex];
      const isRightNode = currentIndex % 2 === 1;
      const pairIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

      if (pairIndex < layer.length) {
        proof.push({
          position: isRightNode ? 'left' : 'right',
          data: layer[pairIndex].toString('hex')
        });
      } else {
        // Odd node paired with itself
        proof.push({
          position: 'right',
          data: layer[currentIndex].toString('hex')
        });
      }
      currentIndex = Math.floor(currentIndex / 2);
    }
    return proof;
  }

  /**
   * Verifies if a leaf belongs to a Merkle Root using the provided proof
   * @param {string|Buffer} leafHash
   * @param {Array<{ position: 'left'|'right', data: string }>} proof
   * @param {string} rootHash
   * @returns {boolean}
   */
  static verifyProof(leafHash, proof, rootHash) {
    let current = Buffer.isBuffer(leafHash) ? leafHash : Buffer.from(String(leafHash), 'hex');

    for (const item of proof) {
      const proofBuf = Buffer.from(item.data, 'hex');
      const combined = item.position === 'left'
        ? Buffer.concat([proofBuf, current])
        : Buffer.concat([current, proofBuf]);
      current = FlashMerkle.hash(combined);
    }

    return current.toString('hex') === rootHash;
  }
}
