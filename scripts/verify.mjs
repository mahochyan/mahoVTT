import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const required = ['dist/server.js', 'public/index.html', 'public/app.js', 'public/style.css', 'content/worldbook.json', '.env.example', 'start.cmd'];
for (const file of required)
    if (!existsSync(file)) {
        console.error('Missing:', file);
        process.exit(1);
    }
JSON.parse(readFileSync('content/worldbook.json', 'utf8'));
const syntax = spawnSync(process.execPath, ['--check', 'public/app.js'], { stdio: 'inherit' });
if (syntax.status !== 0)
    process.exit(syntax.status ?? 1);
console.log('Runtime files and browser JavaScript are valid.');
