import { spawn } from 'node:child_process';
import { existsSync, copyFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 16)) {
    console.error('Requires Node.js >=22.16. Node.js 24 LTS is recommended.');
    process.exit(1);
}
if (!existsSync(join(root, 'dist/server.js'))) {
    console.error('Missing dist/server.js. Extract the complete archive first.');
    process.exit(1);
}
if (!existsSync('.env.local'))
    copyFileSync('.env.example', '.env.local');
let opened = false;
const child = spawn(process.execPath, ['dist/server.js'], { cwd: root, env: process.env, stdio: ['inherit', 'pipe', 'inherit'] });
child.stdout.on('data', chunk => { process.stdout.write(chunk); const m = /http:\/\/127\.0\.0\.1:\d+/.exec(chunk.toString()); if (m && !opened) {
    opened = true;
    if (process.platform === 'win32')
        spawn('cmd.exe', ['/d', '/c', 'start', '', m[0]], { stdio: 'ignore', windowsHide: true });
    else if (process.platform === 'darwin')
        spawn('open', [m[0]], { stdio: 'ignore' });
} });
child.on('exit', code => process.exit(code ?? 0));
child.on('error', err => { console.error(err.message); process.exit(1); });
process.on('SIGINT', () => child.kill('SIGINT'));
