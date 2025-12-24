const mongoose = require('mongoose');

const staffRoleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    priority: {
        type: Number,
        required: true,
        default: 5
    },
    discordRoleToGive: {
        type: String,
        default: ""
    },
    actionLimits: {
        Enabled: {
            type: Boolean,
            default: false
        },
        Limits: {
            Warn: {
                type: Number,
                default: 5
            },
            Kick: {
                type: Number,
                default: 3
            },
            Ban: {
                type: Number,
                default: 3
            },
            TimePeriod: {
                type: String,
                default: "3m"
            }
        }
    },
    permissions: {
        type: [String],
        default: []
    }
}, { timestamps: true });

module.exports = mongoose.model('StaffRole', staffRoleSchema);