
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
    let data = JSON.parse(await resp.text()).query.search;
    if (data.length === 0) {
        return 'No such page exists!';
    }
    let title = data[0].title;
    let url = `https://conwaylife.com/wiki/${encodeURIComponent(data.title)}`;
    let id = data[0].pageid;
    resp = await fetch(`https://conwaylife.com/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&pageids=${id}&format=json`);
    if (!resp.ok) {
        throw new BotError(`Server returned ${resp.status} ${resp.statusText}`);
    }
    let text: string = JSON.parse(await resp.text()).query.pages[id].revisions[0].slots.main['*'];
    text = text.replaceAll(/^\*\*\*\s+/gm, '    - ');
    text = text.replaceAll(/^\*\*\s+/gm, '  - ');
    text = text.replaceAll(/^\*\s+/gm, '- ');
    text = text.replaceAll(/^#\s+/gm, '1. ');
    text = text.replaceAll('*', '\\*');
    text = text.replaceAll('_', '\\_');
    text = text.replaceAll('~', '\\~');
    text = text.replaceAll('`', '\\`');
    text = text.replaceAll('|', '\\|');
    text = text.replaceAll('#', '\\#');
    text = text.replaceAll(/'''''(.*?)'''''/g, '***$1***');
    text = text.replaceAll(/'''(.*?)'''/g, '**$1**');
    text = text.replaceAll(/''(.*?)''/g, '*$1*');
    text = text.replaceAll(/^=\s+(.*?)\s+=$/gm, '# $1');
    text = text.replaceAll(/^==\s+(.*?)\s+==$/gm, '## $1');
    text = text.replaceAll(/^===\s+(.*?)\s+===$/gm, '### $1');
    text = text.replaceAll(/^====\s+(.*?)\s+====$/gm, '#### $1');
    text = text.replaceAll(/^=====\s+(.*?)\s+=====$/gm, '##### $1');
    text = text.replaceAll(/^======\s+(.*?)\s+======$/gm, '###### $1');
    text = text.replaceAll(/\[(https?:\/\/[^\s]+)\s+([^\]]+)\]/g, '[$2]($1)');
    text = text.replaceAll(/\[\[([^\|\]]+)\|([^\]]+)\]\]/g, (_, url, name) => `[${name}](https://conwaylife.com/wiki/${encodeURIComponent(url)})`);
    text = text.replaceAll(/\[\[([^\]]+)\]\]/g, (_, page) => `[${page}](https://conwaylife.com/wiki/${encodeURIComponent(page)})`);
    text = text.replaceAll(/<pre>([\s\S]*?)<\/pre>/g, (_, code) => `\`\`\`\n${code.trim()}\n\`\`\``);
    text = text.replaceAll(/<code>(.*?)<\/code>/g, '`$1`');
    text = text.replaceAll(/\{\{year\|(\d+)\}\}/g, '[$1](https://conwaylife.com/wiki/$1)')
    text = text.replaceAll(/<ref[^>]*>.*?<\/ref>/gs, '');
    text = text.replaceAll(/\[\[(File|Image):[^\]]+\]\]/gi, '');
    text = text.replaceAll(/\n{3,}/g, '\n\n');
    text = text.replaceAll(/(?<=\n)\n+(?=# )/g, '');
    text = text.trim();
    if (text.length > 1000) {
        text = text.slice(0, 1000) + '...';
    }
    return {embeds: [(new EmbedBuilder()).setTitle(title).setURL(url).setDescription(text)]};
}
