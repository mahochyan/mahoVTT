import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {BUILTIN} from '../modules/deathwatch/content.mjs';
import {newSession} from '../modules/deathwatch/engine.mjs';
import {plan, narrative, references} from '../modules/deathwatch/ai.mjs';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const seq = values => {
  let i = 0;
  return sides => ((values[i++ % values.length] - 1) % sides) + 1;
};
const squad = [
  {id: 'pc', name: '塞维鲁', chapter: 'ultramarines', specialty: 'tactical', chapterChoice: ['ws', 'bs']},
  {id: 'ally-1', name: '凯', chapter: 'blood-angels', specialty: 'assault'},
  {id: 'ally-2', name: '德拉科', chapter: 'dark-angels', specialty: 'devastator'},
];
const session = () => newSession({leaderId: 'pc', oathId: 'astartes', squad}, BUILTIN, seq([4, 8, 6, 10, 2]));
const config = {mode: 'openai', baseUrl: 'http://model.test/v1', model: 'test-model', apiKey: '', timeoutMs: 5000, maxTokens: 512, contextChars: 24000};

function stub(replies, calls = []) {
  globalThis.fetch = async (url, init) => {
    calls.push({url, body: JSON.parse(init.body)});
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    return {
      ok: reply.ok !== false,
      status: reply.status ?? 200,
      async json() { return reply.body; },
    };
  };
  return calls;
}
const reply = content => ({body: {choices: [{message: {content}, finish_reason: 'stop'}]}});

test('模型提案被规范化并通过规则校验', async () => {
  const s = session();
  const calls = stub([reply(JSON.stringify({command: {type: 'move', x: 3, y: 7, pace: 'half'}, line: '往前压。'}))]);
  const out = await plan(config, s, '向前移动', 'pc', false);
  assert.equal(out.command.type, 'move');
  assert.equal(out.command.actorId, 'pc');
  assert.equal(out.line, '往前压。');
  assert.equal(out.source, 'test-model');
  assert.equal(calls[0].body.messages[0].role, 'system');
  assert.ok(calls[0].body.messages[1].content.includes('向前移动'));
  assert.equal(calls[0].body.stream, false);
});

test('越权命令被拒绝：模型不能提交 manual 裁定', async () => {
  const s = session();
  const calls = stub([reply(JSON.stringify({command: {type: 'manual', note: '让玩家掉血'}}))]);
  await assert.rejects(() => plan(config, s, '随便', 'pc', false), /两次行动提案均未通过校验|越权/);
  assert.equal(calls.length, 2, '应重试一次');
});

test('非法目标被规则校验拒绝，而不是靠掷骰判断', async () => {
  const s = session();
  stub([reply(JSON.stringify({command: {type: 'attack', targetId: 'ghost', mode: 'single'}}))]);
  await assert.rejects(() => plan(config, s, '射击幽灵', 'pc', false), /两次行动提案/);
});

test('只返回 reasoning_content 时不当作最终内容', async () => {
  const s = session();
  stub([{body: {choices: [{message: {reasoning_content: '思考中…'}, finish_reason: 'stop'}]}}]);
  await assert.rejects(() => plan(config, s, '观察', 'pc', false), /reasoning_content/);
});

test('模型输出被截断时明确失败', async () => {
  const s = session();
  stub([{body: {choices: [{message: {content: '{"command":'}, finish_reason: 'length'}]}}]);
  await assert.rejects(() => plan(config, s, '观察', 'pc', false), /截断/);
});

test('规则演示模式不调用模型：队友走确定性策略，玩家自由输入明确报错', async () => {
  const s = session();
  const calls = stub([reply('{}')]);
  const ai = await plan({...config, mode: 'mock'}, s, '', 'ally-1', true);
  assert.equal(ai.source, 'rules-fallback');
  assert.ok(ai.command);
  await assert.rejects(() => plan({...config, mode: 'mock'}, s, '我想做点什么', 'pc', false), /需要接入模型/);
  assert.equal(calls.length, 0);
});

test('叙事：模型失败时退回事实文本，不改变状态', async () => {
  const s = session();
  stub([new Error('boom')]);
  await assert.rejects(() => narrative(config, s, '现在发生什么？'), /模型连接失败|模型超时/);
  const fallback = await narrative({...config, mode: 'mock'}, s, '现在发生什么？');
  assert.equal(fallback.source, 'facts');
  assert.ok(fallback.text.length > 0);
});

test('叙事只使用已提交事实，问题过长被拒绝', async () => {
  const s = session();
  const calls = stub([reply('风声从破损的舱门灌进来。')]);
  const out = await narrative(config, s, '我看到了什么？', []);
  assert.equal(out.text, '风声从破损的舱门灌进来。');
  assert.ok(calls[0].body.messages[1].content.includes('已结算事实'));
  // 超长问题在这里被截断；接口层另有 1500 字上限（见 HTTP 测试）。
  const before = calls.length;
  await narrative(config, s, 'x'.repeat(1600));
  const prompt = calls[before].body.messages[1].content;
  assert.ok(prompt.length < 6000, '问题应被截断');
});

test('私有索引缺失时给出明确提示，不伪造命中', () => {
  const out = references('E:/nonexistent-data-dir', '闪避');
  assert.equal(out.available, false);
  assert.deepEqual(out.hits, []);
  assert.match(out.message, /尚未安装私有书籍索引/);
});
