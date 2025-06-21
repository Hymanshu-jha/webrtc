


import express from 'express';
import http from 'http';
import { WebSocket } from 'ws';
import cors from 'cors';



const app = express();
const corsOptions = {
  origin: 'https://webrtc-navy.vercel.app/', // allow only this origin
  credentials: true,               // allow cookies/auth headers if needed
};
const server = http.createServer(app);

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected users
const users = new Map(); // userId -> { ws, id, status }
const calls = new Map(); // callId -> { caller, callee, status }

// Utility functions
const sendToUser = (userId, message) => {
  const user = users.get(userId);
  if (user && user.ws.readyState === WebSocket.OPEN) {
    user.ws.send(JSON.stringify(message));
    return true;
  }
  return false;
};

const broadcastUserList = () => {
  const userList = Array.from(users.keys());
  const message = {
    type: 'user-list',
    users: userList
  };
  
  users.forEach((user) => {
    if (user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(JSON.stringify(message));
    }
  });
};

const generateCallId = () => {
  return Math.random().toString(36).substr(2, 9);
};

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection established');
  
  let currentUserId = null;

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to signaling server'
  }));

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      console.log('Received message:', message);

      switch (message.type) {
        case 'register':
          await handleRegister(ws, message);
          break;
          
        case 'call-request':
          await handleCallRequest(message);
          break;
          
        case 'call-accepted':
          await handleCallAccepted(message);
          break;
          
        case 'call-rejected':
          await handleCallRejected(message);
          break;
          
        case 'offer':
          await handleOffer(message);
          break;
          
        case 'answer':
          await handleAnswer(message);
          break;
          
        case 'ice-candidate':
          await handleIceCandidate(message);
          break;
          
        case 'call-ended':
          await handleCallEnded(message);
          break;
          
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
          
        default:
          console.log('Unknown message type:', message.type);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Unknown message type'
          }));
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    if (currentUserId) {
      handleUserDisconnect(currentUserId);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  // Message handlers
  async function handleRegister(ws, message) {
    const { id } = message;
    
    if (!id || typeof id !== 'string') {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid user ID'
      }));
      return;
    }

    // Check if user already exists
    if (users.has(id)) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'User ID already taken'
      }));
      return;
    }

    // Register user
    currentUserId = id;
    users.set(id, {
      ws: ws,
      id: id,
      status: 'available',
      connectedAt: new Date()
    });

    console.log(`User registered: ${id}`);
    
    ws.send(JSON.stringify({
      type: 'registered',
      id: id,
      message: `Successfully registered as ${id}`
    }));

    // Broadcast updated user list
    broadcastUserList();
  }

  async function handleCallRequest(message) {
    const { to, from } = message;
    
    if (!from || !to) {
      return;
    }

    const caller = users.get(from);
    const callee = users.get(to);

    if (!caller || !callee) {
      sendToUser(from, {
        type: 'error',
        message: 'User not found or offline'
      });
      return;
    }

    if (callee.status !== 'available') {
      sendToUser(from, {
        type: 'error',
        message: 'User is busy'
      });
      return;
    }

    // Create call record
    const callId = generateCallId();
    calls.set(callId, {
      id: callId,
      caller: from,
      callee: to,
      status: 'ringing',
      startTime: new Date()
    });

    // Update user statuses
    caller.status = 'calling';
    callee.status = 'ringing';

    // Send call request to callee
    sendToUser(to, {
      type: 'call-request',
      from: from,
      callId: callId
    });

    console.log(`Call request: ${from} -> ${to} (${callId})`);
  }

  async function handleCallAccepted(message) {
    const { to, from } = message;
    
    const caller = users.get(to);
    const callee = users.get(from);

    if (!caller || !callee) {
      return;
    }

    // Find the call
    let call = null;
    for (const [callId, callData] of calls.entries()) {
      if (callData.caller === to && callData.callee === from) {
        call = callData;
        break;
      }
    }

    if (!call) {
      return;
    }

    // Update call status
    call.status = 'accepted';
    caller.status = 'in-call';
    callee.status = 'in-call';

    // Notify caller that call was accepted
    sendToUser(to, {
      type: 'call-accepted',
      from: from,
      callId: call.id
    });

    console.log(`Call accepted: ${from} accepted call from ${to}`);
  }

  async function handleCallRejected(message) {
    const { to, from } = message;
    
    const caller = users.get(to);
    const callee = users.get(from);

    if (!caller || !callee) {
      return;
    }

    // Find and remove the call
    for (const [callId, callData] of calls.entries()) {
      if (callData.caller === to && callData.callee === from) {
        calls.delete(callId);
        break;
      }
    }

    // Reset user statuses
    caller.status = 'available';
    callee.status = 'available';

    // Notify caller that call was rejected
    sendToUser(to, {
      type: 'call-rejected',
      from: from
    });

    console.log(`Call rejected: ${from} rejected call from ${to}`);
  }

  async function handleOffer(message) {
    const { offer, to, from } = message;
    
    if (!sendToUser(to, {
      type: 'offer',
      offer: offer,
      from: from
    })) {
      sendToUser(from, {
        type: 'error',
        message: 'Failed to send offer - user not available'
      });
    }

    console.log(`Offer sent: ${from} -> ${to}`);
  }

  async function handleAnswer(message) {
    const { answer, to, from } = message;
    
    if (!sendToUser(to, {
      type: 'answer',
      answer: answer,
      from: from
    })) {
      sendToUser(from, {
        type: 'error',
        message: 'Failed to send answer - user not available'
      });
    }

    console.log(`Answer sent: ${from} -> ${to}`);
  }

  async function handleIceCandidate(message) {
    const { candidate, to, from } = message;
    
    if (!sendToUser(to, {
      type: 'ice-candidate',
      candidate: candidate,
      from: from
    })) {
      sendToUser(from, {
        type: 'error',
        message: 'Failed to send ICE candidate - user not available'
      });
    }

    console.log(`ICE candidate sent: ${from} -> ${to}`);
  }

  async function handleCallEnded(message) {
    const { to, from } = message;
    
    const user1 = users.get(from);
    const user2 = users.get(to);

    // Find and remove the call
    for (const [callId, callData] of calls.entries()) {
      if ((callData.caller === from && callData.callee === to) ||
          (callData.caller === to && callData.callee === from)) {
        calls.delete(callId);
        break;
      }
    }

    // Reset user statuses
    if (user1) user1.status = 'available';
    if (user2) user2.status = 'available';

    // Notify the other user
    sendToUser(to, {
      type: 'call-ended',
      from: from
    });

    console.log(`Call ended: ${from} <-> ${to}`);
  }

  function handleUserDisconnect(userId) {
    const user = users.get(userId);
    if (!user) return;

    // Find any active calls involving this user
    const userCalls = [];
    for (const [callId, callData] of calls.entries()) {
      if (callData.caller === userId || callData.callee === userId) {
        userCalls.push(callData);
      }
    }

    // End all calls involving this user
    userCalls.forEach(call => {
      const otherUser = call.caller === userId ? call.callee : call.caller;
      sendToUser(otherUser, {
        type: 'call-ended',
        from: userId,
        reason: 'user-disconnected'
      });
      
      // Reset other user's status
      const otherUserData = users.get(otherUser);
      if (otherUserData) {
        otherUserData.status = 'available';
      }
      
      calls.delete(call.id);
    });

    // Remove user
    users.delete(userId);
    console.log(`User disconnected: ${userId}`);

    // Broadcast updated user list
    broadcastUserList();
  }
});

// HTTP Routes for API endpoints
app.get('/', (req, res) => {
  res.json({
    message: 'WebRTC Signaling Server',
    status: 'running',
    timestamp: new Date().toISOString(),
    connectedUsers: users.size,
    activeCalls: calls.size
  });
});

app.get('/api/users', (req, res) => {
  const userList = Array.from(users.values()).map(user => ({
    id: user.id,
    status: user.status,
    connectedAt: user.connectedAt
  }));
  
  res.json({
    users: userList,
    count: userList.length
  });
});

app.get('/api/calls', (req, res) => {
  const callList = Array.from(calls.values()).map(call => ({
    id: call.id,
    caller: call.caller,
    callee: call.callee,
    status: call.status,
    startTime: call.startTime
  }));
  
  res.json({
    calls: callList,
    count: callList.length
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 WebRTC Signaling Server running on port ${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`🌐 HTTP endpoint: http://localhost:${PORT}`);
});

// Periodic cleanup of stale connections
setInterval(() => {
  let cleanedUsers = 0;
  let cleanedCalls = 0;

  // Clean up disconnected users
  for (const [userId, user] of users.entries()) {
    if (user.ws.readyState !== WebSocket.OPEN) {
      users.delete(userId);
      cleanedUsers++;
    }
  }

  // Clean up stale calls (older than 5 minutes)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  for (const [callId, call] of calls.entries()) {
    if (call.startTime < fiveMinutesAgo) {
      calls.delete(callId);
      cleanedCalls++;
    }
  }

  if (cleanedUsers > 0 || cleanedCalls > 0) {
    console.log(`Cleanup: Removed ${cleanedUsers} stale users and ${cleanedCalls} stale calls`);
    if (cleanedUsers > 0) {
      broadcastUserList();
    }
  }
}, 30000); // Run every 30 seconds