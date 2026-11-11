import {createInterface} from 'node:readline';
import {pinDigest} from '../auth.js';
const lines=createInterface({input:process.stdin,terminal:false});
for await(const line of lines){const input=JSON.parse(line);if(!/^\d{4,12}$/.test(input.pin))throw Error('Invalid PIN format');const salt=Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');process.stdout.write(JSON.stringify({salt,hash:await pinDigest(input.pin,salt)})+'\n');lines.close();break;}
