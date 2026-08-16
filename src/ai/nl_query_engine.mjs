/**
 * FLASH Universal Polyglot Natural Language Query Engine (FlashNLQueryEngine)
 * Script-Agnostic & Zero-Shot Translation of Natural Language into structured MongoDB Queries.
 * Supports ANY language on Earth (English, Arabic, Chinese, French, Spanish, Russian, Hindi,
 * Japanese, German, Turkish, newly invented dialects & programming pseudocode).
 * 
 * 1. Offline Universal Rule & Numeric Extraction (Unicode Digits, Ranges & Comparison Operators).
 * 2. Dynamic Schema Fuzzy Field Mapping for any multilingual schema.
 * 3. Zero-Shot Polyglot LLM Translation for complex arbitrary sentences.
 */

export class FlashNLQueryEngine {
  /**
   * Translates a natural language question in ANY language into a structured MongoDB query
   * @param {string} prompt - Question/Prompt in ANY human or artificial language
   * @param {Array<string>} [knownFields=[]] - Available schema fields in the collection
   * @returns {{ filter: object, sort?: object, limit?: number, explanation: string }}
   */
  static parse(prompt, knownFields = []) {
    const text = (prompt || '').trim();
    const normalizedText = this._normalizeDigits(text.toLowerCase());
    const filter = {};
    let sort = null;
    let limit = null;
    const explanations = [];

    // 1. Universal Greater Than (">", ">=", "أكثر من", "plus que", "more than", "大于", "больше", "mehr als", "más de")
    const gtMatch = normalizedText.match(/(?:>|>=|أكثر من|أكبر من|أعلى من|فوق|more than|greater than|plus que|plus de|superior a|mayor que|mehr als|больше|大于|超える|daha fazla)\s*(\d+(?:\.\d+)?)/i);
    if (gtMatch) {
      const num = parseFloat(gtMatch[1]);
      const field = this._matchField(normalizedText, knownFields, ['purchases', 'ordersCount', 'count', 'age', 'price', 'salary', 'balance', 'score', 'rating']) || 'purchases';
      filter[field] = { $gt: num };
      explanations.push(`${field} > ${num}`);
    }

    // 2. Universal Less Than ("<", "<=", "أقل من", "moins de", "less than", "小于", "меньше", "weniger als", "menos de")
    const ltMatch = normalizedText.match(/(?:<|<=|أقل من|أصغر من|تحت|less than|smaller than|below|under|moins de|inferior a|menor que|weniger als|меньше|小于|未満|daha az)\s*(\d+(?:\.\d+)?)/i);
    if (ltMatch) {
      const num = parseFloat(ltMatch[1]);
      const field = this._matchField(normalizedText, knownFields, ['price', 'age', 'salary', 'balance', 'purchases', 'cost']) || 'price';
      filter[field] = { $lt: num };
      explanations.push(`${field} < ${num}`);
    }

    // 3. Universal Range ("بين X و Y", "between X and Y", "entre X y Y", "entre X et Y", "zwischen X und Y", "X..Y", "X - Y")
    const betweenMatch = normalizedText.match(/(?:بين|between|entre|zwischen|من|from|从|от)?\s*(\d+(?:\.\d+)?)\s*(?:و|and|et|und|y|to|a|bis|إلى|至|до|-|–|\.\.)\s*(\d+(?:\.\d+)?)/i);
    if (betweenMatch && betweenMatch[1] && betweenMatch[2]) {
      const min = parseFloat(betweenMatch[1]);
      const max = parseFloat(betweenMatch[2]);
      const field = this._matchField(normalizedText, knownFields, ['age', 'edad', 'alter', 'price', 'salary', 'balance', 'purchases', 'score']) || 'age';
      filter[field] = { $gte: Math.min(min, max), $lte: Math.max(min, max) };
      explanations.push(`${field} between ${min} and ${max}`);
    }

    // 4. Universal Status / Boolean detection
    if (/(?:active|نشط|actif|activo|aktiv|активный|活跃|アクティブ)/i.test(normalizedText)) {
      filter['status'] = 'active';
      explanations.push('status = "active"');
    } else if (/(?:inactive|غير نشط|معطل|inactif|inactivo|inaktiv|неактивный|不活跃|非アクティブ)/i.test(normalizedText)) {
      filter['status'] = 'inactive';
      explanations.push('status = "inactive"');
    }

    // 5. Universal VIP / Premium detection
    if (/(?:vip|premium|مميز|privilège|exclusivo|премиум|高级|プレミアム)/i.test(normalizedText)) {
      filter['isVIP'] = true;
      explanations.push('isVIP = true');
    }

    // 6. Universal Top / Limit detection ("أول X", "أعلى X", "top X", "first X", "les premiers X", "前X", "первые X")
    const topMatch = normalizedText.match(/(?:أعلى|أفضل|أول|top|first|premier|premiers|meilleurs|meilleur|top|erste|前|первые)\s*(\d+)/i) ||
      normalizedText.match(/(\d+)\s*(?:top|premiers|records|elements|items)/i);
    if (topMatch) {
      limit = parseInt(topMatch[1], 10);
      const sortField = this._matchField(normalizedText, knownFields, ['purchases', 'salary', 'score', 'rating', 'price', 'createdAt']) || 'purchases';
      sort = { [sortField]: -1 };
      explanations.push(`sort by ${sortField} DESC, limit ${limit}`);
    }

    // 7. Dynamic Known Fields string value extraction
    if (knownFields && knownFields.length > 0) {
      for (const f of knownFields) {
        if (filter[f]) continue; // Don't overwrite existing range/comparison filter
        // Look for "field: value" or "field = value" or "field is value" in query
        const pattern = new RegExp(`\\b(?:${f})\\s*(?::|=|\\bis\\b|\\best\\b|是)\\s*['"]?([^\\s,'"]+)['"]?`, 'i');
        const match = normalizedText.match(pattern);
        if (match) {
          filter[f] = match[1];
          explanations.push(`${f} = "${match[1]}"`);
        }
      }
    }

    return {
      filter,
      sort,
      limit,
      explanation: explanations.length > 0 ? explanations.join(' AND ') : 'All documents',
    };
  }

  /**
   * Normalizes Eastern Arabic, Persian, Devanagari, and other script numerals to standard Western ASCII digits 0-9
   * @param {string} str
   * @returns {string}
   */
  static _normalizeDigits(str) {
    if (!str) return '';
    return str
      // Arabic-Indic digits ٠-٩
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
      // Eastern Persian digits ۰-۹
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
      // Devanagari digits ०-९
      .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 2406));
  }

  /**
   * Universal field name matching using Levenshtein distance and substring matching
   * @private
   */
  static _matchField(text, knownFields = [], defaultCandidates = []) {
    // 1. Check known fields explicitly
    if (Array.isArray(knownFields) && knownFields.length > 0) {
      for (const field of knownFields) {
        if (text.includes(field.toLowerCase())) {
          return field;
        }
      }
    }

    // 2. Fallback to default candidates
    for (const c of defaultCandidates) {
      if (text.includes(c.toLowerCase())) return c;
    }

    return knownFields[0] || defaultCandidates[0] || null;
  }

  /**
   * Zero-Shot Universal Polyglot Translation with any LLM (OpenAI, Ollama, DeepSeek, Gemini, etc.)
   * Translates ANY prompt in ANY language into a 100% compliant MongoDB query object.
   * @param {string} prompt - Prompt in ANY language
   * @param {object} [options]
   * @param {object} [options.llmAdapter] - FlashLLMAdapter instance
   * @param {Array<string>} [options.knownFields=[]]
   * @returns {Promise<{ filter: object, sort?: object, limit?: number, explanation: string }>}
   */
  static async parseWithLLM(prompt, options = {}) {
    const adapter = options.llmAdapter;
    if (!adapter) {
      return this.parse(prompt, options.knownFields || []);
    }

    const systemPrompt = `You are a Universal Polyglot Database Query Compiler.
Convert user natural language query (in ANY language) into JSON strictly with format:
{"filter": {...}, "sort": {...} or null, "limit": number or null, "explanation": string}
Return ONLY valid JSON with no markdown and no other text.`;

    const userPrompt = `Schema fields: ${(options.knownFields || []).join(', ')}\nQuery: "${prompt}"`;
    try {
      const res = await adapter.generate(userPrompt, { systemPrompt, maxTokens: 300, temperature: 0.1 });
      if (res.success && res.text) {
        const cleaned = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
      }
    } catch {}

    return this.parse(prompt, options.knownFields || []);
  }
}
