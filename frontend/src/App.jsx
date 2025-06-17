import React, { useRef, useState, useEffect } from 'react';

function App() {
  const [startButton, setStartButton] = useState(false);
  const [answerButton, setAnswerButton] = useState(false);
  const [incomingOffer, setIncomingOffer] = useState(null);
  
  const [myId] = useState(() => Math.random().toString(36).substring(2, 9));
  const [remoteId, setRemoteId] = useState(null);
  
  const socketRef = useRef(null);
  const remoteIdRef = useRef(null);
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const peerConnectionRef = useRef(null);
  
  const BACKEND_URL = 'wss://webrtc-du7f.onrender.com/';

  // Separate function to handle creating offer
  const createOfferHandler = async () => {
    try {
      // Create RTCPeerConnection if it doesn't exist
      if (!peerConnectionRef.current) {
        peerConnectionRef.current = new RTCPeerConnection();
      }
      
      // Setup ICE candidate handling
      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.send(JSON.stringify({
            type: 'ice',
            candidate: event.candidate,
            to: remoteIdRef.current,
            from: myId
          }));
        }
      };
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideoRef.current.srcObject = stream;
      
      // Add local stream to peer connection
      stream.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, stream);
      });
      
      // Setup remote stream handling
      peerConnectionRef.current.ontrack = (event) => {
        remoteVideoRef.current.srcObject = event.streams[0];
      };
      
      // Create offer
      const offer = await peerConnectionRef.current.createOffer();
      
      // Set local description
      await peerConnectionRef.current.setLocalDescription(offer);
      
      // Send offer
      socketRef.current.send(JSON.stringify({
        type: 'offer',
        offer: offer,
        to: remoteIdRef.current,
        from: myId
      }));
      
      console.log('Offer created and sent');
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  };

  // Separate function to handle creating answer
  const createAnswerHandler = async (receivedOffer) => {
    try {
      // Create RTCPeerConnection if it doesn't exist
      if (!peerConnectionRef.current) {
        peerConnectionRef.current = new RTCPeerConnection();
      }
      
      // Setup ICE candidate handling
      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.send(JSON.stringify({
            type: 'ice',
            candidate: event.candidate,
            to: remoteIdRef.current,
            from: myId
          }));
        }
      };
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideoRef.current.srcObject = stream;
      
      // Add local stream to peer connection
      stream.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, stream);
      });
      
      // Setup remote stream handling
      peerConnectionRef.current.ontrack = (event) => {
        remoteVideoRef.current.srcObject = event.streams[0];
      };
      
      // Set remote description
      await peerConnectionRef.current.setRemoteDescription(receivedOffer);
      
      // Create answer
      const answer = await peerConnectionRef.current.createAnswer();
      
      // Set local description
      await peerConnectionRef.current.setLocalDescription(answer);
      
      // Send answer
      socketRef.current.send(JSON.stringify({
        type: 'answer',
        answer: answer,
        to: remoteIdRef.current,
        from: myId
      }));
      
      console.log('Answer created and sent');
    } catch (error) {
      console.error('Error creating answer:', error);
    }
  };

  useEffect(() => {
    socketRef.current = new WebSocket(BACKEND_URL);

    socketRef.current.onopen = () => {
      console.log(`client with id ${myId} connected`);
    };

    socketRef.current.onmessage = async (msg) => {
      const data = JSON.parse(msg.data);

      if (!data) {
        console.log('no data');
        return;
      }

      remoteIdRef.current = data?.from;
      setRemoteId(remoteIdRef?.current || null);

      if (data?.type === 'offer') {
        // Store incoming offer and show answer button
        setIncomingOffer(data.offer);
        setAnswerButton(true);
        console.log('Incoming call received');
        
      } else if (data.type === 'answer') {
        // Handle incoming answer
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(data.answer);
          console.log('Answer received and set');
        }
        
      } else if (data.type === 'ice') {
        // Handle ICE candidates
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.addIceCandidate(data.candidate);
          console.log('ICE candidate added');
        }
      }
    };

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [myId]);

  // Button handlers - now just call the separate functions
  const handleStartCall = async (e) => {
    e.preventDefault();
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

  return (
    <>
      <h2>My ID: {myId}</h2>
      <video ref={localVideoRef} autoPlay muted style={{width: '300px', height: '200px'}}>You</video>
      
      <h2>Remote ID: {remoteId}</h2>
      <video ref={remoteVideoRef} autoPlay style={{width: '300px', height: '200px'}}>Friend</video>
      
      <div>
        <button onClick={handleStartCall}>Start Call</button>
        <button 
          onClick={handleAnswerCall} 
          disabled={!answerButton}
          style={{
            backgroundColor: answerButton ? '#4CAF50' : '#ccc',
            color: answerButton ? 'white' : '#666'
          }}
        >
          {answerButton ? 'Answer Call' : 'No Incoming Call'}
        </button>
      </div>
      
      {incomingOffer && (
        <div style={{
          backgroundColor: '#f0f8ff',
          padding: '10px',
          margin: '10px 0',
          border: '2px solid #007bff',
          borderRadius: '5px'
        }}>
          <h3>📞 Incoming Call from {remoteId}</h3>
          <p>Someone wants to video call you!</p>
        </div>
      )}
    </>
  );
}

export default App;