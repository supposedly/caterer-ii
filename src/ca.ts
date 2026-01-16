
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {EmbedBuilder} from 'discord.js';
import {Pattern, TRANSITIONS, VALID_TRANSITIONS, HEX_TRANSITIONS, VALID_HEX_TRANSITIONS, unparseTransitions, arrayToTransitions, parseMAP, unparseMAP, PatternType, Identified, findMinmax, getApgcode, getDescription, ALTERNATE_SYMMETRIES, createPattern, toCatagolueRule, getHashsoup, RuleError, MAPPattern} from '../lifeweb/lib/index.js';
import {BotError, Message, Response, writeFile, names, aliases, simStats, noReplyPings, findRLE} from './util.js';


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

function createWorkerJob(type: 'sim', data: {argv: string[], rle: string}): Promise<[number, string | undefined] | null>;
function createWorkerJob(type: 'identify', data: {rle: string, limit: number}): Promise<Identified | null>;
function createWorkerJob(type: 'basic_identify', data: {rle: string, limit: number}): Promise<PatternType | null>;
function createWorkerJob(type: 'sim' | 'identify' | 'basic_identify', data: any): Promise<any> {
    return new Promise((resolve, reject) => {
        let id = nextID++;
        let timeout = setTimeout(() => {
            jobs.delete(id);
            resolve(null);
            restartWorker();
        }, type === 'sim' && data.argv.includes('ca') ? 180000 : 30000);
        jobs.set(id, {resolve, reject, timeout});
        worker.postMessage({id, type, ...data});
    });
}


let simCounter = 0;

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
        p.setData(height, width, data);
        replyTo = msg;
    } else {
        let data = await findRLE(msg, argv.join(' ').includes('ca'));
        if (!data) {
            throw new BotError('Cannot find RLE');
        }
        p = data.p;
        replyTo = data.msg;
    }
    let data = await createWorkerJob('sim', {argv, rle: p.toRLE()});
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
    if (simCounter === 16) {
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


export async function cmdHashsoup(msg: Message, argv: string[]): Promise<Response> {
    return createPattern(argv[3] ?? 'B3/S23', await getHashsoup(argv[2], argv[1]), aliases).toRLE();
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

export async function cmdPopulation(msg: Message, argv: string[]): Promise<Response> {
    let data = await findRLE(msg);
    if (!data) {
        throw new Error('Cannot find RLE!');
    }
    let p = data.p;
    msg = data.msg;
    if (p.states === 2) {
        await msg.reply({
            content: String(p.population),
            allowedMentions: {repliedUser: !noReplyPings.includes(msg.author.id), parse: []},
        });
    } else {
        let counts = [];
        for (let i = 0; i < p.states; i++) {
            counts.push(0);
        }
        let total = 0;
        for (let cell of p.getData()) {
            counts[cell]++;
            if (cell > 0) {
                total++;
            }
        }
        await msg.reply({
            content: `${total} total live cells\n${counts.map((x, i) => `${x} state cells`).join('\n')}`,
            allowedMentions: {repliedUser: !noReplyPings.includes(msg.author.id), parse: []},
        });
    }
}


export async function cmdMAPToINT(msg: Message, argv: string[]): Promise<Response> {
    let [b, s] = arrayToTransitions(parseMAP(argv[1].slice(3)), TRANSITIONS);
    return `B${unparseTransitions(b, VALID_TRANSITIONS)}/S${unparseTransitions(s, VALID_TRANSITIONS)}`;
}

export async function cmdMAPToHexINT(msg: Message, argv: string[]): Promise<Response> {
    let [b, s] = arrayToTransitions(parseMAP(argv[1].slice(3)), HEX_TRANSITIONS);
    return `B${unparseTransitions(b, VALID_HEX_TRANSITIONS, true)}/S${unparseTransitions(s, VALID_HEX_TRANSITIONS, true)}`;
}

export async function cmdINTToMAP(msg: Message, argv: string[]): Promise<Response> {
    let p = createPattern(argv[1]);
    if (!(p instanceof MAPPattern)) {
        throw new Error('Rule must be in B/S notation!');
    }
    return 'MAP' + unparseMAP(p.trs);
}


function embedIdentified(original: Pattern, type: PatternType | Identified, isOutput?: boolean): EmbedBuilder[] {
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
        out += `**Symmetry:** ${type.symmetry} (${ALTERNATE_SYMMETRIES[type.symmetry]})\n`;
    }
    if (type.period > 1) {
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
        embeds.push(...embedIdentified(Object.assign(original.clearedCopy(), type.output.phases[0]), type.output, true));
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
    let out = await createWorkerJob('identify', {rle: data.p.toRLE(), limit});
    if (!out) {
        throw new BotError('Timed out!');
    }
    return {embeds: embedIdentified(data.p, out)};
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
    let out = await createWorkerJob('basic_identify', {rle: data.p.toRLE(), limit});
    if (!out) {
        throw new BotError('Timed out!');
    }
    return {embeds: embedIdentified(data.p, out)};
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
