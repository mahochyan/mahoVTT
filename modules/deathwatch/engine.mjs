/** Deathwatch D100 rules runtime.
 *
 * Independent implementation for mahoVTT. Source basis: Deathwatch Core Rulebook
 * (2010) and the Living Errata 1.1 clauses recorded in docs/deathwatch/RULES.md.
 * No Foundry code or commercial prose is bundled.
 *
 * Declared implementation conventions (not official rules) are collected in
 * CONVENTIONS below and repeated in RULES.md:
 *  - grid is 1 metre per cell; adjacency and movement use Chebyshev distance;
 *  - ammunition reserve starts at one spare clip;
 *  - a mission requisition budget stands in for the Renown purchase ladder;
 *  - Fate is an explicit action (bonus / heal / reroll-after-failure), not a
 *    pre-roll interrupt node.
 */
import {randomUUID} from 'node:crypto';
import {
  DWError,need,int,clamp,bonus,die,dice,test,hitLocation,hitLocations,burstHits,
  strengthBonus,toughnessBonus,damageRoll,soak,applyInjury,rangeModifier,cellDistance,
  openCell,lineOfSight,pathfind,
} from './rules.mjs';
import {
  MODULE_ID,RULESET,CHAPTERS,SPECIALTIES,SKILLS,OATHS,SQUAD_ABILITIES,WEAPONS,
  weaponProfile,advanceCost,
} from './catalog.mjs';

export const CONVENTIONS = [
  '地图为 1 米/格；移动与射程按格数换算，邻接用切比雪夫距离。',
  '备用弹药按一个弹匣计（规则书未规定起始携带量）。',
  '任务征用预算代替声望购买阶梯，属副本适配约定。',
  'Fate 作为显式动作使用（加值/治疗/失败后重掷），不是掷骰前的可恢复节点。',
];

const ATTR_KEYS=['ws','bs','s','t','ag','int','per','wp','fel'];
const ARMOUR={head:8,body:10,leftArm:8,rightArm:8,leftLeg:8,rightLeg:8};
const SKILL_STAT=Object.fromEntries(Object.entries(SKILLS).map(([k,v])=>[k,v.stat]));
const CHAPTER=id=>CHAPTERS.find(c=>c.id===id);
const SPEC=id=>SPECIALTIES.find(s=>s.id===id);
const OATH=id=>OATHS.find(o=>o.id===id);
const POWER=(id)=>['smite','telepathy','inspire','augury','reading','avenger','iron-arm'].includes(id);

const fail=(code,message,status=400)=>new DWError(code,message,status);

function actorById(state,id){
  const a=state.actors.find(x=>x.id===id);
  need(a,'ACTOR','角色不存在。',404);
  return a;
}
function requireActive(state,actorId){
  const active=activeActor(state);
  need(active,'TURN','当前没有行动角色。',409);
  need(active.id===actorId,`NOT_YOUR_TURN`,`现在是 ${active.name} 的行动。`,409);
  need(active.status==='active','INCAPACITATED','该角色无法行动。',409);
  return active;
}
function spend(a,cost){
  need(a.status==='active','INCAPACITATED','该角色无法行动。',409);
  need(a.ap>=cost,'NO_ACTIONS',`剩余动作不足：需要 ${cost} 点，现有 ${a.ap} 点。`,409);
  a.ap-=cost;
}
const cellKey=(x,y)=>`${x},${y}`;

/** Characteristics: 2d10+30, one re-roll allowed by the Core rules (p.26). */
export function rollCharacteristics(random){
  const attrs={};
  for(const k of ATTR_KEYS)attrs[k]=dice(2,10,random).reduce((n,v)=>n+v,0)+30;
  return attrs;
}
/** Re-roll exactly one characteristic, replacing the lowest by default. */
export function rerollCharacteristic(attrs,key,random){
  need(ATTR_KEYS.includes(key),'ATTR','未知属性。');
  need(!attrs.__rerolled,'REROLL','每名角色只能重掷一次属性。');
  const next=rollCharacteristics(random)[key];
  const out={...attrs,[key]:next};
  out.__rerolled=true;
  return out;
}
/** Draft creation: characteristics are rolled by the server and persisted, so a
 * page refresh never re-rolls and the single allowed re-roll is tracked per actor. */
export function rollDraft(specs,random){
  need(Array.isArray(specs)&&specs.length===3,'CREATION','必须创建 1 名主角与 2 名战斗兄弟。');
  const ids=specs.map(x=>x.id);
  need(new Set(ids).size===3&&['pc','ally-1','ally-2'].every(id=>ids.includes(id)),'CREATION','队伍标识必须为 pc/ally-1/ally-2。');
  const squad=specs.map(spec=>{
    const ch=CHAPTER(spec.chapter);need(ch,'CHAPTER','未知战团。');
    const sp=SPEC(spec.specialty);need(sp,'SPECIALTY','未知专长。');
    need(!(ch.ban??[]).includes(spec.specialty),'CHAPTER_BAN',`${ch.name}不能选择${sp.name}。`);
    const choice=spec.chapterChoice;
    if(ch.choice)need(Array.isArray(choice)&&choice.length===2&&choice[0]!==choice[1]&&choice.every(k=>ATTR_KEYS.includes(k)),'CHAPTER_CHOICE','极限战士需要选择两项不同属性各 +5。');
    return {id:spec.id,name:String(spec.name??'').trim().slice(0,24),chapter:spec.chapter,specialty:spec.specialty,
      chapterChoice:ch.choice?[...choice]:undefined,attributes:rollCharacteristics(random),rerolled:false,rerolledAttr:null};
  });
  return {schemaVersion:1,squad,createdAt:new Date().toISOString()};
}
/** Change Chapter/Specialty on a draft without touching the rolled characteristics. */
export function updateDraftSpec(draft,spec){
  const a=draft.squad.find(x=>x.id===spec.id);
  need(a,'ACTOR','草稿中没有这名角色。',404);
  const ch=CHAPTER(spec.chapter);need(ch,'CHAPTER','未知战团。');
  const sp=SPEC(spec.specialty);need(sp,'SPECIALTY','未知专长。');
  need(!(ch.ban??[]).includes(spec.specialty),'CHAPTER_BAN',`${ch.name}不能选择${sp.name}。`);
  if(ch.choice)need(Array.isArray(spec.chapterChoice)&&spec.chapterChoice.length===2&&spec.chapterChoice[0]!==spec.chapterChoice[1]&&spec.chapterChoice.every(k=>ATTR_KEYS.includes(k)),'CHAPTER_CHOICE','极限战士需要选择两项不同属性各 +5。');
  a.chapter=spec.chapter;a.specialty=spec.specialty;a.chapterChoice=ch.choice?[...spec.chapterChoice]:undefined;
  if(typeof spec.name==='string')a.name=spec.name.trim().slice(0,24);
  return a;
}
export function rerollDraftActor(draft,actorId,random){
  const a=draft.squad.find(x=>x.id===actorId);
  need(a,'ACTOR','草稿中没有这名角色。',404);
  need(!a.rerolled,'REROLL','每名角色只能重掷一次属性。',409);
  // Core p.26: one re-roll, applied to the lowest characteristic by default.
  const lowest=ATTR_KEYS.reduce((m,k)=>a.attributes[k]<a.attributes[m]?k:m,ATTR_KEYS[0]);
  a.attributes[lowest]=rollCharacteristics(random)[lowest];
  a.rerolled=true;a.rerolledAttr=lowest;
  return {actorId,attr:lowest,value:a.attributes[lowest],rerolled:true};
}
export function draftView(draft){
  return {schemaVersion:draft.schemaVersion,createdAt:draft.createdAt,squad:draft.squad.map(a=>{
    const ch=CHAPTER(a.chapter);
    const final=chapterMods({...a,stats:a.attributes});
    return {id:a.id,name:a.name,chapter:a.chapter,specialty:a.specialty,chapterChoice:a.chapterChoice??null,
      attributes:a.attributes,final,rerolled:a.rerolled,rerolledAttr:a.rerolledAttr,
      chapterName:ch.name,specialtyName:SPEC(a.specialty).name,woundsBonus:ch.wounds??0};
  })};
}
export function fateFromRoll(n){
  need(int(n,1,10),'FATE','命运骰无效。');
  return n===10?5:n>=8?4:3;
}
export function startingWounds(roll,chapterId){
  const bonusWounds=CHAPTER(chapterId)?.wounds??0;
  return 18+roll+bonusWounds;
}
export function movementRates(a){
  const ab=bonus(a.stats.ag)+(a.powerArmour?1:0);
  return {half:Math.max(1,ab),full:Math.max(1,ab)*2,charge:Math.max(1,ab)*3,run:Math.max(1,ab)*6};
}
function chapterMods(a){
  const ch=CHAPTER(a.chapter);
  need(ch,'CHAPTER','未知战团。');
  const out={...a.stats};
  if(ch.mods)for(const [k,v]of Object.entries(ch.mods))out[k]=clamp(out[k]+v,0,99);
  if(ch.choice){ /* Ultramarines: +5 to two different chosen attributes */
    const picks=Array.isArray(a.chapterChoice)?a.chapterChoice:[];
    need(picks.length===2&&picks[0]!==picks[1]&&picks.every(p=>ATTR_KEYS.includes(p)),'CHAPTER_CHOICE','极限战士需要选择两项不同属性各 +5。');
    for(const p of picks)out[p]=clamp(out[p]+5,0,99);
  }
  return out;
}
function buildActor(spec,{id,side='party',controller='ai'},random){
  const s=SPEC(spec.specialty);
  need(s,'SPECIALTY','未知专长。');
  const ch=CHAPTER(spec.chapter);
  need(ch,'CHAPTER','未知战团。');
  need(!(ch.ban??[]).includes(spec.specialty),'CHAPTER_BAN',`${ch.name}不能选择${s.name}。`);
  const raw=spec.attributes?validateAttributes(spec.attributes):rollCharacteristics(random);
  const stats=chapterMods({...spec,stats:raw});
  const a={
    id,name:String(spec.name??'').trim().slice(0,40),side,controller,
    chapter:spec.chapter,specialty:spec.specialty,
    stats,baseStats:{...raw},armour:{...ARMOUR},powerArmour:true,
    unnaturalStrength:2,unnaturalToughness:2,
    maxWounds:startingWounds(die(5,random),spec.chapter),damage:0,critical:0,
    fate:0,maxFate:0,fatigue:0,stunned:0,
    ap:2,reactions:1,mode:'solo',stance:'standing',
    status:'active',magnitude:null,
    x:0,y:0,aim:0,attackThisTurn:0,
    inventory:{},readied:s.gear[0],
    skills:[...(s.skills??[])],talents:[...(s.talents??[])],powers:spec.specialty==='librarian'?['smite']:[],
    xpAvailable:1000,xpSpent:0,advances:[],
    used:{},traits:['Unnatural Strength (x2)','Unnatural Toughness (x2)','Deathwatch Training'],
  };
  const fate=die(10,random);
  a.fate=a.maxFate=fateFromRoll(fate);
  a.fateRoll=fate;
  // Standard issue: every Space Marine carries a bolt pistol and knife in addition to specialty gear.
  const issue=new Set([...s.gear,'bolt-pistol','knife']);
  if(spec.specialty==='librarian')issue.add('force-sword');
  if(spec.specialty==='assault')issue.add('bolt-pistol');
  for(const wid of issue){
    const w=weaponProfile(wid,'core');
    need(w,'GEAR','未知装备。');
    a.inventory[wid]={clip:w.clip,reserve:w.clip,jammed:false};
  }
  if(!a.inventory[a.readied])a.readied=Object.keys(a.inventory)[0]??'knife';
  return a;
}
export function validateAttributes(attrs){
  need(attrs&&typeof attrs==='object'&&!Array.isArray(attrs),'ATTR','属性必须是对象。');
  const out={};
  for(const k of ATTR_KEYS){
    need(int(attrs[k],32,50),'ATTR',`${k.toUpperCase()} 必须在 32..50 之间（2d10+30）。`);
    out[k]=attrs[k];
  }
  if(attrs.__rerolled)out.__rerolled=true;
  return out;
}
function startingGear(a){return Object.keys(a.inventory);}

/** Create a playable session. All randomness is server-side and persisted. */
export function newSession(options,mission,random){
  need(options&&typeof options==='object','CREATION','建团参数无效。');
  const squad=options.squad;
  need(Array.isArray(squad)&&squad.length===3,'CREATION','必须创建 1 名主角与 2 名战斗兄弟。');
  const ids=squad.map(s=>s.id);
  need(new Set(ids).size===3&&['pc','ally-1','ally-2'].every(id=>ids.includes(id)),'CREATION','队伍标识必须为 pc/ally-1/ally-2。');
  const pc=squad.find(s=>s.id==='pc');
  need(pc,'CREATION','缺少主角。');
  const actors=squad.map(s=>buildActor({...s,attributes:s.attributes}, {id:s.id,controller:s.id==='pc'?'player':'ai'},random));
  // Leader must be a legal oath leader.
  const leaderId=options.leaderId??'pc';
  need(actors.some(a=>a.id===leaderId),'LEADER','领队不在队伍中。');
  const leader=actors.find(a=>a.id===leaderId);
  const oathId=options.oathId??'astartes';
  const oath=OATH(oathId);
  need(oath,'OATH','未知誓言。');
  need(oath.leaders.includes(leader.specialty),'OATH','该专长不能担任此誓言的领队。');
  // Initial advances: only supported characteristic advances from the Rank 1 table.
  for(const spec of squad){
    const a=actors.find(x=>x.id===spec.id);
    let budget=1000;
    for(const adv of spec.advances??[]){
      need(ATTR_KEYS.includes(adv.attr),'ADVANCE','未知进阶属性。');
      const step=a.advances.filter(x=>x.attr===adv.attr).length;
      need(step<4,'ADVANCE','单项属性最多进阶四次。');
      const cost=advanceCost(a.specialty,adv.attr,step);
      need(budget>=cost,'ADVANCE',`经验不足：需要 ${cost} 点，剩余 ${budget} 点。`,409);
      a.stats[adv.attr]=clamp(a.stats[adv.attr]+5,0,99);
      a.advances.push({attr:adv.attr,cost,sourceRef:SPEC(a.specialty).ref});
      budget-=cost;
    }
    a.xpSpent=1000-budget;
    a.xpAvailable=budget;
    a.startingGear=startingGear(a);
  }
  // Requisition: the mission grants a team budget; each item is issued to one actor.
  // Renown-gated gear is out of scope for Rank 1 and is refused rather than silently allowed.
  let requisitionSpent=0;
  for(const item of options.requisition??[]){
    const a=actors.find(x=>x.id===item.actorId);need(a,'REQUISITION','领用角色不存在。',404);
    const w=weaponProfile(item.weaponId,'core');need(w,'REQUISITION','没有这件装备。',404);
    need(!w.npc,'REQUISITION','该装备不供小队领用。');
    need((w.renown??0)<=0,'REQUISITION','该装备需要声望，Rank 1 小队无法领用。',403);
    requisitionSpent+=w.req??0;
    need(requisitionSpent<=(mission.requisition??0),'REQUISITION',`征用超预算：已用 ${requisitionSpent}，上限 ${mission.requisition}。`,409);
    a.inventory[w.id]={clip:w.clip,reserve:w.clip,jammed:false};
  }
  const scene=mission.scenes.find(s=>s.id===mission.firstScene);
  need(scene,'PACK','入口场景不存在。');
  const placement=placeParty(actors,scene);
  const enemies=(scene.enemies??[]).map(e=>spawnEnemy(e));
  const all=[...actors,...enemies];
  const state={
    schemaVersion:1,gameId:MODULE_ID,rulesetId:RULESET,
    id:randomUUID(),version:0,createdAt:new Date().toISOString(),
    title:String(options.title??mission.title).slice(0,60),
    mission,missionRef:{id:mission.id,version:mission.version},
    sceneId:scene.id,sceneStates:{},visited:[scene.id],
    phase:scene.enemies?.length?'combat':'exploration',
    actors:all,combat:null,pending:null,
    flags:{},counters:{},claims:[],journal:[],lastEvents:[],attackQueue:[],
    worldTime:0,weaponProfile:options.weaponProfile==='revised'?'revised':'core',
    cohesion:cohesionBase(leader),oath:oathId,leaderId,
    manualAllies:false,
  };
  for(const a of actors)a.x=placement[a.id].x,a.y=placement[a.id].y;
  if(scene.enemies?.length)beginCombat(state,random);
  else state.combat=null;
  state.lastEvents.push(event('briefing',`${state.title}：小队抵达 ${scene.name}。`));
  return state;
}
function cohesionBase(leader){
  const ch=CHAPTER(leader.chapter);
  return 2+(ch.solo==='Favoured Son'?1:0);
}
function placeParty(actors,scene){
  const starts=scene.starts;
  const out={};
  actors.filter(a=>a.side==='party').forEach((a,i)=>{out[a.id]=starts[i]??starts[0];});
  return out;
}
export function event(type,text,extra={}){return {id:randomUUID(),type,text:String(text).slice(0,800),...extra};}

/** Spawn scene enemies into state (deterministic templates). */
const ENEMY_PRESETS={
  'rebel-horde':{ws:35,bs:30,s:30,t:30,ag:30,int:20,per:25,wp:25,fel:20,weapon:'autogun',armour:2,wounds:12,size:30,tags:['horde']},
  rebel:{ws:35,bs:35,s:35,t:35,ag:32,int:25,per:30,wp:30,fel:20,weapon:'autogun',armour:3,wounds:12,size:1,tags:[]},
  xeno:{ws:45,bs:20,s:45,t:40,ag:45,int:25,per:35,wp:35,fel:10,weapon:'claws',armour:4,wounds:14,size:1,tags:['fear1']},
  leader:{ws:55,bs:45,s:40,t:40,ag:40,int:35,per:35,wp:40,fel:30,weapon:'claws',armour:5,wounds:20,size:1,tags:['fear1']},
};
function spawnEnemy(e,state){
  const preset=ENEMY_PRESETS[e.template]??ENEMY_PRESETS.rebel;
  const weapon=WEAPONS[e.weapon??preset.weapon]??WEAPONS.autogun;
  const a={
    id:e.id,name:e.name,side:'enemy',controller:'engine',template:e.template,
    stats:Object.fromEntries(ATTR_KEYS.map(k=>[k,(e.stats?.[k])??preset[k]])),
    maxWounds:e.wounds??preset.wounds,damage:0,critical:0,
    unnaturalStrength:preset.tags.includes('horde')?3:2,unnaturalToughness:2,
    armour:Object.fromEntries(Object.keys(ARMOUR).map(k=>[k,e.armour??preset.armour])),
    x:e.x,y:e.y,status:'active',
    ap:2,reactions:preset.tags.includes('horde')?0:1,mode:'solo',stance:'standing',aim:0,fatigue:0,stunned:0,
    magnitude:e.magnitude??(preset.tags.includes('horde')?30:null),
    size:e.size??preset.size??1,
    tags:[...preset.tags,...(e.tags??[])],
    weaponOverrides:{},
    inventory:{[weapon.id]:{clip:weapon.clip,reserve:weapon.clip,jammed:false}},
    readied:weapon.id,skills:[],talents:[],powers:[],
    fate:0,maxFate:0,
  };
  if(e.weapon&&!WEAPONS[e.weapon])a.weaponOverrides[weapon.id]={...weapon};
  return a;
}
function materialiseScene(state,sceneId,random){
  const scene=state.mission.scenes.find(s=>s.id===sceneId);
  need(scene,'SCENE','场景不存在。',404);
  state.sceneId=sceneId;
  if(!state.visited.includes(sceneId))state.visited.push(sceneId);
  const enemies=(scene.enemies??[]).map(e=>spawnEnemy(e,state));
  state.actors=[...state.actors.filter(a=>a.side==='party'),...enemies];
  const party=state.actors.filter(a=>a.side==='party');
  party.forEach((a,i)=>{const s=scene.starts[i]??scene.starts[0];a.x=s.x;a.y=s.y;a.damage=a.damage??0;});
  if(enemies.length){state.phase='combat';beginCombat(state,random);}
  else{state.phase='exploration';state.combat=null;for(const a of party){a.ap=2;a.reactions=1;}}
  return scene;
}
export function beginCombat(state,random){
  const order=state.actors.filter(a=>a.status==='active').map(a=>({id:a.id,init:bonus(a.stats.ag)*10+die(10,random)}));
  order.sort((p,q)=>q.init-p.init||p.id.localeCompare(q.id));
  state.combat={order:order.map(o=>o.id),active:0,round:1,serial:1,inits:Object.fromEntries(order.map(o=>[o.id,o.init]))};
  state.phase='combat';
  for(const a of state.actors){a.ap=2;a.reactions=a.tags?.includes('horde')?0:1;a.aim=0;a.attackThisTurn=0;}
  const first=state.combat.order[0];
  state.lastEvents.push(event('combat_start',`战斗开始：${state.actors.find(a=>a.id===first).name} 先行动。`));
  return state.combat;
}
export function activeActor(state){
  if(state.combat){
    const id=state.combat.order[state.combat.active];
    return state.actors.find(a=>a.id===id)??null;
  }
  return state.actors.find(a=>a.side==='party'&&a.status==='active')??null;
}
function nextTurn(state){
  const combat=state.combat;
  if(!combat)return;
  const alive=state.actors.filter(a=>a.status==='active');
  if(!alive.some(a=>a.side==='enemy')){finishCombat(state,'victory');return;}
  if(!alive.some(a=>a.side==='party')){finishCombat(state,'defeat');return;}
  let guard=0;
  do{
    combat.active=(combat.active+1)%combat.order.length;
    if(combat.active===0)combat.round++;
    const a=state.actors.find(x=>x.id===combat.order[combat.active]);
    if(!a||a.status!=='active')continue;
    a.ap=2;a.reactions=1;a.aim=0;a.attackThisTurn=0;
    combat.serial++;
    return;
  }while(++guard<100);
  finishCombat(state,'victory');
}
function finishCombat(state,phase){
  state.combat=null;state.pending=null;state.phase=phase;
  state.lastEvents.push(event(phase,phase==='victory'?'敌人已被清除，战斗结束。':'小队失去战斗能力。'));
  for(const a of state.actors.filter(x=>x.side==='party')){a.ap=2;a.reactions=1;a.aim=0;a.attackThisTurn=0;}
  if(phase==='victory')checkSceneCleared(state);
}
function checkSceneCleared(state){
  const scene=state.mission.scenes.find(s=>s.id===state.sceneId);
  if(!scene)return;
  const enemies=state.actors.filter(a=>a.side==='enemy');
  const alive=enemies.filter(a=>a.status==='active');
  if(alive.length)return;
  if(scene.clearFlag&&!state.flags[scene.clearFlag]){
    state.flags[scene.clearFlag]=true;
    state.lastEvents.push(event('flag',`场景目标达成：${scene.clearFlag}。`));
  }
  for(const e of scene.enemies??[])if(e.defeatFlag&&!state.flags[e.defeatFlag])state.flags[e.defeatFlag]=true;
  state.phase='exploration';
}

/** Normalise an untrusted command into the supported vocabulary. */
export const COMMANDS=new Set(['move','attack','aim','ready','reload','clear_jam','stance','stand','end_turn',
  'interact','travel','medicae','squad_mode','solo_mode','power','skill','support','fate','debrief',
  'react','roll_dodge','manual','gm_resolve']);
export function parseCommand(raw){
  need(raw&&typeof raw==='object'&&!Array.isArray(raw),'COMMAND','命令必须是对象。');
  const type=String(raw.type??'');
  need(COMMANDS.has(type),'COMMAND','不支持的命令类型。');
  const out={...raw,type};
  if(raw.actorId!==undefined)need(typeof raw.actorId==='string'&&raw.actorId.length<=80,'COMMAND','角色标识无效。');
  if(type==='move'){
    need(int(raw.x,0,200)&&int(raw.y,0,200),'COMMAND','目标坐标无效。');
    need(['half','full','run','disengage'].includes(raw.pace??'half'),'COMMAND','移动方式无效。');
    out.pace=raw.pace??'half';
  }
  if(type==='attack'){
    need(typeof raw.targetId==='string'&&raw.targetId.length<=80,'COMMAND','目标无效。');
    if(raw.mode!==undefined)need(['single','semi','full','called','all_out','charge','guarded','swift','lightning'].includes(raw.mode),'COMMAND','攻击模式无效。');
    out.mode=raw.mode??'single';
  }
  if(type==='interact'){need(typeof raw.objectId==='string'&&typeof raw.choiceId==='string','COMMAND','交互参数无效。');}
  if(type==='travel'){need(typeof raw.sceneId==='string'&&raw.sceneId.length<=64,'COMMAND','场景标识无效。');}
  if(type==='react'){need(['dodge','parry','none'].includes(raw.choice),'COMMAND','反应选项无效。');}
  if(type==='medicae'||type==='support'){need(typeof raw.targetId==='string','COMMAND','目标无效。');}
  if(type==='power'){need(typeof raw.powerId==='string','COMMAND','灵能无效。');if(raw.level!==undefined)need(['fettered','unfettered','push'].includes(raw.level),'COMMAND','灵能等级无效。');}
  if(type==='skill'){need(typeof raw.skillId==='string'&&SKILL_STAT[raw.skillId],'COMMAND','未知技能。');}
  return out;
}

/** Validation never rolls dice, never calls a model and never writes. */
export function validateCommand(state,command,authority){
  const c=typeof command==='string'?parseCommand(JSON.parse(command)):parseCommand(command);
  if(state.pending){
    need(c.type==='react','PENDING','有尚未完成的决策，请先处理。',409);
    need(state.pending.ownerActorId===c.actorId||c.actorId===undefined,'PENDING','该决策不属于此角色。',409);
    return {command:c,pending:true};
  }
  const active=activeActor(state);
  need(active,'TURN','当前没有行动角色。',409);
  const actorId=c.actorId??active.id;
  need(actorId===active.id,'NOT_YOUR_TURN',`现在是 ${active.name} 的行动。`,409);
  if(authority?.source==='player')need(active.controller==='player','CONTROL','你不能操作这名角色。',403);
  if(authority?.source==='ai')need(c.type!=='manual'&&c.type!=='gm_resolve'&&c.type!=='debrief','PERMISSION','模型不能执行该操作。',403);
  const a=active;
  const scene=state.mission.scenes.find(s=>s.id===state.sceneId);
  switch(c.type){
    case 'move':{
      const cost=c.pace==='half'||c.pace==='disengage'?1:2;
      need(a.ap>=cost,'NO_ACTIONS','剩余动作不足。',409);
      const path=pathfind(scene.map,{x:a.x,y:a.y,id:a.id},{x:c.x,y:c.y},state.actors.filter(x=>x.id!==a.id));
      need(path,'PATH','无法到达该位置。',409);
      const limit=movementRates(a)[c.pace==='disengage'?'half':c.pace];
      need(path.length<=limit,'RANGE',`超出移动距离：需要 ${path.length} 格，允许 ${limit} 格。`,409);
      if(c.pace==='disengage')need(state.actors.some(x=>x.side!==a.side&&x.status==='active'&&cellDistance(x,a)<=1),'DISENGAGE','没有可脱离的敌人。',409);
      return {command:c,cost};
    }
    case 'attack':{
      const target=actorById(state,c.targetId);
      need(target.id!==a.id&&target.side!==a.side&&target.status==='active','TARGET','目标无效。',409);
      const w=weaponFor(a,c.weaponId??a.readied);
      need(w,'WEAPON','没有这件武器。');
      const melee=w.kind==='melee';
      const cost=({single:1,semi:2,full:2,called:2,all_out:2,charge:2,guarded:1,swift:1,lightning:1})[c.mode];
      need(a.ap>=cost,'NO_ACTIONS','剩余动作不足。',409);
      if(melee)need(cellDistance(a,target)<=1,'RANGE','近战需要相邻。',409);
      else{
        need(lineOfSight(scene.map,a,target),'LOS','没有视线。',409);
        const metres=cellDistance(a,target);
        need(metres<=w.range,'RANGE',`超出射程 ${w.range} 米。`,409);
        const clip=a.inventory[w.id]?.clip??0;
        need(clip>0,'AMMO','没有弹药。',409);
        need(!a.inventory[w.id]?.jammed,'JAMMED','武器卡壳，需要先排除。',409);
      }
      return {command:c,cost,target,weapon:w};
    }
    case 'aim':return {command:c,cost:1};
    case 'ready':{const w=weaponFor(a,c.weaponId);need(w,'WEAPON','没有这件武器。');return {command:c,cost:1};}
    case 'reload':{const inv=a.inventory[a.readied];need(inv,'WEAPON','没有武器。');need(inv.clip<weaponFor(a,a.readied).clip,'RELOAD','弹匣已满。',409);return {command:c,cost:1};}
    case 'clear_jam':{need(a.inventory[a.readied]?.jammed,'JAM','武器没有卡壳。',409);return {command:c,cost:1};}
    case 'stance':
    case 'stand':return {command:c,cost:1};
    case 'end_turn':return {command:c,cost:0};
    case 'interact':{
      const scene2=state.mission.scenes.find(s=>s.id===state.sceneId);
      const obj=scene2.objects?.find(o=>o.id===c.objectId);
      need(obj,'OBJECT','没有这个交互对象。',404);
      const choice=obj.choices.find(x=>x.id===c.choiceId);
      need(choice,'CHOICE','没有这个选项。',404);
      need((choice.requires??[]).every(f=>state.flags[f]),'REQUIRES','前置条件未满足。',409);
      need(!state.flags[`done:${c.objectId}:${c.choiceId}`],'DONE','该选项已完成。',409);
      return {command:c,cost:choice.actionCost??1,obj,choice};
    }
    case 'travel':{
      need(!state.combat,'IN_COMBAT','战斗中不能离开场景。',409);
      const target=state.mission.scenes.find(s=>s.id===c.sceneId);
      need(target,'SCENE','场景不存在。',404);
      const exit=scene.exits?.find(e=>e.to===c.sceneId);
      need(exit,'EXIT','没有通往该场景的出口。',409);
      need((exit.requires??[]).every(f=>state.flags[f]),'REQUIRES','出口条件未满足。',409);
      return {command:c,cost:0,target};
    }
    case 'medicae':{
      const target=actorById(state,c.targetId);
      need(target.side===a.side,'TARGET','只能处理队友。',409);
      need(!state.flags[`medicae:${target.id}:${a.id}`],'TREATED','本次伤势已处理过。',409);
      return {command:c,cost:2,target};
    }
    case 'squad_mode':return {command:c,cost:1};
    case 'solo_mode':return {command:c,cost:1};
    case 'power':{
      need(a.powers.includes(c.powerId),'POWER','没有这项灵能。',409);
      need(c.level!=='push'||a.specialty==='librarian','POWER','只有智库可以推动灵能。',409);
      return {command:c,cost:1};
    }
    case 'skill':return {command:c,cost:1};
    case 'support':{
      const target=actorById(state,c.targetId);
      need(target.side!==a.side,'TARGET','支援目标是敌人。',409);
      need((state.counters.support??0)>0,'SUPPORT','没有可用的支援单位。',409);
      return {command:c,cost:1,target};
    }
    case 'fate':{
      need(a.fate>0,'FATE','没有命运点。',409);
      need(['bonus','heal','reroll','burn'].includes(c.use),'FATE','命运用途无效。',409);
      if(c.use==='reroll')need(state.lastTestId,'FATE','没有可重掷的检定。',409);
      return {command:c,cost:0};
    }
    case 'debrief':return {command:c,cost:0};
    case 'manual':
    case 'gm_resolve':return {command:c,cost:0,human:true};
    case 'react':return {command:c,cost:0};
    default:throw fail('COMMAND','不支持的命令。');
  }
}

function weaponFor(a,id){
  if(!id)return null;
  if(a.inventory&&a.inventory[id])return WEAPONS[id]??a.weaponOverrides?.[id]??null;
  return WEAPONS[id]??a.weaponOverrides?.[id]??null;
}
function weaponProfileFor(state,a,id){
  const base=weaponFor(a,id);
  if(!base)return null;
  return state.weaponProfile==='revised'&&base.bolt?weaponProfile(base.id,'revised'):base;
}

/** Resolve one legal command and return the new state plus its event log. */
export function resolve(state,command,source,random){
  const authority={source:source??'player'};
  const parsed=validateCommand(state,command,authority);
  const c=parsed.command;
  const next=structuredClone(state);
  const a=next.actors.find(x=>x.id===(c.actorId??activeActor(next)?.id));
  need(a,'ACTOR','角色不存在。',404);
  const events=[];
  if(next.pending){
    if(c.type==='react')applyReaction(next,c,random,events);
    finalise(next,events);
    return {state:next,events};
  }
  switch(c.type){
    case 'move':doMove(next,a,c,events);break;
    case 'attack':doAttack(next,a,c,random,events);break;
    case 'aim':doAim(next,a,c,events);break;
    case 'ready':a.readied=c.weaponId;spend(a,1);events.push(event('ready',`${a.name} 切换到 ${weaponFor(a,c.weaponId).name}。`));break;
    case 'reload':doReload(next,a,events);break;
    case 'clear_jam':spend(a,1);a.inventory[a.readied].jammed=false;events.push(event('jam',`${a.name} 排除了 ${weaponFor(a,a.readied).name} 的卡壳。`));break;
    case 'stance':spend(a,1);a.stance=c.stance==='prone'?'prone':'standing';events.push(event('stance',`${a.name} 改为${a.stance==='prone'?'卧倒':'站立'}。`));break;
    case 'stand':spend(a,1);a.stance='standing';events.push(event('stance',`${a.name} 起身。`));break;
    case 'end_turn':endTurn(next,events);break;
    case 'interact':doInteract(next,a,c,random,events);break;
    case 'travel':doTravel(next,a,c,random,events);break;
    case 'medicae':doMedicae(next,a,c,random,events);break;
    case 'squad_mode':doSquadMode(next,a,c,events);break;
    case 'solo_mode':spend(a,1);a.mode='solo';events.push(event('mode',`${a.name} 进入单兵模式。`));break;
    case 'power':doPower(next,a,c,random,events);break;
    case 'skill':doSkill(next,a,c,random,events);break;
    case 'support':doSupport(next,a,c,random,events);break;
    case 'fate':doFate(next,a,c,random,events);break;
    case 'debrief':doDebrief(next,a,events);break;
    case 'manual':case 'gm_resolve':doManual(next,a,c,events);break;
    default:throw fail('COMMAND','不支持的命令。');
  }
  finalise(next,events);
  return {state:next,events};
}

function finalise(next,events){
  next.version=next.version+1;
  // Automatic turn handoff once the active actor has no actions left.
  if(next.combat&&!next.pending){
    const active=activeActor(next);
    if(active&&active.status==='active'&&active.ap<=0)endTurn(next,events);
  }
  if(next.combat&&!next.pending)checkVictory(next,events);
  if(!next.combat)for(const a of next.actors.filter(x=>x.side==='party'&&x.status==='active')){a.ap=2;a.reactions=1;a.aim=0;}
  for(const ev of events)next.journal.push(ev.text);
  if(next.journal.length>200)next.journal=next.journal.slice(-200);
  next.lastEvents=events.slice(-40);
}
function checkVictory(next,events){
  const alive=next.actors.filter(a=>a.status==='active');
  if(!alive.some(a=>a.side==='enemy'))finishCombat(next,'victory');
  else if(!alive.some(a=>a.side==='party'))finishCombat(next,'defeat');
}
function endTurn(next,events){
  if(!next.combat)return;
  next.combat.active=(next.combat.active+1)%next.combat.order.length;
  if(next.combat.active===0)next.combat.round++;
  next.combat.serial++;
  let guard=0;
  while(guard++<100){
    const a=next.actors.find(x=>x.id===next.combat.order[next.combat.active]);
    if(a&&a.status==='active'){
      a.ap=2;a.reactions=a.tags?.includes('horde')?0:1;a.aim=0;a.attackThisTurn=0;
      events.push(event('turn',`轮到 ${a.name}。`));
      return;
    }
    next.combat.active=(next.combat.active+1)%next.combat.order.length;
    if(next.combat.active===0)next.combat.round++;
  }
}
function doMove(next,a,c,events){
  const scene=next.mission.scenes.find(s=>s.id===next.sceneId);
  const cost=c.pace==='half'||c.pace==='disengage'?1:2;
  spend(a,cost);
  const path=pathfind(scene.map,{x:a.x,y:a.y,id:a.id,c:a.c},{x:c.x,y:c.y},next.actors.filter(x=>x.id!==a.id));
  need(path,'PATH','无法到达该位置。',409);
  const limit=movementRates(a)[c.pace==='disengage'?'half':c.pace];
  need(path.length<=limit,'RANGE',`超出移动距离：需要 ${path.length} 格，允许 ${limit} 格。`,409);
  a.x=c.x;a.y=c.y;
  events.push(event('move',`${a.name} 移动 ${path.length} 格到 (${a.x},${a.y})。`,{path}));
}
function doAim(next,a,c,events){
  const full=!!c.full;
  spend(a,1);
  a.aim+=full?20:10;
  events.push(event('aim',`${a.name} ${full?'全动作':'半动作'}瞄准，下次攻击 +${full?20:10}。`));
}
function doReload(next,a,events){
  const inv=a.inventory[a.readied],w=weaponProfileFor(next,a,a.readied);
  spend(a,1);
  need(inv.reserve>0,'AMMO','没有备用弹药。',409);
  const needCount=w.clip-inv.clip;
  const take=Math.min(needCount,inv.reserve);
  inv.clip+=take;inv.reserve-=take;inv.jammed=false;
  events.push(event('reload',`${a.name} 为 ${w.name} 装填 ${take} 发（剩余 ${inv.reserve}）。`));
}
function doAttack(next,a,c,random,events){
  const target=actorById(next,c.targetId);
  need(target.status==='active','TARGET','目标已失去战斗能力。',409);
  const w=weaponProfileFor(next,a,c.weaponId??a.readied);
  need(w,'WEAPON','没有这件武器。');
  const melee=w.kind==='melee';
  const cost=({single:1,semi:2,full:2,called:2,all_out:2,charge:2,guarded:1,swift:1,lightning:1})[c.mode]??1;
  spend(a,cost);
  const scene=next.mission.scenes.find(s=>s.id===next.sceneId);
  let base=melee?a.stats.ws:a.stats.bs;
  const parts=[];
  if(melee)parts.push({label:'标准近战',value:0});else{
    const metres=cellDistance(a,target);
    parts.push({label:'距离',value:rangeModifier(metres,w.range)});
  }
  if(a.aim)parts.push({label:'瞄准',value:a.aim});
  if(a.fatigue)parts.push({label:'疲劳',value:-10*a.fatigue});
  if(a.stance==='prone'&&!melee)parts.push({label:'卧射',value:10});
  if(c.mode==='called')parts.push({label:'指定部位',value:-20});
  if(c.mode==='charge')parts.push({label:'冲锋',value:10});
  if(c.mode==='all_out')parts.push({label:'全力攻击',value:20});
  if(c.mode==='guarded')parts.push({label:'防御攻击',value:-10});
  if(c.mode==='swift')parts.push({label:'快速攻击',value:-10});
  if(c.mode==='lightning')parts.push({label:'闪电攻击',value:-10});
  if(a.mode==='squad'&&next.oath)parts.push({label:'誓言',value:0});
  if(target.magnitude!==null&&target.magnitude!==undefined)parts.push({label:'Horde 规模',value:target.magnitude>=30?20:target.magnitude>=20?10:0});
  const roll=test(base,parts,random,{attack:true});
  a.aim=0;a.attackThisTurn++;
  next.lastTestId=roll.id;
  events.push(event('test',`${a.name} 用 ${w.name} ${attackLabel(c.mode)}：目标 ${roll.target}，骰 ${roll.roll}，${roll.success?'命中':'未命中'}${roll.success?`（成功程度 ${roll.degrees}）`:''}。`,{test:roll}));
  if(!roll.success){
    consumeAmmo(a,w,c.mode);
    return;
  }
  const rate=c.mode==='full'?(w.rof[2]??1):(w.rof[1]??1);
  // Melee against targets: Core p.360 — one hit per two Degrees of Success; Power Field adds one.
  const meleeHits=1+Math.floor(roll.degrees/2)+(w.power?1:0);
  const hits=melee?meleeHits:burstHits(c.mode,roll.degrees,rate);
  consumeAmmo(a,w,c.mode);
  const first=c.mode==='called'?c.location:hitLocation(die(100,random));
  need(['head','rightArm','leftArm','body','rightLeg','leftLeg'].includes(first),'LOCATION','命中部位无效。');
  const locations=melee?hitLocations(first,1):hitLocations(first,Math.max(1,Math.min(hits,10)));
  const pendingHits=locations.map((loc,i)=>{
    const dmg=damageRoll(w,roll.degrees,i===0?0:0,random,{hordeDice:target.magnitude?Math.max(0,Math.min(2,Math.floor(roll.degrees/2))):0});
    return {location:loc,damage:dmg};
  });
  // Reaction window: the defender may dodge or parry before damage is applied.
  const canReact=target.status==='active'&&target.reactions>0&&(c.mode!=='all_out');
  if(canReact){
    next.pending={
      id:randomUUID(),kind:'reaction',ownerActorId:target.id,
      allowedControllers:[target.controller],basedOnVersion:next.version,
      choices:defenceChoices(target,melee),
      continuation:{attackerId:a.id,targetId:target.id,weaponId:w.id,mode:c.mode,hits:pendingHits,melee,degrees:roll.degrees},
      parentActionId:roll.id,committedRollIds:[roll.id],
    };
    if(target.controller==='engine')autoReact(next,random,events);
    else events.push(event('decision',`等待 ${target.name} 选择闪避或格挡。`));
    return;
  }
  applyHits(next,next.actors.find(x=>x.id===a.id),target,pendingHits,random,events);
  if(next.combat&&target.status!=='active')checkVictory(next,events);
}
function attackLabel(mode){
  return ({single:'单发',semi:'半自动连射',full:'全自动连射',called:'指定部位射击',all_out:'全力攻击',charge:'冲锋攻击',guarded:'防御攻击',swift:'快速攻击',lightning:'闪电攻击'})[mode]??mode;
}
function consumeAmmo(a,w,mode){
  const inv=a.inventory?.[w.id];if(!inv)return;
  const rounds=({single:1,semi:Math.min(4,w.rof[1]||1),full:(w.rof[2]||0),called:1,all_out:1,charge:1,guarded:1,swift:1,lightning:1})[mode]??1;
  if(inv.clip!==undefined){inv.clip=Math.max(0,inv.clip-rounds);}
}
function defenceChoices(target,melee){
  const out=[{id:'none',label:'不反应'}];
  if(target.reactions>0)out.unshift({id:'dodge',label:`闪避（敏捷 ${target.stats.ag}）`});
  if(melee&&weaponFor(target,target.readied)?.kind==='melee')out.unshift({id:'parry',label:`格挡（武器技巧 ${target.stats.ws}）`});
  return out;
}
function autoReact(next,random,events){
  const p=next.pending;if(!p)return;
  const target=next.actors.find(a=>a.id===p.ownerActorId);
  const choice=weaponFor(target,target.readied)?.kind==='melee'?'parry':'dodge';
  applyReaction(next,{type:'react',choice,actorId:target.id},random,events);
}
function applyReaction(next,c,random,events){
  const p=next.pending;
  need(p,'PENDING','没有待定决策。',409);
  const target=next.actors.find(a=>a.id===p.ownerActorId);
  need(target,'ACTOR','决策角色不存在。',404);
  if(c.choice==='none'){
    next.pending=null;
    applyHits(next,null,target,p.continuation.hits,random,events);
    return;
  }
  need(target.reactions>0,'REACTION','没有可用的反应。',409);
  const parry=c.choice==='parry';
  const base=parry?target.stats.ws:target.stats.ag;
  const testRoll=test(base,[{label:parry?'格挡':'闪避',value:0}],random,{});
  target.reactions--;
  const blocked=testRoll.success?1:null;
  next.lastTestId=testRoll.id;
  events.push(event('defence',`${target.name} ${parry?'格挡':'闪避'}：目标 ${testRoll.target}，骰 ${testRoll.roll}，${testRoll.success?'成功':'失败'}。`,{test:testRoll}));
  next.pending=null;
  const hits=p.continuation.hits.slice();
  if(blocked)hits.shift();
  applyHits(next,null,target,hits,random,events);
}
function applyHits(next,attacker,target,hits,random,events){
  const horde=target.magnitude!==null&&target.magnitude!==undefined;
  for(const h of hits){
    if(target.status!=='active')break;
    const w=attacker?weaponProfileFor(next,attacker,h.weaponId??attacker.readied):WEAPONS.knife;
    if(horde){
      // Core p.360: each damaging hit removes one Magnitude; Explosive (X) adds one extra hit.
      let lost=w.type==='X'?2:1;
      const raw=h.damage.total;
      const absorb=soak(target,w,'body',raw,0);
      if(absorb.suffered<=0)lost=0;
      if(lost){
        target.magnitude=Math.max(0,target.magnitude-lost);
        events.push(event('horde',`${target.name} 的 Magnitude 减少 ${lost}，降至 ${target.magnitude}。`));
      }else events.push(event('damage',`${target.name} 未受有效伤害（护甲与坚韧吸收）。`));
      if(target.magnitude===0){target.status='dead';events.push(event('dead',`${target.name} 被彻底打散。`));}
      continue;
    }
    const cover=coverAt(next,target,h.location);
    const dmg=soak(target,w,h.location,h.damage.total,cover);
    applyInjury(target,dmg.suffered);
    events.push(event('damage',`${target.name} ${LOCNAME[h.location]}承受 ${dmg.suffered} 点伤害（护甲 ${dmg.armourAfterPen}+${dmg.toughness}，穿透 ${dmg.penetration}）。`,{damage:dmg,location:h.location}));
    if(target.critical>=10){target.status='dead';events.push(event('dead',`${target.name} 伤重不治。`));}
    else if(target.damage>=target.maxWounds&&target.critical>0){target.status='unconscious';events.push(event('down',`${target.name} 失去意识。`));}
  }
}
const LOCNAME={head:'头部',rightArm:'右臂',leftArm:'左臂',body:'躯干',rightLeg:'右腿',leftLeg:'左腿'};
function coverAt(next,actor,location){
  const scene=next.mission.scenes.find(s=>s.id===next.sceneId);
  const c=(scene.cover??[]).find(c=>c.x===actor.x&&c.y===actor.y&&(c.locations??[]).includes(location));
  return c?.ap??0;
}
function doInteract(next,a,c,random,events){
  const scene=next.mission.scenes.find(s=>s.id===next.sceneId);
  const obj=scene.objects.find(o=>o.id===c.objectId);
  const choice=obj.choices.find(x=>x.id===c.choiceId);
  need(choice,'CHOICE','没有这个选项。',404);
  need((choice.requires??[]).every(f=>next.flags[f]),'REQUIRES','前置条件未满足。',409);
  spend(a,choice.actionCost??1);
  need(cellDistance(a,obj)<=1,'RANGE','需要靠近交互对象。',409);
  if(choice.skill){
    const base=a.stats[SKILL_STAT[choice.skill]]??30;
    const known=a.skills.includes(choice.skill);
    const parts=[{label:'难度',value:choice.modifier??0}];
    if(!known)parts.push({label:'未受训',value:-20});
    const roll=test(base,parts,random,{});
    next.lastTestId=roll.id;
    events.push(event('test',`${a.name} ${choice.label}：目标 ${roll.target}，骰 ${roll.roll}，${roll.success?'成功':'失败'}。`,{test:roll}));
    if(!roll.success){if(choice.failFlag)next.flags[choice.failFlag]=true;return;}
  }
  if(choice.flag){next.flags[choice.flag]=true;next.counters[choice.flag]=(next.counters[choice.flag]??0)+1;}
  if(choice.grantSupport)next.counters.support=(next.counters.support??0)+choice.grantSupport;
  if(choice.time)next.worldTime+=choice.time;
  next.flags[`done:${obj.id}:${choice.id}`]=true;
  events.push(event('interact',`${a.name}：${choice.text}`));
  if(choice.flag)checkObjectives(next,events);
}
function checkObjectives(next,events){
  for(const o of next.mission.objectives??[]){
    if(next.flags[o.flag]&&!next.claims.includes(o.id)){
      next.claims.push(o.id);
      events.push(event('objective',`任务目标完成：${o.label}（+${o.xp} XP）。`));
      for(const a of next.actors.filter(x=>x.side==='party'))a.xpAvailable+=o.xp;
    }
  }
  const done=(next.mission.completionFlags??[]).every(f=>next.flags[f]);
  if(done&&next.phase!=='victory')next.phase='debrief';
}
function doTravel(next,a,c,random,events){
  need(!next.combat,'IN_COMBAT','战斗中不能离开场景。',409);
  const scene=next.mission.scenes.find(s=>s.id===c.sceneId);
  const exit=next.mission.scenes.find(s=>s.id===next.sceneId).exits.find(e=>e.to===c.sceneId);
  need(exit,'EXIT','没有通往该场景的出口。',409);
  need((exit.requires??[]).every(f=>next.flags[f]),'REQUIRES','出口条件未满足。',409);
  next.worldTime+=60;
  materialiseScene(next,scene.id,random);
  events.push(event('travel',`小队进入 ${scene.name}。`));
  if(next.phase==='combat')events.push(event('combat_start','敌人出现，进入战斗。'));
}
function doMedicae(next,a,c,random,events){
  const target=actorById(next,c.targetId);
  need(target.side===a.side,'TARGET','只能处理队友。',409);
  spend(a,2);
  const roll=test(a.stats.int,[{label:'医疗',value:-10}],random,{});
  next.lastTestId=roll.id;
  events.push(event('test',`${a.name} 对 ${target.name} 进行急救：目标 ${roll.target}，骰 ${roll.roll}，${roll.success?'成功':'失败'}。`,{test:roll}));
  next.flags[`medicae:${target.id}:${a.id}`]=true;
  if(roll.success){
    const heal=Math.max(1,Math.floor(target.maxWounds*0.2));
    target.damage=Math.max(0,target.damage-heal);
    events.push(event('heal',`${target.name} 恢复 ${heal} 点 Wounds。`));
  }
}
function doSquadMode(next,a,c,events){
  spend(a,1);
  if(c.method==='test'){
    const roll=test(a.stats.fel,[{label:'凝聚力挑战',value:0}],undefined,{});
    next.lastTestId=roll.id;
    events.push(event('test',`凝聚力挑战：目标 ${roll.target}，骰 ${roll.roll}，${roll.success?'成功':'失败'}。`,{test:roll}));
    if(!roll.success)return;
  }
  a.mode='squad';
  events.push(event('mode',`${a.name} 进入小队模式。`));
}
function doPower(next,a,c,random,events){
  need(a.powers.includes(c.powerId),'POWER','没有这项灵能。',409);
  spend(a,1);
  const level=c.level??'fettered';
  const target=c.targetId?actorById(next,c.targetId):null;
  if(c.powerId==='smite'){
    need(target,'TARGET','惩击需要目标。',409);
    const base=a.stats.wp;
    const mods=[{label:'灵能等级',value:level==='push'?20:level==='unfettered'?10:0}];
    const roll=test(base,mods,random,{});
    next.lastTestId=roll.id;
    events.push(event('test',`惩击：目标 ${roll.target}，骰 ${roll.roll}，${roll.success?'成功':'失败'}。`,{test:roll}));
    if(!roll.success)return;
    const dmg=damageRoll({id:'smite',dice:1,add:0,tearing:false},roll.degrees,Math.floor(a.stats.wp/10),random,{fury:false});
    const absorbed=soak(target,{pen:3},{}.x??c.location??'body',dmg.total,0);
    applyInjury(target,absorbed.suffered);
    events.push(event('damage',`${target.name} 承受 ${absorbed.suffered} 点灵能伤害。`));
  }else{
    events.push(event('power',`${a.name} 使用 ${c.powerId}（${level}）。`));
    if(level==='push'&&die(10,random)>=8){
      a.fatigue=Math.min(3,a.fatigue+1);
      events.push(event('phenomena','灵能现象：意志反噬，疲劳 +1。'));
    }
  }
}
function doSkill(next,a,c,random,events){
  const skill=c.skillId;need(SKILL_STAT[skill],'SKILL','未知技能。',404);
  spend(a,1);
  const base=a.stats[SKILL_STAT[skill]];
  const parts=[];
  if(!a.skills.includes(skill))parts.push({label:'未受训',value:-20});
  const roll=test(base,parts,random,{});
  next.lastTestId=roll.id;
  events.push(event('test',`${a.name} ${SKILLS[skill].name}检定：目标 ${roll.target}，骰 ${roll.roll}，${roll.success?'成功':'失败'}${roll.success?`（成功程度 ${roll.degrees}）`:''}。`,{test:roll}));
}
function doSupport(next,a,c,random,events){
  need((next.counters.support??0)>0,'SUPPORT','没有可用的支援单位。',409);
  next.counters.support--;
  spend(a,1);
  const target=actorById(next,c.targetId);
  const dmg=damageRoll({id:'pdf-support',dice:2,add:4,tearing:false},0,0,random,{fury:false});
  const absorbed=soak(target,{pen:4},'body',dmg.total,0);
  applyInjury(target,absorbed.suffered);
  events.push(event('support',`PDF 支援打击 ${target.name}，造成 ${absorbed.suffered} 点伤害（剩余支援 ${next.counters.support}）。`));
}
function doFate(next,a,c,random,events){
  need(a.fate>0,'FATE','没有命运点。',409);
  if(c.use==='heal'){
    a.fate--;
    const heal=die(5,random);
    a.damage=Math.max(0,a.damage-heal);
    events.push(event('fate',`${a.name} 花费命运点治疗 ${heal} 点伤势（剩余 ${a.fate}）。`));
    return;
  }
  if(c.use==='bonus'){
    a.fate--;a.aim+=10;
    events.push(event('fate',`${a.name} 花费命运点，下次检定 +10（剩余 ${a.fate}）。`));
    return;
  }
  if(c.use==='reroll'){
    need(next.lastTestId,'FATE','没有可重掷的检定。',409);
    a.fate--;
    events.push(event('fate',`${a.name} 花费命运点请求重掷；结果由下一次检定决定（剩余 ${a.fate}）。`));
    return;
  }
  a.fate--;
  events.push(event('fate',`${a.name} 消耗命运点。`));
}
function doDebrief(next,a,events){
  checkObjectives(next,events);
  if(next.phase!=='victory'&&(next.mission.completionFlags??[]).every(f=>next.flags[f]))next.phase='victory';
  events.push(event('debrief',`任务结算：${next.claims.length} 项目标完成，剩余经验 ${a.xpAvailable}。`));
}
function doManual(next,a,c,events){
  events.push(event('manual',`人工裁定：${String(c.note??c.effect??'已记录').slice(0,300)}`));
}

/** Player-facing view: strips GM lore, hidden flags and enemy internals. */
export function observation(state){
  const scene=state.mission.scenes.find(s=>s.id===state.sceneId);
  const visibleFlags=Object.fromEntries(Object.entries(state.flags).filter(([k])=>!k.startsWith('medicae:')&&!k.startsWith('done:')));
  return {
    id:state.id,title:state.title,version:state.version,phase:state.phase,sceneId:state.sceneId,
    rulesetId:state.rulesetId,weaponProfile:state.weaponProfile,cohesion:state.cohesion,oath:state.oath,leaderId:state.leaderId,
    scene:{id:scene.id,name:scene.name,description:scene.description,map:scene.map,exits:scene.exits,objects:scene.objects,cover:scene.cover??[],ref:scene.ref},
    actors:state.actors.map(a=>a.side==='party'?partyView(a):enemyView(a)),
    activeActorId:activeActor(state)?.id??null,
    combat:state.combat,
    pending:state.pending?{id:state.pending.id,kind:state.pending.kind,ownerActorId:state.pending.ownerActorId,choices:state.pending.choices}:null,
    flags:visibleFlags,counters:state.counters,claims:state.claims,visited:state.visited,worldTime:state.worldTime,
    journal:state.journal.slice(-40),lastEvents:state.lastEvents,
    objectives:(state.mission.objectives??[]).map(o=>({id:o.id,label:o.label,type:o.type,flag:o.flag,done:!!state.flags[o.flag],xp:o.xp})),
    mission:{id:state.mission.id,title:state.mission.title,version:state.mission.version,briefing:state.mission.briefing,publicLore:state.mission.publicLore,objectives:state.mission.objectives},
    conventions:CONVENTIONS,
  };
}
function partyView(a){
  return {id:a.id,name:a.name,side:a.side,controller:a.controller,chapter:a.chapter,specialty:a.specialty,
    x:a.x,y:a.y,stats:a.stats,maxWounds:a.maxWounds,damage:a.damage,critical:a.critical,status:a.status,
    fate:a.fate,maxFate:a.maxFate,fatigue:a.fatigue,stunned:a.stunned,ap:a.ap,reactions:a.reactions,
    mode:a.mode,stance:a.stance,aim:a.aim,readied:a.readied,inventory:a.inventory,skills:a.skills,
    talents:a.talents,powers:a.powers,xpAvailable:a.xpAvailable,xpSpent:a.xpSpent,magnitude:null,
    leader:a.id==='pc'};
}
function enemyView(a){
  return {id:a.id,name:a.name,side:a.side,controller:a.controller,x:a.x,y:a.y,status:a.status,
    damage:a.damage,maxWounds:a.maxWounds,critical:a.critical,magnitude:a.magnitude,size:a.size,
    tags:a.tags,readied:a.readied,ap:a.ap,reactions:a.reactions,mode:a.mode,stance:a.stance};
}

/** Deterministic policy used when a model is unavailable. */
function reachableCells(state,a,limit){
  const scene=state.mission.scenes.find(s=>s.id===state.sceneId);
  const out=[];
  for(let y=0;y<scene.map.length;y++)for(let x=0;x<scene.map[0].length;x++){
    if(!openCell(scene.map,x,y))continue;
    if(state.actors.some(o=>o.id!==a.id&&o.status==='active'&&o.x===x&&o.y===y&&o.side!==a.side))continue;
    const path=pathfind(scene.map,{x:a.x,y:a.y,id:a.id},{x,y},state.actors.filter(o=>o.id!==a.id));
    if(path&&path.length>0&&path.length<=limit)out.push({x,y,path});
  }
  return out.sort((p,q)=>p.path.length-q.path.length);
}
export function fallbackCommand(state){
  const a=activeActor(state);
  if(!a)return null;
  if(state.pending){
    if(state.pending.ownerActorId!==a.id)return null;
    return {type:'react',actorId:a.id,choice:weaponFor(a,a.readied)?.kind==='melee'?'parry':'dodge'};
  }
  const enemies=state.actors.filter(x=>x.side!==a.side&&x.status==='active');
  if(state.combat&&enemies.length){
    const w=weaponProfileFor(state,a,a.readied);
    const inv=a.inventory[a.readied];
    if(inv?.jammed)return {type:'clear_jam',actorId:a.id};
    if(w&&w.kind!=='melee'&&inv&&inv.clip===0&&inv.reserve>0)return {type:'reload',actorId:a.id};
    const nearest=enemies.slice().sort((p,q)=>cellDistance(a,p)-cellDistance(a,q))[0];
    const melee=w?.kind==='melee';
    if(melee&&cellDistance(a,nearest)<=1)return {type:'attack',actorId:a.id,targetId:nearest.id,mode:a.ap>=2?'all_out':'single'};
    const scene=state.mission.scenes.find(s=>s.id===state.sceneId);
    const dist=cellDistance(a,nearest);
    if(!melee&&lineOfSight(scene.map,a,nearest)&&dist<=w.range){
      if(!a.magnitude&&a.aim<10&&a.ap>=2)return {type:'aim',actorId:a.id,full:false};
      return {type:'attack',actorId:a.id,targetId:nearest.id,mode:a.ap>=2?'semi':'single'};
    }
    const limit=movementRates(a).full;
    const cells=reachableCells(state,a,limit).filter(c=>{
      if(melee)return cellDistance(c,nearest)<=1;
      return lineOfSight(scene.map,c,nearest)&&cellDistance(c,nearest)<=w.range;
    });
    const pool=cells.length?cells:reachableCells(state,a,limit).sort((p,q)=>cellDistance(p,nearest)-cellDistance(q,nearest)||p.path.length-q.path.length);
    if(pool.length&&cellDistance(pool[0],a)>0){
      const best=pool[0];
      const stepIndex=Math.max(0,Math.min(best.path.length-1,limit));
      const step=best.path[stepIndex];
      return {type:'move',actorId:a.id,x:step.x,y:step.y,pace:'full'};
    }
    return {type:'end_turn',actorId:a.id};
  }
  if(state.combat)return {type:'end_turn',actorId:a.id};
  return {type:'debrief',actorId:a.id};
}
