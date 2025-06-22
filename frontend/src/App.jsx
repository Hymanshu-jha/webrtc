import React, { useRef, useEffect, useState } from 'react';

const signalingServerUrl = 'wss://webrtc-du7f.onrender.com/';

function App() {


  const roomId = 'room123';

  const socketRef = useRef(null);
  
  
  const [myId] = useState(() =>
   Math.floor(Math.random() * 10000).toString().padStart(4, "0")
  );

  const [remoteId, setRemoteId] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [messageReceived, setMessageReceived] = useState('');
  const [connectionstate, setConnectionState] = useState("CONNECTING");
  


  const connectionStatus = {
    0: "CONNECTING",
    1: "OPEN",
    2: "CLOSING",
    3: "CLOSED",
  };



useEffect(() => {
  socketRef.current = new WebSocket(signalingServerUrl);

  socketRef.current.onopen = () => {
    console.log("WebSocket connection established");
  };

  socketRef.current.onmessage = async (msgEvent) => {
    try {
      const msg = JSON.parse(msgEvent.data);
      handleMessageReceived(msg);
    } catch (err) {
      console.error("Failed to parse message:", err);
    }
  };

  socketRef.current.onerror = (error) => {
    console.log("WebSocket error occurred:", error);
  };

  socketRef.current.onclose = () => {
    console.log("WebSocket connection closed");
  };

  return () => {
    if (socketRef.current) {
      socketRef.current.close();  // Properly close the WebSocket connection
      socketRef.current = null;   // Optional, to clean the ref
    }
  };
}, [backend_uri]); // Optional: include dependencies if backend_uri might change



  const handleMessageReceived = (msg) => {

    setMessageReceived('');
    
    if(!msg) {
      console.log('null msg object received');
      return;
    }

    if(msg?.senderId) {
      setRemoteId(msg.senderId);
    }

    if(msg?.message) {
      setMessageReceived(msg.message);
      socketRef.current.send(JSON.stringify({
        type: "ack", 
        message: `message received ${msg.message}`,
        senderId: myId
      }));
    }
  }



  const handleSendMessage = (e) => {
    e.preventDefault();

    if(socketRef.current.readyState === WebSocket.OPEN){
      socketRef.current.send(JSON.stringify({
      message: messageInput,
      senderId: myId,
      type: 'message',
      roomId
    }));
    setMessageInput('');
    } else {
      console.log('there seems a connection problem');
    }
  
  }

  
  return (
    <>

        <h1>`RoomId: ${roomId}`</h1>
        

     
        <Label>MyId:</Label>
        <input type="text" value={myId}/>

        <input 
          type="text" 
          placeholder='type signal here...' 
          value={messageInput}
          onChange={setMessageInput(e.target.value)}
        />

        <h2>............................INTERVAL..............................</h2>

        <Label>RemoteId:</Label>
        <input type="text" value={remoteId} />

        <input 
          type="text" 
          readOnly 
          value={messageReceived}
        />



        <button onClick={handleSendMessage}>SendMessage</button>
    </>
  );
}

export default App;