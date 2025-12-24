const { Collection, Client, Intents, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const Discord = require ("discord.js")
const fs = require('fs');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const color = require('ansi-colors');
const { client } = require("./index.js")
const axios = require('axios')
const glob = require("glob");
const punishmentModel = require('./models/punishmentModel');
const statsModel = require('./models/statisticsModel');
const userModel = require("./models/userModel");
const guildModel = require('./models/guildModel');
const temporaryBanModel = require('./models/temporaryBanModel');
const AutoModeration = require('./models/autoModerationModel');
const Settings = require('./models/settingsModel');
const reportModel = require('./models/reportModel');
const reportSettingsModel = require('./models/reportSettingsModel');
const parseDuration = require('parse-duration');
const StatsService = require('./statsService');
const { EventEmitter } = require('events');
const eventHandler = new EventEmitter();
const stopPhishing = require("stop-discord-phishing");
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');

exports.eventHandler = eventHandler;


fs.readdir('./events/', (err, files) => {
    if (err) return console.error(err);
  
    console.log(`${color.green(`[SYSTEM] Loading events...`)}`);
    
    let eventCount = 0;
    files.forEach(file => {
      if(!file.endsWith('.js')) return;
      
      const evt = require(`./events/${file}`);
      let evtName = file.split('.')[0];
      client.on(evtName, evt.bind(null, client));
      console.log(`${color.green(`[EVENT]`)} ${file} ${color.green('loaded!')}`);
      eventCount++;
    });
    
    console.log(`${color.green(`[SYSTEM]`)} Loaded ${eventCount} events!`);
  });
  

  const staffModel = require('./models/staffModel');
  const StaffRole = require('./models/staffRoleModel');

  exports.checkIfUserStaff = async function (userId) {
    try {

      if (config.FullAccessUsers.includes(userId)) return true;
      

      const guild = client.guilds.cache.get(config.GuildID);
      if (guild.ownerId === userId) return true;
      

      if (userId === client.user.id) return true;
      

      const staffMember = await staffModel.findOne({ userId: userId });
      if (staffMember) return true;
      

      return false;
    } catch (error) {
      console.error("Error in checkIfUserStaff function:", error);
      return false;
    }
  };

  exports.checkRolePriority = async function (member, targetUser, targetRoleIdOrName, commandUser) {
    const guild = client.guilds.cache.get(config.GuildID);
    const staffMember = await staffModel.findOne({ userId: commandUser.id }).populate('role');
    const isGuildOwner = guild.ownerId === commandUser?.id;
    
    if (config.FullAccessUsers.includes(commandUser.id)) return true;


    let isAdministrator = false;
    let isModerator = false;

    if (staffMember && staffMember.role) {
        if (staffMember.role.permissions.includes("ADMINISTRATOR")) {
            isAdministrator = true;
        }
        if (staffMember.role.permissions.includes("MANAGE_STAFF_MEMBERS")) {
            isModerator = true;
        }
    }


    if (commandUser.id === targetUser.id) {

        if (isAdministrator || isGuildOwner) {
            return true;
        } else {
            return false;
        }
    }
    
    if ((staffMember && isAdministrator) || isGuildOwner) return true;
    if (commandUser.id === client.user.id) return true;
    if (!staffMember) return false;
    if (targetUser.id === guild.ownerId) return false;

    if (!isModerator) return false;


    let targetRole;
    if (mongoose.Types.ObjectId.isValid(targetRoleIdOrName)) {

        targetRole = await StaffRole.findById(targetRoleIdOrName);
    } else {

        targetRole = await StaffRole.findOne({ name: targetRoleIdOrName });
    }


    const targetStaffMember = await staffModel.findOne({ userId: targetUser.id }).populate('role');
    const targetUserRole = targetStaffMember?.role;


    const userRolePriority = staffMember.role.priority;
    

    const targetUserRolePriority = targetUserRole ? targetUserRole.priority : undefined;
    

    const targetRolePriority = targetRole ? targetRole.priority : undefined;


    return (
        userRolePriority !== undefined &&
        (!targetUserRolePriority || targetUserRolePriority !== undefined) &&
        (!targetRolePriority || targetRolePriority !== undefined) &&

        ((targetRolePriority === undefined && userRolePriority < targetUserRolePriority) ||
            (targetRolePriority !== undefined && userRolePriority < targetRolePriority)) &&

        ((userRolePriority !== targetUserRolePriority) || (userRolePriority !== targetUserRolePriority && !targetRolePriority))
    );
};

exports.generateTranscript = async function(channel, userId = null) {
  try {
    if (!channel) return { success: false };

    const discordTranscripts = require('discord-html-transcripts');
    
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const transcriptsDir = path.join(uploadsDir, 'transcripts');
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }
    
    const fileName = `transcript-${channel.id}-${userId || 'all'}-${timestamp}-${uniqueId}.html`;
    const filePath = path.join(transcriptsDir, fileName);
    const relativePath = path.join('uploads', 'transcripts', fileName).replace(/\\/g, '/');
    
    const options = {
      limit: 50,
      minify: false,
      saveImages: true,
      returnType: 'buffer',
      fileName: fileName,
      poweredBy: false
    };
    
    if (userId) options.filter = (message) => message.author.id === userId;

    const attachment = await discordTranscripts.createTranscript(channel, options);
    if(attachment) fs.writeFileSync(filePath, attachment);
    
    return { 
      success: true, 
      filePath: filePath,
      relativePath: relativePath,
      message: `Successfully generated transcript from #${channel.name}`
    };
  } catch (error) {
    console.error("Error generating transcript:", error);
    return { 
      success: false, 
      message: `Failed to generate transcript: ${error.message}`
    };
  }
};

exports.reportUser = async function(guild, reporter, reported, reason = null, channel = null, screenshotPath = null, client) {
  try {
    const moment = require('moment');

    if (!guild || !reporter || !reported) {
      return { 
        success: false, 
        message: 'Missing required parameters (guild, reporter, or reported user)'
      };
    }

    const reportSettings = await reportSettingsModel.findOne({ guildId: guild.id });
    
    if (!reportSettings || !reportSettings.reportEnabled) {
      return { 
        success: false, 
        message: 'Report system is not enabled for this server' 
      };
    }

    let isStaff = await this.checkIfUserStaff(reported.id)

    if (isStaff) {
      return {
        success: false,
        message: 'You cannot report staff members'
      };
    }

    if (reporter.id === reported.id) {
      return {
        success: false,
        message: 'You cannot report yourself'
      };
    }

    if (reported.bot) {
      return {
        success: false,
        message: 'You cannot report a bot'
      };
    }

    if (reportSettings.requireReportReason && !reason) {
      return {
        success: false,
        message: 'A reason is required for reporting a user'
      };
    }

    const cooldownTime = reportSettings.reportCooldown * 60 * 1000;
    const recentReport = await reportModel.findOne({
      reporterId: reporter.id,
      guildId: guild.id,
      timestamp: { $gt: new Date(Date.now() - cooldownTime) }
    });

    if (recentReport) {
      const timeLeft = moment(recentReport.timestamp.getTime() + cooldownTime).fromNow(true);
      return {
        success: false,
        message: `You're on cooldown. You can submit another report in ${timeLeft}`
      };
    }

    const reportId = await this.generateReportID();
    let transcriptPath = null;

    if (channel && reportSettings.saveTranscript) {
      const transcriptResult = reportSettings.transcriptType === 'reportedUserOnly'
        ? await this.generateTranscript(channel, reported.id)
        : await this.generateTranscript(channel);

      if (transcriptResult.success) {
        transcriptPath = transcriptResult.relativePath;
      }
    }

    const newReport = new reportModel({
      reportId,
      reporterId: reporter.id,
      reporterUsername: reporter.username,
      reportedId: reported.id,
      reportedUsername: reported.username,
      reason: reason || 'No reason provided',
      channelId: channel ? channel.id : null,
      channelName: channel ? channel.name : null,
      transcriptPath,
      screenshotPath,
      guildId: guild.id,
      status: 'Pending'
    });
    
    await newReport.save();

    await StatsService.incrementStat(guild.id, 'reportsReceived');

    if (reportSettings.reportChannelId) {
      try {
        const reportChannel = await guild.channels.fetch(reportSettings.reportChannelId);
        if (reportChannel) {
          const reportEmbed = new Discord.EmbedBuilder()
            .setColor('#FF9800')
            .setAuthor({ 
              name: `Report • User Reported`, 
              iconURL: 'https://i.imgur.com/XMgpDGJ.png'
            })
            .addFields([
              { 
                name: '`📋` **Report Details**', 
                value: `> **Reported User:** <@!${reported.id}> \`${reported.username}\`\n> **Reporter:** <@!${reporter.id}> \`${reporter.username}\`\n> **Reason:** ${reason || 'No reason provided'}` 
              },
              {
                name: '`🔍` **Additional Information**',
                value: `> **Channel:** ${channel ? `<#${channel.id}>` : 'N/A'}\n> **Transcript:** ${transcriptPath ? 'Available' : 'Not available'}\n> **Status:** Pending Review`
              }
            ])
            .setThumbnail(reported.displayAvatarURL({ format: 'png', dynamic: true }))
            .setFooter({ 
              text: `Report ID: ${reportId}`, 
              iconURL: reporter.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
            })
            .setTimestamp();

            const viewReportButton = new Discord.ButtonBuilder()
              .setStyle("Link")
              .setLabel('View Report')
              .setEmoji('🔍')
              .setURL(`${config.baseURL}/view-report/${reportId}`);
          
          const actionRow = new Discord.ActionRowBuilder()
            .addComponents(viewReportButton);

          await reportChannel.send({ embeds: [reportEmbed], components: [actionRow] });
        }
      } catch (error) {
        console.error(`Error sending report notification: ${error}`);
      }
    }

    if (reportSettings.enableAutoActions) {
      const timeWindowMs = reportSettings.reportTimeWindow * 60 * 60 * 1000;
      const recentReports = await reportModel.find({
        reportedId: reported.id,
        guildId: guild.id,
        timestamp: { $gt: new Date(Date.now() - timeWindowMs) }
      });

      const uniqueReporters = new Set(recentReports.map(report => report.reporterId));
      
      if (recentReports.length >= reportSettings.reportThreshold && 
          uniqueReporters.size >= reportSettings.minUniqueReporters) {
        
        try {
          const autoActionReason = reportSettings.autoActionReason || 'Automatic action due to multiple user reports';
          let actionResult = { success: false, message: 'Unknown error' };
          let actionType = reportSettings.autoActionType;
          let actionDuration = null;
          let punishmentID = await this.generatePunishmentID();
          
          const member = await guild.members.fetch(reported.id).catch(() => null);
          if (!member) {
            return {
              success: true,
              message: 'Report submitted successfully, but user is no longer in the server for auto-action',
              reportId
            };
          }
          
          switch (reportSettings.autoActionType) {
            case 'warn':
              actionResult = await this.warnUser(member, client.user, autoActionReason, punishmentID);
              break;
              
            case 'timeout':
              let timeoutDuration = reportSettings.timeoutDuration;
              if (reportSettings.timeoutDurationUnit === 'd') timeoutDuration *= 24;
              timeoutDuration = timeoutDuration * 60 * 60 * 1000;
              
              actionResult = await this.timeoutUser(member, client.user, autoActionReason, timeoutDuration, punishmentID);
              
              const timeoutUnit = reportSettings.timeoutDurationUnit;
              actionDuration = `${reportSettings.timeoutDuration} ${timeoutUnit === 'h' ? 'hours' : timeoutUnit === 'd' ? 'days' : 'minutes'}`;
              break;
              
            case 'kick':
              actionResult = await this.kickUser(member, client.user, autoActionReason, punishmentID);
              break;
              
            case 'ban':
              let banDuration = 0;
              
              if (!reportSettings.permanentBan) {
                banDuration = reportSettings.banDuration;
                
                if (reportSettings.banDurationUnit === 'w') banDuration *= 7;
                if (reportSettings.banDurationUnit === 'm') banDuration *= 30;
                
                const banUnit = reportSettings.banDurationUnit;
                actionDuration = `${reportSettings.banDuration} ${banUnit === 'd' ? 'days' : banUnit === 'w' ? 'weeks' : 'months'}`;
              } else {
                actionDuration = 'Permanent';
              }
              
              actionResult = await this.banUser(member, client.user, autoActionReason, punishmentID, banDuration);
              break;
          }
          
          if (actionResult.success) {
            await reportModel.updateMany(
              { reportedId: reported.id, guildId: guild.id, status: 'Pending' },
              { 
                $set: { 
                  autoActioned: true,
                  autoActionType: actionType,
                  autoActionDuration: actionDuration,
                  autoActionReason: autoActionReason,
                  autoActionTimestamp: new Date(),
                  autoActionPunishmentId: actionResult.punishmentId || null
                }
              }
            );
            
            if (reportSettings.reportChannelId) {
              try {
                const reportChannel = await guild.channels.fetch(reportSettings.reportChannelId);
                if (reportChannel) {
                  const autoActionEmbed = new Discord.EmbedBuilder()
                    .setColor('#FF3860')
                    .setAuthor({ 
                      name: `Auto-Action • ${actionType.charAt(0).toUpperCase() + actionType.slice(1)}`, 
                      iconURL: 'https://i.imgur.com/PIVhf8W.png'
                    })
                    .setDescription(`**Automatic action taken against <@!${reported.username}>**\nThis user received multiple reports in a short time period.\nStaff review is still required.`)
                    .addFields([
                      { 
                        name: '`📋` **Action Details**', 
                        value: `> **User:** <@!${reported.id}> \`${reported.username}\`\n> **Action:** ${actionType.charAt(0).toUpperCase() + actionType.slice(1)}${actionDuration ? `\n> **Duration:** ${actionDuration}` : ''}\n> **Reason:** ${autoActionReason}` 
                      },
                      {
                        name: '`📊` **Statistics**',
                        value: `> **Total Reports:** ${recentReports.length}\n> **Unique Reporters:** ${uniqueReporters.size}\n> **Time Window:** ${reportSettings.reportTimeWindow} hours`
                      }
                    ])
                    .setThumbnail(reported.displayAvatarURL({ format: 'png', dynamic: true }))
                    .setFooter({ 
                      text: `Auto-Moderation • Staff Review Required`, 
                      iconURL: guild.client.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                    })
                    .setTimestamp();
  
                  await reportChannel.send({ embeds: [autoActionEmbed] });
                }
              } catch (error) {
                console.error(`Error sending auto-action notification: ${error}`);
              }
            }
          }
        } catch (error) {
          console.error(`Error applying automatic action: ${error}`);
        }
      }
    }

    return {
      success: true,
      message: 'Report submitted successfully',
      reportId
    };
  } catch (error) {
    console.error(`Error reporting user: ${error}`);
    return {
      success: false,
      message: `Failed to submit report: ${error.message}`
    };
  }
}

exports.generateReportID = async function() {
  let reportId = 'R-';
  
  const timestamp = Math.floor(Date.now() / 1000).toString(36).toUpperCase();
  reportId += timestamp + '-';
  
  const randomBytes = crypto.randomBytes(3);
  const randomComponent = randomBytes.toString('hex').toUpperCase();
  reportId += randomComponent;
  
  return reportId;
}

exports.generatePunishmentID = async function () {
    const characters = 'ABCDEFGHJKMNPQRSTUVWXYZ123456789';
    let result = 'P';

    const pattern = ['1', 'B', '3', '4', 'C', '6', 'D', '8'];

    for (let i = 0; i < pattern.length - 1; i++) { 
        if (pattern[i] === 'B') {

            result += characters.charAt(Math.floor(Math.random() * characters.length));
        } else if (pattern[i] === 'C') {

            result += Math.floor(Math.random() * 10);
        } else if (pattern[i] === 'D') {

            const randomChar = characters.charAt(Math.floor(Math.random() * characters.length));
            result += isNaN(parseInt(randomChar)) ? randomChar : parseInt(randomChar);
        } else {

            result += pattern[i];
        }
    }
    return result;
}


exports.checkPermission = async function (userID, permission) {
    try {
        const guild = client.guilds.cache.get(config.GuildID);
        const isGuildOwner = guild.ownerId === userID;
        
        if (isGuildOwner) return true;
        if (userID === client.user.id) return true;
        if (config.FullAccessUsers.includes(userID)) return true;
        

        const staffMember = await staffModel.findOne({ userId: userID }).populate('role');
        
        if (!staffMember || !staffMember.role) {
            return false;
        }
        

        if (staffMember.role.permissions.includes(permission) || 
            staffMember.role.permissions.includes("ADMINISTRATOR")) {
            return true;
        } else {
            return false;
        }
    } catch (error) {
        console.error('Error checking permission:', error);
        return false;
    }
};


exports.checkActionLimit = async function (user, staffMemberId, actionType) {
    try {
        const guild = client.guilds.cache.get(config.GuildID);
        const isGuildOwner = guild.ownerId === staffMemberId;
        if (isGuildOwner) return { success: true, message: `User is guild owner` };
        if (staffMemberId === client.user.id) return { success: true, message: `User is myself (bot)` };
        if (config.FullAccessUsers.includes(staffMemberId)) return { success: true, message: `User has full access` };


        const staffMemberData = await staffModel.findOne({ userId: staffMemberId }).populate('role');
        
        if (!staffMemberData) {
            return { success: false, message: `Staff member data not found for user ${staffMemberId}!` };
        }
        
        if (!staffMemberData.role) {
            return { success: false, message: `Role not found for staff member ${staffMemberId}!` };
        }
        

        if (!staffMemberData.role.actionLimits || 
            !staffMemberData.role.actionLimits.Enabled) {
            return { success: true };
        }
        

        const actionLimitsConfig = staffMemberData.role.actionLimits.Limits;
        
        if (!actionLimitsConfig || !actionLimitsConfig[actionType]) {
            return { success: false, message: `Action limit configuration not found for ${actionType}!` };
        }
        

        const actionLimitsData = staffMemberData.actionLimits[actionType];
        
        const timePeriod = actionLimitsConfig.TimePeriod;
        const { lastActionTimestamp, actionsWithinTimePeriod } = actionLimitsData;

        if (!timePeriod || !lastActionTimestamp) {
            return { success: false, message: `Invalid action limit configuration for ${actionType}!` };
        }

        const currentTime = new Date();
        const timeDiff = currentTime - new Date(lastActionTimestamp);

        const timePeriodMilliseconds = parseDuration(timePeriod);

        if (timePeriodMilliseconds === null || timePeriodMilliseconds <= 0) {
            return { success: false, message: `Invalid time period configuration for ${actionType}!` };
        }

        if (actionsWithinTimePeriod === 0) return { success: true };

        if (timeDiff < timePeriodMilliseconds && actionsWithinTimePeriod >= actionLimitsConfig[actionType]) {
            const remainingTime = timePeriodMilliseconds - timeDiff;
        
            const remainingTimeInSeconds = Math.floor(remainingTime / 1000);
            const hours = Math.floor(remainingTimeInSeconds / 3600);
            const minutes = Math.floor((remainingTimeInSeconds % 3600) / 60);
            const seconds = remainingTimeInSeconds % 60;
        
            const remainingTimeString = `${hours}h ${minutes}m ${seconds}s`;
        
            return {
                success: false,
                message: `You have exceeded the ${actionType} limit. Please wait ${remainingTimeString} before trying again.`
            };
        }

        return { success: true };
    } catch (error) {
        console.error("Error in checkActionLimit:", error);
        return { success: false, message: "An error occurred while checking action limit." };
    }
};

const inviteProcessingUsers = new Map();
const phishingProcessingUsers = new Map();

const PUNISHMENT_COOLDOWN = 5000;
const PHISHING_PUNISHMENT_COOLDOWN = 5000;

const staffCache = new Map();
const STAFF_CACHE_EXPIRY = 15 * 60 * 1000;

exports.checkIfUserStaffCached = async function(userId) {
  if (staffCache.has(userId)) return staffCache.get(userId);
  
  const isStaff = await this.checkIfUserStaff(userId);
  staffCache.set(userId, isStaff);
  

  setTimeout(() => staffCache.delete(userId), STAFF_CACHE_EXPIRY);
  
  return isStaff;
};

const autoModSettingsCache = new Map();
const AUTOMOD_CACHE_EXPIRY = 3 * 60 * 1000;

exports.getAutoModSettings = async function(guildId) {
  const cachedSettings = autoModSettingsCache.get(guildId);
  if (cachedSettings) return cachedSettings;
  
  const settings = await AutoModeration.getOrCreate(guildId);
  autoModSettingsCache.set(guildId, settings);
  
  setTimeout(() => autoModSettingsCache.delete(guildId), AUTOMOD_CACHE_EXPIRY);
  
  return settings;
};

exports.handleDiscordInvites = async function(message, client) {
  try {

    if (message.author.bot) return false;
    
    const userId = message.author.id;
    

    if (inviteProcessingUsers.has(userId)) {

      try { 
        await message.delete();
      } catch (error) {

      }
      return false;
    }
  
    const autoModSettings = await this.getAutoModSettings(message.guild.id);


    if (!autoModSettings.discordInviteFilter.enabled) return false;
    

    const isStaff = await this.checkIfUserStaffCached(userId);
    

    if (isStaff) return false;
    
    const channelSettings = autoModSettings.discordInviteFilter.channels;
    const currentChannelId = message.channel.id;
    

    let shouldModerate = channelSettings.allChannels;
    if (!shouldModerate && channelSettings.specificChannels && channelSettings.specificChannels.length > 0) {

      const currentCategoryId = message.channel.parentId;
      

      const isChannelExcluded = channelSettings.specificChannels.includes(currentChannelId);
      const isCategoryExcluded = currentCategoryId && channelSettings.specificChannels.includes(currentCategoryId);
      

      shouldModerate = !(isChannelExcluded || isCategoryExcluded);
    }
    if (!shouldModerate) return false;
    

    const inviteRegex = /(?:(?:https?:\/\/)?(?:www)?discord(?:app)?\.(?:(?:com|gg)\/invite\/[a-z0-9-_]+)|(?:https?:\/\/)?(?:www)?discord\.gg\/[a-z0-9-_]+)/i;
    
    if (inviteRegex.test(message.content)) {

      inviteProcessingUsers.set(userId, Date.now());
      
      const punishmentID = await this.generatePunishmentID();
      const actions = autoModSettings.discordInviteFilter.actions;
      

      if (actions.deleteMessage) {
        try { 
          await message.delete(); 
        } catch (error) { 
          console.error("Failed to delete message with Discord invite:", error); 
        }
      }
      

      let punishmentApplied = false;
      
      if (actions.banUser && !punishmentApplied) {
        let duration = null;
        if (actions.isTempBan) {
          const banDuration = actions.banDuration || 7;
          const banUnit = actions.banUnit || 'd';
          
          if (banUnit === 'd') duration = banDuration * 24 * 60 * 60 * 1000;
          else if (banUnit === 'w') duration = banDuration * 7 * 24 * 60 * 60 * 1000;
          else if (banUnit === 'm') duration = banDuration * 30 * 24 * 60 * 60 * 1000;
        }
        
        const { success } = await this.banUser(message.author, client.user, "Posting Discord invite links", punishmentID, duration);
        punishmentApplied = success;
        if (!success) console.error("Failed to ban user for Discord invite");
      }
      
      if (actions.kickUser && !punishmentApplied) {
        const { success } = await this.kickUser(message.author, client.user, "Posting Discord invite links", punishmentID);
        punishmentApplied = success;
        if (!success) console.error("Failed to kick user for Discord invite");
      }
      
      if (actions.timeout && this.timeoutUser && !punishmentApplied) {
        const timeString = `${actions.timeoutDuration || 5}${actions.timeoutUnit || 'm'}`;
        const { success } = await this.timeoutUser(message.author, client.user, "Posting Discord invite links", timeString, punishmentID);
        punishmentApplied = success;
        if (!success) console.error("Failed to timeout user for Discord invite");
      }
      
      if (actions.warnUser && this.warnUser && !punishmentApplied) {
        const { success } = await this.warnUser(message.author, client.user, "Posting Discord invite links", punishmentID);
        punishmentApplied = success;
        if (!success) console.error("Failed to warn user for Discord invite");
      }
      

      setTimeout(() => {
        inviteProcessingUsers.delete(userId);
      }, PUNISHMENT_COOLDOWN);
      
      return true;
    }
    
    return false;
  } catch (error) {

    if (message && message.author) {
      inviteProcessingUsers.delete(message.author.id);
    }
    console.error('Error in Discord invite filter:', error);
    return false;
  }
};

exports.handlePhishingLinks = async function(message, client) {
  try {

    if (message.author.bot) return false;
    
    const userId = message.author.id;
    

    if (phishingProcessingUsers.has(userId)) {

      try { 
        await message.delete();
      } catch (error) {

      }
      return false;
    }
    
    const autoModSettings = await this.getAutoModSettings(message.guild.id);


    if (!autoModSettings.phishingProtection.enabled) return false;
    

    const isStaff = await this.checkIfUserStaffCached(userId);
    

    if (isStaff) return false;
    
    const channelSettings = autoModSettings.phishingProtection.channels;
    const currentChannelId = message.channel.id;
    

    let shouldModerate = channelSettings.allChannels;
    if (!shouldModerate && channelSettings.specificChannels && channelSettings.specificChannels.length > 0) {

      const currentCategoryId = message.channel.parentId;
      

      const isChannelExcluded = channelSettings.specificChannels.includes(currentChannelId);
      const isCategoryExcluded = currentCategoryId && channelSettings.specificChannels.includes(currentCategoryId);
      

      shouldModerate = !(isChannelExcluded || isCategoryExcluded);
    }
    if (!shouldModerate) return false;
    


    const isPhishingLink = await stopPhishing.checkMessage(message.content, true);
    
    if (isPhishingLink) {

      phishingProcessingUsers.set(userId, Date.now());
      
      const punishmentID = await this.generatePunishmentID();
      const actions = autoModSettings.phishingProtection.actions;
      

      if (actions.deleteMessage) {
        try { 
          await message.delete(); 
        } catch (error) { 
          console.error("Failed to delete message with phishing link:", error); 
        }
      }
      

      let punishmentApplied = false;
      const reason = "Posting phishing link";
      
      if (actions.banUser && !punishmentApplied) {
        let duration = null;
        if (actions.isTempBan) {
          const banDuration = actions.banDuration || 7;
          const banUnit = actions.banUnit || 'd';
          
          if (banUnit === 'd') duration = banDuration * 24 * 60 * 60 * 1000;
          else if (banUnit === 'w') duration = banDuration * 7 * 24 * 60 * 60 * 1000;
          else if (banUnit === 'm') duration = banDuration * 30 * 24 * 60 * 60 * 1000;
        }
        
        const { success } = await this.banUser(message.author, client.user, reason, punishmentID, duration);
        punishmentApplied = success;
        if (!success) console.error("Failed to ban user for phishing link");
      }
      
      if (actions.kickUser && !punishmentApplied) {
        const { success } = await this.kickUser(message.author, client.user, reason, punishmentID);
        punishmentApplied = success;
        if (!success) console.error("Failed to kick user for phishing link");
      }
      
      if (actions.timeout && this.timeoutUser && !punishmentApplied) {
        const timeString = `${actions.timeoutDuration || 5}${actions.timeoutUnit || 'm'}`;
        const { success } = await this.timeoutUser(message.author, client.user, reason, timeString, punishmentID);
        punishmentApplied = success;
        if (!success) console.error("Failed to timeout user for phishing link");
      }
      
      if (actions.warnUser && this.warnUser && !punishmentApplied) {
        const { success } = await this.warnUser(message.author, client.user, reason, punishmentID);
        punishmentApplied = success;
        if (!success) console.error("Failed to warn user for phishing link");
      }
      

      setTimeout(() => {
        phishingProcessingUsers.delete(userId);
      }, PHISHING_PUNISHMENT_COOLDOWN);
    
      return true;
    }
    
    return false;
  } catch (error) {

    if (message && message.author) {
      phishingProcessingUsers.delete(message.author.id);
    }
    console.error('Error in phishing link filter:', error);
    return false;
  }
};

const userMessageCache = new Map();


const spamProcessingUsers = new Map();


const SPAM_PUNISHMENT_COOLDOWN = 5000;


const CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  userMessageCache.forEach((userData, userId) => {

    userData.messages = userData.messages.filter(msg => (now - msg.timestamp) < CACHE_CLEANUP_INTERVAL);
    

    if (userData.messages.length === 0) {
      userMessageCache.delete(userId);
    }
  });
}, CACHE_CLEANUP_INTERVAL);


exports.handleSpamProtection = async function(message, client) {
  try {

    if (message.author.bot) return false;
    
    const userId = message.author.id;
    

    if (spamProcessingUsers.has(userId)) return false;
  
    const autoModSettings = await this.getAutoModSettings(message.guild.id);
    

    if (!autoModSettings.spamProtection.enabled) return false;
    

    const isStaff = await this.checkIfUserStaffCached(userId);
    

    if (isStaff) return false;
    
    const channelSettings = autoModSettings.spamProtection.channels;
    const currentChannelId = message.channel.id;
    

    let shouldModerate = channelSettings.allChannels;
    if (!shouldModerate && channelSettings.specificChannels && channelSettings.specificChannels.length > 0) {

      const currentCategoryId = message.channel.parentId;
      

      const isChannelExcluded = channelSettings.specificChannels.includes(currentChannelId);
      const isCategoryExcluded = currentCategoryId && channelSettings.specificChannels.includes(currentCategoryId);
      

      shouldModerate = !(isChannelExcluded || isCategoryExcluded);
    }
    if (!shouldModerate) return false;
    

    const messageLimit = autoModSettings.spamProtection.messageLimit !== undefined ? 
                    autoModSettings.spamProtection.messageLimit : 5;
const mentionLimit = autoModSettings.spamProtection.mentionLimit !== undefined ? 
                    autoModSettings.spamProtection.mentionLimit : 5;
const duplicateLimit = autoModSettings.spamProtection.duplicateLimit !== undefined ? 
                      autoModSettings.spamProtection.duplicateLimit : 3;

    const messageDuration = autoModSettings.spamProtection.messageDuration || 4;
    const messageDurationUnit = autoModSettings.spamProtection.messageDurationUnit || 's';
    

    let durationMs = messageDuration * 1000;
    if (messageDurationUnit === 'm') {
      durationMs = messageDuration * 60 * 1000;
    }
    

    if (!userMessageCache.has(userId)) {
      userMessageCache.set(userId, {
        messages: []
      });
    }
    
    const userData = userMessageCache.get(userId);
    const currentTime = Date.now();
    

    userData.messages.push({
      content: message.content,
      timestamp: currentTime,
      mentionCount: message.mentions.users.size + message.mentions.roles.size
    });
    

    userData.messages = userData.messages.filter(msg => (currentTime - msg.timestamp) < durationMs);
    

    const recentMessages = userData.messages.length;
    

    const currentMentionCount = message.mentions.users.size + message.mentions.roles.size;
    

    let duplicateCount = 0;
    const currentContent = message.content.toLowerCase();
    
    if (currentContent.length > 5) {

      for (const msg of userData.messages) {
        if (msg.content.toLowerCase() === currentContent) {
          duplicateCount++;
        }
      }
    }
    

    const isRateSpam = messageLimit > 0 && recentMessages > messageLimit;
    const isMentionSpam = mentionLimit > 0 && currentMentionCount > mentionLimit;
    const isDuplicateSpam = duplicateLimit > 0 && duplicateCount > duplicateLimit;
    
    let spamType = null;
    if (isRateSpam) spamType = "message rate";
    else if (isMentionSpam) spamType = "mention";
    else if (isDuplicateSpam) spamType = "duplicate message";
    
    if (spamType) {

      spamProcessingUsers.set(userId, currentTime);
      
      const punishmentID = await this.generatePunishmentID();
      const actions = autoModSettings.spamProtection.actions;
      

      let punishmentApplied = false;
      const reason = `${spamType.charAt(0).toUpperCase() + spamType.slice(1)} spam detected`;
      

      if (actions.deleteMessage) {
        try {

if (isRateSpam || isDuplicateSpam) {

  let fetchedMessages;
  try {
    fetchedMessages = await message.channel.messages.fetch({ limit: 10 });
  } catch (fetchError) {

    fetchedMessages = null;
  }
  

  if (fetchedMessages) {
    const userMessages = fetchedMessages.filter(m => m.author.id === userId);
    
    if (userMessages.size > 0) {
      try {

        await message.channel.bulkDelete(userMessages).catch(() => {

          userMessages.forEach(msg => {
            try {
              msg.delete().catch(() => {});
            } catch (individualError) {

            }
          });
        });
      } catch (deleteError) {

      }
    }
  }
} else {

  try {
    await message.delete().catch(() => {});
  } catch (deleteError) {

  }
}
        } catch (error) {
          console.error(`Failed to delete spam messages: ${error}`);
        }
      }
      
      if (actions.banUser && !punishmentApplied) {
        let duration = null;
        if (actions.isTempBan) {
          const banDuration = actions.banDuration || 7;
          const banUnit = actions.banUnit || 'd';
          
          if (banUnit === 'd') duration = banDuration * 24 * 60 * 60 * 1000;
          else if (banUnit === 'w') duration = banDuration * 7 * 24 * 60 * 60 * 1000;
          else if (banUnit === 'm') duration = banDuration * 30 * 24 * 60 * 60 * 1000;
        }
        
        const { success } = await this.banUser(message.author, client.user, reason, punishmentID, duration);
        punishmentApplied = success;
        if (!success) console.error(`Failed to ban user for ${spamType} spam`);
      }
      
      if (actions.kickUser && !punishmentApplied) {
        const { success } = await this.kickUser(message.author, client.user, reason, punishmentID);
        punishmentApplied = success;
        if (!success) console.error(`Failed to kick user for ${spamType} spam`);
      }
      
      if (actions.timeout && this.timeoutUser && !punishmentApplied) {
        const timeString = `${actions.timeoutDuration || 5}${actions.timeoutUnit || 'm'}`;
        const { success } = await this.timeoutUser(message.author, client.user, reason, timeString, punishmentID);
        punishmentApplied = success;
        if (!success) console.error(`Failed to timeout user for ${spamType} spam`);
      }
      
      if (actions.warnUser && this.warnUser && !punishmentApplied) {
        const { success } = await this.warnUser(message.author, client.user, reason, punishmentID);
        punishmentApplied = success;
        if (!success) console.error(`Failed to warn user for ${spamType} spam`);
      }
      

      userMessageCache.delete(userId);
      

      setTimeout(() => {
        spamProcessingUsers.delete(userId);
      }, SPAM_PUNISHMENT_COOLDOWN);
      
      return true;
    }
    
    return false;
  } catch (error) {

    if (message && message.author) {
      spamProcessingUsers.delete(message.author.id);
    }
    console.error('Error in spam protection:', error);
    return false;
  }
};

exports.kickUser = async function (user, staff, reason, punishmentID) {
const guild = client.guilds.cache.get(config.GuildID);
const guildData = await guildModel.findOne({ guildID: config.GuildID });

let member = await guild.members.fetch(user.id);
let staffUser = await guild.members.fetch(staff.id);

if(!reason) reason = "No reason specified."

const StaffMember = await staffModel.findOne({ userId: member.id });

const hasPermission = await exports.checkPermission(staffUser.id, "KICK_USERS");
if (!hasPermission) return { success: false, message: `Sorry, you don't have permissions to do this!` };

if (member.id === staffUser.id) return { success: false, message: `You can't kick yourself!` };
if (!member) return { success: false, message: `The user is not in the server!` };
if (!member.kickable) return { success: false, message: `You can't kick this user!` };
if (member.user.bot) return { success: false, message: `You can't kick a bot!` };
if (StaffMember) return { success: false, message: `You can't kick a staff member!` };

const actionLimitCheckResult = await exports.checkActionLimit(member, staffUser.id, "Kick");
if (!actionLimitCheckResult.success) return { success: false, message: actionLimitCheckResult.message };

const settings = await Settings.findOne() || {};

const logEmbed = new EmbedBuilder()
  .setColor('#FF9800')
  .setAuthor({ 
    name: `Kick • Moderation Action`, 
    iconURL: 'https://i.imgur.com/HVtH27Y.png'
  }) 
  .addFields([
    { 
      name: '`📋` **Action Details**', 
      value: `> **User:** <@!${member.id}> \`${member.user.username}\`\n> **Staff:** <@!${staffUser.id}> \`${staffUser.user.username}\`\n> **Reason:** ${reason}` 
    }
  ])
  .setThumbnail(member.displayAvatarURL({ format: 'png', dynamic: true }))
  .setFooter({ 
    text: `Case #${guildData.totalActions} | ID: ${punishmentID}`, 
    iconURL: staffUser.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
  })
  .setTimestamp();

const viewProfileButton = new Discord.ButtonBuilder()
  .setStyle('Link')
  .setLabel('View User Profile')
  .setEmoji('👤')
  .setURL(`${config.baseURL}/view/${member.id}`);


const viewCaseButton = new Discord.ButtonBuilder()
  .setStyle('Link')
  .setLabel('View Case Details')
  .setEmoji('📋')
  .setURL(`${config.baseURL}/punishment/lookup/${punishmentID}`);


const actionRow = new Discord.ActionRowBuilder()
  .addComponents(viewProfileButton, viewCaseButton);


const logsChannel = guild.channels.cache.get(config.Kick.LogsChannelID);


    if (config.Kick.DMUser.Enabled) {
      try {
          const embedSettings = config.Kick.DMUser.Embed;
          const dmEmbed = new EmbedBuilder();
          if (embedSettings.Author && embedSettings.AuthorIcon) dmEmbed.setAuthor({ name: embedSettings.Author, iconURL: embedSettings.AuthorIcon });
          if (embedSettings.Author && !embedSettings.AuthorIcon) dmEmbed.setAuthor({ name: embedSettings.Author });
          if (embedSettings.Color) dmEmbed.setColor(embedSettings.Color);
          if (embedSettings.Description) dmEmbed.setDescription(embedSettings.Description.replace('{guildName}', guild.name)
              .replace('{user}', `<@!${member.id}>`)
              .replace('{username}', member.user.username)
              .replace('{staff}', `<@!${staffUser.id}>`)
              .replace('{reason}', reason)
              .replace('{punishmentID}', punishmentID));

          if (embedSettings.ThumbnailEnabled) {
              if (embedSettings.CustomThumbnail && embedSettings.CustomThumbnail !== '') {
                  dmEmbed.setThumbnail(embedSettings.CustomThumbnail);
              } else {
                  dmEmbed.setThumbnail(member.user.displayAvatarURL({ format: 'png', dynamic: true }));
              }
          }

          dmEmbed.addFields(embedSettings.Fields.map(field => ({
              name: field.name,
              value: field.value.replace('{guildName}', guild.name)
                  .replace('{user}', `<@!${member.id}>`)
                  .replace('{username}', member.user.username)
                  .replace('{staff}', `<@!${staffUser.id}>`)
                  .replace('{reason}', reason)
                  .replace('{punishmentID}', punishmentID),
          })));

          if (embedSettings.Timestamp) {
              dmEmbed.setTimestamp();
          }

          const footerText = embedSettings.Footer.text.replace('{guildName}', guild.name)
              .replace('{username}', member.user.username)
              .replace('{reason}', reason)
              .replace('{punishmentID}', punishmentID);


          if (footerText.trim() !== '') {
              if (embedSettings.Footer.Enabled && embedSettings.Footer.CustomIconURL == '' && embedSettings.Footer.IconEnabled) {
                  dmEmbed.setFooter({
                      text: footerText,
                      iconURL: member.user.displayAvatarURL({ format: 'png', dynamic: true }),
                  });
              } else {
                  dmEmbed.setFooter({
                      text: footerText,
                  });
              }
          }


          if (footerText.trim() !== '' && embedSettings.Footer.CustomIconURL !== '' && embedSettings.Footer.IconEnabled) {
              dmEmbed.setFooter({
                  text: footerText,
                  iconURL: embedSettings.Footer.CustomIconURL,
              });
          }


          const appealButton = new Discord.ButtonBuilder()
          .setStyle('Link')
          .setLabel('Appeal Punishment')
          .setURL(settings.customAppealLink || `${config.baseURL}/appeal/${punishmentID}`);

          const actionRow = new Discord.ActionRowBuilder().addComponents(appealButton);

          if(settings.appealEnabled && config.Kick.Appealable) await member.send({ embeds: [dmEmbed], components: [actionRow] });
          if(settings.appealEnabled && !config.Kick.Appealable) await member.send({ embeds: [dmEmbed] });
          if(!settings.appealEnabled) await member.send({ embeds: [dmEmbed] });
      } catch (e) {
          console.log('\x1b[33m%s\x1b[0m', "[INFO] I tried to DM a user, but their DM's are locked.");
      }
  }

  let userFromDB = await userModel.findOne({ userID: member.id });
  if(!userFromDB) await userModel.create({ userID: member.id });

  const newPunishment = new punishmentModel({
      userID: member.id,
      username: member.user.username,
      punishment: 'Kick',
      punishmentID: punishmentID,
      reason: reason,
      staff: staffUser.id,
      staffUsername: staffUser.user.username,
      recentMessages: userFromDB?.messageHistory || []
  });
  await newPunishment.save();

  guildData.totalActions = (guildData.totalActions || 0) + 1;
  guildData.totalKicks = (guildData.totalKicks || 0) + 1;
  await guildData.save();




  if (staffUser.id !== client.user.id && !config.FullAccessUsers.includes(staffUser.id)) {
    let guildOwner = await guild.fetchOwner();
    if (guildOwner.id !== staffUser.id) {
      const UserStaffMember = await staffModel.findOne({ userId: staffUser.id }).populate('role');
      
      if (UserStaffMember && UserStaffMember.role) {
        if (UserStaffMember.role.actionLimits && 
            UserStaffMember.role.actionLimits.Enabled === true) {
          
          const timePeriodMilliseconds = parseDuration(UserStaffMember.role.actionLimits.Limits.TimePeriod);
          
          const currentTime = new Date();
          const timeDiff = currentTime - new Date(UserStaffMember.actionLimits.Kick.lastActionTimestamp);
          
          if (timeDiff >= timePeriodMilliseconds) {
            UserStaffMember.actionLimits.Kick.actionsWithinTimePeriod = 0;
          }
          
          UserStaffMember.actionLimits.Kick.actionsWithinTimePeriod += 1;
          UserStaffMember.actionLimits.Kick.lastActionTimestamp = new Date();
          
          await UserStaffMember.save();
        }
      }
    }
  }


   await StatsService.incrementStat(member.guild.id, 'kicks');

  await member.kick({ reason: `[${staffUser.user.username}] ${reason}` })
  if (logsChannel) logsChannel.send({ embeds: [logEmbed], components: [actionRow] });
  return { success: true, discordMessage: `<@!${member.id}> has been kicked!`, message: `${member.user.username} has been kicked!` };
}




exports.banUser = async function (user, staff, reason, punishmentID, duration = null) {
    const guild = client.guilds.cache.get(config.GuildID);
    const guildData = await guildModel.findOne({ guildID: config.GuildID });
    
    let member = await guild.members.fetch(user.id);
    let staffUser = await guild.members.fetch(staff.id);
    
    if(!reason) reason = "No reason specified."
    
    const StaffMember = await staffModel.findOne({ userId: member.id });
    
    const hasPermission = await exports.checkPermission(staffUser.id, "BAN_USERS");
    if (!hasPermission) return { success: false, message: `Sorry, you don't have permissions to do this!` };
  
    if (member.id === staffUser.id) return { success: false, message: `You can't ban yourself!` };
    if (!member) return { success: false, message: `The user is not in the server!` };
    if (!member.bannable) return { success: false, message: `You can't ban this user!` };
    if (member.user.bot) return { success: false, message: `You can't ban a bot!` };
    if (StaffMember) return { success: false, message: `You can't ban a staff member!` };
    
    const actionLimitCheckResult = await exports.checkActionLimit(member, staffUser.id, "Ban");
    if (!actionLimitCheckResult.success) return { success: false, message: actionLimitCheckResult.message };
    
    const settings = await Settings.findOne() || {};


    const isTemporaryBan = duration !== null && duration !== 0;
    

    let expiresAt = null;
    let humanReadableDuration = '';
    if (isTemporaryBan) {
      expiresAt = new Date(Date.now() + duration);
      humanReadableDuration = formatDuration(duration);
    }
    

    const banTypeDisplay = isTemporaryBan ? `Temporary Ban` : 'Permanent Ban';
    
    const logEmbed = new EmbedBuilder()
      .setColor("#FF5252")
      .setAuthor({ 
        name: `${banTypeDisplay} • Moderation Action`, 
        iconURL: 'https://i.imgur.com/jEKNGOe.png'
      }) 
      .addFields([
        { 
          name: '`📋` **Action Details**', 
          value: `> **User:** <@!${member.id}> \`${member.user.username}\`\n> **Staff:** <@!${staffUser.id}> \`${staffUser.user.username}\`\n> **Reason:** ${reason}` 
        }
      ])
      .setThumbnail(member.displayAvatarURL({ format: 'png', dynamic: true }))
      .setFooter({ 
        text: `Case #${guildData.totalActions} | ID: ${punishmentID}`, 
        iconURL: staffUser.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
      })
      .setTimestamp();
    

    if (isTemporaryBan) {
      logEmbed.addFields([
        { 
          name: '`⏱️` **Ban Information**', 
          value: `> **Duration:** ${humanReadableDuration}\n> **Expires:** <t:${Math.floor(expiresAt.getTime() / 1000)}:R>` 
        }
      ]);
    }

const viewProfileButton = new Discord.ButtonBuilder()
    .setStyle('Link')
    .setLabel('View User Profile')
    .setEmoji('👤')
    .setURL(`${config.baseURL}/view/${member.id}`);


const viewCaseButton = new Discord.ButtonBuilder()
    .setStyle('Link')
    .setLabel('View Case Details')
    .setEmoji('📋')
    .setURL(`${config.baseURL}/punishment/lookup/${punishmentID}`);


const actionRow = new Discord.ActionRowBuilder()
    .addComponents(viewProfileButton, viewCaseButton);
  
    const logsChannel = guild.channels.cache.get(config.Ban.LogsChannelID);
    if (logsChannel) {
      await logsChannel.send({ embeds: [logEmbed], components: [actionRow] });
    }
    

    if (config.Ban.DMUser.Enabled) {
      try {
        const embedSettings = config.Ban.DMUser.Embed;
        const dmEmbed = new EmbedBuilder();
        if (embedSettings.Author && embedSettings.AuthorIcon) dmEmbed.setAuthor({ name: embedSettings.Author, iconURL: embedSettings.AuthorIcon });
        if (embedSettings.Author && !embedSettings.AuthorIcon) dmEmbed.setAuthor({ name: embedSettings.Author });
        if (embedSettings.Color) dmEmbed.setColor(embedSettings.Color);
        

        let description = embedSettings.Description
          .replace('{guildName}', guild.name)
          .replace('{user}', `<@!${member.id}>`)
          .replace('{username}', member.user.username)
          .replace('{staff}', `<@!${staffUser.id}>`)
          .replace('{reason}', reason)
          .replace('{punishmentID}', punishmentID);
        
        if(config.description && embedSettings.Description) dmEmbed.setDescription(description);
  
        if (embedSettings.ThumbnailEnabled) {
          if (embedSettings.CustomThumbnail && embedSettings.CustomThumbnail !== '') {
            dmEmbed.setThumbnail(embedSettings.CustomThumbnail);
          } else {
            dmEmbed.setThumbnail(member.user.displayAvatarURL({ format: 'png', dynamic: true }));
          }
        }
  
        dmEmbed.addFields(embedSettings.Fields.map(field => ({
          name: field.name,
          value: field.value
            .replace('{guildName}', guild.name)
            .replace('{user}', `<@!${member.id}>`)
            .replace('{username}', member.user.username)
            .replace('{staff}', `<@!${staffUser.id}>`)
            .replace('{reason}', reason)
            .replace('{punishmentID}', punishmentID),
        })));
  
        if (embedSettings.Timestamp) {
          dmEmbed.setTimestamp();
        }
  
        if (isTemporaryBan && embedSettings.TemporaryBan && embedSettings.TemporaryBan.Enabled) {
          const expiresTimestamp = Math.floor(expiresAt.getTime() / 1000);
          
          embedSettings.TemporaryBan.Fields.forEach(field => {
            dmEmbed.addFields([{
              name: field.name,
              value: field.value
                .replace('{duration}', humanReadableDuration)
                .replace('{expiresAt}', `<t:${expiresTimestamp}:R>`)
                .replace('{expiresDate}', `<t:${expiresTimestamp}:F>`)
                .replace('{guildName}', guild.name)
                .replace('{user}', `<@!${member.id}>`)
                .replace('{username}', member.user.username)
                .replace('{staff}', `<@!${staffUser.id}>`)
                .replace('{reason}', reason)
                .replace('{punishmentID}', punishmentID)
            }]);
          });
        }
        

        if (embedSettings.Timestamp) {
          dmEmbed.setTimestamp();
        }


    const footerText = embedSettings.Footer.text
      .replace('{guildName}', guild.name)
      .replace('{username}', member.user.username)
      .replace('{reason}', reason)
      .replace('{punishmentID}', punishmentID);
    
    if (footerText.trim() !== '') {
      if (embedSettings.Footer.Enabled && embedSettings.Footer.CustomIconURL == '' && embedSettings.Footer.IconEnabled) {
        dmEmbed.setFooter({
          text: footerText,
          iconURL: member.user.displayAvatarURL({ format: 'png', dynamic: true }),
        });
      } else if (embedSettings.Footer.Enabled) {
        dmEmbed.setFooter({
          text: footerText,
        });
      }
      
      if (footerText.trim() !== '' && embedSettings.Footer.CustomIconURL !== '' && embedSettings.Footer.IconEnabled) {
        dmEmbed.setFooter({
          text: footerText,
          iconURL: embedSettings.Footer.CustomIconURL,
        });
      }
    }
  
        const appealButton = new Discord.ButtonBuilder()
          .setStyle('Link')
          .setLabel('Appeal Punishment')
          .setURL(settings.customAppealLink || `${config.baseURL}/appeal/${punishmentID}`);
  
        const dmActionRow = new Discord.ActionRowBuilder().addComponents(appealButton);
  
        if (settings.appealEnabled && config.Ban.Appealable) await member.send({ embeds: [dmEmbed], components: [dmActionRow] });
        if (settings.appealEnabled && !config.Ban.Appealable) await member.send({ embeds: [dmEmbed] });
        if (!settings.appealEnabled) await member.send({ embeds: [dmEmbed] });
      } catch (e) {
        console.log('\x1b[33m%s\x1b[0m', "[INFO] I tried to DM a user, but their DM's are locked.");
      }
    }
    

    let userFromDB = await userModel.findOne({ userID: member.id });
    if (!userFromDB) await userModel.create({ userID: member.id });
  

    const punishmentType = isTemporaryBan ? 'TEMP_BAN' : 'PERM_BAN';
    const newPunishment = new punishmentModel({
      userID: member.id,
      username: member.user.username,
      punishment: punishmentType,
      punishmentID: punishmentID,
      reason: reason,
      staff: staffUser.id,
      staffUsername: staffUser.user.username,
      duration: isTemporaryBan ? humanReadableDuration : null,
      recentMessages: userFromDB?.messageHistory || [],
      expiresAt: isTemporaryBan ? expiresAt : null
    });
    await newPunishment.save();
  

    if (isTemporaryBan) {
      
      const newTempBan = new temporaryBanModel({
        userID: member.id,
        username: member.user.username,
        reason: reason,
        punishmentID: punishmentID,
        expiresAt: expiresAt,
        staff: staffUser.id,
        staffUsername: staffUser.user.username
      });
      await newTempBan.save();
    }
  

    guildData.totalActions = (guildData.totalActions || 0) + 1;
    guildData.totalBans = (guildData.totalBans || 0) + 1;
    await guildData.save();
  

    try {
      await member.ban({ reason: `[${staffUser.user.username}] ${reason}` });
      await StatsService.incrementStat(member.guild.id, 'bans');
    } catch (error) {
      console.error("Error banning member:", error);
      return { success: false, message: `Failed to ban user: ${error.message}` };
    }
  

    if (staffUser.id !== client.user.id && !config.FullAccessUsers.includes(staffUser.id)) {
      let guildOwner = await guild.fetchOwner();
      if (guildOwner.id !== staffUser.id) {
        const UserStaffMember = await staffModel.findOne({ userId: staffUser.id }).populate('role');
        
        if (UserStaffMember && UserStaffMember.role && 
            UserStaffMember.role.actionLimits && 
            UserStaffMember.role.actionLimits.Enabled) {
          
          const timePeriodMilliseconds = parseDuration(UserStaffMember.role.actionLimits.Limits.TimePeriod);
          
          const currentTime = new Date();
          const timeDiff = currentTime - new Date(UserStaffMember.actionLimits.Ban.lastActionTimestamp);
          
          if (timeDiff >= timePeriodMilliseconds) {
            UserStaffMember.actionLimits.Ban.actionsWithinTimePeriod = 0;
          }
          
          UserStaffMember.actionLimits.Ban.actionsWithinTimePeriod += 1;
          UserStaffMember.actionLimits.Ban.lastActionTimestamp = new Date();
          
          await UserStaffMember.save();
        }
      }
    }
    
    return { success: true, discordMessage: `<@!${member.id}> has been banned!`, message: `${member.user.username} has been banned!` };
  };
  

  function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    
    if (months > 0) {
      return `${months} month${months > 1 ? 's' : ''}`;
    } else if (weeks > 0) {
      return `${weeks} week${weeks > 1 ? 's' : ''}`;
    } else if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      return `${seconds} second${seconds > 1 ? 's' : ''}`;
    }
  }



  exports.timeoutUser = async function (user, staff, reason, time, punishmentID) {
    try {
      const guild = client.guilds.cache.get(config.GuildID);
      const guildData = await guildModel.findOne({ guildID: config.GuildID });
      
      let member = await guild.members.fetch(user.id);
      let staffUser = await guild.members.fetch(staff.id);
      
      if(!reason) reason = "No reason specified.";
      
      const StaffMember = await staffModel.findOne({ userId: member.id });
      
      const hasPermission = await exports.checkPermission(staffUser.id, "TIMEOUT_USERS");
      if (!hasPermission) return { success: false, message: `Sorry, you don't have permissions to do this!` };
      
      if (member.id === staffUser.id) return { success: false, message: `You can't timeout yourself!` };
      if (!member) return { success: false, message: `The user is not in the server!` };
      if (!member.moderatable) return { success: false, message: `You can't timeout this user!` };
      if (member.user.bot) return { success: false, message: `You can't timeout a bot!` };
      if (StaffMember) return { success: false, message: `You can't timeout a staff member!` };
      
      const actionLimitCheckResult = await exports.checkActionLimit(member, staffUser.id, "Timeout");
      if (!actionLimitCheckResult.success) return { success: false, message: actionLimitCheckResult.message };
      
      const settings = await Settings.findOne() || {};


      const timeInMs = parseDuration(time);
      if (!timeInMs) {
        return { success: false, message: `Please specify a valid time! For example: 1d, 1h, 1m` };
      }
      
      if (timeInMs < 10000 || timeInMs > 2419200000) {
        return { success: false, message: `Timeout can't be shorter than 10 seconds and longer than 28 days!` };
      }
      
      const currentTime = Date.now();
      const expirationTimestamp = Math.floor((currentTime + timeInMs) / 1000);



      const logEmbed = new EmbedBuilder()
      .setColor('#FFB74D')
      .setAuthor({ 
        name: `Timeout • Moderation Action`, 
        iconURL: 'https://i.imgur.com/ZsPn6pL.png'
      }) 
      .addFields([
        { 
          name: '`📋` **Action Details**', 
          value: `> **User:** <@!${member.id}> \`${member.user.username}\`\n> **Staff:** <@!${staffUser.id}> \`${staffUser.user.username}\`\n> **Reason:** ${reason}` 
        },
        { 
          name: '`⏱️` **Timeout Information**', 
          value: `> **Duration:** ${time}\n> **Expires:** <t:${expirationTimestamp}:R>` 
        }
      ])
      .setThumbnail(member.displayAvatarURL({ format: 'png', dynamic: true }))
      .setFooter({ 
        text: `Case #${guildData.totalActions} | ID: ${punishmentID}`, 
        iconURL: staffUser.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
      })
      .setTimestamp();
  
  const viewProfileButton = new Discord.ButtonBuilder()
      .setStyle('Link')
      .setLabel('View User Profile')
      .setEmoji('👤')
      .setURL(`${config.baseURL}/view/${member.id}`);
  

  const viewCaseButton = new Discord.ButtonBuilder()
      .setStyle('Link')
      .setLabel('View Case Details')
      .setEmoji('📋')
      .setURL(`${config.baseURL}/punishment/lookup/${punishmentID}`);
  

  const actionRow = new Discord.ActionRowBuilder()
      .addComponents(viewProfileButton, viewCaseButton);
      
      const logsChannel = guild.channels.cache.get(config.Timeout.LogsChannelID);
      

      if (config.Timeout.DMUser.Enabled) {
        try {
          const embedSettings = config.Timeout.DMUser.Embed;
          const dmEmbed = new EmbedBuilder();
          if (embedSettings.Author && embedSettings.AuthorIcon) dmEmbed.setAuthor({ name: embedSettings.Author, iconURL: embedSettings.AuthorIcon });
          if (embedSettings.Author && !embedSettings.AuthorIcon) dmEmbed.setAuthor({ name: embedSettings.Author });
          if (embedSettings.Color) dmEmbed.setColor(embedSettings.Color);
          if (embedSettings.Description) dmEmbed.setDescription(embedSettings.Description.replace('{guildName}', guild.name)
            .replace('{user}', `<@!${member.id}>`)
            .replace('{username}', user.username)
            .replace('{staff}', `<@!${staffUser.id}>`)
            .replace('{reason}', reason)
            .replace('{punishmentID}', punishmentID)
            .replace('{time}', time)
            .replace('{expires}', `<t:${expirationTimestamp}:R> *(<t:${expirationTimestamp}:F>)*`));
          
          if (embedSettings.ThumbnailEnabled) {
            if (embedSettings.CustomThumbnail && embedSettings.CustomThumbnail !== '') {
              dmEmbed.setThumbnail(embedSettings.CustomThumbnail);
            } else {
              dmEmbed.setThumbnail(user.displayAvatarURL({ format: 'png', dynamic: true }));
            }
          }
          
          dmEmbed.addFields(embedSettings.Fields.map(field => ({
            name: field.name,
            value: field.value.replace('{guildName}', guild.name)
              .replace('{user}', `<@!${member.id}>`)
              .replace('{username}', user.username)
              .replace('{staff}', `<@!${staffUser.id}>`)
              .replace('{reason}', reason)
              .replace('{time}', time)
              .replace('{expires}', `<t:${expirationTimestamp}:R> *(<t:${expirationTimestamp}:F>)*`)
              .replace('{punishmentID}', punishmentID),
          })));
          
          if (embedSettings.Timestamp) {
            dmEmbed.setTimestamp();
          }
          
          const footerText = embedSettings.Footer.text.replace('{guildName}', guild.name)
            .replace('{username}', user.username)
            .replace('{reason}', reason)
            .replace('{punishmentID}', punishmentID);
          

          if (footerText.trim() !== '') {
            if (embedSettings.Footer.Enabled && embedSettings.Footer.CustomIconURL == '' && embedSettings.Footer.IconEnabled) {
              dmEmbed.setFooter({
                text: footerText,
                iconURL: user.displayAvatarURL({ format: 'png', dynamic: true }),
              });
            } else {
              dmEmbed.setFooter({
                text: footerText,
              });
            }
          }
          

          if (footerText.trim() !== '' && embedSettings.Footer.CustomIconURL !== '' && embedSettings.Footer.IconEnabled) {
            dmEmbed.setFooter({
              text: footerText,
              iconURL: embedSettings.Footer.CustomIconURL,
            });
          }
          
          const appealButton = new Discord.ButtonBuilder()
            .setStyle('Link')
            .setLabel('Appeal Punishment')
            .setURL(settings.customAppealLink || `${config.baseURL}/appeal/${punishmentID}`);
          
          const dmActionRow = new Discord.ActionRowBuilder().addComponents(appealButton);
          
          if (settings.appealEnabled && config.Timeout.Appealable) await member.send({ embeds: [dmEmbed], components: [dmActionRow] });
          if (settings.appealEnabled && !config.Timeout.Appealable) await member.send({ embeds: [dmEmbed] });
          if (!settings.appealEnabled) await member.send({ embeds: [dmEmbed] });
        } catch (e) {
          console.log('\x1b[33m%s\x1b[0m', "[INFO] I tried to DM a user, but their DM's are locked.");
        }
      }
      

      let userFromDB = await userModel.findOne({ userID: user.id });
      if (!userFromDB) await userModel.create({ userID: user.id });


      const newPunishment = new punishmentModel({
        userID: user.id,
        username: user.username,
        punishment: 'Timeout',
        punishmentID: punishmentID,
        reason: reason,
        staff: staffUser.id,
        staffUsername: staffUser.user.username,
        duration: formatDuration(timeInMs),
        recentMessages: userFromDB?.messageHistory || []
      });
      await newPunishment.save();
      

      guildData.totalActions = (guildData.totalActions || 0) + 1;
      guildData.totalTimeouts = (guildData.totalTimeouts || 0) + 1;
      await guildData.save();
      
      

      try {
        await member.timeout(timeInMs, `[${staffUser.username}] ${reason}`);
        await StatsService.incrementStat(guild.id, 'timeouts');
      } catch (error) {
        console.error("Error timing out member:", error);
        return { success: false, message: `Failed to timeout user: ${error.message}` };
      }
      

      if (staffUser.id !== client.user.id && !config.FullAccessUsers.includes(staffUser.id)) {
        let guildOwner = await guild.fetchOwner();
        if (guildOwner.id !== staffUser.id) {
          // Fetch staff member with populated role
          const UserStaffMember = await staffModel.findOne({ userId: staffUser.id }).populate('role');
          
          if (UserStaffMember && UserStaffMember.role && 
              UserStaffMember.role.actionLimits && 
              UserStaffMember.role.actionLimits.Enabled) {
            
            const timePeriodMilliseconds = parseDuration(UserStaffMember.role.actionLimits.Limits.TimePeriod);
            
            const currentTime = new Date();
            const timeDiff = currentTime - new Date(UserStaffMember.actionLimits.Timeout.lastActionTimestamp);
            
            if (timeDiff >= timePeriodMilliseconds) {
              UserStaffMember.actionLimits.Timeout.actionsWithinTimePeriod = 0;
            }
            
            UserStaffMember.actionLimits.Timeout.actionsWithinTimePeriod += 1;
            UserStaffMember.actionLimits.Timeout.lastActionTimestamp = new Date();
            
            await UserStaffMember.save();
          }
        }
      }
      

      if (logsChannel) logsChannel.send({ embeds: [logEmbed], components: [actionRow] });
      
      return { 
        success: true, 
        discordMessage: `<@!${member.id}> has been timed out for ${time}!`, 
        message: `${user.username} has been timed out for ${time}!` 
      };
    } catch (error) {
      console.error("Error in timeoutUser function:", error);
      return { success: false, message: `An error occurred: ${error.message}` };
    }
  }


  exports.warnUser = async function (user, staff, reason, punishmentID) {
    const guild = client.guilds.cache.get(config.GuildID);
    const guildData = await guildModel.findOne({ guildID: config.GuildID });
    
    let member = await guild.members.fetch(user.id);
    let staffUser = await guild.members.fetch(staff.id);
    
    if(!reason) reason = "No reason specified."
    
    const StaffMember = await staffModel.findOne({ userId: member.id });
    
    const hasPermission = await exports.checkPermission(staffUser.id, "WARN_USERS");
    if (!hasPermission) return { success: false, message: `Sorry, you don't have permissions to do this!` };

    if (member.id === staffUser.id) return { success: false, message: `You can't warn yourself!` };
    if (!member) return { success: false, message: `The user is not in the server!` };
    if (member.user.bot) return { success: false, message: `You can't warn a bot!` };
    if (StaffMember) return { success: false, message: `You can't warn a staff member!` };

    const actionLimitCheckResult = await exports.checkActionLimit(member, staffUser.id, "Warn");
    if (!actionLimitCheckResult.success) return { success: false, message: actionLimitCheckResult.message };
    
    const settings = await Settings.findOne() || {};

    const logEmbed = new EmbedBuilder()
    .setColor('#FFEB3B')
    .setAuthor({ 
      name: `Warning • Moderation Action`, 
      iconURL: 'https://i.imgur.com/SoEFOgk.png'
    }) 
    .addFields([
      { 
        name: '`📋` **Action Details**', 
        value: `> **User:** <@!${member.id}> \`${member.user.username}\`\n> **Staff:** <@!${staffUser.id}> \`${staffUser.user.username}\`\n> **Reason:** ${reason}` 
      }
    ])
    .setThumbnail(member.displayAvatarURL({ format: 'png', dynamic: true }))
    .setFooter({ 
      text: `Case #${guildData.totalActions} | ID: ${punishmentID}`, 
      iconURL: staffUser.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
    })
    .setTimestamp();

const viewProfileButton = new Discord.ButtonBuilder()
    .setStyle('Link')
    .setLabel('View User Profile')
    .setEmoji('👤')
    .setURL(`${config.baseURL}/view/${member.id}`);


const viewCaseButton = new Discord.ButtonBuilder()
    .setStyle('Link')
    .setLabel('View Case Details')
    .setEmoji('📋')
    .setURL(`${config.baseURL}/punishment/lookup/${punishmentID}`);


const actionRow = new Discord.ActionRowBuilder()
    .addComponents(viewProfileButton, viewCaseButton);

  
    const logsChannel = guild.channels.cache.get(config.Warn.LogsChannelID);
    

        if (config.Warn.DMUser.Enabled) {
          try {
              const embedSettings = config.Warn.DMUser.Embed;
              const dmEmbed = new EmbedBuilder();
              if (embedSettings.Author && embedSettings.AuthorIcon) dmEmbed.setAuthor({ name: embedSettings.Author, iconURL: embedSettings.AuthorIcon });
              if (embedSettings.Author && !embedSettings.AuthorIcon) dmEmbed.setAuthor({ name: embedSettings.Author });
              if (embedSettings.Color) dmEmbed.setColor(embedSettings.Color);
              if (embedSettings.Description) dmEmbed.setDescription(embedSettings.Description.replace('{guildName}', guild.name)
                  .replace('{user}', `<@!${member.id}>`)
                  .replace('{username}', member.user.username)
                  .replace('{staff}', `<@!${staffUser.id}>`)
                  .replace('{reason}', reason)
                  .replace('{punishmentID}', punishmentID));
    
              if (embedSettings.ThumbnailEnabled) {
                  if (embedSettings.CustomThumbnail && embedSettings.CustomThumbnail !== '') {
                      dmEmbed.setThumbnail(embedSettings.CustomThumbnail);
                  } else {
                      dmEmbed.setThumbnail(member.user.displayAvatarURL({ format: 'png', dynamic: true }));
                  }
              }
    
              dmEmbed.addFields(embedSettings.Fields.map(field => ({
                  name: field.name,
                  value: field.value.replace('{guildName}', guild.name)
                      .replace('{user}', `<@!${member.id}>`)
                      .replace('{username}', member.user.username)
                      .replace('{staff}', `<@!${staffUser.id}>`)
                      .replace('{reason}', reason)
                      .replace('{punishmentID}', punishmentID),
              })));
    
              if (embedSettings.Timestamp) {
                  dmEmbed.setTimestamp();
              }
    
              const footerText = embedSettings.Footer.text.replace('{guildName}', guild.name)
                  .replace('{username}', member.user.username)
                  .replace('{reason}', reason)
                  .replace('{punishmentID}', punishmentID);
    

              if (footerText.trim() !== '') {
                  if (embedSettings.Footer.Enabled && embedSettings.Footer.CustomIconURL == '' && embedSettings.Footer.IconEnabled) {
                      dmEmbed.setFooter({
                          text: footerText,
                          iconURL: member.user.displayAvatarURL({ format: 'png', dynamic: true }),
                      });
                  } else {
                      dmEmbed.setFooter({
                          text: footerText,
                      });
                  }
              }
    

              if (footerText.trim() !== '' && embedSettings.Footer.CustomIconURL !== '' && embedSettings.Footer.IconEnabled) {
                  dmEmbed.setFooter({
                      text: footerText,
                      iconURL: embedSettings.Footer.CustomIconURL,
                  });
              }
    
              const appealButton = new Discord.ButtonBuilder()
              .setStyle('Link')
              .setLabel('Appeal Punishment')
              .setURL(settings.customAppealLink || `${config.baseURL}/appeal/${punishmentID}`);
  
              const actionRow = new Discord.ActionRowBuilder().addComponents(appealButton); 
  
              if(settings.appealEnabled && config.Warn.Appealable) await member.send({ embeds: [dmEmbed], components: [actionRow] });
              if(settings.appealEnabled && !config.Warn.Appealable) await member.send({ embeds: [dmEmbed] });
              if(!settings.appealEnabled) await member.send({ embeds: [dmEmbed] });
          } catch (e) {
              console.log('\x1b[33m%s\x1b[0m', "[INFO] I tried to DM a user, but their DM's are locked.");
          }
      }
    
      let userFromDB = await userModel.findOne({ userID: member.id });
      if(!userFromDB) await userModel.create({ userID: member.id });

      const newPunishment = new punishmentModel({
          userID: member.id,
          username: member.user.username,
          punishment: 'Warn',
          punishmentID: punishmentID,
          reason: reason,
          staff: staffUser.id,
          staffUsername: staffUser.user.username,
          recentMessages: userFromDB?.messageHistory || []
      });
      await newPunishment.save();
  
      const totalWarnings = await punishmentModel.countDocuments({ userID: member.id, punishment: 'Warn' });

      guildData.totalActions = (guildData.totalActions || 0) + 1;
      guildData.totalWarns = (guildData.totalWarns || 0) + 1;
      await guildData.save();
  

      if (staffUser.id !== client.user.id && !config.FullAccessUsers.includes(staffUser.id)) {
        let guildOwner = await guild.fetchOwner();
        if (guildOwner.id !== staffUser.id) {
          const UserStaffMember = await staffModel.findOne({ userId: staffUser.id }).populate('role');
          
          if (UserStaffMember && UserStaffMember.role && 
              UserStaffMember.role.actionLimits && 
              UserStaffMember.role.actionLimits.Enabled) {
            
            const timePeriodMilliseconds = parseDuration(UserStaffMember.role.actionLimits.Limits.TimePeriod);
            
            const currentTime = new Date();
            const timeDiff = currentTime - new Date(UserStaffMember.actionLimits.Warn.lastActionTimestamp);
            
            if (timeDiff >= timePeriodMilliseconds) {
              UserStaffMember.actionLimits.Warn.actionsWithinTimePeriod = 0;
            }
            
            UserStaffMember.actionLimits.Warn.actionsWithinTimePeriod += 1;
            UserStaffMember.actionLimits.Warn.lastActionTimestamp = new Date();
            
            await UserStaffMember.save();
          }
        }
      }


    await StatsService.incrementStat(member.guild.id, 'warns');

    if (logsChannel) logsChannel.send({ embeds: [logEmbed], components: [actionRow] });
    return { 
      success: true, 
      discordMessage: `<@!${member.id}> has been warned! They now have ${totalWarnings} warning(s)`, 
      message: `${member.user.username} has been warned! They now have ${totalWarnings} warning(s)`,
      totalWarnings
  };
    }


    exports.dmUser = async function (user, staff, message) {
        const guild = client.guilds.cache.get(config.GuildID);
        const guildData = await guildModel.findOne({ guildID: config.GuildID });
        
        let member = await guild.members.fetch(user.id);
        let staffUser = await guild.members.fetch(staff.id);
        
        const StaffMember = await staffModel.findOne({ userId: member.id });
        
        const hasPermission = await exports.checkPermission(staffUser.id, "DM_USERS");
        if (!hasPermission) return { success: false, message: `Sorry, you don't have permissions to do this!` };
    
        if (member.id === staffUser.id) return { success: false, message: `You can't dm yourself!` };
        if (!member) return { success: false, message: `The user is not in the server!` };
        if (member.user.bot) return { success: false, message: `You can't DM a bot!` };
        if (StaffMember) return { success: false, message: `You can't DM a staff member!` };
        
        const logEmbed = new EmbedBuilder()
        .setColor('#2196F3')
        .setAuthor({ 
          name: `DM User • Moderation Action`, 
          iconURL: 'https://i.imgur.com/SmAcN8B.png'
        }) 
        .addFields([
          { 
            name: '`📋` **Action Details**', 
            value: `> **User:** <@!${member.id}> \`${member.user.username}\`\n> **Staff:** <@!${staffUser.id}> \`${staffUser.user.username}\`\n> **Message:** ${message}` 
          }
        ])
        .setThumbnail(member.displayAvatarURL({ format: 'png', dynamic: true }))
        .setFooter({ 
          text: `Case #${guildData.totalActions}`, 
          iconURL: staffUser.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
        })
        .setTimestamp();
      
        const viewProfileButton = new Discord.ButtonBuilder()
        .setStyle('Link')
        .setLabel('View User Profile')
        .setEmoji('👤')
        .setURL(`${config.baseURL}/view/${member.id}`);
      
            const actionRow = new Discord.ActionRowBuilder().addComponents(viewProfileButton);
            const logsChannel = guild.channels.cache.get(config.Warn.LogsChannelID);
        

              try {
                  await member.send({ content: `${message}` });
              } catch (e) {
                  console.log('\x1b[33m%s\x1b[0m', "[INFO] I tried to DM a user, but their DM's are locked.");
                  return { success: false, message: `You can't DM this user because they have direct messages disabled!` };
              }
    
          guildData.totalActions = (guildData.totalActions || 0) + 1;
          await guildData.save();
    
        if (logsChannel) logsChannel.send({ embeds: [logEmbed], components: [actionRow] });
        return { success: true, message: `Successfully sent a direct message to ${member.user.username}` };
        }



  exports.setNote = async function (user, staff, noteText) {
    const guild = client.guilds.cache.get(config.GuildID);
    const guildData = await guildModel.findOne({ guildID: config.GuildID });
    
    let member = await guild.members.fetch(user.id);
    let staffUser = await guild.members.fetch(staff.id);
    
    const StaffMember = await staffModel.findOne({ userId: member.id });
    
    const hasPermission = await exports.checkPermission(staffUser.id, "SET_NOTES");
    if (!hasPermission) return { success: false, message: `Sorry, you don't have permissions to do this!` };

    if (member.id === staffUser.id) return { success: false, message: `You can't set a note for yourself!` };
    if (!member) return { success: false, message: `The user is not in the server!` };
    if (member.user.bot) return { success: false, message: `You can't set a note on a bot!` };
    if (StaffMember) return { success: false, message: `You can't set a note on a staff member!` };
    if (noteText.length > 1024) return { success: false, message: `Note text cannot exceed 1024 characters!` };
    
    const logEmbed = new EmbedBuilder()
    .setColor('#4CAF50')
    .setAuthor({ 
      name: `Note • Moderation Action`, 
      iconURL: 'https://i.imgur.com/HS6c4tS.png'
    }) 
    .addFields([
      { 
        name: '`📋` **Action Details**', 
        value: `> **User:** <@!${member.id}> \`${member.user.username}\`\n> **Staff:** <@!${staffUser.id}> \`${staffUser.user.username}\`\n> **Note:** ${noteText}` 
      }
    ])
    .setThumbnail(member.displayAvatarURL({ format: 'png', dynamic: true }))
    .setFooter({ 
      text: `Case #${guildData.totalActions}`, 
      iconURL: staffUser.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
    })
    .setTimestamp();
    
    const logsChannel = guild.channels.cache.get(config.Note.LogsChannelID);
    
      let userData = await userModel.findOne({ userID: member.id });
      if (!userData) userData = new userModel({ userID: member.id });

      userData.note = noteText;
      await userData.save();

      guildData.totalActions = (guildData.totalActions || 0) + 1;
      await guildData.save();

      let truncatedNoteText = noteText.length > 400 ? noteText.substring(0, 400) + '...' : noteText;

      if (logsChannel) logsChannel.send({ embeds: [logEmbed] });
      return { success: true, discordMessage: `<@!${member.id}>'s note has been set to \`${truncatedNoteText}\`!`, message: `${member.user.username}'s note has been set to ${noteText}!` };
    }



const relayEvents = (client) => {
    const eventsToRelay = [
      'messageCreate',
      'messageDelete',
      'messageDeleteBulk',
      'messageReactionAdd',
      'messageReactionRemove',
      'messageReactionRemoveAll',
      'messageUpdate',
      'channelCreate',
      'channelDelete',
      'channelPinsUpdate',
      'channelUpdate',
      'guildBanAdd',
      'guildBanRemove',
      'guildCreate',
      'guildDelete',
      'guildEmojiCreate',
      'guildEmojiDelete',
      'guildEmojiUpdate',
      'guildIntegrationsUpdate',
      'guildMemberAdd',
      'guildMemberRemove',
      'guildMemberUpdate',
      'guildRoleCreate',
      'guildRoleDelete',
      'guildRoleUpdate',
      'guildUpdate',
      'inviteCreate',
      'inviteDelete',
      'presenceUpdate',
      'threadCreate',
      'threadDelete',
      'threadListSync',
      'threadMembersUpdate',
      'threadUpdate',
      'typingStart',
      'userUpdate',
      'voiceStateUpdate',
      'webhookUpdate',
      'shardDisconnect',
      'shardError',
      'shardReady',
      'shardReconnecting',
      'shardResume',
      'stageInstanceCreate',
      'stageInstanceDelete',
      'stageInstanceUpdate',
      'ready',
      'warn',
      'debug',
      'error',
      'invalidRequestWarning',
      'rateLimit',
    ];
  
    eventsToRelay.forEach((eventName) => {
      client.on(eventName, (...args) => {
        eventHandler.emit(eventName, ...args);
      });
    });
  };


  client.login(config.Token).then(() => {
    relayEvents(client);
  }).catch((error) => {
    if (error.message.includes('Used disallowed intents')) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        `Used disallowed intents (READ HOW TO FIX): \n\nYou did not enable Privileged Gateway Intents in the Discord Developer Portal!
  To fix this, you have to enable all the privileged gateway intents in your Discord Developer Portal. Open the portal, go to your application, click on "Bot" on the left side, scroll down, and enable Presence Intent, Server Members Intent, and Message Content Intent.`
      );
      process.exit();
    } else if (error.message.includes('An invalid token was provided')) {
      console.log('\x1b[31m%s\x1b[0m', `[ERROR] The bot token specified in the config is incorrect!`);
      process.exit();
    } else {
      console.log('\x1b[31m%s\x1b[0m', `[ERROR] An error occurred while attempting to log in to the bot`);
      console.log(error);
      process.exit();
    }
  });
  
