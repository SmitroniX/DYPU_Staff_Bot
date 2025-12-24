const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, SelectMenuBuilder, Message, AttachmentBuilder } = require("discord.js");
const Discord = require("discord.js");
const fs = require('fs');
const yaml = require("js-yaml");
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const guildModel = require('../models/guildModel');
const userModel = require('../models/userModel');
const dashboardModel = require("../models/dashboardModel");
const color = require('ansi-colors');
const { eventHandler } = require('../utils.js');
const crypto = require('crypto');

module.exports = async (client, interaction) => {
    if(interaction.isChatInputCommand()) {
        const command = client.slashCommands.get(interaction.commandName);
        if (!command) return;
  
        try {
          await command.execute(interaction, client);
  
          let logMsg = `\n\n[${new Date().toLocaleString()}] [SLASH COMMAND] Command: ${interaction.commandName}, User: ${interaction.user.username}`;
          fs.appendFile("./logs.txt", logMsg, (e) => { 
            if(e) console.log(e);
          });
        
          if(config.LogCommands) console.log(`${color.yellow(`[SLASH COMMAND] ${color.cyan(`${interaction.user.username}`)} used ${color.cyan(`/${interaction.commandName}`)}`)}`);
          return
      } catch (error) {
          if (error) return console.error(error);
      }
  
      }
  
      let logMsg2 = `\n\n[${new Date().toLocaleString()}] [INTERACTION] ${interaction.customId}`;
      fs.appendFile("./logs.txt", logMsg2, (e) => { 
        if(e) console.log(e);
      });

    const { customId, user, member } = interaction;

    if (config.VerificationSettings.Enabled && customId === 'verifButton') {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral })

        // Check if user has a role listed in VerifiedRoleID
        const doesUserHaveRole = config.VerificationSettings.VerifiedRoleID.some((roleId) => {
            const role = interaction.guild.roles.cache.get(roleId);
            return role && member.roles.cache.has(roleId);
        });

        if (doesUserHaveRole) return interaction.editReply({ content: config.VerificationMessages.alreadyVerified, flags: Discord.MessageFlags.Ephemeral });

        if (config.VerificationSettings.VerificationType === 'BUTTON') {
            const embed = new EmbedBuilder()
                .setTitle(config.VerificationMessages.successVerifyTitle)
                .setDescription(config.VerificationMessages.successVerify)
                .setColor("Green")

                await interaction.editReply({ embeds: [embed], flags: Discord.MessageFlags.Ephemeral });

            await config.VerificationSettings.VerifiedRoleID.forEach(async (roleId) => {
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) {
                    console.log('\x1b[31m%s\x1b[0m', `[ERROR] VerificationSettings.VerifiedRoleID is not a valid role!`);
                }
                if (role) await interaction.member.roles.add(role);
            });
        } else if (config.VerificationSettings.VerificationType === 'CAPTCHA') {

            const token = crypto.randomBytes(32).toString('hex');
            const expiry = Date.now() + 2 * 60 * 60 * 1000;

            await userModel.updateOne(
                { userID: user.id },
                { 
                    $set: { 
                        verificationToken: token,
                        verificationTokenExpiry: expiry
                    }
                },
                { upsert: true }
            );

            const dashboardDB = await dashboardModel.findOne({ guildID: config.GuildID });

            // Generate the reCAPTCHA link with the unique token
            const recaptchaLink = `${dashboardDB.url}/verify?token=${token}`;

            let linkLocale = config.VerificationMessages.embedMsg.replace(/{link}/g, `${recaptchaLink}`);
            const embed = new EmbedBuilder()
                .setDescription(linkLocale)
                .setColor(config.EmbedColors)

            await interaction.editReply({ embeds: [embed], flags: Discord.MessageFlags.Ephemeral });
        }
    }

    eventHandler.emit('interactionCreate', interaction);
};
