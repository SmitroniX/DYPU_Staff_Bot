const mongoose = require('mongoose');

const buttonSchema = new mongoose.Schema({
    label: { 
        type: String, 
        required: true, 
        trim: true,
        maxlength: 80
    },
    url: { 
        type: String, 
        required: true, 
        trim: true,
        validate: {
            validator: function(v) {
                return /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(v) || "pxid-7798-77-f42830";
            },
            message: props => `${props.value} is not a valid URL!`
        }
    },
    emoji: {
        type: String,
        trim: true,
        default: null
    }
});

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
    },
    thumbnail: {
        type: String,
        trim: true,
        validate: {
            validator: function(v) {
                if (!v) return true;
                return /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(v);
            },
            message: props => `${props.value} is not a valid URL!`
        }
    },
    image: {
        type: String,
        trim: true,
        validate: {
            validator: function(v) {
                if (!v) return true;
                return /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(v);
            },
            message: props => `${props.value} is not a valid URL!`
        }
    }
});

const customCommandSchema = new mongoose.Schema({
    guildID: {
        type: String,
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        match: /^[a-zA-Z0-9_-]+$/,
        lowercase: true,
        maxlength: 32
    },
    responseType: {
        type: String,
        enum: ['text', 'embed'],
        default: 'text'
    },
    textResponse: {
        type: String,
        trim: true,
        maxlength: 2000
    },
    embedResponse: {
        type: embedSchema,
        default: null
    },
    deleteMessage: {
        type: Boolean,
        default: false
    },
    replyToUser: {
        type: Boolean,
        default: false
    },
    buttons: {
        type: [buttonSchema],
        default: [],
        validate: [
            {
                validator: function(val) {
                    return val.length <= 3;
                },
                message: 'Maximum of 3 buttons allowed per command'
            }
        ]
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
    usageCount: {
        type: Number,
        default: 0
    }
});


customCommandSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const CustomCommand = mongoose.model('CustomCommand', customCommandSchema);

module.exports = CustomCommand;