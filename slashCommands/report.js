const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require("discord.js");
const fs = require('fs');
const path = require('path');
const yaml = require("js-yaml");
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const utils = require("../utils.js");
const staffModel = require('../models/staffModel');
const guildModel = require('../models/guildModel');
const userModel = require("../models/userModel");
const reportModel = require('../models/reportModel');
const reportSettingsModel = require('../models/reportSettingsModel');
const axios = require('axios');
const crypto = require('crypto');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription("Report a user for breaking the rules")
        .addUserOption(option => option.setName('user').setDescription('The user to report').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for reporting this user').setRequired(global.cachedReportSettings?.requireReason || false))
        .addAttachmentOption(option => option.setName('screenshot').setDescription('Optional: Attach a screenshot as evidence').setRequired(false)),
        
    async execute(interaction, client) {
        await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

        const errorEmbed = new Discord.EmbedBuilder()
            .setColor('#ED4245')
            .setTimestamp();

        const reportSettings = await reportSettingsModel.findOne({ guildId: config.GuildID });
        
        if (!reportSettings || !reportSettings.reportEnabled) {
            errorEmbed.setTitle('Reporting System Disabled');
            errorEmbed.setDescription('The reporting system is currently disabled on this server.');
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        const targetUser = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason");
        const screenshot = interaction.options.getAttachment("screenshot");
        
        if (reportSettings.requireReportReason && !reason) {
            errorEmbed.setTitle('Missing Reason');
            errorEmbed.setDescription('You must provide a reason when reporting a user.');
            return interaction.editReply({ embeds: [errorEmbed] });
        }
        
        let screenshotPath = null;
        if (screenshot) {
            if (!screenshot.contentType || !screenshot.contentType.startsWith('image/')) {
                errorEmbed.setTitle('Invalid Attachment');
                errorEmbed.setDescription('The attached file must be an image (JPG, PNG, GIF, etc.).');
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            try {
                const uploadsDir = path.join(process.cwd(), 'uploads');
                if (!fs.existsSync(uploadsDir)) {
                    fs.mkdirSync(uploadsDir, { recursive: true });
                }

                const randomId = crypto.randomBytes(16).toString('hex');
                const fileName = `report_${randomId}${path.extname(screenshot.name || '.png')}`;
                const filePath = path.join(uploadsDir, fileName);
                
                const response = await axios({
                    url: screenshot.url,
                    method: 'GET',
                    responseType: 'stream'
                });
                
                const writer = fs.createWriteStream(filePath);
                response.data.pipe(writer);
                
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });
                
                screenshotPath = `/uploads/${fileName}`;
            } catch (error) {
                console.error('Error saving screenshot:', error);
            }
        }
        
        const { success, message, reportId } = await utils.reportUser(
            interaction.guild, 
            interaction.user, 
            targetUser, 
            reason, 
            interaction.channel,
            screenshotPath,
            client
        );

        if (success) {
            const successEmbed = new Discord.EmbedBuilder()
                .setColor('#FF9800')
                .setAuthor({ 
                    name: `Report Submitted!`, 
                    iconURL: 'https://i.imgur.com/XMgpDGJ.png'
                })
                .setDescription(`Your report against <@${targetUser.id}> has been submitted and will be reviewed by our staff team as soon as possible.`)
                .setFooter({ 
                    text: `Report ID: ${reportId}`, 
                    iconURL: interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 16 }) 
                })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [successEmbed] });
        } else {
            errorEmbed.setTitle('Failed to Submit Report');
            errorEmbed.setDescription(message);
            return interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};