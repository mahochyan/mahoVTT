import { WORLD } from "./scenario.js";
/** This is a dedicated, non-authoritative DM channel. It cannot mutate saves. */
export async function narrate(config, state, events, question = '') {
    const fallback = events.length ? events.map(e => e.text).join(' ') : '通讯阵列的灯光在沉默里缓慢闪烁。';
    if (config.mode !== 'openai' || !config.model)
        return { text: fallback, source: 'rules' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 30000));
    try {
        const visible = { name: state.actors.find(x => x.id === 'pc')?.name, round: state.round, flags: state.flags,
            actors: state.actors.map(a => ({ id: a.id, name: a.name, role: a.role, wounds: a.wounds, maxWounds: a.maxWounds })), facts: events, question: question.slice(0, 500) };
        const response = await fetch(config.baseUrl + '/chat/completions', {
            method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
            body: JSON.stringify({ model: config.model, stream: false, temperature: 0.5, max_tokens: 400, messages: [
                    { role: 'system', content: '你是科幻战术跑团的中文 DM。只根据已发生事实写 80-160 字气氛或回答提问。不可改写骰子、伤亡、位置、任务进度，不可替玩家做决定。此副本是原创实验短篇，不要声称完整官方规则。' },
                    { role: 'user', content: JSON.stringify({ world: WORLD.public, visible }) }
                ] })
        });
        if (!response.ok)
            throw new Error('MODEL_HTTP_' + response.status);
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        const text = typeof content === 'string' ? content.trim() : '';
        if (!text)
            throw new Error('MODEL_EMPTY');
        return { text: text.slice(0, 1200), source: 'model' };
    }
    catch {
        return { text: fallback, source: 'rules-fallback' };
    }
    finally {
        clearTimeout(timer);
    }
}
