const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require ("discord.js")
const fs = require('fs');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const utils = require("../utils.js");
const staffModel = require('../models/staffModel');
const punishmentModel = require('../models/punishmentModel');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription("Kick a user from the server")
        .addUserOption(option => option.setName('user').setDescription('The user to kick').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for kick').setRequired(config.Kick.RequireReason)),
    async execute(interaction, client) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason");

        let punishmentID = await utils.generatePunishmentID();

        const errorEmbed = new Discord.EmbedBuilder();
        errorEmbed.setColor('#ED4245');
        errorEmbed.setTimestamp();

        const { success, message, discordMessage } = await utils.kickUser(user, interaction.user, reason, punishmentID);

        if (success) {
            const successEmbed = new Discord.EmbedBuilder()
                .setColor('#FF9800')
                .setAuthor({ 
                    name: `Kick • Action Successful`, 
                    iconURL: 'https://i.imgur.com/HVtH27Y.png'
                })
                .addFields([
                    { 
                        name: '`✅` **Confirmation**', 
                        value: `> **User:** <@!${user.id}> \`${user.id}\`\n> **Reason:** ${reason}\n> **Case ID:** \`${punishmentID}\`` 
                    }
                ])
                .setFooter({ 
                    text: `${interaction.user.username}`, 
                    iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                })
                .setTimestamp();
            
            const viewProfileButton = new Discord.ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setStyle("Link")
                .setEmoji('👤')
                .setURL(`${config.baseURL}/view/${user.id}`);
            
            const viewCaseButton = new Discord.ButtonBuilder()
                .setStyle(ButtonStyle.Link)
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
            errorEmbed.setTitle('Failed to kick');
            errorEmbed.setDescription(message);
            return interaction.editReply({ embeds: [errorEmbed] });
        }
    }

}