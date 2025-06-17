import React, { useRef, useState, useEffect } from 'react';

function App() {
  const [startButton, setStartButton] = useState(false);
  const [answerButton, setAnswerButton] = useState(false);
  const [incomingOffer, setIncomingOffer] = useState(null);
  
  const [myId] = useState(() => Math.random().toString(36).substring(2, 9));
  const [remoteId, setRemoteId] = useState('');
  const [connectedRemoteId, setConnectedRemoteId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  
  const socketRef = useRef(null);
  const remoteIdRef = useRef(null);
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const peerConnectionRef = useRef(null);
  
  const BACKEND_URL = 'wss://webrtc-du7f.onrender.com';

  // Create peer connection with proper configuration
  const createPeerConnection = () => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    
    const pc = new RTCPeerConnection(configuration);
    
    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      setConnectionStatus(pc.connectionState);
    };
    
    // Handle ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
    };
    
    return pc;
  };

  // Separate function to handle creating offer
  const createOfferHandler = async () => {
    try {
      console.log('Creating offer to:', remoteId);
      
      // Set the target remote ID
      remoteIdRef.current = remoteId;
      setConnectedRemoteId(remoteId);
      
      // Create RTCPeerConnection if it doesn't exist
      if (!peerConnectionRef.current) {
        peerConnectionRef.current = createPeerConnection();
      }
      
      // Setup ICE candidate handling
      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate && socketRef.current?.readyState === WebSocket.OPEN) {
          console.log('Sending ICE candidate');
          socketRef.current.send(JSON.stringify({
            type: 'ice',
            candidate: event.candidate,
            to: remoteIdRef.current,
            from: myId
          }));
        }
      };
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 }, 
        audio: true 
      });
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      // Add local stream to peer connection
      stream.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, stream);
      });
      
      // Setup remote stream handling
      peerConnectionRef.current.ontrack = (event) => {
        console.log('Received remote stream');
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };
      
      // Create offer
      const offer = await peerConnectionRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      // Set local description
      await peerConnectionRef.current.setLocalDescription(offer);
      
      // Send offer
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'offer',
          offer: offer,
          to: remoteIdRef.current,
          from: myId
        }));
        console.log('Offer created and sent');
      }
      
    } catch (error) {
      console.error('Error creating offer:', error);
      alert('Error starting call: ' + error.message);
    }
  };

  // Separate function to handle creating answer
  const createAnswerHandler = async (receivedOffer) => {
    try {
      console.log('Creating answer for offer from:', remoteIdRef.current);
      
      // Create RTCPeerConnection if it doesn't exist
      if (!peerConnectionRef.current) {
        peerConnectionRef.current = createPeerConnection();
      }
      
      // Setup ICE candidate handling
      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate && socketRef.current?.readyState === WebSocket.OPEN) {
          console.log('Sending ICE candidate');
          socketRef.current.send(JSON.stringify({
            type: 'ice',
            candidate: event.candidate,
            to: remoteIdRef.current,
            from: myId
          }));
        }
      };
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 }, 
        audio: true 
      });
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      // Add local stream to peer connection
      stream.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, stream);
      });
      
      // Setup remote stream handling
      peerConnectionRef.current.ontrack = (event) => {
        console.log('Received remote stream');
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };
      
      // Set remote description
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(receivedOffer));
      
      // Create answer
      const answer = await peerConnectionRef.current.createAnswer();
      
      // Set local description
      await peerConnectionRef.current.setLocalDescription(answer);
      
      // Send answer
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'answer',
          answer: answer,
          to: remoteIdRef.current,
          from: myId
        }));
        console.log('Answer created and sent');
      }
      
    } catch (error) {
      console.error('Error creating answer:', error);
      alert('Error answering call: ' + error.message);
    }
  };

  useEffect(() => {
    const connectWebSocket = () => {
      socketRef.current = new WebSocket(BACKEND_URL);

      socketRef.current.onopen = () => {
        console.log(`Client with id ${myId} connected to WebSocket`);
      };

      socketRef.current.onmessage = async (msg) => {
        try {
          const data = JSON.parse(msg.data);
          console.log('Received message:', data);

          if (!data) {
            console.log('No data received');
            return;
          }

          // Handle different message types
          if (data.type === 'offer') {
            console.log('Received offer from:', data.from);
            // Set the remote ID from the caller
            remoteIdRef.current = data.from;
            setConnectedRemoteId(data.from);
            
            // Store incoming offer and show answer button
            setIncomingOffer(data.offer);
            setAnswerButton(true);
            
          } else if (data.type === 'answer') {
            console.log('Received answer from:', data.from);
            // Handle incoming answer
            if (peerConnectionRef.current) {
              await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
              console.log('Answer received and set');
            }
            
          } else if (data.type === 'ice') {
            console.log('Received ICE candidate from:', data.from);
            // Handle ICE candidates
            if (peerConnectionRef.current && data.candidate) {
              try {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log('ICE candidate added');
              } catch (error) {
                console.error('Error adding ICE candidate:', error);
              }
            }
          }
        } catch (error) {
          console.error('Error processing message:', error);
        }
      };

      socketRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      socketRef.current.onclose = () => {
        console.log('WebSocket connection closed');
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };
    };

    connectWebSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [myId]);

  // Button handlers
  const handleStartCall = async (e) => {
    e.preventDefault();
    if (!remoteId.trim()) {
      alert('Please enter a Remote ID to call');
      return;
    }
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      alert('WebSocket connection is not open');
      return;
    }
    await createOfferHandler();
  };

  const handleAnswerCall = async (e) => {
    e.preventDefault();
    if (incomingOffer) {
      await createAnswerHandler(incomingOffer);
      setIncomingOffer(null);
      setAnswerButton(false);
    } else {
      console.log('No incoming offer to answer');
    }
  };

  const handleEndCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    // Stop local video stream
    if (localVideoRef.current?.srcObject) {
      const tracks = localVideoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      localVideoRef.current.srcObject = null;
    }
    
    // Clear remote video
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
    // Reset state
    setConnectedRemoteId(null);
    setIncomingOffer(null);
    setAnswerButton(false);
    setConnectionStatus('disconnected');
    remoteIdRef.current = null;
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{margin: '10px 0'}}>
        <h3>My ID: <span style={{color: '#007bff', fontFamily: 'monospace', backgroundColor: '#f8f9fa', padding: '5px', borderRadius: '3px'}}>{myId}</span></h3>
        <small style={{color: '#666'}}>Share this ID with others to receive calls</small>
      </div>
      
      <div style={{margin: '20px 0'}}>
        <h4>Local Video (You)</h4>
        <video 
          ref={localVideoRef} 
          autoPlay 
          muted 
          playsInline
          style={{
            width: '320px', 
            height: '240px', 
            border: '2px solid #007bff',
            borderRadius: '8px',
            backgroundColor: '#000'
          }}
        />
      </div>
      
      <div style={{margin: '20px 0'}}>
        <label>Call someone: </label>
        <input 
          value={remoteId} 
          onChange={(e) => setRemoteId(e.target.value)}
          placeholder="Enter their ID"
          style={{
            padding: '8px', 
            marginLeft: '10px',
            border: '1px solid #ccc',
            borderRadius: '4px'
          }}
        />
        {connectedRemoteId && (
          <div style={{color: '#28a745', fontSize: '14px', marginTop: '5px'}}>
            Connected to: <strong>{connectedRemoteId}</strong> | Status: <strong>{connectionStatus}</strong>
          </div>
        )}
      </div>
      
      <div style={{margin: '20px 0'}}>
        <h4>Remote Video (Friend)</h4>
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline
          style={{
            width: '320px', 
            height: '240px', 
            border: '2px solid #28a745',
            borderRadius: '8px',
            backgroundColor: '#000'
          }}
        />
      </div>
      
      <div style={{margin: '20px 0'}}>
        <button 
          onClick={handleStartCall}
          disabled={!remoteId.trim() || connectionStatus === 'connected'}
          style={{
            backgroundColor: (!remoteId.trim() || connectionStatus === 'connected') ? '#ccc' : '#007bff',
            color: 'white',
            padding: '12px 20px',
            marginRight: '10px',
            border: 'none',
            borderRadius: '5px',
            cursor: (!remoteId.trim() || connectionStatus === 'connected') ? 'not-allowed' : 'pointer'
          }}
        >
          Start Call
        </button>
        
        <button 
          onClick={handleAnswerCall} 
          disabled={!answerButton}
          style={{
            backgroundColor: answerButton ? '#28a745' : '#ccc',
            color: 'white',
            padding: '12px 20px',
            marginRight: '10px',
            border: 'none',
            borderRadius: '5px',
            cursor: answerButton ? 'pointer' : 'not-allowed'
          }}
        >
          {answerButton ? 'Answer Call' : 'No Incoming Call'}
        </button>
        
        <button 
          onClick={handleEndCall}
          style={{
            backgroundColor: '#dc3545',
            color: 'white',
            padding: '12px 20px',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          End Call
        </button>
      </div>
      
      {incomingOffer && (
        <div style={{
          backgroundColor: '#e7f3ff',
          padding: '15px',
          margin: '15px 0',
          border: '2px solid #007bff',
          borderRadius: '8px',
          animation: 'pulse 1s infinite'
        }}>
          <h3 style={{margin: '0 0 10px 0'}}>📞 Incoming Call from {connectedRemoteId}</h3>
          <p style={{margin: '0'}}>Someone wants to video call you!</p>
        </div>
      )}
      
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.7; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default App;