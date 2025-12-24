const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    channelName: String,
    channelID: String,
    msgID: String,
    userID: String,
    message: String,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  });

const schema = new mongoose.Schema ({
    guildID: String,
    verificationMsgID: String,
    totalWarns: Number,
    totalKicks: Number,
    totalBans: Number,
    totalTimeouts: Number,
    totalActions: Number,
    totalMessages: Number,
    timesBotStarted: Number,
    recentMessages: [messageSchema],
});

module.exports = mongoose.model('guild', schema);