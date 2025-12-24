const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    userID: { type: String, required: true },
    username: { type: String, required: true },
    punishment: { type: String, required: true },
    punishmentID: { type: String, required: true },
    reason: { type: String, required: true },
    staff: { type: String, required: true },
    staffUsername: { type: String, required: true },
    date: { type: Date, default: Date.now },
    status: { type: String, enum: ['Active', 'Inactive', 'Appealed'], default: 'Active' },
    appealID: { type: String },
    duration: { type: String, default: null },
    recentMessages: []
});

module.exports = mongoose.model('punishment', schema);