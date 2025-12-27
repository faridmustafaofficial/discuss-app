const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// 1. Setup Socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // Adjust for production security
    methods: ["GET", "POST"]
  }
});

// 2. Setup PeerJS Server (Hosted on same instance)
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/'
});

app.use('/peerjs', peerServer);
app.use(cors());
app.use(express.json());

// 3. In-Memory State (Use Redis for scaling)
const rooms = {}; // { roomId: { name, capacity, password, users: [] } }

// 4. Socket Signaling Logic
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Send current room list to new user
  socket.emit('room-list', Object.values(rooms).map(r => ({
    id: r.id,
    name: r.name,
    count: r.users.length,
    capacity: r.capacity,
    hasPassword: !!r.password
  })));

  socket.on('create-room', ({ name, capacity, password, hostName }) => {
    const roomId = uuidv4();
    rooms[roomId] = {
      id: roomId,
      name,
      capacity: parseInt(capacity) || 5,
      password,
      users: []
    };
    
    // Broadcast updated list
    io.emit('room-list', Object.values(rooms).map(r => ({
      id: r.id,
      name: r.name,
      count: r.users.length,
      capacity: r.capacity,
      hasPassword: !!r.password
    })));
    
    socket.emit('room-created', roomId);
  });

  socket.on('join-room', ({ roomId, userId, userName, password }) => {
    const room = rooms[roomId];
    
    if (!room) {
      return socket.emit('error', 'Room not found');
    }
    if (room.users.length >= room.capacity) {
      return socket.emit('error', 'Room is full');
    }
    if (room.password && room.password !== password) {
      return socket.emit('error', 'Incorrect password');
    }

    // Join Socket Room
    socket.join(roomId);
    
    // Update State
    room.users.push({ socketId: socket.id, peerId: userId, name: userName });
    
    // Broadcast to others in room
    socket.to(roomId).emit('user-connected', { peerId: userId, name: userName });
    
    // Send current users to joiner
    const existingUsers = room.users.filter(u => u.socketId !== socket.id);
    socket.emit('room-users', existingUsers);

    // Update global room list counts
    io.emit('room-list', Object.values(rooms).map(r => ({
      id: r.id,
      name: r.name,
      count: r.users.length,
      capacity: r.capacity,
      hasPassword: !!r.password
    })));

    socket.on('disconnect', () => {
      room.users = room.users.filter(u => u.socketId !== socket.id);
      socket.to(roomId).emit('user-disconnected', userId);
      
      // Cleanup empty rooms
      if (room.users.length === 0) {
        delete rooms[roomId];
      }
      
      io.emit('room-list', Object.values(rooms).map(r => ({
        id: r.id,
        name: r.name,
        count: r.users.length,
        capacity: r.capacity,
        hasPassword: !!r.password
      })));
    });

    // Chat Handling
    socket.on('send-message', (message) => {
      io.to(roomId).emit('create-message', { 
        text: message, 
        userId: userId, 
        userName: userName,
        timestamp: new Date().toISOString()
      });
    });
  });
});

// 5. Deployment Serving
// Serve static assets from Vite build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));