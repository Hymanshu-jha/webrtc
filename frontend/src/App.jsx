import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Copy, Check } from 'lucide-react';

const App = () => {
  const [myUserId, setMyUserId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [isInCall, setIsInCall] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [copied, setCopied] = useState(false);
  const [callStatus, setCallStatus] = useState('');
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const zegoRef = useRef(null);
  const streamRef = useRef(null);

  // Generate or retrieve persistent user ID
  useEffect(() => {
    let userId = localStorage.getItem('zegoUserId');
    if (!userId) {
      userId = 'user_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('zegoUserId', userId);
    }
    setMyUserId(userId);
  }, []);

  // Initialize ZegoCloud SDK
  useEffect(() => {
    if (!myUserId) return;

    const initZego = async () => {
      try {
        // Import ZegoExpressEngine from CDN
        const { ZegoExpressEngine } = await import('https://unpkg.com/zego-express-engine-webrtc@2.25.0/index.js');
        
        const zg = new ZegoExpressEngine(
          1234567890, // Replace with your actual App ID
          'wss://webliveroom1234567890-api.coolzcloud.com/ws' // Replace with your server URL
        );

        zegoRef.current = zg;

        // Set up event listeners
        zg.on('roomStreamUpdate', async (roomID, updateType, streamList, extendedData) => {
          if (updateType === 'ADD') {
            // Someone joined, play their stream
            const remoteStream = streamList[0];
            if (remoteStream) {
              const remoteVideo = await zg.startPlayingStream(remoteStream.streamID);
              if (remoteVideoRef.current && remoteVideo) {
                remoteVideoRef.current.srcObject = remoteVideo;
                setCallStatus('Connected');
                setIsConnecting(false);
              }
            }
          } else if (updateType === 'DELETE') {
            setCallStatus('User disconnected');
            endCall();
          }
        });

        zg.on('roomStateUpdate', (roomID, state, errorCode, extendedData) => {
          console.log('Room state:', state, errorCode);
          if (state === 'CONNECTED') {
            setCallStatus('Joined room, waiting for other user...');
          }
        });

      } catch (error) {
        console.error('Failed to initialize Zego:', error);
        setCallStatus('Failed to initialize video calling');
      }
    };

    initZego();

    return () => {
      if (zegoRef.current) {
        zegoRef.current.logoutRoom();
        zegoRef.current.destroyEngine();
      }
    };
  }, [myUserId]);

  const startCall = async () => {
    if (!targetUserId.trim() || !zegoRef.current) {
      setCallStatus('Please enter a valid user ID');
      return;
    }

    setIsConnecting(true);
    setCallStatus('Connecting...');

    try {
      const roomId = [myUserId, targetUserId].sort().join('_');
      
      // Login to room
      await zegoRef.current.loginRoom(roomId, {
        userID: myUserId,
        userName: `User ${myUserId}`
      });

      // Get local media stream
      const localStream = await zegoRef.current.createStream({
        camera: {
          audio: isAudioEnabled,
          video: isVideoEnabled
        }
      });

      streamRef.current = localStream;

      // Display local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }

      // Start publishing stream
      await zegoRef.current.startPublishingStream(`${myUserId}_stream`, localStream);
      
      setIsInCall(true);
      setCallStatus('In call - waiting for other user...');

    } catch (error) {
      console.error('Failed to start call:', error);
      setCallStatus('Failed to start call');
      setIsConnecting(false);
    }
  };

  const endCall = () => {
    if (zegoRef.current) {
      zegoRef.current.stopPublishingStream();
      zegoRef.current.logoutRoom();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setIsInCall(false);
    setIsConnecting(false);
    setCallStatus('Call ended');
  };

  const toggleVideo = async () => {
    if (streamRef.current && zegoRef.current) {
      const videoTracks = streamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks[0].enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
      }
    }
  };

  const toggleAudio = async () => {
    if (streamRef.current && zegoRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks[0].enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
      }
    }
  };

  const copyUserId = () => {
    navigator.clipboard.writeText(myUserId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white text-center mb-8">
          ZegoCloud Video Call
        </h1>

        {/* User Info Section */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-white mb-2">Your ID</h2>
              <div className="flex items-center gap-2">
                <code className="bg-black/30 text-green-300 px-3 py-2 rounded font-mono">
                  {myUserId}
                </code>
                <button
                  onClick={copyUserId}
                  className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>
            <div className="text-sm text-blue-200">
              Share this ID with others to receive calls
            </div>
          </div>

          {!isInCall && (
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-white mb-2">Call User ID:</label>
                <input
                  type="text"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  placeholder="Enter user ID to call"
                  className="w-full px-4 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isConnecting}
                />
              </div>
              <button
                onClick={startCall}
                disabled={isConnecting || !targetUserId.trim()}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                <Phone size={20} />
                {isConnecting ? 'Connecting...' : 'Call'}
              </button>
            </div>
          )}
        </div>

        {/* Status */}
        {callStatus && (
          <div className="bg-blue-600/20 border border-blue-400/30 rounded-lg p-4 mb-6">
            <p className="text-blue-200 text-center font-medium">{callStatus}</p>
          </div>
        )}

        {/* Video Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Local Video */}
          <div className="bg-black/40 rounded-xl overflow-hidden relative">
            <div className="aspect-video">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-4 left-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
                You ({myUserId})
              </div>
              {!isVideoEnabled && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <VideoOff size={48} className="text-gray-400" />
                </div>
              )}
            </div>
          </div>

          {/* Remote Video */}
          <div className="bg-black/40 rounded-xl overflow-hidden relative">
            <div className="aspect-video">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-4 left-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
                {isInCall ? 'Remote User' : 'Waiting...'}
              </div>
              {!isInCall && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <Video size={48} className="mx-auto mb-2 opacity-50" />
                    <p>Waiting for connection...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        {isInCall && (
          <div className="flex justify-center gap-4">
            <button
              onClick={toggleAudio}
              className={`p-4 rounded-full transition-colors ${
                isAudioEnabled 
                  ? 'bg-gray-600 hover:bg-gray-700 text-white' 
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {isAudioEnabled ? <Mic size={24} /> : <MicOff size={24} />}
            </button>
            
            <button
              onClick={toggleVideo}
              className={`p-4 rounded-full transition-colors ${
                isVideoEnabled 
                  ? 'bg-gray-600 hover:bg-gray-700 text-white' 
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
            </button>
            
            <button
              onClick={endCall}
              className="p-4 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
            >
              <PhoneOff size={24} />
            </button>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-8 bg-white/5 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-3">How to use:</h3>
          <ol className="text-blue-200 space-y-2">
            <li>1. Your unique ID is generated and saved automatically</li>
            <li>2. Share your ID with someone you want to call</li>
            <li>3. Enter their ID in the input field and click "Call"</li>
            <li>4. Both users need to be on this page for the call to connect</li>
            <li>5. Use the controls to toggle audio/video or end the call</li>
          </ol>
          <div className="mt-4 p-4 bg-yellow-600/20 border border-yellow-400/30 rounded-lg">
            <p className="text-yellow-200 text-sm">
              <strong>Note:</strong> This demo uses placeholder ZegoCloud credentials. 
              For production use, you'll need to register at ZegoCloud and replace the App ID and server URL.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;