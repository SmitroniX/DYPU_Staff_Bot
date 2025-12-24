const mongoose = require('mongoose');

const baseStatsSchema = {
    kicks: { type: Number, default: 0 },
    bans: { type: Number, default: 0 },
    warns: { type: Number, default: 0 },
    timeouts: { type: Number, default: 0 },
    memberJoins: { type: Number, default: 0 },
    memberLeaves: { type: Number, default: 0 },
    messagesSent: { type: Number, default: 0 },

    appealsSubmitted: { type: Number, default: 0 },
    appealsAccepted: { type: Number, default: 0 },
    appealsDenied: { type: Number, default: 0 },

    reportsReceived: { type: Number, default: 0 },
    reportsApproved: { type: Number, default: 0 },
    reportsDeclined: { type: Number, default: 0 }
};

const DailyStatsSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    date: { type: Date, required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true },
    day: { type: Number, required: true },
    dayOfWeek: { type: Number, required: true },
    ...baseStatsSchema
});

DailyStatsSchema.index({ guildId: 1, year: 1, month: 1, day: 1 }, { unique: true });

const WeeklyStatsSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    year: { type: Number, required: true },
    week: { type: Number, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    ...baseStatsSchema
});

WeeklyStatsSchema.index({ guildId: 1, year: 1, week: 1 }, { unique: true });

const MonthlyStatsSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true },
    ...baseStatsSchema
});

MonthlyStatsSchema.index({ guildId: 1, year: 1, month: 1 }, { unique: true });

const YearlyStatsSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    year: { type: Number, required: true },
    ...baseStatsSchema
});

YearlyStatsSchema.index({ guildId: 1, year: 1 }, { unique: true });

const AllTimeStatsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    ...baseStatsSchema,
    firstRecordDate: { type: Date, default: Date.now }
});

module.exports = {
    DailyStats: mongoose.model('DailyStats', DailyStatsSchema),
    WeeklyStats: mongoose.model('WeeklyStats', WeeklyStatsSchema),
    MonthlyStats: mongoose.model('MonthlyStats', MonthlyStatsSchema),
    YearlyStats: mongoose.model('YearlyStats', YearlyStatsSchema),
    AllTimeStats: mongoose.model('AllTimeStats', AllTimeStatsSchema)
};