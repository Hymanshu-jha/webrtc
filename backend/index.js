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
      const { type, to, from } = msg;

      // Handle client registration
      if (type === 'join') {
        const clientId = msg.payload?.id || from;
        clients.set(clientId, socket);
        console.log(`🆔 Registered client: ${clientId}`);
        
        // Send confirmation back to client
        socket.send(JSON.stringify({
          type: 'joined',
          id: clientId,
          message: 'Successfully joined'
        }));
        return;
      }

      // Handle WebRTC signaling messages (offer, answer, ice)
      if (['offer', 'answer', 'ice'].includes(type)) {
        console.log(`📤 Relaying ${type} from ${from} to ${to}`);
        
        if (!to) {
          console.error('❌ No recipient specified for message');
          socket.send(JSON.stringify({
            type: 'error',
            message: 'No recipient specified'
          }));
          return;
        }

        const targetSocket = clients.get(to);
        if (targetSocket && targetSocket.readyState === 1) {
          // Forward the entire message to the target client
          targetSocket.send(JSON.stringify(msg));
          console.log(`✅ Message relayed successfully`);
        } else {
          console.error(`❌ Target client ${to} not found or disconnected`);
          socket.send(JSON.stringify({
            type: 'error',
            message: `Client ${to} not available`
          }));
        }
        return;
      }

      // Handle other message types
      console.log(`📨 Unknown message type: ${type}`);
      
    } catch (err) {
      console.error('❌ Error in WebSocket message:', err);
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
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

  socket.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

console.log('🚀 WebRTC Signaling Server Ready');