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
const MAX_MEMBERS = 20;

export const handleMessageReceived = (message, ws) => {
  let parsed;
  try {
    parsed = JSON.parse(message);
  } catch (err) {
    console.error("Invalid JSON:", err);
    ws.send(JSON.stringify({ type: "error", message: "Invalid JSON format" }));
    return;
  }

  const { senderId, message: text } = parsed;

  if (!senderId || !text) {
    console.log("Missing senderId or message");
    ws.send(JSON.stringify({ type: "error", message: "Missing senderId or message" }));
    return;
  }

  if (!roomMembers.has(senderId)) {
    if (roomMembers.size >= MAX_MEMBERS) {
      console.log(`Room is full. Rejecting ${senderId}`);
      ws.send(JSON.stringify({ type: "error", message: "Room is full" }));
      return;
    }
    roomMembers.set(senderId, ws);
    console.log(`User ${senderId} joined the room`);
  }

  // Send message to the other member
  for (const [id, socket] of roomMembers.entries()) {
    if (id !== senderId && socket.readyState === ws.OPEN) {
      socket.send(JSON.stringify({
        from: senderId,
        message: text,
      }));
    }
  }
}




wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', (message) => {
    console.log('Received:', message);
    handleMessageReceived(message, ws);
  });

  ws.on('close', () => {
    // Optional cleanup logic if needed
    for (const [id, socket] of roomMembers.entries()) {
      if (socket === ws) {
        roomMembers.delete(id);
        console.log(`User ${id} disconnected`);
        break;
      }
    }
  });
});



app.get('/', (req, res) => {
  const data = req.body;
  console.log('Received data:', data);
  res.status(201).json({ message: 'Data received', data });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
