import React, { useRef, useEffect, useState } from 'react';

const signalingServerUrl = 'wss://webrtc-du7f.onrender.com/';

function App() {
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const socketRef = useRef();
  const pcRef = useRef();
  const localStreamRef = useRef();
  
  const [connected, setConnected] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [myId, setMyId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [incomingCall, setIncomingCall] = useState(null);
  const [callStatus, setCallStatus] = useState('');

  let remoteCandidatesQueue = [];

  useEffect(() => {
    initializeSocket();
    return () => {
      cleanup();
    };
  }, []);

  const initializeSocket = () => {
    const socket = new WebSocket(signalingServerUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('Connected to signaling server');
      setSocketConnected(true);
    };

    socket.onclose = () => {
      console.log('Disconnected from signaling server');
      setSocketConnected(false);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    socket.onmessage = async (message) => {
      try {
        const data = JSON.parse(message.data);
        await handleSignalingMessage(data);
      } catch (error) {
        console.error('Error handling message:', error);
      }
    };
  };

  const handleSignalingMessage = async (data) => {
    switch (data.type) {
      case 'registered':
        console.log('Registered with ID:', data.id);
        break;

      case 'call-request':
        console.log('Incoming call from:', data.from);
        setIncomingCall(data.from);
        setCallStatus(`Incoming call from ${data.from}`);
        break;

      case 'call-accepted':
        console.log('Call accepted by:', data.from);
        setCallStatus('Call accepted, establishing connection...');
        await createOffer(data.from);
        break;

      case 'call-rejected':
        console.log('Call rejected by:', data.from);
        setCallStatus('Call was rejected');
        setTimeout(() => setCallStatus(''), 3000);
        break;

      case 'offer':
        await handleOffer(data);
        break;

      case 'answer':
        await handleAnswer(data);
        break;

      case 'ice-candidate':
        await handleIceCandidate(data);
        break;

      case 'call-ended':
        handleCallEnded();
        break;

      default:
        console.log('Unknown message type:', data.type);
        break;
    }
  };

  const registerUser = () => {
    if (!myId.trim()) {
      alert('Please enter your ID');
      return;
    }
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'register',
        id: myId
      }));
      setCallStatus(`Registered as ${myId}`);
    }
  };

  const initializePeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate,
          to: targetId
        }));
      }
    };

    pc.ontrack = (event) => {
      console.log('Received remote stream');
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setConnected(true);
        setCallStatus('Connected!');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnected(false);
        setCallStatus('Connection lost');
      }
    };

    pcRef.current = pc;
  };

  const startMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Add tracks to peer connection if it exists
      if (pcRef.current) {
        stream.getTracks().forEach((track) => {
          pcRef.current.addTrack(track, stream);
        });
      }

      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      setCallStatus('Error accessing camera/microphone');
      throw error;
    }
  };

  const initiateCall = async () => {
    if (!targetId.trim()) {
      alert('Please enter target user ID');
      return;
    }

    setCallStatus(`Calling ${targetId}...`);
    
    socketRef.current.send(JSON.stringify({
      type: 'call-request',
      to: targetId,
      from: myId
    }));
  };

  const acceptCall = async () => {
    if (!incomingCall) return;

    try {
      await startMedia();
      initializePeerConnection();
      
      // Add local stream to peer connection
      if (localStreamRef.current && pcRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pcRef.current.addTrack(track, localStreamRef.current);
        });
      }

      setTargetId(incomingCall);
      setIncomingCall(null);
      
      socketRef.current.send(JSON.stringify({
        type: 'call-accepted',
        to: incomingCall,
        from: myId
      }));
    } catch (error) {
      console.error('Error accepting call:', error);
      rejectCall();
    }
  };

  const rejectCall = () => {
    if (!incomingCall) return;

    socketRef.current.send(JSON.stringify({
      type: 'call-rejected',
      to: incomingCall,
      from: myId
    }));
    
    setIncomingCall(null);
    setCallStatus('Call rejected');
    setTimeout(() => setCallStatus(''), 3000);
  };

  const createOffer = async (targetUserId) => {
    try {
      if (!pcRef.current) {
        await startMedia();
        initializePeerConnection();
        
        // Add local stream to peer connection
        if (localStreamRef.current && pcRef.current) {
          localStreamRef.current.getTracks().forEach((track) => {
            pcRef.current.addTrack(track, localStreamRef.current);
          });
        }
      }

      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      
      socketRef.current.send(JSON.stringify({
        type: 'offer',
        offer: offer,
        to: targetUserId,
        from: myId
      }));
    } catch (error) {
      console.error('Error creating offer:', error);
      setCallStatus('Error creating call');
    }
  };

  const handleOffer = async (data) => {
    try {
      if (!pcRef.current) {
        console.error('No peer connection available');
        return;
      }

      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
      await addQueuedIceCandidates();
      
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      
      socketRef.current.send(JSON.stringify({
        type: 'answer',
        answer: answer,
        to: data.from,
        from: myId
      }));
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  const handleAnswer = async (data) => {
    try {
      if (!pcRef.current) {
        console.error('No peer connection available');
        return;
      }

      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      await addQueuedIceCandidates();
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  };

  const handleIceCandidate = async (data) => {
    try {
      if (pcRef.current && pcRef.current.remoteDescription) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        remoteCandidatesQueue.push(data.candidate);
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  };

  const addQueuedIceCandidates = async () => {
    for (const candidate of remoteCandidatesQueue) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error adding queued ICE candidate:', error);
      }
    }
    remoteCandidatesQueue = [];
  };

  const endCall = () => {
    if (targetId && socketRef.current) {
      socketRef.current.send(JSON.stringify({
        type: 'call-ended',
        to: targetId,
        from: myId
      }));
    }
    
    handleCallEnded();
  };

  const handleCallEnded = () => {
    cleanup();
    setConnected(false);
    setTargetId('');
    setCallStatus('Call ended');
    setTimeout(() => setCallStatus(''), 3000);
  };

  const cleanup = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    if (socketRef.current) {
      socketRef.current.close();
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>WebRTC Video Chat</h1>
      
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px' }}>
        <h3>Connection Status</h3>
        <p>Socket: {socketConnected ? '✅ Connected' : '❌ Disconnected'}</p>
        <p>Call: {callStatus || 'Ready'}</p>
      </div>

      {!myId || !socketConnected ? (
        <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px' }}>
          <h3>Register</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Enter your ID (a or b)"
              value={myId}
              onChange={(e) => setMyId(e.target.value)}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
            <button 
              onClick={registerUser}
              disabled={!socketConnected}
              style={{ 
                padding: '8px 16px', 
                borderRadius: '4px', 
                border: 'none', 
                backgroundColor: '#007bff', 
                color: 'white',
                cursor: socketConnected ? 'pointer' : 'not-allowed'
              }}
            >
              Register
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px' }}>
            <h3>Make a Call</h3>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Enter target ID to call"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                disabled={connected}
                style={{ 
                  padding: '8px', 
                  borderRadius: '4px', 
                  border: '1px solid #ccc',
                  opacity: connected ? 0.6 : 1
                }}
              />
              <button 
                onClick={initiateCall}
                disabled={connected || !targetId.trim()}
                style={{ 
                  padding: '8px 16px', 
                  borderRadius: '4px', 
                  border: 'none', 
                  backgroundColor: connected ? '#6c757d' : '#28a745', 
                  color: 'white',
                  cursor: (connected || !targetId.trim()) ? 'not-allowed' : 'pointer'
                }}
              >
                {connected ? 'In Call' : 'Call'}
              </button>
            </div>
          </div>

          {incomingCall && (
            <div style={{ 
              marginBottom: '20px', 
              padding: '15px', 
              border: '2px solid #28a745', 
              borderRadius: '5px',
              backgroundColor: '#f8f9fa'
            }}>
              <h3>Incoming Call from {incomingCall}</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={acceptCall}
                  style={{ 
                    padding: '8px 16px', 
                    borderRadius: '4px', 
                    border: 'none', 
                    backgroundColor: '#28a745', 
                    color: 'white',
                    cursor: 'pointer'
                  }}
                >
                  Accept
                </button>
                <button 
                  onClick={rejectCall}
                  style={{ 
                    padding: '8px 16px', 
                    borderRadius: '4px', 
                    border: 'none', 
                    backgroundColor: '#dc3545', 
                    color: 'white',
                    cursor: 'pointer'
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
            <div>
              <h4>Your Video</h4>
              <video 
                ref={localVideoRef} 
                autoPlay 
                playsInline 
                muted 
                style={{ 
                  width: '300px', 
                  height: '225px', 
                  backgroundColor: '#000',
                  border: '1px solid #ccc',
                  borderRadius: '5px'
                }} 
              />
            </div>
            <div>
              <h4>Remote Video</h4>
              <video 
                ref={remoteVideoRef} 
                autoPlay 
                playsInline 
                style={{ 
                  width: '300px', 
                  height: '225px', 
                  backgroundColor: '#000',
                  border: '1px solid #ccc',
                  borderRadius: '5px'
                }} 
              />
            </div>
          </div>

          {connected && (
            <button 
              onClick={endCall}
              style={{ 
                padding: '8px 16px', 
                borderRadius: '4px', 
                border: 'none', 
                backgroundColor: '#dc3545', 
                color: 'white',
                cursor: 'pointer'
              }}
            >
              End Call
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default App;