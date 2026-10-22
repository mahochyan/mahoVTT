import {newGame} from '../dist/world.js';
import {resolve,resolvePlan,tacticalPlan,activeId} from '../dist/engine/engine.js';
import {pathfind,distance,terrainOpen,canStep} from '../dist/engine/grid.js';
import {seededRng} from '../dist/engine/dice.js';
export function fullAdventure(seed=73,onCommit=()=>{},profile={}){
 let s=newGame(profile.name||'验收：无声钟塔',profile.playerName||'验收旅人'),steps=0;const rng=seededRng(seed);
 const apply=(c,source='player')=>{const before=s;const r=resolve(s,c,source,rng);s=r.state;steps++;onCommit(before,r);if(steps>1200)throw new Error('冒险超过步数上限');};
 const fight=()=>{let rounds=0;while(s.combat&&s.status==='playing'){if(rounds++>200)throw new Error('战斗卡住 '+JSON.stringify(s.combat));const id=activeId(s);const source=id==='pc'?'player':'auto';const before=s;const r=resolvePlan(s,tacticalPlan(s,id),source,rng);s=r.state;steps++;onCommit(before,r);}if(s.status==='defeat')throw new Error('队伍被击败 seed='+seed);};
 const approach=id=>{for(let guard=0;guard<100;guard++){fight();const pc=s.actors.find(a=>a.id==='pc'),o=s.objects.find(o=>o.id===id);if(distance(pc,o)<=1&&(!(pc.x!==o.x&&pc.y!==o.y)||(terrainOpen(s,{x:pc.x,y:o.y})&&terrainOpen(s,{x:o.x,y:pc.y}))))return;
   const planning=structuredClone(s);for(const d of planning.objects)if(d.kind==='door')d.open=true;
   let routes=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){if(!dx&&!dy)continue;const p={x:o.x+dx,y:o.y+dy};if(!terrainOpen(planning,p))continue;if(dx&&dy&&(!terrainOpen(planning,{x:o.x,y:p.y})||!terrainOpen(planning,{x:p.x,y:o.y})))continue;const path=pathfind(planning,pc,p);if(path)routes.push(path);}
   routes.sort((a,b)=>a.length-b.length);const path=routes.find(p=>p.length);if(!path)throw new Error('无法抵达 '+id+' at '+pc.x+','+pc.y);
   let segment=path.slice(0,6);const doorIndex=segment.findIndex(p=>s.objects.some(d=>d.kind==='door'&&!d.open&&d.x===p.x&&d.y===p.y));
   if(doorIndex===0){const d=s.objects.find(d=>d.kind==='door'&&!d.open&&d.x===segment[0].x&&d.y===segment[0].y);apply({type:'interact',actorId:'pc',targetId:d.id,interactionId:'force'});continue;}
   if(doorIndex>0)segment=segment.slice(0,doorIndex);
   while(segment.length&&s.actors.some(a=>a.id!=='pc'&&a.hp>0&&a.x===segment.at(-1).x&&a.y===segment.at(-1).y))segment.pop();
   if(!segment.length)throw new Error('队友堵住路径 '+id);
   apply({type:'move',actorId:'pc',path:segment});
  }throw new Error('导航循环 '+id);};
 const interact=(id,interactionId)=>{approach(id);apply({type:s.objects.find(o=>o.id===id).kind==='npc'?'talk':'interact',actorId:'pc',targetId:id,...(interactionId?{interactionId}:{})});fight();};
 interact('ileya');interact('supply');interact('store_chest');interact('ledger');interact('inscription');interact('migu');interact('altar','calibrate');interact('altar','take_key');interact('ileya');
 return {state:s,steps};
}
