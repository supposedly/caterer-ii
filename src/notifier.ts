
import {TextChannel} from 'discord.js';
import {TYPE_NAMES} from './db.js';


const LIMIT = 1997;

function splitMessages(...data: (string | string[])[]): string[] {
    let out: string[] = [];
    let current = '';
    for (let value of data) {
        let prev = current;
        if (typeof value === 'string') {
            current += value;
            if (current.length > LIMIT) {
                out.push(prev);
                current = value;
            }
        } else {
            for (let i = 0; i < value.length; i++) {
                let prev = current;
                let part = value[i];
                if (i !== value.length - 1) {
                    part += ', ';
                }
                current += part;
                if (current.length > LIMIT) {
                    out.push(prev);
                    current = part;
                }
            }
        }
    }
    if (current.length > 0) {
        out.push(current);
    }
    return out;
}

function formatNewShips(category: 'speed' | 'period', type: string, data: [string, number][], bold: number): string[] {
    let out: string[] = [];
    for (let [speed, cells] of data) {
        if (cells === bold) {
            out.push(`**${speed} (${cells} cell${cells === 1 ? '' : 's'})**`);
        } else {
            out.push(`${speed} (${cells} cell${cells === 1 ? '' : 's'})`);
        }
    }
    return splitMessages(`${data.length === 1 ? 'New' : data.length + ' new'} ${category}${data.length === 1 ? '' : 's'} in ${type}: `, out);
}

function formatImprovedShips(category: 'speed' | 'period', type: string, data: [string, number, number][], bold: number): string[] {
    let out: string[] = [];
    for (let [speed, newCells, oldCells] of data) {
        if (newCells === bold) {
            out.push(`**${speed} (${oldCells} to ${newCells} cell${newCells === 1 ? '' : 's'})**`);
        } else {
            out.push(`${speed} (${oldCells} to ${newCells} cell${newCells === 1 ? '' : 's'})`);
        }
    }
    return splitMessages(`${data.length === 1 ? 'Improved' : data.length + ' improved'} ${category}${data.length === 1 ? '' : 's'} in ${type}: `, out);
}


type ShipGroup = {newShips: [string, number][], newPeriods: [string, number][], improvedShips: [string, number, number][], improvedPeriods: [string, number, number][]};

export async function check5S(channel: TextChannel): Promise<void> {
    let resp = await fetch('https://speedydelete.com/5s/api/getnewships');
    if (!resp.ok) {
        console.log(`${resp.status} ${resp.statusText} while fetching new ships`);
        return;
    }
    let data = await resp.json() as {newShips: [string, string, number][], improvedShips: [string, string, number, number][], newPeriods: [string, string, number][], improvedPeriods: [string, string, number, number][]};
    if (data.newShips.length === 0 && data.improvedShips.length === 0 && data.newPeriods.length === 0 && data.improvedPeriods.length === 0) {
        return;
    }
    let groups: {[key: string]: ShipGroup} = {};
    for (let key of ['newShips', 'improvedShips', 'newPeriods', 'improvedPeriods'] as const) {
        for (let ship of data[key]) {
            let data: ShipGroup;
            if (ship[0] in groups) {
                data = groups[ship[0]];
            } else {
                data = {newShips: [], newPeriods: [], improvedShips: [], improvedPeriods: []};
                groups[ship[0]] = data;
            }
            // @ts-ignore
            data[key].push(ship.slice(1));
        }
    }
    let msgs: string[] = [];
    for (let key of Object.keys(groups).sort()) {
        let data = groups[key];
        if (key in TYPE_NAMES) {
            key = TYPE_NAMES[key];
        }
        if (data.newShips.length > 0) {
            msgs.push(...formatNewShips('speed', key, data.newShips, 3));
        }
        if (data.newPeriods.length > 0) {
            msgs.push(...formatNewShips('period', key, data.newPeriods, key.includes('B0') ? 1 : 2));
        }
        if (data.improvedShips.length > 0) {
            msgs.push(...formatImprovedShips('speed', key, data.improvedShips, 3));
        }
        if (data.improvedPeriods.length > 0) {
            msgs.push(...formatImprovedShips('period', key, data.improvedPeriods, key.includes('B0') ? 1 : 2));
        }
    }
    for (let msg of msgs) {
        await channel.send(msg);
    }
}
