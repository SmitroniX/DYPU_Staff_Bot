const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require("discord.js");
const fs = require('fs');
const yaml = require("js-yaml");
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const utils = require("../utils.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription("View a list of all commands"),
  async execute(interaction) {
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

        const errorEmbed = new Discord.EmbedBuilder()
        .setColor('#ED4245')
        .setTimestamp();

        const hasPermission = await utils.checkIfUserStaff(interaction.user.id);
        if (!hasPermission) {
            errorEmbed.setTitle('Permission Denied');
            errorEmbed.setDescription(`Sorry, you don't have permissions to do this!`);
            return interaction.editReply({ embeds: [errorEmbed] });
        }

    let icon = interaction.guild.iconURL();
    let helpEmbed = new Discord.EmbedBuilder()
      .setTitle(`${config.HelpCommand.Title.replace(/{botName}/g, `${config.BotName}`)}`)
      .setColor(config.HelpCommand.EmbedColor || config.EmbedColors);

    const addCommandFields = (categoryConfig, category, commandList) => {
      const enabledCommands = commandList.filter(cmd => cmd.Enabled);
      if (enabledCommands.length > 0) {
        const commandNames = enabledCommands.map(cmd => `\`${cmd.Name}\``).join(', ');
        let categoryName = categoryConfig.Name;
        if (categoryConfig.ShowCount) {
          categoryName += ` (${enabledCommands.length})`;
        }
        helpEmbed.addFields({ name: categoryName, value: commandNames });
        return enabledCommands.length;
      }
      return 0;
    };


    addCommandFields(
      config.HelpCommand.StaffCategory,
      config.HelpCommand.StaffCategory.Name,
      [
        { Name: 'staff', Enabled: true },
        { Name: 'purge', Enabled: true },
        { Name: 'history', Enabled: true },
        { Name: 'clearchannel', Enabled: true },
        { Name: 'slowmode', Enabled: true },
        { Name: 'note', Enabled: true },
        { Name: 'warn', Enabled: true },
        { Name: 'timeout', Enabled: true },
        { Name: 'kick', Enabled: true },
        { Name: 'ban', Enabled: true },
        { Name: 'unban', Enabled: true },
      ]
    );

    if (config.HelpCommand.GuildIcon && icon) {
      helpEmbed.setThumbnail(icon);
    }

    if (config.HelpCommand.FooterTimestamp) {
      helpEmbed.setTimestamp();
    }

    const footerMsg = config.HelpCommand.FooterMsg
      .replace(/{guildName}/g, interaction.guild.name)
      .replace(/{userTag}/g, interaction.user.username);

    helpEmbed.setFooter({ text: footerMsg, icon: config.HelpCommand.FooterIcon });

    interaction.editReply({ embeds: [helpEmbed] });
  }
};