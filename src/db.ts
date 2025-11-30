
import {parse, identify} from '../lifeweb/lib/index.js';
import {EmbedBuilder} from 'discord.js';
import {BotError, Message, Response, NAME_CHARS, dyks, names, simStats, readFile, writeFile, sentByAccepterer, findRLE, parseSpeed} from './util.js';


export async function cmdSssss(msg: Message, argv: string[]): Promise<Response> {
    await msg.channel.sendTyping();
    let speed = parseSpeed(argv.slice(1).join(' '));
    speed.x = Math.abs(speed.x);
    speed.y = Math.abs(speed.y);
    if (speed.x < speed.y) {
        let temp = speed.y;
        speed.y = speed.x;
        speed.x = temp;
    }
    let file = 'data/sssss/';
    if (speed.y === 0) {
        file += 'Orthogonal';
    } else if (speed.x === speed.y) {
        file += 'Diagonal';
    } else {
        file += 'Oblique';
    }
    file += ' ships.sss.txt';
    let data = (await readFile(file)).toString().split('\n');
    for (let line of data) {
        let [pop, rule, dx, dy, period, rle] = line.split(', ');
        if (speed.p === parseInt(period) && speed.x === parseInt(dx) && speed.y === parseInt(dy)) {
            rle = parse(`x = 0, y = 0, rule = ${rule}\n${rle}`).toRLE();
            return `\`\`\`\n#C (${dx}, ${dy})c/${period}, population ${pop}\n${rle}\`\`\``;
        }
    }
    return 'No such ship found in database!';
}


export async function cmdDyk(): Promise<Response> {
    let num = Math.floor(Math.random() * dyks.length);
    let out = '**#' + (num + 1) + ':** ' + dyks[num] + '\n\n-# Licensed under the [GNU Free Documentation License 1.2](https://www.gnu.org/licenses/fdl-1.3.html)';
    return {embeds: [new EmbedBuilder().setTitle('Did you know...').setDescription(out)]};
}


export async function cmdName(msg: Message, argv: string[]): Promise<Response> {
    await msg.channel.sendTyping();
    let pattern = await findRLE(msg);
    if (!pattern) {
        throw new BotError('Cannot find RLE');
    }
    let apgcode = identify(pattern, 4096).apgcode;
    if (!apgcode.startsWith('x') || apgcode.startsWith('y')) {
        throw new BotError(`Apgcode is ${apgcode}`);
    }
    let newName = argv.slice(1).join(' ');
    if (newName === '') {
        let name = names.get(apgcode);
        if (name !== undefined) {
            return name;
        } else {
            return 'Pattern is not named';
        }
    }
    if (!sentByAccepterer(msg)) {
        throw new BotError('You are not an accepterer');
    }
    if (!Array.from(newName).every(x => NAME_CHARS.includes(x))) {
        throw new BotError('Invalid name!');
    }
    names.set(apgcode, newName);
    await writeFile('data/names.txt', Array.from(names.entries()).map(x => x[0] + ' ' + x[1]).join('\n'));
    if (names.has(apgcode)) {
        return 'Renamed `' + names.get(apgcode) + '` to `' + newName + '`';
    } else {
        return 'Set name to `' + newName + '`';
    }
}


export async function cmdSimStats(msg: Message, argv: string[]): Promise<Response> {
    let page = argv[1] ? parseInt(argv[1]) - 1 : 0;
    if (Number.isNaN(page)) {
        throw new BotError('Invalid page number');
    }
    let data = Object.entries(simStats).sort((x, y) => y[1] - x[1]).reverse().slice(page, page + 10);
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
    await msg.react('✅');
    return undefined;
}
