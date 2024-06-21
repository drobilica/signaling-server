const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8080 });

let connections = [];

server.on('connection', (ws) => {
    connections.push(ws);
    ws.on('message', (message) => {
        connections.forEach((conn) => {
            if (conn !== ws && conn.readyState === WebSocket.OPEN) {
                conn.send(message);
            }
        });
    });
    ws.on('close', () => {
        connections = connections.filter((conn) => conn !== ws);
    });
});

console.log('WebSocket server is running on ws://localhost:8080');
