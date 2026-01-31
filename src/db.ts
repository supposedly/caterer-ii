
import {RuleError, findType, getApgcode, createPattern, parseSpeed} from '../lifeweb/lib/index.js';
import {EmbedBuilder} from 'discord.js';
import {BotError, Message, Response, readFile, writeFile, aliases, names, simStats, sentByAccepterer, findRLE} from './util.js';


export const TYPE_NAMES: {[key: string]: string} = {
    'int': 'INT',
    'intb0': 'INT B0',
    'ot': 'OT',
    'otb0': 'OT B0',
    'intgen': 'INT Generations',
    'intgenb0': 'INT Generations B0',
    'otgen': 'OT Generations',
    'otgenb0': 'OT Generations B0',
};

export async function cmdSssss(msg: Message, argv: string[]): Promise<Response> {
    await msg.channel.sendTyping();
    let type: string;
    let speed: string;
    let lower = argv[1].toLowerCase();
    if (lower in TYPE_NAMES) {
        type = lower;
        speed = argv.slice(2).join(' ');
    } else {
        type = 'int';
        speed = argv.slice(1).join(' ');
    }
    let {dx, dy, period} = parseSpeed(speed);
    let resp = await fetch(`https://speedydelete.com/5s/api/get?type=${type}&dx=${dx}&dy=${dy}&period=${period}`);
    if (resp.ok) {
        return await resp.text();
    } else {
        throw new BotError(`Server returned ${resp.status} ${resp.statusText}`);
    }
}

export async function cmdSssssInfo(msg: Message, argv: string[]): Promise<Response> {
    await msg.channel.sendTyping();
    let type = argv[1] ? argv[1].toLowerCase() : 'int';
    let resp = await fetch(`https://speedydelete.com/5s/api/getcounts?type=${type}`);
    if (resp.ok) {
        return (await resp.text()).replaceAll('This rulespace', `The ${TYPE_NAMES[type]} rulespace`);
    } else {
        throw new BotError(`Server returned ${resp.status} ${resp.statusText}`);
    }
}


export let dyks = (await readFile('data/dyk.txt')).split('\n').slice(1);

export async function cmdDyk(msg: Message, argv: string[]): Promise<Response> {
    let num: number;
    if (argv.length > 1) {
        num = parseInt(argv[1]) - 1;
        if (Number.isNaN(num)) {
            throw new BotError('Invalid number!');
        }
    } else {
        num = Math.floor(Math.random() * dyks.length)
    }
    return `Did you know... (#${num + 1}): ${dyks[num]}\n-# Licensed under the [GNU Free Documentation License 1.2](https://www.gnu.org/licenses/fdl-1.3.html)`;
}


export const NAME_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789~!@#$%^&*()-=_+[]\\{}|;\':",./<>? 🏳️‍⚧️';

const NAME_GENERATIONS = 1024;

export async function cmdName(msg: Message, argv: string[]): Promise<Response> {
    await msg.channel.sendTyping();
    let data = await findRLE(msg);
    if (!data) {
        throw new BotError('Cannot find RLE');
    }
    let apgcode = getApgcode(findType(data.p, NAME_GENERATIONS, false));
    if (!apgcode.startsWith('x') && !apgcode.startsWith('y')) {
        apgcode = data.p.toCanonicalApgcode(1, 'x');
    }
    let newName = argv.slice(1).join(' ');
    if (newName === '') {
        let name = names.get(apgcode);
        if (name !== undefined) {
            return name;
        } else {
            throw new BotError('Pattern is not named');
        }
    }
    if (!Array.from(newName).every(x => NAME_CHARS.includes(x))) {
        throw new BotError('Invalid name!');
    }
    if (names.has(apgcode)) {
        if (!sentByAccepterer(msg)) {
            throw new BotError('Pattern is already named and you are not an accepterer');
        }
        let oldName = names.get(apgcode);
        names.set(apgcode, newName);
        await writeFile('data/names.txt', Array.from(names.entries()).map(x => x[0] + ' ' + x[1]).join('\n'));
        return 'Renamed `' + oldName + '` to `' + newName + '`';
    } else {
        names.set(apgcode, newName);
        await writeFile('data/names.txt', Array.from(names.entries()).map(x => x[0] + ' ' + x[1]).join('\n'));
        return 'Set name to `' + newName + '`';
    }
}

export async function cmdRename(msg: Message, argv: string[]): Promise<Response> {
    await msg.channel.sendTyping();
    if (!sentByAccepterer(msg)) {
        throw new BotError('You are not an accepterer');
    }
    let data = await findRLE(msg);
    if (!data) {
        throw new BotError('Cannot find RLE');
    }
    let apgcode = getApgcode(findType(data.p, NAME_GENERATIONS, false));
    if (!apgcode.startsWith('x') && !apgcode.startsWith('y')) {
        apgcode = data.p.toCanonicalApgcode(1, 'x');
    }
    let newName = argv.slice(1).join(' ');
    if (!Array.from(newName).every(x => NAME_CHARS.includes(x))) {
        throw new BotError('Invalid name!');
    }
    if (names.has(apgcode)) {
        let oldName = names.get(apgcode);
        names.set(apgcode, newName);
        await writeFile('data/names.txt', Array.from(names.entries()).map(x => x[0] + ' ' + x[1]).join('\n'));
        return 'Renamed `' + oldName + '` to `' + newName + '`';
    } else {
        names.set(apgcode, newName);
        await writeFile('data/names.txt', Array.from(names.entries()).map(x => x[0] + ' ' + x[1]).join('\n'));
        return 'Set name to `' + newName + '`';
    }
}

export async function cmdDeleteName(msg: Message, argv: string[]): Promise<Response> {
    await msg.channel.sendTyping();
    if (!sentByAccepterer(msg)) {
        throw new BotError('You are not an accepterer');
    }
    let data = await findRLE(msg);
    if (!data) {
        throw new BotError('Cannot find RLE');
    }
    let apgcode = getApgcode(findType(data.p, NAME_GENERATIONS, false));
    if (!apgcode.startsWith('x') && !apgcode.startsWith('y')) {
        apgcode = data.p.toCanonicalApgcode(1, 'x');
    }
    let name = names.get(apgcode);
    if (typeof name === 'string') {
        names.delete(apgcode);
        await writeFile('data/names.txt', Array.from(names.entries()).map(x => x[0] + ' ' + x[1]).join('\n'));
        return `Name deleted! Pattern was named \`${name}\``;
    } else {
        throw new BotError('Pattern is not named');
    }
}


export async function cmdSimStats(msg: Message, argv: string[]): Promise<Response> {
    let page = argv[1] ? parseInt(argv[1]) - 1 : 0;
    if (Number.isNaN(page)) {
        throw new BotError('Invalid page number');
    }
    let data = Object.entries(simStats).sort((x, y) => y[1] - x[1]).slice(page * 10, (page + 1) * 10);
    let out = data.map(x => x[0] + ': ' + x[1]).join('\n');
    if (out === '') {
        out = 'No data!';
    }
    return {embeds: [new EmbedBuilder().setTitle('Most popular rules (page ' + (page + 1) + ')').setDescription(out)]};
}

export async function cmdSaveSimStats(msg: Message): Promise<Response> {
    if (!sentByAccepterer(msg)) {
        throw new BotError('You are not an accepterer');
    }
    await writeFile('data/sim_stats.json', JSON.stringify(simStats, undefined, 4));
    return 'Saved!';
}


export async function cmdAlias(msg: Message): Promise<Response> {
    let data = msg.content.slice(msg.content.indexOf(' ') + 1).split('\n');
    let alias = data[0].toLowerCase().trim();
    if (alias === '') {
        throw new BotError('No alias provided!');
    }
    let isValidRule = true;
    try {
        createPattern(alias);
    } catch (error) {
        if (error instanceof RuleError) {
            isValidRule = false;
        } else {
            throw error;
        }
    }
    if (isValidRule) {
        return 'Did not add alias because it is a valid rule';
    }
    let rule = data.slice(1).join('\n');
    if (rule === '') {
        if (msg.attachments.size > 0) {
            let attachment = msg.attachments.first();
            if (attachment) {
                rule = await (await fetch(attachment.url)).text();
            }
        }
        if (rule === '') {
            throw new BotError('Cannot alias to an empty rule.\n\nThe proper syntax is:\n```\n!alias <alias>\n<rule>\n```');
        }
    }
    if (alias in aliases && !sentByAccepterer(msg)) {
        throw new BotError('Alias is already used');
    }
    aliases[alias] = rule;
    await writeFile('data/aliases.json', JSON.stringify(aliases, undefined, 4));
    return 'Alias set!';
}

export async function cmdUnalias(msg: Message, argv: string[]): Promise<Response> {
    if (!sentByAccepterer(msg)) {
        throw new BotError('You are not an accepterer');
    }
    let alias = argv.slice(1).join(' ').toLowerCase().trim();
    if (alias in aliases) {
        delete aliases[alias];
        await writeFile('data/aliases.json', JSON.stringify(aliases, undefined, 4));
        return 'Alias deleted!';
    } else {
        return 'Alias does not exist';
    }
}

export async function cmdLookupAlias(msg: Message, argv: string[]): Promise<Response> {
    let alias = argv.slice(1).join(' ').toLowerCase().trim();
    if (!(alias in aliases)) {
        return 'Alias does not exist';
    }
    let out: string[] = [alias];
    while (alias in aliases) {
        alias = aliases[alias];
        try {
            createPattern(alias);
        } catch (error) {
            if (error instanceof RuleError) {
                alias = alias.toLowerCase();
                out.push(alias);
                if (out.includes(alias)) {
                    break;
                } else {
                    continue;
                }
            } else {
                throw error;
            }
        }
        out.push(alias);
        break;
    }
    return out.join(' -> ');
}
