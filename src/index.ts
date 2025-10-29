
import {inspect} from 'node:util';
import * as fs from 'node:fs/promises';
import {parse, identify, Pattern, toCatagolueRule, createPattern, MAPPattern, mapMinmax} from '../lifeweb/lib/index.js';
import {Client, GatewayIntentBits, Message, EmbedBuilder} from 'discord.js';
import {createCanvas} from 'canvas';
// @ts-ignore
import CanvasGifEncoder from '@pencil.js/canvas-gif-encoder';


let config = JSON.parse((await fs.readFile(import.meta.dirname + '/../config.json')).toString());

let dyks = (await fs.readFile(import.meta.dirname + '/../dyk.txt')).toString().split('\n').slice(1);

let simStats = JSON.parse((await fs.readFile(import.meta.dirname + '/../sim_stats.json')).toString());

let names = new Map((await fs.readFile(import.meta.dirname + '/../names.txt')).toString().split('\n').map(x => x.split(' ')).map(x => [x[0], x.slice(1).join(' ')]));
const NAME_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789~!@#$%^&*()-=_+[]\\{}|;\':",./<>? ';

const RLE_HEADER = /\s*x\s*=\s*\d+\s*,?\s*y\s*=\s*\d+/;

function findRLEFromText(data: string): Pattern | undefined {
    let match = RLE_HEADER.exec(data);
    if (!match) {
        return;
    }
    data = data.slice(match.index);
    let index = data.indexOf('!');
    if (index === -1) {
        return;
    }
    return parse(data.slice(0, index + 1));
}

async function findRLEFromMessage(msg: Message): Promise<Pattern | undefined> {
    let out = findRLEFromText(msg.content);
    if (out) {
        return out;
    }
    if (msg.attachments.size > 0) {
        let attachment = msg.attachments.first();
        if (attachment) {
            let data = await (await fetch(attachment.url)).text();
            return findRLEFromText(data);
        }
    }
}

async function findRLE(msg: Message): Promise<Pattern | undefined> {
    let out = await findRLEFromMessage(msg);
    if (out) {
        return out;
    }
    if (msg.reference) {
        let reply = await msg.fetchReference();
        out = await findRLEFromMessage(reply);
        if (out) {
            return out;
        }
    }
    let msgs = await msg.channel.messages.fetch({limit: 50});
    for (let msg of msgs) {
        if (out = await findRLEFromMessage(msg[1])) {
            return out;
        }
    }
}

function parseSpeed(speed: string): {p: number, x: number, y: number} {
    if (!speed.includes('c')) {
        throw new Error('Invalid speed!');
    }
    let [disp, period] = speed.split('c');
    if (period.startsWith('/')) {
        period = period.slice(1);
    }
    let p = parseInt(period);
    let x: number;
    let y: number;
    let num = parseInt(disp);
    if (!Number.isNaN(num)) {
        x = num;
        if (period.endsWith('d')) {
            y = num;
        } else {
            y = 0;
        }
    } else if (disp.startsWith('(')) {
        let parts = disp.slice(1, -1).split(',');
        x = parseInt(parts[0]);
        y = parseInt(parts[1]);
        if (Number.isNaN(x) || Number.isNaN(y) || parts.length !== 2) {
            throw new Error('Invalid speed!');
        }
    } else if (disp === '') {
        x = 1;
        if (period.endsWith('d')) {
            y = 1;
        } else {
            y = 0;
        }
    } else {
        throw new Error('Invalid speed!');
    }
    return {p, x, y};
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
        syntax: '!sim [parts]',
    },
    sssss: {
        desc: 'Query the 5S database',
        syntax: '!sssss <speed>',
    },
    '5s': {
        desc: 'Alias for !sssss',
        syntax: '!5s <speed>',
    },
    name: {
        desc: 'Find or set the name of a pattern',
        syntax: '!name [new name]',
    },
    sim_stats: {
        desc: 'Get statistics on the most popular rules used by !sim',
        syntax: '!sim_stats [page]',
    },
    save_sim_stats: {
        desc: 'Save the sim stats (accepterer only)',
        syntax: '!save_sim_stats',
    },
};

let helpMsg = '```ansi\n\x1b[1m\x1b[34mA cellular automata bot for the ConwayLife Lounge Discord server\n\nCommands:\x1b[0m';
let padding = Math.max(...Object.keys(HELP).map(x => x.length));
for (let cmd in HELP) {
    helpMsg += '\n!' + cmd.padEnd(padding) + ' | ' + HELP[cmd].desc;
}
helpMsg += '```';

let simCounter = 0;

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
                await msg.reply('```\n!' + cmd + ' - ' + HELP[cmd].desc + '\n\nSyntax: ' + HELP[cmd].syntax + '```');
            }
        } else {
            await msg.reply(helpMsg);
        }
    },

    async identify(msg: Message, argv: string[]): Promise<void> {
        let limit = 256;
        if (argv[1]) {
            let parsed = parseFloat(argv[1]);
            if (!Number.isNaN(parsed)) {
                limit = parsed;
            }
        }
        let pattern = await findRLE(msg);
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
        let maxPop = Math.max(...data.pops);
        out += '**Populations:** ' + minPop + ' | ' + (Math.round(avgPop * 100) / 100) + ' | ' + maxPop + '\n';
        if (pattern instanceof MAPPattern) {
            let [min, max] = mapMinmax(pattern, data, limit);
            out += '**Min:** ' + min + '\n';
            out += '**Max:** ' + max + '\n';
        }
        if (data.apgcode !== 'PATHOLOGICAL') {
            out += '[';
            if (data.apgcode.length > 31) {
                out += data.apgcode.slice(0, 14) + '...' + data.apgcode.slice(-14);
            } else {
                out += data.apgcode;
            }
            out += '](https://catagolue.hatsya.com/object/' + data.apgcode + '/' + toCatagolueRule(pattern.ruleStr) + ')';
        }
        let title = data.desc;
        let name = names.get(data.apgcode);
        if (name !== undefined) {
            title = name[0].toUpperCase() + name.slice(1) + ' (' + title + ')';
        }
        await msg.reply({embeds: [new EmbedBuilder().setTitle(title).setDescription(out)]});
    },

    async eval(msg: Message, argv: string[]): Promise<void> {
        if (config.admins.includes(msg.author.id)) {
            let code = argv.slice(1).join(' ');
            if (!code.includes(';') && !code.includes('\n')) {
                code = 'return ' + code;
            }
            let out = (new Function('client', 'parse', 'identify', 'Pattern', 'createPattern', '"use strict";' + code))(client, parse, identify, Pattern, createPattern);
            await msg.reply('```ansi\n' + inspect(out, {
                colors: true,
                depth: 2, 
            }) + '```');
        } else {
            await msg.reply('nice try');
        }
    },

    async sim(msg: Message, argv: string[]): Promise<void> {
        let parts: (string | number)[][] = [];
        let currentPart: (string | number)[] = [];
        for (let arg of argv.slice(1)) {
            if (arg === '>') {
                parts.push(currentPart);
                currentPart = [];
            } else {
                let num = parseInt(arg);
                if (Number.isNaN(num)) {
                    currentPart.push(arg);
                } else {
                    currentPart.push(num);
                }
            }
        }
        parts.push(currentPart);
        let pattern = await findRLE(msg);
        if (!pattern) {
            throw new Error('Cannot find RLE');
        }
        let frameTime = 50;
        let frames: [Pattern, number][] = [[pattern.copy(), frameTime]];
        let size = 100;
        for (let part of parts) {
            if (part[1] === 'fps' && typeof part[0] === 'number') {
                frameTime = Math.ceil(100 / part[0]) * 10;
                part = part.slice(2);
            }
            if (part[0] === 'size' && typeof part[1] === 'number') {
                size = part[1];
                part = part.slice(2);
            }
            if (typeof part[0] === 'number') {
                if (typeof part[1] === 'number') {
                    for (let i = parts.length > 1 ? 0 : 1; i < Math.ceil(part[0] / part[1]); i++) {
                        pattern.run(part[1]);
                        frames.push([pattern.copy(), frameTime]);
                    }
                } else if (typeof part[1] === 'string') {
                    throw new Error(`Invalid !sim command: ${part.join(' ')}`);
                } else {
                    for (let i = parts.length > 1 ? 0 : 1; i < part[0]; i++) {
                        pattern.runGeneration();
                        frames.push([pattern.copy(), frameTime]);
                    }
                }
            } else if (part[0] === 'wait') {
                if (typeof part[1] !== 'number' || part.length > 2) {
                    throw new Error(`Invalid !sim command: ${part.join(' ')}`);
                }
                for (let i = 0; i < part[1]; i++) {
                    frames.push([pattern.copy(), frameTime]);
                }
            } else if (part[0] !== undefined) {
                throw new Error(`Invalid !sim command: ${part.join(' ')}`);
            }
        }
        let minX = Math.min(...frames.map(([p]) => p.xOffset)) - 1;
        let maxX = Math.max(...frames.map(([p]) => p.width + p.xOffset)) + 1;
        let minY = Math.min(...frames.map(([p]) => p.yOffset)) - 1;
        let maxY = Math.max(...frames.map(([p]) => p.height + p.yOffset)) + 1;
        let width = maxX - minX;
        let height = maxY - minY;
        let scale = Math.ceil(size / Math.min(width, height));
        let canvas = createCanvas(width * scale, height * scale);
        let ctx = canvas.getContext('2d');
        ctx.fillStyle = '#36393e';
        ctx.fillRect(0, 0, width * scale, height * scale);
        let encoder = new CanvasGifEncoder(canvas.width, canvas.height, {
            alphaThreshold: 0,
            quality: 1,
        });
        for (let [p, frameTime] of frames) {
            let i = 0;
            let startY = p.yOffset - minY;
            let startX = p.xOffset - minX;
            ctx.fillStyle = '#36393e';
            ctx.fillRect(0, 0, width * scale, height * scale);
            for (let y = startY; y < startY + p.height; y++) {
                for (let x = startX; x < startX + p.width; x++) {
                    let value = p.data[i++];
                    if (value) {
                        if (p.states > 2) {
                            ctx.fillStyle = '#ff' + (Math.ceil(value / p.states * 256) - 1).toString(16).padStart(2, '0') + '00';
                        } else {
                            ctx.fillStyle = '#ffffff';
                        }
                        ctx.fillRect(x * scale, y * scale, scale, scale);
                    }
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
        if (pattern.ruleStr in simStats) {
            simStats[pattern.ruleStr]++;
        } else {
            simStats[pattern.ruleStr] = 1;
        }
        simCounter++;
        if (simCounter === 16) {
            simCounter = 0;
            await fs.writeFile(import.meta.dirname + '/../sim_stats.json', JSON.stringify(simStats, undefined, 4));
        }
    },

    async sssss(msg: Message, argv: string[]): Promise<void> {
        let speed = parseSpeed(argv.slice(1).join(' '));
        speed.x = Math.abs(speed.x);
        speed.y = Math.abs(speed.y);
        if (speed.x < speed.y) {
            let temp = speed.y;
            speed.y = speed.x;
            speed.x = temp;
        }
        let file = import.meta.dirname + '/../sssss/data/'
        if (speed.y === 0) {
            file += 'Orthogonal';
        } else if (speed.x === speed.y) {
            file += 'Diagonal';
        } else {
            file += 'Oblique';
        }
        file += ' ships.sss.txt';
        let data = (await fs.readFile(file)).toString().split('\n');
        for (let line of data) {
            let [pop, rule, dx, dy, period, rle] = line.split(', ');
            if (speed.p === parseInt(period) && speed.x === parseInt(dx) && speed.y === parseInt(dy)) {
                rle = parse(`x = 0, y = 0, rule = ${rule}\n${rle}`).toRLE();
                await msg.reply(`\`\`\`\n#C (${dx}, ${dy})c/${period}, population ${pop}\n${rle}\`\`\``);
                return;
            }
        }
        await msg.reply('No such ship found in database!');
    },

    async '5s'(msg: Message, argv: string[]): Promise<void> {
        await COMMANDS.sssss(msg, argv);
    },

    async dyk(msg: Message): Promise<void> {
        let num = Math.floor(Math.random() * dyks.length);
        let out = '**#' + (num + 1) + ':** ' + dyks[num] + '\n\n-# Licensed under the [GNU Free Documentation License 1.2](https://www.gnu.org/licenses/fdl-1.3.html)';
        await msg.reply({
            embeds: [new EmbedBuilder().setTitle('Did you know...').setDescription(out)],
        });
    },

    async ping(msg: Message): Promise<void> {
        let msg2 = await msg.reply('Pong!');
        msg2.edit(`Pong! Latency: ${Math.round(msg2.createdTimestamp - msg.createdTimestamp)} ms (Discord WebSocket: ${Math.round(client.ws.ping)} ms)`)
    },

    async pig(msg: Message): Promise<void> {
        if (msg.reference) {
            await (await msg.fetchReference()).react('🐷');
        } else {
            await msg.react('🐷');
        }
    },

    async name(msg: Message, argv: string[]): Promise<void> {
        let pattern = await findRLE(msg);
        if (!pattern) {
            throw new Error('Cannot find RLE');
        }
        let apgcode = identify(pattern, 4096).apgcode;
        if (!apgcode.startsWith('x') || apgcode.startsWith('y')) {
            throw new Error(`Apgcode is ${apgcode}`);
        }
        let newName = argv.slice(1).join(' ');
        if (newName === '') {
            let name = names.get(apgcode);
            if (name !== undefined) {
                await msg.reply(name);
            } else {
                await msg.reply('Pattern is not named');
            }
            return;
        }
        if (!msg.member) {
            throw new Error('bruh');
        }
        if (!msg.member.roles.cache.find(role => role.id === config.accepterer) && !config.admins.includes(msg.author.id)) {
            throw new Error('You are not an accepterer');
        }
        if (!Array.from(newName).every(x => NAME_CHARS.includes(x))) {
            throw new Error('Invalid name!');
        }
        if (names.has(apgcode)) {
            await msg.reply('Renamed `' + names.get(apgcode) + '` to `' + newName + '`');
        } else {
            await msg.reply('Set name to `' + newName + '`');
        }
        names.set(apgcode, newName);
        await fs.writeFile(import.meta.dirname + '/../names.txt', Array.from(names.entries()).map(x => x[0] + ' ' + x[1]).join('\n'));
    },

    async sim_stats(msg: Message, argv: string[]): Promise<void> {
        let page = argv[1] ? parseInt(argv[1]) - 1 : 0;
        if (Number.isNaN(page)) {
            throw new Error('Invalid page number');
        }
        let data = Object.entries(simStats).sort((x, y) => (x[1] as any) - (y[1] as any)).slice(page, page + 10);
        let out = data.map(x => x[0] + ': ' + x[1]).join('\n');
        if (out === '') {
            out = 'No data!';
        }
        await msg.reply({
            embeds: [new EmbedBuilder().setTitle('Most popular rules (page ' + (page + 1) + ')').setDescription(out)],
        });
    },

    async save_sim_stats(msg: Message, argv: string[]): Promise<void> {
        if (!msg.member) {
            throw new Error('bruh');
        }
        if (!msg.member.roles.cache.find(role => role.id === config.accepterer) && !config.admins.includes(msg.author.id)) {
            throw new Error('You are not an accepterer');
        }
        await fs.writeFile(import.meta.dirname + '/../sim_stats.json', JSON.stringify(simStats, undefined, 4));
        await msg.reply('Saved');
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
                await msg.channel.sendTyping();
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
