const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require("discord.js");
const fs = require('fs');
const yaml = require("js-yaml");
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const utils = require("../utils.js");
const staffModel = require('../models/staffModel');
const guildModel = require('../models/guildModel');
const userModel = require("../models/userModel");
const punishmentModel = require('../models/punishmentModel');
const parseDuration = require('parse-duration');
const StatsService = require('../statsService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription("Timeout a user")
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a timeout for a user')
                .addUserOption(option => option.setName('user').setDescription('The user to timeout').setRequired(true))
                .addStringOption(option => option.setName('time').setDescription('How long the user should be timed out, for example: 1d, 1h, 1m').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('The reason for timeout').setRequired(config.Timeout.RequireReason))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear the timeout of a user')
                .addUserOption(option => option.setName('user').setDescription('The user to clear timeout').setRequired(true))
        ),
    async execute(interaction, client) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

        const errorEmbed = new Discord.EmbedBuilder()
        .setColor('#ED4245')
        .setTimestamp();

        const hasPermission = await utils.checkPermission(interaction.user.id, "TIMEOUT_USERS");
        if (!hasPermission) {
            errorEmbed.setTitle('Failed to timeout');
            errorEmbed.setDescription(`Sorry, you don't have permissions to do this!`);
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        const guildData = await guildModel.findOne({ guildID: config.GuildID });

        if (interaction.options.getSubcommand() === 'set') {
            const user = interaction.options.getUser("user");
            const reason = interaction.options.getString("reason") || "No reason specified.";
            const time = interaction.options.getString("time");
            const member = await interaction.guild.members.fetch(user.id);

            const durationMs = parseDuration(time);
            if (!durationMs || durationMs <= 0) {
                errorEmbed.setTitle('Invalid Duration Format')
                    .setDescription('Please use a valid duration format such as `1d`, `12h`, or `30m`.')
                    .setFooter({ 
                        text: `${interaction.user.username}`, 
                        iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                    });
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            function formatDuration(ms) {
                const seconds = Math.floor(ms / 1000);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                const days = Math.floor(hours / 24);
                const weeks = Math.floor(days / 7);
                
                if (weeks > 0) {
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

        const humanReadableDuration = formatDuration(durationMs);
            
        const expiresAt = new Date(Date.now() + durationMs);
        const expirationTimestamp = Math.floor(expiresAt.getTime() / 1000);

        let punishmentID = await utils.generatePunishmentID();

        const errorEmbed = new Discord.EmbedBuilder();
        errorEmbed.setColor('#ED4245');
        errorEmbed.setTimestamp();

        const { success, message, discordMessage } = await utils.timeoutUser(user, interaction.user, reason, time, punishmentID);


        if (success) {
            const successEmbed = new Discord.EmbedBuilder()
            .setColor('#FFB74D')
            .setAuthor({ 
                name: `Timeout • Action Successful`, 
                iconURL: 'https://i.imgur.com/ZsPn6pL.png'
            })
            .addFields([
                { 
                    name: '`✅` **Confirmation**', 
                    value: `> **User:** <@!${user.id}> \`${user.id}\`\n> **Reason:** ${reason}\n> **Duration:** ${humanReadableDuration}\n> **Case ID:** \`${punishmentID}\`` 
                },
                { 
                    name: '`⏱️` **Timeout Information**', 
                    value: `> **Expires:** <t:${expirationTimestamp}:R> (<t:${expirationTimestamp}:F>)` 
                }
            ])
            .setFooter({ 
                text: `${interaction.user.username}`, 
                iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
            })
            .setTimestamp();
            
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
            errorEmbed.setTitle('Failed to timeout');
            errorEmbed.setDescription(message);
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        } else if (interaction.options.getSubcommand() === 'clear') {
            const user = interaction.options.getUser("user");
            const member = await interaction.guild.members.fetch(user.id);

            if (member.communicationDisabledUntilTimestamp) {
                member.timeout(null, "Timeout cleared").catch(error =>  console.log(error));
                interaction.editReply({ content: `Timeout for ${user} has been cleared`, flags: Discord.MessageFlags.Ephemeral });

                guildData.totalActions = (guildData.totalActions || 0) + 1;
                await guildData.save();

            } else {
                interaction.editReply({ content: `There is no timeout set for ${user}`, flags: Discord.MessageFlags.Ephemeral });
            }
        }
    }
};
