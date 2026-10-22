import test from 'node:test';
import assert from 'node:assert/strict';
import {rollPool,fixedRng} from '../dist/games/wrath/rules.js';
import {newSession,resolveAction,safeCell,publicState,GameFault,route} from '../dist/games/wrath/engine.js';
import {WrathStore} from '../dist/games/wrath/store.js';
import {gameRequest,listGames} from '../dist/games/hub.js';

const requestBody=body=>async()=>body;
test('一级目录保留传统 d20、隔离新 D6 模块',async()=>{
  const ids=listGames().map(g=>g.id); assert.deepEqual(ids,['graylight-d20','wrath-d6-experiment']);
  const response=await gameRequest('/api/games','GET',requestBody({}));
  assert.equal(response.status,200);assert.equal(response.data.games.length,2);
  const module=(await gameRequest('/api/games/wrath-d6-experiment','GET',requestBody({}))).data;
  assert.equal(module.module.rulesetId,'wrath-d6-experiment-1');
  assert.ok(!('gm' in module.world),'主持人秘密不应返回给前端');
});
test('D6 icons：4/5=1，6=2；第一个骰子为 Wrath Die',()=>{
  const r=rollPool(5,5,fixedRng([6,5,4,2,6]));assert.equal(r.icons,6);assert.equal(r.exalted,2);
  assert.equal(r.success,true);assert.equal(r.wrathCritical,true);assert.equal(r.wrathDie,6);
  const x=rollPool(2,3,fixedRng([1,6]));assert.equal(x.success,false);assert.equal(x.complication,true);
});
test('非法指令不能更改伤害、距离或未授权对象',()=>{
  const s=newSession('岚','scout');
  assert.throws(()=>resolveAction(s,{type:'attack',targetId:'raider-1',damage:999}),GameFault);
  assert.throws(()=>resolveAction(s,{type:'move',x:100,y:2}),GameFault);
  assert.throws(()=>resolveAction(s,{type:'attack',targetId:'ally-medic'}),GameFault);
  assert.equal(s.version,0);assert.equal(s.actors.find(a=>a.id==='raider-1').wounds,0);
});
test('距离、墙体、角色占格受到规则校验',()=>{
  const s=newSession('岚','scout');
  assert.equal(safeCell(0,0),false);assert.equal(safeCell(5,2),true);
  assert.equal(route(s,s.actors[0],{x:3,y:2}),null); // team occupant
  assert.throws(()=>resolveAction(s,{type:'move',x:9,y:2}),GameFault);
});
test('对局版本、请求幂等、独立 WAL 存档、事件审计',()=>{
  const db=new WrathStore(':memory:');
  const s=db.create('旅人','adept');assert.equal(s.version,0);
  const once=db.execute(s.id,'req-001-a',0,{type:'end_turn'},fixedRng([3,4,2,2,5,6]));
  assert.equal(once.state.version,1);assert.ok(once.events.length);
  const twice=db.execute(s.id,'req-001-a',0,{type:'end_turn'},fixedRng([6]));
  assert.equal(twice.replayed,true);assert.equal(twice.state.version,1);
  assert.equal(db.get(s.id).version,1);assert.ok(db.events(s.id).length>0);
  assert.throws(()=>db.execute(s.id,'req-001-a',0,{type:'move',x:4,y:2}),/相同请求/);
  assert.throws(()=>db.execute(s.id,'req-002-b',0,{type:'end_turn'}),/当前版本/);
  assert.equal(db.export(s.id).gameId,'wrath-d6-experiment');db.close();
});
test('新模块 API：开团→行动→回放→导出',async()=>{
  const path='/api/games/wrath-d6-experiment';
  const start=await gameRequest(path+'/sessions','POST',requestBody({name:'旷野',classId:'scout'}));
  assert.equal(start.status,201);const id=start.data.state.id;
  const cmd=await gameRequest(path+`/sessions/${id}/commands`,'POST',requestBody({requestId:'test-end-0001',expectedVersion:0,command:{type:'end_turn'}}));
  assert.equal(cmd.status,200);assert.equal(cmd.data.state.version,1);
  const replay=await gameRequest(path+`/sessions/${id}/commands`,'POST',requestBody({requestId:'test-end-0001',expectedVersion:0,command:{type:'end_turn'}}));
  assert.equal(replay.data.replayed,true);
  assert.equal((await gameRequest(path+`/sessions/${id}`,'GET',requestBody({}))).data.state.version,1);
  assert.equal((await gameRequest(path+`/sessions/${id}/export`,'GET',requestBody({}))).data.formatVersion,1);
});
