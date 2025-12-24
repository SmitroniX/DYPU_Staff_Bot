const fs = require('fs');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const color = require('ansi-colors');
const botVersion = require('../package.json');
const utils = require("../utils.js");
const Discord = require("discord.js");
const mongoose = require("mongoose");
const guildModel = require('../models/guildModel');
const userModel = require('../models/userModel');
const CustomCommand = require('../models/customCommandsModel');
const AutoResponse = require('../models/autoResponsesModel');
const emojiRegex = require('emoji-regex');
const StatsService = require('../statsService');
const Settings = require('../models/settingsModel');

// Cache for auto response cooldowns
const cooldownCache = new Map();

// Cache for auto responses with 1 minute expiry
const autoResponseCache = new Map();
const AUTO_RESPONSE_CACHE_EXPIRY = 60 * 1000;

// Batch update system for auto response analytics
const pendingUpdates = new Map();
const UPDATE_INTERVAL = 60 * 1000;

// Command prefix cache
const prefixCache = new Map();
const PREFIX_CACHE_EXPIRY = 3 * 60 * 1000;

// batch update interval
setInterval(async () => {
  if (pendingUpdates.size === 0) return;
  
  const bulkOps = [];
  pendingUpdates.forEach((count, responseId) => {
    bulkOps.push({
      updateOne: {
        filter: { _id: responseId },
        update: { 
          $inc: { triggerCount: count },
          $set: { lastTriggered: new Date() }
        }
      }
    });
  });
  
  if (bulkOps.length > 0) {
    try {
      await AutoResponse.bulkWrite(bulkOps);
    } catch (error) {
      console.error('Error performing batch update for auto responses:', error);
    }
    pendingUpdates.clear();
  }
}, UPDATE_INTERVAL);

async function getAutoResponses(guildId) {
  const cachedResponses = autoResponseCache.get(guildId);
  if (cachedResponses) return cachedResponses;
  
  try {
    const responses = await AutoResponse.find({ guildID: guildId });
    
    autoResponseCache.set(guildId, responses);
    
    setTimeout(() => autoResponseCache.delete(guildId), AUTO_RESPONSE_CACHE_EXPIRY);
    
    return responses;
  } catch (error) {
    console.error('Error fetching auto responses:', error);
    return [];
  }
}

async function getCommandPrefix(guildId) {
  const cachedPrefix = prefixCache.get(guildId);
  if (cachedPrefix) return cachedPrefix;
  
  try {
    const settings = await Settings.findOne() || {};
    const prefix = settings.commandPrefix || '!';
    
    prefixCache.set(guildId, prefix);
    
    setTimeout(() => prefixCache.delete(guildId), PREFIX_CACHE_EXPIRY);
    
    return prefix;
  } catch (error) {
    console.error('Error fetching command prefix:', error);
    return '!';
  }
}

// Queue auto response update instead of updating immediately
function queueAutoResponseUpdate(responseId) {
  const current = pendingUpdates.get(responseId) || 0;
  pendingUpdates.set(responseId, current + 1);
}

module.exports = async (client, message) => {
    if (message.author.bot) return;
    if(!message.channel.type === 0) return;

    await StatsService.incrementStat(message.guild.id, 'messagesSent');

    try {
        let user = await userModel.findOne({ userID: message.author.id });
        let guildDB = await guildModel.findOne({ guildID: message.guild.id });

        if (!user) {
            user = await userModel.create({
                userID: message.author.id,
                totalMessages: 1,
                totalEmojisUsed: 0,
                messageHistory: [],
            });
        } else {
            user.totalMessages += 1;
        }

        await guildModel.findOneAndUpdate({ guildID: message.guild.id }, { $inc: { totalMessages: 1 } });

        if(config.GeneralSettings.SaveRecentMessages) {
            if (message.attachments.size > 0) {
                message.attachments.forEach(attachment => {
                    if (attachment.url) {
                        user.messageHistory.push({
                            channelName: message.channel.name,
                            message: attachment.url,
                            timestamp: message.createdAt,
                        });
                    }
                });
          } else if (message.content.trim()) {
            user.messageHistory.push({
                channelName: message.channel.name,
                message: message.content,
                timestamp: message.createdAt,
            });

        }

            const standardEmojisUsed = message.content.match(emojiRegex());
            if (standardEmojisUsed) {
                user.totalEmojisUsed += standardEmojisUsed.length;
            }

            const customEmojisUsed = message.content.match(/<:[a-zA-Z0-9_]+:[0-9]+>/g);
            if (customEmojisUsed) {
                user.totalEmojisUsed += customEmojisUsed.length;
            }

        if (user.messageHistory.length > config.GeneralSettings.RecentMessagesLimit) {
            const excessMessages = user.messageHistory.length - config.GeneralSettings.RecentMessagesLimit;
            user.messageHistory.splice(0, excessMessages);
        }

        await user.save();
        await guildDB.save();
      }
    } catch (error) {
        console.error('Error in messageCreate event:', error);
    }

    // Auto Moderation
    await Promise.all([
      utils.handleDiscordInvites(message, client),
      utils.handlePhishingLinks(message, client),
      utils.handleSpamProtection(message, client)
    ]);

    const prefix = await getCommandPrefix(message.guild.id);
    
    if (message.content.startsWith(prefix)) {
        try {
          const args = message.content.slice(prefix.length).trim().split(/ +/);
          const commandName = args.shift().toLowerCase();
          
          const command = await CustomCommand.findOne({ 
              guildID: message.guild.id,
              name: commandName 
          });
          
          if (!command) return;
          
          command.usageCount = (command.usageCount || 0) + 1;
          await command.save();
          
          let components = [];
          if (command.buttons && command.buttons.length > 0) {
              const row = new Discord.ActionRowBuilder();
              
              command.buttons.forEach(button => {
                  row.addComponents(
                      new Discord.ButtonBuilder()
                          .setLabel(button.label)
                          .setURL(button.url)
                          .setStyle("Link")
                  );
              });
              
              components.push(row);
          }
          
          const responseOptions = { components: components.length > 0 ? components : undefined };
          
          if (command.responseType === 'text') {
              responseOptions.content = command.textResponse;
          } else {
              const embed = new Discord.EmbedBuilder()
                  .setColor(command.embedResponse.color || config.EmbedColors || '#7060be');
              
              if (command.embedResponse.title) embed.setTitle(command.embedResponse.title);
              if (command.embedResponse.description) embed.setDescription(command.embedResponse.description);
              if (command.embedResponse.footer) embed.setFooter({ text: command.embedResponse.footer });
              if (command.embedResponse.timestamp) embed.setTimestamp();
              if (command.embedResponse.thumbnail) embed.setThumbnail(command.embedResponse.thumbnail);
              if (command.embedResponse.image) embed.setImage(command.embedResponse.image);
              
              responseOptions.embeds = [embed];
          }
          
          if (command.replyToUser) {
              await message.reply(responseOptions);
          } else {
              await message.channel.send(responseOptions);
          }
          
          if (command.deleteMessage && !command.replyToUser) {
                  await message.delete().catch(() => {});
          }
          
          return;
      } catch (error) {
          console.error('Error executing custom command:', error);
      }
    }

    // Auto Response Handler
    try {
      const autoResponses = await getAutoResponses(message.guild.id);

      if (!autoResponses || autoResponses.length === 0) return;

      for (const response of autoResponses) {
          if (!message.content || !response.settings.enabled) continue;

          const channelId = message.channel.id;
          const categoryId = message.channel.parentId;

          if (response.settings.blacklistedChannels.includes(channelId) || 
              response.settings.blacklistedCategories.includes(categoryId)) {
              continue;
          }

          if (response.settings.whitelistedChannels.length > 0 || response.settings.whitelistedCategories.length > 0) {
              const channelWhitelisted = response.settings.whitelistedChannels.includes(channelId);
              const categoryWhitelisted = categoryId && response.settings.whitelistedCategories.includes(categoryId);
              
              if (!channelWhitelisted && !categoryWhitelisted) {
                  continue;
              }
          }

          if (response.settings.cooldown > 0) {
              const cooldownKey = `${message.guild.id}-${response._id}`;
              const lastTriggered = cooldownCache.get(cooldownKey);
              
              if (lastTriggered) {
                  const cooldownTime = response.settings.cooldown * 1000;
                  const timeSinceLastTrigger = Date.now() - lastTriggered;
                  
                  if (timeSinceLastTrigger < cooldownTime) {
                      continue;
                  }
              }
          }

          let triggerMatched = false;
          const messageLower = message.content.toLowerCase();
          const triggerLower = response.trigger.toLowerCase();

          if (response.settings.exactMatch) {
              if (response.settings.caseSensitive) {
                  triggerMatched = message.content === response.trigger;
              } else {
                  triggerMatched = messageLower === triggerLower;
              }
          } else if (response.settings.wildcardMatching) {
              const escapedTrigger = response.trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const pattern = escapedTrigger.replace(/\\\*/g, '.*');
              const regexFlags = response.settings.caseSensitive ? '' : 'i';
              const regex = new RegExp(`^${pattern}$`, regexFlags);
              
              triggerMatched = regex.test(message.content);
          } else {
              if (response.settings.caseSensitive) {
                  triggerMatched = message.content.includes(response.trigger);
              } else {
                  triggerMatched = messageLower.includes(triggerLower);
              }
          }

          if (!triggerMatched) continue;

          if (response.settings.cooldown > 0) {
              const cooldownKey = `${message.guild.id}-${response._id}`;
              cooldownCache.set(cooldownKey, Date.now());
              
              setTimeout(() => {
                  if (cooldownCache.get(cooldownKey) <= Date.now()) {
                      cooldownCache.delete(cooldownKey);
                  }
              }, response.settings.cooldown * 1000 + 1000);
          }


          const processVariables = (text) => {
              if (!text) return text;
              
              return text
                  .replace(/{user}/g, `<@${message.author.id}>`)
                  .replace(/{username}/g, message.author.username)
                  .replace(/{userID}/g, message.author.id)
                  .replace(/{guildName}/g, message.guild.name)
                  .replace(/{channelName}/g, message.channel.name)
                  .replace(/{channelID}/g, message.channel.id)
                  .replace(/{initiator-message}/g, message.content);
          };

          const responseOptions = {};

          if (response.type === 'TEXT') {
              responseOptions.content = processVariables(response.message);
          } else if (response.type === 'EMBED' && response.embed) {
              const embed = new Discord.EmbedBuilder()
                  .setColor(response.embed.color || '#7060be');

              if (response.embed.title) {
                  embed.setTitle(processVariables(response.embed.title));
              }
              
              if (response.embed.description) {
                  embed.setDescription(processVariables(response.embed.description));
              }
              
              if (response.embed.footer) {
                  embed.setFooter({ text: processVariables(response.embed.footer) });
              }
              
              if (response.embed.timestamp) {
                  embed.setTimestamp();
              }

              responseOptions.embeds = [embed];
          }

          try {
              if (response.settings.replyToUser) {
                  await message.reply(responseOptions);
              } else {
                  await message.channel.send(responseOptions);
              }

              if (response.settings.deleteUserMessage && !response.settings.replyToUser) {
                  await message.delete().catch(() => {});
              }

              queueAutoResponseUpdate(response._id);

              break;
          } catch (error) {
              console.error(`Error sending auto response for trigger "${response.trigger}":`, error);
          }
      }
  } catch (error) {
      console.error('Error processing auto responses:', error);
  }
};