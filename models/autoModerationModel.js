const mongoose = require('mongoose');

const actionSchema = new mongoose.Schema({
    deleteMessage: { type: Boolean, default: true },
    warnUser: { type: Boolean, default: false },
    timeout: { type: Boolean, default: false },
    timeoutDuration: { type: Number, default: 5 },
    timeoutUnit: { type: String, enum: ['m', 'h', 'd'], default: 'm' },
    kickUser: { type: Boolean, default: false },
    banUser: { type: Boolean, default: false },
    isTempBan: { type: Boolean, default: false },
    banDuration: { type: Number, default: 7 },
    banUnit: { type: String, enum: ['d', 'w', 'm'], default: 'd' }
});

const channelSettingsSchema = new mongoose.Schema({
    allChannels: { type: Boolean, default: true },
    specificChannels: [{ type: String }]
});

const spamProtectionSchema = new mongoose.Schema({
    enabled: { type: Boolean, default: false },
    messageLimit: { type: Number, default: 5 },
    messageDuration: { type: Number, default: 4 },
    messageDurationUnit: { type: String, enum: ['s', 'm'], default: 's' },
    mentionLimit: { type: Number, default: 5 },
    duplicateLimit: { type: Number, default: 3 },
    actions: actionSchema,
    channels: channelSettingsSchema
});

const discordInviteSchema = new mongoose.Schema({
    enabled: { type: Boolean, default: true },
    actions: actionSchema,
    channels: channelSettingsSchema
});

const phishingProtectionSchema = new mongoose.Schema({
    enabled: { type: Boolean, default: true },
    useExternalDatabase: { type: Boolean, default: true },
    customDomains: [{ type: String }],
    actions: actionSchema,
    channels: channelSettingsSchema
});

const altPreventionSchema = new mongoose.Schema({
    enabled: { type: Boolean, default: false },
    accountAgeDays: { type: Number, default: 7 },
    customMessage: { type: String, default: 'Your account is too new to join this server.' },
    actions: actionSchema
});

const autoModerationSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    spamProtection: spamProtectionSchema,
    discordInviteFilter: discordInviteSchema,
    phishingProtection: phishingProtectionSchema,
    altPrevention: altPreventionSchema,
    lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

autoModerationSchema.pre('save', function(next) {
    if (this.isNew) {
        if (!this.spamProtection) {
            this.spamProtection = {
                enabled: false,
                messageLimit: 5,
                messageDuration: 4,
                messageDurationUnit: 's',
                mentionLimit: 5,
                duplicateLimit: 3,
                actions: {
                    deleteMessage: true,
                    warnUser: false,
                    timeout: false,
                    banUser: false,
                    isTempBan: false,
                    banDuration: 7,
                    banUnit: 'd'
                },
                channels: {
                    allChannels: true,
                    specificChannels: []
                }
            };
        }

        if (!this.discordInviteFilter) {
            this.discordInviteFilter = {
                enabled: false,
                actions: {
                    deleteMessage: true,
                    warnUser: true,
                    timeout: false,
                    banUser: false,
                    isTempBan: false,
                    banDuration: 7,
                    banUnit: 'd'
                },
                channels: {
                    allChannels: true,
                    specificChannels: []
                }
            };
        }

        if (!this.phishingProtection) {
            this.phishingProtection = {
                enabled: false,
                useExternalDatabase: true,
                customDomains: [],
                actions: {
                    deleteMessage: true,
                    warnUser: false,
                    timeout: true,
                    timeoutDuration: 10,
                    timeoutUnit: 'm',
                    banUser: false,
                    isTempBan: false,
                    banDuration: 7,
                    banUnit: 'd'
                },
                channels: {
                    allChannels: true,
                    specificChannels: []
                }
            };
        }

        if (!this.altPrevention) {
            this.altPrevention = {
                enabled: false,
                accountAgeDays: 7,
                customMessage: 'Your account is too new to join this server.',
                actions: {
                    kickUser: true,
                    banUser: false,
                    timeout: false,
                    timeoutDuration: 24,
                    timeoutUnit: 'h',
                    isTempBan: false,
                    banDuration: 7,
                    banUnit: 'd'
                }
            };
        }
    }
    next();
});

autoModerationSchema.statics.getOrCreate = async function(guildId) {
    let autoModSettings = await this.findOne({ guildId });
    
    if (!autoModSettings) {
        autoModSettings = new this({
            guildId
        });
        await autoModSettings.save();
    }
    
    return autoModSettings;
};

module.exports = mongoose.model('AutoModeration', autoModerationSchema);