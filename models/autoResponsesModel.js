const mongoose = require('mongoose');

const embedSchema = new mongoose.Schema({
    title: {
        type: String,
        trim: true,
        maxlength: 256
    },
    description: {
        type: String,
        trim: true,
        maxlength: 4096
    },
    color: {
        type: String,
        default: '#7060be',
        validate: {
            validator: function(v) {
                return /^#([0-9a-f]{3}){1,2}$/i.test(v);
            },
            message: props => `${props.value} is not a valid hex color!`
        }
    },
    footer: {
        type: String,
        trim: true,
        maxlength: 2048
    },
    timestamp: {
        type: Boolean,
        default: false
    }
});

const autoResponseSchema = new mongoose.Schema({
    guildID: {
        type: String,
        required: true,
        index: true
    },
    trigger: {
        type: String,
        required: true,
        trim: true,
        maxlength: 150
    },
    type: {
        type: String,
        enum: ['TEXT', 'EMBED'],
        default: 'TEXT'
    },
    message: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: null
    },
    embed: {
        type: embedSchema,
        default: null
    },
    settings: {
        enabled: {
            type: Boolean,
            default: true
        },
        replyToUser: {
            type: Boolean,
            default: true
        },
        deleteUserMessage: {
            type: Boolean,
            default: false
        },
        whitelistedChannels: {
            type: [String],
            default: []
        },
        whitelistedCategories: {
            type: [String],
            default: []
        },
        blacklistedChannels: {
            type: [String],
            default: []
        },
        blacklistedCategories: {
            type: [String],
            default: []
        },
        exactMatch: {
            type: Boolean,
            default: false
        },
        caseSensitive: {
            type: Boolean,
            default: false
        },
        wildcardMatching: {
            type: Boolean,
            default: false
        },
        cooldown: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    createdBy: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    triggerCount: {
        type: Number,
        default: 0
    },
    lastTriggered: {
        type: Date,
        default: null
    }
});

autoResponseSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const AutoResponse = mongoose.model('AutoResponse', autoResponseSchema);
module.exports = AutoResponse;