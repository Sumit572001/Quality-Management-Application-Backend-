const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['SE', 'QE', 'HOD', 'ADMIN'], required: true },
    fullName: String,
    siteName: String,
    block: String,
    floor: String
});

module.exports = mongoose.model('User', UserSchema);