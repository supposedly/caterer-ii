
import {inspect} from 'node:util';
import * as fs from 'node:fs/promises';
import {execSync} from 'node:child_process';
import {parse, identify, Pattern, toCatagolueRule} from '../lifeweb/lib/index.js';
import {Client, GatewayIntentBits, Message, EmbedBuilder} from 'discord.js';
import {createCanvas} from 'canvas';
// @ts-ignore
import CanvasGifEncoder from '@pencil.js/canvas-gif-encoder';


let config = JSON.parse((await fs.readFile(import.meta.dirname + '/../config.json')).toString());

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



interface Help {
    desc: string;
    syntax: string;
}

const HELP: {[key: string]: Help} = {
    help: {
        desc: 'Display a help message',
        syntax: '!help [command]',
    },
    identify: {
        desc: 'Identify a pattern',
        syntax: '!identify [generations]',
    },
    eval: {
        desc: 'Evaluates code',
        syntax: '!eval <code>',
    },
    sim: {
        desc: 'Simulate an RLE and output to GIF',
        syntax: '!sim',
    },
};

let helpMsg = '```ansi\n\x1b[1m\x1b[34mA cellular automata bot for the ConwayLife Lounge Discord server\n\nCommands:\x1b[0m';
let padding = Math.max(...Object.keys(HELP).map(x => x.length));
for (let cmd in HELP) {
    helpMsg += '\n!' + cmd.padEnd(padding) + ' | ' + HELP[cmd].desc;
}
helpMsg += '```';

const COMMANDS: {[key: string]: (msg: Message, argv: string[]) => void | Promise<void>} = {

    async help(msg: Message, argv: string[]): Promise<void> {
        if (argv.length > 1) {
            let cmd = argv.slice(1).join(' ');
            if (cmd.startsWith('!')) {
                cmd = cmd.slice(1);
            }
            if (!(cmd in HELP)) {
                await msg.reply(`No command called !${cmd}`);
            } else {
                await msg.reply('```\n!' + cmd + ' - ' + HELP[cmd].desc + '\n\nSyntax:' + HELP[cmd].syntax + '```');
            }
        } else {
            await msg.reply(helpMsg);
        }
    },

    async identify(msg: Message, argv: string[]): Promise<void> {
        let limit = 256;
        if (argv[1]) {
            let parsed = parseInt(argv[1]);
            if (!Number.isNaN(parsed)) {
                limit = parsed;
            }
        }
        let pattern = await findRLE(msg.channel);
        if (!pattern) {
            throw new Error('Cannot find RLE');
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
        await msg.reply({embeds: [new EmbedBuilder().setTitle(data.desc).setDescription(out)]});
    },

    async eval(msg: Message, argv: string[]): Promise<void> {
        if (config.admins.includes(msg.author.id)) {
            let code = argv.slice(1).join(' ');
            if (!code.includes(';') && !code.includes('\n')) {
                code = 'return ' + code;
            }
            let out = (new Function('client', 'parse', 'identify', 'Pattern', '"use strict";' + code))(client, parse, identify, Pattern);
            await msg.reply('```ansi\n' + inspect(out, {
                colors: true,
                depth: 3, 
            }) + '```');
        } else {
            await msg.reply('nice try');
        }
    },

    async sim(msg: Message, argv: string[]): Promise<void> {
        let parts: string[][] = [];
        let currentPart: string[] = [];
        for (let arg of argv.slice(1)) {
            if (arg === '>') {
                parts.push(currentPart);
                currentPart = [];
            } else {
                currentPart.push(arg);
            }
        }
        parts.push(currentPart);
        let pattern = await findRLE(msg.channel);
        if (!pattern) {
            throw new Error('Cannot find RLE');
        }
        let frames: Pattern[] = [pattern.copy()];
        for (let part of parts) {
            let num = parseInt(part[0]);
            if (!Number.isNaN(num)) {
                for (let i = 1; i < num; i++) {
                    pattern.runGeneration();
                    frames.push(pattern.copy());
                }
            } else {
                throw new Error(`Invalid !sim command: ${part.join(' ')}`);
            }
        }
        let minX = Math.min(...frames.map(p => p.xOffset)) - 1;
        let maxX = Math.max(...frames.map(p => p.width + p.xOffset)) + 1;
        let minY = Math.min(...frames.map(p => p.yOffset)) - 1;
        let maxY = Math.max(...frames.map(p => p.height + p.yOffset)) + 1;
        let width = maxX - minX;
        let height = maxY - minY;
        let scale = Math.ceil(300 / Math.max(width, height));
        let canvas = createCanvas(width * scale, height * scale);
        let ctx = canvas.getContext('2d');
        ctx.fillStyle = '#36393e';
        ctx.fillRect(0, 0, width * scale, height * scale);
        let encoder = new CanvasGifEncoder(canvas.width, canvas.height, {
            alphaThreshold: 0,
            quality: 1,
        });
        let frameTime = Math.ceil(500 / frames.length) * 10;
        for (let p of frames) {
            let i = 0;
            let startY = p.yOffset - minY;
            let startX = p.xOffset - minX;
            ctx.fillStyle = '#36393e';
            ctx.fillRect(0, 0, width * scale, height * scale);
            for (let y = startY; y < startY + p.height; y++) {
                for (let x = startX; x < startX + p.width; x++) {
                    ctx.fillStyle = p.data[i++] ? '#ffffff' : '#36393e';
                    ctx.fillRect(x * scale, y * scale, scale, scale);
                }
            }
            encoder.addFrame(ctx, frameTime);
        }
        let gif = encoder.end();
        encoder.flush();
        await fs.writeFile('sim.gif', gif);
        await msg.reply({
            files: ['sim.gif'],
        });
    },

};


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
            try {
                await COMMANDS[cmd](msg, argv);
            } catch (error) {
                await msg.reply('`' + String(error) + '`');
                if (error && typeof error === 'object' && 'stack' in error) {
                    console.log(error.stack);
                }
            }
        }
    }
});

client.login(config.token);
