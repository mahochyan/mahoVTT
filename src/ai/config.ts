import { readFileSync, existsSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT } from '../world.ts';
import { GameError, type ProviderConfig } from '../types.ts';
export function loadEnv() { const path = join(ROOT, '.env.local'); if (!existsSync(path))
    return; for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined)
        process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
} }
loadEnv();
export const DATA_DIR = process.env.SAGAS_DATA_DIR || join(ROOT, 'data');
export class ConfigStore {
    path: string;
    config: ProviderConfig;
    constructor() {
        this.path = join(DATA_DIR, 'settings.json');
        let saved: Partial<ProviderConfig> = {};
        if (existsSync(this.path))
            try {
                saved = JSON.parse(readFileSync(this.path, 'utf8'));
            }
            catch { }
        this.config = { mode: process.env.AI_PROVIDER === 'openai' ? 'openai' : 'mock', baseUrl: process.env.AI_BASE_URL || 'http://127.0.0.1:8000/v1', model: process.env.AI_MODEL || '', apiKey: process.env.AI_API_KEY || '', jsonMode: process.env.AI_JSON_MODE === 'json_object' ? 'json_object' : 'off', timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 45000, maxTokens: 1024, temperature: 0.35, contextChars: 24000, extraBody: {}, ...saved };
    }
    public() { const { apiKey, ...rest } = this.config; return { ...rest, hasApiKey: !!apiKey }; }
    update(raw: unknown) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            throw new GameError('BAD_CONFIG', '配置必须是对象。');
        const r = raw as Record<string, unknown>;
        let url: URL;
        try {
            url = new URL(String(r.baseUrl ?? this.config.baseUrl));
        }
        catch {
            throw new GameError('BAD_URL', '请输入完整的 http:// 或 https:// 模型地址。');
        }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
            throw new GameError('BAD_URL', '模型地址格式不受支持。');
        const mode = r.mode ?? this.config.mode;
        if (!['mock', 'openai'].includes(String(mode)))
            throw new GameError('BAD_CONFIG', '未知模型模式。');
        const model = String(r.model ?? this.config.model).trim();
        if (model.length > 200)
            throw new GameError('BAD_CONFIG', '模型 ID 过长。');
        const timeoutMs = Number(r.timeoutMs ?? this.config.timeoutMs), maxTokens = Number(r.maxTokens ?? this.config.maxTokens), contextChars = Number(r.contextChars ?? this.config.contextChars);
        if (!Number.isInteger(timeoutMs) || timeoutMs < 3000 || timeoutMs > 180000 || !Number.isInteger(maxTokens) || maxTokens < 128 || maxTokens > 4096 || !Number.isInteger(contextChars) || contextChars < 8000 || contextChars > 120000)
            throw new GameError('BAD_CONFIG', '超时、输出长度或上下文预算超出允许范围。');
        const jsonMode = r.jsonMode ?? this.config.jsonMode;
        if (!['off', 'json_object'].includes(String(jsonMode)))
            throw new GameError('BAD_CONFIG', '未知 JSON 模式。');
        let extraBody = r.extraBody ?? this.config.extraBody;
        if (typeof extraBody === 'string') {
            try {
                extraBody = JSON.parse(extraBody);
            }
            catch {
                throw new GameError('BAD_CONFIG', '额外请求参数必须是合法 JSON。');
            }
        }
        if (!extraBody || typeof extraBody !== 'object' || Array.isArray(extraBody) || JSON.stringify(extraBody).length > 4000 || Object.keys(extraBody).some(x => ['model', 'messages', 'stream', 'response_format', 'api_key', 'base_url'].includes(x)))
            throw new GameError('BAD_CONFIG', '额外参数无效，不能覆盖模型、消息或流式设置。');
        this.config = { ...this.config, mode: mode as ProviderConfig['mode'], baseUrl: url.toString().replace(/\/+$/, '').replace(/\/chat\/completions$/, ''), model, timeoutMs, maxTokens, contextChars, jsonMode: jsonMode as ProviderConfig['jsonMode'], extraBody: extraBody as Record<string, unknown> };
        if (r.apiKey !== undefined && typeof r.apiKey === 'string' && r.apiKey.length > 0)
            this.config.apiKey = r.apiKey;
        if (r.clearApiKey === true)
            this.config.apiKey = '';
        mkdirSync(dirname(this.path), { recursive: true });
        writeFileSync(this.path + '.tmp', JSON.stringify(this.config, null, 2), { mode: 0o600 });
        renameSync(this.path + '.tmp', this.path);
        return this.public();
    }
}
