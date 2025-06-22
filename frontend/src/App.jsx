import React, { useRef, useEffect, useState } from 'react';

const signalingServerUrl = 'wss://webrtc-du7f.onrender.com/';

function App() {
  const roomId = 'room123';
  const socketRef = useRef(null);

  const [myId, setMyId] = useState(null);

  const [remoteId, setRemoteId] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [messageReceived, setMessageReceived] = useState('');
  const [connectionState, setConnectionState] = useState('CONNECTING');

  const connectionStatus = {
    0: 'CONNECTING',
    1: 'OPEN',
    2: 'CLOSING',
    3: 'CLOSED',
  };

  useEffect(() => {
    socketRef.current = new WebSocket(signalingServerUrl);

    socketRef.current.onopen = () => {
      console.log('WebSocket connection established');
      setConnectionState('OPEN');
    };

    socketRef.current.onmessage = async (msgEvent) => {
      try {
        const msg = JSON.parse(msgEvent.data);
        handleMessageReceived(msg);
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };

    socketRef.current.onerror = (error) => {
      console.log('WebSocket error occurred:', error);
      setConnectionState('ERROR');
    };

    socketRef.current.onclose = () => {
      console.log('WebSocket connection closed');
      setConnectionState('CLOSED');
    };

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

  const handleMessageReceived = (msg) => {
    setMessageReceived('');

    if (!msg) {
      console.log('null msg object received');
      return;
    }

    if (msg?.senderId) {
      setRemoteId(msg.senderId);
    }

    if (msg?.message) {
      setMessageReceived(msg.message);
      socketRef.current.send(
        JSON.stringify({
          type: 'ack',
          message: `message received ${msg.message}`,
          senderId: myId,
        })
      );
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();

    if (socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          message: messageInput,
          senderId: myId,
          type: 'message',
          roomId,
        })
      );
      setMessageInput('');
    } else {
      console.log('There seems to be a connection problem');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center px-4">
      <h1 className="text-2xl font-bold mb-4">Room ID: {roomId}</h1>

      <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-md space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">My ID</label>
          <input
            type="text"
            value={myId}
            onChange={(e) => {setMyId(e.target.value)}}
            className="mt-1 w-full border rounded px-3 py-2 text-gray-700 bg-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Send Message</label>
          <input
            type="text"
            placeholder="Type message..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>

        <button
          onClick={handleSendMessage}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
        >
          Send Message
        </button>

        <hr className="my-4" />

        <div>
          <label className="block text-sm font-medium text-gray-700">Remote ID</label>
          <input
            type="text"
            value={remoteId || ''}
            readOnly
            className="mt-1 w-full border rounded px-3 py-2 text-gray-700 bg-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Message Received</label>
          <input
            type="text"
            value={messageReceived}
            readOnly
            className="mt-1 w-full border rounded px-3 py-2 text-gray-700 bg-gray-100"
          />
        </div>

        <div className="text-sm text-gray-500 mt-2">
          WebSocket: {connectionStatus[socketRef.current?.readyState || 0]}
        </div>
      </div>
    </div>
  );
}

export default App;
