
/// <reference path="./pencil.js__canvas-gif-encoder.d.ts" />

import {execSync} from 'node:child_process';
import {Pattern, CoordPattern, TreePattern, Identified, FullIdentified, identify, findMinmax, getDescription, fullIdentify, createPattern, toCatagolueRule, getHashsoup} from '../lifeweb/lib/index.js';
import {EmbedBuilder} from 'discord.js';
import {BotError, Message, Response, writeFile, names, aliases, simStats, findRLE} from './util.js';
import CanvasGifEncoder from '@pencil.js/canvas-gif-encoder';


function embedIdentified(type: Identified | FullIdentified, isOutput?: boolean): EmbedBuilder[] {
    let out = '';
    if (type.period > 0) {
        out += '**Period:** ' + type.period + '\n';
    }
    if (type.disp && (type.disp[0] !== 0 || type.disp[1] !== 0)) {
        out += '**Displacement:** (' + type.disp[0] + ', ' + type.disp[1] + ')\n';
    }
    if (type.stabilizedAt > 0) {
        out += '**Stabilizes at:** ' + type.stabilizedAt + '\n';
    }
    if (type.power !== undefined) {
        out += '**Power:** ' + type.power + '\n';
    }
    let pops: number[];
    if (type.period > 0) {
        pops = type.pops.slice(0, type.stabilizedAt + type.period);
    } else {
        pops = type.pops;
    }
    let minPop = Math.min(...pops);
    let avgPop = pops.reduce((x, y) => x + y, 0) / pops.length;
    let maxPop = Math.max(...pops);
    out += '**Populations:** ' + minPop + ' | ' + (Math.round(avgPop * 100) / 100) + ' | ' + maxPop + '\n';
    if ('minmax' in type && type.minmax) {
        out += '**Min:** ' + type.minmax[0] + '\n';
        out += '**Max:** ' + type.minmax[1] + '\n';
    }
    if (type.period > 1) {
        if ('heat' in type && type.heat !== undefined) {
            out += '**Heat:** ' + (Math.round(type.heat * 1000) / 1000) + '\n';
        }
        if ('temperature' in type && type.temperature !== undefined) {
            out += '**Temperature:** ' + (Math.round(type.temperature * 1000) / 1000) + '\n';
        }
        if ('volatility' in type && type.volatility !== undefined) {
            out += '**Volatility:** ' + (Math.round(type.volatility * 1000) / 1000) + '\n';
        }
        if ('strictVolatility' in type && type.strictVolatility !== undefined) {
            out += '**Strict volatility:** ' + (Math.round(type.strictVolatility * 1000) / 1000) + '\n';
        }
    }
    if (type.apgcode !== 'PATHOLOGICAL') {
        out += '[';
        let apgcode = type.apgcode;
        if (apgcode.length > 1280) {
            apgcode = 'ov_' + apgcode.slice(1, apgcode.indexOf('_'));
        }
        if (apgcode.length > 31) {
            out += apgcode.slice(0, 14) + '...' + apgcode.slice(-14);
        } else {
            out += apgcode;
        }
        out += '](https://catagolue.hatsya.com/object/' + apgcode + '/' + toCatagolueRule(type.phases[0].ruleStr) + ')';
    }
    let title = 'desc' in type ? type.desc : getDescription(type);
    let name = names.get(type.apgcode);
    if (name !== undefined) {
        if (type.stabilizedAt > 0) {
            title = 'Stabilizes into ' + name + ' (' + title + ')';
        } else {
            title = name[0].toUpperCase() + name.slice(1) + ' (' + title + ')';
        }
    } else if (type.stabilizedAt > 0) {
        title = 'Stabilizes into ' + title;
    }
    if (isOutput) {
        title = 'Output: ' + title;
    }
    let embeds = [new EmbedBuilder().setTitle(title).setDescription(out)];
    if ('output' in type && type.output) {
        embeds.push(...embedIdentified(type.output, true));
    }
    return embeds;
}

export async function cmdIdentify(msg: Message, argv: string[]): Promise<Response> {
    await msg.channel.sendTyping();
    let limit = 256;
    if (argv[1]) {
        let parsed = parseFloat(argv[1]);
        if (!Number.isNaN(parsed)) {
            limit = parsed;
        }
    }
    let data = await findRLE(msg);
    if (!data) {
        throw new BotError('Cannot find RLE');
    }
    return {embeds: embedIdentified(fullIdentify(data.p, limit))};
}

export async function cmdBasicIdentify(msg: Message, argv: string[]): Promise<Response> {
    await msg.channel.sendTyping();
    let limit = 256;
    if (argv[1]) {
        let parsed = parseFloat(argv[1]);
        if (!Number.isNaN(parsed)) {
            limit = parsed;
        }
    }
    let data = await findRLE(msg);
    if (!data) {
        throw new BotError('Cannot find RLE');
    }
    return {embeds: embedIdentified(identify(data.p, limit))};
}

export async function cmdMinmax(msg: Message, argv: string[]): Promise<Response> {
    await msg.channel.sendTyping();
    if (!argv[1]) {
        throw new BotError('Expected 1 argument');
    }
    let gens = parseInt(argv[1]);
    if (Number.isNaN(gens)) {
        throw new BotError('Argument 1 is not a valid number');
    }
    let data = await findRLE(msg);
    if (!data) {
        throw new BotError('Cannot find RLE');
    }
    let [min, max] = findMinmax(data.p, gens);
    return `Min: ${min}\nMax: ${max}`;
}


let simCounter = 0;

export async function cmdSim(msg: Message, argv: string[]): Promise<Response> {
    let start = performance.now();
    await msg.channel.sendTyping();
    let parts: (string | number)[][] = [];
    let currentPart: (string | number)[] = [];
    let outputTime = false;
    if (argv[1] === 'time') {
        outputTime = true;
        argv = argv.slice(1);
    }
    let p: Pattern;
    let replyTo: Message;
    if (argv[1] === 'rand') {
        let height = 16;
        let width = 16;
        if (argv[2].match(/^\d+x\d+$/)) {
            let data = argv[2].split('x');
            width = parseInt(data[0]);
            height = parseInt(data[1]);
            argv = argv.slice(1);
        }
        let rule = argv[2];
        argv = argv.slice(2);
        p = createPattern(rule);
        let size = height * width;
        let data = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            data[i] = Math.floor(Math.random() * p.states);
        }
        p.setData(data, height, width);
        replyTo = msg;
    } else {
        let data = await findRLE(msg);
        if (!data) {
            throw new BotError('Cannot find RLE');
        }
        p = data.p;
        replyTo = data.msg;
    }
    for (let arg of argv.slice(1)) {
        if (arg === '>') {
            parts.push(currentPart);
            currentPart = [];
        } else {
            let num = parseFloat(arg);
            if (Number.isNaN(num)) {
                currentPart.push(arg);
            } else {
                currentPart.push(num);
            }
        }
    }
    parts.push(currentPart);
    let frameTime = 50;
    if (parts[0] && parts[0][1] === 'fps' && typeof parts[0][0] === 'number') {
        frameTime = Math.ceil(100 / parts[0][0]) * 10;
    }
    let frames: [Pattern, number][] = [[p.copy(), frameTime]];
    let gifSize = 100;
    for (let part of parts) {
        if (part[1] === 'fps' && typeof part[0] === 'number') {
            frameTime = Math.ceil(100 / part[0]) * 10;
            part = part.slice(2);
        }
        if (part[0] === 'size' && typeof part[1] === 'number') {
            gifSize = part[1];
            part = part.slice(2);
        }
        if (typeof part[0] === 'number') {
            if (typeof part[1] === 'number') {
                for (let i = parts.length > 1 ? 0 : 1; i < Math.ceil(part[0] / part[1]); i++) {
                    p.run(part[1]);
                    frames.push([p.copy(), frameTime]);
                }
            } else if (typeof part[1] === 'string') {
                throw new BotError(`Invalid part: ${part.join(' ')}`);
            } else {
                for (let i = parts.length > 1 ? 0 : 1; i < part[0]; i++) {
                    p.runGeneration();
                    frames.push([p.copy(), frameTime]);
                }
            }
        } else if (part[0] === 'wait') {
            if (typeof part[1] !== 'number' || part.length > 2) {
                throw new BotError(`Invalid part: ${part.join(' ')}`);
            }
            for (let i = 0; i < part[1]; i++) {
                frames.push([p.copy(), frameTime]);
            }
        } else if (part[0] === 'jump') {
            if (typeof part[1] !== 'number' || part.length > 2) {
                throw new BotError(`Invalid part: ${part.join(' ')}`);
            }
            p.run(part[1]);
        } else if (part[0] !== undefined) {
            throw new BotError(`Invalid part: ${part.join(' ')}`);
        }
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let [p] of frames) {
        if (p instanceof CoordPattern) {
            let data = p.getMinMaxCoords();
            if (data.minX < minX) {
                minX = data.minX;
            }
            if (data.maxX > maxX) {
                maxX = data.maxX;
            }
            if (data.minY < minY) {
                minY = data.minY;
            }
            if (data.maxY > maxY) {
                maxY = data.maxY;
            }
        } else {
            if (p.xOffset < minX) {
                minX = p.xOffset;
            }
            if (p.xOffset + p.width > maxX) {
                maxX = p.xOffset + p.width;
            }
            if (p.yOffset < minY) {
                minY = p.yOffset;
            }
            if (p.yOffset + p.height > maxY) {
                maxY = p.yOffset + p.height;
            }
        }
    }
    minX--;
    maxX++;
    minY--;
    maxY++;
    let width = maxX - minX;
    let height = maxY - minY;
    if (p instanceof CoordPattern) {
        width++;
        height++;
    }
    let size = width * height;
    let array = new Uint8ClampedArray(size * 4);
    let empty = new Uint8ClampedArray(size * 4);
    let j = 0;
    for (let i = 0; i < size; i++) {
        empty[j++] = 0x36;
        empty[j++] = 0x39;
        empty[j++] = 0x3e;
        empty[j++] = 0;
    }
    let encoder = new CanvasGifEncoder(width, height, {
        alphaThreshold: 0,
        quality: 1,
    });
    let middle = performance.now();
    for (let [p, frameTime] of frames) {
        let startY: number;
        let startX: number;
        if (p instanceof CoordPattern) {
            let data = p.getMinMaxCoords();
            startY = data.minY - minY;
            startX = data.minX - minX;
        } else {
            startY = p.yOffset - minY;
            startX = p.xOffset - minX;
        }
        array.set(empty);
        let i = 0;
        let j = startY * width * 4;
        let pData = p.getData();
        for (let y = startY; y < startY + p.height; y++) {
            j += startX * 4;
            for (let x = startX; x < startX + p.width; x++) {
                let value = pData[i++];
                if (value) {
                    if (p instanceof TreePattern && p.rule.colors && p.rule.colors[value]) {
                        let [r, g, b] = p.rule.colors[value];
                        array[j++] = r;
                        array[j++] = g;
                        array[j++] = b;
                    } else if (p.states > 2) {
                        array[j++] = 0xff;
                        array[j++] = Math.ceil((value - 1) / (p.states - 2) * 256) - 1;
                        array[j++] = 0;
                    } else {
                        array[j++] = 0xff;
                        array[j++] = 0xff;
                        array[j++] = 0xff;
                    }
                    array[j++] = 0;
                } else {
                    j += 4;
                }
            }
            j += (width - startX - p.width) * 4;
        }
        encoder.addFrame({height, width, data: array}, frameTime);
    }
    let gif = encoder.end();
    encoder.flush();
    await writeFile('sim_base.gif', gif);
    let dim = Math.min(width, height);
    let scale = Math.ceil(gifSize / dim);
    if (scale * dim > 500) {
        if (scale > 1) {
            while (scale * dim > 500) {
                scale--;
            }
        } else {
            let div = 1;
            while (dim / div > 500) {
                div++;
            }
            scale = 1/div;
        }
    }
    gifSize = Math.ceil(scale * dim);
    execSync(`gifsicle --resize-${width < height ? 'width' : 'height'} ${gifSize} sim_base.gif > sim.gif`);
    if (p.ruleStr in simStats) {
        simStats[p.ruleStr]++;
    } else {
        simStats[p.ruleStr] = 1;
    }
    simCounter++;
    if (simCounter === 16) {
        simCounter = 0;
        await writeFile('data/sim_stats.json', JSON.stringify(simStats, undefined, 4));
    }
    if (outputTime) {
        let total = Math.round(performance.now() - start) / 1000;
        let parse = Math.round(middle - start) / 1000;
        await replyTo.reply({
            content: `Took ${total} seconds (${parse} to parse)`,
            files: ['sim.gif'],
            allowedMentions: {repliedUser: false},
        });
    } else {
        await replyTo.reply({
            files: ['sim.gif'],
            allowedMentions: {repliedUser: false},
        });
    }
}


export async function cmdHashsoup(msg: Message, argv: string[]): Promise<Response> {
    return createPattern(argv[1], await getHashsoup(argv[3], argv[2]), aliases).toRLE();
}

export async function cmdApgencode(msg: Message, argv: string[]): Promise<Response> {
    let data = await findRLE(msg);
    if (!data) {
        throw new BotError('Cannot find RLE');
    }
    return data.p.toApgcode();
}

let lifePattern = createPattern('B3/S23');

export async function cmdApgdecode(msg: Message, argv: string[]): Promise<Response> {
    if (!argv[2]) {
        return lifePattern.loadApgcode(argv[1]).toRLE();
    } else {
        return createPattern(argv[2], undefined, aliases).loadApgcode(argv[1]).toRLE();
    }
}
