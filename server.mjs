import http from 'http'
import WebSocket, { WebSocketServer } from 'ws'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import Ajv from 'ajv'

const LOG_LEVEL = (process.env.LOG_LEVEL || 'warn').toLowerCase()
function log(level, ...args) {
  const ts = new Date().toISOString()
  if (
    level === 'error' ||
    (level === 'warn' && ['warn', 'info', 'debug'].includes(LOG_LEVEL)) ||
    (level === 'info' && ['info', 'debug'].includes(LOG_LEVEL)) ||
    (level === 'debug' && LOG_LEVEL === 'debug')
  ) {
    console[level](`[${ts}][${level.toUpperCase()}]`, ...args)
  }
}

const PORT = parseInt(process.env.PORT, 10) || 8808
const MAX_PAYLOAD = (parseInt(process.env.MAX_PAYLOAD_MB, 10) || 10) * 1024 * 1024
const JWT_SECRET = process.env.JWT_SECRET
const STATIC_KEY = process.env.STATIC_KEY
const MAX_ROOM_PEERS = 2
const CLEANUP_INTERVAL = 600000
const ROOM_TTL = 3600000
const PROTOCOL_VERSION = 1

if (!JWT_SECRET && !STATIC_KEY) {
  log('error', 'no auth key')
  process.exit(1)
}

const server = http.createServer((req, res) => {
  log('debug', 'HTTP', req.method, req.url)
  res.writeHead(404)
  res.end()
})

const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD })

const ajv = new Ajv()
const msgSchema = ajv.compile({
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['join', 'signal', 'chat'] },
    room: { type: 'string' },
    protocolVersion: { type: 'number' },
    description: { type: 'object' },
    candidate: { type: 'object' },
    text: { type: 'string' }
  },
  required: ['type', 'room'],
  additionalProperties: false
})

const rooms = new Map()
const roomActivity = new Map()
const metrics = { connections: 0, messages: 0, joins: 0, signals: 0, chats: 0, errors: 0 }

function cleanupRooms() {
  const now = Date.now()
  for (const [room, last] of roomActivity.entries()) {
    if (now - last > ROOM_TTL) {
      rooms.delete(room)
      roomActivity.delete(room)
      log('debug', 'cleanup room', room)
    }
  }
}

setInterval(cleanupRooms, CLEANUP_INTERVAL)

wss.on('connection', (ws, req) => {
  metrics.connections++
  const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get('token')
  log('debug', 'connection from', req.socket.remoteAddress, 'token=', token)
  let user
  if (STATIC_KEY && token === STATIC_KEY) {
    user = { id: randomUUID() }
    log('info', 'static auth for', user.id)
  } else if (JWT_SECRET) {
    try {
      user = jwt.verify(token, JWT_SECRET)
      log('info', 'jwt auth for', user.id)
    } catch {
      log('warn', 'jwt failed for token')
    }
  }
  if (!user) {
    metrics.errors++
    ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED' }))
    ws.terminate()
    return
  }
  ws.user = user
  ws.isAlive = true
  ws.msgCount = 0
  ws.on('pong', () => { ws.isAlive = true })
  ws.on('close', () => {
    log('debug', 'disconnect', user.id)
    for (const [room, clients] of rooms.entries()) {
      if (clients.delete(ws) && clients.size === 0) {
        rooms.delete(room)
        roomActivity.delete(room)
        log('debug', 'deleted empty room', room)
      }
    }
  })
  ws.on('message', (raw, isBinary) => {
    metrics.messages++
    ws.msgCount++
    if (ws.msgCount > 100) {
      metrics.errors++
      ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMIT' }))
      return
    }
    let text
    if (isBinary) {
      log('debug', 'binary message length', raw.length)
      return
    } else {
      text = raw.toString('utf8')
    }
    let msg
    try {
      msg = JSON.parse(text)
    } catch {
      metrics.errors++
      ws.send(JSON.stringify({ type: 'error', code: 'INVALID_JSON' }))
      log('debug', 'invalid json:', text.slice(0, 200))
      return
    }
    if (!msgSchema(msg)) {
      metrics.errors++
      ws.send(JSON.stringify({ type: 'error', code: 'INVALID_FORMAT' }))
      log('debug', 'schema errors:', msgSchema.errors)
      return
    }
    if (msg.protocolVersion && msg.protocolVersion !== PROTOCOL_VERSION) {
      ws.send(JSON.stringify({ type: 'error', code: 'UNSUPPORTED_PROTOCOL' }))
      return
    }
    roomActivity.set(msg.room, Date.now())
    log('debug', 'msg', msg.type, 'room', msg.room)
    if (msg.type === 'join') {
      metrics.joins++
      let clients = rooms.get(msg.room)
      if (!clients) {
        clients = new Set()
        rooms.set(msg.room, clients)
        log('debug', 'created room', msg.room)
      }
      if (clients.size >= MAX_ROOM_PEERS) {
        ws.send(JSON.stringify({ type: 'error', code: 'ROOM_FULL' }))
        return
      }
      clients.add(ws)
      log('debug', 'added', user.id, 'to', msg.room)
      ws.send(JSON.stringify({ type: 'joined', room: msg.room }))
    } else if (msg.type === 'signal') {
      metrics.signals++
      for (const peer of rooms.get(msg.room) || []) {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
          peer.send(text)
        }
      }
    } else if (msg.type === 'chat') {
      metrics.chats++
      log('debug', 'chat from', user.id)
      for (const peer of rooms.get(msg.room) || []) {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
          peer.send(text)
        }
      }
    }
  })
  ws.send(JSON.stringify({
    type: 'welcome',
    user: user.id,
    ts: Date.now(),
    protocolVersion: PROTOCOL_VERSION
  }))
})

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      log('debug', 'terminate stale')
      ws.terminate()
      continue
    }
    ws.isAlive = false
    ws.ping()
    ws.msgCount = 0
  }
}, 30000)

function shutdown() {
  for (const ws of wss.clients) ws.close()
  wss.close(() => server.close(() => process.exit(0)))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

server.listen(PORT, () => log('info', 'listening on', PORT))
