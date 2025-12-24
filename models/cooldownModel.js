const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    cooldownUntil: {
        type: Date,
        required: true
    }
});

module.exports = mongoose.model('cooldown', schema);