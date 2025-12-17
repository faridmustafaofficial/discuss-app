const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { v4: uuidv4 } = require('uuid');

app.set('view engine', 'ejs'); // HTML render etmək üçün
app.use(express.static('public'));

// Ana səhifə: Avtomatik otaq ID-si yaradıb yönləndirir
app.get('/', (req, res) => {
  res.redirect(`/${uuidv4()}`);
});

// Otaq səhifəsi
app.get('/:room', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Socket.io - İstifadəçi qoşulanda işə düşür
io.on('connection', socket => {
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).broadcast.emit('user-connected', userId);

    socket.on('disconnect', () => {
      socket.to(roomId).broadcast.emit('user-disconnected', userId);
    });
  });
});

server.listen(process.env.PORT || 3000);