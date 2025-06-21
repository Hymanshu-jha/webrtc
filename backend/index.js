const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = [];

wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.push(ws);

  if (clients.length === 2) {
    clients[0].send(JSON.stringify({ type: 'initiate' }));
  }

  ws.on('message', (message) => {
    clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  ws.on('close', () => {
    clients = clients.filter((c) => c !== ws);
  });
});

server.listen(3001, () => {
  console.log('Signaling server listening on ws://localhost:3001');
});
