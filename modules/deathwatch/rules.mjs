/** Independent implementation of the mechanics cited in docs/deathwatch/RULES.md.
 * Core Rulebook (2010) + Living Errata 1.1; no Foundry code is used. */
import {randomInt, randomUUID} from 'node:crypto';
export class DWError extends Error {
  constructor(code, message, status=400) { super(message); this.name='DWError'; this.code=code; this.status=status; }
}
export function need(value,code,message,status=400){if(!value)throw new DWError(code,message,status);}
export const rng=sides=>randomInt(1,sides+1);
export const clone=value=>structuredClone(value);
export const int=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
export const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const bonus=n=>Math.floor(n/10);
export function die(sides,random=rng){const n=random(sides);need(int(n,1,sides),'RNG','随机数源超出范围。',500);return n;}
export function dice(count,sides=10,random=rng){need(int(count,1,50),'DICE','骰子数应在 1..50。');return Array.from({length:count},()=>die(sides,random));}
export function test(base,modifiers=[],random=rng,options={}){
  need(int(base,0,250),'TEST','属性数值无效。');
  const parts=modifiers.map(x=>typeof x==='number'?{label:'修正',value:x}:x);
  need(parts.every(p=>p&&typeof p.label==='string'&&int(p.value,-200,200)),'TEST','修正值无效。');
  const modifier=clamp(parts.reduce((n,p)=>n+p.value,0),-60,60),target=base+modifier;
  const roll=options.roll??die(100,random);need(int(roll,1,100),'TEST','百分骰结果无效。');
  const success=options.focus?roll<=90&&roll<=target:options.attack?roll===1||(roll<96&&roll<=target):roll<=target;
  const degrees=Math.max(0,Math.floor(Math.abs(target-roll)/10));
  return {id:randomUUID(),base,parts,modifier,target,roll,success,degrees,attack:!!options.attack,focus:!!options.focus,
    source:'Core p.202–204; p.244',note:'成功程度只计完整的 10 点差值，不额外加 1。'};
}
export function reroll(result,random=rng){return test(result.base,result.parts,random,{attack:result.attack,focus:result.focus});}
export const LOCATIONS=['head','rightArm','leftArm','body','rightLeg','leftLeg'];
export const LOCATION_NAMES={head:'头部',rightArm:'右臂',leftArm:'左臂',body:'躯干',rightLeg:'右腿',leftLeg:'左腿'};
export function hitLocation(roll){need(int(roll,1,100),'ROLL','命中骰无效。');const s=String(roll===100?0:roll).padStart(2,'0');const n=Number(s[1]+s[0])||100;return n<=10?'head':n<=20?'rightArm':n<=30?'leftArm':n<=70?'body':n<=85?'rightLeg':'leftLeg';}
// Table 8-2: the final column applies to EVERY hit after the fifth.
// Where the table says Arm without a side, this adapter uses the original side,
// or the right side when none exists; this declared convention is shown in RULES.md.
const EXTRA={head:['head','rightArm','body','rightArm','body'],rightArm:['rightArm','body','head','body','rightArm'],
 leftArm:['leftArm','body','head','body','leftArm'],body:['body','rightArm','head','rightArm','body'],
 rightLeg:['rightLeg','body','rightArm','head','body'],leftLeg:['leftLeg','body','leftArm','head','body']};
export function hitLocations(first,count){need(LOCATIONS.includes(first)&&int(count,1,50),'HITS','命中部位或数量无效。');return Array.from({length:count},(_,i)=>i===0?first:EXTRA[first][Math.min(i-1,4)]);}
export function burstHits(mode,degrees,rate){if(mode==='single'||mode==='called'||mode==='all_out'||mode==='charge'||mode==='guarded'||mode==='swift'||mode==='lightning')return 1;need(mode==='semi'||mode==='full','MODE','射击模式无效。');return Math.min(rate,1+Math.floor(degrees/(mode==='semi'?2:1)));}
export function strengthBonus(a){return bonus(a.stats.s)*(a.unnaturalStrength??1)+(a.powerArmour?2:0);}
export function toughnessBonus(a){return bonus(a.stats.t)*(a.unnaturalToughness??1);}
export function movement(a){return Math.max(1,(a.movementBase??bonus(a.stats.ag))+(a.powerArmour?1:0));}
export function damageRoll(w,degree=0,extra=0,random=rng,{confirm=()=>false,hordeDice=0,fury=true}={}){
  const raw=dice(w.dice+hordeDice+(w.tearing?1:0),10,random);
  const used=[...raw].sort((a,b)=>b-a).slice(0,w.dice+hordeDice),naturalTen=used.includes(10);
  let replaced=null;
  if(degree>0){const at=used.indexOf(Math.min(...used));if(used[at]<degree){replaced={from:used[at],to:degree};used[at]=degree;}}
  let total=used.reduce((a,b)=>a+b,0)+w.add+extra,rf=[];
  if(fury&&naturalTen&&confirm()){
    for(let i=0;i<100;i++){const n=die(10,random);rf.push(n);total+=n;if(n!==10)break;if(i===99)throw new DWError('RNG_LOOP','连续爆骰超出安全限制，本次结算取消。',500);}
  }
  return {raw,used,replaced,extra,fixed:w.add,fury:rf,total:Math.max(0,total),source:'Core p.245; Errata p.5'};
}
export function soak(a,weapon,location,raw,cover=0){
  need(LOCATIONS.includes(location),'LOCATION','未知命中部位。');
  const armour=a.armour[location]??0,tb=toughnessBonus(a);
  const armourAfterPen=Math.max(0,armour+cover-weapon.pen);
  const suffered=Math.max(0,raw-armourAfterPen-tb);
  return {raw,location,armour,cover,penetration:weapon.pen,armourAfterPen,toughness:tb,suffered};
}
export function applyInjury(a,amount){
  need(int(amount,0,10000),'DAMAGE','伤害无效。');
  const before=a.damage,room=Math.max(0,a.maxWounds-a.damage),ordinary=Math.min(room,amount);
  a.damage+=ordinary;let critical=Math.max(0,amount-ordinary);
  if(critical>0&&a.trueGrit)critical=Math.max(1,critical-toughnessBonus(a));
  a.critical+=critical;
  return {before,after:a.damage,criticalAdded:critical,critical:a.critical,trueGrit:!!a.trueGrit};
}
export function rangeModifier(metres,range){return metres<=3?30:metres<range/2?10:metres>range*3?-30:metres>range*2?-10:0;}
export function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
export const cellDistance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
export function openCell(map,x,y){return int(x,0,map[0].length-1)&&int(y,0,map.length-1)&&map[y][x]!=='#';}
export function lineOfSight(map,a,b){let x=a.x,y=a.y,dx=Math.abs(b.x-x),dy=-Math.abs(b.y-y),sx=x<b.x?1:-1,sy=y<b.y?1:-1,err=dx+dy;
 while(x!==b.x||y!==b.y){const e=2*err,px=x,py=y;if(e>=dy){err+=dy;x+=sx;}if(e<=dx){err+=dx;y+=sy;}
 if(!openCell(map,x,y))return false;
 if(x!==px&&y!==py&&!openCell(map,x,py)&&!openCell(map,px,y))return false;
 }return true;}
export function pathfind(map,from,to,actors=[],{allowAllies=true}={}){
 if(!openCell(map,to.x,to.y))return null;
 const blocked=(x,y,last)=>actors.some(a=>a.id!==from.id&&a.status!=='dead'&&a.status!=='fled'&&a.x===x&&a.y===y&&(last||!allowAllies||a.side!==from.side));
 if(blocked(to.x,to.y,true))return null;
 const key=(x,y)=>`${x},${y}`,queue=[{x:from.x,y:from.y}],seen=new Map([[key(from.x,from.y),null]]);
 for(let k=0;k<queue.length;k++){const p=queue[k];if(p.x===to.x&&p.y===to.y){const out=[];let q=p;while(q.x!==from.x||q.y!==from.y){out.unshift(q);q=seen.get(key(q.x,q.y));}return out;}
 for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){if(!dx&&!dy)continue;const x=p.x+dx,y=p.y+dy;if(!openCell(map,x,y)||seen.has(key(x,y))||blocked(x,y,false))continue;
 if(dx&&dy&&(!openCell(map,p.x+dx,p.y)||!openCell(map,p.x,p.y+dy)))continue;
 seen.set(key(x,y),p);queue.push({x,y});}}
 return null;
}
export function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v)??'null';}
