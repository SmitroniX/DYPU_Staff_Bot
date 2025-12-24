const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require ("discord.js")
const fs = require('fs');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const utils = require("../utils.js");
const staffModel = require('../models/staffModel');
const punishmentModel = require('../models/punishmentModel');
const guildModel = require('../models/guildModel');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription("Unban a user from the server")
        .addUserOption(option => option.setName('user').setDescription('The user to unban').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for unban').setRequired(config.Unban.RequireReason)),
    async execute(interaction, client) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason");

        let ban = await interaction.guild.bans.fetch();

        const guildData = await guildModel.findOne({ guildID: config.GuildID });

        const errorEmbed = new Discord.EmbedBuilder()
        .setColor('#ED4245')
        .setTimestamp();

        const hasPermission = await utils.checkPermission(interaction.user.id, "UNBAN_USERS");
        if (!hasPermission) {
            errorEmbed.setTitle('Failed to unban');
            errorEmbed.setDescription(`Sorry, you don't have permissions to do this!`);
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        if (!ban.get(user.id)) {
            errorEmbed.setTitle('Failed to unban');
            errorEmbed.setDescription(`The user is not banned!`);
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        try {
            await interaction.guild.bans.fetch().then(bans => {
                interaction.guild.members.unban(user, reason)
            })
    
            const logEmbed = new Discord.EmbedBuilder()
            .setColor('#009688')
            .setAuthor({ 
              name: `Unban • Moderation Action`, 
              iconURL: 'https://i.imgur.com/eTYmots.png'
            })
            .addFields([
              { 
                name: '`📋` **Action Details**', 
                value: `> **User:** <@!${user.id}> \`${user.id}\`\n> **Staff:** <@!${interaction.user.id}> \`${interaction.user.username}\`\n> **Reason:** ${reason}` 
              }
            ])
            .setThumbnail(user.displayAvatarURL({ format: 'png', dynamic: true }))
            .setFooter({ 
              text: `Case #${guildData.totalActions}`, 
              iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
            })
            .setTimestamp();
            

            const logsChannel = interaction.guild.channels.cache.get(config.Unban.LogsChannelID);

            const successEmbed = new Discord.EmbedBuilder()
            .setColor('#009688')
            .setAuthor({ 
                name: `Unban • Action Successful`, 
                iconURL: 'https://i.imgur.com/eTYmots.png'
            })
            .addFields([
                { 
                    name: '`✅` **Confirmation**', 
                    value: `> **Target:** <@!${user.id}> \`${user.id}\`\n> **Reason:** ${reason}` 
                }
            ])
            .setFooter({ 
              text: `${interaction.user.username}`, 
              iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
          })
            .setTimestamp();

            interaction.editReply({ embeds: [successEmbed], flags: Discord.MessageFlags.Ephemeral })
            if (logsChannel) logsChannel.send({ embeds: [logEmbed] })
        } catch(e) {
            console.log(e)
        }

    }

}