
import {join} from 'node:path';
import * as fs from 'node:fs/promises';
import {execSync} from 'node:child_process';
import {parentPort} from 'node:worker_threads';
import {RuleError, Pattern, CoordPattern, TreePattern, DataHistoryPattern, CoordHistoryPattern, DataSuperPattern, CoordSuperPattern, InvestigatorPattern, RuleLoaderBgollyPattern, findType, getDescription, identify, createPattern, parse} from '../lifeweb/lib/index.js';
import {BotError, parseSpecial, aliases} from './util.js';


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

async function runPattern(argv: string[], rle: string): Promise<{frames: [Pattern, number][], gifSize: number, minX: number, minY: number, width: number, height: number, customColors: {[key: number]: [number, number, number]}, desc?: string}> {
    let p = parseSpecial(rle).shrinkToFit();
    let parts: (string | number)[][] = [];
    let currentPart: (string | number)[] = [];
    for (let arg of argv.slice(1)) {
        if (arg === '>') {
            parts.push(currentPart);
            currentPart = [];
        } else {
            if (arg.match(/^[0-9.-]+$/)) {
                currentPart.push(parseFloat(arg));
            } else {
                currentPart.push(arg);
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
    let customColors: {[key: number]: [number, number, number]} = {};
    let desc: string | undefined;
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
                    if (parts.length === 1) {
                        part[0] = part[0] - 1;
                        if (part[0] === 0) {
                            continue;
                        }
                    }
                    if (useCAViewer || p instanceof RuleLoaderBgollyPattern) {
                        await fs.writeFile(join(dir, 'in.rle'), p.toRLE());
                        execSync(`rm -f ${join(dir, 'out.rle')}`);
                        let caviewer = false;
                        if (useCAViewer || !p.ruleStr.startsWith('__')) {
                            caviewer = true;
                            execSync(`box64 /home/opc/caviewer/lib/runtime/bin/java -p /home/opc/caviewer/app -m CAViewer/application.Main sim -g ${part[0]} -s ${step} -i ${join(dir, 'in.rle')} -o ${join(dir, 'out.rle')}`);
                        } else {
                            execSync(`${join(dir, 'lifeweb', 'bgolly')} -a RuleLoader -s ${join(dir, 'lifeweb')}/ -o ${join(dir, 'out.rle')} -m ${part[0]} -i ${step} ${join(dir, 'in.rle')}`);
                        }
                        let data = (await fs.readFile(join(dir, 'out.rle'))).toString();
                        let xOffset: number | null = null;
                        let yOffset: number | null = null;
                        let inColors = false;
                        let firstDone = false;
                        for (let line of data.split('\n')) {
                            if (line === '') {
                                continue;
                            } else if (line.includes(',')) {
                                if (xOffset === null && yOffset === null) {
                                    [xOffset, yOffset] = line.split(',').map(x => parseInt(x));
                                }
                            } else if (inColors) {
                                let data = line.split(' ').map(x => parseInt(x));
                                customColors[data[0]] = [data[1], data[2], data[3]];
                            } else if (line === '@COLOR') {
                                inColors = true;
                            } else {
                                let q = parse(`x = 0, y = 0, rule = B3/S23\n${line}`, aliases, true);
                                q.xOffset = xOffset ?? 0;
                                q.yOffset = yOffset ?? 0;
                                xOffset = null;
                                yOffset = null;
                                if (caviewer) {
                                    q.xOffset--;
                                    q.yOffset--;
                                    if (!firstDone) {
                                        firstDone = true;
                                        continue;
                                    }
                                }
                                frames.push([q, frameTime]);
                            }
                        }
                    } else {
                        for (let i = 0; i < Math.ceil(part[0] / step); i++) {
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
                useCAViewer = !useCAViewer;
                part = part.slice(1);
            } else if (part[0] === 'stable') {
                part = part.slice(1);
                let pops: number[] = [];
                for (let i = 0; i < 120000; i++) {
                    p.runGeneration();
                    frames.push([p.copy(), frameTime]);
                    let pop = p.population;
                    if (pop === 0) {
                        break;
                    }
                    let found = false;
                    for (let period = 1; period < Math.floor(i / 16); period++) {
                        found = true;
                        for (let j = 1; j < 16; j++) {
                            if (pop !== pops[pops.length - period * j]) {
                                found = false;
                                break;
                            }
                        }
                        if (found) {
                            break;
                        }
                    }
                    if (found) {
                        break;
                    }
                    for (let period = 1; period < Math.floor(i / 16); period++) {
                        let diff = pop - pops[pops.length - period];
                        found = true;
                        for (let j = 1; j < 16; j++) {
                            if (diff !== pops[pops.length - period * j] - pops[pops.length - period * (j + 1)]) {
                                found = false;
                                break;
                            }
                        }
                        if (found) {
                            break;
                        }
                    }
                    if (found) {
                        break;
                    }
                    pops.push(pop);
                }
            } else if (part[0] === 'identify') {
                part = part.slice(1);
                let type = findType(p, 120000, true);
                desc = getDescription(type);
                for (let i = 0; i < type.stabilizedAt + type.period; i++) {
                    p.runGeneration();
                    frames.push([p.copy(), frameTime]);
                }
                if (typeof part[0] === 'number') {
                    if (type.period > 0) {
                        for (let i = 0; i < (part[0] - 1) * type.period; i++) {
                            p.runGeneration();
                            frames.push([p.copy(), frameTime]);
                        }
                    }
                    part = part.slice(1);
                }
            } else if (part[0] === 'setrule') {
                if (typeof part[1] === 'number') {
                    throw new BotError(`Invalid part: ${part.join(' ')}`);
                }
                p = createPattern(part[1], {height: p.height, width: p.width, data: p.getData()});
                part = part.slice(2);
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
    let defaultTime = Math.ceil(Math.min(1, Math.max(1/100, 4 / frames.length)) * 100);
    return {frames: frames.map(([p, time]) => [p, time ?? defaultTime]), gifSize, minX, minY, width, height, customColors, desc};
}

async function runSim(argv: string[], rle: string): Promise<[number, string | undefined]> {
    let startTime = performance.now();
    let {frames, gifSize, minX, minY, width, height, customColors, desc} = await runPattern(argv, rle);
    console.log('times: ' + frames.map(x => x[1]).join(', '));
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
        if (value >= p.states) {
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
        } else if (customColors[value]) {
            let [r, g, b] = customColors[value];
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
    return [parseTime, desc];
}


if (!parentPort) {
    throw new Error('No parent port');
}

parentPort.on('message', async (data: {id: number, type: 'sim', argv: string[], rle: string} | {id: number, type: 'identify' | 'basic_identify', rle: string, limit: number}) => {
    if (!parentPort) {
        throw new Error('No parent port');
    }
    let id = data.id;
    try {
        if (data.type === 'sim') {
            parentPort.postMessage({id, ok: true, data: await runSim(data.argv, data.rle)});
        } else if (data.type === 'identify') {
            parentPort.postMessage({id, ok: true, data: identify(parse(data.rle), data.limit)});
        } else if (data.type === 'basic_identify') {
            parentPort.postMessage({id, ok: true, data: findType(parse(data.rle), data.limit)});
        } else {
            throw new Error('Invalid type!');
        }
    } catch (error) {
        if (error instanceof BotError || error instanceof RuleError) {
            parentPort.postMessage({id, ok: false, error: error.message, intentional: true, type: error.constructor.name});
        } else {
            parentPort.postMessage({id, ok: false, error: (error instanceof Error && error.stack) ? error.stack : String(error), intentional: false});
        }
    }
});
