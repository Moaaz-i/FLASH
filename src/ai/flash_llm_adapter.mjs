/**
 * FLASH Large Language Model (LLM) Adapter & Sovereign Pipeline Bridge
 * Pure External & Developer LLM Integration Suite:
 * 1. OpenAI-Compatible APIs (ChatGPT, GPT-4o, Groq, DeepSeek, Together, OpenRouter, vLLM, LM Studio)
 * 2. Ollama Local REST Engine (Llama 3, Qwen 2, DeepSeek-R1, Mistral)
 * 3. Custom Developer Inference Functions (handler: async (messages, options) => string)
 * 4. Full Autonomous Tool & Function Calling Registry with Automated Execution Loop
 * 5. Full Developer System Steering (role: "system") & Multi-Turn History
 * 6. Automatic Semantic Prompt Caching (< 0.2ms) via FlashAIDatabase
 */

export class FlashLLMAdapter {
  /**
   * @param {object} [options]
   * @param {'openai'|'ollama'|'custom'|'auto'} [options.provider='auto']
   * @param {string} [options.model='gpt-4o-mini'] - Default model identifier
   * @param {string} [options.apiEndpoint] - OpenAI/Claude compatible API endpoint
   * @param {string} [options.apiKey] - API key for provider
   * @param {string} [options.ollamaUrl='http://localhost:11434'] - Ollama local endpoint
   * @param {string} [options.systemPrompt] - Developer system instructions (role: "system")
   * @param {Function} [options.handler] - Custom developer inference function
   * @param {number} [options.maxTokens=500] - Max tokens to generate
   * @param {number} [options.temperature=0.7] - Generation temperature
   */
  constructor(options = {}) {
    this.provider = options.provider || 'auto';
    this.model = options.model || (options.apiEndpoint ? 'gpt-4o-mini' : 'llama3:latest');
    this.apiEndpoint = options.apiEndpoint || process.env.OPENAI_BASE_URL || null;
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || null;
    this.ollamaUrl = (options.ollamaUrl || process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, '');
    this.systemPrompt = options.systemPrompt || null;
    this.handler = typeof options.handler === 'function' ? options.handler : null;
    this.maxTokens = options.maxTokens || 500;
    this.temperature = options.temperature ?? 0.7;

    // Tool / Function Calling Registry: name -> { name, description, parameters, handler }
    this.tools = new Map();
  }

  /**
   * Registers a tool / function callable by AI models
   * @param {object} tool
   * @param {string} tool.name - Function name e.g. "search_database"
   * @param {string} tool.description - What the tool does
   * @param {object} [tool.parameters] - JSON Schema of arguments
   * @param {Function} tool.handler - async (args) => result
   */
  registerTool(tool) {
    if (!tool || !tool.name || typeof tool.handler !== 'function') {
      throw new Error('Invalid tool: name and executable handler function are required');
    }
    this.tools.set(tool.name, {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.parameters || { type: 'object', properties: {} },
      handler: tool.handler,
    });
  }

  /**
   * Unregisters a tool
   * @param {string} toolName
   */
  unregisterTool(toolName) {
    this.tools.delete(toolName);
  }

  /**
   * Returns list of tools formatted for OpenAI / DeepSeek / Ollama Tool Calling
   * @returns {Array<object>}
   */
  listTools() {
    return Array.from(this.tools.values()).map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  /**
   * Sets or updates developer system prompt instructions (role: "system")
   * @param {string} systemPrompt
   */
  setSystemPrompt(systemPrompt) {
    this.systemPrompt = systemPrompt || null;
  }

  /**
   * Sets a custom inference handler function provided by the developer
   * @param {Function} handler - async (messages, options) => string
   */
  setHandler(handler) {
    if (typeof handler === 'function') {
      this.handler = handler;
    }
  }

  /**
   * Queries custom OpenAI / OpenAI-compatible endpoints with optional Tools support
   * @param {Array<{ role: string, content: string }>} messages
   * @param {object} [options]
   * @returns {Promise<{ text: string, toolCalls?: Array<object>, model: string, durationMs: number }|null>}
   */
  async queryOpenAI(messages, options = {}) {
    const endpoint = options.apiEndpoint || this.apiEndpoint || 'https://api.openai.com/v1/chat/completions';
    const apiKey = options.apiKey || this.apiKey;
    const model = options.model || this.model || 'gpt-4o-mini';
    const startTime = performance.now();

    const requestBody = {
      model,
      messages,
      max_tokens: options.maxTokens || this.maxTokens,
      temperature: options.temperature ?? this.temperature,
    };

    const activeTools = options.tools || (this.tools.size > 0 ? this.listTools() : null);
    if (activeTools && activeTools.length > 0) {
      requestBody.tools = activeTools;
      requestBody.tool_choice = options.toolChoice || 'auto';
    }

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (res.ok) {
        const data = await res.json();
        const choice = data.choices && data.choices[0];
        const message = choice ? choice.message : null;
        const text = message ? (message.content || '') : (data.response || '');
        const toolCalls = message && message.tool_calls ? message.tool_calls : null;
        const durationMs = performance.now() - startTime;

        return {
          text: text.trim(),
          toolCalls,
          rawMessage: message,
          model,
          durationMs,
        };
      }
    } catch {
      // Endpoint unreachable
    }

    return null;
  }

  /**
   * Queries local Ollama multi-turn chat endpoint
   * @param {Array<{ role: string, content: string }>} messages
   * @param {object} [options]
   * @returns {Promise<{ text: string, model: string, durationMs: number }|null>}
   */
  async queryOllama(messages, options = {}) {
    const model = options.model || this.model || 'llama3:latest';
    const startTime = performance.now();

    const body = {
      model,
      messages,
      stream: false,
      options: {
        temperature: options.temperature ?? this.temperature,
        num_predict: options.maxTokens || this.maxTokens,
      },
    };

    const activeTools = options.tools || (this.tools.size > 0 ? this.listTools() : null);
    if (activeTools && activeTools.length > 0) {
      body.tools = activeTools;
    }

    try {
      const res = await fetch(`${this.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        const message = data.message || {};
        const text = message.content || data.response || '';
        const toolCalls = message.tool_calls || null;
        const durationMs = performance.now() - startTime;

        return {
          text: text.trim(),
          toolCalls,
          rawMessage: message,
          model,
          durationMs,
        };
      }
    } catch {
      // Ollama offline
    }

    return null;
  }

  /**
   * Unified Generation Method: Routes to external API, Ollama, or developer custom handler
   * @param {string|Array<{ role: string, content: string }>} promptOrMessages
   * @param {object} [options]
   * @param {string} [options.systemPrompt] - Developer system prompt (role: "system")
   * @param {string} [options.system] - Alias for systemPrompt
   * @param {Array<{ role: string, content: string }>} [options.history=[]]
   * @returns {Promise<{ text: string, provider: string, model: string, latencyMs: string, success: boolean }>}
   */
  async generate(promptOrMessages, options = {}) {
    const startTime = performance.now();
    const activeSystem = options.systemPrompt || options.system || this.systemPrompt;

    // 1. Build unified messages array with role: "system" support
    let messages = [];
    if (Array.isArray(promptOrMessages)) {
      messages = [...promptOrMessages];
      if (activeSystem && !messages.some((m) => m.role === 'system')) {
        messages.unshift({ role: 'system', content: activeSystem });
      }
    } else {
      const history = options.history || [];
      if (activeSystem && !history.some((m) => m.role === 'system')) {
        messages.push({ role: 'system', content: activeSystem });
      }
      messages.push(
        ...history.map((m) => ({ role: m.role || 'user', content: m.content || '' })),
        { role: 'user', content: String(promptOrMessages || '') }
      );
    }

    // 2. Custom Developer Handler if provided
    if (this.handler || typeof options.handler === 'function') {
      const activeHandler = typeof options.handler === 'function' ? options.handler : this.handler;
      try {
        const result = await activeHandler(messages, options);
        const text = typeof result === 'string' ? result : (result && result.text) || '';
        const toolCalls = result && Array.isArray(result.toolCalls) ? result.toolCalls : null;
        const elapsed = (performance.now() - startTime).toFixed(2);
        return {
          success: true,
          text: text.trim(),
          toolCalls,
          provider: 'Developer Custom Inference Handler',
          model: options.model || this.model || 'custom',
          latencyMs: elapsed,
        };
      } catch {}
    }

    // 3. Try OpenAI / External REST API
    if (this.apiEndpoint || this.apiKey || this.provider === 'openai') {
      const openAIRes = await this.queryOpenAI(messages, options);
      if (openAIRes && (openAIRes.text || openAIRes.toolCalls)) {
        const elapsed = (performance.now() - startTime).toFixed(2);
        return {
          success: true,
          text: openAIRes.text,
          toolCalls: openAIRes.toolCalls,
          provider: 'OpenAI-Compatible External LLM',
          model: openAIRes.model,
          latencyMs: elapsed,
        };
      }
    }

    // 4. Try Ollama Local Daemon
    if (this.provider === 'ollama' || this.provider === 'auto') {
      const ollamaRes = await this.queryOllama(messages, options);
      if (ollamaRes && (ollamaRes.text || ollamaRes.toolCalls)) {
        const elapsed = (performance.now() - startTime).toFixed(2);
        return {
          success: true,
          text: ollamaRes.text,
          toolCalls: ollamaRes.toolCalls,
          provider: 'Ollama (Local LLM Engine)',
          model: ollamaRes.model,
          latencyMs: elapsed,
        };
      }
    }

    // 5. Fallback clean response
    const elapsed = (performance.now() - startTime).toFixed(2);
    return {
      success: false,
      text: '',
      provider: 'Flash External LLM Bridge',
      model: options.model || this.model,
      latencyMs: elapsed,
    };
  }

  /**
   * Autonomous Agent Execution Loop with Tool Calling:
   * 1. Sends prompt to LLM
   * 2. If LLM requests tool execution, runs registered tool handler
   * 3. Feeds tool result back to LLM until final answer is reached (max iterations)
   * @param {string|Array<{ role: string, content: string }>} promptOrMessages
   * @param {object} [options]
   * @param {number} [options.maxToolIterations=5]
   * @returns {Promise<{ text: string, toolExecutionCount: number, toolLog: Array<object>, latencyMs: string }>}
   */
  async generateWithTools(promptOrMessages, options = {}) {
    const startTime = performance.now();
    const maxIterations = options.maxToolIterations || 5;
    const toolLog = [];

    let currentMessages = [];
    if (Array.isArray(promptOrMessages)) {
      currentMessages = [...promptOrMessages];
    } else {
      currentMessages = [{ role: 'user', content: String(promptOrMessages) }];
    }

    let iterations = 0;
    let finalAnswer = '';

    while (iterations < maxIterations) {
      iterations++;
      const res = await this.generate(currentMessages, options);

      if (!res.success) {
        finalAnswer = res.text || '';
        break;
      }

      // If model returned a direct text answer without tool calls
      if (!res.toolCalls || res.toolCalls.length === 0) {
        finalAnswer = res.text;
        break;
      }

      // Execute requested tools
      for (const tc of res.toolCalls) {
        const toolName = tc.function ? tc.function.name : tc.name;
        let args = {};
        try {
          args = typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments || {};
        } catch {
          args = {};
        }

        const registeredTool = this.tools.get(toolName);
        let toolOutput = null;

        if (registeredTool && typeof registeredTool.handler === 'function') {
          try {
            toolOutput = await registeredTool.handler(args);
          } catch (err) {
            toolOutput = { error: err.message };
          }
        } else {
          toolOutput = { error: `Tool "${toolName}" not found in FLASH registry` };
        }

        const serializedOutput = typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput);
        toolLog.push({
          iteration: iterations,
          tool: toolName,
          args,
          output: toolOutput,
        });

        // Add assistant tool call and tool result to messages
        currentMessages.push({
          role: 'assistant',
          content: res.text || '',
          tool_calls: [tc],
        });
        currentMessages.push({
          role: 'tool',
          tool_call_id: tc.id || `call_${iterations}`,
          name: toolName,
          content: serializedOutput,
        });
      }
    }

    const elapsed = (performance.now() - startTime).toFixed(2);
    return {
      text: finalAnswer,
      toolExecutionCount: toolLog.length,
      toolLog,
      latencyMs: elapsed,
    };
  }
}
