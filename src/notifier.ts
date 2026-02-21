
import {TextChannel} from 'discord.js';
import {TYPE_NAMES} from './db.js';


function formatNewShips(category: 'speed' | 'period', type: string, data: [string, number][], bold: number): string {
    let out: string[] = [];
    for (let [speed, cells] of data) {
        if (cells === bold) {
            out.push(`**${speed} (${cells} cell${cells === 1 ? '' : 's'})**`);
        } else {
            out.push(`${speed} (${cells} cell${cells === 1 ? '' : 's'})`);
        }
    }
    return `${data.length} new ${category}${data.length === 1 ? '' : 's'} in ${type}: ${out.join(', ')}`;
}

function formatImprovedShips(category: 'speed' | 'period', type: string, data: [string, number, number][], bold: number): string {
    let out: string[] = [];
    for (let [speed, newCells, oldCells] of data) {
        if (newCells === bold) {
            out.push(`**${speed} (${oldCells} to ${newCells} cell${newCells === 1 ? '' : 's'})**`);
        } else {
            out.push(`${speed} (${oldCells} to ${newCells} cell${newCells === 1 ? '' : 's'})`);
        }
    }
    return `${data.length} improved ${category}${data.length === 1 ? '' : 's'} in ${type}: ${out.join(', ')}`;
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
    let lines: string[] = [];
    for (let key of Object.keys(groups).sort()) {
        let data = groups[key];
        if (key in TYPE_NAMES) {
            key = TYPE_NAMES[key];
        }
        if (data.newShips.length > 0) {
            lines.push(formatNewShips('speed', key, data.newShips, 3));
        }
        if (data.newPeriods.length > 0) {
            lines.push(formatNewShips('period', key, data.newPeriods, key.includes('B0') ? 1 : 2));
        }
        if (data.improvedShips.length > 0) {
            lines.push(formatImprovedShips('speed', key, data.improvedShips, 3));
        }
        if (data.improvedPeriods.length > 0) {
            lines.push(formatImprovedShips('period', key, data.improvedPeriods, key.includes('B0') ? 1 : 2));
        }
    }
    let current = '';
    for (let line of lines) {
        let prev = current;
        current += line + '\n';
        if (current.length > 2000) {
            if (prev !== '') {
                await channel.send(prev);
            }
            current = '';
            while (line.length > 2000) {
                let index = line.slice(0, 1999).lastIndexOf(',');
                await channel.send(line.slice(0, index));
                line = line.slice(index);
            }
            await channel.send(line);
        }
    }
    if (current !== '') {
        while (current.length > 2000) {
            let index = current.slice(0, 1999).lastIndexOf(',');
            await channel.send(current.slice(0, index));
            current = current.slice(index);
        }
        await channel.send(current);
    }
}
