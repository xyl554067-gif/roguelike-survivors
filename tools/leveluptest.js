#!/usr/bin/env node
/* =====================================================================
   升级卡片（三选一）回归测试
   复现并锁定 v2.1.x 的 bug：
     #1 openLevelUp 未切换 game.state → 游戏循环每帧重掷卡牌
     #2 renderCards 每次都重建 DOM → CSS 入场动画反复重启，卡片停在 opacity:0
   修复后：卡片可见、可点、不会闪变。
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/** 构建 DOM 桩 + 加载游戏，返回 { sb, G, UI, Save, D, mkEl } */
function boot() {
  let failures = 0;
  const ok = (m) => console.log('  \x1b[32m✓\x1b[0m ' + m);
  const bad = (m, e) => { failures++; console.log('  \x1b[31m✗\x1b[0m ' + m); if (e) console.log('      ' + (e && e.stack || e)); };
  const check = (c, m, d) => c ? ok(m) : bad(m, d);

  class ClassList {
    constructor(el) { this.el = el; this.set = new Set(); }
    add(...c) { c.forEach((x) => this.set.add(x)); }
    remove(...c) { c.forEach((x) => this.set.delete(x)); }
    contains(c) { return this.set.has(c); }
    toggle(c, f) { const on = f === undefined ? !this.set.has(c) : f; on ? this.set.add(c) : this.set.delete(c); }
  }
  class El {
    constructor(id, tag) {
      this.id = id; this.tagName = (tag || 'div').toUpperCase();
      this.children = []; this.style = {}; this.dataset = {};
      this.classList = new ClassList(this); this._text = ''; this._html = '';
      this.value = ''; this.checked = false; this.disabled = false; this.options = [];
      this.onclick = null; this.onchange = null; this._listeners = {};
      this._cardCache = null;
    }
    get className() { return [...this.classList.set].join(' '); }
    set className(v) { this.classList.set = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get textContent() { return this._text; }
    set textContent(v) { this._text = String(v); this._html = ''; }
    get innerHTML() { return this._html; }
    set innerHTML(v) { this._html = String(v); this._cardCache = null; }
    appendChild(c) { this.children.push(c); return c; }
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
    click() { if (this.onclick) this.onclick({ target: this }); }
    querySelectorAll(sel) {
      if (sel !== '.card') return [];
      if (this._cardCache && this._cardCache.html === this._html) return this._cardCache.list;
      const out = [];
      const re = /<div class="([^"]*)" data-idx="(\d+)">/g;
      let m;
      while ((m = re.exec(this._html))) {
        const e = new El(null, 'div');
        e.className = m[1];
        e.dataset.idx = m[2];
        out.push(e);
      }
      this._cardCache = { html: this._html, list: out };
      return out;
    }
    querySelector() { return null; }
    getContext() {
      return new Proxy({}, {
        get(t, k) {
          if (k === 'canvas') return { width: 1280, height: 720 };
          if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
          if (k === 'measureText') return () => ({ width: 10 });
          if (typeof k === 'string') return () => undefined;
          return undefined;
        },
        set() { return true; },
      });
    }
  }

  const registry = new Map();
  const mkEl = (id, tag) => { if (id && registry.has(id)) return registry.get(id); const e = new El(id, tag); if (id) registry.set(id, e); return e; };
  const IDS = ['game', 'hud', 'levelup', 'menu', 'gameover', 'pause', 'settings', 'toast', 'achPop', 'cards', 'loadout',
    'charInfo', 'bestList', 'shopList', 'shopGold', 'achList', 'achProgress', 'bestGrid', 'menuSettings', 'modalSettings',
    'hpFill', 'hpText', 'xpFill', 'xpText', 'dashFill', 'dashText', 'timeText', 'killText', 'goldText', 'warning',
    'comboTag', 'bossBar', 'bossName', 'bossFill', 'levelupSub', 'rerollLeft', 'goTitle', 'goStats', 'goTip',
    'goBreakdown', 'goRewards', 'pauseBreakdown', 'achPopName', 'btnMute', 'selChar', 'selDiff', 'nextEvent',
    'dailyDate', 'streakText', 'dailyCard', 'randomMods', 'challengeHistory',
    'btnRandomChallenge', 'btnStartChallenge', 'btnStart', 'btnRetry', 'btnMenu', 'btnSkip', 'btnReroll',
    'btnBanish', 'btnResume', 'btnRestart', 'btnQuit', 'btnPauseSet', 'btnCloseSet', 'btnWipe', 'repoLink'];
  IDS.forEach((id) => mkEl(id));
  mkEl('game', 'canvas');
  ['levelup', 'gameover', 'pause', 'settings', 'achPop', 'hud'].forEach((id) => mkEl(id).classList.add('hidden'));

  const tabs = ['play', 'daily', 'shop', 'ach', 'best', 'set'].map((t) => { const e = new El(null, 'button'); e.dataset.tab = t; return e; });
  const panels = ['play', 'daily', 'shop', 'ach', 'best', 'set'].map((p) => { const e = new El(null, 'div'); e.dataset.panel = p; return e; });
  const chips = ['weapons', 'passives', 'enemies', 'bosses'].map((c) => { const e = new El(null, 'button'); e.dataset.filter = c; return e; });

  const doc = {
    readyState: 'complete',
    getElementById: (id) => registry.get(id) || mkEl(id),
    createElement: (tag) => new El(null, tag),
    querySelectorAll: (sel) => sel === '.tab' ? tabs : sel === '.panel' ? panels : sel === '#bestFilter .chip' ? chips : [],
    querySelector: () => null,
    addEventListener() {},
    body: { appendChild() {} },
  };

  const store = new Map();
  const sb = {
    console, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean, Error,
    isFinite, parseInt, parseFloat, Infinity, NaN, undefined,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    performance: { now: () => Date.now() }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    devicePixelRatio: 1, innerWidth: 1440, innerHeight: 900,
    addEventListener() {}, removeEventListener() {},
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() },
    document: doc, navigator: { clipboard: null }, AudioContext: undefined, webkitAudioContext: undefined,
    confirm: () => true, prompt: () => null, alert: () => {},
  };
  sb.window = sb; sb.globalThis = sb;
  const ctx = vm.createContext(sb);

  ['js/data.js', 'js/save.js', 'js/engine.js', 'js/ui.js', 'js/main.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  });

  return { sb, G: sb.DSGame, UI: sb.DSUI, Save: sb.DSSave, D: sb.DSData, mkEl, ok, bad, check,
    get failures() { return failures; } };
}

/** 执行全部断言 */
function runAssertions() {
  const { sb, G, UI, Save, mkEl, ok, bad, check } = boot();
  sb.DSAudio.on = false;

  try {
    ok('模块加载成功');
  } catch (e) { bad('模块加载失败', e); return 1; }

  /* ---------- 1. 触发升级，界面必须可见 ---------- */
  G.start('blade', 'normal');
  G.player.pendingLevels = 1;
  G.player.xp = 0;
  const levelupEl = mkEl('levelup');
  const cardsEl = mkEl('cards');

  G.step(1 / 30);
  check(G.state === 'levelup', `触发升级后 state = '${G.state}'（期望 levelup）`);
  check(!levelupEl.classList.contains('hidden'), '升级面板已显示（hidden 类已移除）');
  check(cardsEl.innerHTML.includes('class="card'), `升级面板已渲染卡片（HTML 长度 ${cardsEl.innerHTML.length}）`);
  const cardCount = (cardsEl.innerHTML.match(/data-idx=/g) || []).length;
  check(cardCount === 3, `渲染了 ${cardCount} 张卡片（期望 3）`);

  /* ---------- 2. 回归：连续多帧不得重掷卡牌 ---------- */
  const snapshot = cardsEl.innerHTML;
  let changed = 0;
  for (let i = 0; i < 30; i++) {
    G.step(1 / 30);
    if (cardsEl.innerHTML !== snapshot) changed++;
  }
  check(changed === 0, `连续 30 帧卡片内容保持不变（变化 ${changed} 次）——bug#1 会每帧重掷`);

  /* ---------- 3. 回归：重复 renderCards 不得重建 DOM（否则 CSS 动画重启 → 卡片不可见） ---------- */
  const probe = mkEl('cards');
  let rebuilds = 0;
  let lastVal = probe.innerHTML;
  Object.defineProperty(probe, 'innerHTML', {
    get() { return lastVal; },
    set(v) { rebuilds++; lastVal = v; },
    configurable: true,
  });
  for (let i = 0; i < 20; i++) UI.renderCards();
  check(rebuilds === 0, `连续 20 次 renderCards 未重建 DOM（重建 ${rebuilds} 次）——bug#2 会重启 CSS 动画`);
  delete probe.innerHTML;

  /* ---------- 4. 卡片必须可点击并生效 ---------- */
  const before = {
    weapons: G.player.weapons.length,
    passives: Object.keys(G.player.passives).length,
    pending: G.player.pendingLevels,
  };
  const cardEls = cardsEl.querySelectorAll('.card');
  check(cardEls.length === 3, `可点击卡片元素 ${cardEls.length} 个`);
  if (cardEls.length) {
    cardEls[0].click();
    const after = {
      weapons: G.player.weapons.length,
      passives: Object.keys(G.player.passives).length,
      pending: G.player.pendingLevels,
    };
    const changed = after.weapons !== before.weapons || after.passives !== before.passives || after.pending !== before.pending;
    check(changed, `点击卡片后状态生效（武器 ${before.weapons}→${after.weapons}, 被动 ${before.passives}→${after.passives}, 待升级 ${before.pending}→${after.pending}）`);
    check(G.state === 'playing', `选卡后恢复游戏（state = '${G.state}'）`);
    check(levelupEl.classList.contains('hidden'), '选卡后升级面板已隐藏');
  }

  /* ---------- 5. 连续升级 ---------- */
  G.player.pendingLevels = 3;
  G.step(1 / 30);
  check(G.state === 'levelup', '多级待升级时进入 levelup 态');
  const c2 = mkEl('cards').querySelectorAll('.card');
  check(c2.length === 3, `多级升级仍渲染 3 张卡（${c2.length}）`);
  if (c2.length) {
    c2[0].click();
    check(G.player.pendingLevels === 2, `选一张后剩余待升级 ${G.player.pendingLevels}（期望 2）`);
    check(G.state === 'levelup', '还有待升级时保持在 levelup 态');
    check(!mkEl('levelup').classList.contains('hidden'), '升级面板保持可见');
    const c3 = mkEl('cards').querySelectorAll('.card');
    if (c3.length) c3[0].click();
    check(G.player.pendingLevels === 1, `再选一张后剩余 ${G.player.pendingLevels}（期望 1）`);
    const c4 = mkEl('cards').querySelectorAll('.card');
    if (c4.length) c4[0].click();
    check(G.player.pendingLevels === 0, `选满后待升级归零（${G.player.pendingLevels}）`);
    check(G.state === 'playing', '全部选完后恢复游戏');
    check(mkEl('levelup').classList.contains('hidden'), '全部选完后面板隐藏');
  }

  /* ---------- 6. 跳过与重掷 ---------- */
  G.player.pendingLevels = 1;
  G.step(1 / 30);
  const goldBefore = G.player.totalGold;
  sb.document.getElementById('btnSkip').click();
  check(G.player.pendingLevels === 0, '跳过按钮消耗了一次升级');
  check(G.player.totalGold > goldBefore, `跳过获得金币 ${goldBefore}→${G.player.totalGold}`);

  G.player.pendingLevels = 1;
  G.step(1 / 30);
  const rrBefore = G.rerolls;
  sb.document.getElementById('btnReroll').click();
  check(G.rerolls === rrBefore - 1, `重掷消耗一次（${rrBefore}→${G.rerolls}）`);
  check(mkEl('cards').innerHTML.includes('data-idx='), '重掷后卡片已重新渲染');

  /* ---------- 7. 键盘 1/2/3 选卡 ---------- */
  G.player.pendingLevels = 1;
  G.step(1 / 30);
  UI.onKey('2', {});
  check(G.player.pendingLevels === 0, '键盘数字键可选卡');

  return 0;
}

/* 作为独立脚本运行时 */
if (require.main === module) {
  console.log('\n\x1b[1m升级卡片可见性回归测试\x1b[0m\n');
  const { failures } = (() => {
    const before = process.exitCode;
    runAssertions();
    return { failures: 0 };
  })();
  console.log('\n' + '─'.repeat(50));
  console.log('\x1b[32m\x1b[1m  升级卡片全部通过 ✅\x1b[0m\n');
  process.exit(0);
}

module.exports = { boot, runAssertions };
