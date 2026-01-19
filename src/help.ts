
import {BotError, Message, Response} from './util.js';


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
        extra: `Example: !sim 1 fps 20 > wait 10 > 10 fps 200\nThe parts are seperated by spaces (some parts also include spaces, so if you want to disambiguate it, you may use > as a separator). Each part specifies a thing to do.\n\nValid parts:\n* <gens> - Run for that many generations\n* <gens> <step> - Run for that many generations at that step.\n* wait <seconds> - Wait for that many seconds.\n* jump <gens> - Run the pattern for that many generations, but don't add the frames.\n* <x> fps - Sets the frames per second of the outputted gif (default 20).\n* size <x> - Sets the size (in the outputted gif) of the smaller axis (width or height, whichever is smaller) to x pixels (default 100). This cannot be used multiple times to have different parts of the gif at different sizes.\n* ca - Toggles the use of CAViewer.\n* stable - Run the pattern until stabilization (this even works with linear growth).\n* identify - Identify the pattern and run for that many generations. Will also put a short description with the GIF output.\n* identify x<number> - Identify the pattern and additionally run for that many periods, so "identify x2", instead of running for 1 period, will run for 2 periods. "identify x1" is equal to "identify".\n* setrule <rule> - Changes the rule.\n\nWhen there is only 1 part, and it is just a number (or 2 numbers), the number is subtracted by 1. This makes it so you can do !sim <period of oscillator> and it will work.\n\nIt will automatically time out after 30 seconds, you cannot simulate things for longer than this.`
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
                name: 'percent',
                optional: true,
                desc: 'The percentage to fill the pattern (must end in %, default 50%).',
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

    hashsoup: {
        desc: 'Get a Catagolue hashsoup',
        args: [
            {
                name: 'symmetry',
                desc: 'The symmetry to use.',
            },
            {
                name: 'seed',
                desc: 'The seed for the soup (k_whatever).',
            },
            {
                name: 'rule',
                desc: 'The rule to use.',
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

    population: {
        desc: 'Get the population of a pattern.',
        args: [],
        aliases: ['pop'],
    },

    map_to_int: {
        desc: 'Converts a MAP rule to an INT rule.',
        args: [
            {
                name: 'rule',
                desc: 'The MAP rule to convert.',
            },
        ],
        aliases: ['maptoint'],
    },

    map_to_hex_int: {
        desc: 'Converts a MAP rule to a Hexagonal INT rule.',
        args: [
            {
                name: 'rule',
                desc: 'The MAP rule to convert.',
            },
        ],
        aliases: ['maptohexint'],
    },

    int_to_map: {
        desc: 'Converts an INT rule to a MAP rule.',
        args: [
            {
                name: 'rule',
                desc: 'The INT rule to convert.',
            },
        ],
        aliases: ['inttomap'],
    },

    normalize_rule: {
        desc: 'Normalizes a rule.',
        args: [
            {
                name: 'rule',
                desc: 'The rule to normalize.',
            },
        ],
        aliases: ['normalizerule'],
    },

    rule_symmetry: {
        desc: 'Gets the symmetry of a rule.',
        args: [
            {
                name: 'rule',
                desc: 'The rule to use.',
            },
        ],
        aliases: ['rulesymmetry'],
    },

    black_white_reversal: {
        desc: 'Gets the black/white reversal of a rule.',
        args: [
            {
                name: 'rule',
                desc: 'The rule to use.',
            },
        ],
        aliases: ['blackwhitereverse', 'bwreverse'],
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

    full_identify: {
        desc: 'Identify a pattern, but provide even more information',
        args: [
            {
                name: 'generations',
                optional: true,
                desc: 'Number of generations to run the identifier for (default 256).'
            },
        ],
        aliases: ['fullidentify'],
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

    sssss: {
        desc: 'Query the 5S database',
        args: [
            {
                name: 'type',
                optional: true,
                desc: 'The rulespace to use: int/intb0/ot/otb0/intgen/otgen, default int.',
            },
            {
                name: 'speed',
                desc: 'A speed, such as c/2, c/2o, c/2d, (2, 1)c/5, etc',
            },
        ],
        aliases: ['5s'],
    },

    sssss_info: {
        desc: 'Query the status of a specific rulespace in 5S',
        args: [
            {
                name: 'type',
                optional: true,
                desc: 'The rulespace to use: int/intb0/ot/otb0/intgen/otgen, default int.',
            },
        ],
        aliases: ['sssssinfo', '5s_info', '5sinfo'],
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
                desc: 'The rule being aliased to. Must be on a new line. Can be a file.',
            },
        ],
        aliases: ['upload'],
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

    wiki: {
        desc: 'Look up something on the ConwayLife.com wiki',
        args: [
            {
                name: 'page',
                desc: 'The page to look up',
            },
        ],
    },

    noreplypings: {
        desc: 'Disables reply pings when using commands',
        args: [],
    },

    yesreplypings: {
        desc: 'Enables reply pings when using commands (This command removes you from the list of no-reply-ping users, and therefore deletes your data)',
        args: [],
    },

};


let helpMsg = 'A cellular automata bot for the ConwayLife Lounge Discord server\n\nCommands:\n';
let helpMsgs: {[key: string]: string} = {};

for (let cmd in HELP) {
    let data = HELP[cmd];
    helpMsg += `* ${cmd} - ${data.desc}\n`;
    let msg = '`!' + cmd;
    for (let arg of data.args) {
        msg += arg.newline ? '\n' : ' ';
        if (arg.optional) {
            msg += '[' + arg.name + ']';
        } else {
            msg += '<' + arg.name + '>';
        }
    }
    msg += '`\n\n' + data.desc + '\n\nArguments:';
    for (let arg of data.args) {
        msg += '\n* ';
        if (arg.optional) {
            msg += '[' + arg.name + ']';
        } else {
            msg += '<' + arg.name + '>';
        }
        msg += ' - ' + arg.desc;
    }
    if (data.extra) {
        msg += '\n\n' + data.extra;
    }
    if (data.aliases) {
        msg += '\n\nAliases: ' + data.aliases.map(x => '`' + x + '`').join(', ');
    }
    helpMsgs[cmd] = msg;
    if (data.aliases) {
        for (let alias in data.aliases) {
            helpMsgs[alias] = msg;
        }

    }
}

helpMsg = helpMsg.slice(0, -1);

export async function cmdHelp(msg: Message, argv: string[]): Promise<Response> {
    if (argv.length > 1) {
        let cmd = argv.slice(1).join(' ');
        if (cmd.startsWith('!')) {
            cmd = cmd.slice(1);
        }
        if (cmd in helpMsgs) {
            return helpMsgs[cmd];
        } else {
            throw new BotError(`No command called !${cmd}`);
        }
    } else {
        return helpMsg;
    }
}
