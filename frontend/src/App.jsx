import React, { useEffect, useRef, useState } from 'react';

const SIGNALING_SERVER = 'wss://webrtc-du7f.onrender.com';

const App = () => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const socket = useRef(null);
  const peerConnection = useRef(null);
  const webcamStream = useRef(null);
  const pendingCandidates = useRef([]);

  const [myId] = useState(() => Math.random().toString(36).substring(2, 9));
  const [remoteId, setRemoteId] = useState('');

  useEffect(() => {
    socket.current = new WebSocket(SIGNALING_SERVER);

    socket.current.onopen = () => {
      console.log('✅ Connected to signaling server');
      socket.current.send(JSON.stringify({ type: 'join', payload: { id: myId } }));
    };

    socket.current.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.to !== myId) return;

      switch (msg.type) {
        case 'offer':
          await handleOffer(msg.payload);
          break;
        case 'answer':
          await peerConnection.current.setRemoteDescription(msg.payload);
          break;
        case 'ice':
          if (msg.payload) {
            if (peerConnection.current.remoteDescription) {
              await peerConnection.current.addIceCandidate(msg.payload);
            } else {
              console.warn('📥 ICE candidate received before remote description. Queuing...');
              pendingCandidates.current.push(msg.payload);
            }
          }
          break;
        default:
          break;
      }
    };

    return () => {
      socket.current.close();
    };
  }, [myId]);

  const sendMessage = (type, payload) => {
    socket.current.send(JSON.stringify({ type, payload, to: remoteId }));
  };

  const startMedia = async () => {
    try {
      webcamStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideoRef.current.srcObject = webcamStream.current;
      setupPeerConnection();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        console.error('🚫 Permission denied for camera/mic.');
      } else if (err.name === 'NotReadableError') {
        console.error('📷 Device already in use!');
      } else {
        console.error('❌ Error accessing media devices:', err);
      }
    }
  };

  const setupPeerConnection = () => {
    peerConnection.current = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    webcamStream.current.getTracks().forEach(track => {
      peerConnection.current.addTrack(track, webcamStream.current);
    });

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        sendMessage('ice', event.candidate);
      }
    };

    peerConnection.current.ontrack = (event) => {
      remoteVideoRef.current.srcObject = event.streams[0];
    };
  };

  const callPeer = async () => {
    if (!webcamStream.current) {
      console.warn("⚠️ Webcam not started. Starting now...");
      await startMedia();
    }

    if (!webcamStream.current || !peerConnection.current) {
      console.error("❌ Cannot call peer: media or peerConnection not ready.");
      return;
    }

    try {
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      sendMessage('offer', offer);
    } catch (err) {
      console.error("❌ Error creating offer:", err);
    }
  };

  const handleOffer = async (offer) => {
    await startMedia();
    await peerConnection.current.setRemoteDescription(offer);

    // Flush any queued ICE candidates
    for (const candidate of pendingCandidates.current) {
      await peerConnection.current.addIceCandidate(candidate);
    }
    pendingCandidates.current = [];

    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);
    sendMessage('answer', answer);
  };

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>📞 WebRTC Video Chat ({myId})</h2>

      <input
        type="text"
        placeholder="Remote ID"
        value={remoteId}
        onChange={(e) => setRemoteId(e.target.value)}
        style={{ padding: '0.5rem', width: '200px' }}
      />
      <br /><br />

      <button onClick={startMedia} style={{ marginRight: '1rem' }}>Start Media</button>
      <button onClick={callPeer}>Call</button>

      <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center', gap: '2rem' }}>
        <div>
          <h4>📹 Local ({myId})</h4>
          <video ref={localVideoRef} autoPlay playsInline muted width="300" />
        </div>
        <div>
          <h4>🧑 Remote ({remoteId})</h4>
          <video ref={remoteVideoRef} autoPlay playsInline width="500" />
        </div>
      </div>
    </div>
  );
};

export default App;
