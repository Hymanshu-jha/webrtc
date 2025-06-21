import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';

const app = express();
const corsOptions = {
  origin: 'https://webrtc-navy.vercel.app/', // allow only this origin
  credentials: true,               // allow cookies/auth headers if needed
};

app.use(cors(corsOptions));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let clients = [];

wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.push(ws);

  if (clients.length === 2) {
    clients[0].send(JSON.stringify({ type: 'initiate' }));
  }

  ws.on('message', (message) => {
    clients.forEach((client) => {
      if (client !== ws && client.readyState === ws.OPEN) {
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
