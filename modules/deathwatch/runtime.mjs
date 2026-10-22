import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';
import {DeathwatchStore} from './store.mjs';
import {DWError,need,int} from './rules.mjs';
import {MODULE_ID,RULESET,ATTRS,CHAPTERS,SPECIALTIES,SKILLS,POWERS,OATHS,SQUAD_ABILITIES,WEAPONS,COVERAGE} from './catalog.mjs';
import {activeActor,fallbackCommand,rollDraft,rerollDraftActor,draftView,updateDraftSpec} from './engine.mjs';
import {plan,narrative,references} from './ai.mjs';
export const descriptor={id:MODULE_ID,name:'死亡守望 · D100',subtitle:'战团 / 专长 / 任务部署 / 杀戮小队',rulesetId:RULESET,
 route:'/games/deathwatch/index.html',creationRoute:'/games/deathwatch/index.html',phase:'experimental',
 description:'依据用户持有的 Deathwatch 2010 规则开发。官方战斗选项与可审计结算；未自动化规则明确交给裁定助手。',
 features:['六战团与六专长','半动作 / 全动作 / 反应','Horde 与小队凝聚力','私有官方冒险导入','本地模型队友与主持人'],
 disclaimer:'非官方授权产品，也不是全部规则的自动化复刻。公共代码不含官方书籍正文或插画；Final Sanction 改编包需私人导入。'};
export function createRuntime({dataDir,getConfig}){
 let store;const db=()=>store??=new DeathwatchStore(join(dataDir,'games','deathwatch-d100.sqlite'));const busy=new Set();
 const body=async read=>{let v=await read();if(v?.transportEncoding==='gzip-base64'){need(typeof v.payload==='string'&&v.payload.length<=240000&&/^[A-Za-z0-9+/=]+$/.test(v.payload),'IMPORT_TRANSPORT','压缩导入内容无效。');try{v=JSON.parse(gunzipSync(Buffer.from(v.payload,'base64'),{maxOutputLength:8000000}).toString('utf8'));}catch{throw new DWError('IMPORT_TRANSPORT','压缩导入损坏，或解压超过 8 MB。');}}need(v&&typeof v==='object'&&!Array.isArray(v),'JSON','需要 JSON 对象。');return v;};
 const reply=(data,status=200)=>({data,status});
 return {descriptor,close(){store?.close();},async handle({method,tail,readBody}){
 try{
  const parts=tail,storage=db();
  if(!parts.length&&method==='GET')return reply({module:descriptor,catalog:{attrs:ATTRS,chapters:CHAPTERS,specialties:SPECIALTIES,skills:SKILLS,powers:POWERS,oaths:OATHS,squadAbilities:SQUAD_ABILITIES,weapons:WEAPONS,coverage:COVERAGE},missions:storage.missions(),sessions:storage.list(),provider:{mode:getConfig().mode,model:getConfig().model}});
  if(parts[0]==='creation'&&parts[1]==='roll'&&parts.length===2&&method==='POST'){
   const b=await body(readBody);need(Array.isArray(b.squad)&&b.squad.length===3,'CREATION','必须提交三名角色。');
   const draft=rollDraft(b.squad.map(x=>({id:x.id,name:x.name,chapter:x.chapter,specialty:x.specialty,chapterChoice:x.chapterChoice})),undefined);
   const id=storage.saveDraft(draft);return reply({draftId:id,draft:draftView(draft)},201);
  }
  if(parts[0]==='creation'&&parts[1]==='spec'&&parts.length===2&&method==='POST'){
   const b=await body(readBody);need(typeof b.draftId==='string','DRAFT','缺少草稿标识。');
   const draft=storage.draft(b.draftId);updateDraftSpec(draft,{id:b.actorId,name:b.name,chapter:b.chapter,specialty:b.specialty,chapterChoice:b.chapterChoice});
   storage.updateDraft(b.draftId,draft);return reply({draftId:b.draftId,draft:draftView(draft)});
  }
  if(parts[0]==='creation'&&parts[1]==='reroll'&&parts.length===2&&method==='POST'){
   const b=await body(readBody);need(typeof b.draftId==='string','DRAFT','缺少草稿标识。');
   const draft=storage.draft(b.draftId);const out=rerollDraftActor(draft,b.actorId,undefined);
   storage.updateDraft(b.draftId,draft);return reply({draftId:b.draftId,reroll:out,draft:draftView(draft)});
  }
  if(parts[0]==='creation'&&parts.length===2&&method==='GET'){const draft=storage.draft(parts[1]);return reply({draftId:parts[1],draft:draftView(draft)});}
  if(parts[0]==='missions'&&parts.length===1&&method==='POST')return reply({mission:storage.install(await body(readBody))},201);
  if(parts[0]==='references'&&parts.length===1&&method==='POST'){const b=await body(readBody);need(typeof b.query==='string'&&b.query.length<=200,'QUERY','检索词最多 200 字。');return reply(references(dataDir,b.query));}
  if(parts[0]==='sessions'&&parts.length===1){if(method==='GET')return reply({sessions:storage.list()});if(method==='POST')return reply(storage.create(await body(readBody)),201);}
  if(parts[0]==='import'&&parts.length===1&&method==='POST')return reply(storage.import(await body(readBody)),201);
  if(parts[0]==='sessions'&&parts.length>=2){const id=parts[1],op=parts[2];
   if(parts.length===2&&method==='GET')return reply(storage.snapshot(id));
   if(parts.length===3&&op==='export'&&method==='GET')return reply(storage.export(id));
   if(parts.length===3&&method==='POST'){
    const b=await body(readBody);
    if(op==='commands'){if(['manual','gm_resolve'].includes(b.command?.type))need(b.humanConfirmed===true,'HUMAN','裁定操作必须由界面明确确认。');return reply(storage.execute(id,b.requestId,b.expectedVersion,b.command));}
    if(op==='plan'){need(typeof b.input==='string'&&b.input.length>0&&b.input.length<=2000,'INPUT','输入须为 1..2000 字。');const s=storage.get(id);need(s.version===b.expectedVersion&&!s.pending,'VERSION_CONFLICT','状态已变化或有待定裁定。',409);const actorId=b.actorId??'pc';need(s.actors.some(a=>a.id===actorId&&a.side==='party'),'CONTROL','只能为小队提出动作。');const p=await plan(getConfig(),s,b.input,actorId,false);return reply({proposal:p,baseVersion:s.version});}
    if(op==='advance'){
     need(!busy.has(id),'BUSY','自动回合正在处理。',409);const s=storage.get(id),a=activeActor(s);need(s.combat&&!s.pending&&a&&a.controller!=='player'&&!(a.side==='party'&&s.manualAllies),'AUTO','当前需要玩家操作。',409);need(s.version===b.expectedVersion,'VERSION_CONFLICT','状态已更新。',409);
     busy.add(id);try{let c=fallbackCommand(s),from='规则策略',line='';if(a.controller==='ai'&&getConfig().mode==='openai')try{const p=await plan(getConfig(),s,'',a.id,true);c=p.command;from=p.source;line=p.line;}catch(e){from='模型未给出合法动作，使用规则策略';}
      if(!c)c={type:'end_turn',actorId:a.id};let result;
      try{result=storage.execute(id,`auto:${s.version}:${a.id}`,s.version,c,{source:'auto',annotation:`${a.name}：${from}${line?'；'+line:''}`});}
      catch(e){if(e.code==='VERSION_CONFLICT')throw e;result=storage.execute(id,`fallback:${s.version}:${a.id}`,s.version,{type:'end_turn',actorId:a.id},{source:'auto',annotation:'自动动作不合法，明确结束本回合；未伪造攻击结果。'});}return reply(result);
     }finally{busy.delete(id);}
    }
    if(op==='narrate'){
     const s=storage.get(id);need(s.version===b.expectedVersion,'VERSION_CONFLICT','状态已变化，请刷新。',409);need(b.question===undefined||typeof b.question==='string'&&b.question.length<=1500,'QUESTION','问题过长。');
     const attempt=storage.beginNarration(id,s.version);try{const refs=b.ruleQuestion?references(dataDir,b.question??'').hits:[];const out=await narrative(getConfig(),s,b.question??'',refs);storage.finishNarration(id,s.version,attempt,out.text,out.source);return reply({...out,version:s.version,attempt,refs});}
     catch(e){const text=s.lastEvents.map(e=>e.text).join('\n')||s.mission.briefing;storage.finishNarration(id,s.version,attempt,text,'facts','failed');return reply({text,source:'facts',version:s.version,attempt,error:e.message});}
    }
   }
  }
  return reply({error:{code:'NOT_FOUND',message:'没有这个 Deathwatch 接口。'}},404);
 }catch(e){if(!(e instanceof DWError))console.error('[deathwatch]',e);return reply({error:{code:e.code??'INTERNAL',message:e instanceof DWError?e.message:'模块错误；已提交状态保留。'}},e.status??500);}
 }};
}
