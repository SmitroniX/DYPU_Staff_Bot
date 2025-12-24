const fs = require('fs');
const yaml = require("js-yaml");
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const utils = require("../utils.js");
const Discord = require("discord.js");
const guildModel = require('../models/guildModel');
const userModel = require('../models/userModel');
const AutoModeration = require('../models/autoModerationModel');
const StatsService = require('../statsService');

module.exports = async (client, member) => {
    await StatsService.incrementStat(member.guild.id, 'memberJoins');

    try {
        const autoModSettings = await AutoModeration.getOrCreate(member.guild.id);

        if (autoModSettings.altPrevention.enabled) {
            const accountAgeDays = autoModSettings.altPrevention.accountAgeDays || 7;
            const accountAgeThreshold = accountAgeDays * 24 * 60 * 60 * 1000;
            const accountAge = Date.now() - member.user.createdAt;

            if (accountAge < accountAgeThreshold) {
                const reason = autoModSettings.altPrevention.customMessage || "Your account is too new to join this server.";
                const punishmentID = await utils.generatePunishmentID();

                console.log(`[Alt Prevention] Detected new account: ${member.user.tag} (${member.user.id}), account age: ${Math.floor(accountAge / (1000 * 60 * 60 * 24))} days`);
                
                const actions = autoModSettings.altPrevention.actions;

                if (actions.kickUser) {
                    const { success, message } = await utils.kickUser(member.user, client.user, reason, punishmentID);
                    if (!success) {
                        console.error(`[Alt Prevention] Failed to kick user ${member.user.tag}: ${message}`);
                    } else {
                        console.log(`[Alt Prevention] Successfully kicked alt account: ${member.user.tag}`);
                    }
                } else if (actions.banUser) {
                    const isTempBan = actions.isTempBan || false;
                    let duration = null;
                    
                    if (isTempBan) {
                        const banDuration = actions.banDuration || 7;
                        const banUnit = actions.banUnit || 'd';
                        
                        switch (banUnit) {
                            case 'd':
                                duration = banDuration * 24 * 60 * 60 * 1000;
                                break;
                            case 'w':
                                duration = banDuration * 7 * 24 * 60 * 60 * 1000;
                                break;
                            case 'm':
                                duration = banDuration * 30 * 24 * 60 * 60 * 1000;
                                break;
                            default:
                                duration = null;
                        }
                    }
                    
                    const { success, message } = await utils.banUser(
                        member.user, 
                        client.user, 
                        reason, 
                        punishmentID,
                        duration
                    );
                    
                    if (!success) {
                        console.error(`[Alt Prevention] Failed to ban user ${member.user.tag}: ${message}`);
                    } else {
                        console.log(`[Alt Prevention] Successfully banned alt account: ${member.user.tag}`);
                    }
                } else if (actions.timeout) {
                    const timeoutDuration = actions.timeoutDuration || 24;
                    const timeoutUnit = actions.timeoutUnit || 'h';
                    
                    const timeString = `${timeoutDuration}${timeoutUnit}`;
                    
                    const { success, message } = await utils.timeoutUser(
                        member.user,
                        client.user,
                        reason,
                        timeString,
                        punishmentID
                    );
                    
                    if (!success) {
                        console.error(`[Alt Prevention] Failed to timeout user ${member.user.tag}: ${message}`);
                    } else {
                        console.log(`[Alt Prevention] Successfully timed out alt account: ${member.user.tag}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error("[Alt Prevention] Error processing alt prevention:", error);
    }
};