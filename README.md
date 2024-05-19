# WebRTC Signaling Server Setup on Ubuntu

This guide provides instructions to set up a WebRTC signaling server using Node.js and WebSocket on an Ubuntu system.
## Synopsys

- This should serve as a lightweight TURN signaling server
- SHould be dockerized for ease of deployment 


## Prerequisites

- Ubuntu 20.04 or later
- Node.js and npm installed

## Installation Steps

1. **Update and Upgrade System Packages:**

    ```bash
    sudo apt update && sudo apt upgrade -y
    ```

2. **Install Node.js and npm:**

    ```bash
    sudo apt install nodejs npm -y
    ```

3. **Verify Installation:**

    ```bash
    node -v
    npm -v
    ```

4. **Create a Project Directory:**

    ```bash
    mkdir webrtc-signaling-server
    cd webrtc-signaling-server
    ```

5. **Initialize npm and Install Dependencies:**

    ```bash
    npm init -y
    npm install ws
    ```

## Configuration and Code

1. **Create `server.js` File:**

    ```bash
    nano server.js
    ```

    Add the following code to `server.js`:

    ```javascript
    const WebSocket = require('ws');
    const PORT = process.env.PORT || 8080;
    const wss = new WebSocket.Server({ port: PORT });

    wss.on('connection', ws => {
        ws.on('message', message => {
            console.log('Received message:', message);

            // Broadcast message to all clients except the sender
            wss.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(message);
                }
            });
        });

        ws.on('close', () => {
            console.log('Client disconnected');
        });
    });

    console.log(`WebSocket server running on port ${PORT}`);
    ```

2. **Update `package.json` Scripts:**

    Edit `package.json` to include a start script:

    ```json
    {
      "name": "webrtc-signaling-server",
      "version": "1.0.0",
      "description": "WebRTC Signaling Server",
      "main": "server.js",
      "scripts": {
        "start": "node server.js"
      },
      "dependencies": {
        "ws": "^7.4.6"
      }
    }
    ```

## Running the Server

1. **Start the Server:**

    ```bash
    npm start
    ```

2. **Verify the Server is Running:**

    Open a web browser and navigate to `ws://localhost:8080` to check if the server is running.

## Deploying the Server

To keep the server running in the background, you can use `pm2`, a process manager for Node.js applications.

1. **Install `pm2`:**

    ```bash
    sudo npm install -g pm2
    ```

2. **Start the Server with `pm2`:**

    ```bash
    pm2 start server.js --name webrtc-signaling-server
    ```

3. **Save the Process List:**

    ```bash
    pm2 save
    ```

4. **Set Up pm2 Startup Script:**

    ```bash
    pm2 startup systemd
    ```

    Follow the instructions provided by the command to enable the service.

## Monitoring and Managing the Server

- **Check Server Status:**

    ```bash
    pm2 status
    ```

- **View Server Logs:**

    ```bash
    pm2 logs webrtc-signaling-server
    ```

- **Restart the Server:**

    ```bash
    pm2 restart webrtc-signaling-server
    ```

- **Stop the Server:**

    ```bash
    pm2 stop webrtc-signaling-server
    ```

- **Delete the Server Process:**

    ```bash
    pm2 delete webrtc-signaling-server
    ```
