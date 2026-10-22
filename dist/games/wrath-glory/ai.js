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
function parseDecision(text) {
    const cleaned = text.replace(/```(?:json)?/gi, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end < start)
        return null;
    try {
        const data = JSON.parse(cleaned.slice(start, end + 1));
        const narration = typeof data?.narration === 'string' ? data.narration.trim() : '';
        if (!narration)
            return null;
        let action = null;
        if (data?.action && typeof data.action === 'object') {
            if (data.action.type === 'choose' && typeof data.action.choiceId === 'string')
                action = { type: 'choose', choiceId: data.action.choiceId };
            else if (data.action.type === 'attack' && typeof data.action.attackerId === 'string' && typeof data.action.targetId === 'string')
                action = { type: 'attack', attackerId: data.action.attackerId, targetId: data.action.targetId };
        }
        else if (typeof data?.choiceId === 'string' && data.choiceId)
            action = { type: 'choose', choiceId: data.choiceId };
        return { narration, action };
    }
    catch {
        return null;
    }
}
/** AI GM proposal: narration plus at most one scenario choice. The server
 * validates the choice against the current public choices; no numbers or
 * resources are accepted from the model. */
export async function gmDecide(state, input, choices, attacks = []) {
    const config = new ConfigStore().config;
    if (config.mode === 'mock')
        return { narration: '（规则演示模式）雨声压低了远处的钟声。你们可以继续查看线索，或向前推进。', action: null };
    if (!config.model)
        throw new Error('AI 设置里没有模型 ID。');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 60000));
    const system = [
        '你是《怒火与荣耀》C7 的 AI GM。返回严格 JSON，不要 Markdown，不要解释格式。',
        '格式：{"narration":"120 字以内的中文叙述","action":null | {"type":"choose","choiceId":"..."} | {"type":"attack","attackerId":"...","targetId":"..."}}。',
        'choose 只能从给定 choices 里选；attack 只能从给定 attacks 里选；否则 action 必须为 null。',
        '不得输出骰子结果、伤害数字、资源变化；这些由引擎结算。',
        '如果当前没有合适动作，或玩家只是询问/说话，action 必须为 null。',
        '叙述只描述当前场景与已发生事实，不替玩家做超出 action 的决定。',
    ].join('\n');
    const user = JSON.stringify({
        input: input.slice(0, 800),
        choices: choices.map((c) => ({ id: c.id, label: c.label })),
        attacks,
        state,
    }).slice(0, 12000);
    try {
        const response = await fetch(config.baseUrl + '/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: 'Bearer ' + config.apiKey } : {}) },
            body: JSON.stringify({
                ...config.extraBody,
                model: config.model,
                messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
                temperature: 0.5,
                max_tokens: 500,
                stream: false,
            }),
            signal: controller.signal,
        });
        if (!response.ok)
            throw new Error(`模型接口返回 HTTP ${response.status}`);
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string')
            throw new Error('模型没有返回文本。');
        const decision = parseDecision(content);
        if (!decision)
            return { narration: content.trim().slice(0, 600), action: null };
        if (decision.action?.type === 'choose') {
            const action = decision.action;
            if (!choices.some((c) => c.id === action.choiceId))
                decision.action = null;
        }
        if (decision.action?.type === 'attack') {
            const action = decision.action;
            if (!attacks.some((a) => a.attackerId === action.attackerId && a.targetId === action.targetId))
                decision.action = null;
        }
        return decision;
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
