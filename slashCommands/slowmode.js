const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require("discord.js");
const Discord = require("discord.js");
const fs = require('fs');
const yaml = require("js-yaml");
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const guildModel = require('../models/guildModel');
const utils = require("../utils.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription("Manage channel slowmode")
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription("Set slowmode in a channel")
                .addNumberOption(option => option.setName('amount').setDescription('Slowmode time in seconds (1-21600 Seconds), Set to 0 to disable.').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('The reason for slowmode').setRequired(config.Slowmode.RequireReason))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription("Clear slowmode in a channel")
        ),
    async execute(interaction, client) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

        const errorEmbed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTimestamp()
            .setFooter({ 
                text: `${interaction.user.username}`, 
                iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
            });

        const hasPermission = await utils.checkPermission(interaction.user.id, "SET_SLOWMODE");
        if (!hasPermission) {
            errorEmbed.setTitle('Access Denied')
                .setDescription('You do not have permission to manage slowmode.')
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        const guildData = await guildModel.findOne({ guildID: config.GuildID });
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            let amount = interaction.options.getNumber("amount");
            let reason = interaction.options.getString("reason") || "No reason specified.";

            if (amount > 21600) amount = 21600;
            if (amount < 0) amount = 1;

            try {
                await interaction.channel.setRateLimitPerUser(amount);
                
                let formattedDuration;
                if (amount === 0) {
                    formattedDuration = "disabled";
                } else if (amount < 60) {
                    formattedDuration = `${amount} second${amount !== 1 ? 's' : ''}`;
                } else if (amount < 3600) {
                    const minutes = Math.floor(amount / 60);
                    formattedDuration = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
                } else {
                    const hours = Math.floor(amount / 3600);
                    const remainingMinutes = Math.floor((amount % 3600) / 60);
                    formattedDuration = `${hours} hour${hours !== 1 ? 's' : ''}`;
                    if (remainingMinutes > 0) {
                        formattedDuration += ` ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
                    }
                }

                const successEmbed = new EmbedBuilder()
                    .setColor('#2196F3')
                    .setAuthor({ 
                        name: `Slowmode ${amount === 0 ? 'Disabled' : 'Enabled'}`, 
                        iconURL: 'https://i.imgur.com/eXOvtgk.png'
                    })
                    .setDescription(`Slowmode in <#${interaction.channel.id}> has been ${amount === 0 ? 'disabled' : `set to **${formattedDuration}**`}.`)
                    .setFooter({ 
                        text: `${interaction.user.username}`, 
                        iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                    })
                    .setTimestamp();

                const logEmbed = new EmbedBuilder()
                    .setColor('#2196F3')
                    .setAuthor({ 
                        name: `Slowmode • Moderation Action`, 
                        iconURL: 'https://i.imgur.com/eXOvtgk.png'
                    }) 
                    .addFields([
                        { 
                            name: '`📋` **Action Details**', 
                            value: `> **Staff:** <@!${interaction.user.id}> \`${interaction.user.username}\`\n> **Channel:** <#${interaction.channel.id}> \`${interaction.channel.id}\`\n> **Duration:** ${formattedDuration}\n> **Reason:** ${reason}` 
                        }
                    ])
                    .setFooter({ 
                        text: `Case #${guildData.totalActions + 1}`, 
                        iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                    })
                    .setTimestamp();

                guildData.totalActions = (guildData.totalActions || 0) + 1;
                await guildData.save();

                const logsChannel = interaction.guild.channels.cache.get(config.Slowmode.LogsChannelID);
                if (logsChannel) await logsChannel.send({ embeds: [logEmbed] });

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
                console.error('Error setting slowmode:', error);
                
                const errorEmbed = new EmbedBuilder()
                    .setColor('#ED4245')
                    .setAuthor({ 
                        name: `Slowmode Error`,
                    })
                    .setDescription(`Failed to set slowmode in this channel.\nPlease check your slowmode length and try again.`)
                    .setFooter({ 
                        text: `Error Code: ${error.code || 'Unknown'}`, 
                        iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                    })
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [errorEmbed] });
            }
        } else if (subcommand === 'clear') {
            try {
                await interaction.channel.setRateLimitPerUser(0);
                
                const clearEmbed = new EmbedBuilder()
                    .setColor('#4CAF50')
                    .setAuthor({ 
                        name: `Slowmode Cleared`, 
                    })
                    .setDescription(`Slowmode in <#${interaction.channel.id}> has been cleared.`)
                    .setFooter({ 
                        text: `${interaction.user.username}`, 
                        iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                    })
                    .setTimestamp();
                
                const logEmbed = new EmbedBuilder()
                    .setColor('#4CAF50')
                    .setAuthor({ 
                        name: `Slowmode Cleared • Moderation Action`, 
                    }) 
                    .addFields([
                        { 
                            name: '`📋` **Action Details**', 
                            value: `> **Staff:** <@!${interaction.user.id}> \`${interaction.user.id}\`\n> **Channel:** <#${interaction.channel.id}> \`${interaction.channel.id}\`` 
                        }
                    ])
                    .setFooter({ 
                        text: `Case #${guildData.totalActions + 1}`, 
                        iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                    })
                    .setTimestamp();

                guildData.totalActions = (guildData.totalActions || 0) + 1;
                await guildData.save();
                
                const logsChannel = interaction.guild.channels.cache.get(config.Slowmode.LogsChannelID);
                if (logsChannel) await logsChannel.send({ embeds: [logEmbed] });
                
                const viewChannelButton = new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setLabel('View Channel')
                    .setEmoji('📝')
                    .setURL(`https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}`);
                
                const actionRow = new ActionRowBuilder().addComponents(viewChannelButton);
                
                await interaction.editReply({ 
                    embeds: [clearEmbed],
                    components: [actionRow]
                });
            } catch (error) {
                console.error('Error clearing slowmode:', error);
                
                const errorEmbed = new EmbedBuilder()
                    .setColor('#ED4245')
                    .setAuthor({ 
                        name: `Slowmode Error`, 
                        iconURL: 'https://i.imgur.com/hxwvJEp.png'
                    })
                    .setDescription(`Failed to clear slowmode in this channel.`)
                    .setFooter({ 
                        text: `Error Code: ${error.code || 'Unknown'}`, 
                        iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                    })
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [errorEmbed] });
            }
        }
    }
};