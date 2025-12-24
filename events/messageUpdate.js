const fs = require('fs');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const color = require('ansi-colors');
const utils = require("../utils.js");
const Discord = require("discord.js");
const mongoose = require("mongoose");
const guildModel = require('../models/guildModel.js');
const userModel = require('../models/userModel.js');

module.exports = async (client, newMessage) => {
    if (newMessage.author.bot) return;
    if(!newMessage.channel.type === 0) return;

    // Auto Moderation
    await utils.handleDiscordInvites(newMessage, client);
    await utils.handlePhishingLinks(newMessage, client);

};