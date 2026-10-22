import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const files = readdirSync('tests').filter(name => name.endsWith('.test.mjs')).sort().map(name => 'tests/' + name);
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error)
    console.error(result.error.message);
process.exit(result.status ?? 1);
