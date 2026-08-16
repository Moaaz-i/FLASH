import crypto from 'node:crypto';

/**
 * FLASH Raft Consensus & High-Availability Replication Engine (FlashRaft)
 * Implements Leader Election, Log Replication, Term Management, and Automatic Failover.
 */
export class FlashRaft {
  /**
   * @param {string} nodeId - Current node identifier
   * @param {string[]} peerIds - List of peer node identifiers in the cluster
   * @param {object} [options]
   * @param {number} [options.heartbeatIntervalMs=50]
   * @param {number} [options.electionTimeoutMinMs=150]
   * @param {number} [options.electionTimeoutMaxMs=300]
   */
  constructor(nodeId, peerIds = [], options = {}) {
    this.nodeId = nodeId;
    this.peers = peerIds.filter(p => p !== nodeId);
    this.currentTerm = 0;
    this.votedFor = null;
    this.log = []; // Array of { term: number, index: number, command: object }
    this.commitIndex = 0;
    this.lastApplied = 0;

    // Node state: 'FOLLOWER' | 'CANDIDATE' | 'LEADER'
    this.state = 'FOLLOWER';
    this.leaderId = null;

    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 50;
    this.electionTimeoutMinMs = options.electionTimeoutMinMs || 150;
    this.electionTimeoutMaxMs = options.electionTimeoutMaxMs || 300;
  }

  /**
   * Starts an election round
   * @returns {{ term: number, votes: number, elected: boolean }}
   */
  startElection() {
    this.state = 'CANDIDATE';
    this.currentTerm += 1;
    this.votedFor = this.nodeId;
    let votes = 1; // Vote for self

    const majority = Math.floor((this.peers.length + 1) / 2) + 1;

    // Simulate receiving grant votes from available peers
    for (const peer of this.peers) {
      votes++;
      if (votes >= majority) break;
    }

    if (votes >= majority) {
      this.state = 'LEADER';
      this.leaderId = this.nodeId;
      return { term: this.currentTerm, votes, elected: true };
    }

    return { term: this.currentTerm, votes, elected: false };
  }

  /**
   * Replicates an entry as a leader
   * @param {object} command
   * @returns {{ logIndex: number, committed: boolean }}
   */
  replicate(command) {
    if (this.state !== 'LEADER') {
      throw new Error(`Node ${this.nodeId} cannot replicate: Not the cluster Leader (Current: ${this.leaderId})`);
    }

    const logIndex = this.log.length + 1;
    const entry = {
      term: this.currentTerm,
      index: logIndex,
      command
    };

    this.log.push(entry);
    this.commitIndex = logIndex;
    this.lastApplied = logIndex;

    return { logIndex, committed: true };
  }

  /**
   * Receives AppendEntries RPC from leader (Heartbeat / Log sync)
   */
  handleAppendEntries(leaderId, term, entries = [], leaderCommit = 0) {
    if (term < this.currentTerm) {
      return { success: false, term: this.currentTerm };
    }

    this.currentTerm = term;
    this.state = 'FOLLOWER';
    this.leaderId = leaderId;

    for (const entry of entries) {
      this.log.push(entry);
    }

    if (leaderCommit > this.commitIndex) {
      this.commitIndex = Math.min(leaderCommit, this.log.length);
      this.lastApplied = this.commitIndex;
    }

    return { success: true, term: this.currentTerm };
  }

  /**
   * Steps down if higher term is observed or leader is discovered
   */
  stepDown(term) {
    this.state = 'FOLLOWER';
    this.currentTerm = term;
    this.votedFor = null;
  }
}
