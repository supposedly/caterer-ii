
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {EmbedBuilder} from 'discord.js';
import {Pattern, Identified, FullIdentified, identify, findMinmax, getDescription, fullIdentify, createPattern, toCatagolueRule, getHashsoup} from '../lifeweb/lib/index.js';
import {BotError, Message, Response, writeFile, names, aliases, simStats, findRLE} from './util.js';


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

type WorkerResult = {id: number, ok: true, parseTime: number} | {id: number, ok: false, error: string};

interface JobData {
    resolve: (data: number) => void;
    reject: (reason?: any) => void;
    timeout: NodeJS.Timeout;
}

let worker: Worker;

let jobs = new Map<number, JobData>();
let nextID = 0;

function workerOnMessage(msg: WorkerResult): void {
    let job = jobs.get(msg.id);
    if (!job) {
        return;
    }
    if (!msg.ok) {
        job.reject(msg.error);
    } else {
        job.resolve(msg.parseTime);
    }
    clearTimeout(job.timeout);
    jobs.delete(msg.id);
}

let restarting = false;

function restartWorker() {
    if (restarting) {
        return;
    }
    restarting = true;
    try {
        worker.terminate();
    } catch {}
    worker = new Worker(join(import.meta.dirname, 'sim_worker.js'));
    worker.on('message', workerOnMessage);
    worker.on('error', workerOnError);
    worker.on('exit', workerOnExit);
    restarting = false;
}

restartWorker();

function workerHandleFatal(error: Error): void {
    for (let job of jobs.values()) {
        clearTimeout(job.timeout);
        job.reject(error);
    }
    jobs.clear();
    restartWorker();
}

function workerOnError(error: Error): void {
    console.log(error);
    workerHandleFatal(error);
}

function workerOnExit(code: number): void {
    let msg = 'Worker exited with code ' + code;
    console.log(msg + ', restarting worker');
    workerHandleFatal(new Error(msg));
}

export async function cmdSim(msg: Message, argv: string[]): Promise<Response> {
    let startTime = performance.now();
    await msg.channel.sendTyping();
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
        let fill = 0.5;
        if (argv[2].endsWith('%')) {
            fill = parseFloat(argv[2]) / 100;
            argv = argv.slice(1);
        }
        let rule = argv[2];
        argv = argv.slice(2);
        p = createPattern(rule);
        let size = height * width;
        let data = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            if (Math.random() < fill) {
                data[i] = Math.ceil(Math.random() * p.states);
            }
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
    let parseTime = await new Promise<number | null>((resolve, reject) => {
        let id = nextID++;
        let timeout = setTimeout(() => {
            jobs.delete(id);
            resolve(null);
            restartWorker();
        }, 30000);
        jobs.set(id, {resolve, reject, timeout});
        worker.postMessage({id, argv, rle: p.toRLE()});
    });
    if (!parseTime) {
        return 'Error: Timed out!';
    }
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
        let total = Math.round(performance.now() - startTime) / 1000;
        let parse = Math.round(parseTime - startTime) / 1000;
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
