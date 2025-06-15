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
          // Set the remote ID when we receive an offer so we know who to send the answer to
          if (msg.from && !remoteId) {
            console.log('📝 Setting remote ID from incoming offer:', msg.from);
            setRemoteId(msg.from);
          }
          await handleOffer(msg.payload, msg.from);
          break;
        case 'answer':
          console.log('📞 Received answer');
          await peerConnection.current.setRemoteDescription(msg.payload);
          // Process pending ICE candidates after setting remote description
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

    // Add local stream tracks
    if (webcamStream.current) {
      webcamStream.current.getTracks().forEach(track => {
        console.log('➕ Adding track:', track.kind);
        peerConnection.current.addTrack(track, webcamStream.current);
      });
    }

    // Handle ICE candidates
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('❄️ Sending ICE candidate');
        sendMessage('ice', event.candidate);
      } else {
        console.log('❄️ All ICE candidates sent');
      }
    };

    // Handle remote stream
    peerConnection.current.ontrack = (event) => {
      console.log('🎥 Remote stream received:', event.streams[0]);
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        console.log('✅ Remote video element updated');
      }
    };

    // Connection state monitoring
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

    // Handle data channel if needed
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

      // Process pending ICE candidates
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

  return (
    <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
      <h2>📞 WebRTC Video Chat</h2>
      <p><strong>Your ID:</strong> {myId}</p>
      <p><strong>Connection:</strong> {connectionState} | <strong>ICE:</strong> {iceConnectionState}</p>

      <div style={{ margin: '1rem 0' }}>
        <input
          type="text"
          placeholder="Enter Remote ID"
          value={remoteId}
          onChange={(e) => setRemoteId(e.target.value)}
          style={{ 
            padding: '0.8rem', 
            width: '200px', 
            marginRight: '1rem',
            border: '2px solid #ddd',
            borderRadius: '4px'
          }}
        />
        <button 
          onClick={startMedia} 
          style={{ 
            padding: '0.8rem 1.5rem', 
            marginRight: '1rem',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Start Camera
        </button>
        <button 
          onClick={callPeer}
          disabled={!remoteId.trim()}
          style={{ 
            padding: '0.8rem 1.5rem',
            backgroundColor: remoteId.trim() ? '#2196F3' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: remoteId.trim() ? 'pointer' : 'not-allowed'
          }}
        >
          Call
        </button>
      </div>

      <div style={{ 
        marginTop: '2rem', 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '2rem',
        flexWrap: 'wrap'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h4>📹 You ({myId})</h4>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            width="300"
            height="225"
            style={{ 
              backgroundColor: '#000',
              border: '2px solid #ddd',
              borderRadius: '8px'
            }}
          />
        </div>
        <div style={{ textAlign: 'center' }}>
          <h4>🧑 Remote ({remoteId || 'Not connected'})</h4>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            width="300"
            height="225"
            style={{ 
              backgroundColor: '#000',
              border: '2px solid #ddd',
              borderRadius: '8px'
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: '2rem', fontSize: '0.9em', color: '#666' }}>
        <p><strong>Instructions:</strong></p>
        <ol style={{ textAlign: 'left', maxWidth: '600px', margin: '0 auto' }}>
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