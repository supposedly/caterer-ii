
/// <reference path="./pencil.js__canvas-gif-encoder.d.ts" />

import {join} from 'node:path';
import * as fs from 'node:fs/promises';
import {execSync} from 'node:child_process';
import {parentPort} from 'node:worker_threads';
import CanvasGifEncoder from '@pencil.js/canvas-gif-encoder';
import {Pattern, CoordPattern, TreePattern, DataHistoryPattern, CoordHistoryPattern, DataSuperPattern, CoordSuperPattern, InvestigatorPattern, RuleLoaderBgollyPattern, parse} from '../lifeweb/lib/index.js';
import {BotError, aliases} from './util.js';


const HISTORY_COLORS: [number, number, number][] = [
    [0, 255, 0],
    [0, 0, 128],
    [216, 255, 216],
    [255, 0, 0],
    [255, 255, 0],
    [96, 96, 96],
];

const SUPER_COLORS: [number, number, number][] = [
    [0, 255, 0],
    [0, 0, 160],
    [255, 216, 255],
    [255, 0, 0],
    [255, 255, 0],
    [96, 96, 96],
    [255, 105, 180],
    [128, 0, 128],
    [0, 191, 255],
    [0, 64, 128],
    [64, 224, 208],
    [0, 128, 64],
    [255, 255, 255],
    [255, 99, 71],
    [250, 128, 114],
    [219, 112, 147],
    [255, 165, 0],
    [245, 222, 179],
    [0, 255, 255],
    [192, 192, 192],
    [192, 255, 128],
    [255, 182, 193],
    [0, 255, 127],
    [0, 0, 0],
    [255, 0, 127],
];

const INVESTIGATOR_COLORS: [number, number, number][] = [
    [0, 236, 91],
    [0, 192, 255],
    [255, 0, 0],
    [255, 255, 255],
    [75, 75, 75],
    [233, 41, 255],
    [64, 0, 128],
    [255, 230, 0],
    [150, 128, 0],
    [130, 200, 0],
    [120, 40, 0],
    [255, 140, 0],
    [140, 70, 0],
    [0, 0, 255],
    [192, 192, 192],
    [128, 128, 128],
    [255, 112, 140],
    [249, 237, 249],
    [0, 152, 127],
    [0, 73, 59],
];


let dir = join(import.meta.dirname, '..');

async function runPattern(argv: string[], rle: string): Promise<{frames: [Pattern, number][], gifSize: number, minX: number, minY: number, width: number, height: number}> {
    let p = parse(rle, aliases, true);
    let parts: (string | number)[][] = [];
    let currentPart: (string | number)[] = [];
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
    let frameTime: number | null = null;
    if (parts[0] && parts[0][1] === 'fps' && typeof parts[0][0] === 'number') {
        frameTime = Math.ceil(100 / parts[0][0]) * 10;
    }
    let frames: [Pattern, number | null][] = [[p.copy(), frameTime]];
    let gifSize = 200;
    for (let part of parts) {
        if (part[1] === 'fps' && typeof part[0] === 'number') {
            frameTime = Math.ceil(100 / part[0]) * 10;
            part = part.slice(2);
        }
        if (part[0] === 'size' && typeof part[1] === 'number') {
            gifSize = part[1];
            part = part.slice(2);
        }
        if (part[1] === 'fps' && typeof part[0] === 'number') {
            frameTime = Math.ceil(100 / part[0]) * 10;
            part = part.slice(2);
        }
        if (typeof part[0] === 'number') {
            if (typeof part[1] === 'string') {
                throw new BotError(`Invalid part: ${part.join(' ')}`);
            }
            let step = part[1] ?? 1;
            for (let i = parts.length > 1 ? 0 : 1; i < Math.ceil(part[0] / step); i++) {
                p.run(step);
                frames.push([p.copy(), frameTime]);
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
    let defaultTime = Math.min(0.1, Math.max(1/60, 5 / frames.length)) * 1000;
    return {frames: frames.map(([p, time]) => [p, time ?? defaultTime]), gifSize, minX, minY, width, height};
}


async function runSim(argv: string[], rle: string): Promise<number> {
    let {frames, gifSize, minX, minY, width, height} = await runPattern(argv, rle);
    let parseTime = performance.now();
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
                    if (p.states === 2) {
                        array[j++] = 0xff;
                        array[j++] = 0xff;
                        array[j++] = 0xff;
                    } else if (p instanceof TreePattern && p.rule.colors && p.rule.colors[value]) {
                        let [r, g, b] = p.rule.colors[value];
                        array[j++] = r;
                        array[j++] = g;
                        array[j++] = b;
                    } else if (p instanceof DataHistoryPattern || p instanceof CoordHistoryPattern) {
                        let [r, g, b] = HISTORY_COLORS[value - 1];
                        array[j++] = r;
                        array[j++] = g;
                        array[j++] = b;
                    } else if (p instanceof DataSuperPattern || p instanceof CoordSuperPattern) {
                        let [r, g, b] = SUPER_COLORS[value - 1];
                        array[j++] = r;
                        array[j++] = g;
                        array[j++] = b;
                    } else if (p instanceof InvestigatorPattern) {
                        let [r, g, b] = INVESTIGATOR_COLORS[value - 1];
                        array[j++] = r;
                        array[j++] = g;
                        array[j++] = b;
                    } else {
                        array[j++] = 0xff;
                        array[j++] = Math.max(0, Math.ceil((value - 1) / (p.states - 2) * 256) - 1);
                        array[j++] = 0;
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
    await fs.writeFile('sim_base.gif', gif);
    let scale = Math.ceil(gifSize / Math.min(width, height));
    gifSize = Math.min(width, height) * scale;
    execSync(`gifsicle --resize-${width < height ? 'width' : 'height'} ${gifSize} sim_base.gif > sim.gif`);
    return parseTime;
}


if (!parentPort) {
    throw new Error('No parent port');
}

parentPort.on('message', async ({id, argv, rle}: {id: number, argv: string[], rle: string}) => {
    if (!parentPort) {
        throw new Error('No parent port');
    }
    try {
        parentPort.postMessage({id, ok: true, parseTime: await runSim(argv, rle)});
    } catch (error) {
        parentPort.postMessage({id, ok: false, error: (error instanceof Error && error.stack) ? error.stack : String(error)});
    }
});
