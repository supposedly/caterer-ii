
import {join} from 'node:path';
import * as fs from 'node:fs/promises';
import {execSync} from 'node:child_process';
import {parentPort} from 'node:worker_threads';
import {RuleError, Pattern, CoordPattern, TreePattern, DataHistoryPattern, CoordHistoryPattern, DataSuperPattern, CoordSuperPattern, InvestigatorPattern, RuleLoaderBgollyPattern, parse} from '../lifeweb/lib/index.js';
import {BotError, aliases} from './util.js';
import {userInfo} from 'node:os';


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
            let isNumber = false;
            let current = '';
            for (let char of arg) {
                if ('0123456789.'.includes(char)) {
                    if (isNumber) {
                        current += char;
                    } else {
                        if (current !== '') {
                            currentPart.push(current);
                        }
                        isNumber = true;
                        current = char;
                    }
                } else {
                    if (isNumber) {
                        if (current !== '') {
                            currentPart.push(parseFloat(current));
                        }
                        isNumber = false;
                        current = char;
                    } else {
                        current += char;
                    }
                }
            }
            if (current !== '') {
                if (isNumber) {
                    currentPart.push(parseFloat(current));
                } else {
                    currentPart.push(current);
                }
            }
        }
    }
    parts.push(currentPart);
    let frameTime: number | null = null;
    if (parts[0] && parts[0][1] === 'fps' && typeof parts[0][0] === 'number') {
        frameTime = Math.ceil(100 / parts[0][0]);
    }
    let frames: [Pattern, number | null][] = [[p.copy(), frameTime]];
    let gifSize = 200;
    let useCAViewer = false;
    for (let part of parts) {
        while (part.length > 0) {
            if (typeof part[0] === 'number') {
                if (part[1] === 'fps') {
                    frameTime = Math.ceil(100 / part[0]);
                    part = part.slice(2);
                } else {
                    let step = 1;
                    let remove = 1;
                    if (typeof part[1] === 'number') {
                        step = part[1];
                        remove = 2;
                    }
                    if (parts.length === 1 && part[0] === 1) {
                        part = part.slice(remove);
                        continue;
                    }
                    if (useCAViewer || p instanceof RuleLoaderBgollyPattern) {
                        await fs.writeFile(join(dir, 'in.rle'), p.toRLE());
                        execSync(`rm -f ${join(dir, 'out.rle')}`);
                        if (useCAViewer) {
                            execSync(`/home/opc/qemu/build/qemu-i386 /home/opc/caviewer/bin/CAViewer sim -g ${part[0]} -s ${step} -i in.rle -o out.rle`);
                        } else {
                            execSync(`${join(dir, 'lifeweb', 'bgolly')} -a RuleLoader -s ${join(dir, 'lifeweb')} -o ${join(dir, 'out.rle')} -m ${part[0]} -i ${step} ${join(dir, 'in.rle')}`);
                        }
                        let data = (await fs.readFile(join(dir, 'out.rle'))).toString();
                        let xOffset: number | null = null;
                        let yOffset: number | null = null;
                        for (let line of data.split('\n')) {
                            if (line.includes(',')) {
                                if (xOffset === null && yOffset === null) {
                                    [xOffset, yOffset] = line.split(',').map(x => parseInt(x));
                                }
                            } else {
                                let q = parse(`x = 0, y = 0, rule = ${p.ruleStr}\n${line}`, aliases, true);
                                q.xOffset = xOffset ?? 0;
                                q.yOffset = yOffset ?? 0;
                                xOffset = null;
                                yOffset = null;
                                frames.push([q, frameTime]);
                            }
                        }
                    } else {
                        for (let i = parts.length > 1 ? 0 : 1; i < Math.ceil(part[0] / step); i++) {
                            p.run(step);
                            frames.push([p.copy(), frameTime]);
                        }
                    }
                    part = part.slice(remove);
                }
            } else if (part[0] === 'size') {
                if (typeof part[1] !== 'number') {
                    throw new BotError(`Invalid part: ${part.join(' ')}`);
                }
                gifSize = part[1];
                part = part.slice(2);
            } else if (part[0] === 'wait') {
                if (typeof part[1] !== 'number') {
                    throw new BotError(`Invalid part: ${part.join(' ')}`);
                }
                for (let i = 0; i < part[1]; i++) {
                    frames.push([p.copy(), frameTime]);
                }
                part = part.slice(2);
            } else if (part[0] === 'jump') {
                if (typeof part[1] !== 'number') {
                    throw new BotError(`Invalid part: ${part.join(' ')}`);
                }
                p.run(part[1]);
                part = part.slice(2);
            } else if (part[0] === 'ca') {
                useCAViewer = true;
                part = part.slice(1);
            } else {
                throw new BotError(`Invalid part: ${part.join(' ')}`);
            }
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
    let defaultTime = Math.min(1, Math.max(1/60, 5 / frames.length)) * 100;
    return {frames: frames.map(([p, time]) => [p, time ?? defaultTime]), gifSize, minX, minY, width, height};
}

async function runSim(argv: string[], rle: string): Promise<number> {
    let startTime = performance.now();
    let {frames, gifSize, minX, minY, width, height} = await runPattern(argv, rle);
    let parseTime = performance.now() - startTime;
    let p = frames[0][0];
    let bitWidth = Math.max(2, Math.ceil(Math.log2(p.states)));
    let colors = 2**bitWidth;
    let clearCode = 1 << bitWidth;
    let endCode = (1 << bitWidth) + 1;
    let codeSize = bitWidth + 1;
    let gifData: Uint8Array[] = [new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, width & 255, (width >> 8) & 255, height & 255, (height >> 8) & 255, 0xf0 | (bitWidth - 1), 0x00, 0x00, 0x36, 0x39, 0x3e])];
    let gct = new Uint8Array((colors - 1) * 3);
    let i = 0;
    for (let value = 1; value < colors; value++) {
        if (value > p.states) {
            gct[i++] = 0x00;
            gct[i++] = 0x00;
            gct[i++] = 0x00;
        } else if (p.states === 2) {
            gct[i++] = 0xff;
            gct[i++] = 0xff;
            gct[i++] = 0xff;
        } else if (p instanceof TreePattern && p.rule.colors && p.rule.colors[value]) {
            let [r, g, b] = p.rule.colors[value];
            gct[i++] = r;
            gct[i++] = g;
            gct[i++] = b;
        } else if (p instanceof DataHistoryPattern || p instanceof CoordHistoryPattern) {
            let [r, g, b] = HISTORY_COLORS[value - 1];
            gct[i++] = r;
            gct[i++] = g;
            gct[i++] = b;
        } else if (p instanceof DataSuperPattern || p instanceof CoordSuperPattern) {
            let [r, g, b] = SUPER_COLORS[value - 1];
            gct[i++] = r;
            gct[i++] = g;
            gct[i++] = b;
        } else if (p instanceof InvestigatorPattern) {
            let [r, g, b] = INVESTIGATOR_COLORS[value - 1];
            gct[i++] = r;
            gct[i++] = g;
            gct[i++] = b;
        } else {
            gct[i++] = 0xff;
            gct[i++] = Math.max(0, Math.ceil((value - 1) / (p.states - 2) * 256) - 1);
            gct[i++] = 0;
        }
    }
    gifData.push(gct);
    gifData.push(new Uint8Array([0x21, 0xff, 0x0b, 0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, 0x03, 0x01, 0x00, 0x00, 0x00]));
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
        let pHeight = p.height;
        let pWidth = p.width;
        let endX = startX + pWidth;
        let endY = startY + pHeight;
        let pData = p.getData();
        let index = 0;
        gifData.push(new Uint8Array([0x21, 0xf9, 0x04, 0x00, frameTime & 255, (frameTime >> 8) & 255, 0xff, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, width & 255, (width >> 8) & 255, height & 255, (height >> 8) & 255, 0x00]));
        let data: number[] = [];
        for (let y = 0; y < startY; y++) {
            for (let x = 0; x < width; x++) {
                data.push(clearCode, 0);
            }
        }
        for (let y = startY; y < endY; y++) {
            for (let x = 0; x < startX; x++) {
                data.push(clearCode, 0);
            }
            for (let x = startX; x < endX; x++) {
                data.push(clearCode, pData[index++]);
            }
            for (let x = endX; x < width; x++) {
                data.push(clearCode, 0);
            }
        }
        for (let y = endY; y < height; y++) {
            for (let x = 0; x < width; x++) {
                data.push(clearCode, 0);
            }
        }
        data.push(endCode);
        let out: number[] = [];
        let accumulator = 0;
        let bitCount = 0;
        for (let value of data) {
            accumulator |= value << bitCount;
            bitCount += codeSize;
            while (bitCount >= 8) {
                out.push(accumulator & 0xff);
                accumulator >>= 8;
                bitCount -= 8;
            }
        }
        if (bitCount > 0) {
            out.push(accumulator & 0xff);
        }
        gifData.push(new Uint8Array([bitWidth]));
        let i = 0;
        while (i < out.length) {
            let length = Math.min(255, out.length - i);
            gifData.push(new Uint8Array([length, ...out.slice(i, i + length)]));
            i += length;
        }
        gifData.push(new Uint8Array([0x00]));
    }
    gifData.push(new Uint8Array([0x3b]));
    let length = 0;
    for (let array of gifData) {
        length += array.length;
    }
    let out = new Uint8Array(length);
    let offset = 0;
    for (let array of gifData) {
        out.set(array, offset);
        offset += array.length;
    }
    await fs.writeFile('sim_base.gif', out);
    let scale = Math.ceil(gifSize / Math.min(width, height));
    gifSize = Math.min(width, height) * scale;
    execSync(`gifsicle --resize-${width < height ? 'width' : 'height'} ${gifSize} -O3 sim_base.gif > sim.gif`);
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
        if (error instanceof BotError || error instanceof RuleError) {
            parentPort.postMessage({id, ok: false, error: error.message, intentional: true, type: error.constructor.name});
        } else {
            parentPort.postMessage({id, ok: false, error: (error instanceof Error && error.stack) ? error.stack : String(error), intentional: false});
        }
    }
});
