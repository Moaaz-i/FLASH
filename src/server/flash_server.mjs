import http from 'node:http';
import crypto from 'node:crypto';
import { FlashDatabase } from '../core/database.mjs';
import { FlashMetrics } from './metrics.mjs';
import { logger } from '../core/logger.mjs';
import { FlashRecordCodec } from '../client/record_codec.mjs';
import { assertServerOptions } from '../client/config_guard.mjs';
import { reportError } from '../core/report_error.mjs';

function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHmac('sha256', 'safe-key-server').update(a).digest();
  const hashB = crypto.createHmac('sha256', 'safe-key-server').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * FLASH Standalone Server Daemon (FlashServer)
 * High-performance Zero-Knowledge Database Server that runs on a dedicated server / container,
 * listening for remote FlashClient connections over the network.
 */
export class FlashServer {
  /**
   * @param {object} [options]
   * @param {number} [options.port=6742]
   * @param {string} [options.host='127.0.0.1']
   * @param {string} [options.storagePath='./flash_server_data']
   * @param {string} [options.authKey]
   */
  constructor(options = {}) {
    reportError.watch();
    assertServerOptions(options);
    this.options = options;
    this.server = null;
  }

  start() {
    this.server = FlashServer.start(this.options);
    return this.server;
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Starts a standalone FLASH Database Server daemon

   * @param {object} options
   * @param {number} [options.port=6742] - Default FLASH port (6742)
   * @param {string} [options.host='127.0.0.1']
   * @param {string} [options.storagePath='./flash_server_data']
   * @param {string} [options.authKey] - Optional server connection secret
   * @returns {http.Server}
   */
  static start(options = {}) {
    reportError.watch();
    assertServerOptions(options);
    const port = options.port || 6742;
    const host = options.host || '127.0.0.1';
    const storagePath = options.storagePath || './flash_server_data';
    const dbName = options.dbName || 'flash_server_db';
    const authKey = options.authKey || null;
    const engineOptions = options.engineOptions || {};

    const db = new FlashDatabase(dbName, { storagePath, engineOptions });
    const metrics = new FlashMetrics();

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
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-flash-server-key');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }

      const url = new URL(req.url, `http://${host}:${port}`);

      // Public health check route
      if (url.pathname === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'HEALTHY', engine: 'FLASH Zero-Knowledge Server', version: '1.0.0' }));
      }

      // Server Authentication Verification
      if (authKey) {
        const clientKey = req.headers['x-flash-server-key'];
        if (!clientKey || !timingSafeCompare(clientKey, authKey)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Unauthorized: Invalid server authKey' }));
        }
      }

      // Prometheus Telemetry Endpoint (Protected)
      if (url.pathname === '/metrics' && req.method === 'GET') {
        // Compute storage-level gauges on every metrics pull
        for (const colName of db.listCollections()) {
          try {
            const col = db.collection(colName);
            await col.init();
            metrics.setGauge(`storage_${colName}_sstables`, col.sstables.length);
            metrics.setGauge(`storage_${colName}_memtable_bytes`, col.memtable.byteSize);
            metrics.setGauge(`storage_${colName}_doc_count`, col.docOrder.length);
          } catch {}
        }
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
        return res.end(metrics.toPrometheus());
      }

      const readBody = (limitBytes = 10 * 1024 * 1024) => new Promise((resolve, reject) => {
        let body = '';
        let bytesRead = 0;
        req.on('data', chunk => {
          bytesRead += chunk.length;
          if (bytesRead > limitBytes) {
            req.destroy();
            reject(new Error('Payload too large'));
            return;
          }
          body += chunk;
        });
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (e) {
            reject(new Error('Invalid JSON payload'));
          }
        });
        req.on('error', reject);
      });

      // List Collections
      if (url.pathname === '/api/v1/collections' && req.method === 'GET') {
        const collections = db.listCollections();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ collections }));
      }

      const startOpTime = Date.now();

      // Execute Raw Encrypted Find
      if (url.pathname.startsWith('/api/v1/query/') && req.method === 'POST') {
        const colName = decodeURIComponent(url.pathname.replace('/api/v1/query/', ''));
        try {
          const { envelope, options } = await readBody();
          const col = db.collection(colName);
          await col.init();
          const records = await col.find(envelope || {}, options || {});
          const wireRecords = records.map((r) =>
            Buffer.isBuffer(r) ? FlashRecordCodec.encodeForWire(r) : r,
          );
          const durationMs = Date.now() - startOpTime;
          metrics.recordOp('find', durationMs);
          logger.info('FlashServer', 'find completed', { collection: colName, durationMs });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ records: wireRecords }));
        } catch (err) {
          metrics.recordError('find');
          logger.error('FlashServer', 'find failed', { collection: colName, error: err.message });
          res.writeHead(500, { 'Content-Type': 'application/json' });
          const isClientError = err.message.includes('Invalid or dangerous collection name');
          return res.end(JSON.stringify({ error: isClientError ? err.message : 'Internal Server Error' }));
        }
      }

      // Execute Raw Encrypted Insert
      if (url.pathname.startsWith('/api/v1/insert/') && req.method === 'POST') {
        const colName = decodeURIComponent(url.pathname.replace('/api/v1/insert/', ''));
        try {
          const { encryptedRecord } = await readBody();
          const col = db.collection(colName);
          await col.init();
          const recordBuf = FlashRecordCodec.decodeFromWire(encryptedRecord);
          const result = await col.insertOne(recordBuf);
          const durationMs = Date.now() - startOpTime;
          metrics.recordOp('insert', durationMs);
          logger.info('FlashServer', 'insert completed', { collection: colName, durationMs });
          res.writeHead(201, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, result }));
        } catch (err) {
          metrics.recordError('insert');
          logger.error('FlashServer', 'insert failed', { collection: colName, error: err.message });
          res.writeHead(500, { 'Content-Type': 'application/json' });
          const isClientError = err.message.includes('Invalid or dangerous collection name');
          return res.end(JSON.stringify({ error: isClientError ? err.message : 'Internal Server Error' }));
        }
      }

      // Execute Raw Encrypted Batch Insert
      if (url.pathname.startsWith('/api/v1/insertMany/') && req.method === 'POST') {
        const colName = decodeURIComponent(url.pathname.replace('/api/v1/insertMany/', ''));
        try {
          const { encryptedRecords } = await readBody();
          const col = db.collection(colName);
          await col.init();
          const recordBufs = (encryptedRecords || []).map((r) =>
            FlashRecordCodec.decodeFromWire(r),
          );
          const result = await col.insertMany(recordBufs);
          const durationMs = Date.now() - startOpTime;
          metrics.recordOp('insertMany', durationMs);
          logger.info('FlashServer', 'insertMany completed', {
            collection: colName,
            count: result.insertedCount,
            durationMs,
          });
          res.writeHead(201, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, result }));
        } catch (err) {
          metrics.recordError('insertMany');
          logger.error('FlashServer', 'insertMany failed', { collection: colName, error: err.message });
          res.writeHead(500, { 'Content-Type': 'application/json' });
          const isClientError = err.message.includes('Invalid or dangerous collection name');
          return res.end(JSON.stringify({ error: isClientError ? err.message : 'Internal Server Error' }));
        }
      }

      // Execute Raw Encrypted Delete
      if (url.pathname.startsWith('/api/v1/delete/') && req.method === 'POST') {
        const colName = decodeURIComponent(url.pathname.replace('/api/v1/delete/', ''));
        try {
          const { filter } = await readBody();
          const col = db.collection(colName);
          await col.init();
          const result = await col.deleteOne(filter || {});
          const durationMs = Date.now() - startOpTime;
          metrics.recordOp('delete', durationMs);
          logger.info('FlashServer', 'delete completed', { collection: colName, durationMs });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, result }));
        } catch (err) {
          metrics.recordError('delete');
          logger.error('FlashServer', 'delete failed', { collection: colName, error: err.message });
          res.writeHead(500, { 'Content-Type': 'application/json' });
          const isClientError = err.message.includes('Invalid or dangerous collection name');
          return res.end(JSON.stringify({ error: isClientError ? err.message : 'Internal Server Error' }));
        }
      }

      // Execute Raw Flush
      if (url.pathname.startsWith('/api/v1/flush/') && req.method === 'POST') {
        const colName = decodeURIComponent(url.pathname.replace('/api/v1/flush/', ''));
        try {
          const col = db.collection(colName);
          await col.flush();
          const durationMs = Date.now() - startOpTime;
          metrics.recordOp('flush', durationMs);
          logger.info('FlashServer', 'flush completed', { collection: colName, durationMs });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Flushed' }));
        } catch (err) {
          metrics.recordError('flush');
          logger.error('FlashServer', 'flush failed', { collection: colName, error: err.message });
          res.writeHead(500, { 'Content-Type': 'application/json' });
          const isClientError = err.message.includes('Invalid or dangerous collection name');
          return res.end(JSON.stringify({ error: isClientError ? err.message : 'Internal Server Error' }));
        }
      }

      // 404 Route
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found on FLASH Server' }));
    });

    server.listen(port, host, () => {
      logger.info('FlashServer', 'server started', { host, port, storagePath });
    });

    return server;
  }
}

export { FlashMetrics };

