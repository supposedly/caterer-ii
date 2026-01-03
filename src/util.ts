
import * as fs from 'node:fs/promises';
import {join} from 'node:path';
import {Pattern, parse} from '../lifeweb/lib/index.js';
import {Message as _Message, OmitPartialGroupDMChannel} from 'discord.js';


export class BotError extends Error {}


export type Message = OmitPartialGroupDMChannel<_Message>;

export type Response = undefined | void | Parameters<Message['reply']>[0];

export interface Config {
    token: string;
    admins: string[];
    accepterers: string[];
    wrapperToken: string;
    sssssChannel: string;
}


let basePath = join(import.meta.dirname, '..');

export async function readFile(path: string): Promise<string> {
    return (await fs.readFile(join(basePath, path))).toString();
}

export async function writeFile(path: string, data: Parameters<typeof fs.writeFile>[1]): Promise<void> {
    await fs.writeFile(join(basePath, path), data);
}


export const NAME_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789~!@#$%^&*()-=_+[]\\{}|;\':",./<>? ';

export const RLE_HEADER = /\s*x\s*=\s*\d+\s*,?\s*y\s*=\s*\d+/;


export let config: Config = JSON.parse(await readFile('config.json'));
export let dyks = (await readFile('data/dyk.txt')).split('\n').slice(1);
export let simStats = JSON.parse(await readFile('data/sim_stats.json')) as {[key: string]: number};
export let names = new Map((await readFile('data/names.txt')).split('\n').map(x => x.split(' ')).map(x => [x[0], x.slice(1).join(' ')]));
export let aliases = JSON.parse(await readFile('data/aliases.json')) as {[key: string]: string};
export let noReplyPings = JSON.parse(await readFile('data/no_reply_pings.json')) as string[];


export function sentByAdmin(msg: Message): boolean {
    return config.admins.includes(msg.author.id);
}

export function sentByAccepterer(msg: Message): boolean {
    if (sentByAdmin(msg)) {
        return true;
    }
    if (msg.member && msg.member.roles.cache.find(role => config.accepterers.includes(role.id))) {
        return true;
    }
    return false;
}



function findRLEFromText(data: string): Pattern | undefined {
    let match = RLE_HEADER.exec(data);
    if (!match) {
        return;
    }
    data = data.slice(match.index);
    let index = data.indexOf('!');
    if (index === -1) {
        return;
    }
    return parse(data.slice(0, index + 1), aliases, true);
}

async function findRLEFromMessage(msg: Message): Promise<{msg: Message, p: Pattern} | undefined> {
    let out = findRLEFromText(msg.content);
    if (out) {
        return {msg, p: out};
    }
    if (msg.attachments.size > 0) {
        let attachment = msg.attachments.first();
        if (attachment) {
            let data = await (await fetch(attachment.url)).text();
            let out = findRLEFromText(data);
            if (out) {
                return {msg, p: out};
            } else {
                return undefined;
            }
        }
    }
}

export async function findRLE(msg: Message): Promise<{msg: Message, p: Pattern} | undefined> {
    let out = await findRLEFromMessage(msg);
    if (out) {
        return out;
    }
    if (msg.reference) {
        let reply = await msg.fetchReference();
        out = await findRLEFromMessage(reply);
        if (out) {
            return out;
        }
    }
    let msgs = await msg.channel.messages.fetch({limit: 50});
    for (let msg of msgs) {
        if (msg[1].author.bot) {
            continue;
        }
        if (out = await findRLEFromMessage(msg[1] as Message)) {
            return out;
        }
    }
}
