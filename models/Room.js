const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true }, // 6 simvollu kod
    name: { type: String, required: true },
    password: { type: String, default: null }, // Opsional
    maxUsers: { type: Number, default: 8, min: 2, max: 8 },
    creatorId: { type: String, required: true }, // Admini tanımaq üçün
    activeUsers: [{ type: String }] // Hazırda otaqda olanlar
});

module.exports = mongoose.model('Room', RoomSchema);