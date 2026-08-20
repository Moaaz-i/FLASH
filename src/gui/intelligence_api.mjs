import { FlashPromptFirewall } from "../security/prompt_firewall.mjs";

/** @type {Map<string, import('../security/sealed_vault.mjs').FlashSealedVault>} */
const vaultRegistry = new Map();

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
  return true;
}

function getVault(client, vaultName) {
  const key = vaultName || "default";
  if (!vaultRegistry.has(key)) {
    vaultRegistry.set(key, client.sealedVault(key));
  }
  return vaultRegistry.get(key);
}

/**
 * Handle /api/intelligence/* routes for FLASH Intelligence Console.
 * @returns {boolean} true if handled
 */
export async function handleIntelligenceApi(
  client,
  url,
  method,
  readBody,
  res,
) {
  const path = url.pathname;

  if (path === "/api/intelligence/overview" && method === "GET") {
    try {
      const collections =
        typeof client.listCollections === "function"
          ? await client.listCollections()
          : client.db.listCollections();
      return json(res, 200, {
        dbName: client.db.dbName,
        collectionCount: (collections || []).length,
        uptime: process.uptime(),
        modules: ["private-rag", "agent-memory", "sealed-vault", "trust"],
      });
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  }

  if (path === "/api/intelligence/rag/ingest" && method === "POST") {
    try {
      const body = await readBody();
      const rag = client.privateRAG(body.collection || "knowledge");
      const result = await rag.ingest({
        title: body.title || "Untitled",
        text: body.text || "",
        metadata: body.metadata || {},
      });
      return json(res, 201, { success: true, ...result, stats: rag.stats });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (path === "/api/intelligence/rag/ask" && method === "POST") {
    try {
      const body = await readBody();
      if (!body.question?.trim()) {
        return json(res, 400, { error: "question is required" });
      }
      const rag = client.privateRAG(body.collection || "knowledge");
      const result = await rag.ask(body.question, {
        topK: body.topK ?? 8,
        maxTokens: body.maxTokens ?? 1500,
      });
      return json(res, 200, result);
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (path === "/api/intelligence/memory/remember" && method === "POST") {
    try {
      const body = await readBody();
      if (!body.content?.trim()) {
        return json(res, 400, { error: "content is required" });
      }
      const memory = client.agentMemory(body.namespace || "default");
      const result = await memory.remember(body.content, {
        tags: body.tags || [],
        importance: body.importance ?? 1,
      });
      return json(res, 201, { success: true, ...result, stats: memory.stats });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (path === "/api/intelligence/memory/recall" && method === "POST") {
    try {
      const body = await readBody();
      const memory = client.agentMemory(body.namespace || "default");
      const results = await memory.recall(body.query || "", {
        topK: body.topK ?? 8,
      });
      return json(res, 200, { results, stats: memory.stats });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (
    path.startsWith("/api/intelligence/memory/") &&
    method === "DELETE"
  ) {
    const parts = path.split("/").filter(Boolean);
    const namespace = decodeURIComponent(parts[3] || "default");
    const memoryId = decodeURIComponent(parts[4] || "");
    try {
      const memory = client.agentMemory(namespace);
      await memory.forget(memoryId);
      return json(res, 200, { success: true });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (path === "/api/intelligence/vault/unlock" && method === "POST") {
    try {
      const body = await readBody();
      const vault = getVault(client, body.vaultName || "default");
      vault.unlock(body.passphrase || "");
      return json(res, 200, {
        success: true,
        vaultName: body.vaultName || "default",
        locked: false,
      });
    } catch (err) {
      return json(res, 401, { error: err.message });
    }
  }

  if (path === "/api/intelligence/vault/lock" && method === "POST") {
    try {
      const body = await readBody();
      const vault = getVault(client, body.vaultName || "default");
      vault.lock();
      return json(res, 200, {
        success: true,
        vaultName: body.vaultName || "default",
        locked: true,
      });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (path === "/api/intelligence/vault/status" && method === "GET") {
    const vaultName = url.searchParams.get("vaultName") || "default";
    const vault = getVault(client, vaultName);
    return json(res, 200, {
      vaultName,
      locked: vault.isLocked,
    });
  }

  if (path === "/api/intelligence/vault/list" && method === "GET") {
    try {
      const vaultName = url.searchParams.get("vaultName") || "default";
      const vault = getVault(client, vaultName);
      const records = await vault.list();
      return json(res, 200, { records });
    } catch (err) {
      return json(res, 403, { error: err.message });
    }
  }

  if (path === "/api/intelligence/vault/put" && method === "POST") {
    try {
      const body = await readBody();
      const vault = getVault(client, body.vaultName || "default");
      await vault.put(body.recordId, body.payload || {});
      return json(res, 201, { success: true, recordId: body.recordId });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (path.startsWith("/api/intelligence/vault/") && method === "DELETE") {
    const parts = path.split("/").filter(Boolean);
    const vaultName = decodeURIComponent(parts[3] || "default");
    const recordId = decodeURIComponent(parts[4] || "");
    try {
      const vault = getVault(client, vaultName);
      await vault.remove(recordId);
      return json(res, 200, { success: true });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (path === "/api/intelligence/proof" && method === "POST") {
    try {
      const body = await readBody();
      const collection = body.collection;
      if (!collection) {
        return json(res, 400, { error: "collection is required" });
      }
      const proof = await client.integrityProof(collection, {
        actor: body.actor || "console",
      });
      return json(res, 200, { proof });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (path === "/api/intelligence/firewall/scan" && method === "POST") {
    try {
      const body = await readBody();
      const scan = FlashPromptFirewall.scan(body.text || "", {
        redact: body.redact !== false,
      });
      return json(res, 200, scan);
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  return false;
}
