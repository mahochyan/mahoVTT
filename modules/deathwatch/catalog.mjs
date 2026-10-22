/** Small, independently encoded mechanical catalogue. Book prose/art is not bundled. */
export const MODULE_ID='deathwatch-d100';
export const RULESET='deathwatch-core-2010-errata1.1/preview1';
export const ATTRS={ws:'武器技巧',bs:'射击技巧',s:'力量',t:'坚韧',ag:'敏捷',int:'智力',per:'感知',wp:'意志',fel:'交涉'};
export const CHAPTERS=[
 {id:'ultramarines',name:'极限战士',en:'Ultramarines',mods:{},choice:true,solo:'Favoured Son',ref:'Core p.54',note:'两项不同属性各 +5；担任领队时凝聚力 +1。'},
 {id:'blood-angels',name:'圣血天使',en:'Blood Angels',mods:{ws:5,ag:5},solo:'Blood Frenzy',ref:'Core p.43',note:'WS +5，Ag +5。'},
 {id:'dark-angels',name:'暗黑天使',en:'Dark Angels',mods:{bs:5,int:5},solo:'Stoic Defence',ref:'Core p.46',note:'BS +5，Int +5。'},
 {id:'space-wolves',name:'太空野狼',en:'Space Wolves',mods:{per:5,fel:5},ban:['apothecary'],solo:'Wolf Senses',ref:'Core p.49; Errata p.2',note:'Per +5，Fel +5；不能选药剂师。'},
 {id:'black-templars',name:'黑色圣堂',en:'Black Templars',mods:{ws:5,wp:5},ban:['librarian','devastator'],solo:'Righteous Zeal',ref:'Core p.40',note:'WS +5，WP +5；不能选智库或毁灭者。'},
 {id:'storm-wardens',name:'风暴守卫',en:'Storm Wardens',mods:{s:5},wounds:2,solo:'Thunder’s Call',ref:'Core p.52',note:'S +5，初始 Wounds +2。'},
];
const LOW=[200,500,1000,1500],MID=[500,1000,1500,2000],HIGH=[750,1500,2000,5000];
export const SPECIALTIES=[
 {id:'tactical',name:'战术陆战队员',en:'Tactical Marine',ref:'Core p.84–87',gear:['bolter'],skills:['command'],options:[['bolter-mastery','爆矢精通','auto'],['tactical-expertise','战术专长','gm']],low:['wp','fel'],high:[]},
 {id:'assault',name:'突击陆战队员',en:'Assault Marine',ref:'Core p.72–75',gear:['chainsword'],skills:['pilot'],talents:['swift-attack'],options:[['wrathful-descent','愤怒降临','auto'],['wings-of-angels','天使之翼','gm']],low:['ws','s','ag','per'],high:['bs','int','wp']},
 {id:'devastator',name:'毁灭者陆战队员',en:'Devastator Marine',ref:'Core p.76–79; Errata p.2',gear:['heavy-bolter'],skills:[],options:[['unrelenting','无情毁灭','auto'],['immovable','不动战士','auto']],low:['bs','s','per'],high:['ws','ag','int']},
 {id:'apothecary',name:'药剂师',en:'Apothecary',ref:'Core p.68–71',gear:['bolter'],skills:['medicae'],options:[['enhance-healing','强化治疗','auto'],['purity','纯净守护','gm'],['toxins','制备毒素','gm']],low:['ws','int','per'],high:[]},
 {id:'librarian',name:'智库',en:'Librarian',ref:'Core p.80–83',gear:['bolter','force-sword'],skills:['psyniscience'],options:[['battle-psyker','战斗灵能者','partial']],low:['ws','int','per','wp'],high:['bs','ag','fel']},
 {id:'techmarine',name:'技术军士',en:'Techmarine',ref:'Core p.88–91',gear:['bolter'],skills:['tech'],options:[['improve-cover','强化掩体','auto']],low:['s','t','int'],high:['ag','wp','fel']},
];
export function advanceCost(spec,attr,level=0){const s=SPECIALTIES.find(s=>s.id===spec);return (s.low.includes(attr)?LOW:s.high.includes(attr)?HIGH:MID)[level];}
export const SKILLS={
 awareness:{name:'警觉',stat:'per',basic:true},search:{name:'搜索',stat:'per',basic:true},dodge:{name:'闪避',stat:'ag',basic:true},
 athletics:{name:'攀爬',stat:'s',basic:true},command:{name:'指挥',stat:'fel',basic:true},charm:{name:'魅惑',stat:'fel',basic:true},
 intimidate:{name:'威吓',stat:'s',basic:true},inquiry:{name:'打听',stat:'fel',basic:true},concealment:{name:'隐蔽',stat:'ag',basic:true},
 silentMove:{name:'潜行',stat:'ag',basic:true},medicae:{name:'医疗',stat:'int',basic:false},tech:{name:'技术运用',stat:'int',basic:false},
 pilot:{name:'驾驶（个人装备）',stat:'ag',basic:false},psyniscience:{name:'灵能感知',stat:'per',basic:false},
 xenos:{name:'禁忌知识（异形）',stat:'int',basic:false},tactics:{name:'战术',stat:'int',basic:false},demolition:{name:'爆破',stat:'int',basic:false},
};
export const POWERS=[['smite','惩击','auto','Core p.195'],['telepathy','短程心灵感应','narrative','Core p.191'],['inspire','激励','gm','Core p.190'],['augury','占兆','gm','Core p.192'],['reading','解读气场','gm','Core p.193'],['avenger','复仇者','gm','Core p.194'],['iron-arm','铁臂','gm','Core p.194']];
export const OATHS=[
 {id:'astartes',name:'阿斯塔特誓言',leaders:['tactical','assault','devastator'],effect:'凝聚力 +2',abilities:['squad-advance','bolter-assault','tactical-spacing'],ref:'Core p.228'},
 {id:'emperor',name:'帝皇誓言',leaders:['tactical','librarian','apothecary'],effect:'意志检定 +10',abilities:['fire-for-effect','regroup','strongpoint'],ref:'Core p.229'},
 {id:'glory',name:'荣耀誓言',leaders:['tactical','assault'],effect:'参与完成的主要/次要目标额外声望 +1',abilities:['squad-advance','bolter-assault','furious-charge'],ref:'Core p.229; Errata p.5'},
 {id:'knowledge',name:'知识誓言',leaders:['librarian','apothecary','techmarine'],effect:'对指定种类敌人 WS/BS +10',abilities:['go-to-ground','dig-in','strongpoint'],ref:'Core p.229; Errata p.5'},
 {id:'loyalty',name:'忠诚誓言',leaders:['tactical','apothecary'],effect:'凝聚力挑战 +1；领队抵抗凝聚力伤害 +10',abilities:['tactical-spacing','regroup','soak-fire'],ref:'Core p.229'},
 {id:'weapon',name:'武器誓言',leaders:['devastator','techmarine'],effect:'忽略武器卡壳；近战正义之怒确认可重掷',abilities:['fire-support','fire-for-effect','tank-buster'],ref:'Core p.230'},
];
export const SQUAD_ABILITIES=[
 {id:'bolter-assault',name:'爆矢突袭',cost:3,action:0,sustain:false,automation:'gm',ref:'Core p.221',note:'队伍额外冲锋/射击需依次选择目标，当前进入裁定助手。'},
 {id:'squad-advance',name:'小队推进',cost:1,action:1,sustain:true,automation:'gm',ref:'Core p.221'},
 {id:'fire-for-effect',name:'效力射击',cost:2,action:1,sustain:true,automation:'gm',ref:'Core p.221'},
 {id:'fire-support',name:'火力支援',cost:1,action:1,sustain:true,automation:'gm',ref:'Core p.221'},
 {id:'furious-charge',name:'狂怒冲锋',cost:3,action:0,sustain:false,automation:'gm',ref:'Core p.221'},
 {id:'tank-buster',name:'破甲协作',cost:1,action:0,sustain:false,automation:'gm',ref:'Core p.221'},
 {id:'go-to-ground',name:'就地隐蔽',cost:1,action:0,reaction:true,sustain:false,automation:'gm',ref:'Core p.223'},
 {id:'dig-in',name:'固守阵地',cost:3,action:2,sustain:true,automation:'gm',ref:'Core p.223'},
 {id:'regroup',name:'重新集结',cost:2,action:2,sustain:false,automation:'gm',ref:'Core p.223'},
 {id:'strongpoint',name:'支撑点',cost:3,action:2,sustain:true,automation:'partial',ref:'Core p.224',note:'自动：标记目标与 +20 WS/BS；伤害重掷/额外反应射击需要裁定。'},
 {id:'tactical-spacing',name:'战术间距',cost:1,action:2,sustain:true,automation:'auto',ref:'Core p.224',note:'队员可通过行动面板转让一项普通反应。'},
 {id:'soak-fire',name:'吸引火力',cost:2,action:0,reaction:true,sustain:false,automation:'gm',ref:'Core p.223'},
];
// Core profile is the default. Optional revised weapons are a separate explicit profile.
const weapon=(id,name,kind,range,rof,dice,add,type,pen,clip,reload,req,extra={})=>({id,name,kind,range,rof,dice,add,type,pen,clip,reload,req,renown:0,ref:'Core p.145,150,154',...extra});
export const WEAPONS={
 bolter:weapon('bolter','阿斯塔特爆矢枪','basic',100,[1,2,4],2,5,'X',5,28,2,5,{tearing:true,bolt:true}),
 'bolt-pistol':weapon('bolt-pistol','阿斯塔特爆矢手枪','pistol',30,[1,3,0],2,5,'X',5,14,2,5,{tearing:true,bolt:true}),
 'heavy-bolter':weapon('heavy-bolter','阿斯塔特重爆矢枪','heavy',150,[0,0,10],2,10,'X',6,60,2,20,{tearing:true,bolt:true}),
 chainsword:weapon('chainsword','阿斯塔特链锯剑','melee',1,[1,0,0],1,3,'R',4,0,0,5,{tearing:true,balanced:true}),
 knife:weapon('knife','阿斯塔特战斗刀','melee',1,[1,0,0],1,2,'R',2,0,0,3),
 'power-sword':weapon('power-sword','阿斯塔特动力剑','melee',1,[1,0,0],1,6,'E',6,0,0,20,{balanced:true,power:true,renown:20}),
 'force-sword':weapon('force-sword','阿斯塔特灵能力量剑','melee',1,[1,0,0],1,2,'R',2,0,0,25,{balanced:true,force:true,renown:20}),
 frag:weapon('frag','阿斯塔特破片手雷','thrown',0,[1,0,0],2,0,'X',0,1,0,1,{blast:5}),
 krak:weapon('krak','阿斯塔特破甲手雷','thrown',0,[1,0,0],3,4,'X',6,1,0,1),
 autogun:weapon('autogun','自动枪','basic',90,[1,3,10],1,3,'I',0,30,4,0,{npc:true}),
 autopistol:weapon('autopistol','自动手枪','pistol',30,[1,0,6],1,2,'I',0,18,2,0,{npc:true}),
 claws:weapon('claws','利爪','melee',1,[1,0,0],1,5,'R',5,0,0,0,{tearing:true,npc:true}),
 club:weapon('club','近战武器','melee',1,[1,0,0],1,0,'I',0,0,0,0,{primitive:true,npc:true}),
};
export function weaponProfile(id,profile='core'){const w=structuredClone(WEAPONS[id]);if(!w)return null;
 if(profile==='revised'&&w.bolt){w.dice=1;w.add=id==='heavy-bolter'?12:9;w.pen=id==='heavy-bolter'?5:4;w.rof=id==='bolter'?[1,3,0]:id==='bolt-pistol'?[1,2,0]:[0,0,6];w.ref='Living Errata 1.1 p.10 (optional appendix)';}
 return w;}
export const COVERAGE=[
 ['D100','百分骰、±60 合并修正、成功/失败程度、命中反转','auto','Core 202–204,244'],
 ['creation','6 战团/6 专长、限制、2d10+30、100 点分配、Wounds/Fate','auto','Core 25–28,40–54'],
 ['advances','四档属性升级；技能/天赋目录暂不穷尽','partial','Core 69,73,77,81,85,89'],
 ['actions','半动作/全动作、瞄准、单发/连射、冲锋、防御、装填；组合射击移动未实现','partial','Core 236–243'],
 ['reactions','闪避/格挡选择、连射闪避、范围攻击移出效果区','auto','Core 238–239'],
 ['damage','分部位护甲、穿甲、非自然坚韧、撕裂、正义之怒、True Grit','auto','Core 136,160–161,245; Errata 5'],
 ['critical','累计重伤；停在人工裁定卡，不使用假造重伤表','gm','Core 250–259'],
 ['fate','失败重掷、检定前 +10、成功程度 +1、治疗、疲劳','auto','Core 204–205'],
 ['hordes','Magnitude、爆炸额外命中、重武器毁灭、破胆、群攻','partial','Core 359–360; Errata 6'],
 ['squad','宣誓、领队、凝聚力、单兵/小队模式、战术间距','partial','Core 211–225,228–230'],
 ['psychic','惩击、抑制/无约束/推动；现象/灾变、持续灵能请求裁定','partial','Core 185–195'],
 ['medical','脱战急救、一次伤势一次急救、伤势等级、药剂师加成','partial','Core 102,173; Errata 2'],
 ['requisition','标准配发、征用预算/声望门槛、受支持武器选购','partial','Core 138–139'],
 ['chapters','战团基础加值；多数战团单兵/小队绝招提供规则引用','partial','Core 216–226'],
 ['fear','单兵模式意志惩罚；小队凝聚力伤害需裁定','partial','Core 277'],
 ['advanced','擒抱、压制/警戒、载具、升阶职业、全部扩展','gm','对应核心/扩展书'],
];
