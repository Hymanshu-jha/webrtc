import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';

const app = express();

const corsOptions = {
  origin: 'https://webrtc-navy.vercel.app',
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const roomMembers = new Map(); // senderId => WebSocket
const MAX_MEMBERS = 2;

export const handleMessageReceived = (message, ws) => {
  let parsed;
  try {
    parsed = JSON.parse(message);
  } catch (err) {
    console.error("Invalid JSON:", err);
    ws.send(JSON.stringify({ type: "error", message: "Invalid JSON format" }));
    return;
  }

  const { senderId, message: text, type } = parsed;

  if (!senderId) {
    console.log("Missing senderId");
    ws.send(JSON.stringify({ type: "error", message: "Missing senderId" }));
    return;
  }

  // Handle different message types
  if (type === 'ack') {
    console.log(`Acknowledgment from ${senderId}: ${text}`);
    return; // Don't forward acknowledgments
  }

  if (type === 'message') {
    if (!text) {
      console.log("Missing message text");
      ws.send(JSON.stringify({ type: "error", message: "Missing message" }));
      return;
    }

    // Add user to room if not already present
    if (!roomMembers.has(senderId)) {
      if (roomMembers.size >= MAX_MEMBERS) {
        console.log(`Room is full. Rejecting ${senderId}`);
        ws.send(JSON.stringify({ type: "error", message: "Room is full" }));
        return;
      }
      roomMembers.set(senderId, ws);
      console.log(`User ${senderId} joined the room`);
    }

    // Send message to other members (matching frontend expected format)
    for (const [id, socket] of roomMembers.entries()) {
      if (id !== senderId && socket.readyState === 1) { // 1 = WebSocket.OPEN
        socket.send(JSON.stringify({
          senderId: senderId,  // Frontend expects 'senderId'
          message: text,       // Frontend expects 'message'
          type: 'message'
        }));
      }
    }
  }
}

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', (message) => {
    console.log('Received:', message.toString());
    handleMessageReceived(message.toString(), ws);
  });

  ws.on('close', () => {
    // Clean up disconnected user
    for (const [id, socket] of roomMembers.entries()) {
      if (socket === ws) {
        roomMembers.delete(id);
        console.log(`User ${id} disconnected`);
        break;
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

app.get('/', (req, res) => {
  res.status(200).json({ message: 'WebSocket server is running' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});