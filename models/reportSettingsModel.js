const mongoose = require('mongoose');

const reportSettingsSchema = new mongoose.Schema({
  reportEnabled: { type: Boolean, default: false },
  reportChannelId: { type: String, default: '' },
  requireReportReason: { type: Boolean, default: true },
  reportCooldown: { type: Number, default: 5 },

  saveTranscript: { type: Boolean, default: true },
  transcriptType: { type: String, enum: ['reportedUserOnly', 'allMessages'], default: 'allMessages' },

  enableAutoActions: { type: Boolean, default: false },
  reportThreshold: { type: Number, default: 5, min: 1 },
  reportTimeWindow: { type: Number, default: 24, min: 1 },
  minUniqueReporters: { type: Number, default: 3, min: 1 },
  autoActionType: { type: String, enum: ['warn', 'timeout', 'kick', 'ban'], default: 'warn' },
  
  timeoutDuration: { type: Number, default: 24 },
  timeoutDurationUnit: { type: String, enum: ['h', 'd'], default: 'h' },
  
  permanentBan: { type: Boolean, default: false },
  banDuration: { type: Number, default: 7 },
  banDurationUnit: { type: String, enum: ['d', 'w', 'm'], default: 'd' },
  
  autoActionReason: { type: String, default: 'Automatic action due to multiple user reports' },
  
  guildId: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
});

const ReportSettings = mongoose.model('ReportSettings', reportSettingsSchema);

module.exports = ReportSettings;