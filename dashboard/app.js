const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const bodyParser = require('body-parser');
const passport = require('passport');
const DiscordStrategy = require('passport-discord');
const Discord = require('discord.js');
const fs = require('fs');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const { client } = require("../index.js")
const path = require('path');
const multer = require('multer');
const staffModel = require('../models/staffModel');
const guildModel = require('../models/guildModel');
const StaffRole = require('../models/staffRoleModel');
const Cooldown = require('../models/cooldownModel');
const dashboardModel = require("../models/dashboardModel");
const statsModel = require('../models/statisticsModel');
const Settings = require('../models/settingsModel');
const CustomCommand = require('../models/customCommandsModel');
const AutoResponse = require('../models/autoResponsesModel');
const appealModel = require('../models/appealModel');
const punishmentModel = require("../models/punishmentModel");
const AutoModeration = require('../models/autoModerationModel');

const ReportSettings = require("../models/reportSettingsModel");
const reportModel = require('../models/reportModel');

const userModel = require("../models/userModel");
const flash = require('express-flash');
const utils = require("../utils.js");
const axios = require('axios');
const color = require('ansi-colors');
const cookieParser = require('cookie-parser');
const ms = require('parse-duration');
const statsService = require('../statsService');

const app = express();

const PORT = config.Port || 3000;

async function createDashboardDocument() {
    try {

      const dModel = await dashboardModel.findOne({ guildID: config.GuildID });
      
      if (!dModel) {

        const newModel = new dashboardModel({
          guildID: config.GuildID,
          url: config.baseURL,
          port: PORT,
        });
        await newModel.save();
      } else {

        let updated = false;
        
        if (dModel.url !== config.baseURL) {
          dModel.url = config.baseURL;
          updated = true;
        }
        
        if (dModel.port !== PORT) {
          dModel.port = PORT;
          updated = true;
        }
        

        if (updated) {
          await dModel.save();
        }
      }
    } catch (error) {
      console.error(`[DATABASE] Error in createDashboardDocument:`, error);
    }
  }
  
  createDashboardDocument()

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {

      const filetypes = /jpeg|jpg|png|gif|ico|svg/;

      const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

      const mimetype = filetypes.test(file.mimetype);
  
      if (extname && mimetype) {
        return cb(null, true);
      } else {
        cb(new Error('Error: Images Only! (jpeg, jpg, png, gif, ico, svg)'));
      }
    }
  });
  

  const createUploadsDir = () => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    return uploadDir;
  };
  

  createUploadsDir();

  const createSettings = async () => {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
      await settings.save();
    }
    }
    createSettings()


if (config.trustProxy && config.trustProxy > 0) app.set('trust proxy', config.trustProxy);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: config.secretKey,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        mongoUrl: config.MongoURI,
        ttl: ms(config.SessionExpires),
        autoRemove: 'native'
    }),

    cookie: {
        secure: config.Secure,
        maxAge: ms(config.SessionExpires),
        sameSite: 'lax'
    }
}));
app.use(cookieParser())
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))


passport.use(new DiscordStrategy({
    clientID: config.clientID,
    clientSecret: config.clientSecret,
    callbackURL: config.callbackURL,
    scope: ['identify', 'guilds.join'],
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await userModel.findOne({ userID: profile.id });
        
        if (!user) {
            user = new userModel({
                userID: profile.id,
                accessToken,
                refreshToken,
                tokenExpires: new Date(Date.now() + 604800000)
            });
        } else {
            user.accessToken = accessToken;
            user.refreshToken = refreshToken;
            user.tokenExpires = new Date(Date.now() + 604800000);
        }
        
        await user.save();
        
        profile.accessToken = accessToken;
        return done(null, profile);
    } catch (error) {
        console.error("Error saving user tokens:", error);
        return done(null, profile);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/login' }), (req, res) => {
    const redirectUrl = req.cookies['redirectAfterLogin'] || '/';

    if(config.DashboardLogs) {

      const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} logged in`)}`;
      console.log(consoleLogMsg);
  

      const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) logged in`;
      fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
        if (error) console.error('Error logging login event:', error);
      });
    }

    res.redirect(redirectUrl);
  });


const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const discordBotVersion = packageJson.version;
app.locals.discordBotVersion = discordBotVersion;

app.use((req, res, next) => {
    const send = res.send;
    res.send = function (body) {
        if (typeof body === 'string' && body.includes('</body>')) {
            const consoleScript = `
                <script>
                    (function() {
                        const message = \`
%c
Plex Staff is made by Plex Development.
Version: ${discordBotVersion}
Get - https://plexdevelopment.net/products/plexstaff
\`,
                            style = \`
font-family: monospace;
color: #5e99ff;
background-color: #1e1e1e;
padding: 10px;
border: 1px solid #00aaff;
\`;
        
                        console.log(message, style);
                    })();
                </script>
                `;
            body = body.replace('</body>', consoleScript + '</body>');
        }
        send.call(this, body);
    };
    next();
});

const permissionCache = new Map(); // userId-permission -> {result, timestamp}
const PERMISSION_CACHE_TTL = 3 * 60 * 1000; // 3 minutes in milliseconds

const isLoggedIn = (permissions) => async (req, res, next) => {
    try {
        if (req.isAuthenticated()) {
            const userID = req.user.id;

            const guild = await client.guilds.cache.get(config.GuildID);

            try {
                const member = await guild.members.fetch(req.user.id);
            } catch (error) {
                return res.redirect('/appeal');
            }


            const cachedCheckPermission = async (userId, permission) => {
                const cacheKey = `${userId}-${permission}`;
                const now = Date.now();
                const cached = permissionCache.get(cacheKey);
                
                if (cached && (now - cached.timestamp < PERMISSION_CACHE_TTL)) {
                    return cached.result;
                }
                

                const result = await utils.checkPermission(userId, permission);
                

                permissionCache.set(cacheKey, {
                    result,
                    timestamp: now
                });
                
                return result;
            };


            const navbarPermissions = ['VIEW_STATS', 'VIEW_APPEALS', 'LOOKUP_PUNISHMENTS', 'MANAGE_STAFF_MEMBERS', 'VIEW_REPORTS', 'ADMINISTRATOR'];
            const allPermissions = [...new Set([...(permissions || []), ...navbarPermissions])];


            if (allPermissions && allPermissions.length > 0) {
                const permissionsStatus = await Promise.all(allPermissions.map(async (permission) => {
                    return { [permission]: await cachedCheckPermission(userID, permission) };
                }));
                const permissionsMap = Object.assign({}, ...permissionsStatus);
                res.locals.permissions = permissionsMap;
            }

            const hasPermission = await cachedCheckPermission(req.user.id, "ACCESS_DASHBOARD");

            if (!hasPermission) {
                return res.redirect('/appeal');
            }

            return next();
        } else {
            res.cookie('redirectAfterLogin', req.originalUrl);
            res.redirect(`/login`);
        }
    } catch (error) {
        console.error('Error checking permissions:', error);
        res.locals.permissions = {}; // Set to empty object in case of error
        res.render('error', { config, errorMessage: 'An error occurred while checking permissions!' });
    }
};


const requireLogin = async (req, res, next) => {
    try {
        if (req.isAuthenticated()) {

            return next();
        } else {

            res.cookie('redirectAfterLogin', req.originalUrl);
            res.redirect(`/login`);
        }
    } catch (error) {
        console.error('Error checking authentication status:', error);
        res.render('error', { config, errorMessage: 'An error occurred while checking authentication status!' });
    }
};

let globalSettings = {};

async function loadSettings(req, res, next) {
  try {
      const settings = await Settings.findOne();
      if (!settings) return next(new Error('Settings not found'));

      globalSettings = settings;

      res.locals.settings = settings;


function hexToRgb(hex) {
  hex = hex.replace('#', '');
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}
  const rgbColor = hexToRgb(settings.accentColor);
  res.locals.accentColorRgb = rgbColor;

      next();
  } catch (err) {
      next(err);
  }
}

app.use(loadSettings);

app.get('/login', (req, res) => {
    res.render('login', { config: config });
});

app.get('/home', isLoggedIn(['VIEW_RECENT_PUNISHMENTS']), async (req, res) => {
    try {
        const guildId = config.GuildID;
        const guild = client.guilds.cache.get(guildId);

        if(config.DashboardLogs) {

            const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accessed ${color.cyan('/home')} page`)}`;
            console.log(consoleLogMsg);


            const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accessed /home page`;
            fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
              if (error) console.error('Error logging event:', error);
            });
        }

        const [guildData, recentPunishments, currentWeekStats, last24Hours] = await Promise.all([
            guildModel.findOne({ guildID: guildId }),
            punishmentModel.find({}).sort({ date: -1 }).limit(3),
            statsService.getCurrentWeekDailyStats(guildId),
            statsService.getLast24HoursStats(guildId)
        ]);
    


        const weeklyActivityData = {
            labels: currentWeekStats.map(stat => {
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                
                const date = new Date(stat.date || new Date(stat.year, stat.month, stat.day));
                const dayName = dayNames[date.getDay()];
                const monthName = monthNames[date.getMonth()];
                const dayOfMonth = date.getDate();
                
                return `${dayName} (${monthName} ${dayOfMonth})`;
            }),
            datasets: [
                {
                    label: 'Kicks',
                    data: currentWeekStats.map(stat => stat.kicks || 0),
                    borderColor: 'rgb(41, 128, 185)',
                    backgroundColor: 'rgba(41, 128, 185, 0.2)',
                    pointBackgroundColor: 'rgb(41, 128, 185)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgb(41, 128, 185)',
                    fill: true
                },
                {
                    label: 'Bans',
                    data: currentWeekStats.map(stat => stat.bans || 0),
                    borderColor: 'rgb(217, 83, 79)',
                    backgroundColor: 'rgba(217, 83, 79, 0.2)',
                    pointBackgroundColor: 'rgb(217, 83, 79)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgb(217, 83, 79)',
                    fill: true
                },
                {
                    label: 'Warnings',
                    data: currentWeekStats.map(stat => stat.warns || 0),
                    borderColor: 'rgb(240, 173, 78)',
                    backgroundColor: 'rgba(240, 173, 78, 0.2)',
                    pointBackgroundColor: 'rgb(240, 173, 78)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgb(240, 173, 78)',
                    fill: true
                },
                {
                    label: 'Timeouts',
                    data: currentWeekStats.map(stat => stat.timeouts || 0),
                    borderColor: 'rgb(153, 102, 255)',
                    backgroundColor: 'rgba(153, 102, 255, 0.2)',
                    pointBackgroundColor: 'rgb(153, 102, 255)',
                    pointBorderColor: '#fff', 
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgb(153, 102, 255)',
                    fill: true
                }
            ]
        };

        async function getDiscordUsername(userId, punishment) {
            try {
                const member = await guild.members.fetch(userId);
                return member.user.username;
            } catch (error) {

                if (punishment.userID === userId) {
                    return punishment.username || 'Unknown';
                } else if (punishment.staff === userId) {
                    return punishment.staffUsername || 'Unknown';
                }
                return 'Unknown';
            }
        }

        function getRelativeTime(date) {
            const currentDate = new Date();
            const targetDate = new Date(date);
            const timeDifference = currentDate.getTime() - targetDate.getTime();
        
            const seconds = Math.floor(timeDifference / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
        
            if (days > 0) {
                return days === 1 ? '1 day ago' : `${days} days ago`;
            } else if (hours > 0) {
                return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
            } else if (minutes > 0) {
                return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
            } else {
                return seconds <= 20 ? 'just now' : `${seconds} seconds ago`;
            }
        }


        const user = await guild.members.cache.get(req.user.id);
        const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');


        if (staffInfo) {
            Object.assign(user, {
                roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
                roleId: staffInfo.role ? staffInfo.role._id : null
            });
        } else {
            Object.assign(user, {
                roleName: null,
                roleId: null
            });
        }


        async function getUsername(userId, punishment) {
            return await getDiscordUsername(userId, punishment);
        }


        const recentPunishmentsWithUsernames = await Promise.all(recentPunishments.map(async (punishment) => {
            return {
                ...punishment.toObject(),
                userID: await getUsername(punishment.userID, punishment),
                staff: await getUsername(punishment.staff, punishment)
            };
        }));


        const memberCounts = {
            online: guild.members.cache.filter(member => member.presence?.status === 'online').size,
            idle: guild.members.cache.filter(member => member.presence?.status === 'idle').size,
            dnd: guild.members.cache.filter(member => member.presence?.status === 'dnd').size,
            offline: guild.members.cache.filter(member => !member.presence || member.presence.status === 'offline').size
        };

        res.render('home', { 
            user, 
            guild, 
            config, 
            guildData, 
            recentPunishments: recentPunishmentsWithUsernames, 
            getRelativeTime, 
            permissions: res.locals.permissions, 
            memberCounts, 
            weeklyActivityData: JSON.stringify(weeklyActivityData),
            last24Hours
        });
    } catch (err) {
        console.error('Error fetching guild data:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/stats', isLoggedIn(), async (req, res) => {
    const hasPermission = await utils.checkPermission(req.user.id, "VIEW_STATS");
    if(!hasPermission) return res.render('error', { config, errorMessage: `You don't have enough permissions to access this page!` });

    if(config.DashboardLogs) {
        const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accessed ${color.cyan('/stats')} page`)}`;
        console.log(consoleLogMsg);

        const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accessed /stats page`;
        fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
          if (error) console.error('Error logging event:', error);
        });
    }

    try {
        const guildId = config.GuildID;
        const guild = client.guilds.cache.get(guildId);

        const guildData = await guildModel.findOne({ guildID: guildId });
        const guildOwner = await guild.fetchOwner();

        const user = await guild.members.cache.get(req.user.id);
        
        const allTimeStats = await statsService.getAllTimeStats(guildId);
        const monthlyStats = await statsService.getMonthlyStats(guildId, { limit: 12 });
        const dailyStats = await statsService.getDailyStats(guildId, { limit: 30 });
        const yearlyStats = await statsService.getYearlyStats(guildId, { limit: 5 });
        
        const currentWeekStats = await statsService.getCurrentWeekDailyStats(guildId);

        const dailyChartData = {
            labels: dailyStats.slice(-7).map(stat => {
                const date = new Date(stat.date);
                return `${date.getMonth() + 1}/${date.getDate()}`;
            }),
            datasets: [
                {
                    label: 'Messages',
                    data: dailyStats.slice(-7).map(stat => stat.messagesSent || 0),
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Member Joins',
                    data: dailyStats.slice(-7).map(stat => stat.memberJoins || 0),
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Member Leaves',
                    data: dailyStats.slice(-7).map(stat => stat.memberLeaves || 0),
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.5)',
                    borderWidth: 2
                }
            ]
        };

        const weeklyActivityData = {
            labels: currentWeekStats.map(stat => {
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const date = new Date(stat.date || new Date(stat.year, stat.month, stat.day));
                return dayNames[date.getDay()];
            }),
            datasets: [
                {
                    label: 'Messages',
                    data: currentWeekStats.map(stat => stat.messagesSent || 0),
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Member Joins',
                    data: currentWeekStats.map(stat => stat.memberJoins || 0),
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Member Leaves',
                    data: currentWeekStats.map(stat => stat.memberLeaves || 0),
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.5)',
                    borderWidth: 2
                }
            ]
        };

        const monthlyChartData = {
            labels: monthlyStats.map(stat => {
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return `${monthNames[stat.month]} ${stat.year}`;
            }),
            datasets: [
                {
                    label: 'Messages',
                    data: monthlyStats.map(stat => stat.messagesSent || 0),
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Member Joins',
                    data: monthlyStats.map(stat => stat.memberJoins || 0),
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Member Leaves',
                    data: monthlyStats.map(stat => stat.memberLeaves || 0),
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.5)',
                    borderWidth: 2
                }
            ]
        };
        
        const moderationTrendsData = {
            labels: dailyStats.slice(-14).map(stat => {
                const date = new Date(stat.date);
                return `${date.getMonth() + 1}/${date.getDate()}`;
            }),
            datasets: [
                {
                    label: 'Warns',
                    data: dailyStats.slice(-14).map(stat => stat.warns || 0),
                    borderColor: 'rgba(255, 206, 86, 1)',
                    backgroundColor: 'rgba(255, 206, 86, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Timeouts',
                    data: dailyStats.slice(-14).map(stat => stat.timeouts || 0),
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Kicks',
                    data: dailyStats.slice(-14).map(stat => stat.kicks || 0),
                    borderColor: 'rgba(153, 102, 255, 1)',
                    backgroundColor: 'rgba(153, 102, 255, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Bans',
                    data: dailyStats.slice(-14).map(stat => stat.bans || 0),
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.5)',
                    borderWidth: 2
                }
            ]
        };

        const weeklyModerationTrendsData = {
            labels: currentWeekStats.map(stat => {
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const date = new Date(stat.date || new Date(stat.year, stat.month, stat.day));
                return dayNames[date.getDay()];
            }),
            datasets: [
                {
                    label: 'Warns',
                    data: currentWeekStats.map(stat => stat.warns || 0),
                    borderColor: 'rgba(255, 206, 86, 1)',
                    backgroundColor: 'rgba(255, 206, 86, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Timeouts',
                    data: currentWeekStats.map(stat => stat.timeouts || 0),
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Kicks',
                    data: currentWeekStats.map(stat => stat.kicks || 0),
                    borderColor: 'rgba(153, 102, 255, 1)',
                    backgroundColor: 'rgba(153, 102, 255, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Bans',
                    data: currentWeekStats.map(stat => stat.bans || 0),
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.5)',
                    borderWidth: 2
                }
            ]
        };

        const monthlyModerationTrendsData = {
            labels: monthlyStats.map(stat => {
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return `${monthNames[stat.month]} ${stat.year}`;
            }),
            datasets: [
                {
                    label: 'Warns',
                    data: monthlyStats.map(stat => stat.warns || 0),
                    borderColor: 'rgba(255, 206, 86, 1)',
                    backgroundColor: 'rgba(255, 206, 86, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Timeouts',
                    data: monthlyStats.map(stat => stat.timeouts || 0),
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Kicks',
                    data: monthlyStats.map(stat => stat.kicks || 0),
                    borderColor: 'rgba(153, 102, 255, 1)',
                    backgroundColor: 'rgba(153, 102, 255, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Bans',
                    data: monthlyStats.map(stat => stat.bans || 0),
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.5)',
                    borderWidth: 2
                }
            ]
        };

        const yearlyChartData = {
            labels: yearlyStats.map(stat => stat.year.toString()),
            datasets: [
                {
                    label: 'Messages',
                    data: yearlyStats.map(stat => stat.messagesSent || 0),
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Member Joins',
                    data: yearlyStats.map(stat => stat.memberJoins || 0),
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Member Leaves',
                    data: yearlyStats.map(stat => stat.memberLeaves || 0),
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.5)',
                    borderWidth: 2
                }
            ]
        };
        
        const yearlyModerationTrendsData = {
            labels: yearlyStats.map(stat => stat.year.toString()),
            datasets: [
                {
                    label: 'Warns',
                    data: yearlyStats.map(stat => stat.warns || 0),
                    borderColor: 'rgba(255, 206, 86, 1)',
                    backgroundColor: 'rgba(255, 206, 86, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Timeouts',
                    data: yearlyStats.map(stat => stat.timeouts || 0),
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Kicks',
                    data: yearlyStats.map(stat => stat.kicks || 0),
                    borderColor: 'rgba(153, 102, 255, 1)',
                    backgroundColor: 'rgba(153, 102, 255, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Bans',
                    data: yearlyStats.map(stat => stat.bans || 0),
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.5)',
                    borderWidth: 2
                }
            ]
        };

        const weeklyAppealsData = {
            labels: currentWeekStats.map(stat => {
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const date = new Date(stat.date || new Date(stat.year, stat.month, stat.day));
                return dayNames[date.getDay()];
            }),
            datasets: [
                {
                    label: 'Appeals Submitted',
                    data: currentWeekStats.map(stat => stat.appealsSubmitted || 0),
                    borderColor: 'rgba(142, 68, 173, 1)',
                    backgroundColor: 'rgba(142, 68, 173, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Appeals Accepted',
                    data: currentWeekStats.map(stat => stat.appealsAccepted || 0),
                    borderColor: 'rgba(46, 204, 113, 1)',
                    backgroundColor: 'rgba(46, 204, 113, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Appeals Denied',
                    data: currentWeekStats.map(stat => stat.appealsDenied || 0),
                    borderColor: 'rgba(231, 76, 60, 1)',
                    backgroundColor: 'rgba(231, 76, 60, 0.5)',
                    borderWidth: 2
                }
            ]
        };

        const monthlyAppealsData = {
            labels: monthlyStats.map(stat => {
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return `${monthNames[stat.month]} ${stat.year}`;
            }),
            datasets: [
                {
                    label: 'Appeals Submitted',
                    data: monthlyStats.map(stat => stat.appealsSubmitted || 0),
                    borderColor: 'rgba(142, 68, 173, 1)',
                    backgroundColor: 'rgba(142, 68, 173, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Appeals Accepted',
                    data: monthlyStats.map(stat => stat.appealsAccepted || 0),
                    borderColor: 'rgba(46, 204, 113, 1)',
                    backgroundColor: 'rgba(46, 204, 113, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Appeals Denied',
                    data: monthlyStats.map(stat => stat.appealsDenied || 0),
                    borderColor: 'rgba(231, 76, 60, 1)',
                    backgroundColor: 'rgba(231, 76, 60, 0.5)',
                    borderWidth: 2
                }
            ]
        };

        const yearlyAppealsData = {
            labels: yearlyStats.map(stat => stat.year.toString()),
            datasets: [
                {
                    label: 'Appeals Submitted',
                    data: yearlyStats.map(stat => stat.appealsSubmitted || 0),
                    borderColor: 'rgba(142, 68, 173, 1)',
                    backgroundColor: 'rgba(142, 68, 173, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Appeals Accepted',
                    data: yearlyStats.map(stat => stat.appealsAccepted || 0),
                    borderColor: 'rgba(46, 204, 113, 1)',
                    backgroundColor: 'rgba(46, 204, 113, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Appeals Denied',
                    data: yearlyStats.map(stat => stat.appealsDenied || 0),
                    borderColor: 'rgba(231, 76, 60, 1)',
                    backgroundColor: 'rgba(231, 76, 60, 0.5)',
                    borderWidth: 2
                }
            ]
        };

        const weeklyReportsData = {
            labels: currentWeekStats.map(stat => {
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const date = new Date(stat.date || new Date(stat.year, stat.month, stat.day));
                return dayNames[date.getDay()];
            }),
            datasets: [
                {
                    label: 'Reports Received',
                    data: currentWeekStats.map(stat => stat.reportsReceived || 0),
                    borderColor: 'rgba(41, 128, 185, 1)',
                    backgroundColor: 'rgba(41, 128, 185, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Reports Approved',
                    data: currentWeekStats.map(stat => stat.reportsApproved || 0),
                    borderColor: 'rgba(39, 174, 96, 1)',
                    backgroundColor: 'rgba(39, 174, 96, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Reports Declined',
                    data: currentWeekStats.map(stat => stat.reportsDeclined || 0),
                    borderColor: 'rgba(192, 57, 43, 1)',
                    backgroundColor: 'rgba(192, 57, 43, 0.5)',
                    borderWidth: 2
                }
            ]
        };

        const monthlyReportsData = {
            labels: monthlyStats.map(stat => {
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return `${monthNames[stat.month]} ${stat.year}`;
            }),
            datasets: [
                {
                    label: 'Reports Received',
                    data: monthlyStats.map(stat => stat.reportsReceived || 0),
                    borderColor: 'rgba(41, 128, 185, 1)',
                    backgroundColor: 'rgba(41, 128, 185, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Reports Approved',
                    data: monthlyStats.map(stat => stat.reportsApproved || 0),
                    borderColor: 'rgba(39, 174, 96, 1)',
                    backgroundColor: 'rgba(39, 174, 96, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Reports Declined',
                    data: monthlyStats.map(stat => stat.reportsDeclined || 0),
                    borderColor: 'rgba(192, 57, 43, 1)',
                    backgroundColor: 'rgba(192, 57, 43, 0.5)',
                    borderWidth: 2
                }
            ]
        };

        const yearlyReportsData = {
            labels: yearlyStats.map(stat => stat.year.toString()),
            datasets: [
                {
                    label: 'Reports Received',
                    data: yearlyStats.map(stat => stat.reportsReceived || 0),
                    borderColor: 'rgba(41, 128, 185, 1)',
                    backgroundColor: 'rgba(41, 128, 185, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Reports Approved',
                    data: yearlyStats.map(stat => stat.reportsApproved || 0),
                    borderColor: 'rgba(39, 174, 96, 1)',
                    backgroundColor: 'rgba(39, 174, 96, 0.5)',
                    borderWidth: 2
                },
                {
                    label: 'Reports Declined',
                    data: yearlyStats.map(stat => stat.reportsDeclined || 0),
                    borderColor: 'rgba(192, 57, 43, 1)',
                    backgroundColor: 'rgba(192, 57, 43, 0.5)',
                    borderWidth: 2
                }
            ]
        };

        let totalModActions = 0;
        const monthlyModData = monthlyStats.reduce((acc, stat) => {
            acc.warns += stat.warns || 0;
            acc.timeouts += stat.timeouts || 0;
            acc.kicks += stat.kicks || 0;
            acc.bans += stat.bans || 0;
            return acc;
        }, { warns: 0, timeouts: 0, kicks: 0, bans: 0 });
        
        totalModActions = monthlyModData.warns + monthlyModData.timeouts + monthlyModData.kicks + monthlyModData.bans;
        
        const pieChartData = {
            labels: ['Warns', 'Timeouts', 'Kicks', 'Bans'],
            datasets: [{
                data: [
                    monthlyModData.warns,
                    monthlyModData.timeouts,
                    monthlyModData.kicks,
                    monthlyModData.bans
                ],
                backgroundColor: [
                    'rgba(255, 206, 86, 0.7)',
                    'rgba(75, 192, 192, 0.7)',
                    'rgba(153, 102, 255, 0.7)',
                    'rgba(255, 99, 132, 0.7)'
                ],
                borderColor: [
                    'rgba(255, 206, 86, 1)',
                    'rgba(75, 192, 192, 1)',
                    'rgba(153, 102, 255, 1)',
                    'rgba(255, 99, 132, 1)'
                ],
                borderWidth: 1
            }]
        };

        const topUsersData = await userModel.find().sort({ totalMessages: -1, totalEmojisUsed: -1 }).limit(20);
        const userDataPromises = topUsersData.map(async (userData) => {
            try {
                const fetchedUser = await client.users.fetch(userData.userID);
                return {
                    username: fetchedUser.username,
                    userID: fetchedUser.id,
                    avatarURL: fetchedUser.avatarURL({ format: 'png', size: 256 }) || 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png',
                    totalMessages: userData.totalMessages,
                    totalEmojisUsed: userData.totalEmojisUsed
                };
            } catch (error) {
                return {
                    username: 'Unknown User',
                    userID: userData.userID,
                    avatarURL: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png',
                    totalMessages: userData.totalMessages,
                    totalEmojisUsed: userData.totalEmojisUsed
                };
            }
        });

        const userData = await Promise.all(userDataPromises);

        const topUsers = userData
          .filter(user => user.totalMessages > 0)
          .sort((a, b) => b.totalMessages - a.totalMessages)
          .slice(0, 10);

        const topEmojisUsed = userData
          .filter(user => user.totalEmojisUsed > 0) 
          .sort((a, b) => b.totalEmojisUsed - a.totalEmojisUsed)
          .slice(0, 10);

        const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');

        if (staffInfo) {
            Object.assign(user, {
                roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
                roleId: staffInfo.role ? staffInfo.role._id : null
            });
        } else {
            Object.assign(user, {
                roleName: null,
                roleId: null
            });
        }

        function getRelativeTime(date) {
            const currentDate = new Date();
            const targetDate = new Date(date);
            const timeDifference = currentDate.getTime() - targetDate.getTime();
        
            const seconds = Math.floor(timeDifference / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
        
            if (days > 0) {
                return days === 1 ? '1 day ago' : `${days} days ago`;
            } else if (hours > 0) {
                return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
            } else if (minutes > 0) {
                return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
            } else {
                return seconds <= 20 ? 'just now' : `${seconds} seconds ago`;
            }
        }

        res.render('stats', { 
            user,
            guild,
            guildOwner,
            guildData,
            topUsers,
            topEmojisUsed,
            config,
            getRelativeTime,
            permissions: res.locals.permissions,
            allTimeStats,
            dailyChartData: JSON.stringify(dailyChartData),
            weeklyChartData: JSON.stringify(weeklyActivityData),
            monthlyChartData: JSON.stringify(monthlyChartData),
            yearlyChartData: JSON.stringify(yearlyChartData),
            weeklyAppealsData: JSON.stringify(weeklyAppealsData),
            monthlyAppealsData: JSON.stringify(monthlyAppealsData),
            yearlyAppealsData: JSON.stringify(yearlyAppealsData),
            weeklyReportsData: JSON.stringify(weeklyReportsData),
            monthlyReportsData: JSON.stringify(monthlyReportsData),
            yearlyReportsData: JSON.stringify(yearlyReportsData),
            moderationTrendsData: JSON.stringify(moderationTrendsData),
            weeklyModerationTrendsData: JSON.stringify(weeklyModerationTrendsData),
            monthlyModerationTrendsData: JSON.stringify(monthlyModerationTrendsData),
            yearlyModerationTrendsData: JSON.stringify(yearlyModerationTrendsData),
            pieChartData: JSON.stringify(pieChartData),
            totalModActions
        });
    } catch (err) {
        console.error('Error fetching stats data:', err);
        res.render('error', { config, errorMessage: "An error occurred while fetching statistics data." });
    }
});

app.get('/logout', (req, res) => {

    if(config.DashboardLogs) {

    const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} logged out`)}`;
    console.log(consoleLogMsg);


    const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) logged out`;
    fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
      if (error) console.error('Error logging logout event:', error);
    });
}


    res.clearCookie('redirectAfterLogin');
    req.logout((err) => {
      if (err) {
        console.error('Error during logout:', err);
        return next(err);
      }
      res.redirect('/');
    });
  });

  app.get('/members', isLoggedIn(), async (req, res) => {
    const guildId = config.GuildID;
    const guild = client.guilds.cache.get(guildId);
    const memberCountWithoutBots = guild.members.cache.filter(member => !member.user.bot).size;
    const memberCount = memberCountWithoutBots.toLocaleString('en-US');

    if(config.DashboardLogs) {

        const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accessed ${color.cyan('/members')} page`)}`;
        console.log(consoleLogMsg);
    

        const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accessed /members page`;
        fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
          if (error) console.error('Error logging event:', error);
        });
    }


    await guild.members.fetch({ withPresences: true });

    const membersPerPage = 30;
    const page = parseInt(req.query.page) || 1;
    const searchQuery = req.query.search || '';
    const filterOption = req.query.sort || 'highestRole';

    const startIndex = (page - 1) * membersPerPage;
    const endIndex = startIndex + membersPerPage;


    const allMembers = Array.from(guild.members.cache.values());
    const filteredMembers = allMembers
        .filter(member => !member.user.bot)
        .filter(member => {
            const usernameMatch = member.user.username.toLowerCase().includes(searchQuery.toLowerCase());
            const nicknameMatch = member.nickname && member.nickname.toLowerCase().includes(searchQuery.toLowerCase());
            const userIdMatch = member.user.id.includes(searchQuery);

            return usernameMatch || nicknameMatch || userIdMatch;
        })
        .sort((a, b) => {
            if (filterOption === 'highestRole') {

                return b.roles.highest.position - a.roles.highest.position;
            } else if (filterOption === 'creationDateNewest') {

                return b.user.createdTimestamp - a.user.createdTimestamp;
            } else if (filterOption === 'creationDateOldest') {

                return a.user.createdTimestamp - b.user.createdTimestamp;
            } else if (filterOption === 'joinDateNewest') {

                return b.joinedTimestamp - a.joinedTimestamp;
            } else if (filterOption === 'joinDateOldest') {

                return a.joinedTimestamp - b.joinedTimestamp;
            } else {
                return 0;
            }
        });


    const members = filteredMembers.slice(startIndex, endIndex);

    const totalMembers = filteredMembers.length;
    const totalPages = Math.ceil(totalMembers / membersPerPage);


    const user = await guild.members.cache.get(req.user.id);
    const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');


    if (staffInfo) {
        Object.assign(user, {
            roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
            roleId: staffInfo.role ? staffInfo.role._id : null
        });
    } else {
        Object.assign(user, {
            roleName: null,
            roleId: null
        });
    }

    const staffMembers = await staffModel.find({});

    res.render('members', { members, currentPage: page, totalPages, user: user, sortOption: filterOption, searchQuery, memberCount, config, staffMembers });
});

app.get('/settings', isLoggedIn(), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);
    
    const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
    if (!hasPermission) {
        return res.status(403).json({ 
            success: false, 
            message: 'You do not have permission to manage settings.' 
        });
    }


    if(config.DashboardLogs) {

        const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accessed ${color.cyan('/settings')} page`)}`;
        console.log(consoleLogMsg);
        

        const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accessed /settings page`;
        fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
            if (error) console.error('Error logging event:', error);
        });
    }
    
    try {

        const staffRoles = await StaffRole.find().sort({ priority: 1 });
        

        const autoModSettings = await AutoModeration.getOrCreate(config.GuildID);
        

        const user = await guild.members.cache.get(req.user.id);
        const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');
        

        if (staffInfo) {
            Object.assign(user, {
                roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
                roleId: staffInfo.role ? staffInfo.role._id : null
            });
        } else {
            Object.assign(user, {
                roleName: null,
                roleId: null
            });
        }
        
        res.render('settings/settings', {
            config,
            user,
            staffRoles,
            guild,
            autoModSettings, // Pass auto mod settings to the template
            messages: req.flash()
        });
    } catch (error) {
        console.error('Error fetching settings:', error);
        req.flash('error', 'Error fetching settings');
        res.redirect('/dashboard');
    }
});

app.get('/settings/report-system', isLoggedIn(), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);
    
    const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
    if (!hasPermission) {
        return res.status(403).json({ 
            success: false, 
            message: 'You do not have permission to manage settings.'
        });
    }

    if(config.DashboardLogs) {
        const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accessed ${color.cyan('/settings/report-system')} page`)}`;
        console.log(consoleLogMsg);
        
        const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accessed /settings/report-system page`;
        fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
            if (error) console.error('Error logging event:', error);
        });
    }
    
    try {
        let reportSettings = await ReportSettings.findOne({ guildId: config.GuildID });
        let settings = await Settings.findOne() || new Settings();
        
        // If settings don't exist, create default settings
        if (!reportSettings) {
            reportSettings = new ReportSettings({
                guildId: config.GuildID
            });
            await reportSettings.save();
        }
        
        const user = await guild.members.cache.get(req.user.id);
        const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');
        
        if (staffInfo) {
            Object.assign(user, {
                roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
                roleId: staffInfo.role ? staffInfo.role._id : null
            });
        } else {
            Object.assign(user, {
                roleName: null,
                roleId: null
            });
        }
        
        res.render('settings/report-system', {
            config,
            settings,
            reportSettings,
            user,
            guild,
            messages: req.flash()
        });
    } catch (error) {
        console.error('Error fetching report settings:', error);
        req.flash('error', 'Error fetching report settings');
        res.redirect('/settings');
    }
});

app.post('/settings/report-system', isLoggedIn(), async (req, res) => {
    try {
        const {
            reportEnabled,
            reportChannelId,
            requireReportReason,
            reportCooldown,
            saveTranscript,
            transcriptType,
            enableAutoActions,
            reportThreshold,
            reportTimeWindow,
            minUniqueReporters,
            autoActionType,
            timeoutDuration,
            timeoutDurationUnit,
            permanentBan,
            banDuration,
            banDurationUnit,
            autoActionReason
        } = req.body;
        
        const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to manage settings.' 
            });
        }

        let reportSettings = await ReportSettings.findOne({ guildId: config.GuildID });
        
        // If settings don't exist, create new ones
        if (!reportSettings) {
            reportSettings = new ReportSettings({
                guildId: config.GuildID
            });
        }
        
        // General settings
        reportSettings.reportEnabled = !!reportEnabled;
        reportSettings.reportChannelId = reportChannelId ? reportChannelId.trim() : '';
        reportSettings.requireReportReason = !!requireReportReason;
        reportSettings.reportCooldown = parseInt(reportCooldown) || 5;
        
        // Transcript settings
        reportSettings.saveTranscript = !!saveTranscript;
        reportSettings.transcriptType = transcriptType || 'allMessages';
        
        // Auto action settings
        reportSettings.enableAutoActions = !!enableAutoActions;
        reportSettings.reportThreshold = parseInt(reportThreshold) || 5;
        reportSettings.reportTimeWindow = parseInt(reportTimeWindow) || 24;
        reportSettings.minUniqueReporters = parseInt(minUniqueReporters) || 3;
        reportSettings.autoActionType = autoActionType || 'warn';
        
        // Duration settings based on action type
        if (autoActionType === 'timeout') {
            reportSettings.timeoutDuration = parseInt(timeoutDuration) || 24;
            reportSettings.timeoutDurationUnit = timeoutDurationUnit || 'h';
        } else if (autoActionType === 'ban') {
            reportSettings.permanentBan = !!permanentBan;
            reportSettings.banDuration = parseInt(banDuration) || 7;
            reportSettings.banDurationUnit = banDurationUnit || 'd';
        }
        
        reportSettings.autoActionReason = autoActionReason || 'Automatic action due to multiple user reports';
        reportSettings.updatedAt = new Date();
        
        await reportSettings.save();
        
        if (config.DashboardLogs) {
            const logMsg = `[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) updated report system settings`;
            fs.appendFile("./logs.txt", logMsg + '\n', (error) => {
                if (error) console.error('Error logging event:', error);
            });
        }
        
        req.flash('success', 'Report system settings updated successfully');
        return res.redirect('/settings/report-system');
    } catch (error) {
        console.error('Error saving report settings:', error);
        req.flash('error', 'Error saving settings: ' + error.message);
        return res.redirect('/settings/report-system');
    }
});

app.get('/settings/appeal-system', isLoggedIn(), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);
    
    const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
    if (!hasPermission) {
        return res.status(403).json({ 
            success: false, 
            message: 'You do not have permission to manage settings.' 
        });
    }


    if(config.DashboardLogs) {

        const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accessed ${color.cyan('/settings/appeal')} page`)}`;
        console.log(consoleLogMsg);
        

        const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accessed /settings/appeal page`;
        fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
            if (error) console.error('Error logging event:', error);
        });
    }
    
    try {

        let settings = await Settings.findOne() || new Settings();
        

        if (!settings.appealQuestions || settings.appealQuestions.length === 0) {
            settings.appealQuestions = [
                {
                    text: "Please describe the reason for your punishment:",
                    type: "paragraph",
                    required: true,
                    characterLimit: 2500
                },
                {
                    text: "What actions do you plan to take to prevent this issue from reoccurring in the future:",
                    type: "paragraph",
                    required: true,
                    characterLimit: 1500
                },
                {
                    text: "Do you have any additional information or evidence to support your appeal:",
                    type: "short",
                    required: false,
                    characterLimit: 1000
                }
            ];
        }
        

        const user = await guild.members.cache.get(req.user.id);
        const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');
        

        if (staffInfo) {
            Object.assign(user, {
                roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
                roleId: staffInfo.role ? staffInfo.role._id : null
            });
        } else {
            Object.assign(user, {
                roleName: null,
                roleId: null
            });
        }
        
        res.render('settings/appeal-system', {
            config,
            settings,
            user,
            guild,
            messages: req.flash()
        });
    } catch (error) {
        console.error('Error fetching appeal settings:', error);
        req.flash('error', 'Error fetching appeal settings');
        res.redirect('/settings');
    }
});


app.post('/settings/appeal', isLoggedIn(), async (req, res) => {
    try {
        const { 
            appealEnabled,
            addUsersBackEnabled,
            displayInactivePunishments,
            appealChannelId,
            customAppealLink,
            appealCooldown,
            questions
        } = req.body;
        
        const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to manage settings.' 
            });
        }

        let settings = await Settings.findOne() || new Settings();
        
        settings.appealEnabled = !!appealEnabled;
        settings.addUsersBackEnabled = !!addUsersBackEnabled;
        settings.displayInactivePunishments = !!displayInactivePunishments;
        settings.appealChannelId = appealChannelId ? appealChannelId.trim() : '';
        settings.customAppealLink = customAppealLink ? customAppealLink.trim() : '';
        
        settings.appealCooldown = appealCooldown !== undefined && appealCooldown !== '' ? 
            parseInt(appealCooldown) : 24;
        
        settings.updatedAt = new Date();
        
        const formattedQuestions = [];
        
        if (questions) {
            if (!Array.isArray(questions) && typeof questions === 'object') {
                const questionKeys = Object.keys(questions)
                    .sort((a, b) => {
                        return parseInt(a) - parseInt(b);
                    });
                
                for (const key of questionKeys) {
                    const question = questions[key];
                    formattedQuestions.push({
                        text: question.text,
                        type: question.type,
                        required: question.required === 'true' || question.required === true,
                        characterLimit: parseInt(question.characterLimit) || 1000
                    });
                }
            } 
            else if (Array.isArray(questions)) {
                questions.forEach(question => {
                    formattedQuestions.push({
                        text: question.text,
                        type: question.type,
                        required: question.required === 'true' || question.required === true,
                        characterLimit: parseInt(question.characterLimit) || 1000
                    });
                });
            }
        }
        
        settings.appealQuestions = formattedQuestions;
        
        await settings.save();
        
        if (config.DashboardLogs) {
            const logMsg = `[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) updated appeal system settings`;
            fs.appendFile("./logs.txt", logMsg + '\n', (error) => {
                if (error) console.error('Error logging event:', error);
            });
        }
        
        req.flash('success', 'Appeal system settings updated successfully');
        return res.redirect('/settings/appeal-system');
    } catch (error) {
        console.error('Error saving appeal settings:', error);
        req.flash('error', 'Error saving settings: ' + error.message);
        return res.redirect('/settings/appeal-system');
    }
});

app.get('/settings/appearance', isLoggedIn(), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);
    
    const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
    if (!hasPermission) {
        return res.status(403).json({ 
            success: false, 
            message: 'You do not have permission to manage settings.' 
        });
    }


    if(config.DashboardLogs) {

        const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accessed ${color.cyan('/settings/appearance')} page`)}`;
        console.log(consoleLogMsg);
        

        const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accessed /settings/appearance page`;
        fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
            if (error) console.error('Error logging event:', error);
        });
    }
    
    try {

        

        const user = await guild.members.cache.get(req.user.id);
        const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');
        

        if (staffInfo) {
            Object.assign(user, {
                roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
                roleId: staffInfo.role ? staffInfo.role._id : null
            });
        } else {
            Object.assign(user, {
                roleName: null,
                roleId: null
            });
        }
        
        res.render('settings/appearance', {
            config,
            user,
            guild,
            messages: req.flash()
        });
    } catch (error) {
        console.error('Error fetching dashboard appearance settings:', error);
        req.flash('error', 'Error fetching dashboard appearance settings');
        res.redirect('/settings');
    }
});

app.post('/settings/appearance', isLoggedIn(), upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'favicon', maxCount: 1 }
]), async (req, res) => {
    try {
        const { name, description, accentColor } = req.body;
        
        const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to manage settings.' 
            });
        }


        if (!name || !name.trim()) {
            req.flash('error', 'Dashboard name is required');
            return res.redirect('/settings/appearance');
        }
        

        let settings = await Settings.findOne() || new Settings();
        

        settings.name = name.trim();
        settings.description = description ? description.trim() : 'Discord Moderation Dashboard';
        settings.accentColor = accentColor || '#7060be';
        settings.updatedAt = new Date();
        

        if (req.files) {

            const uploadsDir = path.join(__dirname, '..', 'uploads');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            

            if (req.files.logo && req.files.logo[0]) {
                const logoFile = req.files.logo[0];
                

                const logoFileName = `logo-${Date.now()}${path.extname(logoFile.originalname)}`;
                const logoPath = path.join(__dirname, '..', 'uploads', logoFileName);
                

                fs.writeFileSync(logoPath, logoFile.buffer);
                

                settings.logo = `/uploads/${logoFileName}`;
            }
            

            if (req.files.favicon && req.files.favicon[0]) {
                const faviconFile = req.files.favicon[0];
                

                const faviconFileName = `favicon-${Date.now()}${path.extname(faviconFile.originalname)}`;
                const faviconPath = path.join(__dirname, '..', 'uploads', faviconFileName);
                

                fs.writeFileSync(faviconPath, faviconFile.buffer);
                

                settings.favicon = `/uploads/${faviconFileName}`;
            }
        }
        

        await settings.save();
        

        if (config.DashboardLogs) {
            const logMsg = `[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) updated dashboard appearance settings`;
            fs.appendFile("./logs.txt", logMsg + '\n', (error) => {
                if (error) console.error('Error logging event:', error);
            });
        }
        
        req.flash('success', 'Dashboard appearance settings updated successfully');
        return res.redirect('/settings/appearance');
    } catch (error) {
        console.error('Error saving dashboard appearance settings:', error);
        req.flash('error', 'Error saving settings: ' + error.message);
        return res.redirect('/settings/appearance');
    }
});

app.get('/settings/auto-responses', isLoggedIn(), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);
    
    const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
    if (!hasPermission) {
        return res.status(403).json({ 
            success: false, 
            message: 'You do not have permission to manage settings.' 
        });
    }


    if(config.DashboardLogs) {

        const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accessed ${color.cyan('/settings/auto-responses')} page`)}`;
        console.log(consoleLogMsg);
        

        const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accessed /settings/auto-responses page`;
        fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
            if (error) console.error('Error logging event:', error);
        });
    }
    
    try {

        const autoResponses = await AutoResponse.find({ guildID: config.GuildID }).sort({ trigger: 1 });
        
        

        const settings = await Settings.findOne() || new Settings();
        


        const autoResponseSettings = {
            enabled: true,
            messageType: 'TEXT',
            replyToUser: true,
            blacklistedChannels: [],
            blacklistedCategories: [],
            whitelistedChannels: [],
            whitelistedCategories: []
        };
        

        const user = await guild.members.cache.get(req.user.id);
        const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');
        

        if (staffInfo) {
            Object.assign(user, {
                roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
                roleId: staffInfo.role ? staffInfo.role._id : null
            });
        } else {
            Object.assign(user, {
                roleName: null,
                roleId: null
            });
        }
        
        res.render('settings/auto-responses', {
            config,
            user,
            guild,
            autoResponses,
            autoResponseSettings, // Pass the default autoResponseSettings object to the template
            settings,
            messages: req.flash()
        });
    } catch (error) {
        console.error('Error fetching auto responses:', error);
        req.flash('error', 'Error fetching auto responses');
        res.redirect('/settings');
    }
});


app.get('/settings/get-auto-response', isLoggedIn(), async (req, res) => {
    try {
        const responseId = req.query.id;
        
        const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to manage settings.' 
            });
        }

        if (!responseId) {
            return res.status(400).json({ success: false, message: 'Auto Response ID is required' });
        }
        
        const autoResponse = await AutoResponse.findById(responseId);
        
        if (!autoResponse) {
            return res.status(404).json({ success: false, message: 'Auto Response not found' });
        }
        

        if (autoResponse.guildID !== config.GuildID) {
            return res.status(403).json({ success: false, message: 'You do not have permission to view this auto response' });
        }
        
        return res.json({ success: true, autoResponse });
    } catch (error) {
        console.error('Error fetching auto response:', error);
        return res.status(500).json({ success: false, message: 'Error fetching auto response: ' + error.message });
    }
});


app.post('/settings/save-auto-response', isLoggedIn(), async (req, res) => {
    try {
        const { 
            id, 
            trigger, 
            type, 
            message, 
            embed,
            settings // Individual settings for this auto response
        } = req.body;
        
        const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to manage settings.' 
            });
        }


        if (!trigger) {
            return res.status(400).json({ success: false, message: 'Trigger phrase is required' });
        }
        
        if (type === 'TEXT' && !message) {
            return res.status(400).json({ success: false, message: 'Response message is required for text responses' });
        }
        
        let autoResponse;
        
        if (id) {

            autoResponse = await AutoResponse.findById(id);
            
            if (!autoResponse) {
                return res.status(404).json({ success: false, message: 'Auto Response not found' });
            }
            

            if (autoResponse.guildID !== config.GuildID) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'You do not have permission to edit this auto response' 
                });
            }
            

            if (trigger !== autoResponse.trigger) {
                const existingResponse = await AutoResponse.findOne({ 
                    guildID: config.GuildID, 
                    trigger: trigger
                });
                
                if (existingResponse) {
                    return res.status(400).json({ 
                        success: false, 
                        message: `An auto response with the trigger '${trigger}' already exists` 
                    });
                }
            }
        } else {


            const existingResponse = await AutoResponse.findOne({ 
                guildID: config.GuildID, 
                trigger: trigger
            });
            
            if (existingResponse) {
                return res.status(400).json({ 
                    success: false, 
                    message: `An auto response with the trigger '${trigger}' already exists` 
                });
            }
            
            autoResponse = new AutoResponse({
                guildID: config.GuildID,
                createdBy: req.user.id
            });
        }
        

        autoResponse.trigger = trigger;
        autoResponse.type = type;
        autoResponse.updatedAt = new Date();
        

        if (type === 'TEXT') {
            autoResponse.message = message;
            autoResponse.embed = null;
        } else {
            autoResponse.message = null;
            autoResponse.embed = embed;
        }
        

        if (settings) {
            autoResponse.settings = {
                enabled: settings.enabled !== undefined ? settings.enabled : true,
                replyToUser: settings.replyToUser !== undefined ? settings.replyToUser : true,
                deleteUserMessage: settings.deleteUserMessage || false,
                whitelistedChannels: settings.whitelistedChannels || [],
                whitelistedCategories: settings.whitelistedCategories || [],
                blacklistedChannels: settings.blacklistedChannels || [],
                blacklistedCategories: settings.blacklistedCategories || [],
                exactMatch: settings.exactMatch || false,
                caseSensitive: settings.caseSensitive || false,
                wildcardMatching: settings.wildcardMatching || false,
                cooldown: settings.cooldown || 0
            };
        }
        

        await autoResponse.save();
        

        if (config.DashboardLogs) {
            const action = id ? 'updated' : 'created';
            const logMsg = `[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) ${action} auto response: ${trigger}`;
            fs.appendFile("./logs.txt", logMsg + '\n', (error) => {
                if (error) console.error('Error logging event:', error);
            });
        }
        
        return res.json({ 
            success: true, 
            message: id ? 'Auto Response updated successfully' : 'Auto Response created successfully',
            autoResponse
        });
    } catch (error) {
        console.error('Error saving auto response:', error);
        return res.status(500).json({ success: false, message: 'Error saving auto response: ' + error.message });
    }
});


app.post('/settings/delete-auto-response', isLoggedIn(), async (req, res) => {
    try {
        const { responseId } = req.body;
        
        const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to manage settings.' 
            });
        }

        if (!responseId) {
            return res.status(400).json({ success: false, message: 'Auto Response ID is required' });
        }
        
        const autoResponse = await AutoResponse.findById(responseId);
        
        if (!autoResponse) {
            return res.status(404).json({ success: false, message: 'Auto Response not found' });
        }
        

        if (autoResponse.guildID !== config.GuildID) {
            return res.status(403).json({ success: false, message: 'You do not have permission to delete this auto response' });
        }
        

        const trigger = autoResponse.trigger;
        

        await autoResponse.deleteOne();
        

        if (config.DashboardLogs) {
            const logMsg = `[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) deleted auto response: ${trigger}`;
            fs.appendFile("./logs.txt", logMsg + '\n', (error) => {
                if (error) console.error('Error logging event:', error);
            });
        }
        
        return res.json({ success: true, message: 'Auto Response deleted successfully' });
    } catch (error) {
        console.error('Error deleting auto response:', error);
        return res.status(500).json({ success: false, message: 'Error deleting auto response: ' + error.message });
    }
});



app.get('/settings/custom-commands', isLoggedIn(), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);
    
    const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
    if (!hasPermission) {
        return res.status(403).json({ 
            success: false, 
            message: 'You do not have permission to manage settings.' 
        });
    }


    if(config.DashboardLogs) {

        const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accessed ${color.cyan('/settings/custom-commands')} page`)}`;
        console.log(consoleLogMsg);
        

        const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accessed /settings/custom-commands page`;
        fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
            if (error) console.error('Error logging event:', error);
        });
    }
    
    try {

        const commands = await CustomCommand.find({ guildID: config.GuildID }).sort({ name: 1 });
        

        const settings = await Settings.findOne() || new Settings();
        

        const user = await guild.members.cache.get(req.user.id);
        const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');
        

        if (staffInfo) {
            Object.assign(user, {
                roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
                roleId: staffInfo.role ? staffInfo.role._id : null
            });
        } else {
            Object.assign(user, {
                roleName: null,
                roleId: null
            });
        }
    
        
        res.render('settings/custom-commands', {
            config,
            user,
            guild,
            commands,
            settings,
            messages: req.flash()
        });
    } catch (error) {
        console.error('Error fetching custom commands:', error);
        req.flash('error', 'Error fetching custom commands');
        res.redirect('/settings');
    }
});


app.get('/settings/get-command', isLoggedIn(), async (req, res) => {
    try {
        const commandId = req.query.id;
        
        const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to manage settings.' 
            });
        }

        if (!commandId) {
            return res.status(400).json({ success: false, message: 'Command ID is required' });
        }
        
        const command = await CustomCommand.findById(commandId);
        
        if (!command) {
            return res.status(404).json({ success: false, message: 'Command not found' });
        }
        

        if (command.guildID !== config.GuildID) {
            return res.status(403).json({ success: false, message: 'You do not have permission to view this command' });
        }
        
        return res.json({ success: true, command });
    } catch (error) {
        console.error('Error fetching command:', error);
        return res.status(500).json({ success: false, message: 'Error fetching command: ' + error.message });
    }
});


app.post('/settings/save-command', isLoggedIn(), async (req, res) => {
    try {
        const { id, name, responseType, textResponse, embedResponse, deleteMessage, replyToUser, buttons } = req.body;
        
        const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to manage settings.' 
            });
        }


        if (!name) {
            return res.status(400).json({ success: false, message: 'Command name is required' });
        }
        
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            return res.status(400).json({ success: false, message: 'Command name can only contain letters, numbers, underscores, and dashes' });
        }
        
        if (responseType === 'text' && !textResponse) {
            return res.status(400).json({ success: false, message: 'Text response is required for text commands' });
        }
        

        if (buttons && buttons.length > 3) {
            return res.status(400).json({ success: false, message: 'Maximum of 3 buttons allowed per command' });
        }
        

        if (buttons && buttons.length > 0) {
            for (const button of buttons) {
                if (!button.label || !button.url) {
                    return res.status(400).json({ success: false, message: 'All buttons must have both a label and URL' });
                }
                

                if (!/^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(button.url)) {
                    return res.status(400).json({ success: false, message: `Invalid URL: ${button.url}` });
                }
            }
        }
        

        if (deleteMessage && replyToUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'You cannot enable both "Delete Trigger Message" and "Reply to User" at the same time' 
            });
        }
        
        let command;
        
        if (id) {

            command = await CustomCommand.findById(id);
            
            if (!command) {
                return res.status(404).json({ success: false, message: 'Command not found' });
            }
            

            if (command.guildID !== config.GuildID) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'You do not have permission to edit this command' 
                });
            }
            

            if (name !== command.name) {
                const existingCommand = await CustomCommand.findOne({ 
                    guildID: config.GuildID, 
                    name: name.toLowerCase()
                });
                
                if (existingCommand) {
                    return res.status(400).json({ 
                        success: false, 
                        message: `A command with the name '${name}' already exists` 
                    });
                }
            }
        } else {


            const existingCommand = await CustomCommand.findOne({ 
                guildID: config.GuildID, 
                name: name.toLowerCase()
            });
            
            if (existingCommand) {
                return res.status(400).json({ 
                    success: false, 
                    message: `A command with the name '${name}' already exists` 
                });
            }
            
            command = new CustomCommand({
                guildID: config.GuildID,
                createdBy: req.user.id
            });
        }
        

        command.name = name.toLowerCase();
        command.responseType = responseType;
        command.deleteMessage = deleteMessage;
        command.replyToUser = replyToUser;
        command.updatedAt = new Date();
        

        if (responseType === 'text') {
            command.textResponse = textResponse;
            command.embedResponse = null;
        } else {
            command.textResponse = null;
            command.embedResponse = embedResponse;
        }
        

        command.buttons = buttons || [];
        

        await command.save();
        

        if (config.DashboardLogs) {
            const action = id ? 'updated' : 'created';
            const logMsg = `[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) ${action} custom command: ${name}`;
            fs.appendFile("./logs.txt", logMsg + '\n', (error) => {
                if (error) console.error('Error logging event:', error);
            });
        }
        
        return res.json({ 
            success: true, 
            message: id ? 'Command updated successfully' : 'Command created successfully',
            command
        });
    } catch (error) {
        console.error('Error saving custom command:', error);
        return res.status(500).json({ success: false, message: 'Error saving command: ' + error.message });
    }
});


app.post('/settings/delete-command', isLoggedIn(), async (req, res) => {
    try {
        const { commandId } = req.body;
        
        const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to manage settings.' 
            });
        }

        if (!commandId) {
            return res.status(400).json({ success: false, message: 'Command ID is required' });
        }
        
        const command = await CustomCommand.findById(commandId);
        
        if (!command) {
            return res.status(404).json({ success: false, message: 'Command not found' });
        }
        

        if (command.guildID !== config.GuildID) {
            return res.status(403).json({ success: false, message: 'You do not have permission to delete this command' });
        }
        

        const commandName = command.name;
        

        await command.deleteOne();
        

        if (config.DashboardLogs) {
            const logMsg = `[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) deleted custom command: ${commandName}`;
            fs.appendFile("./logs.txt", logMsg + '\n', (error) => {
                if (error) console.error('Error logging event:', error);
            });
        }
        
        return res.json({ success: true, message: 'Command deleted successfully' });
    } catch (error) {
        console.error('Error deleting custom command:', error);
        return res.status(500).json({ success: false, message: 'Error deleting command: ' + error.message });
    }
});

app.post('/settings/update-command-prefix', isLoggedIn(), async (req, res) => {
    try {
        const { prefix } = req.body;
        
        const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to manage settings.' 
            });
        }


        if (!prefix) {
            return res.status(400).json({ success: false, message: 'Prefix is required' });
        }
        
        if (prefix.length > 5) {
            return res.status(400).json({ success: false, message: 'Prefix cannot be longer than 5 characters' });
        }
        

        let settings = await Settings.findOne() || new Settings();
        

        settings.commandPrefix = prefix;
        

        await settings.save();
        

        if (config.DashboardLogs) {
            const logMsg = `[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) updated command prefix to: ${prefix}`;
            fs.appendFile("./logs.txt", logMsg + '\n', (error) => {
                if (error) console.error('Error logging event:', error);
            });
        }
        
        return res.json({ success: true, message: 'Command prefix updated successfully' });
    } catch (error) {
        console.error('Error updating command prefix:', error);
        return res.status(500).json({ success: false, message: 'Error updating prefix: ' + error.message });
    }
});

app.get('/settings/auto-moderation', isLoggedIn(), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);
    
    const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
    if (!hasPermission) {
        return res.status(403).json({ 
            success: false, 
            message: 'You do not have permission to manage settings.' 
        });
    }


    if(config.DashboardLogs) {

        const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accessed ${color.cyan('/settings/auto-moderation')} page`)}`;
        console.log(consoleLogMsg);
        

        const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accessed /settings/auto-moderation page`;
        fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
            if (error) console.error('Error logging event:', error);
        });
    }
    
    try {

        const autoModSettings = await AutoModeration.getOrCreate(config.GuildID);
        

        const user = await guild.members.cache.get(req.user.id);
        const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');
        

        if (staffInfo) {
            Object.assign(user, {
                roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
                roleId: staffInfo.role ? staffInfo.role._id : null
            });
        } else {
            Object.assign(user, {
                roleName: null,
                roleId: null
            });
        }
        
        res.render('settings/auto-moderation', {
            config,
            user,
            guild,
            autoModSettings,
            messages: req.flash()
        });
    } catch (error) {
        console.error('Error fetching auto moderation settings:', error);
        req.flash('error', 'Error fetching auto moderation settings');
        res.redirect('/settings');
    }
});

app.get('/settings/staff-roles', isLoggedIn(), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);
    
    const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
    if (!hasPermission) {
        return res.status(403).json({ 
            success: false, 
            message: 'You do not have permission to manage settings.' 
        });
    }


    if(config.DashboardLogs) {

        const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accessed ${color.cyan('/settings/staff-roles')} page`)}`;
        console.log(consoleLogMsg);
        

        const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accessed /settings/staff-roles page`;
        fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
            if (error) console.error('Error logging event:', error);
        });
    }
    
    try {

        const staffRoles = await StaffRole.find().sort({ priority: 1 });
        const user = await guild.members.cache.get(req.user.id);
        const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');
        

        if (staffInfo) {
            Object.assign(user, {
                roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
                roleId: staffInfo.role ? staffInfo.role._id : null
            });
        } else {
            Object.assign(user, {
                roleName: null,
                roleId: null
            });
        }
        
        const botMember = await guild.members.fetch(client.user.id);
        const botHighestRole = botMember.roles.highest;

        res.render('settings/staff-roles', {
            config,
            user,
            guild,
            botHighestRole,
            staffRoles,
            messages: req.flash()
        });
    } catch (error) {
        console.error('Error fetching staff roles:', error);
        req.flash('error', 'Error fetching staff roles');
        res.redirect('/settings');
    }
});


app.post('/settings/save-automod', isLoggedIn(), async (req, res) => {
    try {
        const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to manage settings.' 
            });
        }


        const { ruleType, enabled, config: ruleConfig } = req.body;
        

        const autoModSettings = await AutoModeration.getOrCreate(config.GuildID);
        

        switch(ruleType) {
            case 'spam':
                autoModSettings.spamProtection.enabled = enabled;
                
                if (ruleConfig) {

                    if (ruleConfig.messageLimit !== undefined) {
                        autoModSettings.spamProtection.messageLimit = ruleConfig.messageLimit;

                        autoModSettings.markModified('spamProtection.messageLimit');
                    }
                    
                    if (ruleConfig.mentionLimit !== undefined) {
                        autoModSettings.spamProtection.mentionLimit = ruleConfig.mentionLimit;
                        autoModSettings.markModified('spamProtection.mentionLimit');
                    }
                    
                    if (ruleConfig.duplicateLimit !== undefined) {
                        autoModSettings.spamProtection.duplicateLimit = ruleConfig.duplicateLimit;
                        autoModSettings.markModified('spamProtection.duplicateLimit');
                    }

                    if (ruleConfig.messageDuration !== undefined) {
                        autoModSettings.spamProtection.messageDuration = ruleConfig.messageDuration;
                        autoModSettings.markModified('spamProtection.messageDuration');
                    }
                    
                    if (ruleConfig.messageDurationUnit) {
                        autoModSettings.spamProtection.messageDurationUnit = ruleConfig.messageDurationUnit;
                        autoModSettings.markModified('spamProtection.messageDurationUnit');
                    }
                    

                    if (ruleConfig.actions) {
                        Object.assign(autoModSettings.spamProtection.actions, ruleConfig.actions);
                        autoModSettings.markModified('spamProtection.actions');
                    }
                    

                    if (ruleConfig.channels) {

                        if (!autoModSettings.spamProtection.channels) {
                            autoModSettings.spamProtection.channels = {
                                allChannels: true,
                                specificChannels: []
                            };
                        }
                        

                        if (ruleConfig.channels.allChannels !== undefined) {
                            autoModSettings.spamProtection.channels.allChannels = ruleConfig.channels.allChannels;
                        }
                        

                        if (ruleConfig.channels.specificChannels) {
                            autoModSettings.spamProtection.channels.specificChannels = ruleConfig.channels.specificChannels;
                        }
                        
                        autoModSettings.markModified('spamProtection.channels');
                    }
                }
                break;
                
            case 'discord_invites':
                autoModSettings.discordInviteFilter.enabled = enabled;
                
                if (ruleConfig) {

                    if (ruleConfig.allowTrustedRoles !== undefined) {
                        autoModSettings.discordInviteFilter.allowTrustedRoles = ruleConfig.allowTrustedRoles;
                    }
                    
                    if (ruleConfig.trustedRoles) {
                        autoModSettings.discordInviteFilter.trustedRoles = ruleConfig.trustedRoles;
                    }
                    

                    if (ruleConfig.actions) {
                        Object.assign(autoModSettings.discordInviteFilter.actions, ruleConfig.actions);
                        autoModSettings.markModified('discordInviteFilter.actions');
                    }
                    

                    if (ruleConfig.channels) {

                        if (!autoModSettings.discordInviteFilter.channels) {
                            autoModSettings.discordInviteFilter.channels = {
                                allChannels: true,
                                specificChannels: []
                            };
                        }
                        

                        if (ruleConfig.channels.allChannels !== undefined) {
                            autoModSettings.discordInviteFilter.channels.allChannels = ruleConfig.channels.allChannels;
                        }
                        

                        if (ruleConfig.channels.specificChannels) {
                            autoModSettings.discordInviteFilter.channels.specificChannels = ruleConfig.channels.specificChannels;
                        }
                        
                        autoModSettings.markModified('discordInviteFilter.channels');
                    }
                }
                break;
                
            case 'phishing':
                autoModSettings.phishingProtection.enabled = enabled;
                
                if (ruleConfig) {

                    if (ruleConfig.useExternalDatabase !== undefined) {
                        autoModSettings.phishingProtection.useExternalDatabase = ruleConfig.useExternalDatabase;
                    }
                    
                    if (ruleConfig.customDomains) {
                        autoModSettings.phishingProtection.customDomains = Array.isArray(ruleConfig.customDomains)
                            ? ruleConfig.customDomains
                            : ruleConfig.customDomains.split('\n').map(domain => domain.trim()).filter(Boolean);
                    }
                    

                    if (ruleConfig.actions) {
                        Object.assign(autoModSettings.phishingProtection.actions, ruleConfig.actions);
                        autoModSettings.markModified('phishingProtection.actions');
                    }
                    

                    if (ruleConfig.channels) {

                        if (!autoModSettings.phishingProtection.channels) {
                            autoModSettings.phishingProtection.channels = {
                                allChannels: true,
                                specificChannels: []
                            };
                        }
                        

                        if (ruleConfig.channels.allChannels !== undefined) {
                            autoModSettings.phishingProtection.channels.allChannels = ruleConfig.channels.allChannels;
                        }
                        

                        if (ruleConfig.channels.specificChannels) {
                            autoModSettings.phishingProtection.channels.specificChannels = ruleConfig.channels.specificChannels;
                        }
                        
                        autoModSettings.markModified('phishingProtection.channels');
                    }
                }
                break;
                
            case 'alt_prevention':
                autoModSettings.altPrevention.enabled = enabled;
                
                if (ruleConfig) {

                    if (ruleConfig.accountAgeDays !== undefined) {
                        autoModSettings.altPrevention.accountAgeDays = ruleConfig.accountAgeDays;
                        autoModSettings.markModified('altPrevention.accountAgeDays');
                    }
                    

                    if (ruleConfig.customMessage) {
                        autoModSettings.altPrevention.customMessage = ruleConfig.customMessage;
                        autoModSettings.markModified('altPrevention.customMessage');
                    }
                    

                    if (ruleConfig.actions) {

                        if (!autoModSettings.altPrevention.actions) {
                            autoModSettings.altPrevention.actions = {};
                        }
                        

                        Object.assign(autoModSettings.altPrevention.actions, ruleConfig.actions);
                        autoModSettings.markModified('altPrevention.actions');
                    }
                }
                break;

            default:
                return res.status(400).json({ success: false, message: 'Invalid rule type' });
        }
        

        autoModSettings.lastUpdated = new Date();
        

        await autoModSettings.save();
        

        if(config.DashboardLogs) {
            const logMsg = `[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) updated ${ruleType} auto moderation settings`;
            fs.appendFile("./logs.txt", logMsg + '\n', (error) => {
                if (error) console.error('Error logging event:', error);
            });
        }
        
        return res.json({
            success: true,
            message: 'Auto moderation settings saved successfully'
        });
    } catch (error) {
        console.error('Error saving auto moderation settings:', error);
        return res.status(500).json({
            success: false,
            message: 'Error saving settings: ' + error.message
        });
    }
});


app.get('/settings/get-automod-config', isLoggedIn(), async (req, res) => {
    try {

        const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to manage settings.' 
            });
        }

        const { ruleType } = req.query;
        

        const autoModSettings = await AutoModeration.getOrCreate(config.GuildID);
        

        let ruleConfig;
        
        switch(ruleType) {
            case 'spam':
                ruleConfig = autoModSettings.spamProtection;
                break;
            case 'discord_invites':
                ruleConfig = autoModSettings.discordInviteFilter;
                break;
            case 'phishing':
                ruleConfig = autoModSettings.phishingProtection;
                break;
            case 'alt_prevention':
                ruleConfig = autoModSettings.altPrevention;
                break;
            default:
                return res.status(400).json({ success: false, message: 'Invalid rule type' });
        }
        
        return res.json({
            success: true,
            config: ruleConfig
        });
    } catch (error) {
        console.error('Error fetching auto moderation settings:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching settings: ' + error.message
        });
    }
});


app.post('/settings/toggle-automod', isLoggedIn(), async (req, res) => {
    try {

        const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to manage settings.' 
            });
        }

        const { ruleType, enabled } = req.body;
        

        const autoModSettings = await AutoModeration.getOrCreate(config.GuildID);
        

        switch(ruleType) {
            case 'spam':
                autoModSettings.spamProtection.enabled = enabled;
                break;
            case 'discord_invites':
                autoModSettings.discordInviteFilter.enabled = enabled;
                break;
            case 'phishing':
                autoModSettings.phishingProtection.enabled = enabled;
                break;
            case 'alt_prevention':
                autoModSettings.altPrevention.enabled = enabled;
                break;
            default:
                return res.status(400).json({ success: false, message: 'Invalid rule type' });
        }
        

        autoModSettings.lastUpdated = new Date();
        

        await autoModSettings.save();
        

        if(config.DashboardLogs) {
            const action = enabled ? 'enabled' : 'disabled';
            const logMsg = `[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) ${action} ${ruleType} auto moderation`;
            fs.appendFile("./logs.txt", logMsg + '\n', (error) => {
                if (error) console.error('Error logging event:', error);
            });
        }
        
        return res.json({
            success: true,
            message: `Auto moderation ${enabled ? 'enabled' : 'disabled'} successfully`
        });
    } catch (error) {
        console.error('Error toggling auto moderation:', error);
        return res.status(500).json({
            success: false,
            message: 'Error toggling auto moderation: ' + error.message
        });
    }
});

app.get('/settings/get-role', isLoggedIn(), async (req, res) => {
    try {
        const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to manage settings.' 
            });
        }

        const { roleName } = req.query;
        const role = await StaffRole.findOne({ name: roleName });
        
        if (!role) {
            return res.status(404).json({ success: false, message: 'Role not found' });
        }
        
        res.json(role);
    } catch (error) {
        console.error('Error fetching role:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


app.post('/settings/save-role', isLoggedIn(), async (req, res) => {
    try {

        const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to manage settings.' 
            });
        }

        const { 
            name, 
            priority, 
            discordRoleToGive, 
            permissions, 
            actionLimits,
            originalRoleName
        } = req.body;
        

        if (originalRoleName) {

            const role = await StaffRole.findOne({ name: originalRoleName });
            
            if (!role) {
                return res.status(404).json({ success: false, message: 'Role not found' });
            }
            

            if (name !== originalRoleName) {
                const existingRole = await StaffRole.findOne({ name });
                if (existingRole) {
                    return res.status(400).json({ 
                        success: false, 
                        message: 'A role with this name already exists' 
                    });
                }
            }
            

            role.name = name;
            role.priority = parseInt(priority);
            role.discordRoleToGive = discordRoleToGive;
            role.permissions = permissions;
            role.actionLimits = actionLimits;
            
            await role.save();
            
            return res.json({ success: true, message: 'Role updated successfully' });
        } else {

            const existingRole = await StaffRole.findOne({ name });
            if (existingRole) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'A role with this name already exists' 
                });
            }
            

            const newRole = new StaffRole({
                name,
                priority: parseInt(priority),
                discordRoleToGive,
                permissions,
                actionLimits
            });
            
            await newRole.save();
            
            return res.json({ success: true, message: 'Role created successfully' });
        }
    } catch (error) {
        console.error('Error saving role:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/settings/delete-role', isLoggedIn(), async (req, res) => {
    try {

        const hasPermission = await utils.checkPermission(req.user.id, "ADMINISTRATOR");
        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to manage settings.' 
            });
        }

        const { roleName } = req.body;
        

        const role = await StaffRole.findOne({ name: roleName });
        if (!role) {
            return res.status(404).json({ success: false, message: 'Role not found' });
        }
        

        const affectedStaff = await staffModel.find({ role: role._id });
        const affectedCount = affectedStaff.length;
        

        await staffModel.updateMany(
            { role: role._id }, 
            { $unset: { role: "" } }
        );
        

        await StaffRole.deleteOne({ _id: role._id });
        
        if (affectedCount > 0) {
            console.log(`[ROLE DELETION] Removed role reference from ${affectedCount} staff members after deleting role ${roleName}`);
        }
        
        res.json({ 
            success: true, 
            message: `Role deleted successfully. ${affectedCount} staff member(s) had this role and were updated.` 
        });
    } catch (error) {
        console.error('Error deleting role:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});





app.get('/staff', isLoggedIn(), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);

    const hasPermission = await utils.checkPermission(req.user.id, "MANAGE_STAFF_MEMBERS");
    if (!hasPermission) return res.render('error', { config, errorMessage: `You don't have enough permissions to access this page!` });

    if(config.DashboardLogs) {

        const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accessed ${color.cyan('/staff')} page`)}`;
        console.log(consoleLogMsg);
    
        const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accessed /staff page`;
        fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
          if (error) console.error('Error logging event:', error);
        });
    }
    
    try {

        const staffRoles = await StaffRole.find().sort({ priority: 1 });
        

        const existingStaffMembers = await staffModel.find().populate('role');
        const totalStaffMembers = await staffModel.countDocuments();

        const staffWithStats = await Promise.all(existingStaffMembers.map(async (member) => {
            try {
                const punishments = await punishmentModel.find({ staff: member.userId });
    

                const stats = {
                    Warns: punishments.filter(punishment => punishment.punishment === 'Warn').length || 0,
                    Kicks: punishments.filter(punishment => punishment.punishment === 'Kick').length || 0,
                    Timeouts: punishments.filter(punishment => punishment.punishment === 'Timeout').length || 0,
                    Bans: punishments.filter(punishment => punishment.punishment === 'Ban').length || 0,
                };
    

                const staffUser = await client.users.fetch(member.userId);
                
                return {
                    ...member.toObject(),
                    username: staffUser.username,
                    avatarURL: staffUser.displayAvatarURL({ dynamic: true }),
                    stats: stats,
                };
            } catch (error) {
                if (error.code === 10013) {
                    await console.log(`${color.yellow(`[WARNING]`)} Staff member with ID "${member.userId}" is unknown or invalid. They will not be displayed in the list.`);
                } else {
                    console.error(`Error processing staff member ${member.userId}:`, error);
                }
                return null;
            }
        }));
    

        const validStaffMembers = staffWithStats.filter(member => member !== null);
    

        const user = await guild.members.cache.get(req.user.id);
        const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');


        if (staffInfo) {
            Object.assign(user, {
                roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
                roleId: staffInfo.role ? staffInfo.role._id : null
            });
        } else {
            Object.assign(user, {
                roleName: null,
                roleId: null
            });
        }

        res.render('staff', { 
            config, 
            existingStaffMembers: validStaffMembers, 
            staffRoles, 
            user, 
            totalStaffMembers 
        });
    } catch (error) {
        console.error("Error fetching staff members and statistics:", error);
        res.render('error', { config, errorMessage: "An error occurred while fetching staff members and statistics." });
    }
});

app.post('/staff/add', isLoggedIn(), async (req, res) => {
    const { userIdOrUsername, roleId } = req.body;
    const guild = client.guilds.cache.get(config.GuildID);

    try {
        let userId;
        let user;


        if (/^\d+$/.test(userIdOrUsername)) {
            userId = userIdOrUsername;

            user = client.users.cache.get(userId);
            if (!user) throw new Error('Invalid user ID or username.');
        } else {

            user = client.users.cache.find(user => user.username === userIdOrUsername);
            if (!user) throw new Error('Invalid user ID or username.');
            userId = user.id;
        }

        const user2 = client.users.cache.get(userId);


        const role = await StaffRole.findById(roleId);
        if (!role) throw new Error('Invalid role.');


        const existingStaffMember = await staffModel.findOne({ userId });


        const hasPermissionToAdd = await utils.checkPermission(req.user.id, "MANAGE_STAFF_MEMBERS");
        if (!hasPermissionToAdd) throw new Error("You don't have permission to manage staff members!");

        if (existingStaffMember) throw new Error('User is already a staff member.');


        await staffModel.create({ 
            userId, 
            role: role._id 
        });


        if (role.discordRoleToGive) {
            const discordRole = guild.roles.cache.get(role.discordRoleToGive);
            if (discordRole) {
                const member = await guild.members.fetch(userId);
                member.roles.add(discordRole);
            }
        }

        if(config.DashboardLogs) {

            const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} added ${color.cyan(user2.username)} (${user2.id}) as ${color.cyan(role.name)} staff member.`)}`;
            console.log(consoleLogMsg);

            const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) added ${user2.username} (${user2.id}) as ${role.name} staff member.`;
            fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
                if (error) console.error('Error logging staff addition event:', error);
            });
        }

        req.flash('success', 'Staff member added successfully.');
        res.redirect('/staff');
    } catch (error) {
        req.flash('error', error.message);
        res.redirect('/staff');
    }
});

app.post('/staff/edit', isLoggedIn(), async (req, res) => {
    const { userIdToEdit, newRoleId } = req.body;
    const guild = client.guilds.cache.get(config.GuildID);

    try {

        const existingStaffMember = await staffModel.findOne({ userId: userIdToEdit }).populate('role');
        

        if (!existingStaffMember) throw new Error('User is not a staff member.');


        const newRole = await StaffRole.findById(newRoleId);
        if (!newRole) throw new Error('Invalid new role.');


        const targetUser = await client.users.fetch(userIdToEdit).catch(() => null);
        if (!targetUser) throw new Error('Invalid user');


        const hasPermissionToEditRole = await utils.checkRolePriority(
            existingStaffMember,
            targetUser, 
            newRoleId,
            { id: req.user.id }
        );
        
        if (!hasPermissionToEditRole) {
            throw new Error("You don't have permission to manage this staff member or assign this role!");
        }


        const oldRole = existingStaffMember.role;
        

        existingStaffMember.role = newRoleId;
        await existingStaffMember.save();


        try {
            const member = await guild.members.fetch(userIdToEdit);
            

            if (oldRole && oldRole.discordRoleToGive) {
                const oldDiscordRole = guild.roles.cache.get(oldRole.discordRoleToGive);
                if (oldDiscordRole) {
                    await member.roles.remove(oldDiscordRole);
                }
            }
            

            if (newRole.discordRoleToGive) {
                const newDiscordRole = guild.roles.cache.get(newRole.discordRoleToGive);
                if (newDiscordRole) {
                    await member.roles.add(newDiscordRole);
                }
            }
        } catch (roleError) {
            console.error("Error managing Discord roles:", roleError);

        }

        if (config.DashboardLogs) {

            const username = targetUser.username;
            
            const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} changed ${color.cyan(username)} (${userIdToEdit}) to ${color.cyan(newRole.name)} staff role.`)}`;
            console.log(consoleLogMsg);

            const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) changed ${username} (${userIdToEdit}) to ${newRole.name} staff role.`;
            fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
                if (error) console.error('Error logging staff edit event:', error);
            });
        }

        req.flash('success', 'Staff member role updated successfully.');
        res.redirect('/staff');
    } catch (error) {
        req.flash('error', error.message);
        res.redirect('/staff');
    }
});

app.post('/staff/remove', isLoggedIn(), async (req, res) => {
    const { userIdToEdit: userIdToRemove } = req.body;
    const guild = client.guilds.cache.get(config.GuildID);

    try {
        if (!userIdToRemove) throw new Error('User ID is required for removing a staff member.');


        const existingStaffMember = await staffModel.findOne({ userId: userIdToRemove }).populate('role');
        if (!existingStaffMember) throw new Error('Staff member not found.');
        

        const targetUser = await client.users.fetch(userIdToRemove).catch(() => null);
        if (!targetUser) throw new Error('Invalid user');
        

        const hasPermissionToRemove = await utils.checkRolePriority(
            existingStaffMember,
            targetUser,
            existingStaffMember.role.name,
            { id: req.user.id }
        );
        
        if (!hasPermissionToRemove) {
            throw new Error("You don't have permission to remove this staff member!");
        }
        

        const result = await staffModel.deleteOne({ userId: userIdToRemove });

        if (result.deletedCount === 1) {
            req.flash('success', 'Staff member removed successfully.');

            if(config.DashboardLogs) {

                const username = targetUser.username;
                
                const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} removed ${color.cyan(username)} (${userIdToRemove}) from staff members.`)}`;
                console.log(consoleLogMsg);

                const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) removed ${username} (${userIdToRemove}) from staff members.`;
                fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
                    if (error) console.error('Error logging staff removal event:', error);
                });
            }


            if (existingStaffMember.role && existingStaffMember.role.discordRoleToGive) {
                try {
                    const discordRole = guild.roles.cache.get(existingStaffMember.role.discordRoleToGive);
                    if (discordRole) {
                        const member = await guild.members.fetch(userIdToRemove);
                        await member.roles.remove(discordRole);
                    }
                } catch (roleError) {
                    console.error("Error removing Discord role:", roleError);

                }
            }
        } else {
            req.flash('error', 'User is not a staff member or could not be removed.');
        }

        res.redirect('/staff');
    } catch (error) {
        req.flash('error', error.message);
        res.redirect('/staff');
    }
});


app.get('/verify', async (req, res) => {

    const { token } = req.query;


    if (!token) {
        req.flash('error', 'Verification token is required');
        return res.render('captcha-verification', { 
            user: {}, 
            config,
            showForm: false,
            messages: req.flash()
        });
    }

    try {

        const user = await userModel.findOne({ 
            verificationToken: token,
            verificationTokenExpiry: { $gt: Date.now() }
        });

        if (!user) {
            req.flash('error', 'Invalid or expired verification token. Please request a new verification link.');
            return res.render('captcha-verification', { 
                user: {}, 
                config,
                showForm: false,
                messages: req.flash()
            });
        }


        const guild = client.guilds.cache.get(config.GuildID);
        const member = guild.members.cache.get(user.userID);
        
        if (!member) {
            req.flash('error', 'You must be a member of the server to verify.');
            return res.render('captcha-verification', { 
                user: {}, 
                config,
                showForm: false,
                messages: req.flash()
            });
        }


        const hasVerifiedRole = config.VerificationSettings.VerifiedRoleID.some(
            roleId => member.roles.cache.has(roleId)
        );

        if (hasVerifiedRole) {
            req.flash('error', 'You are already verified in the server.');
            return res.render('captcha-verification', { 
                user: {}, 
                config,
                showForm: false,
                messages: req.flash()
            });
        }


        res.render('captcha-verification', { 
            user,
            config,
            showForm: true,
            messages: req.flash()
        });

    } catch (error) {

        console.error('Verification error:', error);
        req.flash('error', 'An error occurred. Please try again later.');
        res.render('captcha-verification', { 
            user: {}, 
            config,
            showForm: false,
            messages: req.flash()
        });
    }
});

const hCaptcha = require('hcaptcha');

app.post('/verify', async (req, res) => {
    const { token, 'h-captcha-response': hCaptchaResponse } = req.body;

    try {

        const hCaptchaResult = await verifyHCaptcha(
            config.VerificationSettings.hCaptchaSecretKey,
            hCaptchaResponse
        );

        if (!hCaptchaResult.success) {
            req.flash('error', 'CAPTCHA verification failed. Please try again.');
            return res.render('captcha-verification', { 
                user: { verificationToken: token }, 
                config,
                showForm: true,
                messages: req.flash()
            });
        }


        const user = await userModel.findOne({ 
            verificationToken: token,
            verificationTokenExpiry: { $gt: Date.now() }
        });

        if (!user) {
            req.flash('error', 'Invalid or expired verification token.');
            return res.render('captcha-verification', { 
                user: {}, 
                config,
                showForm: false,
                messages: req.flash()
            });
        }

        const guild = client.guilds.cache.get(config.GuildID);
        const member = guild.members.cache.get(user.userID);

        if (!member) {
            await userModel.updateOne(
                { userID: user.userID },
                { $unset: { verificationToken: 1, verificationTokenExpiry: 1 } }
            );
            req.flash('error', 'You must be a member of the server to verify.');
            return res.render('captcha-verification', { 
                user: {}, 
                config,
                showForm: false,
                messages: req.flash()
            });
        }


        const hasVerifiedRole = config.VerificationSettings.VerifiedRoleID.some(
            roleId => member.roles.cache.has(roleId)
        );

        if (hasVerifiedRole) {
            await userModel.updateOne(
                { userID: user.userID },
                { $unset: { verificationToken: 1, verificationTokenExpiry: 1 } }
            );
            req.flash('error', 'You are already verified.');
            return res.render('captcha-verification', { 
                user: {}, 
                config,
                showForm: false,
                messages: req.flash()
            });
        }


        await Promise.all(config.VerificationSettings.VerifiedRoleID.map(async (roleId) => {
            const role = guild.roles.cache.get(roleId);
            if (role) await member.roles.add(role);
            else console.error(`Invalid role ID: ${roleId}`);
        }));


        await userModel.updateOne(
            { userID: user.userID },
            { 
                $unset: { verificationToken: 1, verificationTokenExpiry: 1 },
                $set: { verifiedAt: new Date() }
            }
        );


        req.flash('success', config.VerificationMessages.successVerify);
        return res.render('captcha-verification', { 
            user: {}, 
            config,
            showForm: false,
            messages: req.flash()
        });

    } catch (error) {
        console.error('Verification error:', error);
        req.flash('error', 'An error occurred during verification. Please try again later.');
        return res.render('captcha-verification', { 
            user: {}, 
            config,
            showForm: false,
            messages: req.flash()
        });
    }
});


async function verifyHCaptcha(secretKey, response) {
    try {
        return await hCaptcha.verify(secretKey, response);
    } catch (error) {
        console.error('hCaptcha verification error:', error);
        throw error;
    }
}



app.get('/view/:userId', isLoggedIn(['VIEW_RECENT_MESSAGES', 'VIEW_HISTORY', 'DELETE_PUNISHMENTS', 'CLEAR_RECENT_MESSAGES', 'CLEAR_HISTORY', 'MANAGE_STAFF_MEMBERS']), async (req, res) => {
    const userId = req.params.userId;
    const guild = client.guilds.cache.get(config.GuildID);

    if(config.DashboardLogs) {

        const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accessed ${color.cyan(`/view/${userId}`)} page`)}`;
        console.log(consoleLogMsg);
    

        const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accessed /view/${userId} page`;
        fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
          if (error) console.error('Error logging event:', error);
        });
    }

    try {
        const hasPermission = await utils.checkPermission(req.user.id, "VIEW_USERS");
        if(!hasPermission) return res.render('error', { config, errorMessage: `You don't have enough permissions to access this page!` });


        const fullUser = await client.users.fetch(userId, { force: true });
        

        let user2 = null;
        let inServer = true;
        try {
            user2 = await guild.members.fetch(userId);
        } catch (memberError) {

            inServer = false;
            user2 = {
                id: fullUser.id,
                user: fullUser,
                displayAvatarURL: () => fullUser.displayAvatarURL({ format: 'png', size: 512 }),
                roles: { cache: new Map() },
                joinedAt: null
            };
        }


        const profilePicture = user2.displayAvatarURL({ format: 'png', size: 512 });
        const profileBanner = fullUser.bannerURL({ format: 'png', dynamic: true, size: 1024 });
        const username = fullUser.username;
        const globalName = fullUser.globalName;

        const user = await guild.members.cache.get(req.user.id);
        const userFromDB = await userModel.findOne({ userID: userId });
        const punishments = await punishmentModel.find({ userID: userId }).sort({ date: -1 });

        const isStaff = await staffModel.findOne({ userId: userId });
        const isSameUser = req.user.id === fullUser.id;


        const fetchStaffUsernames = async () => {
            const usernames = {};
            await Promise.all(
                punishments.map(async (punishment) => {
                    try {
                        const staffUser = await client.users.fetch(punishment.staff);
                        usernames[punishment.staff] = staffUser.username;
                    } catch (error) {
                        usernames[punishment.staff] = 'Unknown';
                    }
                })
            );
            return usernames;
        };

        const staffUsernames = await fetchStaffUsernames();

        function getRelativeTime(date) {
            const currentDate = new Date();
            const targetDate = new Date(date);
            const timeDifference = currentDate.getTime() - targetDate.getTime();
        
            const seconds = Math.floor(timeDifference / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
        
            if (days > 0) {
                return days === 1 ? '1 day ago' : `${days} days ago`;
            } else if (hours > 0) {
                return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
            } else if (minutes > 0) {
                return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
            } else {
                return seconds <= 20 ? 'just now' : `${seconds} seconds ago`;
            }
        }

        const settings = await Settings.findOne() || {};

        const totalKicks = punishments.filter(type => type.punishment === 'Kick').length;
        const totalBans = punishments.filter(type => type.punishment === 'Ban').length;
        const totalWarns = punishments.filter(type => type.punishment === 'Warn').length;
        const totalTimeouts = punishments.filter(type => type.punishment === 'Timeout').length;


        res.render('view', { 
            profilePicture, 
            profileBanner, 
            username, 
            config,
            settings,
            user, 
            user2, 
            userId, 
            userFromDB, 
            isStaff, 
            punishments, 
            getRelativeTime, 
            staffUsernames, 
            globalName, 
            totalWarns, 
            totalBans, 
            totalKicks, 
            totalTimeouts, 
            permissions: res.locals.permissions, 
            isSameUser,
            inServer
        });
    } catch (error) {
        if (error.name === 'DiscordAPIError[50035]' && error.status === 400 && error.code === 50035 ||
            error.name === 'DiscordAPIError[10013]' && error.status === 404 && error.code === 10013) {
            return res.render('error', { config, errorMessage: 'Invalid user ID. This user does not exist on Discord.' });
        } else {
            console.error('Error fetching user information:', error);
            res.render('error', { config, errorMessage: 'An error occurred: ' + error.message });
        }
    }
});


app.post('/delete-punishment', isLoggedIn(), async (req, res) => {
    const { punishmentID } = req.body;
    const guild = client.guilds.cache.get(config.GuildID);
    const hasPermission = await utils.checkPermission(req.user.id, "DELETE_PUNISHMENTS");

    if(hasPermission && punishmentID) try {
        const punishment = await punishmentModel.findOne({ punishmentID });
        
        if (!punishment) return res.status(404).json({ success: false, message: 'Punishment not found' });

        if (punishment.punishment === "TEMP_BAN" || punishment.punishment === "PERM_BAN") {
            try {
                const bans = await guild.bans.fetch();
                if (bans && bans.has(punishment.userID)) {
                    await guild.members.unban(punishment.userID, `Punishment deleted by: ${req.user.username}`);
                }
            } catch (error) {
                console.error('Error unbanning user:', error);
            }
        } else if (punishment.punishment === "Timeout") {
            try {
                const member = await guild.members.fetch(punishment.userID);
                if (member && member.communicationDisabledUntil) {
                    await member.timeout(null, `Punishment deleted by: ${req.user.username}`);
                }
            } catch (error) {
                console.error('Error removing timeout:', error);
            }
        }
        
        await punishmentModel.findByIdAndDelete(punishment._id);

        if(config.DashboardLogs) {
            const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} deleted punishment with ID ${color.cyan(punishmentID)}.`)}`;
            console.log(consoleLogMsg);

            const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) deleted punishment with ID ${punishmentID}.`;
            fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
                if (error) console.error('Error logging punishment deletion event:', error);
            });
        }

        res.json({ 
            success: true, 
            message: `Punishment with ID ${punishmentID} has been deleted successfully.${
                (punishment.punishment === "TEMP_BAN" || punishment.punishment === "PERM_BAN") 
                ? " User has been unbanned if they were banned." 
                : punishment.punishment === "Timeout" 
                ? " User's timeout has been removed if they were timed out." 
                : ""
            }` 
        });
    } catch (error) {
        console.error('Error deleting punishment:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
    else {
        res.status(403).json({ success: false, message: 'Unauthorized' });
    }
});


app.post('/clear-history', isLoggedIn(), async (req, res) => {
    const userId = req.body.userId; 

    const hasPermission = await utils.checkPermission(req.user.id, "CLEAR_HISTORY");

    if(hasPermission && userId) try {

        await punishmentModel.deleteMany({ userID: userId });

        if(config.DashboardLogs) {

            const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} cleared punishment history for user with ID ${color.cyan(userId)}.`)}`;
            console.log(consoleLogMsg);

            const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) cleared punishment history for user with ID ${userId}.`;
            fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
                if (error) console.error('Error logging punishment history clearance event:', error);
            });
        }

        res.status(200).send({ message: 'Punishment history cleared successfully' });
    } catch (error) {
        res.status(500).send({ error: 'Internal server error' });
    }
});


app.post('/clear-messages', isLoggedIn(), async (req, res) => {
    const userId = req.body.userId; 

    const hasPermission = await utils.checkPermission(req.user.id, "CLEAR_RECENT_MESSAGES");

   if(hasPermission && userId) try {
        await userModel.findOneAndUpdate({ userID: userId }, { $set: { messageHistory: [] } });

        if(config.DashboardLogs) {

            const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} cleared recent messages for user with ID ${color.cyan(userId)}.`)}`;
            console.log(consoleLogMsg);

            const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) cleared recent messages for user with ID ${userId}.`;
            fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
                if (error) console.error('Error logging recent messages clearance event:', error);
            });
        }

        res.status(200).send({ message: 'Recent messages cleared successfully' });
    } catch (error) {
        res.status(500).send({ error: 'Internal server error' });
    }
});


app.get('/appeals', isLoggedIn(['VIEW_APPEALS', 'MANAGE_APPEALS', 'DELETE_APPEALS']), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);

    const hasPermission = await utils.checkPermission(req.user.id, "VIEW_APPEALS");
    if(!hasPermission) return res.render('error', { config, errorMessage: `You don't have enough permissions to access this page!` });

    if(config.DashboardLogs) {

        const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accessed ${color.cyan(`/appeals`)} page`)}`;
        console.log(consoleLogMsg);
    

        const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accessed /appeals page`;
        fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
          if (error) console.error('Error logging event:', error);
        });
    }

    try {

        const { pendingPage = 1, acceptedPage = 1, deniedPage = 1 } = req.query;
        const limit = 5; // Number of appeals per page
        

        const statuses = [
            { key: 'Pending', page: pendingPage },
            { key: 'Accepted', page: acceptedPage },
            { key: 'Denied', page: deniedPage },
        ];
        

        const categoryData = {};
        

        for (const { key, page } of statuses) {
            const skip = (parseInt(page) - 1) * limit;
            

            const query = { status: key };
            const appeals = await appealModel
                .find(query)
                .sort({ submissionDate: -1 })
                .skip(skip)
                .limit(limit);
                

            const totalCount = await appealModel.countDocuments(query);
            const totalPages = Math.ceil(totalCount / limit);
            

            for (const appeal of appeals) {
                try {
                    const user = await client.users.fetch(appeal.userId);
                    appeal.username = user.username;
                    appeal.avatarURL = user.avatarURL({ format: 'png', size: 256 }) || 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png';
                } catch (error) {
                    appeal.username = appeal.username || 'Unknown User';
                    appeal.avatarURL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png';
                }
            }
            

            categoryData[key.toLowerCase()] = {
                appeals,
                currentPage: parseInt(page, 10),
                totalPages,
                totalCount,
            };
        }

        function getRelativeTime(date) {
            const currentDate = new Date();
            const targetDate = new Date(date);
            const timeDifference = currentDate.getTime() - targetDate.getTime();
        
            const seconds = Math.floor(timeDifference / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
        
            if (days > 0) {
                return days === 1 ? '1 day ago' : `${days} days ago`;
            } else if (hours > 0) {
                return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
            } else if (minutes > 0) {
                return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
            } else {
                return seconds <= 20 ? 'just now' : `${seconds} seconds ago`;
            }
        }


        const user = await guild.members.cache.get(req.user.id);
        const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');


        if (staffInfo) {
            Object.assign(user, {
                roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
                roleId: staffInfo.role ? staffInfo.role._id : null
            });
        } else {
            Object.assign(user, {
                roleName: null,
                roleId: null
            });
        }
    
    

        res.render('appeals', { 
            user, 
            guild, 
            config, 
            categoryData, 
            getRelativeTime,
            pendingPage: parseInt(pendingPage, 10),
            acceptedPage: parseInt(acceptedPage, 10),
            deniedPage: parseInt(deniedPage, 10),
            permissions: res.locals.permissions 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/view-appeal/:id', isLoggedIn(['VIEW_APPEALS', 'MANAGE_APPEALS', 'DELETE_APPEALS']), async (req, res) => {
    const { id } = req.params;
    const guild = client.guilds.cache.get(config.GuildID);

    const hasPermission = await utils.checkPermission(req.user.id, "VIEW_APPEALS");
    if(!hasPermission) return res.render('error', { config, errorMessage: `You don't have enough permissions to access this page!` });

    if(config.DashboardLogs) {

        const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accessed ${color.cyan(`/view-appeal/${id}`)} page`)}`;
        console.log(consoleLogMsg);
    

        const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accessed /view-appeal/${id} page`;
        fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
          if (error) console.error('Error logging event:', error);
        });
    }

    try {
        const appeal = await appealModel.findOne({ appealID: id });
        if(!appeal) return res.render('error', { config, errorMessage: `An appeal with that ID does not exist!` });

        const punishments = await punishmentModel.find({ userID: appeal.userId }).sort({ date: -1 });
        const punishment = await punishmentModel.findOne({ punishmentID: appeal.punishmentId });
        if(!punishment) return res.render('error', { config, errorMessage: `A punishment for that appeal does not exist!` });


        const fetchStaffUsernames = async () => {
            const usernames = {};
            await Promise.all(
                punishments.map(async (punishment) => {
                    try {
                        const staffUser = await client.users.fetch(punishment.staff);
                        usernames[punishment.staff] = staffUser.username;
                    } catch (error) {

                        usernames[punishment.staff] = 'Unknown';
                    }
                })
            );
            return usernames;
        };

        const staffUsernames = await fetchStaffUsernames();


        try {
            const member = await guild.members.fetch(appeal.userId);
            appeal.userInServer = member ? 'The user is in the server' : 'The user is not in the server';
        } catch (error) {
            appeal.userInServer = 'The user is not in the server';
        }


        if(appeal.status !== "Pending") try {
            const user = await client.users.fetch(appeal.decisionUserID);
            appeal.decisionUser = user.username
        } catch (error) {
            appeal.decisionUser = 'Unknown User';
        }



        try {
            const user = await client.users.fetch(appeal.userId);
            appeal.username = user.username;
            appeal.avatarURL = user.avatarURL({ format: 'png', size: 256 }) || 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png';
        } catch (error) {

            appeal.username = appeal.username || 'Unknown User';
            appeal.avatarURL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png';
        }

        try {
            const user = await client.users.fetch(punishment.staff);
            punishment.staff = user.username;
        } catch (error) {

            punishment.staff = 'Unknown User';
        }


    const user = await guild.members.cache.get(req.user.id);
    const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');

    if (staffInfo) {
        Object.assign(user, {
            roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
            roleId: staffInfo.role ? staffInfo.role._id : null
        });
    } else {
        Object.assign(user, {
            roleName: null,
            roleId: null
        });
    }

    const settings = await Settings.findOne() || {};

    function getRelativeTime(date) {
        const currentDate = new Date();
        const targetDate = new Date(date);
        const timeDifference = currentDate.getTime() - targetDate.getTime();
    
        const seconds = Math.floor(timeDifference / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
    
        if (days > 0) {
            return days === 1 ? '1 day ago' : `${days} days ago`;
        } else if (hours > 0) {
            return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
        } else if (minutes > 0) {
            return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
        } else {
            return seconds <= 20 ? 'just now' : `${seconds} seconds ago`;
        }
    }

    function getFileExtension(url) {

        const fileExtensionMatch = url.match(/\.([0-9a-z]+)(?:[?#]|$)/i);
    
        if (fileExtensionMatch) {

            return fileExtensionMatch[1];
        } else {

            return "";
        }
    }

        res.render('view-appeal', { punishment, getFileExtension, punishments, settings, staffUsernames, appeal, user, guild, config, getRelativeTime, permissions: res.locals.permissions });
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/reports', isLoggedIn(['VIEW_REPORTS', 'MANAGE_REPORTS']), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);

    const hasPermission = await utils.checkPermission(req.user.id, "VIEW_REPORTS");
    if(!hasPermission) return res.render('error', { config, errorMessage: `You don't have enough permissions to access this page!` });

    if(config.DashboardLogs) {
        const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accessed ${color.cyan(`/reports`)} page`)}`;
        console.log(consoleLogMsg);
    
        const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accessed /reports page`;
        fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
          if (error) console.error('Error logging event:', error);
        });
    }

    try {
        const { page = 1, sort = 'newest', viewAll = 'false' } = req.query;
        const limit = 10;
        const skip = (page - 1) * limit;

        const sortOptions = sort === 'oldest' ? { timestamp: 1 } : { timestamp: -1 };
        
        const viewAllReports = viewAll === 'true';
        let query = {};
        
        if (!viewAllReports) {
            query = { status: { $nin: ['Approved', 'Denied'] } };
        
            query = { 
                $or: [
                    { status: 'Pending' },
                    { status: { $exists: false } }
                ]
            };
        }

        const reports = await reportModel
            .find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(limit);

        const totalReports = await reportModel.countDocuments(query);
        const totalPages = Math.ceil(totalReports / limit);
        
        const pendingCount = await reportModel.countDocuments({ status: { $ne: 'Approved', $ne: 'Denied' } });
        const allCount = await reportModel.countDocuments({});
        
        for (const report of reports) {
            try {
                const reporter = await client.users.fetch(report.reporterId);
                report.reporterAvatarURL = reporter.avatarURL({ format: 'png', size: 256 }) || 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png';
                
                const reported = await client.users.fetch(report.reportedId);
                report.reportedAvatarURL = reported.avatarURL({ format: 'png', size: 256 }) || 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png';
                
                if (report.channelId) {
                    const channel = guild.channels.cache.get(report.channelId);
                    if (channel) {
                        report.channelName = channel.name;
                    } else {
                        report.channelName = 'Unknown Channel';
                    }
                }
            } catch (error) {
                if (!report.reporterAvatarURL) {
                    report.reporterAvatarURL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png';
                }
                if (!report.reportedAvatarURL) {
                    report.reportedAvatarURL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png';
                }
                if (report.channelId && !report.channelName) {
                    report.channelName = 'Unknown Channel';
                }
            }
        }

        function getRelativeTime(date) {
            const currentDate = new Date();
            const targetDate = new Date(date);
            const timeDifference = currentDate.getTime() - targetDate.getTime();
        
            const seconds = Math.floor(timeDifference / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
        
            if (days > 0) {
                return days === 1 ? '1 day ago' : `${days} days ago`;
            } else if (hours > 0) {
                return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
            } else if (minutes > 0) {
                return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
            } else {
                return seconds <= 20 ? 'just now' : `${seconds} seconds ago`;
            }
        }

        const user = await guild.members.cache.get(req.user.id);
        const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');

        if (staffInfo) {
            Object.assign(user, {
                roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
                roleId: staffInfo.role ? staffInfo.role._id : null
            });
        } else {
            Object.assign(user, {
                roleName: null,
                roleId: null
            });
        }

        res.render('reports', { 
            user, 
            guild, 
            config, 
            reports,
            currentPage: parseInt(page),
            totalPages,
            totalReports,
            sortOrder: sort,
            viewAll: viewAllReports,
            pendingCount,
            allCount,
            getRelativeTime,
            permissions: res.locals.permissions 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/view-report/:reportId', isLoggedIn(['VIEW_REPORTS', 'MANAGE_REPORTS']), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);
    const reportId = req.params.reportId;

    const hasPermission = await utils.checkPermission(req.user.id, "VIEW_REPORTS");
    if (!hasPermission) return res.render('error', { config, errorMessage: `You don't have enough permissions to access this page!` });

    if (config.DashboardLogs) {
        const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} viewed report ${color.cyan(reportId)}`)}`;
        console.log(consoleLogMsg);
    
        const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) viewed report ${reportId}`;
        fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
          if (error) console.error('Error logging event:', error);
        });
    }

    try {
        const report = await reportModel.findOne({ reportId: reportId });
        
        if (!report) {
            return res.render('error', { 
                config, 
                errorMessage: 'Report not found',
                errorDescription: 'The report you are looking for does not exist or may have been deleted.'
            });
        }
        
        try {
            const reporter = await client.users.fetch(report.reporterId);
            report.reporterAvatarURL = reporter.avatarURL({ format: 'png', size: 256 }) || 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png';
            
            const reported = await client.users.fetch(report.reportedId);
            report.reportedAvatarURL = reported.avatarURL({ format: 'png', size: 256 }) || 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png';
            
            if (report.channelId) {
                const channel = guild.channels.cache.get(report.channelId);
                if (channel) {
                    report.channelName = channel.name;
                } else {
                    report.channelName = 'Unknown Channel';
                }
            }
        } catch (error) {
            if (!report.reporterAvatarURL) {
                report.reporterAvatarURL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png';
            }
            if (!report.reportedAvatarURL) {
                report.reportedAvatarURL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png';
            }
            if (report.channelId && !report.channelName) {
                report.channelName = 'Unknown Channel';
            }
        }

        function getRelativeTime(date) {
            const currentDate = new Date();
            const targetDate = new Date(date);
            const timeDifference = currentDate.getTime() - targetDate.getTime();
        
            const seconds = Math.floor(timeDifference / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
        
            if (days > 0) {
                return days === 1 ? '1 day ago' : `${days} days ago`;
            } else if (hours > 0) {
                return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
            } else if (minutes > 0) {
                return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
            } else {
                return seconds <= 20 ? 'just now' : `${seconds} seconds ago`;
            }
        }

        const user = await guild.members.cache.get(req.user.id);
        const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');

        if (staffInfo) {
            Object.assign(user, {
                roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
                roleId: staffInfo.role ? staffInfo.role._id : null
            });
        } else {
            Object.assign(user, {
                roleName: null,
                roleId: null
            });
        }

        res.render('view-report', { 
            user, 
            guild, 
            config, 
            report,
            getRelativeTime,
            permissions: res.locals.permissions 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/approve-report', isLoggedIn(['MANAGE_REPORTS']), async (req, res) => {
    try {
        const { reportId, type, reason, staffComment, duration, unit, permanent } = req.body;
        
        const hasPermission = await utils.checkPermission(req.user.id, "MANAGE_REPORTS");
        if(!hasPermission) return res.render('error', { config, errorMessage: `You don't have enough permissions to manage reports!` });

        const report = await reportModel.findOne({ reportId: reportId });
        
        if (!report) {
            return res.json({
                success: false,
                message: 'Report not found'
            });
        }
        
        const guild = client.guilds.cache.get(config.GuildID);
        let punishmentID = await utils.generatePunishmentID();
        let success = false;
        let message = '';
        let actionType = type;
        let actionDuration = '';
        
        const user = await client.users.fetch(report.reportedId);
        if (!user) {
            return res.json({
                success: false,
                message: 'Invalid user'
            });
        }
        
        let member;
        try {
            member = await guild.members.fetch(report.reportedId);
        } catch (error) {
            return res.json({
                success: false,
                message: 'User is no longer in the server'
            });
        }
        
        const staff = await client.users.fetch(req.user.id);
        
        switch (type) {
            case 'warn':
                const warnResult = await utils.warnUser(user, staff, reason, punishmentID);
                success = warnResult.success;
                message = warnResult.message;
                actionType = 'Warning';
                break;
                
            case 'timeout':
                if (unit === 'm') {
                    actionDuration = `${duration} minute${duration > 1 ? 's' : ''}`;
                } else if (unit === 'h') {
                    actionDuration = `${duration} hour${duration > 1 ? 's' : ''}`;
                } else if (unit === 'd') {
                    actionDuration = `${duration} day${duration > 1 ? 's' : ''}`;
                }
                
                let timeoutDurationMs;
                if (unit === 'm') {
                    timeoutDurationMs = duration * 60 * 1000;
                } else if (unit === 'h') {
                    timeoutDurationMs = duration * 60 * 60 * 1000;
                } else if (unit === 'd') {
                    timeoutDurationMs = duration * 24 * 60 * 60 * 1000;
                }
                
                const formattedTime = `${duration}${unit}`;
                const timeoutResult = await utils.timeoutUser(user, staff, reason, formattedTime, punishmentID);
                success = timeoutResult.success;
                message = timeoutResult.message;
                actionType = 'Timeout';
                break;
                
            case 'kick':
                const kickResult = await utils.kickUser(user, staff, reason, punishmentID);
                success = kickResult.success;
                message = kickResult.message;
                actionType = 'Kick';
                break;
                
            case 'ban':
                if (permanent === false || permanent === 'false') {
                    const banDurationNum = parseInt(duration);
                    if (unit === 'd') {
                        actionDuration = `${banDurationNum} day${banDurationNum > 1 ? 's' : ''}`;
                    } else if (unit === 'w') {
                        actionDuration = `${banDurationNum} week${banDurationNum > 1 ? 's' : ''}`;
                    } else if (unit === 'm') {
                        actionDuration = `${banDurationNum} month${banDurationNum > 1 ? 's' : ''}`;
                    }
                } else {
                    actionDuration = 'Permanent';
                }
                
                let banDurationDays = null;
                if (permanent === false || permanent === 'false') {
                    if (unit === 'd') {
                        banDurationDays = parseInt(duration);
                    } else if (unit === 'w') {
                        banDurationDays = parseInt(duration) * 7;
                    } else if (unit === 'm') {
                        banDurationDays = parseInt(duration) * 30;
                    }
                }
                
                const banResult = await utils.banUser(user, staff, reason, punishmentID, banDurationDays);
                success = banResult.success;
                message = banResult.message;
                actionType = 'Ban';
                break;
                
            default:
                return res.json({
                    success: false,
                    message: 'Invalid punishment type'
                });
        }
        
        if (success) {
            await reportModel.findOneAndUpdate(
                { reportId: reportId },
                {
                    status: 'Approved',
                    staffId: req.user.id,
                    staffUsername: req.user.username,
                    staffComment: staffComment || `Approved with ${type} punishment`,
                    resolvedAt: new Date(),
                    punishmentId: punishmentID,
                    actionType: actionType,
                    actionDuration: actionDuration
                }
            );
            
            await statsService.incrementStat(guild.id, 'reportsApproved');

            if (config.DashboardLogs) {
                const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} approved report ${color.cyan(reportId)} with ${type} punishment`)}`;
                console.log(consoleLogMsg);
            
                let additionalLogInfo = '';
                if (type === 'ban' && (permanent === false || permanent === 'false')) {
                    additionalLogInfo = `\n[${new Date().toLocaleString()}] [DASHBOARD] Ban duration: ${duration} ${unit === 'd' ? 'days' : unit === 'w' ? 'weeks' : 'months'}`;
                } else if (type === 'timeout') {
                    additionalLogInfo = `\n[${new Date().toLocaleString()}] [DASHBOARD] Timeout duration: ${duration} ${unit === 'm' ? 'minutes' : unit === 'h' ? 'hours' : 'days'}`;
                }
            
                const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) approved report ${reportId} with ${type} punishment. Reason: ${reason}${additionalLogInfo}`;
                fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
                    if (error) console.error('Error logging event:', error);
                });
            }
            
            return res.json({
                success: true,
                message: message || 'Report approved and punishment applied',
                punishmentId: punishmentID,
                actionType: actionType,
                actionDuration: actionDuration
            });
        } else {
            return res.json({
                success: false,
                message: message || 'Failed to apply punishment'
            });
        }
    } catch (error) {
        console.error('Error approving report:', error);
        return res.json({
            success: false,
            message: 'An error occurred while processing your request: ' + error.message
        });
    }
});

app.post('/deny-report', isLoggedIn(['MANAGE_REPORTS']), async (req, res) => {
    try {
        const { reportId, reason } = req.body;
        
        const hasPermission = await utils.checkPermission(req.user.id, "MANAGE_REPORTS");
        if(!hasPermission) return res.render('error', { config, errorMessage: `You don't have enough permissions to manage reports!` });

        const report = await reportModel.findOne({ reportId: reportId });
        
        if (!report) {
            return res.json({
                success: false,
                message: 'Report not found'
            });
        }
        
        if (config.DashboardLogs) {
            const denyReason = reason ? ` with reason: ${reason}` : '';
            const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} denied and deleted report ${color.cyan(reportId)}${denyReason}`)}`;
            console.log(consoleLogMsg);
        
            const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) denied and deleted report ${reportId}${denyReason}`;
            fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
              if (error) console.error('Error logging event:', error);
            });
        }
        
        await statsService.incrementStat(config.GuildID, 'reportsDeclined');

        await reportModel.findOneAndDelete({ reportId: reportId });
        
        return res.json({
            success: true,
            message: 'Report denied and deleted'
        });
    } catch (error) {
        console.error('Error denying report:', error);
        return res.json({
            success: false,
            message: 'An error occurred while processing your request'
        });
    }
});

app.get('/view-transcript/:reportId', isLoggedIn(['VIEW_REPORTS']), async (req, res) => {
    try {
        const reportId = req.params.reportId;
        
        const hasPermission = await utils.checkPermission(req.user.id, "MANAGE_REPORTS");
        if(!hasPermission) return res.render('error', { config, errorMessage: `You don't have enough permissions to manage reports!` });

        const report = await reportModel.findOne({ reportId: reportId });
        
        if (!report || !report.transcriptPath) {
            return res.render('error', { 
                config, 
                errorMessage: 'Transcript not found',
                errorDescription: 'The transcript you are looking for does not exist or may have been deleted.'
            });
        }
        
        if (config.DashboardLogs) {
            const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} viewed transcript for report ${color.cyan(reportId)}`)}`;
            console.log(consoleLogMsg);
        
            const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) viewed transcript for report ${reportId}`;
            fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
              if (error) console.error('Error logging event:', error);
            });
        }
        
        res.sendFile(path.join(process.cwd(), report.transcriptPath));
    } catch (error) {
        console.error('Error serving transcript:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/acceptAppeal', isLoggedIn(), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);

    const hasPermission = await utils.checkPermission(req.user.id, "MANAGE_APPEALS");

    const settings = await Settings.findOne() || new Settings();

    if(hasPermission) try {
        const { appealId, reason } = req.body;
        const appeal = await appealModel.findOne({ appealID: appealId });
        const punishment = await punishmentModel.findOne({ punishmentID: appeal.punishmentId });
        if(!appeal || !punishment) return res.render('error', { config, errorMessage: `Punishment not found` });
        if(appeal.status !== "Pending") return res.render('error', { config, errorMessage: `This appeal has already been denied or accepted!` });

        const punishmentType = appeal.punishmentType

        if(punishmentType === "Timeout") {
            try {
                const member = await guild.members.fetch(appeal.userId);
                if (member && member?.communicationDisabledUntil) member.timeout(null, `Punishment appeal accepted by: ${req.user.username}`);

            } catch (error) {
            }

        } else if(punishmentType === "PERM_BAN" || punishmentType === "TEMP_BAN") {
            const bans = await guild.bans.fetch();
            if (bans && bans.has(appeal.userId)) {
                await guild.members.unban(appeal.userId, `Punishment appeal accepted by: ${req.user.username}`);
            }

            if(settings.addUsersBackEnabled) {
                try {
                    const appealUser = await userModel.findOne({ userID: appeal.userId });
                    if (appealUser && appealUser.accessToken) {
                        accessToken = appealUser.accessToken
                        await guild.members.add(appeal.userId, { accessToken });
                    }
                } catch (addError) {
                    console.error('Error adding appealed user back to server:', addError);
                }
            }
        }

        punishment.appealID = appealId;
        punishment.status = 'Appealed';
        await punishment.save()

        appeal.status = 'Accepted';
        appeal.decisionReason = reason || 'No reason provided';
        appeal.decisionUserID = req.user.id;
        await appeal.save();

        await statsService.incrementStat(guild.id, 'appealsAccepted');

        if(config.DashboardLogs) {

            const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} accepted appeal ${color.cyan(appealId)}.`)}`;
            console.log(consoleLogMsg);

            const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) accepted appeal ${appealId}.`;
            fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
                if (error) console.error('Error logging appeal acceptance event:', error);
            });
        }

        let displayPunishmentType;
        if (appeal.punishmentType === "TEMP_BAN") {
            displayPunishmentType = "Temporary Ban";
        } else if (appeal.punishmentType === "PERM_BAN") {
            displayPunishmentType = "Permanent Ban";
        } else {
            displayPunishmentType = appeal.punishmentType;
        }

        try {
            const staffUser = await client.users.fetch(req.user.id);
            const appealUser = await client.users.fetch(appeal.userId);
            const appealEmbed = new Discord.EmbedBuilder()
            .setColor('#2196F3')
            .setAuthor({ 
              name: `Appeal Accepted`, 
              iconURL: 'https://i.imgur.com/m8MUFfn.png' 
            }) 
            .addFields([
              { 
                name: '`📋` **Appeal Details**', 
                value: `> **User:** <@!${appeal.userId}> \`${appealUser.username}\`\n> **Staff:** <@!${staffUser.id}> \`${staffUser.username}\`\n> **Type:** ${displayPunishmentType}\n> **Reason:** ${appeal.decisionReason}` 
              },
              {
                name: '`🔄` **Status Update**',
                value: `The punishment has been lifted and marked as appealed.`
              }
            ])
            .setThumbnail(client.users.cache.get(appeal.userId)?.displayAvatarURL({ format: 'png', dynamic: true }) || null)
            .setFooter({ 
              text: `Appeal ID: ${appeal.appealID}`, 
              iconURL: staffUser.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
            })
            .setTimestamp();
        
          const viewAppealButton = new Discord.ButtonBuilder()
            .setStyle('Link')
            .setLabel('View Appeal')
            .setEmoji('🔍')
            .setURL(`${config.baseURL}/view-appeal/${appeal.appealID}`);
        
          const actionRow = new Discord.ActionRowBuilder().addComponents(viewAppealButton);
          const logsChannel = guild.channels.cache.get(settings.appealChannelId);
          logsChannel.send({ embeds: [appealEmbed], components: [actionRow] });
        } catch (logError) {
            console.error('Error sending appeal log:', logError);
        }

        res.status(200).json({ message: 'Appeal accepted successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/denyAppeal', isLoggedIn(), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);

    const hasPermission = await utils.checkPermission(req.user.id, "MANAGE_APPEALS");

    if(hasPermission) try {
        const { appealId, reason } = req.body;
        const appeal = await appealModel.findOne({ appealID: appealId });
        const punishment = await punishmentModel.findOne({ punishmentID: appeal.punishmentId });
        if(!appeal || !punishment) return res.render('error', { config, errorMessage: `Punishment not found` });
        if(appeal.status !== "Pending") return res.render('error', { config, errorMessage: `This appeal has already been denied or accepted!` });

        appeal.status = 'Denied';
        appeal.decisionReason = reason || 'No reason provided';
        appeal.decisionUserID = req.user.id;
        await appeal.save();

        await statsService.incrementStat(guild.id, 'appealsDenied');

        if(config.DashboardLogs) {

            const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} denied appeal ${color.cyan(appealId)}.`)}`;
            console.log(consoleLogMsg);

            const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) denied appeal ${appealId}.`;
            fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
                if (error) console.error('Error logging appeal denial event:', error);
            });
        }

        const settings = await Settings.findOne() || {};

        let displayPunishmentType;
        if (appeal.punishmentType === "TEMP_BAN") {
            displayPunishmentType = "Temporary Ban";
        } else if (appeal.punishmentType === "PERM_BAN") {
            displayPunishmentType = "Permanent Ban";
        } else {
            displayPunishmentType = appeal.punishmentType;
        }

        try {
            const staffUser = await client.users.fetch(req.user.id);
            const appealUser = await client.users.fetch(appeal.userId);
            const appealEmbed = new Discord.EmbedBuilder()
            .setColor('#F44336')
            .setAuthor({ 
              name: `Appeal Denied`, 
              iconURL: 'https://i.imgur.com/frvqEja.png' 
            }) 
            .addFields([
              { 
                name: '`📋` **Appeal Details**', 
                value: `> **User:** <@!${appeal.userId}> \`${appealUser.username}\`\n> **Staff:** <@!${staffUser.id}> \`${staffUser.username}\`\n> **Type:** ${displayPunishmentType}\n> **Reason:** ${appeal.decisionReason}` 
              }
            ])
            .setThumbnail(client.users.cache.get(appeal.userId)?.displayAvatarURL({ format: 'png', dynamic: true }) || null)
            .setFooter({ 
              text: `Appeal ID: ${appeal.appealID}`, 
              iconURL: staffUser.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
            })
            .setTimestamp();
        
            const viewAppealButton = new Discord.ButtonBuilder()
            .setStyle('Link')
            .setLabel('View Appeal')
            .setEmoji('🔍')
            .setURL(`${config.baseURL}/view-appeal/${appeal.appealID}`);
        
          const actionRow = new Discord.ActionRowBuilder().addComponents(viewAppealButton);
          const logsChannel = guild.channels.cache.get(settings.appealChannelId);
          logsChannel.send({ embeds: [appealEmbed], components: [actionRow] });
        } catch (logError) {
            console.error('Error sending appeal log:', logError);
        }

        res.status(200).json({ message: 'Appeal denied successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/deleteAppeal', isLoggedIn(), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);

    const hasPermission = await utils.checkPermission(req.user.id, "DELETE_APPEALS");

    if(hasPermission) try {
        const { appealId } = req.body;
        const appeal = await appealModel.findOne({ appealID: appealId });
        if(!appeal) return res.render('error', { config, errorMessage: `Punishment not found` });
        if(appeal.status !== "Pending") return res.render('error', { config, errorMessage: `This appeal has already been denied or accepted!` });

        const settings = await Settings.findOne() || {};

        let displayPunishmentType;
        if (appeal.punishmentType === "TEMP_BAN") {
            displayPunishmentType = "Temporary Ban";
        } else if (appeal.punishmentType === "PERM_BAN") {
            displayPunishmentType = "Permanent Ban";
        } else {
            displayPunishmentType = appeal.punishmentType;
        }

        try {
            const staffUser = await client.users.fetch(req.user.id);
            const appealUser = await client.users.fetch(appeal.userId);
            const appealEmbed = new Discord.EmbedBuilder()
            .setColor('#9E9E9E')
            .setAuthor({ 
              name: `Appeal Deleted`, 
              iconURL: 'https://i.imgur.com/6uEfcAe.png' 
            }) 
            .addFields([
              { 
                name: '`📋` **Appeal Details**', 
                value: `> **User:** <@!${appeal.userId}> \`${appealUser.username}\`\n> **Staff:** <@!${staffUser.id}> \`${staffUser.username}\`\n> **Type:** ${displayPunishmentType}` 
              }
            ])
            .setThumbnail(client.users.cache.get(appeal.userId)?.displayAvatarURL({ format: 'png', dynamic: true }) || null)
            .setFooter({ 
              text: `Appeal ID: ${appeal.appealID}`, 
              iconURL: staffUser.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
            })
            .setTimestamp();

          const logsChannel = guild.channels.cache.get(settings.appealChannelId);
          logsChannel.send({ embeds: [appealEmbed] });
        } catch (logError) {
            console.error('Error sending appeal log:', logError);
        }

        const deletedAppeal = await appealModel.deleteOne({ appealID: appealId });

        if (deletedAppeal.deletedCount === 1) {

            if(config.DashboardLogs) {

                const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} deleted appeal ${color.cyan(appealId)}.`)}`;
                console.log(consoleLogMsg);

                const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) deleted appeal ${appealId}.`;
                fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
                    if (error) console.error('Error logging appeal deletion event:', error);
                });
            }

            res.status(200).json({ message: 'Appeal deleted successfully' });
        } else {
            return res.render('error', { config, errorMessage: `Appeal not found` });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/appeal', requireLogin, async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);
    const user = await client.users.fetch(req.user.id);

    const appeals = await appealModel.find({ userId: req.user.id }).sort({ submissionDate: -1 }).exec();

    let punishment = null;

    res.render('appealForm', { punishment, appeals, user, guild, config, successMessages: req.flash('success') });
});

app.get('/appeal/:punishmentId', requireLogin, async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);
    const user = await client.users.fetch(req.user.id);

    try {
        const { punishmentId } = req.params;
        const punishment = await punishmentModel.findOne({ punishmentID: punishmentId });
        const cooldown = await Cooldown.findOne({ userId: req.user.id });


        const settings = await Settings.findOne() || {};
        

        if (!punishment || req.user.id !== punishment?.userID) {
            return res.redirect(`/appeal`);
        }
        

        if (!settings.appealEnabled) {
            req.flash('error', 'The appeal system is currently disabled.');
            return res.redirect(`/appeal`);
        }
        
        if (cooldown && cooldown.cooldownUntil > Date.now()) {
            req.flash('error', 'You are currently on cooldown for submitting appeals.');
            return res.redirect('/appeal');
        }

        if (!punishment || req.user.id !== punishment?.userID) return res.redirect(`/appeal`);
        if(punishment && punishment.punishment === "Warn" && config.Warn.Appealable === false) {
            req.flash('error', `You can't appeal warns!`);
            return res.redirect(`/appeal`);
        }
        if(punishment && punishment.punishment === "Timeout" && config.Timeout.Appealable === false) {
            req.flash('error', `You can't appeal timeouts!`);
            return res.redirect(`/appeal`);
        }
        if(punishment && punishment.punishment === "Kick" && config.Kick.Appealable === false) {
            req.flash('error', `You can't appeal kicks!`);
            return res.redirect(`/appeal`);
        }
        if(punishment && punishment.punishment === "TEMP_BAN" && config.Ban.Appealable === false) {
            req.flash('error', `You can't appeal temporary bans!`);
            return res.redirect(`/appeal`);
        }
        if(punishment && punishment.punishment === "PERM_BAN" && config.Ban.Appealable === false) {
            req.flash('error', `You can't appeal permanent bans!`);
            return res.redirect(`/appeal`);
        }
        

        const existingAppeal = await appealModel.findOne({ 
            punishmentId: punishmentId,
            status: 'Pending'
        });
        
        if (existingAppeal) {
            req.flash('error', 'You already have a pending appeal for this punishment');
            return res.redirect(`/appeal`);
        }


        const appealQuestions = settings.appealQuestions || [];
        

        const appeals = await appealModel.find({ userId: req.user.id }).sort({ submissionDate: -1 });
        

        res.render('appealForm', { 
            user, 
            guild, 
            config, 
            settings, 
            successMessages: req.flash('success'), 
            messages: req.flash(),
            punishment,
            appealQuestions,
            appeals
        });
    } catch (error) {
        console.error('Error in appeal route:', error);
        req.flash('error', 'An error occurred while processing your appeal request.');
        res.redirect('/appeal');
    }
});


app.post('/findPunishment', requireLogin, async (req, res) => {
    try {
        const { punishmentId } = req.body;
        const cooldown = await Cooldown.findOne({ userId: req.user.id });
        const punishment = await punishmentModel.findOne({ punishmentID: punishmentId });
        const settings = await Settings.findOne() || {};

        if (!punishment || req.user.id !== punishment?.userID) {
            req.flash('error', 'Invalid Punishment ID');
            return res.redirect('/appeal');
        }

        const existingAppeal = await appealModel.findOne({ punishmentId, status: 'Pending' });
        if (existingAppeal) {
            req.flash('error', 'There is already an active appeal for this punishment.');
            return res.redirect('/appeal');
        }

        if (cooldown && cooldown.cooldownUntil > Date.now()) {
            req.flash('error', 'You are currently on cooldown for submitting appeals.');
            return res.redirect('/appeal');
        }


        if (!settings.appealEnabled) {
            req.flash('error', 'The appeal system is currently disabled.');
            return res.redirect('/appeal');
        }


        if(punishment && punishment.punishment === "Warn" && config.Warn.Appealable === false) {
            req.flash('error', `You can't appeal warns!`);
            return res.redirect(`/appeal`);
        }
        if(punishment && punishment.punishment === "Timeout" && config.Timeout.Appealable === false) {
            req.flash('error', `You can't appeal timeouts!`);
            return res.redirect(`/appeal`);
        }
        if(punishment && punishment.punishment === "Kick" && config.Kick.Appealable === false) {
            req.flash('error', `You can't appeal kicks!`);
            return res.redirect(`/appeal`);
        }
        if(punishment && punishment.punishment === "TEMP_BAN" && config.Ban.Appealable === false) {
            req.flash('error', `You can't appeal temporary bans!`);
            return res.redirect(`/appeal`);
        }
        if(punishment && punishment.punishment === "PERM_BAN" && config.Ban.Appealable === false) {
            req.flash('error', `You can't appeal permanent bans!`);
            return res.redirect(`/appeal`);
        }


        res.redirect(`/appeal/${punishmentId}`);
    } catch (error) {
        console.error('Error in findPunishment route:', error);
        req.flash('error', 'An error occurred while processing your request.');
        res.redirect('/appeal');
    }
});

app.post('/submitAppeal', requireLogin, async (req, res) => {
    try {
        const guild = client.guilds.cache.get(config.GuildID);

        const cooldown = await Cooldown.findOne({ userId: req.user.id });
        const { userId, punishmentId, answers } = req.body;

        const punishment = await punishmentModel.findOne({ punishmentID: punishmentId });
        if (!punishment || req.user.id !== punishment?.userID) {
            req.flash('error', 'Invalid Punishment');
            return res.redirect('/appeal');
        }

        const existingAppeal = await appealModel.findOne({ punishmentId, status: 'Pending' });
        if (existingAppeal) {
            req.flash('error', 'There is already an active appeal for this punishment.');
            return res.redirect('/appeal');
        }

        if (cooldown && cooldown.cooldownUntil > Date.now()) {
            req.flash('error', 'You are currently on cooldown for submitting appeals.');
            return res.redirect('/appeal');
        }


        const uniqueID = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');

        const settings = await Settings.findOne() || {};


        const appeal = new appealModel({
            userId,
            punishmentId,
            answers,
            submissionDate: Date.now(),
            punishmentType: punishment.punishment,
            staffID: punishment.staff,
            username: req.user.username,
            appealID: uniqueID,
        });
        await appeal.save();

        await statsService.incrementStat(guild.id, 'appealsSubmitted');

        const cooldownDuration = settings.appealCooldown * 60 * 60 * 1000;
        const cooldownUntil = new Date(Date.now() + cooldownDuration);
        await Cooldown.findOneAndUpdate({ userId: req.user.id }, { cooldownUntil }, { upsert: true });

        let displayPunishmentType;
        if (punishment.punishment === "TEMP_BAN") {
            displayPunishmentType = "Temporary Ban";
        } else if (punishment.punishment === "PERM_BAN") {
            displayPunishmentType = "Permanent Ban";
        } else {
            displayPunishmentType = punishment.punishment;
        }

        try {
        const user = await client.users.fetch(userId);
        const staffUser = await client.users.fetch(punishment.staff);
        const appealEmbed = new Discord.EmbedBuilder()
        .setColor('#4CAF50')
        .setAuthor({ 
          name: `Appeal Submitted`, 
          iconURL: 'https://i.imgur.com/OhMAR2q.png'
        })
        .addFields([
          { 
            name: '`📋` **Appeal Details**', 
            value: `> **User:** <@!${user.id}> \`${user.username}\`\n> **Punishment ID:** \`${punishment.punishmentID}\`\n> **Type:** ${displayPunishmentType}\n> **Original Staff:** <@!${punishment.staff}> \`${staffUser.username}\`` 
          },
          {
            name: '`⏱️` **Submission Time**',
            value: `<t:${Math.floor(appeal.submissionDate / 1000)}:F>`
          }
        ])
        .setThumbnail(user.displayAvatarURL({ format: 'png', dynamic: true }))
        .setFooter({ 
          text: `Appeal ID: ${appeal.appealID}`, 
          iconURL: client.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
        })
        .setTimestamp();
    
        const viewAppealButton = new Discord.ButtonBuilder()
        .setStyle('Link')
        .setLabel('View Appeal')
        .setEmoji('🔍')
        .setURL(`${config.baseURL}/view-appeal/${appeal.appealID}`);
    
      const actionRow = new Discord.ActionRowBuilder().addComponents(viewAppealButton);
      const logsChannel = guild.channels.cache.get(settings.appealChannelId);
      logsChannel.send({ embeds: [appealEmbed], components: [actionRow] });
    } catch (logError) {
        console.error('Error sending appeal log:', logError);
    }


        req.flash('success', `Your appeal has been submitted successfully! Refresh the page to see the status of your appeal.`);

        res.redirect('/appeal');
    } catch (error) {
        console.error('Error processing appeal:', error);
        req.flash('error', 'An error occurred while processing your appeal.');
        res.redirect('/appeal');
    }
});



app.get('/punishment/lookup', isLoggedIn(), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);

    const hasPermission = await utils.checkPermission(req.user.id, "LOOKUP_PUNISHMENTS");
    if(!hasPermission) return res.render('error', { config, errorMessage: `You don't have enough permissions to access this page!` });

    let punishment = null;

    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;

    const totalPunishments = await punishmentModel.countDocuments();
    const totalPages = Math.ceil(totalPunishments / limit);
    
    const recentPunishments = await punishmentModel.find()
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    for (const punishment of recentPunishments) {
        try {
            const user = await client.users.fetch(punishment.userID);
            punishment.username = user.username;
            punishment.avatarURL = user.avatarURL({ format: 'png', size: 256 }) || 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png';
        } catch (error) {
            punishment.username = punishment.username || 'Unknown User';
            punishment.avatarURL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png';
        }

        try {
            const user = await client.users.fetch(punishment.staff);
            punishment.staff = user.username;
        } catch (error) {
            punishment.staff = 'Unknown User';
        }
    }

    const user = await guild.members.cache.get(req.user.id);
    const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');

    function getRelativeTime(date) {
        const currentDate = new Date();
        const targetDate = new Date(date);
        const timeDifference = currentDate.getTime() - targetDate.getTime();
    
        const seconds = Math.floor(timeDifference / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
    
        if (days > 0) {
            return days === 1 ? '1 day ago' : `${days} days ago`;
        } else if (hours > 0) {
            return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
        } else if (minutes > 0) {
            return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
        } else {
            return seconds <= 20 ? 'just now' : `${seconds} seconds ago`;
        }
    }

    if (staffInfo) {
        Object.assign(user, {
            roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
            roleId: staffInfo.role ? staffInfo.role._id : null
        });
    } else {
        Object.assign(user, {
            roleName: null,
            roleId: null
        });
    }

    res.render('punishmentLookup', { 
        user, 
        config, 
        punishment, 
        recentPunishments, 
        getRelativeTime,
        currentPage: page,
        totalPages,
        successMessages: req.flash('success') 
    });
});

app.get('/punishment/lookup/:punishmentId', isLoggedIn(['LOOKUP_PUNISHMENTS', 'DELETE_PUNISHMENTS']), async (req, res) => {
    const guild = client.guilds.cache.get(config.GuildID);

    const hasPermission = await utils.checkPermission(req.user.id, "LOOKUP_PUNISHMENTS");
    if(!hasPermission) return res.render('error', { config, errorMessage: `You don't have enough permissions to access this page!` });

    try {
        const { punishmentId } = req.params;
        const punishment = await punishmentModel.findOne({ punishmentID: punishmentId });
        if (!punishment) return res.redirect(`/punishment/lookup`);

        const existingAppeal = await appealModel.findOne({ punishmentId, status: 'Pending' });


        try {
            const user = await client.users.fetch(punishment.userID);
            punishment.username = user.username;
            punishment.avatarURL = user.avatarURL({ format: 'png', size: 256 }) || 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png';
        } catch (error) {
            punishment.username = punishment.username || 'Unknown User';
            punishment.avatarURL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Faenza-avatar-default-symbolic.svg/2048px-Faenza-avatar-default-symbolic.svg.png';
        }

        try {
            const user = await client.users.fetch(punishment.staff);
            punishment.staff = user.username;
        } catch (error) {
            punishment.staff = 'Unknown User';
        }
    

        try {
            const member = await guild.members.fetch(punishment.userID);
            punishment.userInServer = member ? 'The user is in the server' : 'The user is not in the server';
        } catch (error) {
            punishment.userInServer = 'The user is not in the server';
        }


    const user = await guild.members.cache.get(req.user.id);
    
    function getRelativeTime(date) {
        const currentDate = new Date();
        const targetDate = new Date(date);
        const timeDifference = currentDate.getTime() - targetDate.getTime();
    
        const seconds = Math.floor(timeDifference / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
    
        if (days > 0) {
            return days === 1 ? '1 day ago' : `${days} days ago`;
        } else if (hours > 0) {
            return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
        } else if (minutes > 0) {
            return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
        } else {
            return seconds <= 20 ? 'just now' : `${seconds} seconds ago`;
        }
    }


    const staffInfo = await staffModel.findOne({ userId: req.user.id }).populate('role');


    if (staffInfo) {
        Object.assign(user, {
            roleName: staffInfo.role ? staffInfo.role.name : 'No Role',
            roleId: staffInfo.role ? staffInfo.role._id : null
        });
    } else {
        Object.assign(user, {
            roleName: null,
            roleId: null
        });
    }
        
    function getFileExtension(url) {

        const fileExtensionMatch = url.match(/\.([0-9a-z]+)(?:[?#]|$)/i);
    
        if (fileExtensionMatch) {

            return fileExtensionMatch[1];
        } else {

            return "";
        }
    }


        res.render('punishmentLookup', { user, existingAppeal, getFileExtension, guild, permissions: res.locals.permissions, getRelativeTime, config, successMessages: req.flash('success'), punishment });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/punishment/lookup/find', isLoggedIn(), async (req, res) => {

    const hasPermission = await utils.checkPermission(req.user.id, "LOOKUP_PUNISHMENTS");
    if(!hasPermission) return res.render('error', { config, errorMessage: `You don't have enough permissions to access this page!` });

    if(hasPermission) try {
        const { punishmentId } = req.body;
        const punishment = await punishmentModel.findOne({ punishmentID: punishmentId });

        if (!punishment || !punishmentId) {
            req.flash('error', 'Invalid Punishment ID');
            return res.redirect('/punishment/lookup');
        }

        res.redirect(`/punishment/lookup/${punishmentId}`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/handleAction', isLoggedIn(), async (req, res) => {
    try {

        const { action, userId, reason, noteText, dmMessage, isPermanent, banDuration, banUnit } = req.body;
        const guild = client.guilds.cache.get(config.GuildID);

        let punishmentID = await utils.generatePunishmentID();
        let success = false;
        let message = '';

        const user = await client.users.fetch(userId);
        if (!user) throw new Error('Invalid user');

        const member = await guild.members.fetch(userId);
        if (!member) throw new Error('Invalid member');

        const staff = await client.users.fetch(req.user.id);


        if (action === 'kick') {
            const kickResult = await utils.kickUser(user, staff, reason, punishmentID);
            success = kickResult.success;
            message = kickResult.message;
        } else if (action === 'ban') {

            let duration = null;
            if (isPermanent === 'false' && banDuration && banUnit) {
                const banDurationNum = parseInt(banDuration);
                switch(banUnit) {
                    case 'd': // Days
                        duration = banDurationNum * 24 * 60 * 60 * 1000;
                        break;
                    case 'w': // Weeks
                        duration = banDurationNum * 7 * 24 * 60 * 60 * 1000;
                        break;
                    case 'm': // Months (approximated as 30 days)
                        duration = banDurationNum * 30 * 24 * 60 * 60 * 1000;
                        break;
                }
            }
            

            const banResult = await utils.banUser(user, staff, reason, punishmentID, duration);
            success = banResult.success;
            message = banResult.message;
        } else if (action === 'note') {
            const noteResult = await utils.setNote(user, staff, noteText);
            success = noteResult.success;
            message = noteResult.message;
        } else if (action === 'dm') {
            const dmResult = await utils.dmUser(user, staff, dmMessage);
            success = dmResult.success;
            message = dmResult.message;
        }


        if (success) {
            if(config.DashboardLogs) {

                const consoleLogMsg = `${color.yellow(`[DASHBOARD] ${color.cyan(`${req.user.username} (${req.user.id})`)} performed ${color.cyan(action)} action for user with ID: ${userId}, reason: ${reason || noteText || dmMessage}`)}`;
                console.log(consoleLogMsg);


                let additionalLogInfo = '';
                if (action === 'ban' && isPermanent === 'false') {
                    additionalLogInfo = `\n[${new Date().toLocaleString()}] [DASHBOARD] Ban duration: ${banDuration} ${banUnit === 'd' ? 'days' : banUnit === 'w' ? 'weeks' : 'months'}`;
                }


                const fileLogMsg = `\n[${new Date().toLocaleString()}] [DASHBOARD] ${req.user.username} (${req.user.id}) performed ${action} action for user with ID: ${userId}, reason: ${reason || noteText || dmMessage}${additionalLogInfo}`;
                fs.appendFile("./logs.txt", fileLogMsg + '\n', (error) => {
                    if (error) console.error('Error logging user action event:', error);
                });
            }

            res.json({ success: true, message: message });
        } else {
            res.json({ success: false, message: message });
        }
    } catch (error) {
        console.error('Error handling action:', error);
        res.status(500).json({ success: false, message: 'An error occurred while processing your request: ' + error.message });
    }
});






app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect('/home')
    } else {
        res.redirect('/login');
    }
});


app.listen(PORT, () => { 
    let serverLogMsg = `\n[${new Date().toLocaleString()}] [SERVER] Server has started on port ${PORT}.`;
    fs.appendFile("./logs.txt", serverLogMsg, (e) => { 
        if(e) console.log(e);
    });

    console.log(color.yellow("[DASHBOARD] ") + `Web Server has started and is accessible with ${color.yellow(`${config.baseURL}`)}`)
});