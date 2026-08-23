import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHmac('sha256', 'safe-key-ws').update(a).digest();
  const hashB = crypto.createHmac('sha256', 'safe-key-ws').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

const MAGIC_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OPCODE_TEXT = 0x01;
const OPCODE_BINARY = 0x02;
const OPCODE_PING = 0x09;
const OPCODE_PONG = 0x0A;
const OPCODE_CLOSE = 0x08;

function acceptKey(clientKey) {
  return crypto.createHash('sha1').update(clientKey + MAGIC_GUID).digest('base64');
}

function encodeFrame(opcode, payload, fin = true) {
  const data = typeof payload === 'string' ? Buffer.from(payload) : payload;
  const len = data.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = (fin ? 0x80 : 0x00) | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = (fin ? 0x80 : 0x00) | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = (fin ? 0x80 : 0x00) | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, data]);
}

function decodeFrame(buffer, maxPayload = 1024 * 1024) {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const secondByte = buffer[1];
  const opcode = firstByte & 0x0F;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLen = secondByte & 0x7F;
  let offset = 2;

  if (payloadLen === 126) {
    if (buffer.length < 4) return null;
    payloadLen = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null;
    payloadLen = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  if (payloadLen > maxPayload) {
    return 'TOO_LARGE';
  }

  if (masked) {
    if (buffer.length < offset + 4) return null;
    const mask = buffer.slice(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + payloadLen) return null;

  let payload = buffer.slice(offset, offset + payloadLen);
  if (masked) {
    const mask = buffer.slice(offset - 4, offset);
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= mask[i % 4];
    }
  }

  return {
    opcode,
    payload,
    totalLength: offset + payloadLen
  };
}

export class FlashWebSocket {
  constructor(socket, id, options = {}) {
    this.id = id;
    this.socket = socket;
    this.rooms = new Set();
    this._alive = true;
    this._buffer = Buffer.alloc(0);
    this._headers = {};
    this._isAlive = true;
    this._maxPayload = options.maxPayload || 1024 * 1024;

    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this._onClose());
    socket.on('error', () => this._onClose());
  }

  _onData(chunk) {
    if (this._buffer.length + chunk.length > this._maxPayload * 2) {
      this.close(1009, 'Buffer overflow');
      return;
    }
    this._buffer = Buffer.concat([this._buffer, chunk]);
    while (this._buffer.length > 0) {
      const frame = decodeFrame(this._buffer, this._maxPayload);
      if (frame === 'TOO_LARGE') {
        this.close(1009, 'Message too big');
        return;
      }
      if (!frame) break;
      this._buffer = this._buffer.slice(frame.totalLength);
      this._handleFrame(frame);
    }
  }

  _handleFrame(frame) {
    switch (frame.opcode) {
      case OPCODE_TEXT: {
        const msg = frame.payload.toString('utf8');
        try {
          const parsed = JSON.parse(msg);
          this._onMessage(parsed);
        } catch {
          this._onMessage({ type: 'raw', data: msg });
        }
        break;
      }
      case OPCODE_BINARY:
        this._onMessage({ type: 'binary', data: frame.payload });
        break;
      case OPCODE_PING:
        this._sendFrame(OPCODE_PONG, frame.payload);
        break;
      case OPCODE_PONG:
        this._alive = true;
        break;
      case OPCODE_CLOSE:
        this.close(1000, 'Normal closure');
        break;
    }
  }

  _onMessage(data) {
    if (this.onmessage) this.onmessage(data);
  }

  _onClose() {
    this._isAlive = false;
    if (this.onclose) this.onclose();
  }

  _sendFrame(opcode, payload) {
    if (this.socket.destroyed) return;
    this.socket.write(encodeFrame(opcode, payload));
  }

  send(data) {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    this._sendFrame(OPCODE_TEXT, msg);
  }

  sendBinary(data) {
    this._sendFrame(OPCODE_BINARY, data);
  }

  ping() {
    this._sendFrame(OPCODE_PING, Buffer.alloc(0));
  }

  join(room) {
    this.rooms.add(room);
    return this;
  }

  leave(room) {
    this.rooms.delete(room);
    return this;
  }

  close(code = 1000, reason = 'Normal closure') {
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(code, 0);
    this._sendFrame(OPCODE_CLOSE, buf);
    this._isAlive = false;
    this.socket.destroy();
  }

  get connected() {
    return this._isAlive && !this.socket.destroyed;
  }
}

export class FlashWebSocketServer extends EventEmitter {
  constructor(httpServer, options = {}) {
    super();
    this.server = httpServer;
    this.clients = new Map();
    this.rooms = new Map();
    this._path = options.path || '/ws';
    this._heartbeatInterval = options.heartbeatInterval || 30000;
    this._maxPayload = options.maxPayload || 1024 * 1024;
    this._token = options.token || options.authKey || null;
    this._nextId = 1;
    this._pingTimer = null;

    this.server.on('upgrade', (req, socket, head) => {
      this._handleUpgrade(req, socket, head);
    });

    this._startHeartbeat();
  }

  _handleUpgrade(req, socket, head) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== this._path) {
      socket.destroy();
      return;
    }

    // Verify Origin to prevent Cross-Site WebSocket Hijacking (CSWSH)
    const origin = req.headers['origin'];
    if (origin) {
      try {
        const originUrl = new URL(origin);
        if (
          originUrl.hostname !== 'localhost' &&
          originUrl.hostname !== '127.0.0.1' &&
          originUrl.hostname !== '[::1]' &&
          originUrl.hostname !== req.headers.host &&
          (req.headers.host ? !req.headers.host.includes(originUrl.hostname) : true)
        ) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }
      } catch {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    // Authenticate WebSocket Upgrade if token/authKey is configured
    if (this._token) {
      const token = req.headers['x-flash-token'] || req.headers['x-flash-server-key'] || url.searchParams.get('token') || url.searchParams.get('authKey');
      if (!token || !timingSafeCompare(token, this._token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const accept = acceptKey(key);
    const response = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      ''
    ].join('\r\n');

    socket.write(response);

    const id = String(this._nextId++);
    const ws = new FlashWebSocket(socket, id, { maxPayload: this._maxPayload });
    ws._headers = req.headers;
    this.clients.set(id, ws);

    ws.onclose = () => {
      this.clients.delete(id);
      for (const room of ws.rooms) {
        this._removeFromRoom(room, ws);
      }
      this.emit('disconnect', ws);
    };

    ws.onmessage = (data) => {
      this.emit('message', ws, data);
      if (data.room) {
        this.to(data.room, data, ws);
      }
    };

    this.emit('connection', ws);
  }

  _startHeartbeat() {
    this._pingTimer = setInterval(() => {
      for (const [id, ws] of this.clients) {
        if (!ws._alive) {
          ws.close(1001, 'Heartbeat timeout');
          continue;
        }
        ws._alive = false;
        ws.ping();
      }
    }, this._heartbeatInterval);
  }

  joinRoom(ws, room) {
    ws.join(room);
    if (!this.rooms.has(room)) this.rooms.set(room, new Set());
    this.rooms.get(room).add(ws);
    this.emit('join', ws, room);
  }

  leaveRoom(ws, room) {
    ws.leave(room);
    this._removeFromRoom(room, ws);
    this.emit('leave', ws, room);
  }

  _removeFromRoom(room, ws) {
    const members = this.rooms.get(room);
    if (members) {
      members.delete(ws);
      if (members.size === 0) this.rooms.delete(room);
    }
  }

  to(room, data, exclude = null) {
    const members = this.rooms.get(room);
    if (!members) return;
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    for (const ws of members) {
      if (ws !== exclude && ws.connected) {
        ws.send(msg);
      }
    }
  }

  broadcast(data, exclude = null) {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    for (const [id, ws] of this.clients) {
      if (ws !== exclude && ws.connected) {
        ws.send(msg);
      }
    }
  }

  get size() {
    return this.clients.size;
  }

  getRoomMembers(room) {
    return this.rooms.get(room) || new Set();
  }

  close() {
    if (this._pingTimer) clearInterval(this._pingTimer);
    for (const [id, ws] of this.clients) {
      ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();
    this.rooms.clear();
  }
}
