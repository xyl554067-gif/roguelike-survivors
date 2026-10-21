/* =====================================================================
   夜刃求生 v2 · 存档层
   本地存档 / 金币库 / 商店等级 / 成就 / 统计 / 设置 / 导入导出
   ===================================================================== */
(function (global) {
  'use strict';
  const KEY = 'nrjs_save_v2';
  const VERSION = 2;

  const DEFAULT_STATS = {
    kills: 0, bestTime: 0, bestLevel: 0, goldEarned: 0, elites: 0, bosses: 0,
    wins: 0, winDiff: [], evolutions: 0, maxWeapons: 0, dashes: 0,
    noHit5: false, charsPlayed: [], weaponsUsed: [], runs: 0, playtime: 0,
  };

  const DEFAULT_SETTINGS = {
    sfx: true, shake: true, particles: true, damageNumbers: true,
    screenFlash: true, autoPause: true, showFps: false, minimap: true,
  };

  function blank() {
    return {
      version: VERSION,
      gold: 0,
      shop: {},
      achievements: {},
      stats: JSON.parse(JSON.stringify(DEFAULT_STATS)),
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      best: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  const Save = {
    data: blank(),
    dirty: false,
    _timer: 0,

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.data = this.migrate(parsed);
        } else {
          this.data = blank();
        }
      } catch (e) {
        console.warn('[save] 读取失败，使用新存档', e);
        this.data = blank();
      }
      return this.data;
    },

    migrate(old) {
      const base = blank();
      if (!old || typeof old !== 'object') return base;
      const d = Object.assign(base, old);
      d.version = VERSION;
      d.stats = Object.assign(JSON.parse(JSON.stringify(DEFAULT_STATS)), old.stats || {});
      d.settings = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), old.settings || {});
      d.shop = old.shop || {};
      d.achievements = old.achievements || {};
      d.best = old.best || {};
      d.gold = Number(old.gold) || 0;
      // v1 旧存档兼容：把旧 best 转成统计
      return d;
    },

    save() {
      this.data.updatedAt = Date.now();
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data));
        this.dirty = false;
      } catch (e) {
        console.warn('[save] 写入失败', e);
      }
    },

    /* 节流保存，避免每帧写盘 */
    touch() {
      this.dirty = true;
      if (this._timer) return;
      this._timer = setTimeout(() => { this._timer = 0; if (this.dirty) this.save(); }, 900);
    },

    flush() {
      if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
      if (this.dirty) this.save();
    },

    reset() {
      this.data = blank();
      this.save();
    },

    /* ---------- 金币 / 商店 ---------- */
    get gold() { return this.data.gold; },
    addGold(n) {
      n = Math.max(0, Math.round(n));
      this.data.gold += n;
      this.data.stats.goldEarned += n;
      this.touch();
      return n;
    },
    spendGold(n) {
      n = Math.max(0, Math.round(n));
      if (this.data.gold < n) return false;
      this.data.gold -= n;
      this.touch();
      return true;
    },
    shopLevel(id) { return this.data.shop[id] || 0; },
    shopCost(def) { return def.cost(this.shopLevel(def.id)); },
    buy(def) {
      const lv = this.shopLevel(def.id);
      if (lv >= def.max) return { ok: false, reason: 'max' };
      const cost = this.shopCost(def);
      if (!this.spendGold(cost)) return { ok: false, reason: 'gold' };
      this.data.shop[def.id] = lv + 1;
      this.touch();
      return { ok: true, cost, level: lv + 1 };
    },
    /** 把商店加成写入初始属性 */
    applyShopStats(stat) {
      for (const def of global.DSData.SHOP) {
        const lv = this.shopLevel(def.id);
        for (let i = 0; i < lv; i++) def.apply(stat);
      }
      return stat;
    },

    /* ---------- 成就 ---------- */
    unlocked(id) { return !!this.data.achievements[id]; },
    checkAchievements(notify) {
      const unlocked = [];
      for (const a of global.DSData.ACHIEVEMENTS) {
        if (this.unlocked(a.id)) continue;
        let ok = false;
        try { ok = !!a.check(this.data); } catch (e) { ok = false; }
        if (ok) {
          this.data.achievements[a.id] = Date.now();
          this.addGold(a.reward || 0);
          unlocked.push(a);
        }
      }
      if (unlocked.length) this.save();
      if (notify) unlocked.forEach((a) => notify(a));
      return unlocked;
    },
    achCount() {
      const all = global.DSData.ACHIEVEMENTS.length;
      const got = global.DSData.ACHIEVEMENTS.filter((a) => this.unlocked(a.id)).length;
      return { got, all };
    },

    /* ---------- 角色解锁 ---------- */
    isCharUnlocked(c) {
      if (!c.unlock) return true;
      return this.unlocked(c.unlock);
    },

    /* ---------- 单局记录 ---------- */
    recordRun(run) {
      const s = this.data.stats;
      s.runs += 1;
      s.kills += run.kills | 0;
      s.elites += run.elites | 0;
      s.bosses += run.bosses | 0;
      s.dashes += run.dashes | 0;
      s.playtime += Math.round(run.time) | 0;
      s.bestTime = Math.max(s.bestTime, run.time);
      s.bestLevel = Math.max(s.bestLevel, run.level);
      s.maxWeapons = Math.max(s.maxWeapons, run.weapons | 0);
      s.evolutions += run.evolutions | 0;
      if (run.won) {
        s.wins += 1;
        if (!s.winDiff.includes(run.diff)) s.winDiff.push(run.diff);
      }
      if (run.time >= 300 && !run.hitTaken) s.noHit5 = true;
      if (!s.charsPlayed.includes(run.char)) s.charsPlayed.push(run.char);
      for (const w of run.weaponsUsed || []) if (!s.weaponsUsed.includes(w)) s.weaponsUsed.push(w);
      // 每角色最佳
      const cur = this.data.best[run.char];
      if (!cur || cur.time < run.time) {
        this.data.best[run.char] = {
          time: run.time, level: run.level, kills: run.kills, gold: run.runGold,
          diff: run.diff, won: !!run.won, at: Date.now(),
        };
      }
      this.touch();
      return this.checkAchievements();
    },

    /* ---------- 导入导出 ---------- */
    exportJSON() { return JSON.stringify(this.data, null, 2); },
    importJSON(text) {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') throw new Error('格式错误');
      this.data = this.migrate(parsed);
      this.save();
      return true;
    },
  };

  global.DSSave = Save;
})(window);
