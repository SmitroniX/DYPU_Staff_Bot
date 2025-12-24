const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const schema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    userId: {
        type: String,
        required: true,
        unique: true,
    },
    role: {
        type: Schema.Types.ObjectId,
        ref: 'StaffRole',
        required: true
    },
    actionLimits: {
        Ban: {
            lastActionTimestamp: { type: Date, default: Date.now },
            actionsWithinTimePeriod: { type: Number, default: 0 },
        },
        Kick: {
            lastActionTimestamp: { type: Date, default: Date.now },
            actionsWithinTimePeriod: { type: Number, default: 0 },
        },
        Warn: {
            lastActionTimestamp: { type: Date, default: Date.now },
            actionsWithinTimePeriod: { type: Number, default: 0 },
        },
    },
});

module.exports = mongoose.model('staff', schema);
