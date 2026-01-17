
import * as fs from 'node:fs/promises';
import {execSync, spawn} from 'node:child_process';
import {VALID_TRANSITIONS, parseTransitions, unparseTransitions, MAPPattern, findType, getHashsoup, createPattern, toCatagolueRule} from '../lifeweb/lib/index.js';


function patternIsExplosive(p: MAPPattern): boolean {
    p.run(30);
    let pops: number[] = [];
    for (let i = 0; i < 4000; i++) {
        p.runGeneration();
        let pop = p.population;
        if (pop > 4000) {
            return true;
        }
        if (pop === 0) {
            return false;
        }
        for (let period = 1; period < Math.floor(pops.length / 15); period++) {
            let found = true;
            for (let j = 1; j < 16; j++) {
                if (pop !== pops[pops.length - period * j]) {
                    found = false;
                    break;
                }
            }
            if (found) {
                return false;
            }
        }
        if (i > 500 && i % 50 === 0) {
            for (let period = 1; period < Math.floor(i / 20); period++) {
                let diff = pop - pops[pops.length - period];
                let found = true;
                for (let j = 1; j < 16; j++) {
                    if (diff !== pops[pops.length - period * j] - pops[pops.length - period * (j + 1)]) {
                        found = false;
                        break;
                    }
                }
                if (found) {
                    return false;
                }
            }
        }
        pops.push(pop);
    }
    return true;
}

let soupNum = 0;

async function ruleIsExplosive(rule: string): Promise<boolean> {
    let p = createPattern(rule) as MAPPattern;
    for (let i = 0; i < 50; i++) {
        let {height, width, data} = await getHashsoup('k_caterer_game_' + soupNum + '_' + Math.floor(Math.random() * 1000000), 'C1');
        soupNum++;
        let q = p.copy();
        q.setData(height, width, data);
        let e = patternIsExplosive(q);
        if (e) {
            return true;
        }
    }
    return false;
}


let rulespaceData = (await fs.readFile('data/rules.txt')).toString();
let rulespaces: [string, string[]][] = [];
for (let line of rulespaceData.split('\n')) {
    line = line.trim();
    if (line.length === 0) {
        continue;
    }
    let parts = line.split(', ');
    let min = parts[1];
    let max = parts[2];
    let [minB, minS] = min.split('/').map(x => parseTransitions(x.slice(1), VALID_TRANSITIONS));
    let [maxB, maxS] = max.split('/').map(x => parseTransitions(x.slice(1), VALID_TRANSITIONS));
    let addTrs: string[] = [];
    for (let tr of maxB) {
        if (!minB.includes(tr)) {
            addTrs.push('B' + tr);
        }
    }
}

async function getRandomRule(): Promise<string> {
    let [rule, addTrs] = rulespaces[Math.floor(Math.random() * rulespaces.length)];
    let [bTrs, sTrs] = rule.split('/').map(x => parseTransitions(x.slice(1), VALID_TRANSITIONS));
    if (await ruleIsExplosive(rule)) {
        console.log(`Start rule ${rule} is explosive!`);
        return getRandomRule();
    }
    addTrs = addTrs.slice();
    while (addTrs.length > 0) {
        let prevRule = rule;
        let i = Math.floor(Math.random() * addTrs.length);
        let tr = addTrs[i];
        if (tr.startsWith('B')) {
            bTrs.push(tr.slice(1));
        } else {
            sTrs.push(tr.slice(1));
        }
        addTrs.splice(i, 1);
        rule = `B${unparseTransitions(bTrs, VALID_TRANSITIONS)}/S${unparseTransitions(sTrs, VALID_TRANSITIONS)}`;
        if (await ruleIsExplosive(rule)) {
            return prevRule;
        }
    }
    console.log(`End rule ${rule} is not explosive even though it has all transitions!`);
    return getRandomRule();
}


let apgsearchPID: number | null = null;

function cleanup(): void {
    if (apgsearchPID) {
        process.kill(-apgsearchPID, 'SIGKILL');
    }
    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGHUP', cleanup);

async function getObjects(rule: string): Promise<false | string[]> {
    let base = createPattern(rule);
    execSync(`(cd apgmera; ./recompile.sh --rule ${toCatagolueRule(base.ruleStr)} --symmetry C1)`, {stdio: 'inherit'});
    let timedOut = await new Promise<boolean>((resolve, reject) => {
        let child = spawn('./apgmera/apgluxe', ['-n', '10000', '-i', '1', '-t', '1', '-L', '1', '-v', '0'], {stdio: 'inherit', detached: true});
        let timeout: any = null;
        child.on('error', error => {
            if (timeout) {
                clearTimeout(timeout);
            }
            apgsearchPID = null;
            reject(error);
        });
        if (child.pid) {
            apgsearchPID = child.pid;
        }
        timeout = setTimeout(() => {
            resolve(true);
            if (child.pid) {
                try {
                    process.kill(-child.pid, 'SIGKILL');
                } catch {}
            }
            apgsearchPID = null;
        }, 300000);
        child.on('exit', code => {
            apgsearchPID = null;
            if (code !== 137) {
                resolve(false);
            }
        });
    });
    if (timedOut) {
        return false;
    }
    let files = await fs.readdir('.');
    let data: string | null = null;
    for (let file of files) {
        if (file.startsWith('log')) {
            data = (await fs.readFile('./' + file)).toString();
            fs.unlink('./' + file);
            break;
        }
    }
    if (data === null) {
        throw new Error('No log file found!');
    }
    let lines = data.split('\n');
    let found = false;
    let out: string[] = [];
    for (let line of lines) {
        if (line.startsWith('@CENSUS')) {
            found = true;
            continue;
        } else if (!found) {
            continue;
        } else if (line === '@SAMPLE_SOUPIDS') {
            break;
        }
        let apgcode = line.trim().split(' ')[0];
        if (apgcode.length === 0) {
            continue;
        }
        if (apgcode.startsWith('xp')) {
            let period = parseInt(apgcode.slice(2));
            if (period < 4) {
                continue;
            }
            let p = base.loadApgcode(apgcode.slice(apgcode.indexOf('_') + 1));
            let minPop = p.population;
            for (let i = 0; i < period; i++) {
                p.runGeneration();
                let pop = p.population;
                if (pop < minPop) {
                    minPop = pop;
                }
            }
            out.push(`${minPop} cells p${period}`);
        } else if (apgcode.startsWith('xq')) {
            let p = base.loadApgcode(apgcode.slice(apgcode.indexOf('_') + 1));
            let type = findType(p, parseInt(apgcode.slice(2)) + 1);
            if (!type.disp || (type.disp[0] === 0 && type.disp[1] === 0)) {
                continue;
            }
            let pop = Math.min(...type.pops);
            let dx = Math.abs(type.disp[0]);
            let dy = Math.abs(type.disp[1]);
            let period = type.period;
            if (dy > dx) {
                let temp = dx;
                dx = dy;
                dy = temp;
            }
            out.push(`${pop} cells (${dx}, ${dy})/${period}`);
        } else if (apgcode.startsWith('yl')) {
            out.push(apgcode.slice(0, apgcode.indexOf('_')));
        } else {
            out.push(apgcode);
        }
    }
    return out;
}
