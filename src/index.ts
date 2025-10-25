
import * as fs from 'node:fs';
import {parse, identify} from '../lifeweb/lib/index.js';
import {Client, GatewayIntentBits, Message} from 'discord.js';


interface Command {
    help: string;
    func(msg: Message, argv: string[]): void;
}

const COMMANDS: {[key: string]: Command} = {
    identify: {
        help: 'Identifies a pattern',
        func(msg: Message, argv: string[]): void {
            let data = identify(parse(`x = 3, y = 3, rule = B3/S23\nbo$2bo$3o!`), 256);
            msg.reply(JSON.stringify({
                rle: data.rle,
                apgcode: data.apgcode,
                stabilizedAt: data.stabilizedAt,
                desc: data.desc,
                period: data.period,
                disp: data.disp,
                power: data.power,
                pops: data.pops,
            }, undefined, 4));
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
