// index.js
import cors from 'cors';
import express from 'express';
import { WebSocketServer } from 'ws';

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
}));

app.get('/', (req, res) => {
  res.send('Welcome to WebRTC backend');
});

const server = app.listen(PORT, () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});

// ✅ Create WebSocket server
const wss = new WebSocketServer({ server });

const clients = new Map();

wss.on('connection', (socket) => {
  console.log('📡 WebSocket connected');

  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      const { type, payload , to , from } = msg;

      if (type === 'join') {
        clients.set(payload.id, socket);
        console.log(`🆔 Registered client: ${payload.id}`);
        return;
      }

      const targetSocket = clients.get(to);
      if (targetSocket && targetSocket.readyState === 1) {
        targetSocket.send(JSON.stringify(msg));
      }
    } catch (err) {
      console.error('❌ Error in WebSocket message:', err);
    }
  });

  socket.on('close', () => {
    // Remove from map when socket closes
    for (const [id, s] of clients.entries()) {
      if (s === socket) {
        clients.delete(id);
        console.log(`❌ Disconnected: ${id}`);
        break;
      }
    }
  });
});
