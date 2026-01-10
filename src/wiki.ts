
import {EmbedBuilder} from 'discord.js';
import {BotError, Message, Response} from './util.js';


const NAMESPACES: {[key: string]: number} = {
    'talk': 1,
    'user': 2,
    'user talk': 3,
    'lifewiki': 4,
    'lifewiki talk': 5,
    'file': 6,
    'file talk': 7,
    'mediawiki': 8,
    'mediawiki talk': 9,
    'template': 10,
    'template talk': 11,
    'help': 12,
    'help talk': 13,
    'category': 14,
    'category talk': 15,
    'conwaylife.com': 16,
    'conwaylife.com talk': 17,
    'oca': 102,
    'oca talk': 103,
    'lv': 3782,
    'lv talk': 3783,
    'rle': 3792,
    'rle talk': 3793,
    'rule': 3794,
    'rule talk': 3795,
    'media': -2,
    'special': -1,
};


export async function cmdWiki(msg: Message, argv: string[]): Promise<Response> {
    let query = argv.slice(1).join(' ').toLowerCase();
    let namespace = 0;
    if (query.includes(':')) {
        let parts = query.split(':');
        if (!(parts[0] in NAMESPACES)) {
            throw new BotError(`Invalid namespace: '${parts[0]}'`);
        }
        namespace = NAMESPACES[parts[0]];
        query = parts[1];
    }
    let resp = await fetch(`https://conwaylife.com/w/api.php?action=query&list=search&srnamespace=${namespace}&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json`);
    if (!resp.ok) {
        throw new BotError(`Server returned ${resp.status} ${resp.statusText}`);
    }
    let data = JSON.parse(await resp.text()).query.search[0];
    let title = `[${data.title}](https://conwaylife.com/wiki/${encodeURIComponent(data.title)})`;
    let text = data.snippet;
    throw new Error(title + '\n\n' + text);
    return {embeds: [(new EmbedBuilder()).setTitle(title).setDescription(text)]};
}
