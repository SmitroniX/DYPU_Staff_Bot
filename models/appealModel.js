const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
    },
    username: {
        type: String,
        required: true,
    },
    punishmentId: {
        type: String,
        required: true
    },
    punishmentType: {
        type: String,
        required: true
    },
    staffID: {
        type: String,
        required: true
    },
    answers: {
        type: Object,
        required: true
    },
    submissionDate: {
        type: Date,
        default: Date.now
    },
    appealID: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        default: 'Pending'
    },
    decisionUserID: {
        type: String,
    },
    decisionReason: {
        type: String,
    }
});

module.exports = mongoose.model('appeal', schema);
