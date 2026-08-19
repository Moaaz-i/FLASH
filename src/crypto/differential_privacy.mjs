/**
 * Differential privacy helpers for encrypted aggregation outputs.
 */
export class FlashDifferentialPrivacy {
  static _laplace(scale) {
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  /**
   * @param {number} count
   * @param {number} [epsilon=1.0]
   */
  static noisyCount(count, epsilon = 1.0) {
    const scale = 1 / epsilon;
    return Math.max(0, Math.round(count + this._laplace(scale)));
  }

  /**
   * @param {number} sum
   * @param {number} sensitivity
   * @param {number} [epsilon=1.0]
   */
  static noisySum(sum, sensitivity, epsilon = 1.0) {
    const scale = sensitivity / epsilon;
    return sum + this._laplace(scale);
  }

  /**
   * @param {number[]} values
   * @param {number} [epsilon=1.0]
   */
  static noisyMean(values, epsilon = 1.0) {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    const noisy = this.noisySum(sum, Math.max(...values) - Math.min(...values), epsilon);
    return noisy / values.length;
  }
}
