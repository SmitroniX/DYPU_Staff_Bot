const color = require('ansi-colors');
const axios = require('axios');
const fs = require('fs');

console.log(`${color.yellow(`Starting bot, this can take a while..`)}`);

const version = Number(process.version.split('.')[0].replace('v', ''));
if (version < 18) {
  console.log(`${color.red(`[ERROR] Plex Staff requires a NodeJS version of 18 or higher!\nYou can check your NodeJS by running the "node -v" command in your terminal.`)}`);

  console.log(`${color.blue(`\n[INFO] To update Node.js, follow the instructions below for your operating system:`)}`);
  console.log(`${color.green(`- Windows:`)} Download and run the installer from ${color.cyan(`https://nodejs.org/`)}`);
  console.log(`${color.green(`- Ubuntu/Debian:`)} Run the following commands in the Terminal:`);
  console.log(`${color.cyan(`  - sudo apt update`)}`);
  console.log(`${color.cyan(`  - sudo apt upgrade nodejs`)}`);
  console.log(`${color.green(`- CentOS:`)} Run the following commands in the Terminal:`);
  console.log(`${color.cyan(`  - sudo yum update`)}`);
  console.log(`${color.cyan(`  - sudo yum install -y nodejs`)}`);

  let logMsg = `\n\n[${new Date().toLocaleString()}] [ERROR] Plex Staff requires a NodeJS version of 18 or higher!`;
  fs.appendFile("./logs.txt", logMsg, (e) => { 
    if(e) console.log(e);
  });

  process.exit()
}

const packageFile = require('./package.json');
let logMsg = `\n\n[${new Date().toLocaleString()}] [STARTING] Attempting to start the bot..\nNodeJS Version: ${process.version}\nBot Version: ${packageFile.version}`;
fs.appendFile("./logs.txt", logMsg, (e) => { 
  if(e) console.log(e);
});

const { Collection, Client, Discord, ActionRowBuilder, ButtonBuilder, GatewayIntentBits, ActivityType } = require('discord.js');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const client = new Client({ 
  restRequestTimeout: 60000,
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.GuildMembers, 
    GatewayIntentBits.GuildPresences, 
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions
  ],
  presence: {
    status: 'dnd',
    activities: [{ name: 'Starting up...', type: ActivityType.Playing }]
  },
  retryLimit: 3
});

exports.client = client;
require("./utils.js");

async function uploadToHaste(textToUpload) {
  try {
    const response = await axios.post('https://paste.plexdevelopment.net/documents', textToUpload);
    return response.data.key;
  } catch (error) {
    if (error.response) {
      console.error('Error uploading to Haste-server. Status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else {
      console.error('Error uploading to Haste-server:', error.message);
    }
    return null;
  }
}

const logsFilePath = './logs.txt';
const maxLength = 5000;

async function handleAndUploadError(errorType, error) {
  try {
    console.log(error);

    const errorPrefix = `[${new Date().toLocaleString()}] [${errorType}] [v${packageFile.version}]`;
    const errorMsg = `\n\n${errorPrefix}\n${error.stack}`;
    await fs.appendFile("./logs.txt", errorMsg, (e) => {
      if (e) console.log(e);
    });

    let uploadContent = `[${new Date().toLocaleString()}]\n`;
    const errorSection = `[${errorType}] [v${packageFile.version}]\n${error.stack}`;
    uploadContent += `${errorSection}\n`;

    let logsContent = fs.readFileSync(logsFilePath, 'utf8');

    if (logsContent.length > maxLength) {
      logsContent = logsContent.substring(logsContent.length - maxLength);
    }

    const logsSection = `\n\n\nLogs\n${logsContent}\n`;
    uploadContent += logsSection;

    const key = await uploadToHaste(uploadContent);

    if (key) {
      const hasteURL = `https://paste.plexdevelopment.net/${key}`;
      console.log(`${color.green.bold(`[v${packageFile.version}]`)} ${color.red(`If you require assistance, create a ticket in our Discord server and share this link:`)} ${color.yellow(hasteURL)}\n\n`);
    } else {
      console.log('Paste Upload failed.');
    }
  } catch (err) {
    console.error('Error handling and uploading error:', err);
  }
}




client.on('warn', async (error) => {
  handleAndUploadError('WARN', error);
});

client.on('error', async (error) => {
  handleAndUploadError('ERROR', error);
});

process.on('unhandledRejection', async (error) => {
  handleAndUploadError('unhandledRejection', error);
});

process.on('uncaughtException', async (error) => {
  handleAndUploadError('uncaughtException', error);
});
