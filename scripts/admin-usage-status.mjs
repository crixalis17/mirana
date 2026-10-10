import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {loadProviderUsage} from '../lib/admin/provider-usage.ts';

// Local operator diagnostic. Credentials stay in memory, never printed or put in argv.
let local = {};
try {local = parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));}
catch (error) {if (error.code !== 'ENOENT') throw new Error('Could not read the local environment file.');}
const snapshot = await loadProviderUsage({env: {...local, ...process.env}});
console.log(JSON.stringify(snapshot, null, 2));
