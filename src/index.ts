
import * as lifeweb from '../lifeweb/lib/index.js';
import {inspect} from 'node:util';
import {Client, GatewayIntentBits, Message as _Message, MessageReaction, PartialMessageReaction, MessageReplyOptions, TextChannel, Partials} from 'discord.js';
import {BotError, Response, Message, readFile, writeFile, config, sentByAdmin, aliases, noReplyPings, findRLE} from './util.js';
import {cmdHelp} from './help.js';
import {cmdIdentify, cmdBasicIdentify, cmdMinmax, cmdSim, cmdHashsoup, cmdApgencode, cmdApgdecode, cmdPopulation} from './ca.js';
import {TYPE_NAMES, cmdSssss, cmdSssssInfo, cmdDyk, cmdName, cmdRename, cmdDeleteName, cmdSimStats, cmdSaveSimStats, cmdAlias, cmdUnalias, cmdLookupAlias} from './db.js';
import {cmdWiki} from './wiki.js';


const EVAL_PREFIX = '\nlet {' + Object.keys(lifeweb).join(', ') + '} = lifeweb;\n';


const COMMANDS: {[key: string]: (msg: Message, argv: string[]) => Promise<Response>} = {

    help: cmdHelp,

    async eval(msg: Message, argv: string[]): Promise<Response> {
        if (sentByAdmin(msg)) {
            await msg.channel.sendTyping();
            let code = argv.slice(1).join(' ');
            if (!code.includes(';') && !code.includes('\n')) {
                code = 'return ' + code;
            }
            code = `return (async () => {${code}})()`;
            let out = await (new Function('client', 'msg', 'lifeweb', 'aliases', 'findRLE', 'readFile', 'writeFile', '"use strict";' + EVAL_PREFIX + code))(client, msg, lifeweb, aliases, findRLE, readFile, writeFile);
            return '```ansi\n' + inspect(out, {
                colors: true,
                depth: 2,
            }).replaceAll('\x1b[22m', '\x1b[0m').replaceAll('\x1b[39m', '\x1b[0m') + '```';
        }
    },

    async ping(msg: Message): Promise<Response> {
        let msg2 = await msg.reply({content: 'Pong!', allowedMentions: {repliedUser: !noReplyPings.includes(msg.author.id), parse: []}});
        msg2.edit({content: `Pong! Latency: ${Math.round(msg2.createdTimestamp - msg.createdTimestamp)} ms (Discord WebSocket: ${Math.round(client.ws.ping)} ms)`, allowedMentions: {repliedUser: !noReplyPings.includes(msg.author.id), parse: []}})
    },

    async pig(msg: Message): Promise<Response> {
        if (msg.reference) {
            await (await msg.fetchReference()).react('🐷');
        } else {
            await msg.react('🐷');
        }
    },

    async noreplypings(msg: Message): Promise<Response> {
        if (noReplyPings.includes(msg.author.id)) {
            throw new BotError(`You already have reply pings disabled!`);
        } else {
            noReplyPings.push(msg.author.id);
            await writeFile('data/no_reply_pings.json', JSON.stringify(noReplyPings, undefined, 4));
            return 'Pings disabled!';
        }
    },

    async yesreplypings(msg: Message): Promise<Response> {
        let index = noReplyPings.indexOf(msg.author.id);
        if (index === -1) {
            throw new BotError(`You already have reply pings enabled!`);
        } else {
            noReplyPings.splice(index, 1);
            await writeFile('data/no_reply_pings.json', JSON.stringify(noReplyPings, undefined, 4));
            return 'Pings enabled!';
        }
    },

    'sim': cmdSim,

    'identify': cmdIdentify,
    'basic_identify': cmdBasicIdentify,
    'basicidentify': cmdBasicIdentify,
    'minmax': cmdMinmax,

    'hashsoup': cmdHashsoup,
    'apgencode': cmdApgencode,
    'apgdecode': cmdApgdecode,
    'population': cmdPopulation,
    'pop': cmdPopulation,

    'sssss': cmdSssss,
    '5s': cmdSssss,
    'sssssinfo': cmdSssssInfo,
    '5s_info': cmdSssssInfo,
    '5sinfo': cmdSssssInfo,

    'dyk': cmdDyk,

    'name': cmdName,
    'rename': cmdRename,
    'delete_name': cmdDeleteName,
    'deletename': cmdDeleteName,

    'sim_stats': cmdSimStats,
    'simstats': cmdSimStats,
    'save_sim_stats': cmdSaveSimStats,
    'savesimstats': cmdSaveSimStats,

    'alias': cmdAlias,
    'upload': cmdAlias,
    'unalias': cmdUnalias,
    'delete_alias': cmdUnalias,
    'deletealias': cmdUnalias,
    'lookup_alias': cmdLookupAlias,
    'lookupalias': cmdLookupAlias,

    'wiki': cmdWiki,

};


let previousMsgs: [string, Message][] = [];
let deleters: [string, string][] = [];

async function runCommand(msg: Message): Promise<void> {
    if (msg.author.bot) {
        return;
    }
    let data = msg.content;
    if (data.startsWith('!')) {
        data = data.slice(1);
    } else if (data.startsWith('ca.')) {
        data = data.slice(3);
    } else {
        return;
    }
    let argv: string[];
    if (data.includes('\n')) {
        let parts = data.split('\n');
        if (!parts[0].includes(' ')) {
            argv = [parts[0], ...parts.slice(1).join('\n').split(' ')];
        } else {
            argv = data.split(' ');
        }
    } else {
        argv = data.split(' ');
    }
    let cmd = argv[0].toLowerCase();
    if (cmd in COMMANDS) {
        try {
            let out = await COMMANDS[cmd](msg, argv);
            if (out) {
                if (typeof out === 'string') {
                    previousMsgs.push([msg.id, await msg.reply({content: out, allowedMentions: {repliedUser: !noReplyPings.includes(msg.author.id), parse: []}})]);
                } else if (out instanceof _Message) {
                    previousMsgs.push([msg.id, out]);
                    deleters.push([msg.author.id, out.id]);
                    if (deleters.length > 2000) {
                        deleters.shift();
                    }
                } else {
                    (out as MessageReplyOptions).allowedMentions = {repliedUser: !noReplyPings.includes(msg.author.id), parse: []};
                    previousMsgs.push([msg.id, await msg.reply(out)]);
                }
                if (previousMsgs.length > 2000) {
                    previousMsgs.shift();
                }
            }
        } catch (error) {
            if (error instanceof BotError || error instanceof lifeweb.RuleError) {
                previousMsgs.push([msg.id, await msg.reply({content: 'Error: ' + error.message, allowedMentions: {repliedUser: !noReplyPings.includes(msg.author.id), parse: []}})]);
            } else {
                let str: string;
                if (error && typeof error === 'object' && 'stack' in error) {
                    str = String(error.stack);
                } else {
                    str = String(error);
                }
                console.log(str);
                previousMsgs.push([msg.id, await msg.reply({content: '```' + str + '```', allowedMentions: {repliedUser: !noReplyPings.includes(msg.author.id), parse: []}})]);
            }
        }
        if (previousMsgs.length > 2000) {
            previousMsgs = previousMsgs.slice(1000);
        }
    }
}


let client = new Client({
    intents: [
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.Reaction,
        Partials.GuildMember,
        Partials.User,
        Partials.ThreadMember,
    ],
});

let starboardChannel: TextChannel;
let sssssChannel: TextChannel;

client.once('clientReady', async () => {
    console.log('Logged in');
    starboardChannel = await client.channels.fetch(config.starboardChannel) as TextChannel;
    sssssChannel = await client.channels.fetch(config.sssssChannel) as TextChannel;
});

client.on('messageCreate', runCommand);

client.on('messageUpdate', async (old, msg) => {
    try {
        let index = previousMsgs.findLastIndex(x => x[0] === old.id);
        if (index > -1) {
            let msg = previousMsgs[index][1];
            try {
                msg.delete();
            } catch {}
            previousMsgs = previousMsgs.splice(index, 1);
        }
    } catch (error) {
        let str: string;
        if (error && typeof error === 'object' && 'stack' in error) {
            str = String(error.stack);
        } else {
            str = String(error);
        }
        await msg.reply({content: '```' + str + '```', allowedMentions: {repliedUser: !noReplyPings.includes(msg.author.id), parse: []}});
    }
    runCommand(msg);
});

client.on('messageReactionAdd', async data => {
    if (data.emoji.name === '❌' || data.emoji.name === '🗑️') {
        if (data.partial) {
            data = await data.fetch();
        }
        if (!data.count) {
            return;
        }
        let msg = data.message;
        if (msg.author?.id === client.user?.id && msg.reference) {
            let id = (await data.message.fetchReference()).author.id;
            let users = await data.users.fetch();
            if (users.find(x => x.id === id)) {
                msg.delete();
                return;
            }
            for (let [userId, msgId] of deleters) {
                if (msgId === msg.id && users.find(x => x.id === userId)) {
                    msg.delete();
                    return;
                }
            }
        }
        return;
    }
})


let starboard: Map<string, [string, string]> = new Map(JSON.parse(await readFile('data/starboard.json')));

async function updateStarboard(data: MessageReaction | PartialMessageReaction): Promise<void> {
    if (data.emoji.name !== '⭐') {
        return;
    }
    if (data.partial) {
        data = await data.fetch();
    }
    if (data.count === null) {
        return;
    }
    let msg = data.message;
    if (msg.createdTimestamp < 1768086000000) {
        return;
    }
    let count = (await data.users.fetch()).filter(x => x.id !== msg.author?.id).size;
    let entry = starboard.get(msg.id);
    if (count >= config.starThreshold) {
        let text: string;
        if (count < Math.floor(config.starThreshold * 2)) {
            text = '⭐';
        } else if (count < Math.floor(config.starThreshold * 3)) {
            text = '🌟';
        } else if (count < Math.floor(config.starThreshold * 4)) {
            text = '💫';
        } else {
            text = '✨';
        }
        text += ` **${count}** `;
        if (msg.author?.id === data.client.user.id && msg.attachments.size === 1) {
            text += `Pattern by <@${(await msg.fetchReference()).author.id}>`;
        } else {
            text += `<@${msg.author?.id}>`;
        }
        if (entry) {
            (await starboardChannel.messages.fetch(entry[0])).edit({content: text, allowedMentions: {parse: []}});
        } else {
            let msg0 = await starboardChannel.send({content: text, allowedMentions: {parse: []}});
            let msg1 = await msg.forward(starboardChannel);
            starboard.set(msg.id, [msg0.id, msg1.id]);
            await writeFile('data/starboard.json', JSON.stringify(Array.from(starboard.entries())));
        }
    } else if (entry) {
        starboard.delete(msg.id);
        await starboardChannel.messages.delete(entry[0]);
        await starboardChannel.messages.delete(entry[1]);
    }
}

client.on('messageReactionAdd', updateStarboard);
client.on('messageReactionRemove', updateStarboard);
client.on('messageReactionRemoveAll', async msg => {
    let entry = starboard.get(msg.id);
    if (entry) {
        starboard.delete(msg.id);
        await starboardChannel.messages.delete(entry[0]);
        await starboardChannel.messages.delete(entry[1]);
    }
});


setInterval(async () => {
    try {
        let resp = await fetch('https://speedydelete.com/5s/api/getnewships');
        if (resp.ok) {
            let data = await resp.json() as {newShips: [string, string, number][], improvedShips: [string, string, number, number][]};
            if (data.newShips.length === 0 && data.improvedShips.length === 0) {
                return;
            }
            let lines: string[] = [];
            for (let type of Object.keys(TYPE_NAMES)) {
                let newShips = data.newShips.filter(x => x[0] === type);
                let improvedShips = data.improvedShips.filter(x => x[0] === type);
                if (newShips.length === 0 && improvedShips.length === 0) {
                    continue;
                }
                if (newShips.length > 0) {
                    if (newShips.length === 1) {
                        lines.push(`New speed in ${TYPE_NAMES[type]}: ${newShips[0][2] === 3 ? `**${newShips[0][1]} (${newShips[0][2]} cells)**` : `${newShips[0][1]} (${newShips[0][2]} cells)`}`);
                    } else {
                        lines.push(`${newShips.length} new speeds in ${TYPE_NAMES[type]}: ${newShips.map(x => x[2] === 3 ? `**${x[1]} (${x[2]} cells)**` : `${x[1]} (${x[2]} cells)`).join(', ')}`);
                    }
                }
                if (improvedShips.length > 0) {
                    if (improvedShips.length === 1) {
                        lines.push(`Improved speed in ${TYPE_NAMES[type]}: ${improvedShips[0][2] === 3 ? `**${improvedShips[0][1]} (${improvedShips[0][3]} cells to ${improvedShips[0][2]} cells)**` : `${improvedShips[0][1]} (${improvedShips[0][3]} cells to ${improvedShips[0][2]} cells)`}`);
                    } else {
                        lines.push(`${improvedShips.length} improved speeds in ${TYPE_NAMES[type]}: ${improvedShips.map(x => x[3] === 3 ? `**${x[1]} (${x[3]} cells to ${x[2]} cells)**` : `${x[1]} (${x[3]} cells to ${x[2]} cells)`).join(', ')}`);
                    }
                }
            }
            let current = '';
            for (let line of lines) {
                let prev = current;
                current += line + '\n';
                if (current.length > 2000) {
                    if (prev !== '') {
                        await sssssChannel.send(prev);
                    }
                    current = '';
                    while (line.length > 2000) {
                        let index = line.slice(0, 1999).lastIndexOf(',');
                        await sssssChannel.send(line.slice(0, index));
                        line = line.slice(index);
                    }
                    await sssssChannel.send(line);
                }
            }
            if (current !== '') {
                while (current.length > 2000) {
                    let index = current.slice(0, 1999).lastIndexOf(',');
                    await sssssChannel.send(current.slice(0, index));
                    current = current.slice(index);
                }
                await sssssChannel.send(current);
            }
        } else {
            console.log(`${resp.status} ${resp.statusText} while fetching new ships`);
        }
    } catch (error) {
        let str: string;
        if (error && typeof error === 'object' && 'stack' in error) {
            str = String(error.stack);
        } else {
            str = String(error);
        }
        await sssssChannel.send('```' + str + '```');
    }
}, 60000);


client.login(config.token);
