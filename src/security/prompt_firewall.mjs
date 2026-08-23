const PII_PATTERNS = [
  { name: "email", re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: "phone", re: /\+?\d[\d\s-]{8,}\d/g },
  { name: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: "api_key", re: /\b(sk-[a-zA-Z0-9]{20,}|Bearer\s+[a-zA-Z0-9._-]+)/g },
  { name: "credit_card", re: /\b(?:\d{4}[- ]?){3}\d{4}\b/g },
];

const INJECTION_PATTERNS = [
  { name: "prompt_injection", re: /\b(ignore\s+previous\s+instructions|system\s+prompt|ignore\s+original\s+prompt|bypass\s+restrictions|reveal\s+system\s+instructions|you\s+are\s+now\s+an\s+assistant|you\s+are\s+now\s+a\s+different)\b/ig },
];

/**
 * Scans prompts/responses for PII, secrets, and injection attacks before LLM egress.
 */
export class FlashPromptFirewall {
  /**
   * @param {string} text
   * @param {object} [options]
   * @param {boolean} [options.redact=true]
   */
  static scan(text, options = {}) {
    const redact = options.redact !== false;
    const violations = [];
    let redacted = text || "";

    for (const { name, re } of PII_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(redacted)) {
        violations.push(name);
        if (redact) {
          re.lastIndex = 0;
          redacted = redacted.replace(re, `[REDACTED_${name.toUpperCase()}]`);
        }
      }
    }

    for (const { name, re } of INJECTION_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(redacted)) {
        violations.push(name);
        if (redact) {
          re.lastIndex = 0;
          redacted = redacted.replace(re, `[REDACTED_INJECTION_ATTEMPT]`);
        }
      }
    }

    return {
      safe: violations.length === 0,
      violations,
      redacted,
      originalLength: (text || "").length,
    };
  }

  static assertSafe(text) {
    const result = this.scan(text, { redact: false });
    if (!result.safe) {
      throw new Error(
        `Prompt firewall blocked content: ${result.violations.join(", ")}`,
      );
    }
    return true;
  }
}
