
import {TRANSITIONS, VALID_TRANSITIONS, HEX_TRANSITIONS, VALID_HEX_TRANSITIONS, unparseTransitions, arrayToTransitions, parseMAP, unparseMAP, MAPPattern, MAPB0Pattern, getHashsoup, createPattern, toCatagolueRule, getBlackWhiteReversal} from '../lifeweb/lib/index.js';
import {BotError, Message, Response, aliases, findRLE} from './util.js';


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

export async function cmdCanonicalApgenode(msg: Message, argv: string[]): Promise<Response> {
    let data = await findRLE(msg);
    if (!data) {
        throw new BotError('Cannot find RLE');
    }
    if (argv[1].startsWith('c')) {
        let gens = 0;
        if (argv[2] !== undefined) {
            gens = parseInt(argv[2]);
        }
    } else {
        return data.p.toApgcode();
    }
}

let lifePattern = createPattern('B3/S23');

export async function cmdApgdecode(msg: Message, argv: string[]): Promise<Response> {
    let code = argv[1];
    let match = code.match(/x[spq]\d+_/);
    if (match) {
        code = code.slice(match[0].length);
    }
    if (!argv[2]) {
        return lifePattern.loadApgcode(code).toRLE();
    } else {
        return createPattern(argv.slice(2).join(' '), undefined, aliases).loadApgcode(code).toRLE();
    }
}

export async function cmdPopulation(msg: Message, argv: string[]): Promise<Response> {
    let data = await findRLE(msg);
    if (!data) {
        throw new BotError('Cannot find RLE!');
    }
    let p = data.p;
    msg = data.msg;
    if (p.states === 2) {
        return String(p.population);
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
        return `${total} total live cells\n${counts.map((x, i) => `${x} state ${i} cells`).join('\n')}`;
    }
}


export async function cmdMAPToINT(msg: Message, argv: string[]): Promise<Response> {
    if (!argv[1].startsWith('MAP')) {
        throw new BotError('Invalid MAP rule!');
    }
    let [b, s] = arrayToTransitions(parseMAP(argv[1].slice(3)), TRANSITIONS);
    return `B${unparseTransitions(b, VALID_TRANSITIONS)}/S${unparseTransitions(s, VALID_TRANSITIONS)}`;
}

export async function cmdMAPToHexINT(msg: Message, argv: string[]): Promise<Response> {
    if (!argv[1].startsWith('MAP')) {
        throw new BotError('Invalid MAP rule!');
    }
    let [b, s] = arrayToTransitions(parseMAP(argv[1].slice(3)), HEX_TRANSITIONS);
    return `B${unparseTransitions(b, VALID_HEX_TRANSITIONS, true)}/S${unparseTransitions(s, VALID_HEX_TRANSITIONS, true)}H`;
}

export async function cmdINTToMAP(msg: Message, argv: string[]): Promise<Response> {
    let p = createPattern(argv[1], undefined, aliases);
    if (!(p instanceof MAPPattern || p instanceof MAPB0Pattern)) {
        throw new BotError('Rule must be in B/S notation!');
    }
    return 'MAP' + unparseMAP(p instanceof MAPPattern ? p.trs : p.evenTrs.map(x => 1 - x));
}


export async function cmdNormalizeRule(msg: Message, argv: string[]): Promise<Response> {
    return createPattern(argv.slice(1).join(' '), undefined, aliases).ruleStr;
}

export async function cmdToCatagolueRule(msg: Message, argv: string[]): Promise<Response> {
    return toCatagolueRule(argv.slice(1).join(' '), aliases);
}

export async function cmdRuleSymmetry(msg: Message, argv: string[]): Promise<Response> {
    return createPattern(argv.slice(1).join(' '), undefined, aliases).ruleSymmetry;
}

export async function cmdBlackWhiteReverse(msg: Message, argv: string[]): Promise<Response> {
    return getBlackWhiteReversal(argv.slice(1).join(' '));
}

export async function cmdCheckerboardDual(msg: Message, argv: string[]): Promise<Response> {
    let p = createPattern(argv.slice(1).join(' '), undefined, aliases);
    if (!(p instanceof MAPPattern || p instanceof MAPB0Pattern)) {
        throw new BotError('Cannot take checkerboard dual of non-MAP rule!');
    }
    let trs = p instanceof MAPPattern ? p.trs : p.evenTrs.map(x => 1 - x);
    let even = new Uint8Array(512);
    let odd = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
        even[i ^ 0b010101010] = trs[i];
        odd[i ^ 0b101010101] = trs[i] ^ 1;
    }
    if (p.ruleSymmetry === 'D8') {
        let [evenB, evenS] = arrayToTransitions(even, TRANSITIONS);
        let [oddB, oddS] = arrayToTransitions(odd, TRANSITIONS);
        return `Even: B${unparseTransitions(evenB, VALID_TRANSITIONS)}/S${unparseTransitions(evenS, VALID_TRANSITIONS)}\nOdd: B${unparseTransitions(oddB, VALID_TRANSITIONS)}/S${unparseTransitions(oddS, VALID_TRANSITIONS)}`;
    } else {
        return `Even: MAP${unparseMAP(even)}\nOdd: MAP${unparseMAP(odd)}`;
    }
}
