import { ConfigStore } from "../../ai/config.js";
/** Minimal narrator for the W&G module. It reads only the public projection and
 * never mutates state; dice and damage stay in the rules engine. */
export async function narrateWg(state, input) {
    const config = new ConfigStore().config;
    if (config.mode === 'mock')
        return '（规则演示模式）雨声压低了远处的钟声。你们的动作已经结算；接下来由你们决定。';
    if (!config.model)
        throw new Error('AI 设置里没有模型 ID。');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 60000));
    const system = [
        '你是《怒火与荣耀》（Wrath & Glory）C7 的 AI 游戏主持人。',
        '只叙述已经由规则引擎结算的事实；不得更改数值、创伤、冲击、荣耀、毁灭或骰子结果。',
        '不要替玩家做决定，不要编造未出现的线索。用简洁、阴冷、克制的第三人称中文叙述，120 字以内。',
        '如果玩家只输入动作，描述环境与可见后果，并把下一步选择留给玩家。',
    ].join('\n');
    const user = JSON.stringify({ input: input.slice(0, 800), state }).slice(0, 12000);
    try {
        const response = await fetch(config.baseUrl + '/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: 'Bearer ' + config.apiKey } : {}) },
            body: JSON.stringify({
                ...config.extraBody,
                model: config.model,
                messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
                temperature: 0.7,
                max_tokens: 400,
                stream: false,
            }),
            signal: controller.signal,
        });
        if (!response.ok)
            throw new Error(`模型接口返回 HTTP ${response.status}`);
        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || !text.trim())
            throw new Error('模型没有返回叙事文本。');
        return text.trim();
    }
    catch (error) {
        if (controller.signal.aborted)
            throw new Error('模型请求超时。');
        throw error;
    }
    finally {
        clearTimeout(timer);
    }
}
