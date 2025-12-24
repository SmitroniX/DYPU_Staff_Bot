const { 
    DailyStats, 
    WeeklyStats, 
    MonthlyStats, 
    YearlyStats, 
    AllTimeStats 
} = require('./models/statisticsModel');

const statsCache = new Map();
const CACHE_TTL = 60 * 1000;

function invalidateGuildCache(guildId) {
    for (const key of statsCache.keys()) {
        if (key.startsWith(`${guildId}:`)) {
            statsCache.delete(key);
        }
    }
}

async function incrementStat(guildId, metric, amount = 1) {
    try {
        const date = new Date();
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();
        const dayOfWeek = date.getDay();
        
        const week = getWeekNumber(date);
        
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - dayOfWeek);
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        
        const increment = { [metric]: amount };
        
        await Promise.all([
            DailyStats.findOneAndUpdate(
                { guildId, year, month, day },
                { 
                    $inc: increment, 
                    $setOnInsert: { date, dayOfWeek }
                },
                { upsert: true, new: true }
            ),
            
            WeeklyStats.findOneAndUpdate(
                { guildId, year, week },
                { 
                    $inc: increment,
                    $setOnInsert: { startDate: weekStart, endDate: weekEnd }
                },
                { upsert: true, new: true }
            ),
            
            MonthlyStats.findOneAndUpdate(
                { guildId, year, month },
                { $inc: increment },
                { upsert: true, new: true }
            ),
            
            YearlyStats.findOneAndUpdate(
                { guildId, year },
                { $inc: increment },
                { upsert: true, new: true }
            ),
            
            AllTimeStats.findOneAndUpdate(
                { guildId },
                { $inc: increment },
                { upsert: true, new: true }
            )
        ]);
        
        invalidateGuildCache(guildId);
        
        return true;
    } catch (error) {
        console.error(`Error incrementing stat ${metric}:`, error);
        return false;
    }
}

function getWeekNumber(date) {
    const targetDate = new Date(date);
    
    const dayNum = targetDate.getUTCDay() || 7;
    targetDate.setUTCDate(targetDate.getUTCDate() + 4 - dayNum);
    
    const yearStart = new Date(Date.UTC(targetDate.getUTCFullYear(), 0, 1));
    
    const weekNumber = Math.ceil((((targetDate - yearStart) / 86400000) + 1) / 7);
    
    return weekNumber;
}

async function getDailyStats(guildId, { year, month, day, limit = 30 } = {}) {
    const cacheKey = `${guildId}:daily:${year || 'all'}:${month !== undefined ? month : 'all'}:${day || 'all'}:${limit}`;
    
    if (statsCache.has(cacheKey)) {
        return statsCache.get(cacheKey);
    }
    
    const query = { guildId };
    
    if (year) query.year = year;
    if (month !== undefined) query.month = month;
    if (day) query.day = day;
    
    const results = await DailyStats.find(query)
        .sort({ date: -1 })
        .limit(limit);
    
    // Cache results
    statsCache.set(cacheKey, results);
    setTimeout(() => statsCache.delete(cacheKey), CACHE_TTL);
    
    return results;
}

async function getWeeklyStats(guildId, { year, week, limit = 12 } = {}) {
    const cacheKey = `${guildId}:weekly:${year || 'all'}:${week || 'all'}:${limit}`;
    
    if (statsCache.has(cacheKey)) {
        return statsCache.get(cacheKey);
    }
    
    const query = { guildId };
    
    if (year) query.year = year;
    if (week) query.week = week;
    
    const results = await WeeklyStats.find(query)
        .sort({ year: -1, week: -1 })
        .limit(limit);
    
    statsCache.set(cacheKey, results);
    setTimeout(() => statsCache.delete(cacheKey), CACHE_TTL);
    
    return results;
}

async function getMonthlyStats(guildId, { year, month, limit = 12 } = {}) {
    const cacheKey = `${guildId}:monthly:${year || 'all'}:${month !== undefined ? month : 'all'}:${limit}`;
    
    if (statsCache.has(cacheKey)) {
        return statsCache.get(cacheKey);
    }
    
    const query = { guildId };
    
    if (year) query.year = year;
    if (month !== undefined) query.month = month;
    
    const results = await MonthlyStats.find(query)
        .sort({ year: -1, month: -1 })
        .limit(limit);
    
    statsCache.set(cacheKey, results);
    setTimeout(() => statsCache.delete(cacheKey), CACHE_TTL);
    
    return results;
}

async function getYearlyStats(guildId, { year, limit = 5 } = {}) {
    const cacheKey = `${guildId}:yearly:${year || 'all'}:${limit}`;
    
    if (statsCache.has(cacheKey)) {
        return statsCache.get(cacheKey);
    }
    
    const query = { guildId };
    
    if (year) query.year = year;
    
    const results = await YearlyStats.find(query)
        .sort({ year: -1 })
        .limit(limit);
    
    statsCache.set(cacheKey, results);
    setTimeout(() => statsCache.delete(cacheKey), CACHE_TTL);
    
    return results;
}

async function getAllTimeStats(guildId) {
    const cacheKey = `${guildId}:alltime`;
    
    if (statsCache.has(cacheKey)) {
        return statsCache.get(cacheKey);
    }
    
    const results = await AllTimeStats.findOne({ guildId });
    
    statsCache.set(cacheKey, results);
    setTimeout(() => statsCache.delete(cacheKey), CACHE_TTL);
    
    return results;
}

function formatForChart(stats, metric) {
    const labels = [];
    const data = [];
    
    stats.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    stats.forEach(stat => {
        let label;
        if (stat.day) {
            label = `${stat.month + 1}/${stat.day}`;
        } else if (stat.month !== undefined) {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            label = `${monthNames[stat.month]} ${stat.year}`;
        } else if (stat.week) {
            label = `Week ${stat.week}, ${stat.year}`;
        } else {
            label = `${stat.year}`;
        }
        
        labels.push(label);
        data.push(stat[metric] || 0);
    });
    
    return {
        labels,
        datasets: [{
            label: formatMetricName(metric),
            data,
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1
        }]
    };
}

async function getCurrentWeekDailyStats(guildId) {
    const cacheKey = `${guildId}:currentWeek`;
    
    if (statsCache.has(cacheKey)) {
        return statsCache.get(cacheKey);
    }
    
    const currentDate = new Date();
    
    currentDate.setHours(0, 0, 0, 0);
    
    const startOfWeek = new Date(currentDate);
    const day = currentDate.getDay();
    
    const daysToSubtract = day === 0 ? 6 : day - 1;
    startOfWeek.setDate(currentDate.getDate() - daysToSubtract);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    const weekDates = [];
    const tempDate = new Date(startOfWeek);
    
    while (tempDate <= endOfWeek) {
        weekDates.push(new Date(tempDate));
        tempDate.setDate(tempDate.getDate() + 1);
    }
    
    const queries = weekDates.map(date => {
        return {
            query: {
                guildId,
                year: date.getFullYear(),
                month: date.getMonth(),
                day: date.getDate()
            },
            date
        };
    });
    
    const results = await Promise.all(
        queries.map(q => DailyStats.findOne(q.query))
    );
    
    const weekStats = queries.map((q, index) => {
        const dayStats = results[index];
        if (!dayStats) {
            return {
                date: q.date,
                year: q.date.getFullYear(),
                month: q.date.getMonth(),
                day: q.date.getDate(),
                dayOfWeek: q.date.getDay(),
                messagesSent: 0,
                memberJoins: 0,
                memberLeaves: 0,
                warns: 0,
                timeouts: 0,
                kicks: 0,
                bans: 0
            };
        }
        return dayStats;
    });
    
    statsCache.set(cacheKey, weekStats);
    setTimeout(() => statsCache.delete(cacheKey), CACHE_TTL);
    
    return weekStats;
}

async function getLast24HoursStats(guildId) {
    const cacheKey = `${guildId}:last24h`;
    
    if (statsCache.has(cacheKey)) {
        return statsCache.get(cacheKey);
    }
    
    try {
        const oneDayAgo = new Date();
        oneDayAgo.setHours(oneDayAgo.getHours() - 24);
        
        const dailyStats = await DailyStats.find({
            guildId,
            date: { $gte: oneDayAgo }
        });
        
        const result = dailyStats.reduce((total, stat) => {
            total.kicks += stat.kicks || 0;
            total.bans += stat.bans || 0;
            total.warns += stat.warns || 0;
            total.timeouts += stat.timeouts || 0;
            total.memberJoins += stat.memberJoins || 0;
            total.memberLeaves += stat.memberLeaves || 0;
            total.messagesSent += stat.messagesSent || 0;
            return total;
        }, {
            kicks: 0,
            bans: 0,
            warns: 0,
            timeouts: 0,
            memberJoins: 0,
            memberLeaves: 0,
            messagesSent: 0
        });
        
        statsCache.set(cacheKey, result);
        setTimeout(() => statsCache.delete(cacheKey), CACHE_TTL);
        
        return result;
    } catch (error) {
        console.error('Error getting last 24 hours stats:', error);
        return {
            kicks: 0,
            bans: 0,
            warns: 0,
            timeouts: 0,
            memberJoins: 0,
            memberLeaves: 0,
            messagesSent: 0
        };
    }
}

function formatCurrentWeekForChart(weekStats, metric) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    const labels = weekStats.map(stat => {
        const date = new Date(stat.date || new Date(stat.year, stat.month, stat.day));
        return dayNames[date.getDay()];
    });
    
    const data = weekStats.map(stat => stat[metric] || 0);
    
    return {
        labels,
        datasets: [{
            label: formatMetricName(metric),
            data,
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
        }]
    };
}

function formatMetricName(metric) {
    return metric
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase());
}

function formatYearlyForChart(stats, metric) {
    const labels = [];
    const data = [];
    
    stats.sort((a, b) => a.year - b.year);
    
    stats.forEach(stat => {
        labels.push(stat.year.toString());
        data.push(stat[metric] || 0);
    });
    
    return {
        labels,
        datasets: [{
            label: formatMetricName(metric),
            data,
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
        }]
    };
}

module.exports = {
    incrementStat,
    getDailyStats,
    getWeeklyStats,
    getMonthlyStats,
    getYearlyStats,
    getAllTimeStats,
    formatForChart,
    formatMetricName,
    getWeekNumber,
    getCurrentWeekDailyStats,
    formatCurrentWeekForChart,
    getLast24HoursStats,
    formatYearlyForChart
};