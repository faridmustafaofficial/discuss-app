import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import { 
  Mic, MicOff, PhoneOff, Video, VideoOff, 
  MessageSquare, Users, Lock, LogIn, Plus, 
  Monitor, MonitorOff 
} from 'lucide-react';

// --- CONFIGURATION ---
// In production, these should be dynamic. 
// For Render.com, the backend serves the frontend, so "/" works.
const ENDPOINT = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '/';

// --- COMPONENTS ---

// 1. Simple Button Component
const Button = ({ children, onClick, variant = 'primary', className = '', ...props }) => {
  const base = "px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/30",
    secondary: "bg-gray-700 hover:bg-gray-600 text-gray-200",
    danger: "bg-red-500 hover:bg-red-600 text-white",
    ghost: "bg-transparent hover:bg-gray-800 text-gray-400 hover:text-white"
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} onClick={onClick} {...props}>
      {children}
    </button>
  );
};

// 2. Video Player Component
const VideoPlayer = ({ stream, isMuted, name, isSelf }) => {
  const videoRef = useRef();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative bg-gray-900 rounded-xl overflow-hidden aspect-video shadow-xl ring-1 ring-gray-800">
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted={isSelf || isMuted} 
        className={`w-full h-full object-cover ${isSelf ? 'scale-x-[-1]' : ''}`} // Mirror self
      />
      <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold text-white flex items-center gap-2">
        {isSelf && <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
        {name || 'Unknown'}
      </div>
    </div>
  );
};

// --- MAIN APPLICATION ---

export default function App() {
  // Global State
  const [socket, setSocket] = useState(null);
  const [peer, setPeer] = useState(null);
  const [view, setView] = useState('landing'); // 'landing', 'room'
  
  // User State
  const [myStream, setMyStream] = useState(null);
  const [myPeerId, setMyPeerId] = useState('');
  const [displayName, setDisplayName] = useState(localStorage.getItem('discuss_name') || '');
  
  // Room State
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [peers, setPeers] = useState({}); // { [peerId]: { stream, name, call } }
  
  // UI State
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false); // Default off for voice chat focus
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [msgInput, setMsgInput] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // --- INITIALIZATION ---

  useEffect(() => {
    // Connect to Socket.io
    const newSocket = io(ENDPOINT);
    setSocket(newSocket);

    // Listen for room updates
    newSocket.on('room-list', (roomList) => {
      setRooms(roomList);
    });

    return () => newSocket.close();
  }, []);

  // Initialize PeerJS when joining a room
  const initializePeer = useCallback((userId) => {
    // Connect to our internal Express Peer Server
    const newPeer = new Peer(userId, {
      path: '/peerjs',
      host: window.location.hostname,
      port: window.location.port || (window.location.protocol === 'https:' ? 443 : 80),
      secure: window.location.protocol === 'https:', // True if https
    });

    newPeer.on('open', (id) => {
      setMyPeerId(id);
    });

    setPeer(newPeer);
    return newPeer;
  }, []);

  // --- LOGIC: JOINING & MEDIA ---

  const joinRoom = async (roomId, password = '') => {
    if (!displayName) return alert("Please set a display name first.");
    localStorage.setItem('discuss_name', displayName);

    try {
      // 1. Get Media Stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: true // Request video but maybe disable tracks initially based on preference
      });
      
      // Initially disable video track if we want "Voice First"
      stream.getVideoTracks().forEach(track => track.enabled = isVideoEnabled);
      setMyStream(stream);

      // 2. Setup Peer
      const userId = crypto.randomUUID(); // Generate a random ID
      const newPeer = initializePeer(userId);

      // 3. Setup Peer Events
      newPeer.on('call', (call) => {
        // Answer incoming calls
        call.answer(stream);
        
        call.on('stream', (userVideoStream) => {
          // Add caller to our peer list
          setPeers(prev => ({
            ...prev,
            [call.peer]: { stream: userVideoStream, call }
          }));
        });
      });

      // 4. Join Socket Room
      socket.emit('join-room', { roomId, userId, userName: displayName, password });

      socket.on('user-connected', ({ peerId, name }) => {
        // Connect to new user
        const call = newPeer.call(peerId, stream);
        
        call.on('stream', (userVideoStream) => {
          setPeers(prev => ({
            ...prev,
            [peerId]: { stream: userVideoStream, name, call } // Store name if passed
          }));
        });

        // Store call reference to close later
        setPeers(prev => ({ ...prev, [peerId]: { ...prev[peerId], call, name } }));
      });

      socket.on('user-disconnected', (peerId) => {
        if (peers[peerId]) peers[peerId].call.close();
        setPeers(prev => {
          const newPeers = { ...prev };
          delete newPeers[peerId];
          return newPeers;
        });
      });

      socket.on('create-message', (message) => {
        setMessages(prev => [...prev, message]);
      });

      setCurrentRoom(roomId);
      setView('room');

    } catch (err) {
      console.error("Failed to join room:", err);
      alert("Could not access microphone/camera.");
    }
  };

  const leaveRoom = () => {
    if (myStream) myStream.getTracks().forEach(track => track.stop());
    if (peer) peer.destroy();
    if (socket) socket.emit('leave-room', currentRoom);
    
    setMyStream(null);
    setPeers({});
    setMessages([]);
    setView('landing');
    window.location.reload(); // Cleanest way to reset WebRTC state in this snippet
  };

  // --- LOGIC: CONTROLS ---

  const toggleAudio = () => {
    const audioTrack = myStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioEnabled(audioTrack.enabled);
    }
  };

  const toggleVideo = () => {
    const videoTrack = myStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!msgInput.trim()) return;
    socket.emit('send-message', msgInput);
    setMsgInput('');
  };

  const createRoom = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    socket.emit('create-room', { ...data, hostName: displayName });
    setCreateModalOpen(false);
  };

  // --- RENDER ---

  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 font-sans selection:bg-indigo-500/30">
        <div className="max-w-5xl mx-auto p-6">
          {/* Header */}
          <header className="flex justify-between items-center mb-12 pt-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-600 rounded-xl">
                <Mic className="text-white w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Discuss</h1>
            </div>
            <div className="flex gap-4">
              <input 
                type="text" 
                placeholder="Your Display Name" 
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </header>

          {/* Hero / Action */}
          <div className="flex justify-between items-end mb-8">
            <div>
              <h2 className="text-3xl font-bold mb-2">Live Voice Rooms</h2>
              <p className="text-gray-400">Join a channel or start your own conversation.</p>
            </div>
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="w-5 h-5" /> Create Room
            </Button>
          </div>

          {/* Room Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.length === 0 ? (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-gray-800 rounded-2xl">
                <p className="text-gray-500">No active rooms. Be the first to create one!</p>
              </div>
            ) : (
              rooms.map(room => (
                <div key={room.id} className="bg-gray-900 border border-gray-800 p-5 rounded-2xl hover:border-indigo-500/50 transition-colors group">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-lg">{room.name}</h3>
                    <div className="flex items-center gap-2 text-xs font-mono bg-gray-800 px-2 py-1 rounded">
                      <Users className="w-3 h-3" />
                      {room.count}/{room.capacity}
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-4">
                     {room.hasPassword && <Lock className="w-4 h-4 text-yellow-500" />}
                     <Button variant="secondary" className="w-full" onClick={() => {
                       const pwd = room.hasPassword ? prompt("Enter Room Password:") : '';
                       joinRoom(room.id, pwd);
                     }}>
                       Join Room
                     </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Create Modal */}
        {createModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl w-full max-w-md shadow-2xl">
              <h3 className="text-xl font-bold mb-4">Create New Room</h3>
              <form onSubmit={createRoom} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Room Name</label>
                  <input name="name" required className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Late Night Chill" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Capacity</label>
                  <select name="capacity" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 outline-none">
                    {[2, 4, 6, 8, 10].map(n => <option key={n} value={n}>{n} Users</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Password (Optional)</label>
                  <input name="password" type="password" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 outline-none" placeholder="Leave empty for public" />
                </div>
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="ghost" className="flex-1" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
                  <Button type="submit" className="flex-1">Create</Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ROOM VIEW
  return (
    <div className="h-screen bg-gray-950 text-white flex overflow-hidden">
      
      {/* Main Content (Video Grid) */}
      <div className="flex-1 flex flex-col relative">
        <header className="h-16 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-900/50 backdrop-blur">
           <div className="flex items-center gap-3">
             <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
             <h2 className="font-bold">Active Call</h2>
           </div>
           <Button variant="danger" onClick={leaveRoom} className="px-3 py-1.5 text-sm">
             <PhoneOff className="w-4 h-4" /> Leave
           </Button>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-fr">
            {/* My Stream */}
            {myStream && (
              <VideoPlayer 
                stream={myStream} 
                isMuted={true} 
                name={`${displayName} (You)`} 
                isSelf={true} 
              />
            )}
            
            {/* Peer Streams */}
            {Object.entries(peers).map(([id, peerData]) => (
               <VideoPlayer 
                 key={id} 
                 stream={peerData.stream} 
                 isMuted={false}
                 name={peerData.name || "User"} 
                 isSelf={false}
               />
            ))}
          </div>
        </main>

        {/* Bottom Controls */}
        <div className="h-20 bg-gray-900 border-t border-gray-800 flex items-center justify-center gap-4 z-20">
          <button 
            onClick={toggleAudio}
            className={`p-4 rounded-full transition-all ${isAudioEnabled ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-red-500 text-white'}`}
          >
            {isAudioEnabled ? <Mic /> : <MicOff />}
          </button>
          
          <button 
            onClick={toggleVideo}
            className={`p-4 rounded-full transition-all ${isVideoEnabled ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-red-500 text-white'}`}
          >
             {isVideoEnabled ? <Video /> : <VideoOff />}
          </button>

          <button 
            onClick={() => setShowChat(!showChat)}
            className={`p-4 rounded-full transition-all ${showChat ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
          >
            <MessageSquare />
          </button>
        </div>
      </div>

      {/* Chat Drawer */}
      <div className={`w-80 bg-gray-900 border-l border-gray-800 flex flex-col transition-all duration-300 ${showChat ? 'mr-0' : '-mr-80'}`}>
        <div className="p-4 border-b border-gray-800 font-bold flex items-center gap-2">
          <MessageSquare className="w-4 h-4" /> Room Chat
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className="bg-gray-800/50 p-3 rounded-lg text-sm">
              <div className="flex justify-between items-baseline mb-1">
                <span className="font-bold text-indigo-400">{msg.userName}</span>
                <span className="text-xs text-gray-500">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
              <p className="text-gray-300 break-words">{msg.text}</p>
            </div>
          ))}
        </div>

        <form onSubmit={sendMessage} className="p-4 border-t border-gray-800">
          <input 
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="Send a message..."
            value={msgInput}
            onChange={e => setMsgInput(e.target.value)}
          />
        </form>
      </div>
    </div>
  );
}