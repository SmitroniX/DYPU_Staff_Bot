const fs = require('fs');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const color = require('ansi-colors');
const botVersion = require('../package.json');
const utils = require("../utils.js");
const Discord = require("discord.js");
const mongoose = require("mongoose");
const guildModel = require('../models/guildModel');
const userModel = require('../models/userModel');

module.exports = async (client, message) => {
    if (message.author.bot) return;
    if(!message.channel.type === 0) return;

    try {
        // Find the guild in the database based on the channel ID
        const guildDB = await guildModel.findOne({ 'recentMessages.msgID': message.id });

        if (guildDB) {
            // Remove the deleted message from the recentMessages array
            guildDB.recentMessages = guildDB.recentMessages.filter(msg => msg.msgID !== message.id);

            // Save the updated guild document
            await guildDB.save();
            //console.log(`Deleted message with ID ${message.id}`);
        }
    } catch (error) {
        console.error("Error deleting message from database:", error);
    }


}