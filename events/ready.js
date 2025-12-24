const fs = require('fs');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const color = require('ansi-colors');
const botVersion = require('../package.json');
const utils = require("../utils.js");
const Discord = require("discord.js");
const { Collection } = Discord;
const mongoose = require("mongoose");
const guildModel = require('../models/guildModel');
const temporaryBanModel = require('../models/temporaryBanModel');
const AutoModeration = require('../models/autoModerationModel');

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const glob = require('glob');
const path = require('path');

global.cachedStaffRoles = [];
global.cachedReportSettings = {
  requireReason: false,
  isEnabled: false
};

module.exports = async client => {
  client.commands = new Collection();
  client.slashCommands = new Collection();

    let guild = await client.guilds.cache.get(config.GuildID)
    if(!guild) {
        await console.log('\x1b[31m%s\x1b[0m', `[ERROR] The guild ID specified in the config is invalid or the bot is not in the server!\nYou can use the link below to invite the bot to your server:\nhttps://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`)
        await process.exit()
    }


    const connectToMongoDB = async () => {
      try {
        if (config.MongoURI) await mongoose.set('strictQuery', false);
    
        if (config.MongoURI) {
          await mongoose.connect(config.MongoURI);
        } else {
          throw new Error('[ERROR] MongoDB Connection String is not specified in the config! (MongoURI)');
        }
      } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', `[ERROR] Failed to connect to MongoDB: ${error.message}\n${error.stack}`);
    
        if (error.message.includes('authentication failed')) {
          await console.error('Authentication failed. Make sure to check if you entered the correct username and password in the connection URL.');
          await process.exit(1)
        } else if (error.message.includes('network error')) {
          await console.error('Network error. Make sure the MongoDB server is reachable and the connection URL is correct.');
          await process.exit(1)
        } else if (error.message.includes('permission denied')) {
          await console.error('Permission denied. Make sure the MongoDB cluster has the necessary permissions to read and write.');
          await process.exit(1)
        } else {
          await console.error('An unexpected error occurred. Check the MongoDB connection URL and credentials.');
          await process.exit(1)
        }
      }
    };
    connectToMongoDB();

    async function updateReportSettingsCache() {
      try {
          const ReportSettings = require('../models/reportSettingsModel');
          const settings = await ReportSettings.findOne({ guildId: config.GuildID });
          
          if (settings) {
              global.cachedReportSettings.requireReason = settings.requireReportReason || false;
              global.cachedReportSettings.isEnabled = settings.reportEnabled || false;
          } else {
          }
          
          return global.cachedReportSettings;
      } catch (err) {
          console.error("Error updating report settings cache:", err);
          return global.cachedReportSettings;
      }
  }

    async function updateStaffRoleCache() {
      try {
          const StaffRoleModel = require('../models/staffRoleModel');
          const roles = await StaffRoleModel.find().sort({ priority: -1 });
          global.cachedStaffRoles = roles;
          return roles;
      } catch (err) {
          console.error("Error updating staff role cache:", err);
          return [];
      }
  }
  await updateStaffRoleCache();
  await updateReportSettingsCache();

    // ================ SLASH COMMANDS LOADING SYSTEM ================
    if(config.GuildID) {
      try {
          console.log(`${color.cyan(`[SLASH] Loading slash commands...`)}`);
          const slashCommands = [];
          
          const commandsPath = path.join(__dirname, '..', 'slashCommands');
          if (fs.existsSync(commandsPath)) {
              const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
              
              for (const file of commandFiles) {
                  try {
                      const filePath = path.join(commandsPath, file);
                      const command = require(filePath);
                      
                      if (!command.data || !command.execute) {
                          console.log(`${color.yellow(`[WARNING] Command at ${file} is missing required "data" or "execute" property.`)}`);
                          continue;
                      }
                      
                      slashCommands.push(command.data.toJSON());
                      client.slashCommands.set(command.data.name, command);
                      console.log(`${color.green(`[SLASH COMMAND]`)} ${file} ${color.green('loaded!')}`);
                  } catch (error) {
                      console.error(`${color.red(`[ERROR] Failed to load command ${file}:`)}`, error);
                  }
              }
          } else {
              console.log(`${color.yellow(`[WARNING] slashCommands directory not found`)}`);
          }
          
          const loadedAddons = new Set();
          
          const eventHandler = {
              on: (event, callback) => client.on(event, callback),
              emit: (event, ...args) => client.emit(event, ...args)
          };
          
          await new Promise((resolve, reject) => {
              glob('./addons/**/*.js', async (err, files) => {
                  if (err) {
                      console.error(`${color.red(`[ERROR] Failed to load addons:`)}`, err);
                      return resolve();
                  }
                  
                  for (const file of files) {
                      if (file.endsWith('.js')) {
                          const match = file.match(/\/addons\/([^/]+)/);
                          if (!match || !match[1]) {
                              console.error(`${color.red(`[ERROR] Could not extract addon name from path: ${file}`)}`);
                              continue;
                          }
                          
                          const folderName = match[1];
                          
                          if (!loadedAddons.has(folderName)) {
                              loadedAddons.add(folderName);
                              console.log(`${color.green(`[ADDON] ${folderName} loaded!`)}`);
                          }
                          
                          try {
                              if (fs.existsSync(file)) {
                                  const addon = require(path.resolve(file));
                                  
                                  if (addon && typeof addon.register === 'function') {
                                      addon.register({
                                          on: eventHandler.on,
                                          emit: eventHandler.emit,
                                          client,
                                      });
                                  }
                                  
                                  if (addon && addon.data && addon.data.toJSON && typeof addon.execute === 'function') {
                                      const slashCommandData = addon.data.toJSON();
                                      client.slashCommands.set(slashCommandData.name, addon);
                                      slashCommands.push(slashCommandData);
                                      console.log(`${color.green(`[COMMAND] ${slashCommandData.name} registered from ${folderName}`)}`);
                                  }
                              }
                          } catch (addonError) {
                              console.error(`${color.red(`[ERROR] ${folderName}: ${addonError.message}`)}`);
                              console.error(addonError.stack);
                          }
                      }
                  }
                  
                  resolve();
              });
          });
          
          if (slashCommands.length > 0) {
              console.log(`${color.cyan(`[SLASH] Registering ${slashCommands.length} slash commands...`)}`);
              
              try {
                  const rest = new REST({ version: '10' }).setToken(config.Token);
                  
                  const response = await rest.put(
                      Routes.applicationGuildCommands(client.user.id, config.GuildID),
                      { body: slashCommands }
                  );
                  
                  console.log(`${color.green(`[SLASH] Successfully registered ${response.length} slash commands.`)}`);
              } catch (error) {
                  if (error.message?.includes('Missing Access') || error.code === 50001) {
                      let logMsg = `\n\n[${new Date().toLocaleString()}] [ERROR] ${error.stack}`;
                      await fs.appendFile("./logs.txt", logMsg, (e) => { 
                          if(e) console.log(e);
                      });
                      await console.log(error)
                      await console.log('\x1b[31m%s\x1b[0m', `[ERROR] Slash commands are unavailable because application.commands scope wasn't selected when inviting the bot. Please use the link below to re-invite your bot.`)
                      await console.log('\x1b[31m%s\x1b[0m', `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`)
                  } else {
                      const timestamp = new Date().toLocaleString();
                      const errorMessage = `\n\n[${timestamp}] [ERROR] Slash command registration: ${error.stack || error.message || error}`;
                      
                      console.error('\x1b[31m%s\x1b[0m', `[ERROR] Slash command registration:`, error);
                      
                      try {
                          await fs.promises.appendFile("./logs.txt", errorMessage);
                      } catch (e) {
                          console.error('[ERROR] Failed to write to log file:', e);
                      }
                  }
              }
          } else {
              console.log(`${color.yellow(`[WARNING] No slash commands to register`)}`);
          }
      } catch (error) {
          console.error(`${color.red(`[ERROR] Failed to load slash commands system:`)}`, error);
          let logMsg = `\n\n[${new Date().toLocaleString()}] [ERROR] ${error.stack}`;
          await fs.appendFile("./logs.txt", logMsg, (e) => { 
              if(e) console.log(e);
          });
      }
  }
  // ================ END OF SLASH COMMANDS LOADING SYSTEM ================

// Create guild model if it doesn't exist and save to db
const gModel = await guildModel.findOne({ guildID: config.GuildID });
if (!gModel || gModel?.length == 0) {
  const newModel = new guildModel({
    guildID: config.GuildID,
    verificationMsgID: "",
    totalWarns: 0,
    totalKicks: 0,
    totalBans: 0,
    totalTimeouts: 0,
    totalActions: 0,
    totalMessages: 0,
    timesBotStarted: 0,
    recentMessages: []
  });
  await newModel.save();
}

const statsDB = await guildModel.findOne({ guildID: config.GuildID });

await AutoModeration.getOrCreate(config.GuildID);

// bot activity
let activType;
let userStatus = 'online';

const statusMap = {
  "ONLINE": 'online',
  "IDLE": 'idle',
  "DND": 'dnd',
  "INVISIBLE": 'invisible'
};

const activityTypeMap = {
  "WATCHING": Discord.ActivityType.Watching,
  "PLAYING": Discord.ActivityType.Playing,
  "COMPETING": Discord.ActivityType.Competing,
  "LISTENING": Discord.ActivityType.Listening
};

activType = activityTypeMap[config.BotActivitySettings.ActivityType] || Discord.ActivityType.Playing;
userStatus = statusMap[config.BotActivitySettings.Status] || 'online';

if (config.BotActivitySettings.Enabled && config.BotActivitySettings.Statuses?.length > 0) {
  let index = 0;
  
  const setActivity = async () => {
    const activityMessage = config.BotActivitySettings.Statuses[index]
    .replace(/{total-users}/g, `${guild.memberCount.toLocaleString('en-US')}`)
    .replace(/{total-channels}/g, `${client.channels.cache.size}`)
    .replace(/{total-actions}/g, `${statsDB.totalActions.toLocaleString('en-US')}`)
    .replace(/{total-messages}/g, `${statsDB.totalMessages.toLocaleString('en-US')}`)
    .replace(/{total-warns}/g, `${statsDB.totalWarns.toLocaleString('en-US')}`)
    .replace(/{total-timeouts}/g, `${statsDB.totalTimeouts.toLocaleString('en-US')}`)
    .replace(/{total-kicks}/g, `${statsDB.totalKicks.toLocaleString('en-US')}`)
    .replace(/{total-bans}/g, `${statsDB.totalBans.toLocaleString('en-US')}`);

    client.user.setPresence({
      activities: [{ name: activityMessage, type: activType }],
      status: userStatus
    });

    index = (index + 1) % config.BotActivitySettings.Statuses.length;
  };

  setActivity();

  setInterval(setActivity, config.BotActivitySettings.Interval * 1000);
}
//

client.guilds.cache.forEach(guild => {
    if(!config.GuildID.includes(guild.id)) {
    guild.leave();
    console.log('\x1b[31m%s\x1b[0m', `[INFO] Someone tried to invite the bot to another server! I automatically left it (${guild.name})`)
    }
})
if (guild && !guild.members.me.permissions.has("Administrator")) {
    console.log('\x1b[31m%s\x1b[0m', `[ERROR] The bot doesn't have enough permissions! Please give the bot ADMINISTRATOR permissions in your server or it won't function properly!`)
}

await console.log("――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――");
await console.log("                                                                          ");
if(config.LicenseKey) await console.log(`${color.green.bold.underline(`Plex Staff v${botVersion.version} is now Online!`)} (${color.gray(`${config.LicenseKey.slice(0, -10)}`)})`);
if(!config.LicenseKey) await console.log(`${color.green.bold.underline(`Plex Staff v${botVersion.version} is now Online! `)}`);
await console.log(`• Join our discord server for support, ${color.cyan(`discord.gg/plexdev`)}`);
await console.log(`• By using this bot you agree to all terms located here, ${color.yellow(`plexdevelopment.net/tos`)}`);
await console.log(`• Addons for the bot can be found here, ${color.yellow(`plexdevelopment.net/products`)}`);
if(config.Statistics) await console.log("                                                                          ");
if(config.Statistics) await console.log(`${color.green.bold.underline(`Statistics:`)}`);
if(config.Statistics) await console.log(`• The bot has been started a total of ${color.cyan.underline(`${statsDB.timesBotStarted.toLocaleString('en-US')}` )} times.`);
if(config.Statistics) await console.log(`• A total of ${color.cyan.underline(`${statsDB.totalWarns.toLocaleString('en-US')}` )} warns have been issued.`);
if(config.Statistics) await console.log(`• A total of ${color.cyan.underline(`${statsDB.totalTimeouts.toLocaleString('en-US')}` )} timeouts have been issued.`);
if(config.Statistics) await console.log(`• A total of ${color.cyan.underline(`${statsDB.totalKicks.toLocaleString('en-US')}` )} kicks have been issued.`);
if(config.Statistics) await console.log(`• A total of ${color.cyan.underline(`${statsDB.totalBans.toLocaleString('en-US')}` )} bans have been issued.`);
if(config.Statistics) await console.log(`• A total of ${color.cyan.underline(`${statsDB.totalActions.toLocaleString('en-US')}` )} actions have been performed.`);
if(config.Statistics) await console.log(`• A total of ${color.cyan.underline(`${statsDB.totalMessages.toLocaleString('en-US')}` )} messages have been sent.`);
if(config.LicenseKey) await console.log("                                                                          ");
if(config.LicenseKey) await console.log(`${color.green.bold.underline(`Source Code:`)}`);
if(config.LicenseKey) await console.log(`• You can buy the full source code at ${color.yellow(`plexdevelopment.net/products/pssourcecode`)}`);
if(config.LicenseKey) await console.log(`• Use code ${color.green.bold.underline(`PLEX`)} for 10% OFF!`);
await console.log("                                                                          ");
await console.log("――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――");

await console.log(color.yellow.bold("RECOMMENDATION FOR SERVER SETUP:"));
await console.log("");
await console.log(color.yellow("Plex Staff handles all your moderation needs including:"));
await console.log(color.white("• Punishment history"));
await console.log(color.white("• Staff member action limits"));
await console.log(color.white("• Appeals system"));
await console.log("");
await console.log(color.yellow("To ensure everything works correctly:"));
await console.log(color.white("1. Disable kick/ban/timeout permissions in your staff members' Discord roles"));
await console.log(color.white("2. Have your staff use only Plex Staff commands and dashboard for moderation"));
await console.log(color.white("3. Use Plex Staff's built-in permission system instead of Discord's role permissions"));
await console.log("");
await console.log(color.yellow("Important: Discord's built-in moderation actions will not be logged by Plex Staff."));
await console.log(color.white("This means punishments won't appear in history, appeals won't work, and action limits won't apply."));
await console.log("");
let logMsg = `\n\n[${new Date().toLocaleString()}] [READY] Bot is now ready!`;
fs.appendFile("./logs.txt", logMsg, (e) => { 
  if(e) console.log(e);
});

require("../dashboard/app.js");

async function removeOldStatsSchema() {
  try {
    const oldStatsModel = mongoose.model('stats', new mongoose.Schema({}, { strict: false }));
    
    const deleteResult = await oldStatsModel.deleteMany({});
    
    if (deleteResult.deletedCount > 0) {
      console.log(`\n${color.yellow.bold(`━━━━━━━━━━━━━━━━━━━━━━━━━━━ STATISTICS SYSTEM UPGRADE ━━━━━━━━━━━━━━━━━━━━━━━━━━━`)}`);
      console.log(`${color.green(`[DATABASE] Successfully removed ${deleteResult.deletedCount} outdated statistics entries.`)}`);
      console.log(`${color.cyan(`[DATABASE] The statistics system has been upgraded to a new format that supports`)}`);
      console.log(`${color.cyan(`daily, weekly, monthly, and yearly tracking of server activity.`)}`);
      console.log(`${color.yellow.bold(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)}`);
      
      let cleanupMsg = `\n[${new Date().toLocaleString()}] [DATABASE] CLEANUP: Removed ${deleteResult.deletedCount} outdated statistics entries for the new statistics system.`;
      fs.appendFile("./logs.txt", cleanupMsg, (e) => { 
        if (e) console.log(e);
      });
    } else {
    }
  } catch (err) {
    console.error(`${color.red(`[DATABASE] Error removing outdated statistics:`)}`);
    console.error(err);
    
    let errorMsg = `\n[${new Date().toLocaleString()}] [DATABASE] Error removing outdated statistics: ${err.message}\n${err.stack}`;
    fs.appendFile("./logs.txt", errorMsg, (e) => { 
      if (e) console.log(e);
    });
  }
}

async function migrateStaffSchema() {
  try {
    const staffModel = require('../models/staffModel');
    const StaffRoleModel = require('../models/staffRoleModel');
    
    const outdatedStaffDocs = await staffModel.find({
      $or: [
        { roleName: { $exists: true } },
        { role: { $exists: false } }
      ]
    });
    
    if (outdatedStaffDocs.length > 0) {
      console.log(`\n${color.yellow.bold(`━━━━━━━━━━━━━━━━━━━━━━━━━━━ STAFF SYSTEM MIGRATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━`)}`);
      console.log(`${color.yellow(`[DATABASE] Found ${outdatedStaffDocs.length} outdated staff entries from previous versions.`)}`);
      console.log(`\n${color.cyan.bold(`IMPORTANT MIGRATION NOTICE:`)}`);
      console.log(`\n${color.cyan.bold(`IMPORTANT MIGRATION NOTICE:`)}`);
      console.log(`\n${color.cyan.bold(`IMPORTANT MIGRATION NOTICE:`)}`);
      console.log(`${color.cyan(`In v2.0.0 of Plex Staff, we have changed the staff role system to be web-based`)}`);
      console.log(`${color.cyan(`and stored in the database instead of configuring staff roles in the config.yml file.`)}`);
      console.log(`\n${color.cyan(`As a result, all of your old staff member data has been deleted. This means that`)}`);
      console.log(`${color.cyan(`staff members no longer have their roles assigned. You will need to:`)}`);
      console.log(`\n${color.white(`1. Create and configure the new staff roles first on the web dashboard`)}`);
      console.log(`${color.white(`2. Re-add your staff members using the /staff add command`)}`);
      console.log(`\n${color.yellow(`Note: Staff roles can no longer be configured in the config.yml file.`)}`);
      
      const userIds = outdatedStaffDocs.map(doc => doc.userId);
      
      const result = await staffModel.deleteMany({
        $or: [
          { roleName: { $exists: true } },
          { role: { $exists: false } }
        ]
      });
      
      console.log(`\n${color.green(`[DATABASE] Successfully removed ${result.deletedCount} outdated staff entries.`)}`);
      console.log(`${color.cyan(`[DATABASE] The following users were affected and need to be re-added:`)}`);
      
      userIds.forEach(id => {
        console.log(`${color.white(`  • User ID: ${id}`)}`);
      });
      
      console.log(`\n${color.white(`To re-add staff members, use: /staff add @user <role>`)}`);
      console.log(`${color.yellow.bold(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)}`);
      
      let migrationMsg = `\n[${new Date().toLocaleString()}] [DATABASE] MIGRATION: Removed ${result.deletedCount} outdated staff entries due to new role system in v2.0.0. Affected users: ${userIds.join(', ')}`;
      fs.appendFile("./logs.txt", migrationMsg, (e) => { 
        if(e) console.log(e);
      });
    } else {
    }
  } catch (err) {
    console.error(`${color.red(`[DATABASE] Error during staff schema migration:`)}`);
    console.error(err);
    
    let errorMsg = `\n[${new Date().toLocaleString()}] [DATABASE] Error during staff schema migration: ${err.message}\n${err.stack}`;
    fs.appendFile("./logs.txt", errorMsg, (e) => { 
      if(e) console.log(e);
    });
  }
}
await migrateStaffSchema();
await removeOldStatsSchema();


// Function to check for expired temporary bans
async function checkExpiredBans() {
  try {
    const now = new Date();
    
    // Find all expired and unprocessed temporary bans
    const expiredBans = await temporaryBanModel.find({
      expiresAt: { $lte: now },
      processed: false
    });
    
    if (expiredBans.length > 0) {
      console.log(`${color.yellow(`[TEMP-BAN] Found ${expiredBans.length} expired temporary bans to process`)}`);
      
      for (const ban of expiredBans) {
        try {
          try {
            await guild.bans.fetch(ban.userID);
          } catch (banCheckError) {
            ban.processed = true;
            await ban.save();
            console.log(`${color.gray(`[TEMP-BAN] User ${ban.username || ban.userID} is not banned, marking as processed`)}`);
            continue;
          }
          
          // Unban the user
          await guild.members.unban(ban.userID, 'Temporary ban expired');
          console.log(`${color.green(`[TEMP-BAN] Unbanned user ${ban.username || ban.userID} - temporary ban expired`)}`);
          
          // Mark as processed
          ban.processed = true;
          await ban.save();
    
        } catch (error) {
          console.error(`${color.red(`[ERROR] Failed to process expired ban for ${ban.userID}:`)}`, error);
          let errorMsg = `\n[${new Date().toLocaleString()}] [ERROR] Failed to process expired ban for ${ban.userID}: ${error.message}`;
          fs.appendFile("./logs.txt", errorMsg, (e) => { if(e) console.log(e); });
        }
      }
    }
  } catch (error) {
    console.error(`${color.red(`[ERROR] Temporary ban check error:`)}`, error);
    let errorMsg = `\n[${new Date().toLocaleString()}] [ERROR] Temporary ban check error: ${error.message}`;
    fs.appendFile("./logs.txt", errorMsg, (e) => { if(e) console.log(e); });
  }
}

await checkExpiredBans();
setInterval(checkExpiredBans, 300000);

// Send verification embed to channel
if (config.VerificationSettings.Enabled) {
  guildModel.findOne({ guildID: guild.id })
      .then(guildData => {
          let verifData = guildData;

          let channel = guild.channels.cache.get(config.VerificationSettings.ChannelID);

          if (!channel) console.log('\x1b[31m%s\x1b[0m', `[ERROR] VerificationSettings.ChannelID is not a valid channel!`);
          
          const button = new Discord.ButtonBuilder()
              .setCustomId('verifButton')
              .setLabel(config.VerificationButton.Name)
              .setStyle(config.VerificationButton.Color)
              .setEmoji(config.VerificationButton.Emoji);
          let row = new Discord.ActionRowBuilder().addComponents(button);

          const verifEmbed = new Discord.EmbedBuilder()
          if(config.VerificationEmbed.Embed.Title) verifEmbed.setTitle(config.VerificationEmbed.Embed.Title)
          verifEmbed.setDescription(config.VerificationEmbed.Embed.Description)
          if(config.VerificationEmbed.Embed.Color) verifEmbed.setColor(config.VerificationEmbed.Embed.Color)
          if(!config.VerificationEmbed.Embed.Color) verifEmbed.setColor(config.EmbedColors)
          if(config.VerificationEmbed.Embed.PanelImage) verifEmbed.setImage(config.VerificationEmbed.Embed.PanelImage)
          if(config.VerificationEmbed.Embed.CustomThumbnailURL) verifEmbed.setThumbnail(config.VerificationEmbed.Embed.CustomThumbnailURL)
          if(config.VerificationEmbed.Embed.Footer.Enabled && config.VerificationEmbed.Embed.Footer.text) verifEmbed.setFooter({ text: `${config.VerificationEmbed.Embed.Footer.text}` })
          if(config.VerificationEmbed.Embed.Footer.Enabled && config.VerificationEmbed.Embed.Footer.text && config.VerificationEmbed.Embed.Footer.CustomIconURL) verifEmbed.setFooter({ text: `${config.VerificationEmbed.Embed.Footer.text}`, iconURL: `${config.VerificationEmbed.Embed.Footer.CustomIconURL}` })
          if(config.VerificationEmbed.Embed.Timestamp) verifEmbed.setTimestamp()

          if (channel && !verifData.verificationMsgID) {
              channel.send({ embeds: [verifEmbed], components: [row] })
                  .then(async function (msg) {
                      verifData.verificationMsgID = msg.id;
                      await verifData.save();
                  })
                  .catch(error => {
                      console.error(error);
                  });
          }

          if (channel && verifData.verificationMsgID) {
              channel.messages.fetch(verifData.verificationMsgID)
                  .catch(error => {
                      channel.send({ embeds: [verifEmbed], components: [row] })
                          .then(async function (msg2) {
                              verifData.verificationMsgID = msg2.id;
                              await verifData.save();
                          })
                          .catch(error => {
                              console.error(error);
                          });
                  });
          }
      })
      .catch(error => {
          console.error(error);
      });
}

    // Increase timesBotStarted by 1 everytime the bot starts
    statsDB.timesBotStarted++;
    await statsDB.save();

    // Send first start message
    if(statsDB.timesBotStarted === 1) {
      console.log(``)
      console.log(``)
      console.log(`Thank you for choosing ${color.yellow('Plex Staff')}!`)
      console.log(`Since this is your first time starting the bot, Here is some important information:`)
      console.log(``)
      console.log(`If you need any help, Create a ticket in our discord server.`)
      console.log(`You can also look at our documentation for help, ${color.yellow(`docs.plexdevelopment.net`)}`)
      console.log(``)
      console.log(`${color.bold.red(`WARNING:\n Leaking, redistributing or re-selling any of our products is not allowed \nYour actions may have legal consequences if you violate our terms.\nif you are found doing it, your license will be permanently disabled!`)}`)
      console.log(`By using this bot you agree to all terms located here, ${color.yellow(`plexdevelopment.net/tos`)}`)
    }

}