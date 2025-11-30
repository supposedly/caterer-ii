
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
            await msg.reply('Started!');
        } else if (msg.content === '!!stop') {
            execSync('systemctl stop caterer');
            await msg.reply('Stopped!');
        } else if (msg.content === '!!restart') {
            execSync('systemctl stop caterer');
            execSync('systemctl start caterer');
            await msg.reply('Restarted!');
        } else if (msg.content === '!!update') {
            await msg.reply('Updating...');
            execSync('systemctl stop caterer');
            execSync(import.meta.dirname + '/../update2.sh');
            execSync('systemctl start caterer');
            await msg.channel.send('Update complete!');
        } else {
            await msg.reply('Invalid command!');
        }
    } catch (error) {
        await msg.reply('`' + String(error) + '`');
    }
});

client.login(config.wrapperToken);
