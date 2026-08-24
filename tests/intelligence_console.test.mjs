import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";

import { FlashClient } from "../src/index.mjs";

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json();
  return { res, data };
}

test("Intelligence Console: serves static assets with correct types", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-console-static-"));
  const port = await getFreePort();

  try {
    const client = new FlashClient({
      secretKey: "console_static_key",
      storagePath: tmpDir,
    });
    const server = client.openDashboard({
      port,
      host: "127.0.0.1",
      token: "console_static_token16",
    });
    await new Promise((r) => setTimeout(r, 50));

    const base = `http://127.0.0.1:${port}`;
    const html = await fetch(`${base}/`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Intelligence Console/);

    const js = await fetch(`${base}/console.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get("content-type") || "", /javascript/);
    const jsBody = await js.text();
    assert.doesNotThrow(() => {
      new Function(jsBody);
    });

    const css = await fetch(`${base}/console.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type") || "", /css/);

    server.close();
    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Intelligence Console: RAG ingest + ask API", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-console-rag-"));
  const port = await getFreePort();

  try {
    const client = new FlashClient({
      secretKey: "console_rag_key!!!!",
      storagePath: tmpDir,
    });
    const token = "console_rag_token_16";
    const server = client.openDashboard({ port, host: "127.0.0.1", token });
    await new Promise((r) => setTimeout(r, 50));

    const base = `http://127.0.0.1:${port}`;
    const ingest = await fetchJson(`${base}/api/intelligence/rag/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-flash-token": token,
      },
      body: JSON.stringify({
        collection: "knowledge",
        title: "Security",
        text: "FLASH encrypts all documents client-side before storage.",
      }),
    });
    assert.equal(ingest.res.status, 201);
    assert.equal(ingest.data.success, true);
    assert.ok(ingest.data.chunks >= 1);

    const ask = await fetchJson(`${base}/api/intelligence/rag/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-flash-token": token,
      },
      body: JSON.stringify({
        collection: "knowledge",
        question: "client-side encryption",
      }),
    });
    assert.equal(ask.res.status, 200);
    assert.equal(ask.data.serverSawPlaintext, false);
    assert.ok(ask.data.contextPack);

    server.close();
    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Intelligence Console: memory + firewall + token auth", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-console-api-"));
  const port = await getFreePort();
  const token = "console_secret_token";

  try {
    const client = new FlashClient({
      secretKey: "console_api_key",
      storagePath: tmpDir,
    });
    const server = client.openDashboard({
      port,
      host: "127.0.0.1",
      token,
    });
    await new Promise((r) => setTimeout(r, 50));

    const base = `http://127.0.0.1:${port}`;

    const unauthorized = await fetch(`${base}/api/stats`);
    assert.equal(unauthorized.status, 401);

    const headers = {
      "Content-Type": "application/json",
      "x-flash-token": token,
    };

    const remember = await fetchJson(`${base}/api/intelligence/memory/remember`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        namespace: "bot",
        content: "User prefers dark mode",
        importance: 2,
      }),
    });
    assert.equal(remember.res.status, 201);
    assert.ok(remember.data.memoryId);

    const recall = await fetchJson(`${base}/api/intelligence/memory/recall`, {
      method: "POST",
      headers,
      body: JSON.stringify({ namespace: "bot", query: "UI theme" }),
    });
    assert.equal(recall.res.status, 200);
    assert.ok(recall.data.results.length >= 1);

    const scan = await fetchJson(`${base}/api/intelligence/firewall/scan`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        text: "Contact me at user@example.com with key sk-123456789012345678901234567890",
      }),
    });
    assert.equal(scan.res.status, 200);
    assert.equal(scan.data.safe, false);
    assert.ok(scan.data.violations.includes("email"));

    server.close();
    await client.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
