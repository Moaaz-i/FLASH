import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { FlashDatabase } from "../core/database.mjs";
import { FlashRaft } from "../consensus/raft_cluster.mjs";
import {
  FlashReplicationServer,
  FlashReplicationClient,
} from "./replication_rpc.mjs";

/**
 * Replica set with in-process or network (TCP) replication.
 */
export class FlashReplicaSet {
  /**
   * @param {object} [options]
   * @param {string} [options.name='flash_rs']
   * @param {string} [options.storageRoot='./replica_data']
   * @param {'local'|'majority'} [options.writeConcern='majority']
   * @param {boolean} [options.network=false] - use TCP replication between nodes
   */
  constructor(options = {}) {
    this.name = options.name || "flash_rs";
    this.storageRoot = path.resolve(options.storageRoot || "./replica_data");
    /** @type {Map<string, { db: FlashDatabase, raft: FlashRaft, oplogOffset: number, rpc?: FlashReplicationServer, host?: string, port?: number }>} */
    this.nodes = new Map();
    this.leaderId = null;
    this.writeConcern = options.writeConcern || "majority";
    this.network = options.network === true;
    this.replicationAuthKey =
      options.authKey || crypto.randomBytes(24).toString("hex");
  }

  /**
   * @param {string} nodeId
   * @param {string[]} peerIds
   * @param {object} [networkOpts]
   * @param {string} [networkOpts.host='127.0.0.1']
   * @param {number} [networkOpts.port] - required when this.network === true
   */
  addNode(nodeId, peerIds = [], networkOpts = {}) {
    const nodeDir = path.join(this.storageRoot, nodeId);
    if (!fs.existsSync(nodeDir)) fs.mkdirSync(nodeDir, { recursive: true });

    const db = new FlashDatabase(`${this.name}_${nodeId}`, {
      storagePath: nodeDir,
    });
    const raft = new FlashRaft(nodeId, peerIds);
    const entry = {
      db,
      raft,
      oplogOffset: 0,
      host: networkOpts.host || "127.0.0.1",
      port: networkOpts.port,
    };
    this.nodes.set(nodeId, entry);
    return { nodeId, db, raft };
  }

  async startNetworkNodes() {
    if (!this.network) return;
    for (const [nodeId, node] of this.nodes.entries()) {
      if (!node.port) throw new Error(`Node ${nodeId} missing replication port`);
      node.rpc = new FlashReplicationServer(node.db, {
        host: node.host,
        port: node.port,
        authKey: this.replicationAuthKey,
      });
      await node.rpc.start();
    }
  }

  async stopNetworkNodes() {
    for (const node of this.nodes.values()) {
      node.rpc?.stop();
      node.rpc = null;
    }
  }

  electLeader(preferredNodeId = null) {
    const ids = [...this.nodes.keys()];
    const order = preferredNodeId
      ? [preferredNodeId, ...ids.filter((id) => id !== preferredNodeId)]
      : ids;

    for (const nodeId of order) {
      const node = this.nodes.get(nodeId);
      const election = node.raft.startElection();
      if (election.elected) {
        this.leaderId = nodeId;
        for (const [id, n] of this.nodes.entries()) {
          if (id !== nodeId) {
            n.raft.handleAppendEntries(nodeId, election.term, [], 0);
          }
        }
        return { leaderId: nodeId, term: election.term, votes: election.votes };
      }
    }
    return { leaderId: null, elected: false };
  }

  getLeader() {
    if (!this.leaderId) return null;
    return this.nodes.get(this.leaderId);
  }

  async _replicateToFollower(followerNode, followerId, leaderCol, collectionName, docId, lastEvent) {
    const raw = await leaderCol._getRawDoc(docId);
    if (!raw) return false;

    if (this.network && followerNode.port) {
      const client = new FlashReplicationClient(
        followerNode.host,
        followerNode.port,
        this.replicationAuthKey,
      );
      await client.applyInsert(collectionName, docId, raw, lastEvent
        ? {
            operationType: lastEvent.operationType,
            collection: lastEvent.collection,
            docId: lastEvent.docId,
          }
        : null);
      return true;
    }

    const followerCol = followerNode.db.collection(collectionName);
    await followerCol.init();
    await followerCol.applyRawInsert(docId, raw, null, { skipOplog: true });
    if (lastEvent) {
      await followerCol.oplog.append(
        lastEvent.operationType,
        lastEvent.collection,
        lastEvent.docId,
      );
    }
    return true;
  }

  async replicateInsert(collectionName, doc) {
    const leader = this.getLeader();
    if (!leader) throw new Error("No replica set leader elected");

    const col = leader.db.collection(collectionName);
    const result = await col.insertOne(doc, { skipOplog: false });

    leader.raft.replicate({
      op: "insert",
      collection: collectionName,
      docId: result.insertedId,
    });

    const leaderCol = leader.db.collections.get(collectionName);
    const events = await leaderCol.oplog.readFrom(0);
    const lastEvent = events[events.length - 1];

    let acks = 1;
    const majority = Math.floor(this.nodes.size / 2) + 1;

    for (const [nodeId, node] of this.nodes.entries()) {
      if (nodeId === this.leaderId) continue;
      const ok = await this._replicateToFollower(
        node,
        nodeId,
        leaderCol,
        collectionName,
        result.insertedId,
        lastEvent,
      );
      if (ok) acks++;
    }

    const committed =
      this.writeConcern === "local" ||
      (this.writeConcern === "majority" && acks >= majority);

    return {
      ...result,
      replicated: acks - 1,
      committed,
      writeConcern: this.writeConcern,
    };
  }

  async failover(newPreferredLeader) {
    const oldLeader = this.leaderId;
    if (oldLeader) {
      this.nodes
        .get(oldLeader)
        .raft.stepDown(this.nodes.get(oldLeader).raft.currentTerm + 1);
    }
    this.leaderId = null;
    return this.electLeader(newPreferredLeader);
  }

  async close() {
    await this.stopNetworkNodes();
    for (const node of this.nodes.values()) {
      await node.db.close();
    }
    this.nodes.clear();
    this.leaderId = null;
  }
}
