const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require ("discord.js")
const fs = require('fs');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const utils = require("../utils.js");
const staffModel = require('../models/staffModel');
const userModel = require("../models/userModel");
const guildModel = require('../models/guildModel');

module.exports = {
    //enabled: commands.General.Ping.Enabled,
    data: new SlashCommandBuilder()
        .setName('note')
        .setDescription("Manage notes for a user")
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a note on a user')
                .addUserOption(option => option.setName('user').setDescription('The user to set the note on').setRequired(true))
                .addStringOption(option => option.setName('note').setDescription('The note to set on the user').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear the note of a user')
                .addUserOption(option => option.setName('user').setDescription('The user to clear note for').setRequired(true))
        ),
    async execute(interaction, client) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

        const guildData = await guildModel.findOne({ guildID: config.GuildID });

        const user = interaction.options.getUser("user");
        const noteText = interaction.options.getString("note");

        const errorEmbed = new Discord.EmbedBuilder();
        errorEmbed.setColor('#ED4245');
        errorEmbed.setTimestamp();

        if (interaction.options.getSubcommand() === 'set') {

        const { success, message, discordMessage } = await utils.setNote(user, interaction.user, noteText);

        if (success) {
            await interaction.editReply({ content: discordMessage, flags: Discord.MessageFlags.Ephemeral });
        } else {
            errorEmbed.setTitle('Failed to set note');
            errorEmbed.setDescription(message);
            return interaction.editReply({ embeds: [errorEmbed] });
        }
    } else if (interaction.options.getSubcommand() === 'clear') {

        const hasPermission = await utils.checkPermission(interaction.user.id, "SET_NOTES");
        if (!hasPermission) {
            errorEmbed.setTitle('Failed to set note');
            errorEmbed.setDescription(`Sorry, you don't have permissions to do this!`);
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        let userData = await userModel.findOne({ userID: user.id });
        if (!userData || !userData.note) {
            errorEmbed.setTitle('Failed to set note');
            errorEmbed.setDescription("The user doesn't have a note!");
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        const logEmbed = new Discord.EmbedBuilder()
        .setColor('#4CAF50')
        .setAuthor({ 
          name: `Note Cleared • Moderation Action`, 
          iconURL: 'https://i.imgur.com/HS6c4tS.png'
        }) 
        .addFields([
          { 
            name: '`📋` **Action Details**', 
            value: `> **User:** <@!${user.id}> \`${user.username}\`\n> **Staff:** <@!${interaction.user.id}> \`${interaction.user.username}\`\n> **Old Note:** ${userData.note}` 
          }
        ])
        .setThumbnail(user.displayAvatarURL({ format: 'png', dynamic: true }))
        .setFooter({ 
          text: `Case #${guildData.totalActions}`, 
          iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
        })
        .setTimestamp();

        const logsChannel = interaction.guild.channels.cache.get(config.Note.LogsChannelID);

        userData.note = undefined;
        await userData.save();

        guildData.totalActions = (guildData.totalActions || 0) + 1;
        await guildData.save();

        await interaction.editReply({ content: `<@!${user.id}>'s note has been cleared!`, flags: Discord.MessageFlags.Ephemeral });
        if (logsChannel) logsChannel.send({ embeds: [logEmbed] });
}

}

}