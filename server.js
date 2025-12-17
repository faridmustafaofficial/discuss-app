// ... (əvvəlki importlar)
const mongoose = require('mongoose');
const Room = require('./models/Room');

// MongoDB qoşulması (Render-də Environment Variable istifadə edin)
mongoose.connect('mongodb+srv://SIZIN_MONGO_URL_BURA', { useNewUrlParser: true, useUnifiedTopology: true });

// 10 Random Otaq API-si
app.get('/api/rooms', async (req, res) => {
    // Random 10 otaq gətirir
    const rooms = await Room.aggregate([{ $sample: { size: 10 } }]);
    res.json(rooms);
});

// Otaq Yaratmaq
app.post('/create-room', async (req, res) => {
    const { name, password, maxUsers, userId } = req.body;
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6 simvol
    
    const newRoom = new Room({ roomId, name, password, maxUsers, creatorId: userId });
    await newRoom.save();
    res.json({ roomId });
});

// Socket.io Logic (Kick və Join)
io.on('connection', socket => {
    socket.on('join-room', async (roomId, userId, userName) => {
        const room = await Room.findOne({ roomId });
        
        // Limit yoxlanışı
        if(room && room.activeUsers.length >= room.maxUsers) {
            socket.emit('error', 'Otaq doludur');
            return;
        }

        socket.join(roomId);
        socket.to(roomId).emit('user-connected', userId, userName);

        // Chat Mesajı
        socket.on('send-message', (message) => {
            io.to(roomId).emit('create-message', message, userName);
        });

        // Kick (Qovmaq) Sistemi
        socket.on('kick-user', (targetUserId) => {
            // Yalnız otaq sahibi edə bilsin (bunu server tərəfdə yoxlamaq lazımdır)
            if(room.creatorId === userId) {
                 io.to(roomId).emit('kicked', targetUserId);
            }
        });

        socket.on('disconnect', () => {
             socket.to(roomId).emit('user-disconnected', userId);
             // DB-dən useri silmək lazımdır
        });
    });
});
