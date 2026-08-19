import { FlashServer } from "./flash_server.mjs";
import { FlashWireServer } from "../protocol/flash_wire.mjs";
import { FlashDatabase } from "../core/database.mjs";

/**
 * Lightweight edge daemon — HTTP + FLASH wire on one node.
 */
export class FlashEdgeNode {
  /**
   * @param {object} [options]
   * @param {number} [options.httpPort=6742]
   * @param {number} [options.wirePort=6744]
   * @param {string} [options.storagePath='./flash_edge_data']
   */
  constructor(options = {}) {
    this.options = options;
    this.httpServer = null;
    this.wireServer = null;
    this.db = null;
  }

  async start() {
    const storagePath = this.options.storagePath || "./flash_edge_data";
    const dbName = this.options.dbName || "flash_edge";

    this.httpServer = FlashServer.start({
      port: this.options.httpPort ?? 6742,
      host: this.options.host || "127.0.0.1",
      storagePath,
      dbName,
      authKey: this.options.authKey,
    });

    this.db = new FlashDatabase(dbName, { storagePath });
    this.wireServer = new FlashWireServer(this.db, {
      port: this.options.wirePort ?? 6744,
      host: this.options.host || "127.0.0.1",
    });
    await this.wireServer.start();

    return {
      httpPort: this.options.httpPort ?? 6742,
      wirePort: this.options.wirePort ?? 6744,
      mode: "edge",
    };
  }

  stop() {
    this.wireServer?.stop();
    this.httpServer?.close();
  }
}
