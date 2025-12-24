const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require("discord.js");
const fs = require('fs');
const yaml = require("js-yaml");
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const utils = require("../utils.js");
const staffModel = require('../models/staffModel');
const punishmentModel = require('../models/punishmentModel');
const parseDuration = require('parse-duration');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription("Ban a user from the server")
        .addUserOption(option => option.setName('user').setDescription('The user to ban').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for ban').setRequired(config.Ban.RequireReason))
        .addStringOption(option => option.setName('duration').setDescription('Duration of temporary ban (e.g., 1d, 7d, 2h, 30m). Leave empty for permanent ban')),
    
    async execute(interaction, client) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason");
        const duration = interaction.options.getString("duration");

        let durationMs = null;
        let formattedDuration = '';
        let humanReadableDuration = 'Permanent';
        
        if (duration) {
            durationMs = parseDuration(duration);
            if (!durationMs || durationMs <= 0) {
                const errorEmbed = new Discord.EmbedBuilder()
                    .setColor('#ED4245')
                    .setTitle('Invalid Duration Format')
                    .setDescription('Please use a valid duration format such as `1d`, `7d`, `2h`, or `30m`.')
                    .setTimestamp();
                return interaction.editReply({ embeds: [errorEmbed] });
            }
            formattedDuration = ` for ${duration}`;
            humanReadableDuration = duration;
        }

        let punishmentID = await utils.generatePunishmentID();

        const errorEmbed = new Discord.EmbedBuilder();
        errorEmbed.setColor('#ED4245');
        errorEmbed.setTimestamp();

        const { success, message, discordMessage } = await utils.banUser(user, interaction.user, reason, punishmentID, durationMs);

        const isTempBan = durationMs !== null;

        if (success) {
            const successEmbed = new Discord.EmbedBuilder()
                .setColor('#FF5252')
                .setAuthor({ 
                    name: `${isTempBan ? 'Temporary Ban' : 'Ban'} • Action Successful`, 
                    iconURL: 'https://i.imgur.com/jEKNGOe.png'
                })
                .addFields([
                    { 
                        name: '`✅` **Confirmation**', 
                        value: `> **User:** <@!${user.id}> \`${user.id}\`\n> **Reason:** ${reason}\n> **Duration:** ${humanReadableDuration}\n> **Case ID:** \`${punishmentID}\`` 
                    }
                ])
                .setFooter({ 
                    text: `${interaction.user.username}`, 
                    iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                })
                .setTimestamp();

            if (isTempBan) {
                const expiresAt = new Date(Date.now() + durationMs);
                const expirationTimestamp = Math.floor(expiresAt.getTime() / 1000);
                
                successEmbed.addFields([
                    {
                        name: '`⏱️` **Ban Information**',
                        value: `> **Expires:** <t:${expirationTimestamp}:R> (<t:${expirationTimestamp}:F>)`
                    }
                ]);
            }
            
            const viewProfileButton = new Discord.ButtonBuilder()
                .setStyle("Link")
                .setLabel('View User Profile')
                .setEmoji('👤')
                .setURL(`${config.baseURL}/view/${user.id}`);
            
            const viewCaseButton = new Discord.ButtonBuilder()
                .setStyle("Link")
                .setLabel('View Case Details')
                .setEmoji('📋')
                .setURL(`${config.baseURL}/punishment/lookup/${punishmentID}`);
            
            const actionRow = new Discord.ActionRowBuilder()
                .addComponents(viewProfileButton, viewCaseButton);
            
            await interaction.editReply({ 
                embeds: [successEmbed],
                components: [actionRow]
            });
        } else {
            errorEmbed.setTitle('Failed to ban');
            errorEmbed.setDescription(message);
            return interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};