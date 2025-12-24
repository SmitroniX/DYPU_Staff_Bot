const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  accentColor: { type: String, default: '#7060be' },
  name: { type: String, default: 'Plex Staff' },
  description: { type: String, default: 'The leading Discord Moderation bot.' },
  logo: { type: String, default: '/logo.png' },
  favicon: { type: String, default: '/uploads/favicon.ico' },
  commandPrefix: {  type: String,  default: '!', trim: true, maxlength: 5 },
  updatedAt: { type: Date, default: Date.now },

  appealEnabled: { type: Boolean, default: false },
  addUsersBackEnabled: { type: Boolean, default: false },
  displayInactivePunishments: { type: Boolean, default: true },
  customAppealLink: { type: String, default: '' },
  appealChannelId: { type: String, default: '' },
  appealCooldown: { type: Number, default: 24 },
  appealQuestions: [{
    text: { type: String, required: true },
    type: { type: String, enum: ['paragraph', 'short'], default: 'paragraph' },
    required: { type: Boolean, default: true },
    characterLimit: { type: Number, default: 1000 }
  }],
  
  updatedAt: { type: Date, default: Date.now }
});

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;