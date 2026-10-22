import {need,int,clone,openCell} from './rules.mjs';
const arena=(variant=0)=>{
 const rows=Array.from({length:16},(_,y)=>Array.from({length:24},(_,x)=>x===0||y===0||x===23||y===15?'#':'.'));
 for(let y=3;y<13;y++)if(y!==7&&y!==8)rows[y][11]='#';
 if(variant%2)for(let x=14;x<22;x++)rows[9][x]='#';
 else for(let x=3;x<9;x++)rows[5][x]='#';
 return rows.map(r=>r.join(''));
};
export const BUILTIN={
 id:'watchstation-vigil',version:'1.0.0',title:'守望任务：维吉尔信标',sourceKind:'original',
 description:'用完整行动经济练习 Deathwatch 核心机制的原创任务，不冒充官方出版冒险。',
 briefing:'一座轨道信标失去认证。杀戮小队必须恢复联络、找回记录，并查明沉默背后的原因。你决定先救援驻军、搜索档案，还是直接突入核心。',
 rulesNote:'规则依据 2010 核心书与勘误；本任务的地点、敌人布置、奖励和地图为原创。',
 firstScene:'dock',requisition:30,completionFlags:['signal','nest'],
 publicLore:[{id:'mission',title:'任务简报',text:'主要目标：恢复信标、解除异形威胁。次要目标：取得故障记录、救援驻军。'},
 {id:'team',title:'杀戮小队',text:'由不同战团的战斗兄弟组成。可以选择任务领队、宣誓、征用装备，以单兵或小队模式作战。'},
 {id:'truth',title:'裁定原则',text:'事实、骰子、装备消耗和伤害以服务端结算为准。模型负责建议与叙事；未实现的规则必须进入裁定助手。'}],
 gmLore:[{id:'cause',text:'信标认证被人为破坏。数据核心中的日志可以佐证；不得在调查前透露。',revealFlag:'records'}],
 objectives:[{id:'signal',label:'恢复信标广播',flag:'signal',type:'primary',xp:300,renown:1},{id:'nest',label:'解除核心威胁',flag:'nest',type:'primary',xp:300,renown:1},
 {id:'records',label:'带回故障记录',flag:'records',type:'secondary',xp:200,renown:0},{id:'rescue',label:'救援驻军',flag:'rescue',type:'secondary',xp:200,renown:0}],
 scenes:[
 {id:'dock',name:'01 · 停泊平台',description:'红色警示灯沿地面延伸。守军在沙袋后等待小队。这里可确认任务与装备。',ref:'原创场景',map:arena(),starts:[{x:2,y:7},{x:3,y:6},{x:3,y:8}],enemies:[],cover:[],
 objects:[{id:'officer',name:'驻守军官',x:5,y:7,choices:[{id:'briefing',label:'询问失联经过',text:'军官确认：档案室仍有供电，主信标受到干扰。',flag:'briefed'}]}],
 exits:[{to:'barracks',label:'前往驻军防线'},{to:'archive',label:'调查档案室'},{to:'relay',label:'先修复信标'}]},
 {id:'barracks',name:'02 · 驻军防线',description:'敌群正在向掩体集结。用连射和协同保护驻军，而不是把每个敌人当成单独目标。',ref:'原创场景；Hordes: Core 359–360',map:arena(1),starts:[{x:2,y:7},{x:3,y:6},{x:3,y:8}],
 cover:[{x:5,y:7,ap:8,locations:['body','leftLeg','rightLeg']},{x:6,y:7,ap:8,locations:['body','leftLeg','rightLeg']}],
 enemies:[{id:'mob',name:'武装叛乱者群',template:'rebel-horde',x:17,y:7,magnitude:30,size:30}],clearFlag:'rescue',
 objects:[],exits:[{to:'dock',label:'返回平台'},{to:'archive',label:'进入档案室'}]},
 {id:'archive',name:'03 · 档案室',description:'冷却管道的声音盖住了控制台的短促提示。你可以解析日志，也可以让同伴协助。',ref:'原创场景；Tests: Core 202–204',map:arena(),starts:[{x:2,y:7},{x:3,y:6},{x:3,y:8}],enemies:[],cover:[],
 objects:[{id:'archive-terminal',name:'日志终端',x:5,y:7,choices:[{id:'decode',label:'技术运用：恢复损坏日志',skill:'tech',modifier:0,text:'日志已恢复，破坏的时间与操作身份被记录。',flag:'records'},
 {id:'search',label:'搜索：查找纸质备份',skill:'search',modifier:-10,text:'你在防火柜里找到一份完整副本。',flag:'records'}]}],
 exits:[{to:'dock',label:'返回平台'},{to:'relay',label:'前往信标塔'},{to:'nest',label:'循记录寻找入侵者',requires:['records']}]},
 {id:'relay',name:'04 · 信标塔',description:'备用线圈尚未烧毁。你必须靠近控制台，恢复与轨道舰艇的通信。',ref:'原创场景；Tech-Use: Core 105',map:arena(1),starts:[{x:2,y:7},{x:3,y:6},{x:3,y:8}],enemies:[],cover:[],
 objects:[{id:'relay-terminal',name:'信标控制台',x:7,y:7,choices:[{id:'repair',label:'技术运用：重建认证',skill:'tech',modifier:10,text:'信标恢复，轨道舰艇确认了小队身份。',flag:'signal'},
 {id:'manual',label:'按维护手册逐步复位（耗时 10 分钟）',text:'你按手册完成复位。信标恢复，但失去了突袭的时间优势。',flag:'signal',time:600}]}],
 exits:[{to:'dock',label:'返回平台'},{to:'nest',label:'进入核心区'}]},
 {id:'nest',name:'05 · 核心隔离区',description:'冷却槽之间出现锋利的刮痕。保持警戒，近战、格挡与护甲不再只是角色卡上的数字。',ref:'原创场景',map:arena(),starts:[{x:2,y:7},{x:3,y:6},{x:3,y:8}],
 enemies:[{id:'xeno',name:'潜伏异形',template:'xeno',x:16,y:7}],cover:[],clearFlag:'nest',objects:[],exits:[{to:'dock',label:'返回并提交任务'}]},
 ],ending:'小队完成任务并返回停泊平台。档案与伤势保留，任务奖励按实际完成目标结算。',
};
const id=v=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(v);
const txt=(v,n=4000)=>typeof v==='string'&&v.length<=n;
export function validateWeapon(w){need(w&&typeof w==='object'&&id(w.id)&&txt(w.name,100)&&['melee','basic','pistol','heavy','thrown'].includes(w.kind),'PACK','自定义武器类型无效。');
 for(const [k,lo,hi]of [['range',0,1000],['dice',1,10],['add',0,50],['pen',0,30],['clip',0,1000],['reload',0,20]])need(int(w[k],lo,hi),'PACK','自定义武器数值无效。');
 need(['I','R','X','E'].includes(w.type)&&Array.isArray(w.rof)&&w.rof.length===3&&w.rof.every(n=>int(n,0,20)),'PACK','自定义武器射速无效。');
 for(const k of ['tearing','balanced','primitive','power'])need(w[k]===undefined||typeof w[k]==='boolean','PACK','武器特质无效。');
 need(w.penOnDegrees===undefined||int(w.penOnDegrees,1,10),'PACK','穿甲条件无效。');return clone(w);
}
export function validateMission(raw){
 need(raw&&typeof raw==='object'&&!Array.isArray(raw),'PACK','内容包必须是对象。');
 const m=clone(raw);need(!JSON.stringify(m).includes('"__proto__"'),'PACK','内容包包含不支持的键。');need(JSON.stringify(m).length<=1500000,'PACK','内容包过大。');
 need(id(m.id)&&txt(m.title,100)&&m.title.length>0&&txt(m.version,40)&&id(m.firstScene),'PACK','内容包标识、标题或版本无效。');
 need(['original','private-adaptation'].includes(m.sourceKind)&&txt(m.briefing)&&txt(m.description)&&txt(m.ending),'PACK','内容包说明无效。');
 need(int(m.requisition,0,200)&&Array.isArray(m.completionFlags)&&m.completionFlags.length<=20&&m.completionFlags.every(id),'PACK','任务参数无效。');
 need(Array.isArray(m.scenes)&&m.scenes.length>=1&&m.scenes.length<=30,'PACK','场景数量应为 1..30。');
 const ids=new Set(m.scenes.map(s=>s.id));need(ids.size===m.scenes.length&&ids.has(m.firstScene),'PACK','场景 ID 重复或缺失入口。');
 for(const s of m.scenes){
  need(id(s.id)&&txt(s.name,100)&&txt(s.description)&&txt(s.ref,250),'PACK','场景资料无效。');
  need(Array.isArray(s.map)&&s.map.length>=6&&s.map.length<=40&&typeof s.map[0]==='string','PACK','地图无效。');
  const width=s.map[0].length;need(width>=8&&width<=50&&s.map.every(row=>typeof row==='string'&&row.length===width&&/^[.#]+$/.test(row)),'PACK','地图必须为等宽 . / # 网格。');
  need(s.movementDivisor===undefined||int(s.movementDivisor,1,4),'PACK','地形移动参数无效。');need(s.dodgeModifier===undefined||int(s.dodgeModifier,-60,60),'PACK','地形闪避参数无效。');
  const cell=p=>p&&int(p.x,0,width-1)&&int(p.y,0,s.map.length-1)&&openCell(s.map,p.x,p.y);
  need(Array.isArray(s.starts)&&s.starts.length>=3&&s.starts.length<=6&&s.starts.every(cell),'PACK','出生点无效。');
  need(new Set(s.starts.map(p=>`${p.x},${p.y}`)).size===s.starts.length,'PACK','出生点重复。');
  need(Array.isArray(s.enemies)&&s.enemies.length<=20&&s.enemies.every(e=>id(e.id)&&txt(e.name,80)&&['rebel-horde','rebel','xeno','leader'].includes(e.template)&&cell(e)&&(e.magnitude===undefined||int(e.magnitude,1,200))&&(e.size===undefined||int(e.size,0,60))),'PACK','敌人配置无效。');
  for(const e of s.enemies){need(!['pc','ally-1','ally-2'].includes(e.id),'PACK','敌人 ID 与队伍保留 ID 冲突。');
   for(const [key,lo,hi] of [['wounds',1,200],['armour',0,30],['unnaturalStrength',1,4],['unnaturalToughness',1,4],['fear',0,4],['movementBase',1,30],['attacks',1,3]])need(e[key]===undefined||int(e[key],lo,hi),'PACK','敌人数值超出校验范围。');
   need(e.tags===undefined||(Array.isArray(e.tags)&&e.tags.length<=8&&e.tags.every(id)),'PACK','敌人标签无效。');need(e.defeatFlag===undefined||id(e.defeatFlag),'PACK','敌人目标标记无效。');need(e.dodgeBonus===undefined||int(e.dodgeBonus,0,30),'PACK','闪避加值无效。');
   if(e.weapon!==undefined)validateWeapon(e.weapon);
   if(e.stats!==undefined)need(e.stats&&typeof e.stats==='object'&&!Array.isArray(e.stats)&&Object.entries(e.stats).every(([k,v])=>['ws','bs','s','t','ag','int','per','wp','fel'].includes(k)&&int(v,0,100)),'PACK','敌人属性无效。');
  }
  need(new Set(s.enemies.map(e=>e.id)).size===s.enemies.length&&new Set([...s.starts,...s.enemies].map(p=>`${p.x},${p.y}`)).size===s.starts.length+s.enemies.length,'PACK','角色出生位置重叠。');
  need(Array.isArray(s.cover)&&s.cover.length<=100&&s.cover.every(c=>cell(c)&&int(c.ap,0,30)&&Array.isArray(c.locations)&&c.locations.every(k=>['head','body','leftArm','rightArm','leftLeg','rightLeg'].includes(k))),'PACK','掩体无效。');
  need(Array.isArray(s.objects)&&s.objects.length<=30,'PACK','交互物无效。');
  for(const o of s.objects){need(id(o.id)&&txt(o.name,100)&&cell(o)&&Array.isArray(o.choices)&&o.choices.length<=20,'PACK','交互物或选项无效。');
   for(const c of o.choices){need(id(c.id)&&txt(c.label,200)&&txt(c.text)&&(!c.flag||id(c.flag))&&(!c.failFlag||id(c.failFlag)),'PACK','剧情选项无效。');
    need(c.attribute===undefined||['ws','bs','s','t','ag','int','per','wp','fel'].includes(c.attribute),'PACK','属性检定无效。');need(c.combat===undefined||typeof c.combat==='boolean','PACK','交互战斗选项无效。');need(c.actionCost===undefined||int(c.actionCost,1,2),'PACK','交互动作成本无效。');
    need(c.skill===undefined||['awareness','search','tech','command','charm','intimidate','inquiry','concealment','silentMove','xenos','tactics','demolition','medicae'].includes(c.skill),'PACK','未知检定技能。');
    need(c.modifier===undefined||int(c.modifier,-60,60),'PACK','检定难度超出范围。');
    need(c.grantSupport===undefined||int(c.grantSupport,0,10)&&id(c.flag),'PACK','支援资源配置无效。');
    need(c.time===undefined||int(c.time,0,86400),'PACK','时间参数无效。');
    need(c.requires===undefined||(Array.isArray(c.requires)&&c.requires.length<30&&c.requires.every(id)),'PACK','前置条件无效。');
   }
   need(new Set(o.choices.map(c=>c.id)).size===o.choices.length,'PACK','选项 ID 重复。');
  }
  need(new Set(s.objects.map(o=>o.id)).size===s.objects.length,'PACK','交互物 ID 重复。');
  need(Array.isArray(s.exits)&&s.exits.length<=20&&s.exits.every(e=>ids.has(e.to)&&txt(e.label,200)&&(!e.requires||(Array.isArray(e.requires)&&e.requires.every(id)))),'PACK','场景出口无效。');
  if(s.clearRule)need(int(s.clearRule.roundLimit,1,100)&&(!s.clearRule.meleeOnly||typeof s.clearRule.meleeOnly==='boolean'),'PACK','时限条件无效。');
  need(!s.clearFlag||id(s.clearFlag),'PACK','清场标记无效。');
 }
 for(const key of ['publicLore','gmLore'])need(Array.isArray(m[key])&&m[key].length<=150&&m[key].every(e=>id(e.id)&&txt(e.text)&&(!e.title||txt(e.title,100))&&(!e.revealFlag||id(e.revealFlag))),'PACK','世界书条目无效。');
 need(Array.isArray(m.objectives)&&m.objectives.length<=30&&m.objectives.every(o=>id(o.id)&&id(o.flag)&&(!o.revealFlag||id(o.revealFlag))&&txt(o.label,150)&&['primary','secondary','tertiary'].includes(o.type)&&int(o.xp,0,10000)&&int(o.renown,0,20)),'PACK','任务目标无效。');
 need(new Set(m.objectives.map(o=>o.id)).size===m.objectives.length,'PACK','目标 ID 重复。');
 for(const d of m.derivedFlags??[])need(id(d.flag)&&int(d.min,1,100)&&(id(d.counter)||(Array.isArray(d.flags)&&d.flags.every(id))),'PACK','目标条件无效。');
 for(const d of m.settlement??[])need(id(d.id)&&Array.isArray(d.allFlags)&&d.allFlags.every(id)&&int(d.xp,0,10000)&&int(d.renown,0,20),'PACK','结算奖励无效。');
 return m;
}
export function missionSummary(m){return {id:m.id,title:m.title,version:m.version,description:m.description,sourceKind:m.sourceKind,rulesNote:m.rulesNote??'',scenes:m.scenes.length};}
