const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const Discord = require("discord.js");
const fs = require('fs');
const yaml = require("js-yaml");
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const utils = require("../utils.js");
const staffModel = require('../models/staffModel');
const punishmentModel = require('../models/punishmentModel');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription("Issue a warning for a user")
        .addUserOption(option => option.setName('user').setDescription('The user to warn').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for warning').setRequired(config.Warn.RequireReason)),
    async execute(interaction, client) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "No reason provided";
        const punishmentID = await utils.generatePunishmentID();

        const errorEmbed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTimestamp();

        const { success, message, discordMessage, totalWarnings } = await utils.warnUser(user, interaction.user, reason, punishmentID);

        if (success) {
            const successEmbed = new EmbedBuilder()
            .setColor('#FFEB3B')
            .setAuthor({ 
                name: `Warning • Action Successful`, 
                iconURL: 'https://i.imgur.com/SoEFOgk.png'
            })
            .addFields([
                { 
                    name: '`✅` **Confirmation**', 
                    value: `> **Target:** <@!${user.id}> \`${user.id}\`\n> **Reason:** ${reason}\n> **Case ID:** \`${punishmentID}\`` 
                }
            ])
            .setFooter({ 
                text: `Total Warnings: ${totalWarnings || 1}`, 
                iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
            })
            .setTimestamp();
            
            const viewProfileButton = new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('View User Profile')
                .setEmoji('👤')
                .setURL(`${config.baseURL}/view/${user.id}`);
            
            const viewCaseButton = new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('View Case Details')
                .setEmoji('📋')
                .setURL(`${config.baseURL}/punishment/lookup/${punishmentID}`);
            
            const actionRow = new ActionRowBuilder()
                .addComponents(viewProfileButton, viewCaseButton);
            
            await interaction.editReply({ 
                embeds: [successEmbed],
                components: [actionRow]
            });
        } else {
            errorEmbed.setTitle('Warning Failed')
                .setDescription(message);
            return interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};