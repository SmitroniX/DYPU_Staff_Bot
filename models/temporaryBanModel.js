const mongoose = require('mongoose');

const temporaryBanSchema = new mongoose.Schema({
    userID: { type: String, required: true },
    username: { type: String },
    reason: { type: String, default: "No reason specified." },
    punishmentID: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    staff: { type: String, required: true },
    staffUsername: { type: String },
    createdAt: { type: Date, default: Date.now },
    processed: { type: Boolean, default: false }
});

module.exports = mongoose.model('TemporaryBan', temporaryBanSchema);