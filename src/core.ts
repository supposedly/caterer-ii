
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {EmbedBuilder} from 'discord.js';
import {RuleError, Pattern, PatternType, Identified, findMinmax, getApgcode, getDescription, ALTERNATE_SYMMETRIES, createPattern, toCatagolueRule} from '../lifeweb/lib/index.js';
import {BotError, Message, Response, writeFile, names, aliases, simStats, findRLE, sentByAdmin} from './util.js';


type WorkerResult = {id: number, ok: true} & ({type: 'sim', data: [number, string | undefined]} | {type: 'identify', data: Identified} | {type: 'basic_identify', data: PatternType}) | {id: number, ok: false, error: string, intentional: boolean, type: string};

interface Job {
    resolve: (data: any) => void;
    reject: (reason?: any) => void;
    timeout: NodeJS.Timeout;
}

let worker: Worker;

let workerAlive = false;

let jobs = new Map<number, Job>();
let nextID = 0;

function workerOnMessage(msg: WorkerResult): void {
    let job = jobs.get(msg.id);
    if (!job) {
        return;
    }
    if (msg.ok) {
        job.resolve(msg.data);
    } else {
        if (msg.intentional) {
            if (msg.type === 'BotError') {
                job.reject(new BotError(msg.error));
            } else {
                job.reject(new RuleError(msg.error));
            }
        } else {
            job.reject(msg.error);
        }
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
    if (workerAlive) {
        try {
            worker.terminate();
        } catch {}
    }
    worker = new Worker(join(import.meta.dirname, 'worker.js'));
    worker.on('message', workerOnMessage);
    worker.on('error', workerOnError);
    worker.on('exit', workerOnExit);
    restarting = false;
    workerAlive = true;
}

restartWorker();

function workerHandleFatal(error: Error): void {
    let rejects: ((reason: any) => void)[] = [];
    for (let [id, job] of jobs) {
        clearTimeout(job.timeout);
        jobs.delete(id);
        rejects.push(job.reject);
    }
    for (let reject of rejects) {
        reject(error);
    }
    restartWorker();
}

function workerOnError(error: Error): void {
    console.log(error);
    workerHandleFatal(error);
}

function workerOnExit(code: number): void {
    workerAlive = false;
    let msg = 'Worker exited with code ' + code;
    console.log(msg + ', restarting worker');
    workerHandleFatal(new Error(msg));
}

function createWorkerJob(type: 'sim', data: {argv: string[], rle: string}, noTimeout?: boolean): Promise<[number, string | undefined] | null>;
function createWorkerJob(type: 'identify', data: {rle: string, limit: number}, noTimeout?: boolean): Promise<Identified | null>;
function createWorkerJob(type: 'basic_identify', data: {rle: string, limit: number}, noTimeout?: boolean): Promise<PatternType | null>;
function createWorkerJob(type: 'sim' | 'identify' | 'basic_identify', data: any, noTimeout?: boolean): Promise<any> {
    return new Promise((resolve, reject) => {
        let id = nextID++;
        let timeout = setTimeout(() => {
            if (!noTimeout) {
                jobs.delete(id);
                resolve(null);
                restartWorker();
            }
        }, 30000);
        jobs.set(id, {resolve, reject, timeout});
        worker.postMessage({id, type, ...data});
    });
}


let simCounter = 0;

export async function cmdSim(msg: Message, argv: string[]): Promise<Response> {
    let startTime = performance.now();
    await msg.channel.sendTyping();
    let noTimeout = false;
    if (argv[1] === 'notimeout') {
        if (sentByAdmin(msg)) {
            noTimeout = true;
            argv = argv.slice(1);
        } else {
            throw new BotError(`You must be an admin to use notimeout!`);
        }
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
        p = createPattern(rule, aliases);
        let size = height * width;
        let data = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            if (Math.random() < fill) {
                if (p.states === 2) {
                    data[i] = 1;
                } else {
                    data[i] = Math.floor(Math.random() * (p.states - 1)) + 1;
                }
            }
        }
        p.setData(height, width, data);
        replyTo = msg;
    } else {
        let data = await findRLE(msg);
        if (!data) {
            throw new BotError('Cannot find RLE');
        }
        p = data.p;
        replyTo = data.msg;
    }
    let outputTime = false;
    if (argv[1] === 'time') {
        outputTime = true;
        argv = argv.slice(1);
    }
    let data = await createWorkerJob('sim', {argv, rle: p.toRLE()}, noTimeout);
    if (!data) {
        return 'Error: Timed out!';
    }
    let [parseTime, desc] = data;
    if (p.ruleStr in simStats) {
        simStats[p.ruleStr]++;
    } else {
        simStats[p.ruleStr] = 1;
    }
    simCounter++;
    if (simCounter === 4) {
        simCounter = 0;
        await writeFile('data/sim_stats.json', JSON.stringify(simStats, undefined, 4));
    }
    let content: string | undefined = undefined;
    if (outputTime) {
        let total = Math.round(performance.now() - startTime) / 1000;
        let parse = Math.round(parseTime) / 1000;
        content = `Took ${total} seconds (${parse} to parse)`;
        if (desc) {
            content += '\n' + desc;
        }
    } else if (desc) {
        content = desc;
    }
    return await replyTo.reply({
        content,
        files: ['sim.gif'],
        allowedMentions: {repliedUser: false},
    });
}


function embedIdentified(original: Pattern, type: PatternType | Identified, full: boolean = false, isOutput?: boolean): EmbedBuilder[] {
    let out = '';
    if (type.period > 0) {
        out += `**Period:** ${type.period}\n`;
    }
    if (type.disp && (type.disp[0] !== 0 || type.disp[1] !== 0)) {
        out += `**Displacement:** (${type.disp[0]}, ${type.disp[1]})\n`;
    }
    if (type.stabilizedAt > 0) {
        out += `**Stabilizes at:** ${type.stabilizedAt}\n`;
    }
    if (type.power !== undefined) {
        out += `**Power:** ${type.power}\n`;
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
    out += `**Populations:** ${minPop} | ${Math.round(avgPop * 100) / 100} | ${maxPop}\n`;
    if ('minmax' in type && type.minmax) {
        out += `**Min:** ${type.minmax[0]}\n`;
        out += `**Max:** ${type.minmax[1]}\n`;
    }
    if ('symmetry' in type) {
        out += `**Symmetry:** ${type.symmetry} (${ALTERNATE_SYMMETRIES[type.symmetry].replaceAll('\\', '\\\\')})\n`;
    }
    if (type.period > 1 && full) {
        if ('heat' in type && type.heat !== undefined) {
            out += `**Heat:** ${Math.round(type.heat * 1000) / 1000}\n`;
        }
        if ('temperature' in type && type.temperature !== undefined) {
            out += `**Temperature:** ${Math.round(type.temperature * 1000) / 1000}\n`;
        }
        if ('volatility' in type && type.volatility !== undefined) {
            out += `**Volatility:** ${Math.round(type.volatility * 1000) / 1000}\n`;
        }
        if ('strictVolatility' in type && type.strictVolatility !== undefined) {
            out += `**Strict volatility:** ${Math.round(type.strictVolatility * 1000) / 1000}\n`;
        }
    }
    type.phases[0] = original;
    type.phases[type.stabilizedAt] = original.copy().run(type.stabilizedAt);
    let apgcode = getApgcode(type);
    if (apgcode !== 'PATHOLOGICAL') {
        out += '[';
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
    if ('strictVolatility' in type && type.strictVolatility === 0) {
        title += ' (trivial)';
    }
    let name: string | undefined = undefined;
    if (apgcode.startsWith('x') || apgcode.startsWith('y')) {
        name = names.get(apgcode);
    } else {
        name = names.get(type.phases[0].toCanonicalApgcode(1, 'x'));
    }
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
    let embeds = [(new EmbedBuilder()).setTitle(title).setDescription(out)];
    if ('output' in type && type.output) {
        embeds.push(...embedIdentified(Object.assign(original.clearedCopy(), type.output.phases[0]), type.output, full, true));
    }
    return embeds;
}

export async function cmdIdentify(msg: Message, argv: string[]): Promise<Response> {
    await msg.channel.sendTyping();
    let noTimeout = false;
    if (argv[1] === 'notimeout') {
        if (sentByAdmin(msg)) {
            noTimeout = true;
            argv = argv.slice(1);
        } else {
            throw new BotError(`You must be an admin to use notimeout!`);
        }
    }
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
    let out = await createWorkerJob('identify', {rle: data.p.toRLE(), limit}, noTimeout);
    if (!out) {
        throw new BotError('Timed out!');
    }
    return {embeds: embedIdentified(data.p, out)};
}

export async function cmdBasicIdentify(msg: Message, argv: string[]): Promise<Response> {
    await msg.channel.sendTyping();
    let noTimeout = false;
    if (argv[1] === 'notimeout') {
        if (sentByAdmin(msg)) {
            noTimeout = true;
            argv = argv.slice(1);
        } else {
            throw new BotError(`You must be an admin to use notimeout!`);
        }
    }
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
    let out = await createWorkerJob('basic_identify', {rle: data.p.toRLE(), limit}, noTimeout);
    if (!out) {
        throw new BotError('Timed out!');
    }
    return {embeds: embedIdentified(data.p, out)};
}

export async function cmdFullIdentify(msg: Message, argv: string[]): Promise<Response> {
    await msg.channel.sendTyping();
    let noTimeout = false;
    if (argv[1] === 'notimeout') {
        if (sentByAdmin(msg)) {
            noTimeout = true;
            argv = argv.slice(1);
        } else {
            throw new BotError(`You must be an admin to use notimeout!`);
        }
    }
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
    let out = await createWorkerJob('identify', {rle: data.p.toRLE(), limit}, noTimeout);
    if (!out) {
        throw new BotError('Timed out!');
    }
    return {embeds: embedIdentified(data.p, out, true)};
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
