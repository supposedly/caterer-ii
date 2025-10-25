
import * as fs from 'node:fs';
import {parse, identify, Pattern, toCatagolueRule} from '../lifeweb/lib/index.js';
import {Client, GatewayIntentBits, Message, EmbedBuilder} from 'discord.js';


const RLE_HEADER = /\s*x\s*=\s*\d+\s*,?\s*y\s*=\s*\d+/;

async function findRLE(channel: Message['channel']): Promise<Pattern | null> {
    let msgs = await channel.messages.fetch({limit: 50});
    for (let msg of msgs) {
        let data = msg[1].content;
        let match = RLE_HEADER.exec(data);
        if (!match) {
            continue;
        }
        data = data.slice(match.index);
        let index = data.indexOf('!');
        if (index === -1) {
            continue;
        }
        return parse(data.slice(0, index + 1));
    }
    return null;
}

interface Command {
    help: string;
    func(msg: Message, argv: string[]): void | Promise<void>;
}

const COMMANDS: {[key: string]: Command} = {
    identify: {
        help: 'Identifies a pattern',
        async func(msg: Message, argv: string[]): Promise<void> {
            let limit = 256;
            if (argv[1]) {
                let parsed = parseInt(argv[1]);
                if (!Number.isNaN(parsed)) {
                    limit = parsed;
                }
            }
            let pattern = await findRLE(msg.channel);
            if (!pattern) {
                msg.reply('No RLE found!');
                return;
            }
            let data = identify(pattern, limit);
            let out = '';
            if (data.period > 0) {
                out += '**Period:** ' + data.period + '\n';
            }
            if (data.disp && (data.disp[0] !== 0 || data.disp[1] !== 0)) {
                out += '**Displacement:** (' + data.disp[0] + ', ' + data.disp[1] + ')\n';
            }
            if (data.stabilizedAt > 0) {
                out += '**Stabilizes at:** ' + data.stabilizedAt + '\n';
            }
            if (data.power !== undefined) {
                out += '**Power:** ' + data.power + '\n';
            }
            if (data.period > 0) {
                let heat = 0;
                let p = data.phases[0];
                for (let q of data.phases.slice(1)) {
                    p = q;
                }
            }
            let minPop = Math.min(...data.pops);
            let avgPop = data.pops.reduce((x, y) => x + y, 0) / data.pops.length;
            let maxPop = Math.min(...data.pops);
            out += '**Populations:** ' + minPop + ' | ' + avgPop + ' | ' + maxPop + '\n';
            if (data.apgcode !== 'PATHOLOGICAL') {
                out += '[';
                if (data.apgcode.length > 31) {
                    out += data.apgcode.slice(0, 14) + '...' + data.apgcode.slice(-14);
                } else {
                    out += data.apgcode;
                }
                out += '](https://catagolue.hatsya.com/object/' + data.apgcode + '/' + toCatagolueRule(pattern.ruleStr) + ')';
            }
            msg.reply({embeds: [new EmbedBuilder().setTitle(data.desc).setDescription(out)]});
        },
    },
};

let config = JSON.parse(fs.readFileSync(import.meta.dirname + '/../config.json').toString());

let client = new Client({intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]});

client.once('clientReady', readyClient => {
    console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on('messageCreate', async msg => {
    if (msg.author.bot) {
        return;
    }
    let data = msg.content;
    if (data.startsWith('!')) {
        let argv = data.slice(1).split(' ');
        let cmd = argv[0].toLowerCase();
        if (cmd in COMMANDS) {
            COMMANDS[cmd].func(msg, argv);
        }
    }
});

client.login(config.token);
