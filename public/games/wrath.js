const BASE='/api/games/wrath-d6-experiment';
const $=s=>document.querySelector(s);
let state=null,sessionId=null,busy=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(text,bad=false){const el=$('#toast');el.textContent=text;el.style.cssText=`position:fixed;bottom:20px;right:20px;background:${bad?'#6a3839':'#2a4b51'};color:white;padding:13px;border-radius:10px;max-width:380px;z-index:4`;clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.textContent='',4200);}
async function api(url,method='GET',payload){const r=await fetch(BASE+url,{method,headers:{'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});const data=await r.json();if(!r.ok)throw new Error(data.error?.message||`HTTP ${r.status}`);return data;}
const occupied=(x,y)=>state?.actors.find(a=>a.x===x&&a.y===y&&a.wounds<a.maxWounds);
async function loadHall(){busy=false;sessionId=null;state=null;$('#select').classList.remove('hidden');$('#play').classList.add('hidden');
  try{const [games,saves]=await Promise.all([api(''),api('/sessions')]);
    $('#class').innerHTML=games.archetypes.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}：${esc(x.description)}</option>`).join('');
    $('#lore').innerHTML=games.world.public.map(x=>`<p>${esc(x)}</p>`).join('');
    $('#saves').innerHTML=saves.sessions.length?saves.sessions.map(s=>`<div class="save"><h3>${esc(s.title)}</h3><p>第 ${s.round} 轮 · v${s.version} · ${s.status==='playing'?'进行中':s.status==='victory'?'成功':'失败'}</p><button data-open="${esc(s.id)}">继续游戏</button></div>`).join(''):'<p class="muted">还没有独立副本存档。</p>';
  }catch(err){notify(err.message,true);}}
function actorView(a){const percent=Math.max(0,100*(a.maxWounds-a.wounds)/a.maxWounds);return `<div class="actor"><strong>${esc(a.name)}<small>${esc(a.role)}</small></strong><div class="hp ${a.side==='enemy'?'hostile':''}"><span style="width:${percent}%"></span></div><div class="small muted">创伤 ${a.wounds}/${a.maxWounds} · 防御 ${a.defense} · ${esc(a.weapon)}</div></div>`;}
function render(){if(!state)return;$('#select').classList.add('hidden');$('#play').classList.remove('hidden');$('#session-title').textContent=state.title;
  $('#round').textContent=`第 ${state.round} 轮 · 状态版本 ${state.version} · ${state.status==='playing'?'正在探索':state.status==='victory'?'任务完成':'任务失败'}`;
  $('#party').innerHTML=state.actors.filter(a=>a.side==='party').map(actorView).join('');
  $('#objectives').innerHTML=`<p>${state.flags.cache?'✅':'◻'} 扫描缓存 C，找到故障记录</p><p>${state.flags.relay?'✅':'◻'} 启动中继 T，完成任务</p>`;
  $('#glory').innerHTML=`<span class="tag">Glory：${state.glory} / 6</span>`;
  const icons={pc:'★','ally-scout':'侦','ally-medic':'医','raider-1':'敌','raider-2':'敌'};
  $('#board').innerHTML=state.map.map((line,y)=>[...line].map((char,x)=>{
    const actor=occupied(x,y),terrain=char==='#'?'wall':char==='D'?'door':char==='C'?'cache':char==='T'?'relay':'floor';
    const who=actor?(actor.side==='enemy'?'enemy':actor.id==='pc'?'pc':'ally'):'';
    return `<button type="button" class="cell ${terrain} ${who}" data-x="${x}" data-y="${y}" aria-label="${actor?esc(actor.name):`格子 ${x},${y}`}" title="${actor?esc(actor.name):`${x},${y}`}" ${char==='#'||state.status!=='playing'?'disabled':''}>${actor?`<span class="pawn">${icons[actor.id]||'●'}</span>`:char==='C'||char==='T'||char==='D'?char:''}</button>`;
  }).join('')).join('');
  $('#event-list').innerHTML=(state.lastEvents||[]).slice().reverse().map(e=>`<div class="event">${esc(e.text)}${e.roll?`<div class="roll">D6 [${e.roll.dice.join(', ')}] · Wrath ${e.roll.wrathDie} · ${e.roll.icons} Icons / DN${e.roll.dn}</div>`:''}</div>`).join('')||'<p class="muted">本次尚无行动。</p>';
  $('#banner').classList.toggle('hidden',state.status==='playing');$('#banner').textContent=state.status==='victory'?'通讯恢复成功，任务完成！':'小队已无法继续行动。';
  for(const btn of ['#cache','#relay','#end'])$(btn).disabled=busy||state.status!=='playing';
}
async function openSession(id){try{const d=await api('/sessions/'+id);sessionId=id;state=d.state;$('#narrative').textContent='你的小队进入了一个独立的 D6 副本。点击地图开始探索。';render();}catch(err){notify(err.message,true);}}
async function action(command){if(!sessionId||busy||state?.status!=='playing')return;busy=true;render();const id=(globalThis.crypto?.randomUUID?.()||String(Date.now())+String(Math.random()).slice(2));
  try{const d=await api(`/sessions/${sessionId}/commands`,'POST',{requestId:'ui-'+id,expectedVersion:state.version,command});state=d.state;render();await dm();}
  catch(err){notify(err.message,true);try{const d=await api('/sessions/'+sessionId);state=d.state;}catch{}render();}
  finally{busy=false;render();}}
async function dm(question=''){if(!sessionId)return;const ver=state.version;$('#narrative').textContent='主持人整理刚才的行动……';
  try{const d=await api(`/sessions/${sessionId}/narrate`,'POST',{expectedVersion:ver,question});if(state.version===d.stateVersion)$('#narrative').textContent=d.text+(d.source==='model'?'':'\n（规则事实播报）');}
  catch(err){if(state.version===ver)$('#narrative').textContent='主持人暂时离线，但已经结算的动作保存在数据库。';notify(err.message,true);}}
$('#create').addEventListener('submit',async ev=>{ev.preventDefault();const fd=new FormData(ev.target);try{const d=await api('/sessions','POST',{name:fd.get('name'),classId:fd.get('classId')});sessionId=d.state.id;state=d.state;render();}catch(err){notify(err.message,true);}});
$('#saves').addEventListener('click',ev=>{const id=ev.target.closest('[data-open]')?.dataset.open;if(id)openSession(id);});
$('#return').addEventListener('click',loadHall);
$('#board').addEventListener('click',ev=>{const tile=ev.target.closest('[data-x]');if(!tile||!state||busy)return;const x=Number(tile.dataset.x),y=Number(tile.dataset.y),a=occupied(x,y);
  if(a?.side==='enemy')action({type:'attack',targetId:a.id});else if(a?.id==='pc')notify('这是你的棋子。');else if(!a)action({type:'move',x,y});else notify('不能移动至已经有队友的位置。');});
$('#cache').addEventListener('click',()=>action({type:'interact',targetId:'cache'}));
$('#relay').addEventListener('click',()=>action({type:'interact',targetId:'relay'}));
$('#end').addEventListener('click',()=>action({type:'end_turn'}));
$('#load').addEventListener('click',()=>openSession(sessionId));
$('#ask').addEventListener('submit',async ev=>{ev.preventDefault();if(!sessionId)return notify('请先进入战役。');const fd=new FormData(ev.target);await dm(String(fd.get('question')||''));});
$('#export').addEventListener('click',async()=>{if(!sessionId)return;try{const data=await api(`/sessions/${sessionId}/export`);const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`blackwell-${sessionId.slice(0,8)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(err){notify(err.message,true);}});
loadHall();
