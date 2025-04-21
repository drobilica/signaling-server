import WebSocket, { WebSocketServer } from 'ws';
const wss = new WebSocketServer({ port: 3000 });
const rooms = new Map();
let clientIdCounter = 0;
wss.on('connection', ws => {
  const clientId = ++clientIdCounter;
  console.log(`[Signaling] Client ${clientId} connected`);
  let roomId = null;
  ws.on('message', message => {
    console.log(`[Signaling] Received from ${clientId}: ${message}`);
    let msg;
    try { msg = JSON.parse(message); } catch (err) { console.error(`[Signaling] JSON parse error from ${clientId}: ${err}`); return; }
    const { type } = msg;
    switch (type) {
      case 'join':
        roomId = msg.room;
        if (!rooms.has(roomId)) rooms.set(roomId, new Set());
        rooms.get(roomId).add(ws);
        console.log(`[Signaling] Client ${clientId} joined room ${roomId}. Count: ${rooms.get(roomId).size}`);
        if (rooms.get(roomId).size === 2) {
          rooms.get(roomId).forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'ready' }));
          });
          console.log(`[Signaling] Room ${roomId} ready`);
        }
        break;
      case 'offer':
      case 'answer':
      case 'candidate':
        console.log(`[Signaling] Broadcasting ${type} from ${clientId} in room ${roomId}`);
        rooms.get(roomId)?.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN) client.send(message);
        });
        break;
      default:
        console.warn(`[Signaling] Unknown type '${type}' from ${clientId}`);
    }
  });
  ws.on('close', () => {
    console.log(`[Signaling] Client ${clientId} disconnected`);
    if (roomId && rooms.has(roomId)) {
      const set = rooms.get(roomId);
      set.delete(ws);
      if (set.size === 0) { rooms.delete(roomId); console.log(`[Signaling] Room ${roomId} deleted`); }
      else console.log(`[Signaling] Room ${roomId} now has ${set.size} participant(s)`);
    }
  });
  ws.on('error', err => console.error(`[Signaling] Error on client ${clientId}: ${err}`));
});
console.log('Signaling server listening on ws://localhost:3000');
