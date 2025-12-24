const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  channelName: String,
  message: String,
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const userSchema = new mongoose.Schema({
  userID: {
    type: String,
    required: true,
    unique: true,
  },
  verificationToken: {
    type: String,
  },
  verificationTokenExpiry: Date,
  messageHistory: [messageSchema],
  totalMessages: {
    type: Number,
    default: 0,
  },
  totalEmojisUsed: {
    type: Number,
    default: 0,
  },
  note: String,
  accessToken: String,
  refreshToken: String,
  tokenExpires: Date
});

module.exports = mongoose.model('User', userSchema);
