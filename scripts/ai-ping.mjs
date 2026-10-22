import { ConfigStore, DATA_DIR } from '../dist/ai/config.js';
import { Provider } from '../dist/ai/provider.js';
import { newGame } from '../dist/world.js';
import { resolvePlan } from '../dist/engine/engine.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const cfg = new ConfigStore(), provider = new Provider(cfg.config);
const index = process.argv.indexOf('--samples'), samples = index >= 0 ? Number(process.argv[index + 1]) : 1;
if (!Number.isInteger(samples) || samples < 1 || samples > 100) {
    console.error('--samples must be 1..100');
    process.exit(1);
}
const report = { at: new Date().toISOString(), mode: cfg.config.mode, model: cfg.config.model, samples, passed: 0, results: [], stream: null };
try {
    console.log(await provider.ping());
    if (cfg.config.mode === 'mock')
        console.log('NOTE: mock mode is not a DGX compatibility test. Configure OpenAI mode first.');
    const s = newGame('AI 接入验证', '测试旅人');
    let resolved;
    for (let i = 0; i < samples; i++) {
        const start = Date.now();
        try {
            const p = await provider.plan(s, '观察当前营地，不移动、不花费物品。', 'pc');
            resolved = resolvePlan(s, p.commands, 'player');
            report.passed++;
            report.results.push({ ok: true, latencyMs: Date.now() - start, commands: p.commands });
            process.stdout.write(`plan ${i + 1}/${samples}: PASS (${Date.now() - start}ms)\n`);
        }
        catch (err) {
            report.results.push({ ok: false, error: err.message, latencyMs: Date.now() - start });
            console.log(`plan ${i + 1}/${samples}: FAIL ${err.message}`);
        }
    }
    if (resolved) {
        const start = Date.now();
        let text = '', first = null;
        for await (const d of provider.narrate(resolved.state, resolved.events, '观察营地')) {
            if (first === null)
                first = Date.now() - start;
            text += d;
        }
        report.stream = { ok: true, firstContentMs: first, latencyMs: Date.now() - start, characters: text.length };
        console.log('stream:', report.stream);
    }
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(join(DATA_DIR, 'compatibility-report.json'), JSON.stringify(report, null, 2));
    console.log(`Plans accepted: ${report.passed}/${samples}. Report: data/compatibility-report.json`);
    if (report.passed / samples < .95)
        process.exitCode = 1;
}
catch (err) {
    console.error('AI check failed:', err.message);
    process.exitCode = 1;
}
