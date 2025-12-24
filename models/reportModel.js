const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reportId: { type: String, required: true, unique: true },
  reporterId: { type: String, required: true },
  reporterUsername: { type: String, required: true },
  reportedId: { type: String, required: true },
  reportedUsername: { type: String, required: true },
  reason: { type: String, default: 'No reason provided' },
  channelId: { type: String },
  channelName: { type: String },
  status: { 
    type: String, 
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  staffId: { type: String },
  staffUsername: { type: String },
  staffComment: { type: String },
  transcriptPath: { type: String },
  screenshotPath: { type: String },
  timestamp: { type: Date, default: Date.now },
  resolvedAt: { type: Date },
  guildId: { type: String, required: true },
  punishmentId: { type: String },
  actionType: { type: String },
  actionDuration: { type: String },

  autoActioned: { type: Boolean, default: false },
  autoActionType: { type: String },
  autoActionDuration: { type: String },
  autoActionReason: { type: String },
  autoActionTimestamp: { type: Date },
  autoActionPunishmentId: { type: String }

});

const Report = mongoose.model('Report', reportSchema);

module.exports = Report;