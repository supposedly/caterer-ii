
/// <reference path="./pencil.js__canvas-gif-encoder.d.ts" />

import {execSync} from 'node:child_process';
import {Pattern, CoordPattern, Identified, FullIdentified, identify, findMinmax, getDescription, fullIdentify, createPattern, toCatagolueRule} from '../lifeweb/lib/index.js';
import {EmbedBuilder} from 'discord.js';
import {BotError, Message, Response, writeFile, names, simStats, findRLE} from './util.js';
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
        if ('heat' in type) {
            out += '**Heat:** ' + type.heat + '\n';
        }
        if ('temperature' in type) {
            out += '**Temperature:** ' + type.temperature + '\n';
        }
        if ('volatility' in type) {
            out += '**Volatility:** ' + type.volatility + '\n';
        }
        if ('strictVolatility' in type) {
            out += '**Strict volatility:** ' + type.strictVolatility + '\n';
        }
    }
    if (type.apgcode !== 'PATHOLOGICAL') {
        out += '[';
        if (type.apgcode.length > 31) {
            out += type.apgcode.slice(0, 14) + '...' + type.apgcode.slice(-14);
        } else {
            out += type.apgcode;
        }
        out += '](https://catagolue.hatsya.com/object/' + type.apgcode + '/' + toCatagolueRule(type.phases[0].ruleStr) + ')';
    }
    let title = 'desc' in type ? type.desc : getDescription(type);
    let name = names.get(type.apgcode);
    if (name !== undefined) {
        title = name[0].toUpperCase() + name.slice(1) + ' (' + title + ')';
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
    let pattern = await findRLE(msg);
    if (!pattern) {
        throw new BotError('Cannot find RLE');
    }
    return {embeds: embedIdentified(fullIdentify(pattern, limit))};
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
    let pattern = await findRLE(msg);
    if (!pattern) {
        throw new BotError('Cannot find RLE');
    }
    return {embeds: embedIdentified(identify(pattern, limit))};
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
    let pattern = await findRLE(msg);
    if (!pattern) {
        throw new BotError('Cannot find RLE');
    }
    let [min, max] = findMinmax(pattern, gens);
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
    let pattern: Pattern;
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
        pattern = createPattern(rule);
        let size = height * width;
        let data = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            data[i] = Math.floor(Math.random() * pattern.states);
        }
        pattern.setData(data, height, width);
    } else {
        let p = await findRLE(msg);
        if (!p) {
            throw new BotError('Cannot find RLE');
        }
        pattern = p;
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
    let frames: [Pattern, number][] = [[pattern.copy(), frameTime]];
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
                    pattern.run(part[1]);
                    frames.push([pattern.copy(), frameTime]);
                }
            } else if (typeof part[1] === 'string') {
                throw new BotError(`Invalid part: ${part.join(' ')}`);
            } else {
                for (let i = parts.length > 1 ? 0 : 1; i < part[0]; i++) {
                    pattern.runGeneration();
                    frames.push([pattern.copy(), frameTime]);
                }
            }
        } else if (part[0] === 'wait') {
            if (typeof part[1] !== 'number' || part.length > 2) {
                throw new BotError(`Invalid part: ${part.join(' ')}`);
            }
            for (let i = 0; i < part[1]; i++) {
                frames.push([pattern.copy(), frameTime]);
            }
        } else if (part[0] === 'jump') {
            if (typeof part[1] !== 'number' || part.length > 2) {
                throw new BotError(`Invalid part: ${part.join(' ')}`);
            }
            pattern.run(part[1]);
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
    let debug = minX + ' ' + maxX + ' ' + minY + ' ' + maxY + '\n';
    let width = maxX - minX + 1;
    let height = maxY - minY + 1;
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
            debug += p.xOffset + ' ' + p.yOffset + ' ' + (p.xOffset + p.width) + ' ' + (p.yOffset + p.height);
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
                    array[j++] = 0xff;
                    if (p.states > 2) {
                        array[j++] = Math.ceil(value / p.states * 256) - 1;
                        array[j++] = 0;
                    } else {
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
    let scale = Math.ceil(gifSize / Math.min(width, height));
    gifSize = Math.min(width, height) * scale;
    execSync(`gifsicle --resize-${width < height ? 'width' : 'height'} ${gifSize} sim_base.gif > sim.gif`);
    if (pattern.ruleStr in simStats) {
        simStats[pattern.ruleStr]++;
    } else {
        simStats[pattern.ruleStr] = 1;
    }
    simCounter++;
    if (simCounter === 16) {
        simCounter = 0;
        await writeFile('data/sim_stats.json', JSON.stringify(simStats, undefined, 4));
    }
    if (outputTime) {
        let total = Math.round(performance.now() - start) / 1000;
        let parse = Math.round(middle - start) / 1000;
        return {
            content: `Took ${total} seconds (${parse} to parse)`,
            files: ['sim.gif'],
        };
    } else {
        return {content: debug, files: ['sim.gif']};
    }
}
