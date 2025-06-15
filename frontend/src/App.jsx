import React, { useEffect, useRef, useState } from 'react';

function App() {
  const localVideo = useRef();
  const remoteVideo = useRef();
  const peer = useRef();
  const socket = useRef();



 const [myId] = useState(() => Math.random().toString(36).substring(2, 9));
 const [remoteId , setRemoteId] = useState('');

  useEffect(() => {
    // Connect to signaling server
    socket.current = new WebSocket('ws://webrtc-du7f.onrender.com/');

    
  socket.current.onopen = () => {
    send({ type: 'join', payload: { id: myId } });
  };

    // Listen for messages (offer, answer, ice)
    socket.current.onmessage = async (msg) => {
      const data = JSON.parse(msg.data);

      if (data.type === 'offer') {
        await peer.current.setRemoteDescription(data.offer);
        const answer = await peer.current.createAnswer();
        await peer.current.setLocalDescription(answer);
        send({ type: 'answer', answer  , to: remoteId , from: myId});
      }

      if (data.type === 'answer') {
        await peer.current.setRemoteDescription(data.answer);
      }

      if (data.type === 'ice') {
        try {
          await peer.current.addIceCandidate(data.ice);
        } catch (e) {
          console.error('ICE error', e);
        }
      }
    };
  }, []);



const send = (data) => {
  if (socket.current && socket.current.readyState === WebSocket.OPEN) {
    socket.current.send(JSON.stringify(data));
  } else {
    console.warn('WebSocket not open. Message not sent:', data);
  }
};


  const createConnection = async (isCaller) => {
    // Get webcam and mic
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.current.srcObject = stream;

    // Create WebRTC peer
    peer.current = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    // Send ice candidates to other peer
    peer.current.onicecandidate = (e) => {
      if (e.candidate) send({ type: 'ice', ice: e.candidate });
    };

    // Show remote stream when available
    peer.current.ontrack = (e) => {
      remoteVideo.current.srcObject = e.streams[0];
    };

    // Add your tracks (video/audio) to the peer
    stream.getTracks().forEach((track) => {
      peer.current.addTrack(track, stream);
    });

    if (isCaller) {
      const offer = await peer.current.createOffer();
      await peer.current.setLocalDescription(offer);
      send({ type: 'offer', offer });
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <input type="text" value={remoteId} onChange={(e) => setRemoteId(e.target.value)} placeholder="Enter friend's ID" />
      <h2>🎥 Simple WebRTC</h2>
      <button onClick={() => createConnection(true)}>Start Call</button>
      <button onClick={() => createConnection(false)}>Answer Call</button>

      <div style={{ display: 'flex', marginTop: 20, gap: 10 }}>
        <div>
          <h3>You 👦 {`myId: ${myId}`}</h3>
          <video ref={localVideo} autoPlay muted playsInline width={300} />
        </div>
        <div>
          <h3>Friend 👧 {`remoteId: ${remoteId}`}</h3>
          <video ref={remoteVideo} autoPlay playsInline width={300} />
        </div>
      </div>
    </div>
  );
}

export default App;
