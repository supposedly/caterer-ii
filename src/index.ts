
import * as lifeweb from '../lifeweb/lib/index.js';
import {inspect} from 'node:util';
import {Client, GatewayIntentBits} from 'discord.js';
import {BotError, Response, Message, config, sentByAdmin, aliases, findRLE} from './util.js';
import {cmdIdentify, cmdBasicIdentify, cmdMinmax, cmdSim, cmdHashsoup, cmdApgencode, cmdApgdecode} from './ca.js';
import {cmdSssss, cmdDyk, cmdName, cmdRename, cmdDeleteName, cmdSimStats, cmdSaveSimStats, cmdAlias, cmdUnalias, cmdLookupAlias} from './db.js';


interface Help {
    desc: string;
    args: {
        name: string;
        optional?: boolean;
        newline?: boolean;
        desc: string;
    }[];
    extra?: string;
    aliases?: string[];
}

const HELP: {[key: string]: Help} = {

    help: {
        desc: 'Display a help message',
        args: [
            {
                name: 'command',
                optional: true,
                desc: 'Command to display infomation for. If omitted or invalid, displays generic help/info message.'
            },
        ],
        extra: 'If an argument looks like <arg>, it is required. If it looks like [arg], it is optional.'
    },

    eval: {
        desc: 'Evaluates code (admins only)',
        args: [
            {
                name: 'code',
                desc: 'The code to run',
            },
        ],
    },

    ping: {
        desc: 'Gets the latency',
        args: [],
    },

    identify: {
        desc: 'Identify a pattern',
        args: [
            {
                name: 'generations',
                optional: true,
                desc: 'Number of generations to run the identifier for (default 256).'
            },
        ],
    },

    basic_identify: {
        desc: 'Identify a pattern, but provide less information',
        args: [
            {
                name: 'generations',
                optional: true,
                desc: 'Number of generations to run the identifier for (default 256).'
            },
        ],
        aliases: ['basicidentify'],
    },

    minmax: {
        desc: 'Find the minimum and maximum rule of a pattern',
        args: [
            {
                name: 'generations',
                desc: 'Number of generations to run the pattern for.',
            },
        ],
    },

    sim: {
        desc: 'Simulate a RLE and output a gif',
        args: [
            {
                name: '\'time\'',
                optional: true,
                desc: 'Shows how much time it took',
            },
            {
                name: 'parts',
                desc: 'Specifies how to simulate',
            },
        ],
        extra: `Example: !sim 1 fps 20 > wait 10 > 10 fps 200\nThe parts are seperated by >. Each part specifies a thing to do.\n\nValid parts:\n<gens> - Run for that many generations\n<gens> <step> - Run for that many generations at that step.\nwait <frames> - Wait for that many frames.\njump <gens> - Run the pattern for that many generations, but don't add the frames.\n\nThese prefixes can appear before any part:\n<x> fps - Sets the frames per second of the outputted gif (default 20).\nsize <x> - Sets the size (in the outputted gif) of the smaller axis (width or height, whichever is smaller) to x pixels (default 100). This cannot be used multiple times to have different parts of the gif at different sizes.\n\nWhen there is only 1 part, and it is just a number (or 2 numbers), the number is subtracted by 1. This makes it so you can do !sim <period of oscillator> and it will work.`
    },

    'sim rand': {
        desc: 'Simulate a random pattern',
        args: [
            {
                name: 'size',
                optional: true,
                desc: 'The size of the pattern, such as 20x20 or 8x32 (default 16x16).',
            },
            {
                name: 'rule',
                desc: 'The rule to simulate it in.'
            },
            {
                name: 'parts',
                desc: 'How to run it. See !help sim.',
            },
        ],
    },

    sssss: {
        desc: 'Query the 5S database',
        args: [
            {
                name: 'speed',
                desc: 'A speed, such as c/2, c/2o, c/2d, (2, 1)c/5, etc',
            },
        ],
        aliases: ['5s'],
    },

    name: {
        desc: 'Find or set the name of a pattern',
        args: [
            {
                name: 'new_name',
                optional: true,
                desc: 'The new name. If provided, it will set the name. If omitted, it will just show the current name.'
            },
        ],
        aliases: ['rename'],
    },

    rename: {
        desc: 'Change the name of a pattern (accepterers only)',
        args: [
            {
                name: 'new_name',
                desc: 'The new name.',
            },
        ],
        aliases: ['rename'],
    },

    delete_name: {
        desc: 'Delete the name of a pattern (accepterers only)',
        args: [],
        aliases: ['deletename'],
    },

    sim_stats: {
        desc: 'Get statistics on the most popular rules used by !sim',
        args: [
            {
                name: 'page',
                optional: true,
                desc: 'The page to get data for, defaults to 0.'
            },
        ],
        aliases: ['simstats'],
    },

    save_sim_stats: {
        desc: 'Save the !sim stats (accepterer only)',
        args: [],
        aliases: ['savesimstats'],
    },

    alias: {
        desc: 'Alias a rule',
        args: [
            {
                name: 'alias',
                desc: 'The new alias for the rule.',
            },
            {
                name: 'rule',
                newline: true,
                desc: 'The rule being aliased to',
            },
        ],
    },

    unalias: {
        desc: 'Remove an alias for a rule (accepterers only)',
        args: [
            {
                name: 'alias',
                desc: 'The alias to remove.',
            },
        ],
        aliases: ['delete_alias', 'deletealias'],
    },

    lookup_alias: {
        desc: 'Looks up an alias for a rule',
        args: [
            {
                name: 'alias',
                desc: 'The alias to look up.',
            },
        ],
        aliases: ['lookupalias'],
    },

    hashsoup: {
        desc: 'Get a Catagolue hashsoup.',
        args: [
            {
                name: 'rule',
                desc: 'The rule to use.',
            },
            {
                name: 'symmetry',
                desc: 'The symmetry to use.',
            },
            {
                name: 'seed',
                desc: 'The seed for the soup (k_whatever).',
            },
        ],
    },

    apgencode: {
        desc: 'Get an unprefixed apgcode for any pattern',
        args: [],
    },

    apgdecode: {
        desc: 'Decode an unprefixed apgcode.',
        args: [
            {
                name: 'apgcode',
                desc: 'The apgcode to decode.',
            },
            {
                name: 'rule',
                optional: true,
                desc: 'The rule to use (default B3/S23).',
            },
        ],
    },

};

let helpMsg = '```ansi\n\x1b[1m\x1b[34mA cellular automata bot for the ConwayLife Lounge Discord server\n\nCommands:\x1b[0m';
let helpMsgs: {[key: string]: string} = {};

let padding = Math.max(...Object.keys(HELP).map(x => x.length));

for (let cmd in HELP) {
    let data = HELP[cmd];
    helpMsg += '\n' + cmd.padEnd(padding) + ' | ' + data.desc;
    let msg = '```ansi\n' + '\x1b[1m\x1b[34m!' + cmd + '\x1b[0m';
    for (let arg of data.args) {
        msg += arg.newline ? '\n' : ' ';
        if (arg.optional) {
            msg += '[' + arg.name + ']';
        } else {
            msg += '<' + arg.name + '>';
        }
    }
    msg += '\n' + data.desc + '.``````ansi\n\x1b[1m\x1b[34mArguments:\x1b[0m';
    for (let arg of data.args) {
        msg += '\n';
        if (arg.optional) {
            msg += '[' + arg.name + ']';
        } else {
            msg += '<' + arg.name + '>';
        }
        msg += ' - ' + arg.desc;
    }
    if (data.extra) {
        msg += '``````ansi\n' + data.extra;
    }
    msg += '```';
    helpMsgs[cmd] = msg;
    if (data.aliases) {
        for (let alias in data.aliases) {
            helpMsgs[alias] = msg;
        }
    }
}

helpMsg += '```';


const EVAL_PREFIX = '\nlet {' + Object.keys(lifeweb).join(', ') + '} = lifeweb;\n';


const COMMANDS: {[key: string]: (msg: Message, argv: string[]) => Promise<Response>} = {

    async help(msg: Message, argv: string[]): Promise<Response> {
        if (argv.length > 1) {
            let cmd = argv.slice(1).join(' ');
            if (cmd.startsWith('!')) {
                cmd = cmd.slice(1);
            }
            if (cmd in helpMsgs) {
                return helpMsgs[cmd];
            } else {
                return `No command called !${cmd}`;
            }
        } else {
            return helpMsg;
        }
    },

    async eval(msg: Message, argv: string[]): Promise<Response> {
        if (sentByAdmin(msg)) {
            await msg.channel.sendTyping();
            let code = argv.slice(1).join(' ');
            if (!code.includes(';') && !code.includes('\n')) {
                code = 'return ' + code;
            }
            let out = (new Function('client', 'msg', 'lifeweb', 'aliases', 'findRLE', '"use strict";' + EVAL_PREFIX + code))(client, msg, lifeweb, aliases, findRLE);
            return '```ansi\n' + inspect(out, {
                colors: true,
                depth: 2, 
            }) + '```';
        }
    },

    async ping(msg: Message): Promise<undefined> {
        let msg2 = await msg.reply('Pong!');
        msg2.edit(`Pong! Latency: ${Math.round(msg2.createdTimestamp - msg.createdTimestamp)} ms (Discord WebSocket: ${Math.round(client.ws.ping)} ms)`)
    },

    async pig(msg: Message): Promise<undefined> {
        if (msg.reference) {
            await (await msg.fetchReference()).react('🐷');
        } else {
            await msg.react('🐷');
        }
    },

    identify: cmdIdentify,
    basic_identify: cmdBasicIdentify,
    basicidentify: cmdBasicIdentify,
    minmax: cmdMinmax,
    sim: cmdSim,

    sssss: cmdSssss,
    '5s': cmdSssss,
    dyk: cmdDyk,
    name: cmdName,
    rename: cmdRename,
    delete_name: cmdDeleteName,
    deletename: cmdDeleteName,
    sim_stats: cmdSimStats,
    simstats: cmdSimStats,
    save_sim_stats: cmdSaveSimStats,
    savesimstats: cmdSaveSimStats,
    alias: cmdAlias,
    unalias: cmdUnalias,
    delete_alias: cmdUnalias,
    deletealias: cmdUnalias,
    lookup_alias: cmdLookupAlias,
    lookupalias: cmdLookupAlias,

    hashsoup: cmdHashsoup,
    apgencode: cmdApgencode,
    apgdecode: cmdApgdecode,

};


let previousMsgs: [string, Message][] = [];

async function runCommand(msg: Message): Promise<void> {
    if (msg.author.bot) {
        return;
    }
    let data = msg.content;
    if (data.startsWith('!')) {
        data = data.slice(1);
    } else if (data.startsWith('ca.')) {
        data = data.slice(1);
    } else {
        return;
    }
    let argv = data.slice(1).split(' ');
    let cmd = argv[0].toLowerCase();
    if (cmd in COMMANDS) {
        try {
            let out = await COMMANDS[cmd](msg, argv);
            if (out) {
                previousMsgs.push([msg.id, await msg.reply(out)]);
            }
        } catch (error) {
            if (error instanceof BotError || error instanceof lifeweb.RuleError) {
                previousMsgs.push([msg.id, await msg.reply('Error: ' + error.message)]);
            } else {
                let str: string;
                if (error && typeof error === 'object' && 'stack' in error) {
                    str = String(error.stack);
                } else {
                    str = String(error);
                }
                console.log(str);
                previousMsgs.push([msg.id, await msg.reply('```' + str + '```')]);
            }
            throw error;
        }
        if (previousMsgs.length > 2000) {
            previousMsgs = previousMsgs.slice(1000);
        }
    }
}


let client = new Client({intents: [
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
]});

client.once('clientReady', () => console.log('Logged in'));

client.on('messageCreate', runCommand);

client.on('messageUpdate', async (old, msg) => {
    try {
        let index = previousMsgs.findLastIndex(x => x[0] === old.id);
        if (index > -1) {
            let msg = previousMsgs[index][1];
            msg.delete();
            previousMsgs = previousMsgs.splice(index, 1);
        }
    } catch (error) {
        let str: string;
        if (error && typeof error === 'object' && 'stack' in error) {
            str = String(error.stack);
        } else {
            str = String(error);
        }
        await msg.reply('```' + str + '```');
        throw error;
    }
    runCommand(msg);
});

client.login(config.token);
