import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { GameError } from "../types.js";
import { newGame, BOOK, TILES, WIDTH, HEIGHT, roomAt } from "../world.js";
function stable(value) {
    if (Array.isArray(value))
        return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object')
        return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + stable(v)).join(',') + '}';
    return JSON.stringify(value) ?? 'null';
}
export const hash = (value) => createHash('sha256').update(stable(value)).digest('hex');
export class Store {
    db;
    constructor(path) {
        if (path !== ':memory:')
            mkdirSync(dirname(path), { recursive: true });
        this.db = new DatabaseSync(path);
        this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
        this.db.exec(`
 CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
 INSERT OR IGNORE INTO migrations VALUES(1,datetime('now'));
 CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY,name TEXT NOT NULL,state_json TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0,lease_owner TEXT,lease_epoch INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS turns(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,input TEXT NOT NULL,source TEXT NOT NULL,plan_json TEXT,base_version INTEGER NOT NULL,resolution_status TEXT NOT NULL CHECK(resolution_status IN('pending','resolved','failed')),narration_status TEXT NOT NULL CHECK(narration_status IN('not_started','streaming','done','failed')),facts_json TEXT,narrative TEXT NOT NULL DEFAULT '',error TEXT,model TEXT NOT NULL,created_at TEXT NOT NULL,epoch INTEGER NOT NULL,narration_attempt INTEGER NOT NULL DEFAULT 0,latency_ms INTEGER NOT NULL DEFAULT 0,context_json TEXT,UNIQUE(campaign_id,request_id));
 CREATE TABLE IF NOT EXISTS events(campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,seq INTEGER NOT NULL,turn_id TEXT REFERENCES turns(id),type TEXT NOT NULL,payload_json TEXT NOT NULL,state_version INTEGER NOT NULL,PRIMARY KEY(campaign_id,seq));
 CREATE TABLE IF NOT EXISTS dice(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,turn_id TEXT REFERENCES turns(id),payload_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS claims(campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,source_id TEXT NOT NULL,PRIMARY KEY(campaign_id,source_id));
 CREATE TABLE IF NOT EXISTS actors(campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,id TEXT NOT NULL,name TEXT NOT NULL,hp INTEGER NOT NULL CHECK(hp>=0),max_hp INTEGER NOT NULL CHECK(max_hp>0),x INTEGER NOT NULL,y INTEGER NOT NULL,data_json TEXT NOT NULL,PRIMARY KEY(campaign_id,id),CHECK(hp<=max_hp));
 CREATE TABLE IF NOT EXISTS objects(campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,id TEXT NOT NULL,data_json TEXT NOT NULL,PRIMARY KEY(campaign_id,id));
 CREATE INDEX IF NOT EXISTS turns_campaign_created ON turns(campaign_id,created_at);
 `);
    }
    transaction(fn) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const r = fn();
            this.db.exec('COMMIT');
            return r;
        }
        catch (e) {
            this.db.exec('ROLLBACK');
            throw e;
        }
    }
    mirrors(s) {
        const q = this.db.prepare('INSERT INTO actors VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(campaign_id,id) DO UPDATE SET name=excluded.name,hp=excluded.hp,max_hp=excluded.max_hp,x=excluded.x,y=excluded.y,data_json=excluded.data_json');
        for (const a of s.actors)
            q.run(s.id, a.id, a.name, a.hp, a.maxHp, a.x, a.y, JSON.stringify(a));
        for (const o of s.objects)
            this.db.prepare('INSERT INTO objects VALUES(?,?,?) ON CONFLICT(campaign_id,id) DO UPDATE SET data_json=excluded.data_json').run(s.id, o.id, JSON.stringify(o));
        for (const c of s.claims)
            this.db.prepare('INSERT OR IGNORE INTO claims VALUES(?,?)').run(s.id, c);
    }
    create(s) { this.transaction(() => { this.db.prepare('INSERT INTO campaigns(id,name,state_json,version,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(s.id, s.name, JSON.stringify(s), s.version, s.createdAt, new Date().toISOString()); this.mirrors(s); }); return s; }
    list() { return this.db.prepare('SELECT id,name,version,created_at,updated_at,state_json FROM campaigns ORDER BY updated_at DESC').all().map((r) => { const s = JSON.parse(String(r.state_json)); return { id: r.id, name: r.name, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at, status: s.status, playerName: s.playerName, rooms: s.discovered.length, gold: s.gold }; }); }
    get(id) {
        const r = this.db.prepare('SELECT state_json FROM campaigns WHERE id=?').get(id);
        if (!r)
            throw new GameError('NOT_FOUND', '找不到这份战役存档。', 404);
        return JSON.parse(String(r.state_json));
    }
    turn(id) {
        const r = this.db.prepare('SELECT * FROM turns WHERE id=?').get(id);
        if (!r)
            throw new GameError('NOT_FOUND', '回合记录不存在。', 404);
        return r;
    }
    history(id) { return this.db.prepare('SELECT * FROM turns WHERE campaign_id=? ORDER BY rowid DESC LIMIT 60').all(id).reverse().map(t => this.publicTurn(t)); }
    publicTurn(t) { return { id: t.id, input: t.input, source: t.source, resolutionStatus: t.resolution_status, narrationStatus: t.narration_status, narrative: t.narrative, error: t.error, facts: t.facts_json ? JSON.parse(t.facts_json) : [], createdAt: t.created_at, narrationAttempt: t.narration_attempt, model: t.model, latencyMs: t.latency_ms }; }
    recentEvents(id, limit = 100) { return this.db.prepare('SELECT seq,payload_json,state_version FROM events WHERE campaign_id=? ORDER BY seq DESC LIMIT ?').all(id, limit).reverse().map(r => ({ seq: r.seq, ...JSON.parse(String(r.payload_json)), stateVersion: r.state_version })); }
    dice(id, limit = 80) { return this.db.prepare('SELECT payload_json FROM dice WHERE campaign_id=? ORDER BY rowid DESC LIMIT ?').all(id, limit).reverse().map(r => JSON.parse(String(r.payload_json))); }
    reserve(id, requestId, payload, input, source, model, baseVersion) {
        return this.transaction(() => {
            const requestHash = hash(payload);
            const existing = this.db.prepare('SELECT * FROM turns WHERE campaign_id=? AND request_id=?').get(id, requestId);
            if (existing) {
                if (existing.request_hash !== requestHash)
                    throw new GameError('REQUEST_REUSED', '同一个请求 ID 不能用于不同内容。', 409);
                return { turn: existing, owner: null };
            }
            const row = this.db.prepare('SELECT * FROM campaigns WHERE id=?').get(id);
            if (!row)
                throw new GameError('NOT_FOUND', '战役不存在。', 404);
            if (Number(row.version) !== baseVersion)
                throw new GameError('STALE_STATE', '状态已经更新，请刷新后再行动。', 409);
            if (row.lease_owner && Number(row.lease_until) > Date.now())
                throw new GameError('BUSY', '这个战役正在处理另一个动作。', 409);
            const owner = randomUUID(), epoch = Number(row.lease_epoch) + 1, turnId = randomUUID();
            this.db.prepare("UPDATE turns SET resolution_status='failed',error='旧处理租约已过期，行动未提交' WHERE campaign_id=? AND resolution_status='pending'").run(id);
            this.db.prepare('UPDATE campaigns SET lease_owner=?,lease_epoch=?,lease_until=? WHERE id=? AND version=?').run(owner, epoch, Date.now() + 120000, id, baseVersion);
            this.db.prepare("INSERT INTO turns(id,campaign_id,request_id,request_hash,input,source,base_version,resolution_status,narration_status,model,created_at,epoch) VALUES(?,?,?,?,?,?,?,'pending','not_started',?,?,?)").run(turnId, id, requestId, requestHash, input, source, baseVersion, model, new Date().toISOString(), epoch);
            return { turn: this.turn(turnId), owner };
        });
    }
    heartbeat(turn, owner) { return this.db.prepare('UPDATE campaigns SET lease_until=? WHERE id=? AND lease_owner=? AND lease_epoch=?').run(Date.now() + 120000, turn.campaign_id, owner, turn.epoch).changes; }
    commit(turn, owner, r, plan, latency = 0) {
        return this.transaction(() => {
            const row = this.db.prepare('SELECT version,lease_owner,lease_epoch,lease_until FROM campaigns WHERE id=?').get(turn.campaign_id);
            const current = this.turn(turn.id);
            if (!row || row.lease_owner !== owner || Number(row.lease_epoch) !== turn.epoch || Number(row.lease_until) <= Date.now() || Number(row.version) !== turn.base_version || current.resolution_status !== 'pending')
                throw new GameError('LEASE_LOST', '状态或处理资格已改变，旧计划未写入。', 409);
            if (r.state.version !== turn.base_version + 1)
                throw new GameError('BAD_VERSION', '结算版本不连续。', 500);
            this.db.prepare('UPDATE campaigns SET state_json=?,version=?,updated_at=?,lease_owner=NULL,lease_until=0 WHERE id=? AND version=? AND lease_owner=? AND lease_epoch=?').run(JSON.stringify(r.state), r.state.version, new Date().toISOString(), turn.campaign_id, turn.base_version, owner, turn.epoch);
            this.mirrors(r.state);
            let seq = Number(this.db.prepare('SELECT COALESCE(MAX(seq),0) AS n FROM events WHERE campaign_id=?').get(turn.campaign_id).n);
            for (const e of r.events)
                this.db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?)').run(turn.campaign_id, ++seq, turn.id, e.type, JSON.stringify(e), r.state.version);
            for (const d of r.dice)
                this.db.prepare('INSERT INTO dice VALUES(?,?,?,?)').run(d.id, turn.campaign_id, turn.id, JSON.stringify(d));
            this.db.prepare("UPDATE turns SET resolution_status='resolved',plan_json=?,facts_json=?,latency_ms=?,context_json=? WHERE id=? AND resolution_status='pending'").run(JSON.stringify(plan), JSON.stringify(r.events), latency, JSON.stringify(r.state), turn.id);
            return { turn: this.turn(turn.id), eventSeq: seq };
        });
    }
    fail(turn, owner, error) { this.transaction(() => { this.db.prepare("UPDATE turns SET resolution_status='failed',error=? WHERE id=? AND resolution_status='pending'").run(error.slice(0, 500), turn.id); this.db.prepare('UPDATE campaigns SET lease_owner=NULL,lease_until=0 WHERE id=? AND lease_owner=? AND lease_epoch=?').run(turn.campaign_id, owner, turn.epoch); }); }
    beginNarration(turnId) {
        return this.transaction(() => {
            const t = this.turn(turnId);
            if (t.resolution_status !== 'resolved')
                throw new GameError('NOT_RESOLVED', '尚未结算，不能重试叙事。', 409);
            const attempt = t.narration_attempt + 1;
            this.db.prepare("UPDATE turns SET narration_status='streaming',narration_attempt=?,narrative='',error=NULL WHERE id=?").run(attempt, turnId);
            return attempt;
        });
    }
    saveNarration(turnId, attempt, text, ok, error = null) { this.db.prepare('UPDATE turns SET narration_status=?,narrative=?,error=? WHERE id=? AND narration_attempt=?').run(ok ? 'done' : 'failed', text.slice(0, 18000), error, turnId, attempt); }
    setNarrative(turnId, text) { const t = this.turn(turnId); this.db.prepare("UPDATE turns SET narrative=?,narration_status='done' WHERE id=? AND narration_attempt=?").run(text.slice(0, 18000), turnId, t.narration_attempt); }
    recover(force = false) {
        this.transaction(() => {
            const now = Date.now();
            const rows = this.db.prepare(`SELECT id FROM campaigns WHERE lease_until < ? ${force ? 'OR 1=1' : ''}`).all(now);
            for (const row of rows) {
                this.db.prepare("UPDATE turns SET resolution_status='failed',error='服务重启或租约过期，未提交动作已停止；可明确重试' WHERE campaign_id=? AND resolution_status='pending'").run(row.id);
                this.db.prepare('UPDATE campaigns SET lease_owner=NULL,lease_until=0,lease_epoch=lease_epoch+1 WHERE id=?').run(row.id);
            }
            if (force)
                this.db.prepare("UPDATE turns SET narration_status='failed',error='服务重启，已结算事实保留，可重试叙事' WHERE narration_status='streaming'").run();
        });
    }
    autoAttempts(id, activation) { return Number(this.db.prepare('SELECT COUNT(*) AS n FROM turns WHERE campaign_id=? AND request_id LIKE ?').get(id, activation + ':%').n); }
    patchHp(id, version, actorId, hp) {
        return this.transaction(() => {
            const s = this.get(id);
            if (s.version !== version)
                throw new GameError('STALE_STATE', '角色卡版本已更新，修改没有覆盖新状态。', 409);
            if (!Number.isInteger(hp) || hp < 0)
                throw new GameError('BAD_HP', 'HP 必须是非负整数。');
            const a = s.actors.find(x => x.id === actorId && x.faction === 'party');
            if (!a || hp > a.maxHp)
                throw new GameError('BAD_HP', '只能修正队伍角色的 HP，不能超过上限。');
            if (s.combat || s.status !== 'playing')
                throw new GameError('IN_COMBAT', '人工修正仅允许在非战斗、未结束的战役中使用。');
            const before = a.hp;
            a.hp = hp;
            a.conditions = hp === 0 ? [{ id: 'downed', remainingRounds: -1 }] : [];
            s.version++;
            this.db.prepare('UPDATE campaigns SET state_json=?,version=?,lease_owner=NULL,lease_until=0,lease_epoch=lease_epoch+1,updated_at=? WHERE id=? AND version=?').run(JSON.stringify(s), s.version, new Date().toISOString(), id, version);
            this.mirrors(s);
            const n = Number(this.db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS n FROM events WHERE campaign_id=?').get(id).n);
            const e = { type: 'manual_adjustment', text: `人工修正：${a.name} HP ${before} → ${hp}。`, actorId: a.id, data: { before, after: hp } };
            this.db.prepare('INSERT INTO events VALUES(?,?,NULL,?,?,?)').run(id, n, e.type, JSON.stringify(e), s.version);
            return s;
        });
    }
    freeRoll(id, dice) { this.get(id); this.db.prepare('INSERT INTO dice(id,campaign_id,turn_id,payload_json) VALUES(?,?,NULL,?)').run(dice.id, id, JSON.stringify(dice)); }
    export(id) { return this.transaction(() => { const data = { format: 'graylight-save', formatVersion: 1, contentVersion: BOOK.version, exportedAt: new Date().toISOString(), state: this.get(id), turns: this.db.prepare('SELECT * FROM turns WHERE campaign_id=? ORDER BY rowid').all(id), events: this.db.prepare('SELECT * FROM events WHERE campaign_id=? ORDER BY seq').all(id), dice: this.db.prepare('SELECT * FROM dice WHERE campaign_id=? ORDER BY rowid').all(id) }; return { ...data, checksum: hash(data) }; }); }
    import(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            throw new GameError('BAD_SAVE', '存档必须是 JSON 对象。');
        const r = raw;
        const { checksum, ...data } = r;
        if (checksum !== hash(data))
            throw new GameError('BAD_CHECKSUM', '存档校验和不一致，文件可能损坏或被修改。');
        if (r.format !== 'graylight-save' || r.formatVersion !== 1 || r.contentVersion !== BOOK.version)
            throw new GameError('BAD_SAVE_VERSION', '不兼容的存档或冒险内容版本。');
        const s = validateState(r.state);
        const newId = randomUUID();
        s.id = newId;
        s.name = s.name + ' · 导入';
        s.createdAt = new Date().toISOString();
        for (const key of ['turns', 'events', 'dice'])
            if (!Array.isArray(r[key]) || r[key].length > 100000)
                throw new GameError('BAD_SAVE', '历史记录格式或数量不合法。');
        this.transaction(() => {
            this.db.prepare('INSERT INTO campaigns(id,name,state_json,version,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(s.id, s.name, JSON.stringify(s), s.version, s.createdAt, s.createdAt);
            this.mirrors(s);
            const ids = new Map();
            for (const t of r.turns) {
                if (typeof t.id !== 'string' || ids.has(t.id) || !['pending', 'resolved', 'failed'].includes(t.resolution_status) || typeof t.input !== 'string' || t.input.length > 3000 || typeof t.narrative !== 'string' || t.narrative.length > 18000)
                    throw new GameError('BAD_SAVE', '回合记录不合法。');
                const id = randomUUID();
                ids.set(t.id, id);
                const facts = t.facts_json ? JSON.parse(t.facts_json) : [];
                validateFacts(facts);
                let context = null;
                if (t.context_json) {
                    const ctx = validateState(JSON.parse(t.context_json));
                    ctx.id = s.id;
                    context = JSON.stringify(ctx);
                }
                this.db.prepare("INSERT INTO turns(id,campaign_id,request_id,request_hash,input,source,base_version,resolution_status,narration_status,facts_json,narrative,error,model,created_at,epoch,context_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)").run(id, s.id, 'import:' + id, String(t.request_hash ?? ''), t.input, ['player', 'auto'].includes(t.source) ? t.source : 'player', Math.max(0, Number(t.base_version) || 0), t.resolution_status === 'pending' ? 'failed' : t.resolution_status, t.narration_status === 'done' ? 'done' : 'failed', JSON.stringify(facts), t.narrative, t.resolution_status === 'pending' ? '导入时停止尚未提交的操作' : null, String(t.model ?? 'import').slice(0, 100), String(t.created_at ?? s.createdAt).slice(0, 60), context);
            }
            let seq = 0;
            for (const e of r.events) {
                const p = JSON.parse(e.payload_json);
                validateFacts([p]);
                const tid = e.turn_id ? ids.get(e.turn_id) : null;
                if (e.turn_id && !tid)
                    throw new GameError('BAD_SAVE', '事件引用了不存在的回合。');
                this.db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?)').run(s.id, ++seq, tid ?? null, String(p.type), JSON.stringify(p), Math.max(0, Math.min(s.version, Number(e.state_version) || 0)));
            }
            for (const d of r.dice) {
                const p = JSON.parse(d.payload_json);
                if (typeof p.expr !== 'string' || !Array.isArray(p.rolls) || p.rolls.length > 20 || p.rolls.some((x) => !Number.isInteger(x) || Number(x) < 1 || Number(x) > 100) || !Number.isFinite(p.total))
                    throw new GameError('BAD_SAVE', '骰子记录不合法。');
                const tid = d.turn_id ? ids.get(d.turn_id) : null;
                if (d.turn_id && !tid)
                    throw new GameError('BAD_SAVE', '骰子引用了不存在的回合。');
                p.id = randomUUID();
                this.db.prepare('INSERT INTO dice VALUES(?,?,?,?)').run(p.id, s.id, tid ?? null, JSON.stringify(p));
            }
        });
        return s;
    }
    close() { this.db.close(); }
}
function validateFacts(raw) {
    if (!Array.isArray(raw) || raw.length > 1000 || raw.some(e => !e || typeof e.type !== 'string' || typeof e.text !== 'string' || e.text.length > 6000))
        throw new GameError('BAD_SAVE', '事实记录不合法。');
}
export function validateState(raw) {
    if (!raw || typeof raw !== 'object')
        throw new GameError('BAD_SAVE', '缺少状态。');
    const v = raw;
    if (v.schemaVersion !== 1 || v.contentVersion !== BOOK.version || typeof v.name !== 'string' || v.name.length > 100 || typeof v.playerName !== 'string' || v.playerName.length > 20)
        throw new GameError('BAD_SAVE', '状态版本或名字不合法。');
    const base = newGame(v.name, v.playerName);
    const integer = (n, lo, hi) => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
    if (!integer(v.version, 0, 10000000) || !integer(v.worldTime, 0, 1000000000) || !integer(v.gold, 0, 100000) || !integer(v.xp, 0, 100000) || !['playing', 'victory', 'defeat'].includes(v.status))
        throw new GameError('BAD_SAVE', '状态数值不合法。');
    if (!Array.isArray(v.actors) || v.actors.length !== base.actors.length || !Array.isArray(v.objects) || v.objects.length !== base.objects.length)
        throw new GameError('BAD_SAVE', '实体数量与冒险不符。');
    for (const a of base.actors) {
        const found = v.actors.filter(x => x.id === a.id);
        if (found.length !== 1)
            throw new GameError('BAD_SAVE', '角色 ID 重复或缺失。');
        const x = found[0];
        if (!integer(x.hp, 0, a.maxHp) || !integer(x.tempHp, 0, 99) || !integer(x.x, 0, WIDTH - 1) || !integer(x.y, 0, HEIGHT - 1) || TILES[x.y][x.x] !== 1)
            throw new GameError('BAD_SAVE', '角色 HP 或位置不合法。');
        a.hp = x.hp;
        a.tempHp = x.tempHp;
        a.x = x.x;
        a.y = x.y;
        a.roomId = roomAt(a);
        if (!x.inventory || !x.resources || Object.keys(x.inventory).some(k => !['potion', 'key'].includes(k)) || Object.values(x.inventory).some(n => !integer(n, 0, 100)) || Object.keys(x.resources).some(k => !['heal', 'secondWind'].includes(k)) || Object.values(x.resources).some(n => !integer(n, 0, 4)))
            throw new GameError('BAD_SAVE', '背包或能力资源不合法。');
        a.inventory = x.inventory;
        a.resources = x.resources;
        a.conditions = a.hp === 0 ? [{ id: 'downed', remainingRounds: -1 }] : [];
    }
    const occupied = new Set();
    for (const a of base.actors.filter(a => a.hp > 0)) {
        const k = `${a.x},${a.y}`;
        if (occupied.has(k))
            throw new GameError('BAD_SAVE', '角色重叠。');
        occupied.add(k);
    }
    for (const o of base.objects) {
        const matches = v.objects.filter(x => x.id === o.id);
        if (matches.length !== 1 || ['open', 'locked', 'looted'].some(k => typeof matches[0][k] !== 'boolean'))
            throw new GameError('BAD_SAVE', '场景对象不合法。');
        o.open = matches[0].open;
        o.locked = matches[0].locked;
        o.looted = matches[0].looted;
        if (o.open && o.locked)
            throw new GameError('BAD_SAVE', '门状态自相矛盾。');
    }
    if (!v.flags || Object.keys(v.flags).some(k => !Object.hasOwn(base.flags, k)) || Object.values(v.flags).some(x => typeof x !== 'boolean') || Object.keys(v.flags).length !== Object.keys(base.flags).length)
        throw new GameError('BAD_SAVE', '任务标记不合法。');
    const allowedRooms = ['entry', 'hall', 'guard', 'store', 'altar'];
    if (!Array.isArray(v.discovered) || v.discovered.some(x => !allowedRooms.includes(x)) || !v.discovered.includes('entry'))
        throw new GameError('BAD_SAVE', '探索记录不合法。');
    const allowedClaims = ['loot:supply', 'loot:store_chest', 'altar:key', 'quest:return', ...base.actors.filter(x => x.faction === 'hostile').map(x => 'defeat:' + x.id)];
    if (!Array.isArray(v.claims) || new Set(v.claims).size !== v.claims.length || v.claims.some(x => !allowedClaims.includes(x)))
        throw new GameError('BAD_SAVE', '领取记录不合法。');
    if (!Array.isArray(v.journal) || v.journal.length > 80 || v.journal.some(x => typeof x !== 'string' || x.length > 6000))
        throw new GameError('BAD_SAVE', '冒险日志不合法。');
    if (v.combat) {
        const c = v.combat;
        if (typeof c.id !== 'string' || c.id.length > 80 || !Array.isArray(c.order) || c.order.length < 2 || c.order.length > 9 || new Set(c.order).size !== c.order.length || c.order.some(id => !base.actors.some(a => a.id === id)) || !integer(c.active, 0, c.order.length - 1) || !integer(c.round, 1, 100000) || !integer(c.serial, 1, 1000000) || !integer(c.movementUsed, 0, 6) || typeof c.actionUsed !== 'boolean' || typeof c.bonusUsed !== 'boolean')
            throw new GameError('BAD_SAVE', '战斗顺序不合法。');
        base.combat = { ...c };
    }
    Object.assign(base, { version: v.version, worldTime: v.worldTime, gold: v.gold, xp: v.xp, status: v.status, flags: v.flags, claims: v.claims, discovered: [...new Set(v.discovered)], journal: v.journal, summary: typeof v.summary === 'string' ? v.summary.slice(0, 4000) : '', summaryThroughVersion: Math.min(v.version, Math.max(0, Number(v.summaryThroughVersion) || 0)), ending: typeof v.ending === 'string' ? v.ending.slice(0, 6000) : null });
    if (base.flags.returned && (!base.flags.key || !base.claims.includes('quest:return') || base.status !== 'victory'))
        throw new GameError('BAD_SAVE', '任务结算记录不一致。');
    return base;
}
