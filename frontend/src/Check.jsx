import React, { useEffect, useRef, useState } from 'react';
import './App.css';

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
  const [connectionState, setConnectionState] = useState('new');
  const [iceConnectionState, setIceConnectionState] = useState('new');

  useEffect(() => {
    socket.current = new WebSocket(SIGNALING_SERVER);

    socket.current.onopen = () => {
      console.log('✅ Connected to signaling server');
      socket.current.send(JSON.stringify({ type: 'join', payload: { id: myId } }));
    };

    socket.current.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      console.log('📨 Received message:', msg);
      
      if (msg.to !== myId) return;

      switch (msg.type) {
        case 'offer':
          if (msg.from && !remoteId) {
            console.log('📝 Setting remote ID from incoming offer:', msg.from);
            setRemoteId(msg.from);
          }
          await handleOffer(msg.payload, msg.from);
          break;
        case 'answer':
          console.log('📞 Received answer');
          await peerConnection.current.setRemoteDescription(msg.payload);
          await processPendingCandidates();
          break;
        case 'ice':
          if (msg.payload) {
            if (peerConnection.current?.remoteDescription) {
              console.log('❄️ Adding ICE candidate');
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

    socket.current.onerror = (error) => {
      console.error('🔴 WebSocket error:', error);
    };

    socket.current.onclose = () => {
      console.log('🔌 WebSocket connection closed');
    };

    return () => {
      cleanup();
    };
  }, [myId]);

  const cleanup = () => {
    if (webcamStream.current) {
      webcamStream.current.getTracks().forEach(track => track.stop());
    }
    if (peerConnection.current) {
      peerConnection.current.close();
    }
    if (socket.current) {
      socket.current.close();
    }
  };

  const sendMessage = (type, payload, targetId = null) => {
    const toId = targetId || remoteId;
    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      console.log('📤 Sending message:', { type, to: toId });
      socket.current.send(JSON.stringify({ type, payload, to: toId, from: myId }));
    } else {
      console.error('❌ WebSocket not ready for sending');
    }
  };

  const processPendingCandidates = async () => {
    console.log(`🔄 Processing ${pendingCandidates.current.length} pending ICE candidates`);
    for (const candidate of pendingCandidates.current) {
      try {
        await peerConnection.current.addIceCandidate(candidate);
        console.log('✅ Added pending ICE candidate');
      } catch (err) {
        console.error('❌ Error adding pending ICE candidate:', err);
      }
    }
    pendingCandidates.current = [];
  };

  const startMedia = async () => {
    try {
      console.log('🎥 Starting media...');
      webcamStream.current = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 }, 
        audio: true 
      });
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = webcamStream.current;
      }
      
      console.log('✅ Media started successfully');
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
    if (peerConnection.current) {
      peerConnection.current.close();
    }

    console.log('🔗 Setting up peer connection...');
    peerConnection.current = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
    });

    if (webcamStream.current) {
      webcamStream.current.getTracks().forEach(track => {
        console.log('➕ Adding track:', track.kind);
        peerConnection.current.addTrack(track, webcamStream.current);
      });
    }

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('❄️ Sending ICE candidate');
        sendMessage('ice', event.candidate);
      } else {
        console.log('❄️ All ICE candidates sent');
      }
    };

    peerConnection.current.ontrack = (event) => {
      console.log('🎥 Remote stream received:', event.streams[0]);
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        console.log('✅ Remote video element updated');
      }
    };

    peerConnection.current.onconnectionstatechange = () => {
      const state = peerConnection.current.connectionState;
      console.log('🔗 Connection state:', state);
      setConnectionState(state);
    };

    peerConnection.current.oniceconnectionstatechange = () => {
      const state = peerConnection.current.iceConnectionState;
      console.log('❄️ ICE connection state:', state);
      setIceConnectionState(state);
    };

    peerConnection.current.ondatachannel = (event) => {
      console.log('📡 Data channel received:', event.channel.label);
    };
  };

  const callPeer = async () => {
    if (!remoteId.trim()) {
      console.error('❌ Please enter a remote ID');
      return;
    }

    if (!webcamStream.current) {
      console.warn("⚠️ Webcam not started. Starting now...");
      await startMedia();
    }

    if (!webcamStream.current || !peerConnection.current) {
      console.error("❌ Cannot call peer: media or peerConnection not ready.");
      return;
    }

    try {
      console.log('📞 Creating offer...');
      const offer = await peerConnection.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await peerConnection.current.setLocalDescription(offer);
      console.log('📤 Sending offer to:', remoteId);
      sendMessage('offer', offer);
    } catch (err) {
      console.error("❌ Error creating offer:", err);
    }
  };

  const handleOffer = async (offer, fromId) => {
    console.log('📞 Handling incoming offer from:', fromId);
    
    if (!webcamStream.current) {
      await startMedia();
    }

    if (!peerConnection.current) {
      setupPeerConnection();
    }

    try {
      await peerConnection.current.setRemoteDescription(offer);
      console.log('✅ Remote description set');

      await processPendingCandidates();

      console.log('📞 Creating answer...');
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      
      console.log('📤 Sending answer to:', fromId);
      sendMessage('answer', answer, fromId);
    } catch (err) {
      console.error('❌ Error handling offer:', err);
    }
  };

  const getConnectionStatusClass = (state) => {
    switch (state) {
      case 'connected': return 'status-connected';
      case 'connecting': return 'status-connecting';
      case 'failed': return 'status-failed';
      case 'disconnected': return 'status-disconnected';
      default: return 'status-new';
    }
  };

  return (
    <div className="app-container">
      <h2 className="app-title">📞 WebRTC Video Chat</h2>
      
      <div className="connection-info">
        <p><strong>Your ID:</strong> {myId}</p>
        <p>
          <strong>Connection:</strong> 
          <span className={`connection-status ${getConnectionStatusClass(connectionState)}`}>
            {connectionState}
          </span>
          <strong>ICE:</strong> 
          <span className={`connection-status ${getConnectionStatusClass(iceConnectionState)}`}>
            {iceConnectionState}
          </span>
        </p>
      </div>

      <div className="controls-section">
        <div className="input-group">
          <input
            type="text"
            placeholder="Enter Remote ID"
            value={remoteId}
            onChange={(e) => setRemoteId(e.target.value)}
            className="remote-id-input"
          />
          <button 
            onClick={startMedia} 
            className="btn btn-start"
          >
            Start Camera
          </button>
          <button 
            onClick={callPeer}
            disabled={!remoteId.trim()}
            className="btn btn-call"
          >
            Call
          </button>
        </div>
      </div>

      <div className="video-container">
        <div className="video-section">
          <h4 className="video-title">📹 You ({myId})</h4>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="video-element"
          />
        </div>
        <div className="video-section">
          <h4 className="video-title">🧑 Remote ({remoteId || 'Not connected'})</h4>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="video-element"
          />
        </div>
      </div>

      <div className="instructions">
        <p className="instructions-title"><strong>Instructions:</strong></p>
        <ol className="instructions-list">
          <li>Click "Start Camera" to enable your webcam</li>
          <li>Share your ID ({myId}) with the other person</li>
          <li>Enter their ID in the input field</li>
          <li>Click "Call" to initiate the connection</li>
        </ol>
      </div>
    </div>
  );
};

export default App;