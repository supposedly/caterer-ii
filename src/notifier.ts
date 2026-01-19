
import {TextChannel} from 'discord.js';
import {TYPE_NAMES} from './db.js';


export async function check5S(channel: TextChannel): Promise<void> {
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
                    lines.push(`${improvedShips.length} improved speeds in ${TYPE_NAMES[type]}: ${improvedShips.map(x => x[2] === 3 ? `**${x[1]} (${x[3]} cells to ${x[2]} cells)**` : `${x[1]} (${x[3]} cells to ${x[2]} cells)`).join(', ')}`);
                }
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
    } else {
        console.log(`${resp.status} ${resp.statusText} while fetching new ships`);
    }
}
