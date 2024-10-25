const WebSocket = require('ws');

const PORT = 8808;
const wss = new WebSocket.Server({ port: PORT });

wss.on('connection', (ws) => {
    console.log('A new client connected.');

    ws.on('message', (message) => {
        console.log(`Received: ${message}`);
        // Echo the received message back to the client
        ws.send(`Server received: ${message}`);
    });

    ws.on('close', () => {
        console.log('A client disconnected.');
    });

    // Send a welcome message to the client
    ws.send('Welcome to the WebSocket server!');
});

console.log(`WebSocket server is listening on ws://localhost:${PORT}`);
