
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
    try {
        if (msg.content === '!!start') {
            execSync('systemctl start caterer');
        } else if (msg.content === '!!stop') {
            execSync('systemctl stop caterer');
        } else if (msg.content === '!!restart') {
            execSync('systemctl stop caterer');
            execSync('systemctl start caterer');
        } else if (msg.content === '!!update') {
            execSync('systemctl stop caterer');
            execSync(import.meta.dirname + '/../update.sh');
            execSync('systemctl start caterer');
        } else {
            throw new Error('Invalid command!');
        }
    } catch (error) {
        await msg.reply('`' + String(error) + '`');
        return;
    }
    await msg.react('✅');
});

client.login(config.wrapperToken);
