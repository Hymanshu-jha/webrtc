import React, { useRef, useEffect, useState } from 'react';

const signalingServerUrl = 'ws://localhost:3001';
const pc = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});

let remoteCandidatesQueue = [];

function App() {
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const socketRef = useRef();
  const [connected, setConnected] = useState(false);
  const isInitiator = useRef(false); // Only one peer initiates

  useEffect(() => {
    const socket = new WebSocket(signalingServerUrl);
    socketRef.current = socket;

    socket.onopen = async () => {
      console.log('Connected to signaling server');
    };

    socket.onmessage = async (message) => {
      const data = JSON.parse(message.data);
      switch (data.type) {
        case 'offer':
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          await addQueuedIce();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.send(JSON.stringify({ type: 'answer', answer }));
          break;

        case 'answer':
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          await addQueuedIce();
          break;

        case 'ice':
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } else {
            remoteCandidatesQueue.push(data.candidate);
          }
          break;

        case 'initiate':
          isInitiator.current = true;
          break;

        default:
          break;
      }
    };

    startMedia();

    return () => socket.close();
  }, []);

  const startMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    localVideoRef.current.srcObject = stream;

    pc.ontrack = (event) => {
      remoteVideoRef.current.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.send(JSON.stringify({ type: 'ice', candidate: event.candidate }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setConnected(true);
      }
    };
  };

  const createOffer = async () => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current.send(JSON.stringify({ type: 'offer', offer }));
  };

  const addQueuedIce = async () => {
    for (const c of remoteCandidatesQueue) {
      await pc.addIceCandidate(new RTCIceCandidate(c));
    }
    remoteCandidatesQueue = [];
  };

  return (
    <div className="App">
      <h1>WebRTC Video Chat</h1>
      <div style={{ display: 'flex', gap: '10px' }}>
        <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '300px' }} />
        <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '300px' }} />
      </div>
      {!connected && (
        <button onClick={createOffer} style={{ marginTop: '10px' }}>
          Start Call
        </button>
      )}
    </div>
  );
}

export default App;
