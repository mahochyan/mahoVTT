import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DWError,need,int,stable,clone} from './rules.mjs';
import {MODULE_ID,RULESET,ATTRS,WEAPONS,CHAPTERS,SPECIALTIES} from './catalog.mjs';
import {BUILTIN,validateMission,missionSummary,validateWeapon} from './content.mjs';
import {newSession,resolve,observation} from './engine.mjs';
const hash=v=>createHash('sha256').update(stable(v)).digest('hex');
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
/** Import only quiescent checkpoints; serialized pending continuations are never trusted. */
export function validateSave(raw){
 need(raw&&raw.format==='mahovtt-deathwatch-save'&&raw.formatVersion===1,'SAVE','不是支持的 Deathwatch 存档。');
 need(JSON.stringify(raw).length<=8000000,'SAVE','存档过大。');
 need(raw.checksum===hash(raw.state),'SAVE_CHECKSUM','存档校验不一致。');
 const s=clone(raw.state);need(s&&s.schemaVersion===1&&s.gameId===MODULE_ID&&s.rulesetId===RULESET,'SAVE_RULESET','规则版本不匹配。');
 s.mission=validateMission(s.mission);need(s.mission.scenes.some(x=>x.id===s.sceneId),'SAVE','当前场景不存在。');
 need(!s.pending&&(!s.attackQueue||s.attackQueue.length===0),'SAVE_PENDING','导入前先在原游戏中完成待定骰子、反应和裁定；原地重启不受此限制。');
 need(['briefing','exploration','combat','victory','defeat'].includes(s.phase)&&['core','revised'].includes(s.weaponProfile),'SAVE','游戏阶段无效。');
 need(int(s.version,0,100000000)&&int(s.worldTime,0,1000000000)&&Array.isArray(s.actors)&&s.actors.length<=30,'SAVE','存档数值无效。');
 const map=s.mission.scenes.find(x=>x.id===s.sceneId).map;
 for(const a of s.actors){
  need(typeof a.id==='string'&&a.id.length<=80&&typeof a.name==='string'&&a.name.length<=100,'SAVE','角色身份无效。');
  need(['party','enemy'].includes(a.side)&&['player','ai','engine'].includes(a.controller)&&['active','dead','unconscious','fled'].includes(a.status),'SAVE','角色状态无效。');
  need(a.stats&&Object.keys(ATTRS).every(k=>int(a.stats[k],0,150)),'SAVE','角色属性无效。');
  need(int(a.x,0,map[0].length-1)&&int(a.y,0,map.length-1)&&int(a.maxWounds,1,500)&&int(a.damage,0,a.maxWounds)&&int(a.critical,0,100),'SAVE','位置或伤势无效。');
  for(const k of ['fate','maxFate','fatigue','stunned','ap','reactions'])need(int(a[k],0,100),'SAVE','资源数值无效。');
  need(['solo','squad'].includes(a.mode)&&a.armour&&Object.values(a.armour).every(v=>int(v,0,60)),'SAVE','防护配置无效。');
  if(a.weaponOverrides)for(const w of Object.values(a.weaponOverrides))validateWeapon(w);
  need(a.inventory&&Object.entries(a.inventory).every(([k,v])=>(Object.hasOwn(WEAPONS,k)||a.weaponOverrides?.[k])&&v&&int(v.clip,0,10000)&&int(v.reserve,0,100000)&&typeof v.jammed==='boolean'),'SAVE','装备配置无效。');
  need((Object.hasOwn(WEAPONS,a.readied)||a.weaponOverrides?.[a.readied])&&a.inventory[a.readied],'SAVE','当前武器无效。');
  if(a.side==='party')need(CHAPTERS.some(c=>c.id===a.chapter)&&SPECIALTIES.some(c=>c.id===a.specialty)&&int(a.xpAvailable,0,1000000)&&int(a.xpSpent,0,1000000),'SAVE','角色职业或经验无效。');
 }
 need(new Set(s.actors.map(a=>a.id)).size===s.actors.length&&s.actors.filter(a=>a.id==='pc'&&a.controller==='player').length===1&&s.actors.filter(a=>a.side==='party').length===3,'SAVE','队伍结构无效。');
 need(s.flags&&Object.values(s.flags).every(v=>typeof v==='boolean')&&Array.isArray(s.claims)&&s.claims.every(v=>typeof v==='string'),'SAVE','任务标记无效。');
 need(Array.isArray(s.visited)&&s.visited.every(id=>s.mission.scenes.some(p=>p.id===id))&&Array.isArray(s.journal)&&s.journal.length<=200,'SAVE','战役记录无效。');
 if(s.combat)need(Array.isArray(s.combat.order)&&s.combat.order.every(id=>s.actors.some(a=>a.id===id))&&int(s.combat.active,0,s.combat.order.length-1)&&int(s.combat.round,1,100000)&&int(s.combat.serial,1,10000000),'SAVE','先攻状态无效。');
 need(typeof s.sceneStates==='object'&&s.sceneStates&&!Array.isArray(s.sceneStates),'SAVE','场景快照无效。');
 for(const [id,data] of Object.entries(s.sceneStates)){need(s.mission.scenes.some(p=>p.id===id)&&Array.isArray(data.enemies)&&data.enemies.length<=20,'SAVE','场景快照无效。');for(const e of data.enemies)need(e.side==='enemy'&&['active','dead','unconscious','fled'].includes(e.status)&&(Object.hasOwn(WEAPONS,e.readied)||e.weaponOverrides?.[e.readied])&&e.stats&&Object.keys(ATTRS).every(k=>int(e.stats[k],0,150))&&int(e.damage,0,500),'SAVE','敌人快照无效。');}
 s.id=randomUUID();s.version=0;s.createdAt=new Date().toISOString();s.lastEvents=[];s.attackQueue=[];return s;
}
export class DeathwatchStore{
 constructor(file){if(file!==':memory:')mkdirSync(dirname(file),{recursive:true});this.db=new DatabaseSync(file);this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS dw_missions(id TEXT NOT NULL,version TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(id,version));
 CREATE TABLE IF NOT EXISTS dw_sessions(id TEXT PRIMARY KEY,version INTEGER NOT NULL,state TEXT NOT NULL,updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS dw_commands(session_id TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(session_id,request_id),FOREIGN KEY(session_id) REFERENCES dw_sessions(id));
 CREATE TABLE IF NOT EXISTS dw_events(session_id TEXT NOT NULL,seq INTEGER NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(session_id,seq),FOREIGN KEY(session_id) REFERENCES dw_sessions(id));
 CREATE TABLE IF NOT EXISTS dw_narratives(session_id TEXT NOT NULL,version INTEGER NOT NULL,attempt INTEGER NOT NULL,text TEXT NOT NULL,status TEXT NOT NULL,source TEXT NOT NULL,PRIMARY KEY(session_id,version),FOREIGN KEY(session_id) REFERENCES dw_sessions(id));`);}
 close(){this.db.close();}
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const out=fn();this.db.exec('COMMIT');return out;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 missions(){return [missionSummary(BUILTIN),...this.db.prepare('SELECT payload FROM dw_missions ORDER BY id,version').all().map(r=>missionSummary(JSON.parse(r.payload)))];}
 install(raw){const m=validateMission(raw);need(m.id!==BUILTIN.id,'PACK','不能覆盖内置内容包。');const old=this.db.prepare('SELECT payload FROM dw_missions WHERE id=? AND version=?').get(m.id,m.version);if(old)need(hash(JSON.parse(old.payload))===hash(m),'PACK_CONFLICT','相同 ID/版本内容不同，请增加版本号。',409);else this.db.prepare('INSERT INTO dw_missions VALUES(?,?,?)').run(m.id,m.version,JSON.stringify(m));return missionSummary(m);}
 mission(id=BUILTIN.id,version){if(id===BUILTIN.id)return clone(BUILTIN);const row=version?this.db.prepare('SELECT payload FROM dw_missions WHERE id=? AND version=?').get(id,version):this.db.prepare('SELECT payload FROM dw_missions WHERE id=? ORDER BY rowid DESC LIMIT 1').get(id);need(row,'PACK_NOT_FOUND','请先导入对应私有副本包。',404);return JSON.parse(row.payload);}
 create(options,random){const s=newSession(options,this.mission(options.missionId,options.missionVersion),random);this.insert(s);return this.snapshot(s.id);}
 insert(s){this.tx(()=>{this.db.prepare('INSERT INTO dw_sessions VALUES(?,?,?,?)').run(s.id,s.version,JSON.stringify(s),new Date().toISOString());let seq=0;for(const ev of s.lastEvents)this.db.prepare('INSERT INTO dw_events VALUES(?,?,?,?)').run(s.id,++seq,s.version,JSON.stringify(ev));});}
 list(){return this.db.prepare('SELECT id,version,state,updated FROM dw_sessions ORDER BY updated DESC').all().map(r=>{const s=JSON.parse(r.state);return {id:r.id,title:s.title,version:r.version,phase:s.phase,mission:s.mission.title,updatedAt:r.updated,sceneId:s.sceneId};});}
 get(id){need(uuid(id),'SESSION','存档标识无效。');const r=this.db.prepare('SELECT state FROM dw_sessions WHERE id=?').get(id);need(r,'NOT_FOUND','未找到此存档。',404);return JSON.parse(r.state);}
 events(id){this.get(id);return this.db.prepare('SELECT seq,version,payload FROM dw_events WHERE session_id=? ORDER BY seq DESC LIMIT 120').all(id).reverse().map(r=>({seq:r.seq,version:r.version,...JSON.parse(r.payload)}));}
 snapshot(id){const s=this.get(id);return {state:observation(s),events:this.events(id),narrative:this.db.prepare('SELECT version,text,status,source FROM dw_narratives WHERE session_id=? ORDER BY version DESC LIMIT 1').get(id)??null};}
 execute(id,requestId,expectedVersion,command,{source='player',random,annotation}={}){
  need(typeof requestId==='string'&&/^[a-zA-Z0-9:_-]{8,180}$/.test(requestId),'REQUEST','需要有效的唯一请求 ID。');need(int(expectedVersion,0,100000000),'VERSION','状态版本无效。');
  const fingerprint=hash({expectedVersion,command,source});return this.tx(()=>{
   const prior=this.db.prepare('SELECT request_hash,response FROM dw_commands WHERE session_id=? AND request_id=?').get(id,requestId);
   if(prior){need(prior.request_hash===fingerprint,'REQUEST_CONFLICT','同一请求 ID 不能用于不同动作。',409);return {...JSON.parse(prior.response),replayed:true};}
   const old=this.get(id);need(old.version===expectedVersion,'VERSION_CONFLICT',`当前版本 ${old.version}，请刷新后重新决定。`,409);
   const result=resolve(old,command,source,random);if(annotation)result.events.unshift({id:randomUUID(),type:'decision_source',text:annotation.slice(0,500)});
   const update=this.db.prepare('UPDATE dw_sessions SET version=?,state=?,updated=? WHERE id=? AND version=?').run(result.state.version,JSON.stringify(result.state),new Date().toISOString(),id,expectedVersion);need(update.changes===1,'VERSION_CONFLICT','状态已变化。',409);
   let seq=this.db.prepare('SELECT COALESCE(MAX(seq),0) AS seq FROM dw_events WHERE session_id=?').get(id).seq;
   for(const ev of result.events)this.db.prepare('INSERT INTO dw_events VALUES(?,?,?,?)').run(id,++seq,result.state.version,JSON.stringify(ev));
   const response={state:observation(result.state),events:result.events,eventSeq:seq,stateVersion:result.state.version};
   this.db.prepare('INSERT INTO dw_commands VALUES(?,?,?,?)').run(id,requestId,fingerprint,JSON.stringify(response));return response;
  });
 }
 beginNarration(id,version){this.get(id);return this.tx(()=>{const r=this.db.prepare('SELECT attempt FROM dw_narratives WHERE session_id=? AND version=?').get(id,version),attempt=(r?.attempt??0)+1;this.db.prepare('INSERT INTO dw_narratives VALUES(?,?,?,?,?,?) ON CONFLICT(session_id,version) DO UPDATE SET attempt=excluded.attempt,status=excluded.status').run(id,version,attempt,'','running','model');return attempt;});}
 finishNarration(id,version,attempt,text,source,status='done'){return this.db.prepare('UPDATE dw_narratives SET text=?,source=?,status=? WHERE session_id=? AND version=? AND attempt=?').run(text.slice(0,12000),source,status,id,version,attempt).changes===1;}
 export(id){return this.tx(()=>{const state=this.get(id);return {format:'mahovtt-deathwatch-save',formatVersion:1,checksum:hash(state),state,events:this.events(id),privateContent:true,exportedAt:new Date().toISOString()};});}
 import(raw){const s=validateSave(raw);s.lastEvents=[{id:randomUUID(),type:'imported',text:'从校验过的快照创建新副本；不覆盖原战役。'}];this.insert(s);return this.snapshot(s.id);}
}
