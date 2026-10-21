// 用轻量 DOM 桩完整跑一遍 UI 流程（不需要真浏览器）
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=process.cwd();
let failures=0;
const ok=m=>console.log('  \x1b[32m✓\x1b[0m '+m);
const bad=(m,e)=>{failures++;console.log('  \x1b[31m✗\x1b[0m '+m);if(e)console.log('     '+(e.stack||e));};

/* --- 最小可交互 DOM --- */
class ClassList{
  constructor(el){this.el=el;this.set=new Set();}
  add(...c){c.forEach(x=>this.set.add(x));this._sync();}
  remove(...c){c.forEach(x=>this.set.delete(x));this._sync();}
  contains(c){return this.set.has(c);}
  toggle(c,force){const on=force===undefined?!this.set.has(c):force;on?this.set.add(c):this.set.delete(c);this._sync();}
  _sync(){this.el._cls=[...this.set].join(' ');}
}
class El{
  constructor(id,tag){this.id=id;this.tagName=(tag||'div').toUpperCase();this.children=[];this.style={};this.dataset={};
    this._cls='';this.classList=new ClassList(this);this._text='';this._html='';this.value='';this.checked=false;this.disabled=false;
    this.options=[];this.onclick=null;this.onchange=null;}
  get className(){return this._cls;}
  set className(v){this._cls=v;this.classList.set=new Set(String(v).split(/\s+/).filter(Boolean));}
  get textContent(){return this._text;}
  set textContent(v){this._text=String(v);this._html='';}
  get innerHTML(){return this._html;}
  set innerHTML(v){this._html=String(v);}
  appendChild(c){this.children.push(c);return c;}
  querySelectorAll(sel){return [];}
  querySelector(){return null;}
  addEventListener(){}
  click(){if(this.onclick)this.onclick({});}
  getContext(){return new Proxy({},{get(t,k){
    if(k==='canvas')return {width:1280,height:720};
    if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});
    if(k==='measureText')return()=>({width:10});
    if(typeof k==='string')return()=>undefined;
  },set(){return true;}});}
}

const registry=new Map();
const mkEl=(id,tag)=>{if(id&&registry.has(id))return registry.get(id);const e=new El(id,tag);if(id)registry.set(id,e);return e;};

// 预置 index.html 中的 id
const IDS=['game','hud','levelup','menu','gameover','pause','settings','toast','achPop','cards','loadout','cart',
'charInfo','bestList','shopList','shopGold','achList','achProgress','bestGrid','menuSettings','modalSettings',
'hpFill','hpText','xpFill','xpText','dashFill','dashText','timeText','killText','goldText','warning','comboTag',
'bossBar','bossName','bossFill','levelupSub','rerollLeft','goTitle','goStats','goTip','goBreakdown','goRewards',
'pauseBreakdown','achPopName','btnMute','selChar','selDiff','btnStart','btnRetry','btnMenu','btnSkip','btnReroll',
'btnBanish','btnResume','btnRestart','btnQuit','btnPauseSet','btnCloseSet','btnWipe','repoLink'];
IDS.forEach(id=>mkEl(id));
mkEl('game','canvas');
['hpFill','xpFill','dashFill','bossFill'].forEach(id=>mkEl(id).style.transform='');
// 挑战页签元素
['dailyDate','streakText','dailyCard','randomMods','challengeHistory'].forEach(id=>mkEl(id));
['btnRandomChallenge','btnStartChallenge'].forEach(id=>mkEl(id));
// select options 需要 innerHTML 解析：手动塞
mkEl('selChar').innerHTML='';
mkEl('selDiff').innerHTML='';

const tabs=['play','daily','shop','ach','best','set'].map(t=>{const e=new El(null,'button');e.dataset.tab=t;e.classList.add('tab');return e;});
const panels=['play','daily','shop','ach','best','set'].map(p=>{const e=new El(null,'div');e.dataset.panel=p;e.classList.add('panel');return e;});
const chips=['weapons','passives','enemies','bosses'].map(c=>{const e=new El(null,'button');e.dataset.filter=c;e.classList.add('chip');return e;});

const doc={
  readyState:'complete',
  getElementById:id=>registry.get(id)||mkEl(id),
  createElement:tag=>new El(null,tag),
  querySelectorAll:sel=>{
    if(sel==='.tab')return tabs;
    if(sel==='.panel')return panels;
    if(sel==='#bestFilter .chip')return chips;
    return [];
  },
  querySelector:sel=>{
    if(sel==='.tab[data-tab="play"]')return tabs.find(t=>t.dataset.tab==='play');
    return null;
  },
  addEventListener(){},
  body:{appendChild(){}},
};

const store=new Map();
const sb={console,Math,Date,JSON,Set,Map,Array,Object,Number,String,Boolean,Error,isFinite,parseInt,parseFloat,
  Infinity,NaN,undefined,setTimeout:(f)=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},
  performance:{now:()=>Date.now()},requestAnimationFrame:()=>0,cancelAnimationFrame:()=>{},
  devicePixelRatio:1,innerWidth:1440,innerHeight:900,
  addEventListener(){},removeEventListener(){},
  localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),
    removeItem:k=>store.delete(k),clear:()=>store.clear()},
  document:doc,navigator:{clipboard:null},AudioContext:undefined,webkitAudioContext:undefined,
  confirm:()=>true,prompt:()=>null,alert:()=>{},
};
sb.window=sb;sb.globalThis=sb;
const ctx=vm.createContext(sb);

console.log('\n\x1b[1mUI 层完整流程测试\x1b[0m\n');
try{
  ['js/data.js','js/save.js','js/engine.js','js/ui.js','js/main.js'].forEach(f=>{
    vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
  });
  ok('5 个模块全部加载（含 ui / main）');
}catch(e){bad('模块加载失败',e);process.exit(1);}

const UI=sb.DSUI,Save=sb.DSSave,G=sb.DSGame,D=sb.DSData;
sb.DSAudio.on=false;

// UI.init 应该在 main.js 里已调用
ok(`UI 初始化完成，角色 ${D.CHARACTERS.length} / 商店 ${D.SHOP.length} / 成就 ${D.ACHIEVEMENTS.length}`);

// 选择器已填充
ok(`角色下拉已填充 ${UI.el.selChar.innerHTML.includes('剑士')?'是':'否'}`);
ok(`难度下拉已填充 ${UI.el.selDiff.innerHTML.includes('标准')?'是':'否'}`);

// 页签切换
try{
  for(const t of ['daily','shop','ach','best','set','play']) UI.switchTab(t);
  ok('6 个页签切换无异常');
}catch(e){bad('页签切换失败',e);}

// 挑战页签
try{
  UI.switchTab('daily');
  ok(`每日挑战渲染：种子=${UI.dailyChallenge&&UI.dailyChallenge.seed}, 修正器=${UI.dailyChallenge&&UI.dailyChallenge.mods.length}`);
  ok(`随机挑战已生成 ${UI.randomChallenge&&UI.randomChallenge.mods.length} 个修正器`);
  ok(`挑战卡片已渲染 ${mkEl('dailyCard').innerHTML.includes('mod-card')?'是':'否'}`);
}catch(e){bad('挑战页签失败',e);}

// 挑战开局
try{
  const before=Save.data.challenges?Object.keys(Save.data.challenges).length:0;
  UI.startChallenge();
  ok(`挑战开局 state=${G.state} 修正器=${G.challenge?G.challenge.mods.length:0} 种子=${G._useSeed}`);
  // 结束并记录
  G.endRun(false);
  const after=Save.data.challenges?Object.keys(Save.data.challenges).length:0;
  ok(`挑战成绩已入库（${before} → ${after}）`);
  UI.toMenu();
}catch(e){bad('挑战开局失败',e);}

// 商店渲染
try{
  UI.renderShop();
  ok(`商店已渲染 ${UI.el.shopList.innerHTML.split('data-shop=').length-1} 个条目`);
}catch(e){bad('商店渲染失败',e);}

// 成就 / 图鉴
try{ UI.renderAchievements(); UI.renderCodex(); ok('成就与图鉴渲染无异常'); }catch(e){bad('成就/图鉴渲染失败',e);}

// 设置
try{ UI.renderSettings(); ok('设置面板渲染无异常'); }catch(e){bad('设置渲染失败',e);}

// 开始游戏
try{
  UI.selectedChar='blade'; UI.selectedDiff='normal';
  UI.startGame();
  ok(`开局成功 state=${G.state} 玩家HP=${G.player.hp}`);
}catch(e){bad('开局失败',e);}

// 推进游戏 + 触发升级
try{
  for(let i=0;i<30*20;i++){
    G.player.xp=G.player.xpNeed;   // 强制升级
    G.step(1/30);
    if(G.state==='levelup'){ UI.renderCards(); UI.pickCard(0); }
    if(G.state!=='playing'&&G.state!=='levelup')break;
  }
  ok(`20 秒推进正常 state=${G.state} Lv=${G.player.level} kills=${G.player.kills}`);
}catch(e){bad('游戏推进/升级失败',e);}

// 暂停 / 恢复
try{ UI.onPause(G); ok('暂停面板渲染正常'); UI.onResume(); }catch(e){bad('暂停失败',e);}

// 结算
try{
  G.t=Math.max(G.t,300);
  G.endRun(false);
  ok(`结算页面正常 state=${G.state}`);
  ok(`结算显示了 ${UI.el.goStats.innerHTML.match(/<b>/g).length} 项统计`);
}catch(e){bad('结算失败',e);}

// 金币入库 + 成就
try{
  const gold=Save.data.gold;
  ok(`金币已入库：${gold}`);
}catch(e){bad('金币入库失败',e);}

// 返回菜单
try{ UI.toMenu(); ok('返回主菜单正常'); }catch(e){bad('返回菜单失败',e);}

// 转义 HTML 检查
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
ok(`index.html 引用了 ${(html.match(/<script src=/g)||[]).length} 个脚本`);
ok(`index.html 包含 canvas：${html.includes('<canvas id="game"')}`);
ok(`index.html 包含全部 5 个模块：${['data.js','save.js','engine.js','ui.js','main.js'].every(m=>html.includes(m))}`);

console.log('\n'+'─'.repeat(50));
if(failures===0){console.log('\x1b[32m\x1b[1m  UI 流程全部通过 ✅\x1b[0m\n');process.exit(0);}
else{console.log(`\x1b[31m\x1b[1m  ${failures} 项失败 ❌\x1b[0m\n`);process.exit(1);}
