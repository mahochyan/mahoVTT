import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {newSession,resolveAction,publicState,GameFault,type GameState,type GameEvent,type Archetype} from './engine.ts';
import type {RNG} from './rules.ts';

const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export class WrathStore {
  private db:DatabaseSync;
  constructor(path:string){
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, version INTEGER NOT NULL, title TEXT NOT NULL,
        state_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS commands(session_id TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,
        result_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(session_id,request_id),
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS events(session_id TEXT NOT NULL,seq INTEGER NOT NULL,payload_json TEXT NOT NULL,
        PRIMARY KEY(session_id,seq),FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE);`);
  }
  close(){this.db.close();}
  create(name:string,klass:Archetype){
    const s=newSession(name,klass),now=new Date().toISOString();
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run(s.id,0,s.title,JSON.stringify(s),now,now);
    return publicState(s);
  }
  list(){return (this.db.prepare('SELECT id,title,version,state_json,updated_at FROM sessions ORDER BY updated_at DESC').all() as any[])
    .map(r=>{const s=JSON.parse(String(r.state_json)) as GameState;return {id:r.id,title:r.title,version:r.version,status:s.status,round:s.round,updatedAt:r.updated_at,gameId:s.gameId};});}
  get(id:string):GameState{
    if(!/^[a-f0-9-]{36}$/.test(id))throw new GameFault('BAD_ID','存档 ID 不合法。',400);
    const row=this.db.prepare('SELECT state_json FROM sessions WHERE id=?').get(id) as {state_json:string}|undefined;
    if(!row)throw new GameFault('NOT_FOUND','该游戏存档不存在。',404);
    const state=JSON.parse(row.state_json) as GameState;
    if(state.gameId!=='wrath-d6-experiment')throw new GameFault('INVALID_SAVE','存档游戏类型不匹配。',409);
    return state;
  }
  snapshot(id:string){return publicState(this.get(id));}
  events(id:string){this.get(id);return (this.db.prepare('SELECT seq,payload_json FROM events WHERE session_id=? ORDER BY seq DESC LIMIT 100').all(id) as any[])
    .reverse().map(row=>({seq:row.seq,...JSON.parse(String(row.payload_json))}));}
  /** One transaction = state change + rolls/events + idempotent reply. */
  execute(id:string,requestId:string,expectedVersion:number,command:unknown,rng?:RNG){
    if(typeof requestId!=='string'||requestId.length<8||requestId.length>100||!/^[a-zA-Z0-9:_-]+$/.test(requestId))throw new GameFault('BAD_REQUEST','需要唯一请求 ID。');
    if(!Number.isInteger(expectedVersion)||expectedVersion<0)throw new GameFault('BAD_VERSION','状态版本不合法。');
    const fingerprint=hash({expectedVersion,command});
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const old=this.db.prepare('SELECT request_hash,result_json FROM commands WHERE session_id=? AND request_id=?')
        .get(id,requestId) as {request_hash:string;result_json:string}|undefined;
      if(old){if(old.request_hash!==fingerprint)throw new GameFault('REQUEST_CONFLICT','相同请求 ID 对应不同内容。',409);
        this.db.exec('COMMIT');return {...JSON.parse(old.result_json),replayed:true};}
      const state=this.get(id);
      if(state.version!==expectedVersion)throw new GameFault('VERSION_CONFLICT',`当前版本 ${state.version}，请刷新后再操作。`,409);
      const resolved=resolveAction(state,command,rng);
      const updated=this.db.prepare('UPDATE sessions SET state_json=?,version=?,updated_at=? WHERE id=? AND version=?')
        .run(JSON.stringify(resolved.state),resolved.state.version,new Date().toISOString(),id,expectedVersion);
      if(updated.changes!==1)throw new GameFault('VERSION_CONFLICT','存档已被其他动作修改。',409);
      const seqRow=this.db.prepare('SELECT COALESCE(MAX(seq),0) AS seq FROM events WHERE session_id=?').get(id) as {seq:number};
      let seq=seqRow.seq;
      for(const ev of resolved.events){seq++;this.db.prepare('INSERT INTO events VALUES(?,?,?)').run(id,seq,JSON.stringify(ev));}
      const reply={state:publicState(resolved.state),events:resolved.events,eventSeq:seq,stateVersion:resolved.state.version};
      this.db.prepare('INSERT INTO commands VALUES(?,?,?,?,?)')
        .run(id,requestId,fingerprint,JSON.stringify(reply),new Date().toISOString());
      this.db.exec('COMMIT');return reply;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  export(id:string){return {format:'mahovtt-game-save',formatVersion:1,gameId:'wrath-d6-experiment',state:this.snapshot(id),events:this.events(id)};}
}
