import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const required = [
    'dist/server.js',
    'public/index.html',
    'public/platform.html',
    'public/games/wrath-glory/index.html',
    'public/games/wrath-glory/app.js',
    'public/games/wrath-glory/style.css',
    'public/games/wrath-glory/art/graveyard-shift.webp',
    'public/app.js',
    'public/js/platform.js',
    'public/js/core.js',
    'public/style.css',
    'public/platform.css',
    'public/play.css',
    'legacy/whispering-tower/worldbook.json',
    '.env.example',
    'start.cmd',
];
for (const file of required) {
    if (!existsSync(file)) {
        console.error('Missing:', file);
        process.exit(1);
    }
    if (statSync(file).size === 0) {
        console.error('Empty file:', file);
        process.exit(1);
    }
}
JSON.parse(readFileSync('legacy/whispering-tower/worldbook.json', 'utf8'));
for (const js of ['public/app.js', 'public/js/platform.js', 'public/js/core.js']) {
    const syntax = spawnSync(process.execPath, ['--check', js], { stdio: 'inherit' });
    if (syntax.status !== 0)
        process.exit(syntax.status ?? 1);
}
console.log('Runtime files, platform assets and browser JavaScript are valid.');
