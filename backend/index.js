import express from 'express';
import { WebSocketServer } from 'ws';

const app = express();
const PORT = 5050;

// Serve static files (if using build)
// app.use(express.static(path.join(__dirname, '../client/build')));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});


const wss = new WebSocketServer({ server });

const peers = new Map(); // { socket: id }

wss.on('connection', (socket) => {
  socket.on('message', (data) => {
    const msg = JSON.parse(data);
    const { type, payload, to } = msg;

    // Save peer ID
    if (type === 'join') {
      peers.set(socket, payload.id);
      return;
    }

    

    // Forward messages to target peer
    for (let [peerSocket, peerId] of peers.entries()) {
      if (peerId === to) {
        peerSocket.send(JSON.stringify(msg));
      }
    }
  });

  socket.on('close', () => {
    peers.delete(socket);
  });
});
