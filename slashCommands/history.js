const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Discord = require('discord.js');
const fs = require('fs');
const yaml = require('js-yaml');
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const punishmentModel = require('../models/punishmentModel');
const utils = require("../utils.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription("View punishment history of a user")
        .addUserOption(option => option.setName('user').setDescription('The user to view punishment history').setRequired(true)),
    
    async execute(interaction, client) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

        const errorEmbed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTimestamp()
            .setFooter({ 
                text: `${interaction.user.username}`, 
                iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
            });

        const hasPermission = await utils.checkPermission(interaction.user.id, "VIEW_HISTORY");
        if (!hasPermission) {
            errorEmbed.setTitle('Access Denied')
                .setDescription('You do not have permission to view punishment history.')
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        const user = interaction.options.getUser('user');

        try {
            const punishments = await punishmentModel.find({ userID: user.id }).sort({ date: -1 });

            if (punishments.length === 0) {
                const noHistoryEmbed = new EmbedBuilder()
                    .setColor('#4CAF50')
                    .setAuthor({ 
                        name: `User History • Clean Record`, 
                        iconURL: 'https://i.imgur.com/UsZynqQ.png'
                    })
                    .setDescription(`This user has no punishment history on record.`)
                    .setThumbnail(user.displayAvatarURL({ format: 'png', dynamic: true }))
                    .setFooter({ 
                        text: `${interaction.user.username}`, 
                        iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                    })
                    .setTimestamp();
                
                const viewProfileButton = new ButtonBuilder()
                    .setStyle("Link")
                    .setLabel('View User Profile')
                    .setEmoji('👤')
                    .setURL(`${config.baseURL}/view/${user.id}`);
                
                const actionRow = new ActionRowBuilder()
                    .addComponents(viewProfileButton);
                
                return interaction.editReply({ embeds: [noHistoryEmbed], components: [actionRow] });
            }

            const stats = {
                warnings: punishments.filter(p => p.punishment.toLowerCase() === 'warn').length,
                timeouts: punishments.filter(p => p.punishment.toLowerCase() === 'timeout').length,
                kicks: punishments.filter(p => p.punishment.toLowerCase() === 'kick').length,
                bans: punishments.filter(p => p.punishment.toLowerCase() === 'ban').length
            };

            const MAX_ENTRIES_PER_PAGE = 5;
            const totalPages = Math.ceil(punishments.length / MAX_ENTRIES_PER_PAGE);

            async function generateEmbed(pageIndex) {
                const startIndex = pageIndex * MAX_ENTRIES_PER_PAGE;
                const endIndex = Math.min(startIndex + MAX_ENTRIES_PER_PAGE, punishments.length);
                const displayedPunishments = punishments.slice(startIndex, endIndex);
                
                const punishmentFields = [];
                
                for (const punishment of displayedPunishments) {
                    let emoji, color;
                    
                    switch (punishment.punishment.toLowerCase()) {
                        case 'warn':
                            emoji = '⚠️';
                            color = '#FFEB3B';
                            break;
                        case 'timeout':
                            emoji = '🔇';
                            color = '#FFB74D';
                            break;
                        case 'kick':
                            emoji = '👞';
                            color = '#FF9800';
                            break;
                        case 'ban':
                            emoji = '🚫';
                            color = '#FF5252';
                            break;
                        default:
                            emoji = '❓';
                            color = '#9E9E9E';
                    }
                    
                    let staffUsername;
                    try {
                        const staffMember = await client.users.fetch(punishment.staff);
                        staffUsername = staffMember ? staffMember.username : "Unknown Staff";
                    } catch (error) {
                        staffUsername = punishment.staffUsername || "Unknown Staff";
                    }
                    
                    const date = punishment.date instanceof Date ? punishment.date : new Date(punishment.date);
                    const timestamp = Math.floor(date.getTime() / 1000);
                    
                    punishmentFields.push({
                        name: `\`${emoji}\` **${punishment.punishment.toUpperCase()}** • <t:${timestamp}:D> *(<t:${timestamp}:R>)*`,
                        value: `> **Case ID:** \`${punishment.punishmentID}\`\n> **Staff:** ${staffUsername}\n> **Reason:** ${punishment.reason}`
                    });
                }
                
                const historyEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setAuthor({ 
                        name: `User History • ${user.tag}`, 
                        iconURL: 'https://i.imgur.com/wy5g7wR.png'
                    })
                    .setThumbnail(user.displayAvatarURL({ format: 'png', dynamic: true }))
                    .setDescription(`Showing punishment history for <@${user.id}> (\`${user.id}\`)\n\n**Summary**\n> ⚠️ Warnings: ${stats.warnings}\n> 🔇 Timeouts: ${stats.timeouts}\n> 👞 Kicks: ${stats.kicks}\n> 🚫 Bans: ${stats.bans}`)
                    .addFields(punishmentFields)
                    .setFooter({ 
                        text: `Page ${pageIndex + 1}/${totalPages} • ${punishments.length} Total Records`, 
                        iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 })
                    })
                    .setTimestamp();
                
                return historyEmbed;
            }

            const firstPageEmbed = await generateEmbed(0);
            
            const previousButton = new ButtonBuilder()
                .setCustomId('previous')
                .setLabel('Previous')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true);
            
            const nextButton = new ButtonBuilder()
                .setCustomId('next')
                .setLabel('Next')
                .setEmoji('➡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(totalPages <= 1);
            
            const viewProfileButton = new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('View User Profile')
                .setEmoji('👤')
                .setURL(`${config.baseURL}/view/${user.id}`);
            
            const row = new ActionRowBuilder()
                .addComponents(previousButton, nextButton, viewProfileButton);
            
            const response = await interaction.editReply({
                embeds: [firstPageEmbed],
                components: [row]
            });
            
            if (totalPages > 1) {
                let currentPage = 0;
                
                const collector = response.createMessageComponentCollector({
                    filter: i => i.user.id === interaction.user.id,
                    time: 300000
                });
                
                collector.on('collect', async i => {
                    if (i.customId === 'previous') {
                        currentPage = Math.max(0, currentPage - 1);
                    } else if (i.customId === 'next') {
                        currentPage = Math.min(totalPages - 1, currentPage + 1);
                    }
                    
                    previousButton.setDisabled(currentPage === 0);
                    nextButton.setDisabled(currentPage === totalPages - 1);
                    
                    const updatedRow = new ActionRowBuilder()
                        .addComponents(previousButton, nextButton, viewProfileButton);
                    
                    const newEmbed = await generateEmbed(currentPage);
                    
                    await i.update({
                        embeds: [newEmbed],
                        components: [updatedRow]
                    });
                });
                
                collector.on('end', async () => {
                    previousButton.setDisabled(true);
                    nextButton.setDisabled(true);
                    
                    const disabledRow = new ActionRowBuilder()
                        .addComponents(previousButton, nextButton, viewProfileButton);
                    
                    try {
                        await interaction.editReply({
                            components: [disabledRow]
                        });
                    } catch (error) {
                    }
                });
            }
        } catch (error) {
            console.error('Error fetching punishment history:', error);
            errorEmbed.setTitle('Error')
                .setDescription('An error occurred while fetching punishment history. Please try again later.')
                .setFooter({ 
                    text: `If this persists, please contact server staff`, 
                    iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                });
            
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};