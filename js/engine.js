/* =====================================================================
   夜刃求生 v2 · 引擎
   Canvas 渲染 / 玩家 / 敌人 / 武器 / 道具 / 战斗循环
   ===================================================================== */
(function (global) {
  'use strict';

  const D = global.DSData;
  const TAU = D.TAU;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ============================ 音效 ============================ */
  const AudioFX = {
    ctx: null, master: null, on: true, _last: {},
    init() {
      if (this.ctx) return;
      try {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.2;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); },
    tone(freq, dur, type, vol, slide) {
      if (!this.ctx || !this.on) return;
      dur = dur || 0.08; type = type || 'square'; vol = vol == null ? 0.5 : vol; slide = slide || 0;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.03);
    },
    /** 限流：同种音效 60ms 内只响一次，避免满屏噪音 */
    play(name) {
      if (!this.ctx || !this.on) return;
      const now = performance.now();
      if (this._last[name] && now - this._last[name] < 55) return;
      this._last[name] = now;
      const r = Math.random;
      switch (name) {
        case 'shoot':   this.tone(520 + r() * 200, 0.05, 'triangle', 0.28, -240); break;
        case 'swing':   this.tone(300 + r() * 90, 0.07, 'sine', 0.22, 160); break;
        case 'cast':    this.tone(360 + r() * 80, 0.1, 'triangle', 0.3, -120); break;
        case 'heavy':   this.tone(170, 0.1, 'square', 0.3, 70); break;
        case 'aura':    this.tone(220, 0.07, 'sine', 0.18); break;
        case 'thunder': this.tone(90, 0.22, 'sawtooth', 0.34, 60); break;
        case 'ice':     this.tone(1150 + r() * 250, 0.16, 'sine', 0.26, -700); break;
        case 'saw':     this.tone(150, 0.11, 'sawtooth', 0.22, 90); break;
        case 'throw':   this.tone(430, 0.08, 'triangle', 0.24, 180); break;
        case 'beam':    this.tone(880, 0.14, 'sawtooth', 0.28, 520); break;
        case 'spike':   this.tone(120, 0.09, 'square', 0.26, 110); break;
        case 'hit':     this.tone(180 + r() * 60, 0.04, 'square', 0.16, -50); break;
        case 'kill':    this.tone(110 + r() * 40, 0.1, 'sawtooth', 0.26, -50); break;
        case 'pickup':  this.tone(900 + r() * 300, 0.05, 'sine', 0.3, 220); break;
        case 'boom':    this.tone(70, 0.28, 'sawtooth', 0.5, -30); break;
        case 'hurt':    this.tone(170, 0.14, 'sawtooth', 0.4, -110); break;
        case 'dash':    this.tone(500, 0.1, 'sine', 0.22, -300); break;
        case 'chest':   [660, 880, 1180].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, 'square', 0.34), i * 80)); break;
        case 'levelup': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.13, 'square', 0.34), i * 80)); break;
        case 'evolve':  [392, 523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'triangle', 0.4), i * 70)); break;
        case 'boss':    [196, 147, 110].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'sawtooth', 0.42), i * 150)); break;
        case 'win':     [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'square', 0.4), i * 120)); break;
        case 'lose':    [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sawtooth', 0.36), i * 190)); break;
      }
    },
  };

  /* ============================ 输入 ============================ */
  const Input = {
    keys: new Set(), dashQueued: false,
    pad: { connected: false, id: '', axes: [0, 0], prevButtons: [] },
    touch: { active: false, ox: 0, oy: 0, dx: 0, dy: 0, id: null },
    init(canvas, hooks) {
      this.hooks = hooks || {};
      addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
        if (e.repeat) { this.keys.add(k); return; }
        this.keys.add(k);
        if (k === ' ' && hooks && hooks.onDash) hooks.onDash();
        if (hooks && hooks.onKey) hooks.onKey(k, e);
      });
      addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
      addEventListener('blur', () => { this.keys.clear(); if (hooks && hooks.onBlur) hooks.onBlur(); });

      // 手柄
      addEventListener('gamepadconnected', (e) => {
        this.pad.connected = true;
        this.pad.id = e.gamepad && e.gamepad.id || '';
        if (hooks && hooks.onToast) hooks.onToast('🎮 手柄已连接：' + this.pad.id.slice(0, 40));
      });
      addEventListener('gamepaddisconnected', () => {
        this.pad.connected = false;
        if (hooks && hooks.onToast) hooks.onToast('🎮 手柄已断开');
      });

      const start = (e) => {
        const t = e.touches ? e.touches[0] : e;
        this.touch.active = true; this.touch.ox = t.clientX; this.touch.oy = t.clientY;
        this.touch.dx = this.touch.dy = 0;
        if (hooks && hooks.onTouch) hooks.onTouch();
      };
      const move = (e) => {
        if (!this.touch.active) return;
        const t = e.touches ? e.touches[0] : e;
        let dx = t.clientX - this.touch.ox, dy = t.clientY - this.touch.oy;
        const m = Math.hypot(dx, dy);
        if (m > 48) { dx = dx / m * 48; dy = dy / m * 48; this.touch.ox = t.clientX - dx; this.touch.oy = t.clientY - dy; }
        this.touch.dx = dx / 48; this.touch.dy = dy / 48;
        if (e.cancelable) e.preventDefault();
      };
      const end = () => { this.touch.active = false; this.touch.dx = this.touch.dy = 0; };
      canvas.addEventListener('touchstart', start, { passive: true });
      canvas.addEventListener('touchmove', move, { passive: false });
      canvas.addEventListener('touchend', end);
      canvas.addEventListener('touchcancel', end);
      canvas.addEventListener('mousedown', start);
      addEventListener('mousemove', move);
      addEventListener('mouseup', end);
    },

    /** 每帧轮询手柄（Gamepad API 是轮询式） */
    pollGamepad(hooks) {
      if (!navigator.getGamepads) return;
      let pads;
      try { pads = navigator.getGamepads(); } catch (e) { return; }
      let gp = null;
      for (const p of pads) if (p && p.connected) { gp = p; break; }
      if (!gp) { this.pad.connected = false; return; }
      this.pad.connected = true;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const dead = 0.22;
      this.pad.axes = [Math.abs(ax) > dead ? ax : 0, Math.abs(ay) > dead ? ay : 0];
      // 按钮：0=A 冲刺, 9=Start 暂停, 8=Back 菜单, 12-15 十字键
      const btn = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
      const prev = this.pad.prevButtons;
      const edge = (i) => btn(i) && !prev[i];
      if (hooks) {
        if (edge(0) && hooks.onDash) hooks.onDash();
        if (edge(9) && hooks.onPause) hooks.onPause();
        if (edge(8) && hooks.onBack) hooks.onBack();
        if (edge(3) && hooks.onSkip) hooks.onSkip();       // Y
        if (edge(2) && hooks.onReroll) hooks.onReroll();   // X
        if (edge(12)) hooks.onNav && hooks.onNav('up');
        if (edge(13)) hooks.onNav && hooks.onNav('down');
        if (edge(14)) hooks.onNav && hooks.onNav('left');
        if (edge(15)) hooks.onNav && hooks.onNav('right');
      }
      const n = gp.buttons.length;
      this.pad.prevButtons = Array.from({ length: n }, (_, i) => btn(i));
    },

    vec() {
      let x = 0, y = 0;
      if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
      if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;
      // 手柄摇杆 / 十字键优先于键鼠（最后写入），并有死区
      if (this.pad.connected) {
        const ax = this.pad.axes[0], ay = this.pad.axes[1];
        const pb = this.pad.prevButtons;
        // 摇杆与十字键合成模拟「按键强度」，强度大的一方决定方向
        let px = (pb[14] ? -1 : 0) + (pb[15] ? 1 : 0);
        let py = (pb[12] ? -1 : 0) + (pb[13] ? 1 : 0);
        if (Math.abs(ax) > Math.abs(px)) px = ax;
        if (Math.abs(ay) > Math.abs(py)) py = ay;
        if (px || py) { x = px; y = py; }
      }
      if (this.touch.active && (this.touch.dx || this.touch.dy)) { x = this.touch.dx; y = this.touch.dy; }
      const m = Math.hypot(x, y);
      return m > 1 ? { x: x / m, y: y / m } : { x, y };
    },
  };

  /* ============================ 特效 ============================ */
  class FXPool {
    constructor(g) { this.g = g; }
    on(kind) {
      const s = this.g.settings;
      if (kind === 'particle' && !s.particles) return false;
      if (kind === 'text' && !s.damageNumbers) return false;
      return true;
    }
    text(x, y, v, color, size) {
      if (!this.on('text')) return;
      if (this.g.texts.length > 130) return;
      this.g.texts.push({ x: x + this.g.rand(-7, 7), y, v: String(v), color, size: size || 13, t: 0, life: 0.75, vy: -46 });
    }
    burst(x, y, color, n, spd) {
      if (!this.on('particle')) return;
      n = n || 8; spd = spd || 2.4;
      for (let i = 0; i < n; i++) {
        if (this.g.particles.length > D.MAX_PARTICLES) break;
        const a = this.g.rand(0, TAU), s = this.g.rand(30, 90) * spd;
        this.g.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0,
          life: this.g.rand(0.25, 0.6), r: this.g.rand(1.5, 4), color });
      }
    }
    spark(x, y) { this.burst(x, y, '#fff2a8', 5, 1.4); }
    ring(x, y, r, color) {
      if (!this.on('particle')) return;
      this.g.particles.push({ x, y, vx: 0, vy: 0, t: 0, life: 0.16, r, color, ring: true });
    }
    nova(x, y, r, color) {
      if (!this.on('particle')) return;
      this.g.novas.push({ x, y, r, c0: color, t: 0, life: 0.45 });
    }
    lightning(pts, color) { this.g.zaps.push({ pts, t: 0, life: 0.18, color: color || '#ffe066' }); }
    bolt(x, y) {
      this.g.zaps.push({ pts: [{ x, y: y - 430 }, { x: x + 9, y: y - 270 }, { x: x - 7, y: y - 130 }, { x, y }],
        t: 0, life: 0.16, thin: true, color: '#ffe066' });
    }
    marker(x, y) { this.g.markers.push({ x, y, t: 0, life: 0.55 }); }
    orbit(x, y, a, color) { this.g.orbits.push({ x, y, a, t: 0, life: 0.14, color: color || '#fff0c8' }); }
  }

  /* ============================ 主游戏 ============================ */
  const Game = {
    /* ---------- 初始化 ---------- */
    init(canvas, ui) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.ui = ui;
      this.fx = new FXPool(this);
      this.settings = Object.assign({ particles: true, damageNumbers: true, shake: true, screenFlash: true }, ui.settings || {});
      this.state = 'menu';
      this.t = 0;
      // 菜单演示阶段也需要难度/角色上下文，先给默认值
      this.diff = D.DIFFICULTIES[1];
      this.char = D.CHARACTERS[0];
      this.last = performance.now();
      this.scale = 1; this.dpr = 1;
      this.resize();
      addEventListener('resize', () => this.resize());
      this.resetWorld();
      this.buildDemo();
      Input.init(canvas, {
        onKey: (k, e) => ui.onKey(k, e),
        onDash: () => this.tryDash(),
        onTouch: () => { AudioFX.init(); AudioFX.resume(); },
        onBlur: () => { if (this.state === 'playing' && this.settings.autoPause) this.pause(); },
        onToast: (m) => this.toast(m),
        onPause: () => this.togglePause(),
        onBack: () => { if (this.state === 'playing') this.pause(); },
        onSkip: () => { if (this.state === 'levelup') ui.onPadSkip && ui.onPadSkip(); },
        onReroll: () => { if (this.state === 'levelup') ui.onPadReroll && ui.onPadReroll(); },
        onNav: (dir) => { if (this.state === 'levelup') ui.onPadNav && ui.onPadNav(dir); },
      });
      requestAnimationFrame((t) => this.loop(t));
    },

    resize() {
      const padW = 24, padH = 24;
      const aw = Math.max(320, innerWidth - padW), ah = Math.max(200, innerHeight - padH);
      const k = Math.min(aw / 1280, ah / 720, 1.7);
      const w = Math.floor(1280 * k), h = Math.floor(720 * k);
      this.dpr = Math.min(global.devicePixelRatio || 1, 2);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.scale = w / 1280;
      this.viewW = 1280; this.viewH = 720;
    },

    /* ---------- 随机数：支持种子（每日挑战可复现） ---------- */
    _seed: 0,
    setSeed(seed) {
      this._seed = (seed >>> 0) || (Date.now() >>> 0);
      this._useSeed = true;
    },
    clearSeed() { this._useSeed = false; },
    /** mulberry32：快速、够用、可复现 */
    random() {
      if (!this._useSeed) return Math.random();
      let t = (this._seed += 0x6D2B79F5) >>> 0;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    rand(a, b) { return a + this.random() * (b - a); },
    randi(a, b) { return Math.floor(this.rand(a, b + 1)); },
    pick(a) { return a[Math.floor(this.random() * a.length)]; },
    dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; },
    sfx(n) { AudioFX.play(n); },

    resetWorld() {
      this.t = 0;
      this.enemies = []; this.projectiles = []; this.zones = []; this.gems = []; this.chests = [];
      this.items = []; this.particles = []; this.texts = []; this.arcs = []; this.novas = [];
      this.zaps = []; this.markers = []; this.orbits = []; this.delayed = []; this.summons = [];
      this.cam = { x: 0, y: 0, sx: 0, sy: 0, shake: 0, shakeT: 0 };
      this.nextMini = 120; this.nextElite = 420; this.nextMimic = 300;
      this.waveDone = {}; this.finalSpawned = false; this.won = false;
      this.spawnFrac = 0; this.itemAcc = 0; this.killStreak = 0; this.streakT = 0;
      this.runStats = { kills: 0, elites: 0, bosses: 0, dashes: 0, evolutions: 0, weaponsUsed: [], hitTaken: false };
    },

    buildDemo() {
      this.enemies = [];
      for (let i = 0; i < 14; i++) {
        const a = this.rand(0, TAU), r = this.rand(220, 520);
        this.spawnEnemy(this.pick(['slime', 'bat', 'skeleton', 'ghost', 'spider']),
          { x: Math.cos(a) * r, y: Math.sin(a) * r }, 1, true);
      }
    },

    /* ---------- 开局 ---------- */
    start(charId, diffId, opts) {
      opts = opts || {};
      const ch = D.CHARACTERS.find((c) => c.id === charId) || D.CHARACTERS[0];
      const diff = D.DIFFICULTIES.find((d) => d.id === diffId) || D.DIFFICULTIES[1];
      this.char = ch; this.diff = diff;

      // 挑战修正器
      this.challenge = opts.challenge || null;
      this.mod = this.buildModifiers(this.challenge);

      // 种子（每日挑战固定，其余随机）
      if (opts.seed != null) this.setSeed(opts.seed); else this.clearSeed();

      this.settings = Object.assign(this.settings, this.ui.settings || {});
      this.resetWorld();
      this.player = this.makePlayer(ch);
      this.addWeapon(this.player, ch.weapon);
      this.recompute(this.player);
      this.rerolls = 3 + (this.player.stat.bonusRerolls | 0) + (this.mod.bonusRerolls | 0);
      this.pendingLevels = 0; this.banished = new Set();
      this.state = 'playing';
      this.last = performance.now();
      this.ui.onStart(this);
      AudioFX.init(); AudioFX.resume();
      const tag = this.challenge ? ` · ${this.challenge.name}` : '';
      this.toast(`难度：${diff.name}${tag} · 活过 30 分钟并击败深渊领主`);
    },

    /** 把挑战修正器汇总成运行时参数 */
    buildModifiers(challenge) {
      const m = {
        spawnMul: 1, xpMul: 1, goldMul: 1, mightMul: 1, dmgTakenMul: 1,
        hpMul: 1, speedMul: 1, cdMul: 1, enemySpeedMul: 1, enemyHpMul: 1,
        healMul: 1, visionMul: 1, luckBonus: 0, eliteMul: 1, chestMul: 1,
        dashCdMul: 1, noRevive: false, bonusRerolls: 0,
      };
      const mods = (challenge && challenge.mods) || [];
      for (const id of mods) {
        const def = D.MODIFIERS.find((x) => x.id === id);
        if (def) def.apply(m);
      }
      return m;
    },

    makePlayer(ch) {
      const stat = {
        might: ch.might, speed: ch.spd, cooldown: 0, area: ch.area, duration: 1, proj: ch.proj,
        projspeed: 0, magnet: ch.magnet, armor: ch.armor, crit: 0.05, critdmg: 0.6, regen: ch.regen,
        revive: ch.rev, greed: 0, xpGain: ch.xp, maxHpFlat: 0, pierce: 0, luck: 0, thorns: 0,
        shopMight: 0, shopSpeed: 0, shopGreed: 0, shopXp: 0, dashCdMul: 1, bonusRerolls: 0,
      };
      global.DSSave.applyShopStats(stat);
      return {
        char: ch, x: 0, y: 0, vx: 0, vy: 0, r: 16, aimX: 1, aimAng: 0, walk: 0,
        maxHp: ch.hp, hp: ch.hp, invul: 0, iframe: 0, hitFlash: 0, dead: false,
        level: 1, xp: 0, xpNeed: 5, gold: 0, totalGold: 0, kills: 0, dmgDealt: 0, dmgTaken: 0,
        weaponKills: {}, weapons: [], passives: {}, stat, dashCd: 0, dashT: 0,
        dashDirX: 0, dashDirY: 0, pendingLevels: 0,
      };
    },

    recompute(p) {
      const s = p.stat, ch = p.char;
      const m = this.mod || {};
      s.might = (ch.might + s.shopMight) * (m.mightMul || 1);
      s.speed = (ch.spd + s.shopSpeed) * (m.speedMul || 1);
      s.area = ch.area; s.duration = 1; s.proj = ch.proj;
      s.magnet = ch.magnet; s.armor = ch.armor; s.regen = ch.regen * (m.healMul || 1);
      s.revive = m.noRevive ? 0 : ch.rev;
      s.cooldown = 0; s.projspeed = 0; s.crit = 0.05; s.critdmg = 0.6;
      s.greed = s.shopGreed * (m.goldMul || 1); s.xpGain = (ch.xp + s.shopXp) * (m.xpMul || 1);
      s.maxHpFlat = 0; s.pierce = 0; s.luck = (m.luckBonus || 0); s.thorns = 0;
      for (const id in p.passives) {
        const def = D.PASSIVES[id];
        for (let i = 0; i < p.passives[id]; i++) def.each(s, p);
      }
      s.cooldown = clamp(s.cooldown * (m.cdMul || 1), 0, 0.82);
      s.dashCdMul = (s.dashCdMul || 1) * (m.dashCdMul || 1);
      p.maxHp = (ch.hp + s.maxHpFlat) * (m.hpMul || 1);
      p.hp = Math.min(p.hp, p.maxHp);
    },

    addWeapon(p, id) {
      if (p.weapons.some((w) => w.id === id)) return false;
      if (p.weapons.length >= 6) return false;
      const def = D.WEAPONS[id];
      p.weapons.push({ id, lv: 1, st: def.init(), evolved: !!def.evolved });
      if (!this.runStats.weaponsUsed.includes(id)) this.runStats.weaponsUsed.push(id);
      return true;
    },

    evolveWeapon(p, fromId, toId) {
      const w = p.weapons.find((x) => x.id === fromId);
      if (!w) return;
      const idx = p.weapons.indexOf(w);
      p.weapons[idx] = { id: toId, lv: 8, st: D.WEAPONS[toId].init(), evolved: true };
      this.runStats.evolutions++;
      this.sfx('evolve');
      this.fx.nova(p.x, p.y, 300, 'rgba(255,209,102,0.55)');
      this.fx.burst(p.x, p.y, '#ffd166', 30, 4);
      this.toast(`🧬 进化：${D.WEAPONS[toId].name}！`);
    },

    /* ---------- 难度曲线 ---------- */
    curve() {
      const m = this.t / 60;
      return {
        hp: 1 + m * 0.42 + Math.max(0, m - 15) * 0.36,
        dmg: 1 + m * 0.15,
        speed: 1 + Math.min(0.28, m * 0.01),
      };
    },

    /* ---------- 主循环 ---------- */
    loop(now) {
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (!isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);
      this.fpsAcc = (this.fpsAcc || 0) + dt;
      this.fpsFrames = (this.fpsFrames || 0) + 1;
      if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsFrames / this.fpsAcc); this.fpsAcc = 0; this.fpsFrames = 0; }

      // 手柄轮询（每帧）
      Input.pollGamepad(Input.hooks);

      if (this.state === 'playing') this.step(dt);
      else if (this.state === 'menu') this.menuStep(dt);
      else if (this.state === 'paused') { /* 冻结 */ }

      this.render(dt);
      this.ui.updateHUD(this);
      requestAnimationFrame((t) => this.loop(t));
    },

    step(dt) {
      this.t += dt;
      this.updatePlayer(dt);
      this.updateSpawns(dt);
      this.updateEnemies(dt);
      this.updateProjectiles(dt);
      this.updateZones(dt);
      this.updateDelayed(dt);
      this.updateGems(dt);
      this.updateEffects(dt);
      this.updateCamera(dt);
      this.updateStreak(dt);
      if (this.player.pendingLevels > 0 && this.state === 'playing') this.ui.openLevelUp(this);
      if (this.finalSpawned && !this.enemies.some((e) => e.final) && !this.won) this.endRun(true);
    },

    menuStep(dt) {
      this.t += dt * 0.5;
      for (const e of this.enemies) {
        const a = Math.atan2(-e.y, -e.x);
        e.x += Math.cos(a) * 22 * dt; e.y += Math.sin(a) * 22 * dt;
        e.anim += dt * 4;
        if (Math.hypot(e.x, e.y) < 140) { e.x = this.rand(-620, 620); e.y = this.rand(-420, 420); }
      }
      this.updateEffects(dt);
      this.cam.x = lerp(this.cam.x, 0, 1 - Math.pow(0.02, dt));
      this.cam.y = lerp(this.cam.y, 0, 1 - Math.pow(0.02, dt));
    },

    updateCamera(dt) {
      this.cam.x = lerp(this.cam.x, this.player.x, 1 - Math.pow(0.0006, dt));
      this.cam.y = lerp(this.cam.y, this.player.y, 1 - Math.pow(0.0006, dt));
      if (this.cam.shakeT > 0) {
        this.cam.shakeT -= dt;
        this.cam.sx = this.rand(-1, 1) * this.cam.shake;
        this.cam.sy = this.rand(-1, 1) * this.cam.shake;
        this.cam.shake *= Math.pow(0.02, dt);
      } else { this.cam.sx = this.cam.sy = 0; }
    },

    shake(mag, time) {
      if (!this.settings.shake) return;
      this.cam.shake = Math.max(this.cam.shake, mag);
      this.cam.shakeT = Math.max(this.cam.shakeT, time);
    },

    updateStreak(dt) {
      if (this.streakT > 0) this.streakT -= dt;
      else this.killStreak = 0;
    },

    /* ---------- 玩家 ---------- */
    tryDash() {
      const p = this.player;
      if (this.state !== 'playing' || !p || p.dashCd > 0 || p.dashT > 0) return;
      const v = Input.vec();
      let dx = v.x, dy = v.y;
      if (!dx && !dy) { dx = Math.cos(p.aimAng); dy = Math.sin(p.aimAng); }
      const m = Math.hypot(dx, dy) || 1;
      p.dashDirX = dx / m; p.dashDirY = dy / m;
      p.dashT = 0.17;
      p.dashCd = 2.4 * p.stat.dashCdMul;
      p.invul = Math.max(p.invul, 0.32);
      this.runStats.dashes++;
      this.sfx('dash');
    },

    updatePlayer(dt) {
      const p = this.player, s = p.stat;
      const v = Input.vec();
      const base = 168 * s.speed * (1 + Math.min(this.t, 1800) / 1800 * 0.1);

      if (p.dashT > 0) {
        p.dashT -= dt;
        p.x += p.dashDirX * base * 3.7 * dt;
        p.y += p.dashDirY * base * 3.7 * dt;
        if (this.settings.particles && Math.random() < 0.7) this.fx.burst(p.x, p.y, '#7ee8fa', 1, 0.7);
      } else {
        p.vx = lerp(p.vx, v.x * base, 1 - Math.pow(0.0001, dt));
        p.vy = lerp(p.vy, v.y * base, 1 - Math.pow(0.0001, dt));
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      if (Math.abs(v.x) > 0.05) p.aimX = v.x > 0 ? 1 : -1;
      const mv = Math.hypot(p.vx, p.vy);
      if (mv > 14) { p.aimAng = Math.atan2(p.vy, p.vx); p.walk += dt * 9; }
      // 静止或慢速时自动朝向最近敌人（可关闭），保证远程武器不会朝空气开火
      if (mv <= 14 && this.settings.autoAim !== false) {
        const tgt = this.nearestEnemy(p, 420);
        if (tgt) p.aimAng = Math.atan2(tgt.y - p.y, tgt.x - p.x);
      }

      p.dashCd = Math.max(0, p.dashCd - dt);
      p.iframe = Math.max(0, p.iframe - dt);
      p.invul = Math.max(0, p.invul - dt);
      p.hitFlash = Math.max(0, p.hitFlash - dt);
      if (s.regen > 0) p.hp = Math.min(p.maxHp, p.hp + s.regen * dt);

      for (const w of p.weapons) {
        const def = D.WEAPONS[w.id];
        if (def.update) { def.update(this, p, w.st, dt); continue; }
        w.st.t += dt;
        const iv = w.st.iv / (1 + s.cooldown);
        if (w.st.t >= iv) { w.st.t = 0; def.fire(this, p, w.st); }
      }
    },

    /* ---------- 生成 ---------- */
    spawnPoint() {
      // 屏幕内约 640×360 可视（半径约 400）；刷在可视边缘稍外，保证很快进入战斗
      const d = this.rand(340, 470);
      const a = this.rand(0, TAU);
      return { x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d };
    },

    availableTypes() {
      const out = [];
      for (const id in D.ENEMY_TYPES) {
        const d = D.ENEMY_TYPES[id];
        if (d.rare) continue;
        if (d.minT <= this.t) out.push({ id, w: 1 });
      }
      return out;
    },

    updateSpawns(dt) {
      if (this.enemies.length >= D.MAX_ENEMIES) return;
      const m = this.t / 60;
      // 起手更温和：前 2 分钟压力明显降低，之后逐步加码
      const ramp = m < 2 ? 0.9 + m * 0.3 : 1.5 + (m - 2) * 0.62 + Math.max(0, m - 15) * 0.9;
      const per = ramp * this.diff.spawn * ((this.mod && this.mod.spawnMul) || 1);
      this.spawnFrac += per * dt;
      const list = this.availableTypes();
      if (!list.length) return;
      while (this.spawnFrac >= 1) {
        this.spawnFrac -= 1;
        if (this.enemies.length >= D.MAX_ENEMIES) break;
        const roll = this.random();
        if (this.t > 300 && roll < 0.018) { this.spawnEnemy('mimic'); continue; }
        if (this.t > this.nextElite) { this.nextElite += this.rand(150, 230); this.spawnEnemy('elite'); continue; }
        const id = list[this.randi(0, list.length - 1)].id;
        this.spawnEnemy(id);
        if (id === 'swarm' && this.random() < 0.55) for (let i = 0; i < 4; i++) this.spawnEnemy('swarm');
      }

      const waveIdx = Math.floor(this.t / 90);
      if (waveIdx > 0 && !this.waveDone[waveIdx] && this.t - waveIdx * 90 < dt + 0.001) {
        this.waveDone[waveIdx] = 1;
        this.spawnRing(waveIdx);
      }
      if (this.t >= this.nextMini) { this.nextMini += 90; this.spawnMiniBoss(); }
      // 提前 8 秒预告小 Boss
      if (this.t >= this.nextMini - 8 && !this._miniWarned) {
        this._miniWarned = true;
        this.toast('⚠️ 小 Boss 即将降临');
      }
      if (this.t < this.nextMini - 8) this._miniWarned = false;
      if (this.t >= D.RUN_DURATION && !this.finalSpawned) {
        this.finalSpawned = true;
        this.spawnBoss('lich', true);
      }
    },

    spawnEnemy(id, at, scale, demo) {
      if (this.enemies.length >= D.MAX_ENEMIES) return null;
      const def = D.ENEMY_TYPES[id];
      if (!def) return null;
      const diff = this.diff || D.DIFFICULTIES[1];
      const c = this.curve();
      const pos = at || this.spawnPoint();
      const e = {
        id, def, x: pos.x, y: pos.y, r: def.r * (scale || 1), kx: 0, ky: 0,
        hp: 0, maxHp: 0, flash: 0, dead: false, anim: this.rand(0, TAU),
        spd: def.spd * diff.spd * (demo ? 1 : c.speed) * ((this.mod && this.mod.enemySpeedMul) || 1),
        dmg: def.dmg, xp: def.xp, gold: def.gold,
        boss: false, elite: !!def.elite, armor: def.armor || 0,
        faded: 0, bossCd: 0,
        frozen: 0, stun: 0, slowed: 0, burn: null, shootCd: this.rand(1, 3),
        chargeState: 0, chargeT: 0, aim: null, demo: !!demo,
      };
      e.maxHp = e.hp = Math.round(def.hp * (demo ? 1 : c.hp) * diff.hp * (scale || 1)
        * ((this.mod && this.mod.enemyHpMul) || 1));
      this.enemies.push(e);
      return e;
    },

    spawnRing(idx) {
      const n = clamp(18 + idx * 5, 18, 64);
      const R = 560;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        this.spawnEnemy(this.random() < 0.45 ? 'skeleton' : 'slime',
          { x: this.player.x + Math.cos(a) * R, y: this.player.y + Math.sin(a) * R });
      }
      this.toast('⭕ 敌潮包围！');
      this.sfx('boss');
    },

    spawnMiniBoss() {
      const ids = Object.keys(D.BOSS_TYPES).filter((k) => k !== 'lich');
      // 小 Boss 从弱到强轮换，避免第一只就撞上最强
      const tier = Math.min(ids.length - 1, Math.floor((this.t - 60) / 240));
      const key = ids[clamp(tier + this.randi(0, 1), 0, ids.length - 1)];
      this.spawnBoss(key, false);
    },

    spawnBoss(key, final) {
      const def = D.BOSS_TYPES[key];
      const c = this.curve();
      const pos = this.spawnPoint();
      const p = this.player;
      // Boss 血量按「玩家当前输出能力」缩放：能在 20~40 秒内打完才有意义
      const dpsGuess = p ? Math.max(12, p.dmgDealt / Math.max(6, this.t)) : 20;
      const fightSeconds = final ? 55 : 30;
      const targetHp = dpsGuess * fightSeconds;
      const scaled = final
        ? Math.max(def.hp * 0.55, targetHp)
        : clamp(targetHp, def.hp * 0.04, def.hp * 0.55);
      const e = {
        id: key, def, x: pos.x, y: pos.y, r: def.r, kx: 0, ky: 0,
        hp: scaled, maxHp: scaled, bossCd: 0,
        spd: def.spd * this.diff.spd, dmg: def.dmg * c.dmg * this.diff.dmg,
        flash: 0, dead: false, boss: true, elite: true, final: !!final,
        armor: (def.armor || 6) + Math.floor(this.t / 420),
        frozen: 0, stun: 0, slowed: 0, burn: null, anim: 0,
        pattern: def.pattern, pT: 0, pState: 0, minionCd: 2,
      };
      this.enemies.push(e);
      this.sfx('boss');
      this.toast(`👹 ${def.name} 出现了！${final ? '击败它即可通关' : ''}`);
      this.shake(10, 0.6);
      return e;
    },

    /* ---------- 敌人 AI ---------- */
    updateEnemies(dt) {
      const p = this.player, c = this.curve();
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (e.dead) { this.enemies.splice(i, 1); continue; }
        e.flash = Math.max(0, e.flash - dt);
        e.anim += dt * 5;
        e.x += e.kx * dt * 3; e.y += e.ky * dt * 3;
        e.kx *= Math.pow(0.0025, dt); e.ky *= Math.pow(0.0025, dt);

        if (e.burn) {
          e.burn.tick += dt;
          if (e.burn.tick >= 0.5) {
            e.burn.tick = 0;
            const d = Math.max(1, Math.round(e.burn.dps));
            e.hp -= d;
            this.fx.text(e.x, e.y - e.r, d, '#ff9e64', 12);
            if (e.hp <= 0) { this.killEnemy(p, e, 'burn'); continue; }
          }
          e.burn.t -= dt;
          if (e.burn.t <= 0) e.burn = null;
        }
        if (e.frozen > 0) e.frozen -= dt;
        if (e.stun > 0) e.stun -= dt;
        if (e.slowed > 0) e.slowed -= dt;

        const frozenish = e.frozen > 0 || e.stun > 0;
        let spd = e.spd * (e.slowed > 0 ? 0.55 : 1);
        if (frozenish) spd = 0;

        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d, uy = dy / d;

        if (e.boss) this.bossAI(e, dt, ux, uy, d, spd);
        else if (e.def.ranged) {
          const want = 260;
          const dir = d > want ? 1 : d < want - 70 ? -1 : 0;
          e.x += ux * spd * dir * dt; e.y += uy * spd * dir * dt;
          e.shootCd -= dt;
          if (e.shootCd <= 0 && d < 500 && !frozenish) {
            e.shootCd = this.rand(2.1, 3.3);
            this.summons.push({ x: e.x, y: e.y, vx: ux * 260, vy: uy * 260, r: 7,
              dmg: e.dmg * c.dmg * this.diff.dmg, life: 3.2, kind: 'spit', color: '#c58cff' });
          }
        } else if (e.def.charge) {
          if (e.chargeState === 0) {
            e.x += ux * spd * dt; e.y += uy * spd * dt;
            if (d < 320) { e.chargeState = 1; e.chargeT = 0.62; e.aim = { x: ux, y: uy }; }
          } else if (e.chargeState === 1) {
            e.chargeT -= dt;
            if (e.chargeT <= 0) { e.chargeState = 2; e.chargeT = 0.8; }
          } else {
            e.x += e.aim.x * 520 * dt; e.y += e.aim.y * 520 * dt;
            e.chargeT -= dt;
            if (e.chargeT <= 0) e.chargeState = 0;
          }
        } else if (e.def.heal) {
          e.x += ux * spd * 0.85 * dt; e.y += uy * spd * 0.85 * dt;
          e.shootCd -= dt;
          if (e.shootCd <= 0) {
            e.shootCd = 2.5;
            for (const o of this.enemies) {
              if (o === e || o.dead || o.hp >= o.maxHp) continue;
              if (this.dist2(o.x, o.y, e.x, e.y) < 190 * 190) {
                o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.12);
                this.fx.text(o.x, o.y - o.r, '+', '#7dffb0', 13);
              }
            }
            this.fx.nova(e.x, e.y, 175, 'rgba(125,255,176,0.26)');
          }
        } else if (e.def.selfDestruct) {
          e.x += ux * spd * dt; e.y += uy * spd * dt;
          if (d < e.r + p.r + 6) {
            this.damagePlayer(e.dmg * 2.2 * c.dmg * this.diff.dmg, e);
            this.fx.nova(e.x, e.y, 96, 'rgba(75,227,201,0.45)');
            this.sfx('boom');
            this.killEnemy(p, e, 'selfboom', true);
            continue;
          }
        } else {
          e.x += ux * spd * dt; e.y += uy * spd * dt;
        }

        // 分离
        if ((i & 3) === 0) {
          for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
            const o = this.enemies[j];
            if (o.dead || o.boss || e.boss) continue;
            const ox = o.x - e.x, oy = o.y - e.y;
            const dd = ox * ox + oy * oy, mr = (e.r + o.r) * 0.72;
            if (dd < mr * mr && dd > 0.01) {
              const dl = Math.sqrt(dd), push = (mr - dl) * 0.3;
              const nx = ox / dl, ny = oy / dl;
              e.x -= nx * push; e.y -= ny * push;
              o.x += nx * push; o.y += ny * push;
            }
          }
        }

      // 接触伤害：每个敌人有独立冷却，且玩家有 0.55s 无敌帧
      if (!e.boss && !e.def.selfDestruct && d < e.r + p.r) {
        this.damagePlayer(e.dmg * c.dmg * this.diff.dmg, e);
        if (e.def.slowOnHit) p.slow = Math.max(p.slow || 0, e.def.slowOnHit);
      } else if (e.boss && d < e.r + p.r + 4) {
        // Boss 接触伤害：压到 40% 且自带 1.1s 冷却，贴身不会连续秒人
        e.bossCd = (e.bossCd || 0) - dt;
        if (e.bossCd <= 0) {
          e.bossCd = 1.1;
          this.damagePlayer(e.dmg * 0.4, e);
        }
      }

        if (d > 1700) { const sp = this.spawnPoint(); e.x = sp.x; e.y = sp.y; }
      }
    },

    bossAI(e, dt, ux, uy, d, spd) {
      e.pT += dt;
      if (e.pattern === 'chase') {
        e.x += ux * spd * dt; e.y += uy * spd * dt;
        if (e.pT > 6) { e.pT = 0; this.volley(e, 12, 240); }
      } else if (e.pattern === 'summon') {
        if (d > 210) { e.x += ux * spd * dt; e.y += uy * spd * dt; }
        e.minionCd -= dt;
        if (e.minionCd <= 0) {
          e.minionCd = 4.5;
          for (let i = 0; i < 4; i++) {
            const a = this.rand(0, TAU);
            this.spawnEnemy(e.def.minion || 'skeleton',
              { x: e.x + Math.cos(a) * (e.r + 30), y: e.y + Math.sin(a) * (e.r + 30) }, 1.2);
          }
          this.fx.nova(e.x, e.y, e.r * 2, 'rgba(111,211,255,0.32)');
        }
        if (e.pT > 7) { e.pT = 0; this.volley(e, 16, 200); }
      } else if (e.pattern === 'dash') {
        if (e.pState === 0) {
          e.x += ux * spd * dt; e.y += uy * spd * dt;
          if (e.pT > 3.4) { e.pT = 0; this.volley(e, 10, 260); }
          if (d > 130 && e.pT > 1.2) { e.pState = 1; e.pT = 0; e.aim = { x: ux, y: uy }; }
        } else if (e.pState === 1) {
          if (e.pT > 0.5) { e.pState = 2; e.pT = 0; }
        } else {
          e.x += e.aim.x * 740 * dt; e.y += e.aim.y * 740 * dt;
          this.fx.burst(e.x, e.y, e.def.color, 2, 1);
          if (e.pT > 0.85) { e.pState = 0; e.pT = 0; }
        }
      } else if (e.pattern === 'final') {
        const want = 190;
        const dir = d > want ? 1 : -0.45;
        e.x += ux * spd * dir * dt; e.y += uy * spd * dir * dt;
        e.minionCd -= dt;
        if (e.minionCd <= 0) {
          e.minionCd = 4.5;
          for (let i = 0; i < 6; i++) {
            const a = this.rand(0, TAU);
            this.spawnEnemy(this.pick(['brute', 'elite', 'skeleton', 'gargoyle']),
              { x: e.x + Math.cos(a) * (e.r + 40), y: e.y + Math.sin(a) * (e.r + 40) }, 1.2);
          }
        }
        if (e.pT > 3.2) { e.pT = 0; this.volley(e, 20, 235, true); }
      }
    },

    volley(e, n, spd, spiral) {
      const base = Math.atan2(this.player.y - e.y, this.player.x - e.x);
      for (let i = 0; i < n; i++) {
        const a = spiral ? base + (i / n) * TAU : base + (i - n / 2) * 0.12;
        this.summons.push({ x: e.x, y: e.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          r: 9, dmg: e.dmg * 0.5, life: 4.2, kind: 'orb', color: e.def.color });
      }
      this.sfx('thunder');
    },

    /* ---------- 伤害 ---------- */
    nearestEnemy(p, range) {
      let best = null, bd = range * range;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = this.dist2(e.x, e.y, p.x, p.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },

    nearestEnemies(p, range, n) {
      const rr = range * range, arr = [];
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = this.dist2(e.x, e.y, p.x, p.y);
        if (d < rr) arr.push({ e, d });
      }
      arr.sort((a, b) => a.d - b.d);
      return arr.slice(0, Math.max(0, n)).map((o) => o.e);
    },

    damageEnemy(p, e, dmg, opt) {
      if (!e || e.dead || !isFinite(dmg)) return 0;
      opt = opt || {};
      let d = dmg;
      if (e.armor && !opt.trueDamage) d = Math.max(1, d - e.armor * 0.6);
      const cc = opt.critChance != null ? opt.critChance : p.stat.crit;
      const crit = this.random() < cc;
      if (crit) d *= 1 + p.stat.critdmg + (opt.critDmgBonus || 0);
      d = Math.max(1, Math.round(d));

      e.hp -= d;
      e.flash = 0.09;
      p.dmgDealt += d;
      const src = opt.src || 'other';
      p.weaponKills[src] = (p.weaponKills[src] || 0);
      this.fx.text(e.x, e.y - e.r, d, crit ? '#ffd166' : '#ffffff', crit ? 18 : 13);

      if (opt.kb) {
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        const k = e.boss ? opt.kb * 0.07 : opt.kb;
        e.kx += Math.cos(a) * k; e.ky += Math.sin(a) * k;
      }
      if (opt.burn) e.burn = { dps: opt.burn, t: opt.burnDur || 3, tick: 0 };
      if (opt.stun) e.stun = Math.max(e.stun || 0, opt.stun);
      if (!opt.quiet && this.random() < 0.3) this.sfx('hit');

      if (e.hp <= 0) this.killEnemy(p, e, src);
      return d;
    },

    killEnemy(p, e, src, silent) {
      if (e.dead) return;
      e.dead = true;
      p.kills++;
      this.runStats.kills++;
      if (src) p.weaponKills[src] = (p.weaponKills[src] || 0) + 1;
      this.killStreak++; this.streakT = 1.4;

      const luck = p.stat.luck;
      this.spawnGem(e.x, e.y, Math.round(e.xp * p.stat.xpGain * this.diff.xp),
        Math.round(e.gold * (1 + p.stat.greed) * this.diff.gold));

      // 道具掉落
      if (!e.boss && this.random() < 0.055 * (1 + luck)) this.dropItem(e.x, e.y);
      if (e.def.boomOnDeath) {
        this.explode(e.x, e.y, e.def.boomOnDeath, e.dmg * 2, { src: 'boom', hostile: true });
      }
      this.fx.burst(e.x, e.y, e.def.color, e.boss ? 44 : e.elite ? 22 : 9, e.boss ? 5 : 2.4);

      if (e.boss) {
        this.runStats.bosses++;
        this.sfx('boom');
        this.shake(16, 0.6);
        this.toast(`👑 击杀 ${e.def.name}！`);
        this.dropChest(e.x, e.y, false);
        this.spawnGem(e.x + 20, e.y, 40, 60);
      } else if (e.elite) {
        this.runStats.elites++;
        this.dropChest(e.x, e.y, true);
        this.sfx('kill');
      } else if (!silent) this.sfx('kill');

      if (this.killStreak >= 25) { this.toast(`🔥 ${this.killStreak} 连杀！`); this.killStreak = 0; }
    },

    spawnGem(x, y, xp, gold) {
      if (this.gems.length > 900) this.gems.shift();
      this.gems.push({ x: x + this.rand(-6, 6), y: y + this.rand(-6, 6),
        xp: Math.max(1, xp), gold: gold || 0, t: 0,
        vx: this.rand(-40, 40), vy: this.rand(-40, 40), magnet: false });
    },

    dropChest(x, y, mini) {
      this.chests.push({ x, y, r: mini ? 16 : 22, t: 0, mini: !!mini });
    },

    dropItem(x, y) {
      const kinds = ['heal', 'magnet', 'bomb', 'gold'];
      const kind = this.pick(kinds);
      this.items.push({ x, y, kind, t: 0, r: 13, def: D.ITEMS[kind] });
    },

    /* ---------- 群体伤害工具 ---------- */
    meleeArc(p, ang, reach, dmg, opt) {
      opt = opt || {};
      const half = (opt.arc || 0.7) / 2;
      let hits = 0;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.x - p.x, dy = e.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > reach + e.r) continue;
        let a = Math.atan2(dy, dx) - ang;
        while (a > Math.PI) a -= TAU;
        while (a < -Math.PI) a += TAU;
        if (Math.abs(a) > half + e.r / Math.max(50, d)) continue;
        this.damageEnemy(p, e, dmg, opt);
        hits++;
      }
      this.arcs.push({ x: p.x, y: p.y, ang, reach, width: opt.arc || 0.7,
        color: opt.color || 'rgba(255,240,200,0.55)', t: 0, life: 0.2 });
      return hits;
    },

    beam(p, ang, len, width, dmg, opt) {
      opt = opt || {};
      const ux = Math.cos(ang), uy = Math.sin(ang);
      for (const e of this.enemies) {
        if (e.dead) continue;
        const rx = e.x - p.x, ry = e.y - p.y;
        const proj = rx * ux + ry * uy;
        if (proj < 0 || proj > len) continue;
        const perp = Math.abs(rx * -uy + ry * ux);
        if (perp > width / 2 + e.r) continue;
        this.damageEnemy(p, e, dmg, opt);
      }
      this.beams = this.beams || [];
      this.beams.push({ x: p.x, y: p.y, ang, len, width, t: 0, life: 0.18, color: opt.color || '#9ef0ff' });
    },

    shoot(p, cfg) {
      if (this.projectiles.length > D.MAX_PROJECTILES) return null;
      const q = {
        x: p.x, y: p.y, ox: p.x, oy: p.y,
        vx: Math.cos(cfg.ang) * cfg.spd, vy: Math.sin(cfg.ang) * cfg.spd,
        dmg: cfg.dmg || 0, pierce: cfg.pierce || 0, life: cfg.life || 2, r: cfg.r || 6,
        kind: cfg.kind || 'kunai', src: cfg.src || 'other', kb: cfg.kb || 0,
        critChance: cfg.critChance, critDmgBonus: cfg.critDmgBonus || 0,
        explode: cfg.explode || 0, explodeColor: cfg.explodeColor,
        burn: cfg.burn || 0, burnDur: cfg.burnDur || 3, stun: cfg.stun || 0,
        homing: cfg.homing || 0, spin: !!cfg.spin, arc: !!cfg.arc, t: 0,
        boomerang: !!cfg.boomerang, reach: cfg.reach || 0, backDmg: cfg.backDmg || 1,
        accel: cfg.accel || 0, bounce: !!cfg.bounce, split: cfg.split || 0,
        zone: cfg.zone || null, hit: new Set(), grav: cfg.arc ? 640 : 0,
      };
      this.projectiles.push(q);
      return q;
    },

    spawnDelayed(x, y, delay, dmg, radius, src, stun, kind) {
      this.delayed.push({ x, y, t: delay, max: delay, dmg, radius, src, stun: stun || 0, kind: kind || 'bomb' });
    },

    explode(x, y, radius, dmg, opt) {
      opt = opt || {};
      this.fx.nova(x, y, radius, opt.color || 'rgba(255,180,92,0.42)');
      this.fx.burst(x, y, opt.color || '#ffb45c', 14, 3);
      this.sfx('boom');
      if (!opt.hostile) this.shake(5, 0.18);
      const p = this.player;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (this.dist2(e.x, e.y, x, y) > (radius + e.r) ** 2) continue;
        if (opt.hostile) continue;
        this.damageEnemy(p, e, dmg * (e.boss ? 0.78 : 1), { src: opt.src || 'explode', kb: 40, quiet: true, stun: opt.stun });
      }
    },

    /* ---------- 弹射物 ---------- */
    updateProjectiles(dt) {
      const p = this.player;
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const q = this.projectiles[i];
        q.t += dt; q.life -= dt;

        if (q.homing) {
          const t = this.nearestEnemy(p, 560);
          if (t) {
            const want = Math.atan2(t.y - q.y, t.x - q.x);
            const cur = Math.atan2(q.vy, q.vx);
            let diff = want - cur;
            while (diff > Math.PI) diff -= TAU;
            while (diff < -Math.PI) diff += TAU;
            const na = cur + clamp(diff, -q.homing * dt, q.homing * dt);
            const sp = Math.hypot(q.vx, q.vy);
            q.vx = Math.cos(na) * sp; q.vy = Math.sin(na) * sp;
          }
        }
        if (q.arc) q.vy += q.grav * dt;
        if (q.accel) { const k = 1 + q.accel * dt * 0.001; q.vx *= k; q.vy *= k; }
        if (q.boomerang) {
          const dd = Math.hypot(q.x - q.ox, q.y - q.oy);
          if (!q.back && dd > q.reach) q.back = true;
          if (q.back) {
            const a = Math.atan2(q.oy - q.y, q.ox - q.x);
            const sp = Math.hypot(q.vx, q.vy);
            q.vx = lerp(q.vx, Math.cos(a) * sp, 0.09);
            q.vy = lerp(q.vy, Math.sin(a) * sp, 0.09);
            if (dd < 24) q.life = 0;
          }
        }
        q.x += q.vx * dt; q.y += q.vy * dt;

        // 毒瓶落地
        if (q.zone) {
          let ground = false;
          if (q.t > 0.35) {
            for (const e of this.enemies) {
              if (e.dead) continue;
              if (this.dist2(e.x, e.y, q.x, q.y) < (e.r + q.r) ** 2) { ground = true; break; }
            }
            if (q.life <= 0) ground = true;
          }
          if (ground) {
            this.zones.push({ x: q.x, y: q.y, r: q.zone.radius, dps: q.zone.dps,
              life: q.zone.life, max: q.zone.life, slow: q.zone.slow, t: 0, tick: 0, color: '#a3e635' });
            this.fx.nova(q.x, q.y, q.zone.radius, 'rgba(163,230,53,0.3)');
            this.sfx('boom');
            this.projectiles.splice(i, 1);
            continue;
          }
        } else {
          for (const e of this.enemies) {
            if (e.dead || q.hit.has(e)) continue;
            const rr = e.r + q.r;
            if (this.dist2(e.x, e.y, q.x, q.y) > rr * rr) continue;
            q.hit.add(e);
            const mult = q.back && q.backDmg ? q.backDmg : 1;
            this.damageEnemy(p, e, q.dmg * mult, {
              src: q.src, kb: q.kb, critChance: q.critChance, critDmgBonus: q.critDmgBonus,
              quiet: q.kind === 'saw',
            });
            if (q.explode) this.explode(q.x, q.y, q.explode, q.dmg * 0.55, { src: q.src, color: q.explodeColor });
            if (q.split) {
              for (let k = 0; k < q.split; k++) {
                this.shoot(p, { ang: this.rand(0, TAU), spd: 320, dmg: q.dmg * 0.45, pierce: 0,
                  life: 1.2, r: 6, src: q.src, kind: q.kind, homing: 2 });
              }
            }
            if (q.bounce) {
              q.hit.delete(e);
              q.vx = -q.vx; q.vy = -q.vy;
              q.life = Math.max(q.life, 0.6);
              q.bounce = false;
            } else if (q.pierce <= 0) { q.life = 0; break; }
            else q.pierce--;
          }
        }

        if (q.life <= 0 || Math.hypot(q.x - p.x, q.y - p.y) > 1400) this.projectiles.splice(i, 1);
      }

      // 敌方弹
      for (let i = this.summons.length - 1; i >= 0; i--) {
        const s = this.summons[i];
        s.life -= dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (this.dist2(s.x, s.y, p.x, p.y) < (s.r + p.r) ** 2) {
          this.damagePlayer(s.dmg, null);
          this.summons.splice(i, 1);
          continue;
        }
        if (s.life <= 0) this.summons.splice(i, 1);
      }
    },

    updateZones(dt) {
      const p = this.player;
      for (let i = this.zones.length - 1; i >= 0; i--) {
        const z = this.zones[i];
        z.t += dt; z.life -= dt;
        z.tick += dt;
        if (z.tick >= 0.4) {
          z.tick = 0;
          for (const e of this.enemies) {
            if (e.dead) continue;
            if (this.dist2(e.x, e.y, z.x, z.y) > (z.r + e.r) ** 2) continue;
            this.damageEnemy(p, e, z.dps * 0.4, { src: 'poison', quiet: true });
            if (z.slow) e.slowed = Math.max(e.slowed, 0.5);
          }
        }
        if (z.life <= 0) this.zones.splice(i, 1);
      }
    },

    updateDelayed(dt) {
      const p = this.player;
      for (let i = this.delayed.length - 1; i >= 0; i--) {
        const d = this.delayed[i];
        d.t -= dt;
        if (d.t > 0) continue;
        if (d.kind === 'spike') {
          this.fx.nova(d.x, d.y, d.radius, 'rgba(229,224,207,0.4)');
          for (let k = 0; k < 6; k++) {
            const a = this.rand(0, TAU), r = this.rand(0, d.radius * 0.6);
            this.spikes = this.spikes || [];
            this.spikes.push({ x: d.x + Math.cos(a) * r, y: d.y + Math.sin(a) * r, t: 0, life: 0.3, h: this.rand(18, 40) });
          }
        }
        if (d.kind === 'meteor') {
          this.zones.push({ x: d.x, y: d.y, r: d.radius * 0.75, dps: d.dmg * 0.25,
            life: 2.4, max: 2.4, slow: 0, t: 0, tick: 0, color: '#ff7043' });
        }
        this.explode(d.x, d.y, d.radius, d.dmg, { src: d.src, stun: d.stun,
          color: d.kind === 'meteor' ? 'rgba(255,112,67,0.5)' : undefined });
        this.delayed.splice(i, 1);
      }
    },

    /* ---------- 拾取 ---------- */
    updateGems(dt) {
      const p = this.player;
      // 拾取半径随等级成长，避免边跑边漏（否则升级节奏会卡死）
      const mag = (100 * p.stat.magnet + p.r + Math.min(180, p.level * 9)) ** 2;
      // 距离较远的宝石缓慢飘向玩家：模拟「经验不会白掉」
      const drift = 900 + p.level * 26;
      for (let i = this.gems.length - 1; i >= 0; i--) {
        const g = this.gems[i];
        g.t += dt;
        g.x += g.vx * dt; g.y += g.vy * dt;
        g.vx *= Math.pow(0.02, dt); g.vy *= Math.pow(0.02, dt);
        const d2 = this.dist2(g.x, g.y, p.x, p.y);
        if (g.magnet) {
          const a = Math.atan2(p.y - g.y, p.x - g.x);
          g.x += Math.cos(a) * 700 * dt;
          g.y += Math.sin(a) * 700 * dt;
        } else if (d2 < mag) {
          g.magnet = true;
        } else if (d2 < drift * drift) {
          // 视野内的宝石被牵引，防止「一路狂奔漏光经验」
          const a = Math.atan2(p.y - g.y, p.x - g.x);
          const pull = 90 * (1 - Math.sqrt(d2) / drift);
          g.x += Math.cos(a) * pull * dt;
          g.y += Math.sin(a) * pull * dt;
        }

        if (d2 < (p.r + 9) ** 2) {
          p.xp += g.xp;
          if (g.gold) { p.gold += g.gold; p.totalGold += g.gold; }
          this.sfx('pickup');
          this.gems.splice(i, 1);
          let ups = 0;
          while (p.xp >= p.xpNeed) {
            p.xp -= p.xpNeed; p.level++; p.xpNeed = this.xpFor(p.level);
            p.pendingLevels++; this.pendingLevels = p.pendingLevels; ups++;
          }
          if (ups) { this.sfx('levelup'); this.fx.nova(p.x, p.y, 120, 'rgba(126,232,250,0.4)'); }
          continue;
        }
        if (g.t > 28) this.gems.splice(i, 1);
      }

      for (let i = this.chests.length - 1; i >= 0; i--) {
        const c = this.chests[i];
        c.t += dt;
        if (this.dist2(c.x, c.y, p.x, p.y) < (p.r + c.r + 26) ** 2) {
          this.openChest(c);
          this.chests.splice(i, 1);
        }
      }

      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        it.t += dt;
        if (this.dist2(it.x, it.y, p.x, p.y) < (p.r + it.r + 12) ** 2) {
          this.useItem(it);
          this.items.splice(i, 1);
        } else if (it.t > 30) this.items.splice(i, 1);
      }
    },

    // 升级经验曲线：前期快、后期慢。目标是 30 分钟内能到 ~45 级
    xpFor(lv) { return Math.round(3.5 + lv * 2.0 + Math.pow(lv, 1.22) * 0.9); },

    openChest(c) {
      const p = this.player;
      const gold = Math.round((c.mini ? this.rand(18, 42) : this.rand(55, 150)) * (1 + this.t / 620) * (1 + p.stat.greed));
      p.gold += gold; p.totalGold += gold;
      this.fx.nova(c.x, c.y, 120, 'rgba(255,209,102,0.45)');
      this.sfx('chest');
      if (c.mini) { this.toast(`🎁 宝箱 +${gold}💰`); return; }
      const roll = this.random() * (1 + p.stat.luck);
      if (roll < 0.5) { p.pendingLevels++; this.pendingLevels = p.pendingLevels; this.toast('🎁 宝箱：立即升级！'); }
      else if (roll < 0.78) { for (const g of this.gems) g.magnet = true; this.toast('🧲 宝箱：全屏吸取！'); }
      else if (roll < 0.92) {
        const heal = Math.round(45 * ((this.mod && this.mod.healMul) || 1));
        p.hp = Math.min(p.maxHp, p.hp + heal);
        this.toast(`💖 宝箱：回复 ${heal} 生命`);
      }
      else { this.dropItem(c.x, c.y); this.toast('🎁 宝箱：掉落道具！'); }
    },

    useItem(it) {
      const p = this.player;
      this.sfx('pickup');
      if (it.kind === 'heal') {
        const heal = Math.round(30 * ((this.mod && this.mod.healMul) || 1));
        p.hp = Math.min(p.maxHp, p.hp + heal);
        this.fx.text(p.x, p.y - 26, '+' + heal, '#7dffb0', 16);
      } else if (it.kind === 'magnet') {
        for (const g of this.gems) g.magnet = true;
        this.toast('🧲 磁石：吸取全场经验');
      } else if (it.kind === 'bomb') {
        this.explode(p.x, p.y, 260, 160, { src: 'item', color: 'rgba(255,180,92,0.5)' });
        this.toast('💥 炸弹：清场！');
      } else {
        const gold = Math.round(this.rand(40, 90) * (1 + p.stat.greed));
        p.gold += gold; p.totalGold += gold;
        this.fx.text(p.x, p.y - 26, `+${gold}`, '#ffd166', 16);
      }
    },

    /* ---------- 玩家受伤 ---------- */
    damagePlayer(dmg, src) {
      const p = this.player;
      if (!p || p.dead || p.invul > 0 || this.state !== 'playing') return;
      const s = p.stat;
      let d = Math.max(1, Math.round(dmg - s.armor));
      d = Math.max(1, Math.round(d * ((this.mod && this.mod.dmgTakenMul) || 1)));
      p.hp -= d;
      p.dmgTaken += d;
      // 受击后 0.55s 无敌：足以穿出怪群，又不至于无脑站桩
      p.iframe = 0.55;
      p.invul = 0.55;
      p.hitFlash = 0.24;
      this.runStats.hitTaken = true;
      this.fx.text(p.x, p.y - 24, d, '#ff8fa3', 16);
      this.sfx('hurt');
      this.shake(6, 0.22);
      this.killStreak = 0;

      if (s.thorns && src && !src.boss) {
        this.damageEnemy(p, src, s.thorns, { src: 'thorns', quiet: true, trueDamage: true });
      }
      if (p.hp <= 0) {
        if (s.revive > 0) {
          s.revive--;
          p.hp = p.maxHp * 0.5;
          p.invul = 2.4;
          this.fx.nova(p.x, p.y, 280, 'rgba(255,209,102,0.5)');
          this.toast('♻️ 不灭：原地复活！');
          this.sfx('evolve');
        } else {
          p.dead = true;
          this.endRun(false);
        }
      }
    },

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.ui.onPause(this);
    },
    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      this.last = performance.now();
      this.ui.onResume(this);
    },
    togglePause() { if (this.state === 'playing') this.pause(); else if (this.state === 'paused') this.resume(); },

    endRun(won) {
      if (this.state === 'over' || this.state === 'win') return;
      this.state = won ? 'win' : 'over';
      this.won = won;
      this.sfx(won ? 'win' : 'lose');
      const p = this.player;
      const run = {
        won, time: this.t, level: p.level, kills: p.kills,
        char: p.char.id, diff: this.diff.id,
        elites: this.runStats.elites, bosses: this.runStats.bosses,
        dashes: this.runStats.dashes, evolutions: this.runStats.evolutions,
        weapons: p.weapons.length, weaponsUsed: this.runStats.weaponsUsed.slice(),
        hitTaken: this.runStats.hitTaken,
        runGold: p.totalGold,
      };
      const unlocked = global.DSSave.recordRun(run);
      global.DSSave.data.stats.bestTime = Math.max(global.DSSave.data.stats.bestTime, this.t);
      global.DSSave.flush();
      this.ui.onEnd(this, run, unlocked);
    },

    /* ---------- 升级卡 ---------- */
    buildCardPool(p) {
      const pool = [];
      const ban = this.banished || new Set();

      // 进化优先
      for (const evo of D.EVOLUTIONS) {
        if (ban.has('evo:' + evo.to)) continue;
        const w = p.weapons.find((x) => x.id === evo.from);
        if (!w || w.evolved) continue;
        if (w.lv < D.WEAPONS[evo.from].max) continue;
        if ((p.passives[evo.passive] || 0) < D.PASSIVES[evo.passive].max) continue;
        pool.push({ type: 'evo', id: evo.to, from: evo.from, w: 40 });
      }

      if (p.weapons.length < 6) {
        for (const id in D.WEAPONS) {
          const def = D.WEAPONS[id];
          if (def.evolved) continue;
          if (p.weapons.some((w) => w.id === id)) continue;
          if (ban.has('w:' + id)) continue;
          pool.push({ type: 'w', id, w: 1.2 });
        }
      }
      for (const w of p.weapons) {
        const def = D.WEAPONS[w.id];
        if (w.lv >= def.max) continue;
        if (ban.has('wu:' + w.id)) continue;
        pool.push({ type: 'wu', id: w.id, lv: w.lv + 1, w: w.evolved ? 0.6 : 1.0 });
      }
      for (const id in D.PASSIVES) {
        const have = p.passives[id] || 0;
        const def = D.PASSIVES[id];
        if (have >= def.max) continue;
        if (ban.has('p:' + id)) continue;
        pool.push({ type: 'p', id, lv: have + 1, w: 0.95 });
      }
      pool.push({ type: 'gold', id: 'gold', w: 0.3 });
      pool.push({ type: 'heal', id: 'heal', w: 0.22 });
      return pool;
    },

    rollCards() {
      const p = this.player;
      const pool = this.buildCardPool(p);
      const cards = [], used = new Set();
      for (let k = 0; k < 60 && cards.length < 3; k++) {
        let total = 0;
        for (const o of pool) if (!used.has(o.type + o.id)) total += o.w;
        if (total <= 0) break;
        let r = this.random() * total, chosen = null;
        for (const o of pool) {
          if (used.has(o.type + o.id)) continue;
          r -= o.w;
          if (r <= 0) { chosen = o; break; }
        }
        if (!chosen) continue;
        used.add(chosen.type + chosen.id);
        cards.push(chosen);
      }
      while (cards.length < 3) cards.push({ type: 'gold', id: 'gold' + cards.length, w: 1 });
      this.pendingCards = cards;
      return cards;
    },

    applyCard(card) {
      const p = this.player;
      if (card.type === 'w') this.addWeapon(p, card.id);
      else if (card.type === 'wu') {
        const w = p.weapons.find((x) => x.id === card.id);
        if (w && w.lv < D.WEAPONS[card.id].max) {
          w.lv++;
          D.WEAPONS[card.id].level(w.st, w.lv);
        }
      } else if (card.type === 'p') {
        p.passives[card.id] = (p.passives[card.id] || 0) + 1;
      } else if (card.type === 'evo') {
        this.evolveWeapon(p, card.from, card.id);
      } else if (card.type === 'gold') {
        const g = Math.round(60 * (1 + p.stat.greed));
        p.gold += g; p.totalGold += g;
      } else if (card.type === 'heal') {
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.35);
      }
      this.recompute(p);
      p.pendingLevels = Math.max(0, p.pendingLevels - 1);
      this.pendingLevels = p.pendingLevels;
      this.sfx('pickup');
      this.ui.onCardApplied(this);
    },

    banishCard(card) {
      if (!this.banished) this.banished = new Set();
      if (card.type === 'evo') this.banished.add('evo:' + card.id);
      else if (card.type === 'w') this.banished.add('w:' + card.id);
      else if (card.type === 'wu') this.banished.add('wu:' + card.id);
      else if (card.type === 'p') this.banished.add('p:' + card.id);
    },

    rerollCards() {
      if (this.rerolls <= 0) return false;
      this.rerolls--;
      this.rollCards();
      return true;
    },

    skipCard() {
      const p = this.player;
      const g = Math.round(15 * (1 + p.stat.greed));
      p.gold += g; p.totalGold += g;
      p.pendingLevels = Math.max(0, p.pendingLevels - 1);
      this.pendingLevels = p.pendingLevels;
    },

    /* ---------- 特效更新 ---------- */
    updateEffects(dt) {
      const arrs = [this.texts, this.arcs, this.novas, this.zaps, this.markers, this.orbits,
        this.beams || [], this.spikes || []];
      for (const a of arrs) {
        for (let i = a.length - 1; i >= 0; i--) {
          a[i].t += dt;
          if (a[i].t > a[i].life) a.splice(i, 1);
        }
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const q = this.particles[i];
        q.t += dt;
        q.x += q.vx * dt; q.y += q.vy * dt;
        q.vx *= Math.pow(0.02, dt); q.vy *= Math.pow(0.02, dt);
        if (q.t > q.life) this.particles.splice(i, 1);
      }
      for (const t of this.texts) t.y += t.vy * dt;
    },

    toast(msg) { this.ui.toast(msg); },

    /* ============================ 渲染 ============================ */
    render(dt) {
      const c = this.ctx, S = this.scale * this.dpr;
      c.setTransform(S, 0, 0, S, 0, 0);
      const W = this.viewW, H = this.viewH;
      c.fillStyle = this.bgColor();
      c.fillRect(0, 0, W, H);
      this.drawGrid(c, W, H);

      const camx = this.cam.x + this.cam.sx, camy = this.cam.y + this.cam.sy;
      c.save();
      c.translate(W / 2 - camx, H / 2 - camy);
      this.drawMarkers(c);
      this.drawZones(c);
      this.drawGems(c);
      this.drawChests(c);
      this.drawItems(c);
      this.drawOrbits(c);
      if (this.state !== 'menu' && this.player) this.drawPlayer(c);
      this.drawEnemies(c);
      this.drawSummons(c);
      this.drawProjectiles(c);
      this.drawBeams(c);
      this.drawSpikes(c);
      this.drawEffects(c);
      this.drawTexts(c);
      c.restore();

      this.drawVignette(c, W, H);
      if (this.state !== 'menu' && this.player && this.ui.settings.minimap !== false) this.drawMinimap(c, W, H);
      if (this.ui.settings.showFps && this.fps) {
        c.fillStyle = 'rgba(255,255,255,.6)';
        c.font = '12px monospace';
        c.textAlign = 'left';
        c.fillText(`${this.fps} FPS · ${this.enemies.length}E · ${this.projectiles.length}P`, 10, H - 10);
      }
    },

    bgColor() {
      const m = this.t / 60;
      const stops = [
        [0, [15, 12, 26], [24, 20, 42]],
        [5, [17, 21, 28], [23, 38, 44]],
        [10, [28, 17, 25], [50, 25, 33]],
        [15, [24, 11, 19], [60, 19, 27]],
        [20, [11, 15, 33], [23, 11, 42]],
        [30, [6, 7, 16], [17, 7, 28]],
      ];
      let a = stops[0], b = stops[stops.length - 1];
      for (let i = 0; i < stops.length - 1; i++) {
        if (m >= stops[i][0] && m <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
      }
      const t = clamp((m - a[0]) / Math.max(0.001, b[0] - a[0]), 0, 1);
      const mix = (i) => Math.round(lerp(a[1][i], b[1][i], t));
      return `rgb(${mix(0)},${mix(1)},${mix(2)})`;
    },

    drawGrid(c, W, H) {
      const G = 128;
      const camx = this.cam.x + this.cam.sx, camy = this.cam.y + this.cam.sy;
      const ox = ((-camx % G) + G) % G, oy = ((-camy % G) + G) % G;
      c.strokeStyle = 'rgba(255,255,255,0.04)';
      c.lineWidth = 1;
      c.beginPath();
      for (let x = ox - G; x < W + G; x += G) { c.moveTo(x, 0); c.lineTo(x, H); }
      for (let y = oy - G; y < H + G; y += G) { c.moveTo(0, y); c.lineTo(W, y); }
      c.stroke();
    },

    drawMarkers(c) {
      for (const mk of this.markers) {
        const k = mk.t / mk.life;
        c.save();
        c.translate(mk.x, mk.y);
        c.strokeStyle = `rgba(255,90,90,${0.9 - k * 0.5})`;
        c.lineWidth = 2;
        c.setLineDash([6, 4]);
        c.beginPath();
        c.arc(0, 0, 42 * (1 - k * 0.22), 0, TAU);
        c.stroke();
        c.setLineDash([]);
        c.restore();
      }
    },

    drawZones(c) {
      for (const z of this.zones) {
        const k = clamp(z.life / z.max, 0, 1);
        c.save();
        c.globalAlpha = 0.16 + k * 0.2;
        c.fillStyle = z.color;
        c.beginPath();
        c.arc(z.x, z.y, z.r, 0, TAU);
        c.fill();
        c.globalAlpha = 0.4;
        c.strokeStyle = z.color;
        c.lineWidth = 2;
        c.stroke();
        c.restore();
      }
    },

    drawGems(c) {
      for (const g of this.gems) {
        const p = 1 + Math.sin(g.t * 8) * 0.14;
        const gold = g.gold > 3;
        c.save();
        c.translate(g.x, g.y);
        c.scale(p, p);
        c.fillStyle = gold ? '#ffd166' : '#7ee8fa';
        c.shadowColor = c.fillStyle;
        c.shadowBlur = 8;
        c.beginPath();
        if (gold) c.arc(0, 0, 4.6, 0, TAU);
        else { c.moveTo(0, -6); c.lineTo(4, 0); c.lineTo(0, 6); c.lineTo(-4, 0); }
        c.fill();
        c.restore();
      }
    },

    drawChests(c) {
      for (const ch of this.chests) {
        c.save();
        c.translate(ch.x, ch.y + Math.sin(ch.t * 4) * 2);
        c.fillStyle = ch.mini ? '#c99a20' : '#f4a259';
        c.shadowColor = '#ffd166';
        c.shadowBlur = 22;
        c.fillRect(-ch.r, -ch.r * 0.75, ch.r * 2, ch.r * 1.5);
        c.fillStyle = '#7a4a12';
        c.fillRect(-ch.r, -2, ch.r * 2, 4);
        c.fillStyle = '#fff3c4';
        c.fillRect(-3, -4, 6, 8);
        c.restore();
      }
    },

    drawItems(c) {
      for (const it of this.items) {
        c.save();
        c.translate(it.x, it.y + Math.sin(it.t * 5) * 3);
        c.shadowColor = it.def.color;
        c.shadowBlur = 18;
        c.fillStyle = it.def.color;
        c.beginPath();
        c.arc(0, 0, it.r, 0, TAU);
        c.fill();
        c.font = '14px system-ui';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(it.def.ico, 0, 1);
        c.restore();
      }
      c.textBaseline = 'alphabetic';
    },

    drawOrbits(c) {
      for (const o of this.orbits) {
        c.save();
        c.translate(o.x, o.y);
        c.rotate(o.a);
        c.globalAlpha = 1 - o.t / o.life;
        c.fillStyle = o.color;
        c.shadowColor = o.color;
        c.shadowBlur = 12;
        c.fillRect(-9, -6, 18, 12);
        c.restore();
      }
    },

    drawPlayer(c) {
      const p = this.player;
      const blink = p.iframe > 0 && Math.floor(p.iframe * 22) % 2 === 0;
      c.save();
      c.translate(p.x, p.y);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.beginPath();
      c.ellipse(0, p.r * 0.85, p.r * 0.85, p.r * 0.4, 0, 0, TAU);
      c.fill();
      if (!blink) {
        c.translate(0, Math.sin(p.walk) * 2);
        if (p.invul > 0) { c.shadowColor = '#ffd166'; c.shadowBlur = 26; }
        if (p.dashT > 0) { c.shadowColor = '#7ee8fa'; c.shadowBlur = 30; }
        // 披风
        c.fillStyle = p.char.id === 'witch' ? '#5b2a8c' : p.char.id === 'necro' ? '#2a2a3f'
          : p.char.id === 'blademaster' ? '#7c2d3a' : '#3a2c6b';
        c.beginPath();
        c.moveTo(-p.r * 0.95, -2);
        c.quadraticCurveTo(0, p.r * 2, p.r * 0.95, -2);
        c.closePath();
        c.fill();
        // 身体
        c.fillStyle = p.hitFlash > 0 ? '#ff9aa8' : '#e9e4ff';
        c.beginPath();
        c.arc(0, 0, p.r, 0, TAU);
        c.fill();
        // 兜帽
        c.fillStyle = '#2b2140';
        c.beginPath();
        c.arc(0, -p.r * 0.35, p.r * 0.74, Math.PI, TAU);
        c.fill();
        // 眼
        c.fillStyle = '#ffd166';
        const ex = p.aimX > 0 ? 1 : -1;
        c.beginPath();
        c.arc(ex * 4, -p.r * 0.15, 2, 0, TAU);
        c.arc(ex * 9, -p.r * 0.1, 2, 0, TAU);
        c.fill();
        // 朝向标
        c.strokeStyle = 'rgba(255,209,102,0.55)';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(Math.cos(p.aimAng) * (p.r + 5), Math.sin(p.aimAng) * (p.r + 5));
        c.lineTo(Math.cos(p.aimAng) * (p.r + 18), Math.sin(p.aimAng) * (p.r + 18));
        c.stroke();
      }
      c.restore();
    },

    drawEnemies(c) {
      for (const e of this.enemies) {
        const bob = Math.sin(e.anim) * (e.boss ? 4 : 2);
        c.save();
        c.translate(e.x, e.y + bob);
        if (e.boss) { c.shadowColor = e.def.color; c.shadowBlur = 30; }
        let body = e.def.color;
        if (e.frozen > 0) body = '#bfeaff';
        else if (e.flash > 0) body = '#ffffff';
        else if (e.burn) body = this.mix(e.def.color, '#ff7b3c', 0.45);

        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.beginPath();
        c.ellipse(0, e.r * 0.85 - bob, e.r * 0.8, e.r * 0.35, 0, 0, TAU);
        c.fill();

        c.fillStyle = body;
        this.drawEnemyShape(c, e, body);

        c.restore();

        if (e.hp < e.maxHp && !e.boss) {
          const w = e.r * 2, hh = 3;
          c.fillStyle = 'rgba(0,0,0,0.55)';
          c.fillRect(e.x - w / 2, e.y - e.r - 10, w, hh);
          c.fillStyle = e.elite ? '#ff4d6d' : '#06d6a0';
          c.fillRect(e.x - w / 2, e.y - e.r - 10, w * clamp(e.hp / e.maxHp, 0, 1), hh);
        }
        if (e.boss) {
          c.font = 'bold 12px system-ui';
          c.textAlign = 'center';
          c.fillStyle = '#ffd166';
          c.fillText(e.def.name, e.x, e.y - e.r - 14);
        }
      }
      c.textAlign = 'left';
    },

    drawEnemyShape(c, e, body) {
      const r = e.r, sh = e.def.shape;
      if (sh === 'bat') {
        const f = Math.sin(e.anim * 2) * 0.5 + 0.5;
        c.fillStyle = e.def.dark;
        c.beginPath();
        c.moveTo(-r * 2.2, -r * 0.6 - f * r);
        c.quadraticCurveTo(-r * 0.6, -r * 1.6, 0, 0);
        c.quadraticCurveTo(r * 0.6, -r * 1.6, r * 2.2, -r * 0.6 - f * r);
        c.quadraticCurveTo(r * 0.8, r * 0.3, 0, r * 0.2);
        c.quadraticCurveTo(-r * 0.8, r * 0.3, -r * 2.2, -r * 0.6 - f * r);
        c.fill();
        c.fillStyle = body;
        c.beginPath();
        c.arc(0, 0, r * 0.8, 0, TAU);
        c.fill();
      } else if (sh === 'skel') {
        c.strokeStyle = body;
        c.lineWidth = 3;
        c.lineCap = 'round';
        c.beginPath();
        c.arc(0, -r * 0.5, r * 0.48, 0, TAU);
        c.stroke();
        c.beginPath();
        c.moveTo(0, 0); c.lineTo(0, r * 0.8);
        c.moveTo(-r * 0.55, r * 0.2); c.lineTo(r * 0.55, r * 0.2);
        c.moveTo(-r * 0.4, r * 0.9); c.lineTo(r * 0.4, r * 0.9);
        c.stroke();
        c.fillStyle = '#1a1226';
        c.beginPath();
        c.arc(-r * 0.17, -r * 0.55, 2, 0, TAU);
        c.arc(r * 0.17, -r * 0.55, 2, 0, TAU);
        c.fill();
      } else if (sh === 'ghost') {
        c.globalAlpha = 0.86;
        c.beginPath();
        c.arc(0, -r * 0.1, r * 0.9, Math.PI, 0);
        c.lineTo(r * 0.9, r * 0.8);
        for (let i = 0; i < 3; i++) {
          const x = r * 0.9 - r * 0.45 * (i * 2 + 1);
          c.quadraticCurveTo(x, r * 0.5, x - r * 0.45, r * 0.8);
        }
        c.lineTo(-r * 0.9, r * 0.8);
        c.closePath();
        c.fill();
        c.globalAlpha = 1;
        c.fillStyle = '#0e2233';
        c.beginPath();
        c.arc(-r * 0.28, -r * 0.2, 2.4, 0, TAU);
        c.arc(r * 0.28, -r * 0.2, 2.4, 0, TAU);
        c.fill();
      } else if (sh === 'spider') {
        c.strokeStyle = e.def.dark;
        c.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const a = -0.7 + i * 0.46;
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(Math.cos(a) * r * 1.7, Math.sin(a) * r * 1.7 + r * 0.3);
          c.moveTo(0, 0);
          c.lineTo(Math.cos(Math.PI - a) * r * 1.7, Math.sin(Math.PI - a) * r * 1.7 + r * 0.3);
          c.stroke();
        }
        c.beginPath();
        c.arc(0, 0, r * 0.72, 0, TAU);
        c.fill();
        c.fillStyle = '#ff2d55';
        c.beginPath();
        c.arc(-r * 0.2, -r * 0.15, 2, 0, TAU);
        c.arc(r * 0.2, -r * 0.15, 2, 0, TAU);
        c.fill();
      } else if (sh === 'rune') {
        c.save();
        c.rotate(e.anim * 0.4);
        c.strokeStyle = body;
        c.lineWidth = 3;
        c.shadowColor = body;
        c.shadowBlur = 14;
        c.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          const px = Math.cos(a) * r, py = Math.sin(a) * r;
          if (i) c.lineTo(px, py); else c.moveTo(px, py);
        }
        c.closePath();
        c.stroke();
        c.restore();
      } else if (sh === 'armor') {
        c.fillStyle = e.def.dark;
        c.fillRect(-r, -r * 0.9, r * 2, r * 1.8);
        c.fillStyle = body;
        c.fillRect(-r * 0.7, -r * 0.6, r * 1.4, r * 0.5);
        c.fillRect(-r * 0.7, r * 0.1, r * 1.4, r * 0.5);
        c.fillStyle = '#ff4d6d';
        c.fillRect(-r * 0.25, -r * 0.35, r * 0.5, r * 0.2);
      } else if (sh === 'chest') {
        c.fillStyle = '#f4a259';
        c.fillRect(-r, -r * 0.7, r * 2, r * 1.5);
        c.fillStyle = '#7a4a12';
        c.fillRect(-r, -2, r * 2, 4);
        c.fillStyle = '#fff3c4';
        c.fillRect(-3, -4, 6, 8);
        c.fillStyle = '#ff2d55';
        c.beginPath();
        c.arc(-r * 0.35, -r * 0.45, 2.5, 0, TAU);
        c.arc(r * 0.35, -r * 0.45, 2.5, 0, TAU);
        c.fill();
      } else if (sh === 'gargoyle') {
        c.fillStyle = body;
        c.beginPath();
        c.moveTo(0, -r);
        c.lineTo(r, -r * 0.2);
        c.lineTo(r * 0.8, r * 0.9);
        c.lineTo(-r * 0.8, r * 0.9);
        c.lineTo(-r, -r * 0.2);
        c.closePath();
        c.fill();
        c.fillStyle = e.def.dark;
        c.beginPath();
        c.moveTo(-r * 1.5, -r * 0.5);
        c.lineTo(-r * 0.7, -r * 0.2);
        c.lineTo(-r * 1.4, r * 0.3);
        c.closePath();
        c.moveTo(r * 1.5, -r * 0.5);
        c.lineTo(r * 0.7, -r * 0.2);
        c.lineTo(r * 1.4, r * 0.3);
        c.closePath();
        c.fill();
        c.fillStyle = '#ffd166';
        c.beginPath();
        c.arc(-r * 0.3, -r * 0.3, 2.5, 0, TAU);
        c.arc(r * 0.3, -r * 0.3, 2.5, 0, TAU);
        c.fill();
      } else if (sh === 'elite') {
        c.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU, rr = i % 2 ? r * 0.75 : r;
          const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
          if (i) c.lineTo(px, py); else c.moveTo(px, py);
        }
        c.closePath();
        c.fill();
        c.strokeStyle = '#ffd166';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(0, 0, r * 1.25, 0, TAU);
        c.stroke();
        c.fillStyle = '#1a1226';
        c.beginPath();
        c.arc(-r * 0.3, -r * 0.1, 3, 0, TAU);
        c.arc(r * 0.3, -r * 0.1, 3, 0, TAU);
        c.fill();
      } else if (sh === 'brute') {
        c.beginPath();
        c.moveTo(0, -r);
        c.quadraticCurveTo(r * 1.05, -r * 0.5, r * 0.9, r * 0.7);
        c.quadraticCurveTo(0, r * 1.1, -r * 0.9, r * 0.7);
        c.quadraticCurveTo(-r * 1.05, -r * 0.5, 0, -r);
        c.fill();
        c.fillStyle = '#1a1226';
        c.beginPath();
        c.arc(-r * 0.3, -r * 0.1, r * 0.13, 0, TAU);
        c.arc(r * 0.3, -r * 0.1, r * 0.13, 0, TAU);
        c.fill();
      } else if (sh === 'boss') {
        c.fillStyle = e.def.dark;
        c.beginPath();
        c.arc(0, 0, r, 0, TAU);
        c.fill();
        c.fillStyle = body;
        c.beginPath();
        c.arc(0, -r * 0.1, r * 0.72, 0, TAU);
        c.fill();
        c.strokeStyle = '#ffd166';
        c.lineWidth = 6;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(-r * 0.5, -r * 0.55); c.lineTo(-r * 0.88, -r * 1.15);
        c.moveTo(r * 0.5, -r * 0.55); c.lineTo(r * 0.88, -r * 1.15);
        c.stroke();
        c.fillStyle = e.frozen > 0 ? '#bfeaff' : '#ff2d55';
        c.shadowColor = c.fillStyle;
        c.shadowBlur = 18;
        c.beginPath();
        c.arc(-r * 0.26, -r * 0.2, r * 0.11, 0, TAU);
        c.arc(r * 0.26, -r * 0.2, r * 0.11, 0, TAU);
        c.fill();
      } else {
        c.beginPath();
        c.moveTo(0, -r);
        c.quadraticCurveTo(r, -r * 0.2, r * 0.76, r * 0.7);
        c.quadraticCurveTo(0, r * 1.05, -r * 0.76, r * 0.7);
        c.quadraticCurveTo(-r, -r * 0.2, 0, -r);
        c.fill();
        c.fillStyle = '#1a1226';
        c.beginPath();
        c.arc(-r * 0.3, -r * 0.1, r * 0.13, 0, TAU);
        c.arc(r * 0.3, -r * 0.1, r * 0.13, 0, TAU);
        c.fill();
      }
    },

    drawSummons(c) {
      for (const s of this.summons) {
        c.save();
        c.translate(s.x, s.y);
        c.fillStyle = s.color;
        c.shadowColor = s.color;
        c.shadowBlur = 12;
        c.beginPath();
        c.arc(0, 0, s.r, 0, TAU);
        c.fill();
        c.restore();
      }
    },

    drawProjectiles(c) {
      for (const q of this.projectiles) {
        c.save();
        c.translate(q.x, q.y);
        const a = Math.atan2(q.vy, q.vx);
        c.rotate(q.spin ? q.t * 16 : a);
        c.shadowBlur = 10;
        switch (q.kind) {
          case 'kunai':
            c.fillStyle = '#dfe6ff';
            c.shadowColor = '#9ec1ff';
            c.beginPath();
            c.moveTo(10, 0); c.lineTo(-6, -3.5); c.lineTo(-6, 3.5);
            c.closePath();
            c.fill();
            break;
          case 'fireball':
            c.fillStyle = '#ff9e4f';
            c.shadowColor = '#ff6b3d';
            c.shadowBlur = 22;
            c.beginPath();
            c.arc(0, 0, q.r, 0, TAU);
            c.fill();
            c.fillStyle = '#ffe066';
            c.beginPath();
            c.arc(-2, -2, q.r * 0.45, 0, TAU);
            c.fill();
            break;
          case 'axe':
            c.fillStyle = '#cfd6e6';
            c.shadowColor = '#fff';
            c.fillRect(-3, -12, 6, 24);
            c.fillStyle = '#e5e9f2';
            c.beginPath();
            c.moveTo(0, -11);
            c.quadraticCurveTo(17, 0, 0, 11);
            c.closePath();
            c.fill();
            break;
          case 'bolt':
            c.fillStyle = '#e9d5ff';
            c.shadowColor = '#c084fc';
            c.shadowBlur = 16;
            c.beginPath();
            c.arc(0, 0, q.r, 0, TAU);
            c.fill();
            break;
          case 'boomerang':
            c.strokeStyle = '#f4a259';
            c.shadowColor = '#ffd166';
            c.lineWidth = 5;
            c.lineCap = 'round';
            c.beginPath();
            c.moveTo(-10, -8); c.lineTo(6, 0); c.lineTo(-10, 8);
            c.stroke();
            break;
          case 'saw':
            c.fillStyle = '#b8c4d9';
            c.beginPath();
            for (let i = 0; i < 10; i++) {
              const aa = (i / 10) * TAU, rr = i % 2 ? q.r : q.r * 0.72;
              const px = Math.cos(aa) * rr, py = Math.sin(aa) * rr;
              if (i) c.lineTo(px, py); else c.moveTo(px, py);
            }
            c.closePath();
            c.fill();
            c.fillStyle = '#334155';
            c.beginPath();
            c.arc(0, 0, q.r * 0.28, 0, TAU);
            c.fill();
            break;
          case 'rocket':
            c.fillStyle = '#ff8fa3';
            c.shadowColor = '#ff4d6d';
            c.beginPath();
            c.moveTo(9, 0); c.lineTo(-5, -4); c.lineTo(-5, 4);
            c.closePath();
            c.fill();
            c.fillStyle = '#ffd166';
            c.beginPath();
            c.arc(-7, 0, 3, 0, TAU);
            c.fill();
            break;
          case 'potion':
            c.fillStyle = '#a3e635';
            c.shadowColor = '#84cc16';
            c.shadowBlur = 14;
            c.beginPath();
            c.arc(0, 0, q.r, 0, TAU);
            c.fill();
            break;
          default:
            c.fillStyle = '#fff';
            c.beginPath();
            c.arc(0, 0, q.r, 0, TAU);
            c.fill();
        }
        c.restore();
      }
    },

    drawBeams(c) {
      for (const b of this.beams || []) {
        const k = b.t / b.life;
        c.save();
        c.translate(b.x, b.y);
        c.rotate(b.ang);
        const g = c.createLinearGradient(0, 0, b.len, 0);
        g.addColorStop(0, b.color);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.globalAlpha = 1 - k;
        c.fillStyle = g;
        c.fillRect(0, -b.width / 2 * (1 - k * 0.3), b.len, b.width * (1 - k * 0.3));
        c.restore();
      }
    },

    drawSpikes(c) {
      for (const s of this.spikes || []) {
        const k = s.t / s.life;
        c.save();
        c.translate(s.x, s.y);
        c.fillStyle = `rgba(229,224,207,${1 - k})`;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(-5, -s.h * (1 - k * 0.2));
        c.lineTo(5, -s.h * (1 - k * 0.2));
        c.closePath();
        c.fill();
        c.restore();
      }
    },

    drawEffects(c) {
      for (const a of this.arcs) {
        const k = a.t / a.life;
        c.save();
        c.translate(a.x, a.y);
        c.rotate(a.ang - a.width / 2);
        c.strokeStyle = a.color;
        c.globalAlpha = 1 - k;
        c.lineWidth = 8 * (1 - k) + 3;
        c.beginPath();
        c.arc(0, 0, a.reach * (0.72 + k * 0.28), 0, a.width);
        c.stroke();
        c.restore();
      }
      for (const q of this.particles) {
        const k = q.t / q.life;
        c.globalAlpha = 1 - k;
        if (q.ring) {
          c.strokeStyle = q.color;
          c.lineWidth = 2;
          c.beginPath();
          c.arc(q.x, q.y, q.r, 0, TAU);
          c.stroke();
        } else {
          c.fillStyle = q.color;
          c.beginPath();
          c.arc(q.x, q.y, q.r * (1 - k * 0.4), 0, TAU);
          c.fill();
        }
        c.globalAlpha = 1;
      }
      for (const n of this.novas) {
        const k = n.t / n.life;
        c.strokeStyle = n.c0;
        c.globalAlpha = 1 - k;
        c.lineWidth = 6 * (1 - k) + 1;
        c.beginPath();
        c.arc(n.x, n.y, n.r * (0.25 + k * 0.85), 0, TAU);
        c.stroke();
        c.globalAlpha = 1;
      }
      for (const z of this.zaps) {
        const k = z.t / z.life;
        c.strokeStyle = z.color.replace(')', `,${1 - k})`).replace('rgb', 'rgba');
        if (z.color.startsWith('#')) c.strokeStyle = z.color;
        c.globalAlpha = 1 - k;
        c.lineWidth = z.thin ? 2.5 : 3.5;
        c.shadowColor = '#ffe066';
        c.shadowBlur = 16;
        c.beginPath();
        z.pts.forEach((pt, i) => {
          const jx = pt.x + this.rand(-5, 5), jy = pt.y + this.rand(-5, 5);
          if (i) c.lineTo(jx, jy); else c.moveTo(jx, jy);
        });
        c.stroke();
        c.shadowBlur = 0;
        c.globalAlpha = 1;
      }
    },

    drawTexts(c) {
      c.textAlign = 'center';
      for (const t of this.texts) {
        const k = t.t / t.life;
        c.globalAlpha = 1 - k * k;
        c.font = `bold ${t.size}px "Segoe UI", system-ui`;
        c.fillStyle = '#000';
        c.fillText(t.v, t.x + 1.5, t.y + 1.5);
        c.fillStyle = t.color;
        c.fillText(t.v, t.x, t.y);
        c.globalAlpha = 1;
      }
      c.textAlign = 'left';
    },

    drawMinimap(c, W, H) {
      const size = 104, pad = 14;
      const x0 = W - size - pad, y0 = H - size - pad;
      const R = 900;
      c.save();
      c.fillStyle = 'rgba(10,8,20,0.7)';
      c.fillRect(x0, y0, size, size);
      c.strokeStyle = 'rgba(255,255,255,0.16)';
      c.strokeRect(x0, y0, size, size);
      c.beginPath();
      c.rect(x0, y0, size, size);
      c.clip();
      const cx = x0 + size / 2, cy = y0 + size / 2, k = (size / 2) / R;
      for (const e of this.enemies) {
        const dx = e.x - this.player.x, dy = e.y - this.player.y;
        if (dx * dx + dy * dy > R * R) continue;
        c.fillStyle = e.boss ? '#ff4d6d' : e.elite ? '#ffb45c' : 'rgba(255,120,140,0.85)';
        const s = e.boss ? 5 : 2;
        c.fillRect(cx + dx * k - s / 2, cy + dy * k - s / 2, s, s);
      }
      for (const ch of this.chests) {
        const dx = ch.x - this.player.x, dy = ch.y - this.player.y;
        if (dx * dx + dy * dy > R * R) continue;
        c.fillStyle = '#ffd166';
        c.fillRect(cx + dx * k - 2, cy + dy * k - 2, 4, 4);
      }
      c.fillStyle = '#7ee8fa';
      c.fillRect(cx - 2, cy - 2, 4, 4);
      c.restore();
    },

    drawVignette(c, W, H) {
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.74);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      if (this.player && this.player.hitFlash > 0 && this.settings.screenFlash && this.state !== 'menu') {
        c.fillStyle = `rgba(255,60,90,${this.player.hitFlash * 0.45})`;
        c.fillRect(0, 0, W, H);
      }
    },

    mix(a, b, t) {
      const pa = this.hex(a), pb = this.hex(b);
      return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], t))).join(',')})`;
    },
    hex(h) {
      h = h.replace('#', '');
      if (h.length === 3) h = h.split('').map((x) => x + x).join('');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    },
  };

  global.DSGame = Game;
  global.DSInput = Input;
  global.DSAudio = AudioFX;
})(window);
