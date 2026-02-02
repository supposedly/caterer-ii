
import * as fs from 'node:fs/promises';
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
    if (query.length === 0) {
        throw new BotError('No page provided!');
    }
    let namespace = 0;
    if (query.includes(':')) {
        let parts = query.split(':');
        if (!(parts[0] in NAMESPACES)) {
            throw new BotError(`Invalid namespace: '${parts[0]}'`);
        }
        namespace = NAMESPACES[parts[0]];
        query = parts[1];
    }
    console.log(namespace, query);
    let resp = await fetch(`https://conwaylife.com/w/api.php?action=query&list=search&srnamespace=${namespace}&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json`);
    if (!resp.ok) {
        throw new BotError(`Server returned ${resp.status} ${resp.statusText}`);
    }
    let data = JSON.parse(await resp.text()).query.search;
    if (data.length === 0) {
        throw new BotError('No such page exists!');
    }
    let title = data[0].title;
    let url = `https://conwaylife.com/wiki/${encodeURIComponent(data[0].title).replaceAll('%20', '_')}`;
    let id = data[0].pageid;
    resp = await fetch(`https://conwaylife.com/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&pageids=${id}&format=json`);
    if (!resp.ok) {
        throw new BotError(`Server returned ${resp.status} ${resp.statusText}`);
    }
    let text: string = JSON.parse(await resp.text()).query.pages[id].revisions[0].slots.main['*'].trim();
    let i = 0;
    let prefix = '';
    while (text.toLowerCase().startsWith('#redirect ')) {
        if (i === 0) {
            prefix = `Redirected from [${title}](https://conwaylife.com/w/index.php?title=${encodeURIComponent(title)}&redirect=no)\n\n`;
        }
        let line = text.slice('#redirect '.length);
        let index = line.indexOf('\n');
        if (index !== -1) {
            line = line.slice(0, index);
        }
        let match = line.match(/\[\[\s*([^\]|#]+).*?\]\]/);
        if (!match) {
            break;
        }
        title = match[1].trim();
        resp = await fetch(`https://conwaylife.com/w/api.php?action=query&titles=${encodeURIComponent(title)}&format=json`);
        if (!resp.ok) {
            throw new BotError(`Server returned ${resp.status} ${resp.statusText}`);
        }
        let data = JSON.parse(await resp.text());
        let id = Object.keys(data.query.pages)[0];
        if (id === '-1') {
            break;
        }
        resp = await fetch(`https://conwaylife.com/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&pageids=${id}&format=json`);
        if (!resp.ok) {
            throw new BotError(`Server returned ${resp.status} ${resp.statusText}`);
        }
        text = JSON.parse(await resp.text()).query.pages[id].revisions[0].slots.main['*'].trim();
        i++;
        if (i === 10) {
            break;
        }
    }
    let useImage = false;
    if (!text.match(/\{\{[^{]*hideimg[^{]*\}\}/)) {
        let resp = await fetch(`https://conwaylife.com/w/api.php?action=query&titles=File:${title.replaceAll(' ', '')}.gif&prop=imageinfo&iiprop=url&format=json`);
        if (resp.ok) {
            let data = JSON.parse(await resp.text())?.query?.pages;
            if (typeof data === 'object') {
                data = data[Object.keys(data)[0]]?.imageinfo?.url;
                if (typeof data === 'string') {
                    let resp = await fetch(data);
                    if (resp.ok) {
                        await fs.writeFile('image.gif', new Uint8Array(await resp.arrayBuffer()));
                        useImage = true;
                    }
                }
            }
        }
    }
    text = text.replaceAll(/<!--.*?-->/g, '');
    text = text.replaceAll(/<noinclude>.*?<\/noinclude>/g, '');
    text = text.replaceAll(/\{\{period\|(\d+)\}\}/g, '[period-$1](https://conwaylife.com/wiki/Category:Oscillators_with_period_$1)');
    text = text.replaceAll(/\{\{year\|(\d+)\}\}/g, '[$1](https://conwaylife.com/wiki/Category:Patterns_found_in_$1)');
    text = text.replaceAll(/<\/?references( \/)?>/g, '');
    text = text.replaceAll(/__[NO]?TOC__/g, '');
    text = text.replaceAll(/^\*\*\*/gm, '    - ');
    text = text.replaceAll(/^\*\*/gm, '  - ');
    text = text.replaceAll(/^\*/gm, '- ');
    text = text.replaceAll(/^#\s+/gm, '1. ');
    text = text.replaceAll('*', '\\*');
    text = text.replaceAll('_', '\\_');
    text = text.replaceAll('~', '\\~');
    text = text.replaceAll('`', '\\`');
    text = text.replaceAll('|', '\\|');
    text = text.replaceAll('#', '\\#');
    text = text.replaceAll(/(?<=\n): /g, '     ');
    text = text.replaceAll(/'''''(.*?)'''''/g, '***$1***');
    text = text.replaceAll(/'''(.*?)'''/g, '**$1**');
    text = text.replaceAll(/''(.*?)''/g, '*$1*');
    text = text.replaceAll(/^======\s*(.*?)\s*======$/gm, '###### $1');
    text = text.replaceAll(/^=====\s*(.*?)\s*=====$/gm, '##### $1');
    text = text.replaceAll(/^====\s*(.*?)\s*====$/gm, '#### $1');
    text = text.replaceAll(/^===\s*(.*?)\s*===$/gm, '### $1');
    text = text.replaceAll(/^==\s*(.*?)\s*==$/gm, '## $1');
    text = text.replaceAll(/^=\s*(.*?)\s*=$/gm, '# $1');
    text = text.replaceAll(/\[\[(File|Image):[^\]]+\]\]/gi, '');
    text = text.replaceAll(/\[(https?:\/\/[^\s]+)\s+([^\]]+)\]((e?s)?)/g, '[$2$3]($1)');
    text = text.replaceAll(/\[\[([^\|\]]+)\|([^\]]+)\]\]((e?s)?)/g, (_, url, name, s) => `[${name}${s}](https://conwaylife.com/wiki/${encodeURIComponent(url)})`);
    text = text.replaceAll(/\[\[([^\]]+)\]\]((e?s)?)/g, (_, page, s) => `[${page}${s}](https://conwaylife.com/wiki/${encodeURIComponent(page)})`);
    text = text.replaceAll(/<pre>([\s\S]*?)<\/pre>/g, (_, code) => `\`\`\`\n${code.trim()}\n\`\`\``);
    text = text.replaceAll(/<code>(.*?)<\/code>/g, '`$1`');
    text = text.replaceAll(/ ?\{\{[^}]+\}\}/g, '');
    text = text.replaceAll(/<ref[^>]*>.*?<\/ref>/gs, '');
    text = text.replaceAll(/\n{3,}/g, '\n\n');
    text = text.replaceAll(/(?<=\n)\n+(?=#+ )/g, '');
    text = text.trim();
    text = prefix + text;
    if (text.length > 1000) {
        text = text.slice(0, 1000);
        text = text.slice(0, text.lastIndexOf(' ')) + '...';
    }
    let embed = (new EmbedBuilder()).setTitle(title).setDescription(text).setURL(url);
    if (useImage) {
        return {embeds: [embed.setThumbnail('attachment://image.gif')], files: ['./image.gif']};
    } else {
        return {embeds: [embed]};
    }
}
