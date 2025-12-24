const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Discord = require("discord.js");
const fs = require('fs');
const yaml = require("js-yaml");
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const utils = require("../utils.js");
const guildModel = require('../models/guildModel');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription("Purge a specific amount of messages from a channel")
        .addNumberOption(option => option.setName('amount').setDescription('The amount of messages to purge (max 100)').setRequired(true))
        .addUserOption(option => option.setName('user').setDescription('Only purge messages from this specific user (optional)'))
        .addStringOption(option => option.setName('reason').setDescription('The reason for the purge').setRequired(config.Purge.RequireReason)),
    
    async execute(interaction, client) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

        const errorEmbed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTimestamp();

        const hasPermission = await utils.checkPermission(interaction.user.id, "PURGE_MESSAGES");
        if (!hasPermission) {
            errorEmbed.setTitle('Access Denied')
                .setDescription(`You don't have permission to purge messages.`)
                .setFooter({ 
                    text: `${interaction.user.username}`, 
                    iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                });
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        const guildData = await guildModel.findOne({ guildID: config.GuildID });
        let amount = interaction.options.getNumber("amount");
        const targetUser = interaction.options.getUser("user");
        let reason = interaction.options.getString("reason") || "No reason specified.";
        
        if (amount > 100) amount = 100;
        if (amount < 1) amount = 1;

        const logEmbed = new EmbedBuilder()
            .setColor('#673AB7')
            .setAuthor({ 
                name: `Purge • Moderation Action`, 
                iconURL: 'https://i.imgur.com/xoLi8Qe.png'
            }) 
            .addFields([
                { 
                    name: '`📋` **Action Details**', 
                    value: `> **Staff:** <@!${interaction.user.id}> \`${interaction.user.username}\`\n> **Channel:** <#${interaction.channel.id}> \`${interaction.channel.id}\`\n> **Amount:** ${amount} messages${targetUser ? `\n> **Target User:** <@!${targetUser.id}> \`${targetUser.username}\`` : ''}\n> **Reason:** ${reason}` 
                }
            ])
            .setFooter({ 
                text: `Case #${guildData.totalActions + 1}`, 
                iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
            })
            .setTimestamp();

        try {
            let deletedCount = 0;
            let messages;
            
            if (targetUser) {
                const fetchAmount = Math.min(amount * 2, 100);
                messages = await interaction.channel.messages.fetch({ limit: fetchAmount });
                
                const userMessages = messages.filter(m => m.author.id === targetUser.id);
                
                const messagesToDelete = userMessages.first(amount);
                deletedCount = messagesToDelete.length;
                
                if (messagesToDelete.length > 0) {
                    await interaction.channel.bulkDelete(messagesToDelete);
                }
            } else {
                messages = await interaction.channel.bulkDelete(amount, true);
                deletedCount = messages.size;
            }

            guildData.totalActions = (guildData.totalActions || 0) + 1;
            await guildData.save();

            const logsChannel = interaction.guild.channels.cache.get(config.Purge.LogsChannelID);
            if (logsChannel) await logsChannel.send({ embeds: [logEmbed] });

            const successEmbed = new EmbedBuilder()
                .setColor('#673AB7')
                .setAuthor({ 
                    name: `Purge • Action Successful`, 
                    iconURL: 'https://i.imgur.com/xoLi8Qe.png'
                })
                .setDescription(`✅ Successfully purged **${deletedCount}** messages${targetUser ? ` from ${targetUser.tag}` : ''} in <#${interaction.channel.id}>.`)
                .addFields([
                    {
                        name: '`📊` **Purge Details**',
                        value: `> **Amount Requested:** ${amount}\n> **Messages Deleted:** ${deletedCount}${deletedCount < amount ? `\n> **Note:** Some messages may have been too old to delete` : ''}`
                    }
                ])
                .setFooter({ 
                    text: `${interaction.user.username}`, 
                    iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                })
                .setTimestamp();

            const viewChannelButton = new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('View Channel')
                .setEmoji('📝')
                .setURL(`https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}`);
            
            const actionRow = new ActionRowBuilder().addComponents(viewChannelButton);

            await interaction.editReply({ 
                embeds: [successEmbed],
                components: [actionRow]
            });
            
        } catch (error) {
            console.error("Error purging messages:", error);
            
            const failureEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setAuthor({ 
                    name: `Purge • Action Failed`, 
                    iconURL: 'https://i.imgur.com/hxwvJEp.png'
                })
                .setDescription(`❌ Failed to purge messages from the channel.`)
                .addFields([
                    {
                        name: '`❗` **Error Information**',
                        value: `> **Reason:** Messages might be older than 14 days\n\n*Tip: If you want to delete all messages in a channel regardless of age, use the \`/clearchannel\` command.*`
                    }
                ])
                .setFooter({ 
                    text: `${interaction.user.username}`, 
                    iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [failureEmbed] });
        }
    }
};