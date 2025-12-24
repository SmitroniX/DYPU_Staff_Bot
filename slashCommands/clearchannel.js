const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const Discord = require("discord.js");
const fs = require('fs');
const yaml = require("js-yaml");
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const guildModel = require('../models/guildModel');
const utils = require("../utils.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clearchannel')
        .setDescription("Clone and delete channel to clear all messages.")
        .addStringOption(option => option.setName('reason').setDescription('The reason for clearing the channel')),
    async execute(interaction, client) {
        const errorEmbed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTimestamp()
            .setFooter({ 
              text: `${interaction.user.username}`, 
              iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
          });

        const hasPermission = await utils.checkPermission(interaction.user.id, "CLEAR_CHANNEL");
        if (!hasPermission) {
            errorEmbed.setTitle('Access Denied')
                .setDescription(`You don't have permission to clear channels.`);
            return interaction.reply({ embeds: [errorEmbed], flags: Discord.MessageFlags.Ephemeral });
        }

        let reason = interaction.options.getString("reason") || "No reason specified.";
        
        const confirmationEmbed = new EmbedBuilder()
            .setColor('#9C27B0')
            .setAuthor({ 
                name: `Channel Clear • Confirmation Required`, 
                iconURL: 'https://i.imgur.com/C3Q3CZp.png'
            })
            .setDescription(`You are about to clear all messages in the channel **#${interaction.channel.name}**`)
            .addFields([
                { 
                    name: '`⚠️` **Important Warning**', 
                    value: `> This action will **delete and recreate** the channel.\n> The new channel will have a **different ID**.\n> Any bots or integrations using this channel's ID will need to be updated.` 
                },
                {
                    name: '`ℹ️` **What Will Be Preserved**',
                    value: `> • Channel name\n> • Channel permissions\n> • Channel position\n> • Channel topic\n> • Channel settings`
                },
                {
                    name: '`🗑️` **What Will Be Lost**',
                    value: `> • All messages\n> • All pins\n> • Channel ID\n> • Webhooks\n> • Slow mode settings`
                }
            ])
            .setFooter({ 
                text: `${interaction.user.username}`, 
                iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
            })
            .setTimestamp();

        const confirmButton = new ButtonBuilder()
            .setCustomId('confirm_clear')
            .setLabel('Confirm Clear')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️');

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_clear')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌');

        const actionRow = new ActionRowBuilder()
            .addComponents(confirmButton, cancelButton);

        const reply = await interaction.reply({ 
            embeds: [confirmationEmbed], 
            components: [actionRow],
            fetchReply: true,
            flags: Discord.MessageFlags.Ephemeral
        });

        const collector = reply.createMessageComponentCollector({ 
            componentType: ComponentType.Button,
            time: 60000
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ 
                    content: 'Only the person who initiated this command can interact with these buttons.', 
                    flags: Discord.MessageFlags.Ephemeral
                });
                return;
            }

            if (i.customId === 'confirm_clear') {
                await i.update({ 
                    content: 'Channel clear confirmed. Processing...',
                    embeds: [],
                    components: []
                });

                const guildData = await guildModel.findOne({ guildID: config.GuildID });

                const logEmbed = new EmbedBuilder()
                    .setColor('#9C27B0')
                    .setAuthor({ 
                        name: `Clear Channel • Moderation Action`, 
                        iconURL: 'https://i.imgur.com/C3Q3CZp.png'
                    }) 
                    .addFields([
                        { 
                            name: '`📋` **Action Details**', 
                            value: `> **Staff:** <@!${interaction.user.id}> \`${interaction.user.username}\`\n> **Channel:** ${interaction.channel.name} \`${interaction.channel.id}\`\n> **Reason:** ${reason}` 
                        }
                    ])
                    .setFooter({ 
                        text: `Case #${guildData.totalActions + 1}`, 
                        iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                    })
                    .setTimestamp();

                let logsChannel = interaction.guild.channels.cache.get(config.LogsChannelID);
                
                try {
                    const position = interaction.channel.position;
                    const categoryId = interaction.channel.parentId;
                    const topic = interaction.channel.topic;
                    const nsfw = interaction.channel.nsfw;
                    const rateLimitPerUser = interaction.channel.rateLimitPerUser;
                    
                    const newChannel = await interaction.channel.clone({
                        reason: `Channel cleared by ${interaction.user.username}: ${reason}`
                    });
                    
                    await newChannel.setPosition(position);
                    if (categoryId) await newChannel.setParent(categoryId, { lockPermissions: false });
                    if (topic) await newChannel.setTopic(topic);
                    await newChannel.setNSFW(nsfw);
                    if (rateLimitPerUser) await newChannel.setRateLimitPerUser(rateLimitPerUser);
                    
                    await interaction.channel.delete(`Channel cleared by ${interaction.user.username}: ${reason}`);
                    
                    const notificationEmbed = new EmbedBuilder()
                        .setColor('Green')
                        .setDescription(`**This channel has been cleared by <@${interaction.user.id}>**`)
                        .setTimestamp();
                    
                    await newChannel.send({ embeds: [notificationEmbed] });
                    
                    guildData.totalActions = (guildData.totalActions || 0) + 1;
                    await guildData.save();
                    
                    if (logsChannel) await logsChannel.send({ embeds: [logEmbed] });
                } catch (error) {
                    console.error('Error clearing channel:', error);
                    try {
                        let errorMsg = 'An error occurred while clearing the channel.';
                        if (logsChannel) await logsChannel.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor('#ED4245')
                                    .setTitle('Channel Clear Error')
                                    .setDescription(`Error clearing channel #${interaction.channel.name}: ${error.message}`)
                                    .setTimestamp()
                            ]
                        });
                    } catch (e) {
                    }
                }
            } else if (i.customId === 'cancel_clear') {
                await i.update({ 
                    content: 'Channel clear cancelled.',
                    embeds: [],
                    components: []
                });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                try {
                    await interaction.editReply({
                        content: 'Channel clear timed out due to inactivity.',
                        embeds: [],
                        components: []
                    });
                } catch (error) {
                }
            }
        });
    }
};