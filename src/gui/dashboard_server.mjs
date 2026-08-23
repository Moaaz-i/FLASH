import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { handleIntelligenceApi } from "./intelligence_api.mjs";

function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHmac('sha256', 'safe-key-dashboard').update(a).digest();
  const hashB = crypto.createHmac('sha256', 'safe-key-dashboard').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.join(__dirname, "static");

const STATIC_FILES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/console.css": "console.css",
  "/console.js": "console.js",
};

function readBody(req, limitBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytesRead = 0;
    req.on("data", (chunk) => {
      bytesRead += chunk.length;
      if (bytesRead > limitBytes) {
        req.destroy();
        reject(new Error("Payload too large"));
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON payload"));
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function serveStatic(urlPath, res) {
  const file = STATIC_FILES[urlPath];
  if (!file) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const filePath = path.join(STATIC_DIR, file);
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  const ext = path.extname(filePath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
  };
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": types[ext] || "text/plain" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

/**
 * FLASH Intelligence Console — focused UI for RAG, agent memory, vault, and trust tools.
 * Includes a minimal Data Explorer for collection inspection.
 */
export class FlashDashboard {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   * @param {object} [options]
   * @param {number} [options.port=3456]
   * @param {string} [options.host='127.0.0.1']
   * @param {string} [options.token]
   * @returns {http.Server}
   */
  static start(client, options = {}) {
    const port = options.port || 3456;
    const host = options.host || "127.0.0.1";
    const requiredToken = options.token || null;

    const server = http.createServer(async (req, res) => {
      // Secure CORS headers
      const origin = req.headers.origin;
      if (origin) {
        try {
          const originUrl = new URL(origin);
          if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1' || originUrl.hostname === '[::1]') {
            res.setHeader('Access-Control-Allow-Origin', origin);
          } else {
            res.setHeader('Access-Control-Allow-Origin', 'null');
          }
        } catch {
          res.setHeader('Access-Control-Allow-Origin', 'null');
        }
      } else {
        res.setHeader('Access-Control-Allow-Origin', 'null');
      }
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, x-flash-token",
      );

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
      }

      const url = new URL(req.url, `http://localhost:${port}`);

      if (requiredToken && url.pathname.startsWith("/api/")) {
        const clientToken = req.headers["x-flash-token"];
        if (!clientToken || !timingSafeCompare(clientToken, requiredToken)) {
          return json(res, 401, {
            error: "Unauthorized: Invalid or missing dashboard token",
          });
        }
      }

      try {
        if (url.pathname.startsWith("/api/intelligence/")) {
          const handled = await handleIntelligenceApi(
            client,
            url,
            req.method,
            () => readBody(req),
            res,
          );
          if (handled !== false) return;
        }

        if (url.pathname === "/api/stats" && req.method === "GET") {
          const collections = await (typeof client.listCollections ===
          "function"
            ? client.listCollections()
            : client.db.listCollections());
          const stats = [];
          for (const colName of collections || []) {
            const col = client.collection(colName);
            const count = await col.count();
            stats.push({
              name: colName,
              count,
              merkleRoot:
                typeof col.raw.getMerkleRoot === "function"
                  ? col.raw.getMerkleRoot()
                  : "Verified",
            });
          }
          return json(res, 200, {
            dbName: client.db.dbName,
            collections: stats,
            requiresAuth: !!requiredToken,
            uptime: process.uptime(),
          });
        }

        if (url.pathname.startsWith("/api/docs/") && req.method === "GET") {
          const colName = decodeURIComponent(
            url.pathname.replace("/api/docs/", ""),
          );
          const col = client.collection(colName);
          const docs = await col.find({}, { limit: 300 });
          return json(res, 200, docs);
        }

        if (url.pathname.startsWith("/api/docs/") && req.method === "POST") {
          const colName = decodeURIComponent(
            url.pathname.replace("/api/docs/", ""),
          );
          const payload = await readBody(req);
          const col = client.collection(colName);
          const result = Array.isArray(payload)
            ? await col.insertMany(payload)
            : await col.insertOne(payload);
          return json(res, 201, { success: true, result });
        }

        if (url.pathname.startsWith("/api/docs/") && req.method === "DELETE") {
          const parts = url.pathname.split("/").filter(Boolean);
          const colName = decodeURIComponent(parts[2]);
          const docId = decodeURIComponent(parts[3] || "");
          const col = client.collection(colName);
          const result = await col.deleteOne({ _id: docId });
          return json(res, 200, { success: true, result });
        }

        if (url.pathname === "/api/collections" && req.method === "POST") {
          const { name } = await readBody(req);
          if (!name) throw new Error("Collection name required");
          const col = client.collection(name);
          await col.raw.init();
          return json(res, 201, { success: true, name });
        }

        if (url.pathname.startsWith("/api/flush/") && req.method === "POST") {
          const colName = decodeURIComponent(
            url.pathname.replace("/api/flush/", ""),
          );
          const col = client.collection(colName);
          await col.raw.flush();
          return json(res, 200, {
            success: true,
            message: "Flushed to SSTable",
          });
        }

        serveStatic(url.pathname, res);
      } catch (err) {
        json(res, 500, { error: err.message });
      }
    });

    server.listen(port, host);
    return server;
  }
}
