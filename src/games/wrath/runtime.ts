import {join} from 'node:path';
import type {GameRuntime,GameRequest,GameReply} from '../contracts.ts';
import {WrathStore} from './store.ts';
import {ARCHETYPES,GameFault, type Archetype} from './engine.ts';
import {MODULE_DESCRIPTION,MODULE_ID,MODULE_NAME,WORLD} from './scenario.ts';
import {DATA_DIR,ConfigStore} from '../../ai/config.ts';
import {narrate} from './ai.ts';

let store:WrathStore|undefined;
function storage(){return store??=new WrathStore(join(DATA_DIR,'games',MODULE_ID+'.sqlite'));}
function reply(data:unknown,status=200):GameReply{return {data,status};}
function validBody(v:unknown){if(!v||typeof v!=='object'||Array.isArray(v))throw new GameFault('BAD_JSON','请求必须为 JSON 对象。');return v as Record<string,unknown>;}
const descriptor={
  id:MODULE_ID,name:MODULE_NAME,subtitle:'D6 骰池 · 科幻调查战斗',rulesetId:'wrath-d6-experiment-1',
  route:'/games/wrath-d6-experiment',creationRoute:'/games/wrath-d6-experiment',phase:'experimental' as const,
  description:MODULE_DESCRIPTION,features:['独立 D6 骰池与特殊 Wrath Die','小队自动战术','原创战斗任务','独立 SQLite 存档','可接本地 AI 叙事'],
  disclaimer:'非 Cubicle 7 / Games Workshop 授权产品；只实现公开基本骰法与原创简化战斗，不是完整 Wrath & Glory 规则。',
};
export const wrathRuntime:GameRuntime={
  descriptor,
  async handle({method,tail,readBody}:GameRequest){
    try{
      const db=storage();
      if(tail.length===0&&method==='GET')return reply({module:descriptor,world:{public:WORLD.public},archetypes:ARCHETYPES});
      if(tail.length===1&&tail[0]==='sessions'&&method==='GET')return reply({sessions:db.list()});
      if(tail.length===1&&tail[0]==='sessions'&&method==='POST'){
        const b=validBody(await readBody());
        if(typeof b.name!=='string'||typeof b.classId!=='string'||!ARCHETYPES.some(c=>c.id===b.classId))throw new GameFault('BAD_CHARACTER','请选择有效的姓名和职业。');
        return reply({state:db.create(b.name,b.classId as Archetype)},201);
      }
      if(tail.length>=2&&tail[0]==='sessions'){
        const id=tail[1];
        if(tail.length===2&&method==='GET')return reply({state:db.snapshot(id),events:db.events(id),module:descriptor});
        if(tail[2]==='commands'&&tail.length===3&&method==='POST'){
          const b=validBody(await readBody());
          return reply(db.execute(id,String(b.requestId??''),Number(b.expectedVersion),b.command));
        }
        if(tail[2]==='export'&&tail.length===3&&method==='GET')return reply(db.export(id));
        if(tail[2]==='narrate'&&tail.length===3&&method==='POST'){
          const b=validBody(await readBody());const s=db.get(id);
          if(b.expectedVersion!==s.version)throw new GameFault('VERSION_CONFLICT','请读取最新游戏状态。',409);
          const answer=await narrate(new ConfigStore().config,s,s.lastEvents,typeof b.question==='string'?b.question:'');
          return reply({...answer,stateVersion:s.version});
        }
      }
      return reply({error:{code:'NOT_FOUND',message:'游戏模块接口不存在。'}},404);
    }catch(e){const f=e instanceof GameFault?e:new GameFault('INTERNAL','游戏模块执行失败，请检查服务日志。',500);
      return reply({error:{code:f.code,message:f.message}},f.status);}
  },
};
