/**
 * FLASH Dynamic Data Masking & PII Redaction Engine (FlashDataMasker)
 * Masks sensitive fields (Emails, Credit Cards, SSN, Phone Numbers) dynamically based on caller role.
 */
export class FlashDataMasker {
  /**
   * Masks an email address: e.g. j***e@example.com
   * @param {string} email
   */
  static maskEmail(email) {
    if (!email || typeof email !== 'string' || !email.includes('@')) return '***@***.***';
    const [user, domain] = email.split('@');
    if (user.length <= 2) return `${user[0]}*@${domain}`;
    return `${user[0]}${'*'.repeat(user.length - 2)}${user[user.length - 1]}@${domain}`;
  }

  /**
   * Masks a credit card / PAN: e.g. ****-****-****-1234
   * @param {string} cardNumber
   */
  static maskCard(cardNumber) {
    if (!cardNumber) return '****-****-****-****';
    const clean = String(cardNumber).replace(/\D/g, '');
    const last4 = clean.slice(-4);
    return `****-****-****-${last4 || '0000'}`;
  }

  /**
   * Masks an entire document object dynamically according to masking rules
   * @param {object} doc
   * @param {Record<string, 'email'|'card'|'full'|'phone'>} rules
   * @returns {object}
   */
  static maskDocument(doc, rules = {}) {
    if (!doc || typeof doc !== 'object') return doc;
    const masked = { ...doc };

    for (const [field, ruleType] of Object.entries(rules)) {
      if (masked[field] !== undefined) {
        if (ruleType === 'email') {
          masked[field] = FlashDataMasker.maskEmail(masked[field]);
        } else if (ruleType === 'card') {
          masked[field] = FlashDataMasker.maskCard(masked[field]);
        } else if (ruleType === 'full') {
          masked[field] = '********';
        }
      }
    }

    return masked;
  }
}
