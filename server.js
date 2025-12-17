const express = require('express');
const mongoose = require('mongoose');
// ... digər importlar

const app = express();
// PORT Render tərəfindən verilir, yoxdursa 3000 olur
const PORT = process.env.PORT || 3000; 

// MONGO_URI Render-in "Environment Variables" bölməsindən gələcək
const MONGO_URI = process.env.MONGO_URI; 

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB Qoşuldu!'))
    .catch(err => console.log('Baza Xətası:', err));

// ... Sizin digər kodlarınız (Socket.io, Routes və s.)

server.listen(PORT, () => {
    console.log(`Server işləyir: Port ${PORT}`);
});
