
import {Client, GatewayIntentBits} from 'discord.js';
import {config, sentByAdmin} from './util.js';
import {execSync} from 'node:child_process';


let client = new Client({intents: [
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
]});

client.once('clientReady', () => console.log('Logged in'));

client.on('messageCreate', async msg => {
    if (msg.author.bot || !sentByAdmin(msg) || !msg.content.startsWith('!!')) {
        return;
    }
    let command: string;
    if (msg.content === '!!start') {
        command = 'systemctl start caterer';
    } else if (msg.content === '!!stop') {
        command = 'systemctl stop caterer';
    } else if (msg.content === '!!restart') {
        command = import.meta.dirname + '/../update.sh';
    } else {
        throw new Error('Invalid command!');
    }
    try {
        execSync(command);
    } catch (error) {
        await msg.reply('`' + String(error) + '`');
        return;
    }
    await msg.react('✅');
});

client.login(config.wrapperToken);
