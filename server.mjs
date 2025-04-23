/* eslint-env node */
/* global process */
// server.mjs — Production-ready WebSocket ES module for Cloudflare Tunnel

import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';

// --- Config & sanity checks ---
const PORT = parseInt(process.env.PORT, 10) || 8808;
const MAX_PAYLOAD_MB = parseInt(process.env.MAX_PAYLOAD_MB, 10) || 10;
const MAX_PAYLOAD = MAX_PAYLOAD_MB * 1024 * 1024;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET not set');
  process.exit(1);
}

// --- HTTP server (all non-WS requests return 404) ---
const server = http.createServer((req, res) => {
  res.writeHead(404);
  res.end();
});

// --- WebSocket server attached to HTTP ---
const wss = new WebSocketServer({
  server,
  maxPayload: MAX_PAYLOAD
});

// --- Helpers for heartbeat ---
const noop = () => {};
function heartbeat() { this.isAlive = true; }

// --- In-memory room registry ---
const rooms = new Map();

wss.on('connection', (ws, req) => {
  const rawUrl = req.url || '/';
  const path = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  const url = new URL(path, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  let user;

  try {
    user = jwt.verify(token, JWT_SECRET);
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
    return ws.terminate();
  }

  ws.user = user;
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  ws.on('error', (error) => {
    console.error(`WS error for user=${user.id}:`, error);
  });

  ws.on('close', () => {
    for (const [room, clients] of rooms.entries()) {
      if (clients.delete(ws) && clients.size === 0) {
        rooms.delete(room);
      }
    }
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
      if (typeof msg.type !== 'string') throw new Error();
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      return;
    }

    switch (msg.type) {
      case 'join': {
        const room = String(msg.room || '');
        if (!rooms.has(room)) rooms.set(room, new Set());
        rooms.get(room).add(ws);
        ws.send(JSON.stringify({ type: 'joined', room }));
        break;
      }

      case 'signal': {
        break;
      }

      case 'chat': {
        const room = String(msg.room || '');
        if (!rooms.has(room)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
          break;
        }
        const text = String(msg.text || '').slice(0, 1000);
        for (const peer of rooms.get(room)) {
          if (peer !== ws && peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({ type: 'chat', from: user.id, text, ts: Date.now() }));
          }
        }
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown type' }));
    }
  });

  ws.send(JSON.stringify({ type: 'welcome', user: user.id, ts: Date.now() }));
});

const interval = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping(noop);
  }
}, 30000);

function shutdown() {
  console.log('Shutting down...');
  clearInterval(interval);
  for (const ws of wss.clients) {
    try {
      ws.close(1001, 'Server shutting down');
    } catch (error) {
      console.error('Error during closing ws:', error);
    }
  }
  wss.close(() => {
    server.close(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket ES module listening on 0.0.0.0:${PORT}`);
  console.log(`MAX_PAYLOAD_MB=${MAX_PAYLOAD_MB} MB`);
  console.log('JWT_SECRET');
  console.log(`[93m${JWT_SECRET}[0m`);
  console.log('Press Ctrl+C to stop the server');
});
