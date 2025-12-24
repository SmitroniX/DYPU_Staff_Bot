const fs = require('fs');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const utils = require("../utils.js");
const Discord = require("discord.js");
const guildModel = require('../models/guildModel');
const userModel = require('../models/userModel');
const StatsService = require('../statsService');

module.exports = async (client, member) => {

    await StatsService.incrementStat(member.guild.id, 'memberLeaves');

};