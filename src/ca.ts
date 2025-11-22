
/// <reference path="./pencil.js__canvas-gif-encoder.d.ts" />

import {execSync} from 'node:child_process';
import {Pattern, FullIdentified, fullIdentify, createPattern, toCatagolueRule} from '../lifeweb/lib/index.js';
import {EmbedBuilder} from 'discord.js';
import {Message, Response, writeFile, names, simStats, findRLE} from './util.js';
import CanvasGifEncoder from '@pencil.js/canvas-gif-encoder';


function embedIdentified(data: FullIdentified, isOutput?: boolean): EmbedBuilder[] {
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
    let pops: number[];
    if (data.period > 0) {
        pops = data.pops.slice(0, data.period);
    } else {
        pops = data.pops;
    }
    let minPop = Math.min(...pops);
    let avgPop = pops.reduce((x, y) => x + y, 0) / pops.length;
    let maxPop = Math.max(...pops);
    out += '**Populations:** ' + minPop + ' | ' + (Math.round(avgPop * 100) / 100) + ' | ' + maxPop + '\n';
    if (data.minmax) {
        out += '**Min:** ' + data.minmax[0] + '\n';
        out += '**Max:** ' + data.minmax[1] + '\n';
    }
    if (data.period > 1) {
        if (data.heat) {
            out += '**Heat:** ' + data.heat + '\n';
        }
        if (data.temperature) {
            out += '**Temperature:** ' + data.temperature + '\n';
        }
        if (data.volatility) {
            out += '**Volatility:** ' + data.volatility + '\n';
        }
        if (data.strictVolatility) {
            out += '**Strict volatility:** ' + data.strictVolatility + '\n';
        }
    }
    if (data.apgcode !== 'PATHOLOGICAL') {
        out += '[';
        if (data.apgcode.length > 31) {
            out += data.apgcode.slice(0, 14) + '...' + data.apgcode.slice(-14);
        } else {
            out += data.apgcode;
        }
        out += '](https://catagolue.hatsya.com/object/' + data.apgcode + '/' + toCatagolueRule(data.phases[0].ruleStr) + ')';
    }
    let title = data.desc;
    let name = names.get(data.apgcode);
    if (name !== undefined) {
        title = name[0].toUpperCase() + name.slice(1) + ' (' + title + ')';
    }
    if (isOutput) {
        title = 'Output: ' + title;
    }
    let embeds = [new EmbedBuilder().setTitle(title).setDescription(out)];
    if (data.output) {
        embeds.push(...embedIdentified(data.output, true));
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
        throw new Error('Cannot find RLE');
    }
    return {embeds: embedIdentified(fullIdentify(pattern, limit))};
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
            throw new Error('Cannot find RLE');
        }
        pattern = p;
    }
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

    let frameTime = 50;
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
                throw new Error(`Invalid part: ${part.join(' ')}`);
            } else {
                for (let i = parts.length > 1 ? 0 : 1; i < part[0]; i++) {
                    pattern.runGeneration();
                    frames.push([pattern.copy(), frameTime]);
                }
            }
        } else if (part[0] === 'wait') {
            if (typeof part[1] !== 'number' || part.length > 2) {
                throw new Error(`Invalid part: ${part.join(' ')}`);
            }
            for (let i = 0; i < part[1]; i++) {
                frames.push([pattern.copy(), frameTime]);
            }
        } else if (part[0] === 'jump') {
            if (typeof part[1] !== 'number' || part.length > 2) {
                throw new Error(`Invalid part: ${part.join(' ')}`);
            }
            pattern.run(part[1]);
        } else if (part[0] !== undefined) {
            throw new Error(`Invalid part: ${part.join(' ')}`);
        }
    }
    let minX = Math.min(...frames.map(([p]) => p.xOffset)) - 1;
    let maxX = Math.max(...frames.map(([p]) => p.width + p.xOffset)) + 1;
    let minY = Math.min(...frames.map(([p]) => p.yOffset)) - 1;
    let maxY = Math.max(...frames.map(([p]) => p.height + p.yOffset)) + 1;
    let width = maxX - minX;
    let height = maxY - minY;
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
        let startY = p.yOffset - minY;
        let startX = p.xOffset - minX;
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
        return {files: ['sim.gif']};
    }
}
