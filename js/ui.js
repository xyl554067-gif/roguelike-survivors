/* =====================================================================
   夜刃求生 v2 · UI 层
   菜单 / 商店 / 成就 / 图鉴 / 设置 / 升级卡 / 暂停 / 结算
   ===================================================================== */
(function (global) {
  'use strict';

  const D = global.DSData;
  const Save = global.DSSave;

  const UI = {
    settings: {},
    selectedChar: null,
    selectedDiff: 'normal',
    bestFilter: 'weapons',
    _toastTimer: 0,
    _achQueue: [],
    _achShowing: false,

    init() {
      this.el = {};
      const ids = [
        'menu', 'hud', 'levelup', 'gameover', 'pause', 'settings', 'toast', 'achPop',
        'cards', 'loadout', 'cart', 'charInfo', 'bestList', 'shopList', 'shopGold',
        'achList', 'achProgress', 'bestGrid', 'menuSettings', 'modalSettings',
        'hpFill', 'hpText', 'xpFill', 'xpText', 'dashFill', 'dashText',
        'timeText', 'killText', 'goldText', 'warning', 'comboTag',
        'bossBar', 'bossName', 'bossFill', 'levelupSub', 'rerollLeft',
        'goTitle', 'goStats', 'goTip', 'goBreakdown', 'goRewards',
        'pauseBreakdown', 'achPopName', 'btnMute', 'selChar', 'selDiff', 'nextEvent',
        'selMode', 'unlockBox', 'rsGold', 'rsList', 'runshop', 'goalList',
        'touchPad', 'joyZone', 'joyBase', 'joyKnob', 'rotateHint',
      ];
      ids.forEach((id) => { this.el[id] = document.getElementById(id); });
      this.settings = Object.assign({}, Save.data.settings);
      this.selectedMode = this.settings.lastMode || 'campaign';

      this.bindMenu();
      this.bindLevelUp();
      this.bindGameOver();
      this.bindPause();
      this.bindSettings();
      this.bindRunShop();
      this.bindTouch();
      this.bindDisplay();
      this.buildSelectors();
      this.renderAll();
      this.audio = global.DSAudio;
      if (this.audio) this.audio.on = this.settings.sfx !== false;
    },

    /* ---------- 事件绑定 ---------- */
    bindMenu() {
      document.querySelectorAll('.tab').forEach((btn) => {
        btn.onclick = () => this.switchTab(btn.dataset.tab);
      });
      this.el.selChar.onchange = () => {
        this.selectedChar = this.el.selChar.value;
        this.renderCharInfo();
        Save.data.settings.lastChar = this.selectedChar;
        Save.touch();
      };
      this.el.selDiff.onchange = () => {
        this.selectedDiff = this.el.selDiff.value;
        Save.data.settings.lastDiff = this.selectedDiff;
        Save.touch();
        this.renderCharInfo();
      };
      if (this.el.selMode) {
        this.el.selMode.onchange = () => {
          this.selectedMode = this.el.selMode.value;
          this.settings.lastMode = this.selectedMode;
          Save.data.settings.lastMode = this.selectedMode;
          Save.touch();
          this.renderCharInfo();
        };
      }
      document.getElementById('btnStart').onclick = () => this.startGame();
      document.getElementById('btnWipe').onclick = () => this.wipeSave();
      this.el.btnMute.onclick = () => this.toggleMute();

      // 挑战
      document.getElementById('btnRandomChallenge').onclick = () => {
        this.randomChallenge = Save.randomChallenge();
        this.renderDaily();
      };
      document.getElementById('btnStartChallenge').onclick = () => this.startChallenge();

      document.querySelectorAll('#bestFilter .chip').forEach((c) => {
        c.onclick = () => {
          document.querySelectorAll('#bestFilter .chip').forEach((x) => x.classList.remove('active'));
          c.classList.add('active');
          this.bestFilter = c.dataset.filter;
          this.renderCodex();
        };
      });
    },

    bindLevelUp() {
      document.getElementById('btnReroll').onclick = () => {
        if (global.DSGame.rerollCards()) {
          this.pendingCards = global.DSGame.pendingCards;
          this._cardsHtml = null;   // 强制重建，让新卡牌有入场动画
          this.renderCards();
          Save.touch();
        }
      };
      document.getElementById('btnSkip').onclick = () => {
        global.DSGame.skipCard();
        this.afterCard();
      };
      document.getElementById('btnBanish').onclick = () => {
        this.banishMode = !this.banishMode;
        this.toast(this.banishMode ? '🚫 放逐模式：点击一张卡把它移出本局卡池' : '已退出放逐模式');
        this.renderCards();
      };
    },

    bindGameOver() {
      document.getElementById('btnRetry').onclick = () => {
        this.hide('gameover');
        this.startGame();
      };
      document.getElementById('btnMenu').onclick = () => {
        this.hide('gameover');
        this.toMenu();
      };
    },

    bindPause() {
      document.getElementById('btnResume').onclick = () => global.DSGame.resume();
      document.getElementById('btnRestart').onclick = () => {
        this.hide('pause');
        global.DSGame.state = 'menu';
        this.startGame();
      };
      document.getElementById('btnQuit').onclick = () => {
        this.hide('pause');
        const g = global.DSGame;
        g.state = 'playing';
        g.endRun(false);
      };
      document.getElementById('btnPauseSet').onclick = () => this.show('settings');
      const rs = document.getElementById('btnRunShop');
      if (rs) rs.onclick = () => this.openRunShop();
    },

    /* ---------- 局内商店 ---------- */
    bindRunShop() {
      const close = document.getElementById('btnRsClose');
      if (close) close.onclick = () => this.closeRunShop();
    },

    openRunShop() {
      const g = global.DSGame;
      if (!g || !g.player) return;
      this.renderRunShop();
      this.show('runshop');
      this.hide('pause');
      g.state = 'shop';
    },

    closeRunShop() {
      this.hide('runshop');
      const g = global.DSGame;
      if (!g) return;
      // 商店里买了「秘传卷轴」会攒下待升级，返回后直接弹卡
      if (g.player && g.player.pendingLevels > 0 && g.state === 'shop') {
        g.state = 'playing';
        this.openLevelUp(g);
      } else if (g.state === 'shop') {
        g.state = 'paused';
        this.show('pause');
      }
    },

    renderRunShop() {
      const g = global.DSGame;
      const p = g.player;
      const list = this.el.rsList;
      if (!list || !p) return;
      this.el.rsGold.textContent = p.gold;
      list.innerHTML = D.RUN_SHOP.map((def) => {
        const n = g.runShopCount(def.id);
        const price = g.runShopPrice(def);
        const sold = !g.runShopAvailable(def);
        const afford = p.gold >= price;
        return `
          <div class="shop-item ${sold ? 'sold' : afford ? '' : 'poor'}">
            <div class="si-ico">${def.ico}</div>
            <div class="si-main">
              <div class="si-name">${def.name} <span class="si-tag">${def.tag}</span>
                ${n ? `<span class="si-own">已购 ${n}${def.max > 0 ? '/' + def.max : ''}</span>` : ''}</div>
              <div class="si-desc">${def.desc}</div>
            </div>
            <button class="btn ${afford && !sold ? 'primary' : 'ghost'}" data-buy="${def.id}"
              ${afford && !sold ? '' : 'disabled'}>
              ${sold ? '已售罄' : `${price}💰`}</button>
          </div>`;
      }).join('');
      list.querySelectorAll('[data-buy]').forEach((btn) => {
        btn.onclick = () => {
          const r = global.DSGame.buyRunShop(btn.dataset.buy);
          if (r.ok) { this.renderRunShop(); }
          else if (r.reason === 'gold') this.toast('💰 金币不足');
          else if (r.reason === 'max') this.toast('🚫 已达购买上限');
        };
      });
    },

    /* ---------- 触屏控制 ---------- */
    isTouchDevice() {
      if (this.settings.forceTouchPad) return true;
      return ('ontouchstart' in window)
        || (navigator.maxTouchPoints || 0) > 0
        || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    },

    bindTouch() {
      const pad = this.el.touchPad;
      if (!pad) return;
      const zone = this.el.joyZone, base = this.el.joyBase, knob = this.el.joyKnob;
      if (!zone || !base || !knob) return;
      const R = 52;                       // 摇杆半径（px）
      let active = false, cx = 0, cy = 0;
      const reset = () => {
        active = false;
        base.style.transform = 'translate(-50%, -50%)';
        knob.style.transform = 'translate(-50%, -50%)';
        global.DSInput.setStick(0, 0, false);
      };
      const pos = (t) => {
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const m = Math.hypot(dx, dy);
        if (m > R) { dx = dx / m * R; dy = dy / m * R; }
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        const dead = 6;
        const on = m > dead;
        global.DSInput.setStick(on ? dx / R : 0, on ? dy / R : 0, on);
      };
      const down = (e) => {
        e.preventDefault();
        const t = e.touches ? e.touches[0] : e;
        const r = zone.getBoundingClientRect();
        cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        // 摇杆底座跟随落点，手指不必精准命中中心
        base.style.left = (t.clientX - r.left) + 'px';
        base.style.top = (t.clientY - r.top) + 'px';
        active = true;
        pos(t);
      };
      const move = (e) => {
        if (!active) return;
        e.preventDefault();
        pos(e.touches ? e.touches[0] : e);
      };
      zone.addEventListener('touchstart', down, { passive: false });
      zone.addEventListener('touchmove', move, { passive: false });
      zone.addEventListener('touchend', (e) => { e.preventDefault(); reset(); });
      zone.addEventListener('touchcancel', reset);
      zone.addEventListener('mousedown', down);
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', reset);

      const dash = document.getElementById('btnTouchDash');
      const pause = document.getElementById('btnTouchPause');
      if (dash) {
        const go = (e) => { e.preventDefault(); global.DSGame && global.DSGame.tryDash(); };
        dash.addEventListener('touchstart', go, { passive: false });
        dash.addEventListener('mousedown', go);
      }
      if (pause) {
        const go = (e) => { e.preventDefault(); global.DSGame && global.DSGame.togglePause(); };
        pause.addEventListener('touchstart', go, { passive: false });
        pause.addEventListener('mousedown', go);
      }
      this.applyTouchPad();
    },

    /** 根据设备（或设置）决定是否显示虚拟摇杆 */
    applyTouchPad() {
      const pad = this.el.touchPad;
      if (!pad) return;
      const on = this.isTouchDevice();
      this.touchEnabled = on;
      pad.classList.toggle('hidden', !on);
      if (global.DSInput) global.DSInput.touchUi = on;
      // 触屏时隐藏「键盘按键」提示行
      const keys = document.querySelector('.keys-line');
      if (keys) keys.style.display = on ? 'none' : '';
    },

    /* ---------- 显示与横屏 ---------- */
    bindDisplay() {
      const fs = document.getElementById('btnFullscreen');
      if (fs) fs.onclick = () => this.toggleFullscreen();
      const ok = document.getElementById('btnRotateOk');
      if (ok) ok.onclick = () => {
        this.hide('rotateHint');
        this._rotateDismissed = true;
      };
      this.checkOrientation();
      window.addEventListener('orientationchange', () => setTimeout(() => this.checkOrientation(), 220));
      window.addEventListener('resize', () => this.checkOrientation());
    },

    toggleFullscreen() {
      const el = document.documentElement;
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsEl) {
        (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
        return;
      }
      const canFs = !!(document.fullscreenEnabled || el.webkitRequestFullscreen);
      if (canFs) {
        try {
          const r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
          if (r && r.catch) r.catch(() => this.fallbackChromeMode());
          return;
        } catch (e) { /* 落到回退方案 */ }
      }
      this.fallbackChromeMode();
    },

    /** iOS 等不支持文档级全屏：退而隐藏界面装饰按钮，把画面让给玩家；
        再点一次全屏按钮（半透明保留）即可恢复 */
    fallbackChromeMode() {
      const on = document.body.classList.toggle('chrome-hidden');
      this.toast(on
        ? '已隐藏界面按钮；iOS 可通过 Safari 分享菜单「添加到主屏幕」获得全屏体验'
        : '已恢复界面按钮');
      const fs = document.getElementById('btnFullscreen');
      if (fs) fs.title = on ? '恢复界面按钮' : '全屏 (F)';
    },

    /** 竖屏且是小屏设备时提示横屏；用户手动关闭后不再打扰 */
    checkOrientation() {
      const hint = this.el.rotateHint;
      if (!hint) return;
      const small = Math.min(window.innerWidth, window.innerHeight) < 560;
      const portrait = window.innerHeight > window.innerWidth;
      const need = this.isTouchDevice() && small && portrait && !this._rotateDismissed;
      hint.classList.toggle('hidden', !need);
      // 竖屏时顺便建议全屏，能拿回浏览器地址栏占用的高度
      if (need && !document.fullscreenElement) this._suggestFs = true;
    },

    bindSettings() {
      document.getElementById('btnCloseSet').onclick = () => {
        this.hide('settings');
        this.renderAll();
      };
    },

    /* ---------- 显示控制 ---------- */
    show(id) { this.el[id] && this.el[id].classList.remove('hidden'); },
    hide(id) { this.el[id] && this.el[id].classList.add('hidden'); },

    switchTab(name) {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
      document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
      if (name === 'daily') this.renderDaily();
      if (name === 'shop') this.renderShop();
      if (name === 'ach') this.renderAchievements();
      if (name === 'best') this.renderCodex();
      if (name === 'set') this.renderSettings();
    },

    /* ---------- 每日 / 随机挑战 ---------- */
    renderDaily() {
      const daily = Save.dailyInfo();
      const streak = Save.touchStreak();
      this.dailyChallenge = { ...daily, name: '每日挑战' };
      if (!this.randomChallenge) this.randomChallenge = Save.randomChallenge();

      const el = document.getElementById('dailyDate');
      if (el) el.textContent = daily.date;
      const st = document.getElementById('streakText');
      if (st) st.textContent = streak > 1 ? `🔥 连续 ${streak} 天` : '';

      const modsHtml = (mods) => mods.map((id) => {
        const m = D.MODIFIERS.find((x) => x.id === id);
        if (!m) return '';
        return `<div class="mod-card ${m.good ? 'good' : 'bad'}">
          <div class="mc-ico">${m.ico}</div>
          <div class="mc-body"><div class="mc-name">${m.name}</div><div class="mc-desc">${m.desc}</div></div>
        </div>`;
      }).join('');

      const card = document.getElementById('dailyCard');
      if (card) {
        const best = Save.data.challenges && Save.data.challenges[daily.key];
        card.innerHTML = `
          <div class="ch-head">
            <span class="ch-title">今天的词条</span>
            <span class="ch-seed">种子 ${daily.seed}</span>
          </div>
          <div class="mod-preview">${modsHtml(daily.mods)}</div>
          <div class="ch-foot">
            ${best ? `最佳：${this.fmt(best.time)} · Lv.${best.level} · ${best.kills} 杀${best.won ? ' · 🏆' : ''}`
                   : '<span class="dim">还没有今天的成绩，来一发？</span>'}
          </div>`;
      }
      const randRoot = document.getElementById('randomMods');
      if (randRoot) randRoot.innerHTML = modsHtml(this.randomChallenge.mods);
      this.renderChallengeHistory();
    },

    renderChallengeHistory() {
      const root = document.getElementById('challengeHistory');
      if (!root) return;
      const all = Save.data.challenges || {};
      const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0)).slice(0, 8);
      if (!keys.length) {
        root.innerHTML = '<div class="dim" style="font-size:12px">暂无记录</div>';
        return;
      }
      root.innerHTML = keys.map((k) => {
        const r = all[k];
        const label = k === 'random' ? '随机挑战' : k.replace('daily_', '');
        return `<div class="ch-row">
          <span class="ch-date">${label}</span>
          <span class="ch-time">${this.fmt(r.time)}</span>
          <span class="ch-lv">Lv.${r.level}</span>
          <span class="ch-kills">${r.kills} 杀</span>
          ${r.won ? '<span class="ch-win">🏆</span>' : ''}
        </div>`;
      }).join('');
    },

    startChallenge() {
      const c = D.CHARACTERS.find((x) => x.id === this.selectedChar);
      if (!c || !Save.isCharUnlocked(c)) { this.toast('🔒 该角色尚未解锁'); return; }
      const ch = this.dailyChallenge || { ...Save.dailyInfo(), name: '每日挑战' };
      this.activeChallenge = ch;
      this.hide('menu'); this.hide('gameover'); this.hide('pause'); this.hide('settings');
      global.DSGame.start(this.selectedChar, this.selectedDiff,
        { challenge: ch, seed: ch.seed, mode: this.selectedMode });
    },

    /* ---------- 构建选择器 ---------- */
    buildSelectors() {
      const sc = this.el.selChar, sd = this.el.selDiff, sm = this.el.selMode;
      sc.innerHTML = D.CHARACTERS.map((c) => {
        const unlocked = Save.isCharUnlocked(c);
        const ico = unlocked ? c.ico : '🔒';
        // 锁定角色直接把「最省事的解锁方式」写进选项，避免玩家只能看到「未解锁」
        let suffix = '';
        if (!unlocked) {
          suffix = c.price ? ` · 未解锁（${c.price}💰 或成就）` : ' · 未解锁（成就）';
        }
        return `<option value="${c.id}" ${unlocked ? '' : 'disabled'}>${ico} ${c.name}${suffix}</option>`;
      }).join('');
      sd.innerHTML = D.DIFFICULTIES.map((d) => {
        const mm = Math.round((d.duration || D.RUN_DURATION) / 60);
        return `<option value="${d.id}">${d.name} — ${mm} 分钟 · ${d.tag}</option>`;
      }).join('');
      if (sm) {
        sm.innerHTML = D.MODES.map((m) =>
          `<option value="${m.id}">${m.ico} ${m.name}</option>`).join('');
      }

      const savedChar = Save.data.settings.lastChar;
      const firstUnlocked = D.CHARACTERS.find((c) => Save.isCharUnlocked(c));
      this.selectedChar = (savedChar && Save.isCharUnlocked(D.CHARACTERS.find((c) => c.id === savedChar) || {}))
        ? savedChar : firstUnlocked.id;
      this.selectedDiff = Save.data.settings.lastDiff || 'normal';
      this.selectedMode = Save.data.settings.lastMode || 'campaign';
      sc.value = this.selectedChar;
      sd.value = this.selectedDiff;
      if (sm) sm.value = this.selectedMode;
      this.renderCharInfo();
    },

    /** 已购买（金币直购）解锁的角色 */
    isPurchased(c) {
      const bought = Save.data.purchasedChars;
      return !!(bought && bought[c.id]);
    },

    /** 角色的解锁途径清单 */
    unlockPaths(c) {
      const paths = [];
      if (c.price) {
        paths.push({
          kind: 'buy', ico: '💰',
          title: `金币直购 · ${c.price} 💰`,
          desc: '在结算后金币会入库，攒够即可直接买下，不用等成就。',
        });
      }
      if (c.unlock) {
        const a = D.ACHIEVEMENTS.find((x) => x.id === c.unlock);
        if (a) {
          paths.push({
            kind: 'ach', ico: a.ico || '🏆',
            title: `达成成就 · ${a.name}`,
            desc: a.desc + (a.reward ? `（奖励 ${a.reward}💰）` : ''),
            ach: a,
          });
        }
      }
      if (!paths.length) paths.push({ kind: 'free', ico: '✅', title: '初始可用', desc: '无需解锁。' });
      return paths;
    },

    /** 成就进度文本（用于解锁面板） */
    achProgressText(a) {
      switch (a.id) {
        case 'ach_kills_500': return `累计击杀 ${Save.data.stats.kills} / 500`;
        case 'ach_survive_10': return `最佳存活 ${this.fmt(Save.data.stats.bestTime)} / 10:00`;
        case 'ach_gold_3000': return `累计金币 ${Save.data.stats.goldEarned} / 3000`;
        case 'ach_win': return Save.data.stats.wins > 0 ? '已通关 ✅' : '尚未通关（击败深渊领主）';
        default: return a.desc;
      }
    },

    renderUnlockBox() {
      const box = this.el.unlockBox;
      if (!box) return;
      const c = D.CHARACTERS.find((x) => x.id === this.selectedChar) || D.CHARACTERS[0];
      if (Save.isCharUnlocked(c)) { box.classList.add('hidden'); box.innerHTML = ''; return; }

      const canBuy = !!c.price;
      const afford = canBuy && Save.gold >= c.price;
      const paths = this.unlockPaths(c);
      box.classList.remove('hidden');
      box.innerHTML = `
        <div class="ub-head">🔒 ${c.name} 尚未解锁 —— 任选一种方式解锁</div>
        <div class="ub-paths">
          ${paths.map((p) => `
            <div class="ub-path ${p.kind}">
              <div class="ub-ico">${p.ico}</div>
              <div class="ub-txt">
                <b>${p.title}</b>
                <span>${p.ach ? this.achProgressText(p.ach) : p.desc}</span>
              </div>
              ${p.kind === 'buy' ? `<button class="btn ${afford ? 'primary' : 'ghost'}"
                 data-buy="${c.id}" ${afford ? '' : 'disabled'}>
                 ${afford ? '立即解锁' : `金币不足（${Save.gold}/${c.price}）`}</button>` : ''}
            </div>`).join('')}
        </div>
        ${canBuy ? `<div class="ub-tip">当前金币库：<b>${Save.gold}</b>💰 · 金币在每局结算后入库</div>`
        : '<div class="ub-tip">该角色只能通过成就解锁。</div>'}`;

      box.querySelectorAll('[data-buy]').forEach((btn) => {
        btn.onclick = () => this.buyChar(btn.dataset.buy);
      });
    },

    buyChar(id) {
      const c = D.CHARACTERS.find((x) => x.id === id);
      if (!c || !c.price) return;
      if (Save.isCharUnlocked(c)) return;
      if (!Save.spendGold(c.price)) { this.toast('💰 金币不足'); return; }
      if (!Save.data.purchasedChars) Save.data.purchasedChars = {};
      Save.data.purchasedChars[id] = Date.now();
      Save.save();
      this.toast(`🎉 已解锁 ${c.ico} ${c.name}！`);
      this.selectedChar = id;
      this.buildSelectors();
      this.renderShop();
      this.renderAchievements();
    },

    renderCharInfo() {
      const c = D.CHARACTERS.find((x) => x.id === this.selectedChar) || D.CHARACTERS[0];
      const w = D.WEAPONS[c.weapon];
      const diff = D.DIFFICULTIES.find((d) => d.id === this.selectedDiff) || D.DIFFICULTIES[1];
      const best = Save.data.best[c.id];
      const locked = !Save.isCharUnlocked(c);
      const mode = D.MODES.find((m) => m.id === this.selectedMode) || D.MODES[0];
      const dur = Math.round((diff.duration || D.RUN_DURATION) / 60);
      let lockMsg = '';
      if (locked) lockMsg = c.price
        ? `🔒 未解锁：${c.price}💰 购买，或达成成就`
        : '🔒 未解锁：达成成就';
      this.el.charInfo.innerHTML = `
        <div class="ci-head"><span class="ci-ico">${c.ico}</span>
          <div><b>${c.name}</b><span class="ci-tag">${c.tag}</span>
          ${locked ? `<span class="ci-lock">${lockMsg}</span>` : ''}</div>
        </div>
        <div class="ci-desc">${c.desc}</div>
        <div class="ci-stats">
          <span>❤️ HP <b>${c.hp}</b></span>
          <span>👟 移速 <b>${Math.round(c.spd * 100)}%</b></span>
          <span>💪 伤害 <b>${Math.round(c.might * 100)}%</b></span>
          <span>🧭 范围 <b>${Math.round(c.area * 100)}%</b></span>
          <span>🧲 拾取 <b>${Math.round(c.magnet * 100)}%</b></span>
        </div>
        <div class="ci-weapon">初始武器：<b>${w.ico} ${w.name}</b></div>
        <div class="ci-diff">难度：<b>${diff.name}</b> · ${diff.tag}</div>
        <div class="ci-mode">模式：<b>${mode.ico} ${mode.name}</b> · ${mode.endless ? '无时长上限' : `${dur} 分钟`}</div>
        <div class="ci-modedesc">${mode.endless ? mode.desc : (diff.desc || '')}</div>
        <div class="ci-grow">📈 每级成长：生命 +${D.LEVEL_GROWTH.maxHpPerLevel} · 伤害 +${(D.LEVEL_GROWTH.mightPerLevel * 100).toFixed(2)}% · 每 ${D.LEVEL_GROWTH.armorEvery} 级 +1 护甲</div>
        ${best ? `<div class="ci-best">个人最佳：${this.fmt(best.time)} · Lv.${best.level} · ${best.kills} 杀${best.won ? ' · 🏆 通关' : ''}</div>` : ''}
        ${this.tipsFor(c.id)}`;
      this.renderUnlockBox();
    },

    /** 角色专属小提示，帮助新手理解玩法 */
    tipsFor(charId) {
      const tips = {
        blade: '保持面向敌人挥鞭；被围住时按空格穿出去。',
        gunner: '飞刀朝移动方向连发，边撤边打最舒服。',
        witch: '火球自动锁敌，站在怪群边缘持续轰炸。',
        monk: '罡气是近身武器，主动贴上去，靠护甲硬扛。',
        ranger: '飞斧有抛物线，往怪多的方向砸，别对单体。',
        necro: '灵弹自动索敌，专心走位即可，自带一次复活。',
        warden: '圣典绕身转，站在怪堆中心收益最大。',
        alchemist: '毒瓶落地成池，把怪引到池子里打。',
        blademaster: '光矛直线贯穿，调整站位一次打一排。',
      };
      const t = tips[charId];
      return t ? `<div class="ci-tip">💡 ${t}</div>` : '';
    },

    renderBestList() {
      const rows = D.CHARACTERS.map((c) => {
        const b = Save.data.best[c.id];
        return `<div class="bl-row">
          <span class="bl-ico">${c.ico}</span>
          <span class="bl-name">${c.name}</span>
          <span class="bl-val">${b ? this.fmt(b.time) + (b.won ? ' 🏆' : '') : '—'}</span>
        </div>`;
      }).join('');
      const st = Save.data.stats;
      this.el.bestList.innerHTML = rows + `<div class="bl-foot">总局数 ${st.runs} · 总击杀 ${st.kills} · 通关 ${st.wins}</div>`;
    },

    /* ---------- 商店 ---------- */
    renderShop() {
      this.el.shopGold.textContent = Save.data.gold;
      this.el.shopList.innerHTML = D.SHOP.map((def) => {
        const lv = Save.shopLevel(def.id);
        const maxed = lv >= def.max;
        const cost = Save.shopCost(def);
        const afford = Save.data.gold >= cost;
        const pips = Array.from({ length: def.max }, (_, i) =>
          `<i class="pip${i < lv ? ' on' : ''}"></i>`).join('');
        return `<div class="shop-card${maxed ? ' maxed' : ''}" data-shop="${def.id}">
          <div class="sc-ico">${def.ico}</div>
          <div class="sc-body">
            <div class="sc-name">${def.name} <span class="sc-lv">Lv.${lv}/${def.max}</span></div>
            <div class="sc-desc">${def.desc}</div>
            <div class="sc-pips">${pips}</div>
          </div>
          <button class="btn ${maxed ? 'ghost' : afford ? 'primary' : 'ghost'} sc-buy" ${maxed ? 'disabled' : ''} data-buy="${def.id}">
            ${maxed ? '已满级' : `${cost}💰`}
          </button>
        </div>`;
      }).join('');
      this.el.shopList.querySelectorAll('[data-buy]').forEach((b) => {
        b.onclick = () => {
          const def = D.SHOP.find((x) => x.id === b.dataset.buy);
          const r = Save.buy(def);
          if (r.ok) {
            global.DSAudio.play('chest');
            this.toast(`✅ ${def.name} 升到 Lv.${r.level}（-${r.cost}💰）`);
            this.renderShop();
            if (this.el.panelShopGold) this.el.panelShopGold.textContent = Save.data.gold;
          } else if (r.reason === 'gold') {
            this.toast('💰 金币不足');
          }
        };
      });
    },

    /* ---------- 成就 ---------- */
    renderAchievements() {
      const { got, all } = Save.achCount();
      this.el.achProgress.textContent = `${got} / ${all}`;
      this.el.achList.innerHTML = D.ACHIEVEMENTS.map((a) => {
        const ok = Save.unlocked(a.id);
        return `<div class="ach-card${ok ? ' done' : ''}">
          <div class="ac-ico">${ok ? a.ico : '🔒'}</div>
          <div class="ac-body">
            <div class="ac-name">${a.name}</div>
            <div class="ac-desc">${a.desc}</div>
            <div class="ac-reward">奖励 ${a.reward}💰${a.unlock ? ' · 解锁角色' : ''}</div>
          </div>
          ${ok ? '<div class="ac-check">✓</div>' : ''}
        </div>`;
      }).join('');
    },

    /* ---------- 图鉴 ---------- */
    renderCodex() {
      const st = Save.data.stats;
      let items = [];
      if (this.bestFilter === 'weapons') {
        items = Object.entries(D.WEAPONS).filter(([, w]) => !w.evolved).map(([id, w]) => {
          const used = (st.weaponsUsed || []).includes(id);
          return { ico: used ? w.ico : '❔', name: used ? w.name : '？？？', tag: w.kind,
            desc: used ? w.desc : '使用一次即可解锁图鉴', color: w.color, locked: !used };
        });
      } else if (this.bestFilter === 'passives') {
        items = Object.values(D.PASSIVES).map((p) => ({
          ico: p.ico, name: p.name, tag: `最高 ${p.max} 级`, desc: p.desc,
        }));
      } else if (this.bestFilter === 'enemies') {
        items = Object.values(D.ENEMY_TYPES).filter((e) => !e.rare).map((e) => ({
          ico: e.shape === 'bat' ? '🦇' : e.shape === 'ghost' ? '👻' : e.shape === 'skel' ? '💀' :
               e.shape === 'spider' ? '🕷️' : e.shape === 'armor' ? '🛡️' : e.shape === 'gargoyle' ? '🗿' : '🟢',
          name: e.name, tag: `HP ${e.hp}`, desc: `伤害 ${e.dmg} · 经验 ${e.xp} · 首次出现 ${this.fmt(e.minT)}`,
          color: e.color,
        }));
      } else {
        items = Object.values(D.BOSS_TYPES).map((b) => ({
          ico: '👹', name: b.name, tag: 'BOSS', desc: `HP ${b.hp} · 伤害 ${b.dmg}`,
          color: b.color,
        }));
      }
      this.el.bestGrid.innerHTML = items.map((it) => `
        <div class="cx-card${it.locked ? ' locked' : ''}">
          <div class="cx-ico" style="color:${it.color || '#fff'}">${it.ico}</div>
          <div class="cx-name">${it.name}</div>
          <div class="cx-tag">${it.tag}</div>
          <div class="cx-desc">${it.desc}</div>
        </div>`).join('');
    },

    /* ---------- 设置 ---------- */
    renderSettings() {
      const s = this.settings;
      const rows = [
        { k: 'sfx', t: '音效', d: '武器与敌人的合成音效' },
        { k: 'shake', t: '屏幕震动', d: '受击与爆炸时的镜头抖动' },
        { k: 'particles', t: '粒子特效', d: '关闭可显著提升低配设备帧率' },
        { k: 'damageNumbers', t: '伤害数字', d: '显示每次命中的伤害飘字' },
        { k: 'screenFlash', t: '受击闪屏', d: '受伤时屏幕泛红' },
        { k: 'autoPause', t: '失焦自动暂停', d: '切换到其它窗口时暂停' },
        { k: 'minimap', t: '小地图', d: '右下角显示敌人分布' },
        { k: 'autoAim', t: '自动瞄准', d: '静止时自动朝向最近敌人（建议开启）' },
        { k: 'forceTouchPad', t: '强制显示触屏控件', d: '在电脑上也能调出虚拟摇杆与按钮（用于调试或触屏笔记本）' },
        { k: 'bigText', t: '大字号', d: '放大 HUD 与菜单文字，便于阅读' },
        { k: 'lowFx', t: '低特效模式', d: '一键关闭粒子/伤害数字/屏幕震动' },
        { k: 'showFps', t: '显示 FPS', d: '调试用，显示帧率与实体数' },
      ];
      const html = rows.map((r) => `
        <label class="set-row">
          <span class="set-text"><b>${r.t}</b><i>${r.d}</i></span>
          <input type="checkbox" data-set="${r.k}" ${s[r.k] ? 'checked' : ''} />
        </label>`).join('') + `
        <div class="set-row">
          <span class="set-text"><b>存档</b><i>导出备份 / 从文本导入 / 清空</i></span>
          <span class="set-btns">
            <button class="btn ghost" id="btnExport">导出</button>
            <button class="btn ghost" id="btnImport">导入</button>
          </span>
        </div>`;
      const apply = (root) => {
        root.innerHTML = html;
        root.querySelectorAll('[data-set]').forEach((cb) => {
          cb.onchange = () => {
            this.settings[cb.dataset.set] = cb.checked;
            Save.data.settings[cb.dataset.set] = cb.checked;
            Save.touch();
            if (cb.dataset.set === 'sfx') global.DSAudio.on = cb.checked;
            if (cb.dataset.set === 'bigText') {
              document.body.classList.toggle('big-text', cb.checked);
            }
            if (cb.dataset.set === 'lowFx') {
              // 低特效：联动关闭粒子/伤害数字/震动/闪屏
              const chain = { particles: false, damageNumbers: false, shake: false, screenFlash: false };
              Object.assign(this.settings, chain);
              Object.assign(Save.data.settings, chain);
              // 同步所有复选框
              root.querySelectorAll('[data-set]').forEach((x) => {
                if (chain[x.dataset.set] === false) x.checked = false;
              });
              this.toast('🌑 低特效模式已开启');
            }
            if (cb.dataset.set === 'forceTouchPad') this.applyTouchPad();
            if (global.DSGame) Object.assign(global.DSGame.settings, this.settings);
          };
        });
        const ex = root.querySelector('#btnExport');
        if (ex) ex.onclick = () => {
          const text = Save.exportJSON();
          navigator.clipboard && navigator.clipboard.writeText(text).then(
            () => this.toast('📋 存档已复制到剪贴板'),
            () => this.toast('复制失败，请手动保存')
          );
          console.log('[存档导出]\n' + text);
        };
        const im = root.querySelector('#btnImport');
        if (im) im.onclick = () => {
          const text = prompt('粘贴导出的存档 JSON：');
          if (!text) return;
          try {
            Save.importJSON(text);
            this.settings = Object.assign({}, Save.data.settings);
            this.buildSelectors();
            this.renderAll();
            this.toast('✅ 存档已导入');
          } catch (e) { this.toast('❌ 存档格式错误'); }
        };
      };
      apply(this.el.menuSettings);
      apply(this.el.modalSettings);
      this.renderBestList();
    },

    renderAll() {
      this.renderCharInfo();
      this.renderBestList();
      this.renderShop();
      this.renderAchievements();
      this.renderCodex();
      this.renderSettings();
    },

    /* ---------- 游戏回调 ---------- */
    onStart(g) {
      this.hide('menu'); this.hide('gameover'); this.hide('levelup'); this.hide('pause');
      this.show('hud');
      this.syncLoadout(g);
      this.banishMode = false;
    },

    onPause(g) {
      this.show('pause');
      this.renderPauseBreakdown(g);
    },
    onResume() { this.hide('pause'); this.hide('settings'); },

    onEnd(g, run, unlocked) {
      const p = g.player;
      this.show('gameover');
      this.hide('hud');

      // 挑战成绩入库
      if (g.challenge) {
        try { Save.recordChallenge(g.challenge, run); } catch (e) { /* 忽略 */ }
      }

      this.el.goTitle.textContent = run.won ? '🏆 深渊领主陨落 · 通关！' : '💀 你被淹没了';
      this.el.goTitle.classList.toggle('win', run.won);
      const kps = run.time > 0 ? (p.kills / run.time).toFixed(1) : '0';
      const dps = run.time > 0 ? Math.round(p.dmgDealt / run.time) : 0;
      this.el.goStats.innerHTML = `
        <div><b>${this.fmt(run.time)}</b>存活时间</div>
        <div><b>Lv.${run.level}</b>等级</div>
        <div><b>${run.kills}</b>总击杀</div>
        <div><b>${kps}/s</b>清怪效率</div>
        <div><b>${dps}</b>平均 DPS</div>
        <div><b>${p.totalGold}</b>本局金币</div>
        <div><b>${run.evolutions}</b>进化次数</div>
        <div><b>${run.elites}</b>精英击杀</div>
        <div><b>${run.weapons}/6</b>武器数</div>`;

      // 武器输出排行
      const total = Object.values(p.weaponKills).reduce((a, b) => a + b, 0) || 1;
      const rows = Object.entries(p.weaponKills)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id, v]) => {
          const w = D.WEAPONS[id];
          const pct = Math.round((v / total) * 100);
          return `<div class="br-row">
            <span class="br-ico">${w ? w.ico : '·'}</span>
            <span class="br-name">${w ? w.name : id}</span>
            <span class="br-bar"><i style="width:${pct}%"></i></span>
            <span class="br-val">${v}</span>
          </div>`;
        }).join('');
      this.el.goBreakdown.innerHTML = rows || '<div class="dim">无数据</div>';

      // 收获
      const st = Save.data.stats;
      const lines = [];
      lines.push(`💰 金币入库：<b>+${p.totalGold}</b>（总 ${Save.data.gold}）`);
      if (run.won) lines.push('🏆 首次通关奖励已计入成就');
      if (run.evolutions) lines.push(`🧬 进化 ${run.evolutions} 次`);
      if (unlocked && unlocked.length) {
        lines.push(`🏆 新成就 ${unlocked.length} 项：` + unlocked.map((a) => a.name).join('、'));
      }
      lines.push(`📈 累计：${st.runs} 局 / ${st.kills} 杀 / 最高 ${this.fmt(st.bestTime)}`);
      this.el.goRewards.innerHTML = lines.map((l) => `<div class="rw-line">${l}</div>`).join('');

      const tips = [
        '把一件武器升到 8 级 + 对应被动满级，就能触发进化。',
        '「急速」+「增幅」能让飞刀变成千刃风暴。',
        '罡气 + 铁甲 + 疆域 是最稳的新手流派。',
        '冲刺（空格）自带短暂无敌，可以穿过怪群。',
        '宝箱必给一次升级，优先去捡。',
        '精英会掉小宝箱，别放过。',
        '商店的「替身符」能多给你一条命。',
        '毒瓶 + 冰爆：先冻住再下毒，伤害翻倍。',
      ];
      this.el.goTip.textContent = '💡 ' + g.pick(tips);

      // 入库后刷新菜单数据
      this.buildSelectors();
      this.renderAll();
      this.flushAchievements(unlocked);
    },

    flushAchievements(list) {
      if (!list || !list.length) return;
      this._achQueue.push(...list);
      this.pumpAchievements();
    },
    pumpAchievements() {
      if (this._achShowing || !this._achQueue.length) return;
      const a = this._achQueue.shift();
      this._achShowing = true;
      this.el.achPopName.textContent = `${a.ico} ${a.name} · +${a.reward}💰`;
      this.show('achPop');
      setTimeout(() => {
        this.hide('achPop');
        this._achShowing = false;
        setTimeout(() => this.pumpAchievements(), 200);
      }, 2200);
    },

    renderPauseBreakdown(g) {
      const p = g.player;
      const ws = p.weapons.map((w) => {
        const d = D.WEAPONS[w.id];
        const evo = D.EVOLUTIONS.find((e) => e.from === w.id);
        const canEvo = evo && w.lv >= d.max && (p.passives[evo.passive] || 0) >= D.PASSIVES[evo.passive].max;
        return `<div class="pb-row"><span>${d.ico} ${d.name}</span>
          <span class="pb-lv">Lv.${w.lv}/${d.max}${w.evolved ? ' 🧬' : canEvo ? ' ✨可进化' : ''}</span></div>`;
      }).join('');
      const ps = Object.entries(p.passives).map(([id, lv]) => {
        const d = D.PASSIVES[id];
        return `<span class="pb-pass">${d.ico} ${d.name} ${lv}</span>`;
      }).join('');
      this.el.pauseBreakdown.innerHTML = `
        <div class="pb-grid"><div><h4>武器</h4>${ws}</div>
        <div><h4>被动</h4><div class="pb-passes">${ps || '<span class="dim">无</span>'}</div></div></div>
        <div class="pb-foot">💰 ${p.gold} · ❤️ ${Math.ceil(p.hp)}/${Math.round(p.maxHp)} · Lv.${p.level}</div>`;
    },

    /* ---------- 升级卡 ---------- */
    openLevelUp(g) {
      // 幂等：已在升级界面则不重复掷卡，否则会每帧重掷导致卡牌闪变、无法点击
      if (g.state === 'levelup' && this.el.levelup && !this.el.levelup.classList.contains('hidden')) return;
      g.state = 'levelup';
      this.show('levelup');
      g.rollCards();
      this.pendingCards = g.pendingCards;
      this.banishMode = false;
      this._cardsHtml = null;      // 强制重建 DOM
      this.renderCards();
    },

    renderCards() {
      const g = global.DSGame;
      const cards = this.pendingCards || g.pendingCards || [];
      this.el.rerollLeft.textContent = g.rerolls;
      document.getElementById('btnReroll').style.opacity = g.rerolls > 0 ? 1 : 0.35;
      const html = cards.map((c, i) => {
        const v = this.cardView(c);
        const pips = v.max > 1
          ? `<div class="lvbar">${Array.from({ length: v.max }, (_, k) =>
              `<i class="pip${k < v.lv ? ' on' : ''}"></i>`).join('')}</div>` : '';
        const cursor = this.padCursor === i ? ' pad' : '';
        return `<div class="card${v.isNew ? ' new' : ''}${v.evo ? ' evo' : ''}${cursor}" data-idx="${i}">
          ${v.evo ? '<div class="card-evo">进化</div>' : v.isNew ? '<div class="card-new">新</div>' : ''}
          <div class="ico">${v.ico}</div>
          <div class="nm">${v.nm}</div>
          <div class="ty">${v.ty}</div>
          <div class="ds">${v.ds}</div>
          ${pips}
          <div class="key">按 <kbd>${i + 1}</kbd>${this.padCursor === i ? ' · 🎮 A 确认' : ''}</div>
        </div>`;
      }).join('');
      // 关键：内容未变就不重写 DOM —— 重写会重启 CSS 入场动画，
      // 导致卡片反复回到 opacity:0 变成「不可见且点不中」
      if (this._cardsHtml === html) return;
      this._cardsHtml = html;
      this.el.cards.innerHTML = html;
      this.el.cards.querySelectorAll('.card').forEach((el) => {
        el.onclick = () => this.pickCard(+el.dataset.idx);
      });
    },

    cardView(c) {
      const g = global.DSGame, p = g.player;
      if (c.type === 'w') {
        const d = D.WEAPONS[c.id];
        return { ico: d.ico, nm: d.name, ty: `新武器 · ${d.kind}`, ds: d.desc, lv: 0, max: d.max, isNew: true };
      }
      if (c.type === 'wu') {
        const d = D.WEAPONS[c.id];
        const w = p.weapons.find((x) => x.id === c.id);
        const note = d.next[Math.max(0, Math.min(d.next.length - 1, (w ? w.lv : 1) - 1))] || '强化';
        return { ico: d.ico, nm: d.name, ty: `武器 Lv.${c.lv}`, ds: `${note}`, lv: c.lv - 1, max: d.max };
      }
      if (c.type === 'p') {
        const d = D.PASSIVES[c.id];
        return { ico: d.ico, nm: d.name, ty: `被动 Lv.${c.lv}/${d.max}`, ds: d.desc, lv: c.lv - 1, max: d.max,
          isNew: (p.passives[c.id] || 0) === 0 };
      }
      if (c.type === 'evo') {
        const d = D.WEAPONS[c.id];
        const from = D.WEAPONS[c.from];
        return { ico: d.ico, nm: d.name, ty: '武器进化', ds: d.desc, lv: 8, max: 8, evo: true };
      }
      if (c.type === 'heal') return { ico: '💖', nm: '疗伤', ty: '恢复', ds: '立即回复 35% 最大生命。' };
      return { ico: '💰', nm: '战利品', ty: '补给', ds: '获得一批金币（直接计入本局）。' };
    },

    pickCard(idx) {
      const g = global.DSGame;
      const card = (this.pendingCards || g.pendingCards)[idx];
      if (!card) return;
      if (this.banishMode) {
        g.banishCard(card);
        this.pendingCards.splice(idx, 1);
        if (!this.pendingCards.length) { g.rollCards(); this.pendingCards = g.pendingCards; }
        this.banishMode = false;
        this._cardsHtml = null;    // 强制重建
        this.toast('🚫 已放逐，本局不再出现');
        this.renderCards();
        return;
      }
      g.applyCard(card);
      this.afterCard();
    },

    afterCard() {
      const g = global.DSGame;
      this.syncLoadout(g);
      if (g.player.pendingLevels > 0) {
        g.rollCards();
        this.pendingCards = g.pendingCards;
        this._cardsHtml = null;    // 强制重建
        this.renderCards();
        g.state = 'levelup';
        this.show('levelup');
        return;
      }
      this.hide('levelup');
      this._cardsHtml = null;      // 下次升级时重新构建
      g.state = 'playing';
      g.last = performance.now();
    },

    onCardApplied(g) { this.syncLoadout(g); },

    /* ---------- HUD ---------- */
    syncLoadout(g) {
      const p = g.player;
      if (!p) return;
      const ws = p.weapons.map((w) => {
        const d = D.WEAPONS[w.id];
        return `<div class="slot lv${w.evolved ? ' evo' : ''}" data-lv="${w.lv}" title="${d.name} Lv.${w.lv}">${d.ico}</div>`;
      }).join('');
      const ps = Object.entries(p.passives).map(([id, lv]) => {
        const d = D.PASSIVES[id];
        return `<div class="slot passive lv" data-lv="${lv}" title="${d.name} Lv.${lv}">${d.ico}</div>`;
      }).join('');
      this.el.loadout.innerHTML = ws + (ps ? `<div class="slot-sep"></div>${ps}` : '');
    },

    updateHUD(g) {
      if (g.state === 'menu' || !g.player) return;
      const p = g.player, s = p.stat;
      this.el.hpFill.style.transform = `scaleX(${Math.max(0, Math.min(1, p.hp / p.maxHp))})`;
      this.el.hpText.textContent = `${Math.max(0, Math.ceil(p.hp))} / ${Math.round(p.maxHp)}`;
      this.el.xpFill.style.transform = `scaleX(${Math.max(0, Math.min(1, p.xp / p.xpNeed))})`;
      this.el.xpText.textContent = `Lv.${p.level}`;
      // 常规模式显示「已过 / 总时长」，无尽模式只显示已存活时间
      const dur = g.duration || D.RUN_DURATION;
      this.el.timeText.textContent = g.endless
        ? `${this.fmt(g.t)} ∞`
        : `${this.fmt(g.t)} / ${this.fmt(dur)}`;
      this.el.killText.textContent = p.kills;
      this.el.goldText.textContent = p.totalGold;

      const dashPct = 1 - Math.min(1, p.dashCd / Math.max(0.01, 2.4 * s.dashCdMul));
      this.el.dashFill.style.transform = `scaleX(${dashPct})`;
      this.el.dashText.textContent = p.dashCd > 0 ? `冲刺 ${p.dashCd.toFixed(1)}s`
        : (this.touchEnabled ? '冲刺就绪' : '冲刺就绪 (空格)');

      // 首次攒够钱时提示一次局内商店，避免玩家不知道有这个系统
      if (!this._shopHinted && p.gold >= D.RUN_SHOP[0].cost) {
        this._shopHinted = true;
        this.toast('🛒 暂停菜单可打开「局内商店」换取补给');
      }

      const boss = g.enemies.find((e) => e.boss);
      if (boss) {
        this.el.bossBar.classList.remove('hidden');
        this.el.bossName.textContent = boss.def.name;
        this.el.bossFill.style.transform = `scaleX(${Math.max(0, boss.hp / boss.maxHp)})`;
      } else this.el.bossBar.classList.add('hidden');

      const danger = boss || (!g.endless && g.t > dur - 10 && !g.finalSpawned);
      this.el.warning.classList.toggle('hidden', !danger);

      if (g.killStreak >= 10) {
        this.el.comboTag.classList.remove('hidden');
        this.el.comboTag.textContent = `🔥 ${g.killStreak} 连杀`;
      } else this.el.comboTag.classList.add('hidden');

      // 下一事件倒计时
      const ev = this.el.nextEvent;
      if (ev) {
        if (g.finalSpawned) {
          ev.textContent = '👑 击败深渊领主';
          ev.className = 'next-event boss';
        } else if (g.endless) {
          // 无尽模式：没有终局，只提示下一次加压
          const tier = Math.floor(g.t / 300) + 1;
          const left = Math.max(0, tier * 300 - g.t);
          ev.textContent = `♾️ 压力提升 ${this.fmt(left)}`;
          ev.className = 'next-event' + (left < 10 ? ' soon' : '');
        } else {
          const waveIn = 90 - (g.t % 90);
          const miniIn = Math.max(0, g.nextMini - g.t);
          const finalIn = Math.max(0, dur - g.t);
          let text, cls = 'next-event';
          if (finalIn < miniIn && finalIn < waveIn) {
            text = `👑 决战 ${this.fmt(finalIn)}`;
            if (finalIn < 30) cls += ' soon';
          } else if (miniIn < waveIn) {
            text = `👹 小 Boss ${this.fmt(miniIn)}`;
            if (miniIn < 10) cls += ' soon';
          } else {
            text = `🌊 敌潮 ${this.fmt(waveIn)}`;
            if (waveIn < 10) cls += ' soon';
          }
          ev.textContent = text;
          ev.className = cls;
        }
      }
    },

    /* ---------- 输入 ---------- */
    onKey(k, e) {
      const g = global.DSGame;
      if (k === 'm') this.toggleMute();
      if (g.state === 'levelup') {
        if (k >= '1' && k <= '3') { this.pickCard(+k - 1); return; }
        if (k === 'r') { if (g.rerollCards()) { this.pendingCards = g.pendingCards; this.renderCards(); } return; }
      }
      if (k === 'p' || k === 'escape') {
        if (g.state === 'playing') g.pause();
        else if (g.state === 'paused') g.resume();
      }
      if (g.state === 'menu' && k === 'enter') this.startGame();
    },

    /* ---------- 手柄回调 ---------- */
    onPadSkip() {
      const g = global.DSGame;
      if (g.state !== 'levelup') return;
      g.skipCard();
      this.afterCard();
    },
    onPadReroll() {
      const g = global.DSGame;
      if (g.state !== 'levelup') return;
      if (g.rerollCards()) {
        this.pendingCards = g.pendingCards;
        this._cardsHtml = null;
        this.renderCards();
      }
    },
    onPadNav(dir) {
      const g = global.DSGame;
      if (g.state !== 'levelup') return;
      const n = (this.pendingCards || []).length;
      if (!n) return;
      if (this.padCursor == null) this.padCursor = 0;
      if (dir === 'left') this.padCursor = (this.padCursor + n - 1) % n;
      else if (dir === 'right') this.padCursor = (this.padCursor + 1) % n;
      else if (dir === 'up' || dir === 'down') this.pickCard(this.padCursor);
      this.renderCards();
    },

    toggleMute() {
      this.settings.sfx = !this.settings.sfx;
      Save.data.settings.sfx = this.settings.sfx;
      Save.touch();
      global.DSAudio.on = this.settings.sfx;
      this.el.btnMute.textContent = this.settings.sfx ? '🔊' : '🔇';
      this.toast(this.settings.sfx ? '🔊 已开启音效' : '🔇 已静音');
      this.renderSettings();
    },

    startGame() {
      const c = D.CHARACTERS.find((x) => x.id === this.selectedChar);
      if (!c || !Save.isCharUnlocked(c)) { this.toast('🔒 该角色尚未解锁'); return; }
      this.hide('menu'); this.hide('gameover'); this.hide('pause'); this.hide('settings');
      global.DSGame.start(this.selectedChar, this.selectedDiff, { mode: this.selectedMode });
    },

    toMenu() {
      const g = global.DSGame;
      g.state = 'menu';
      g.resetWorld();
      g.player = null;
      g.buildDemo();
      this.hide('hud'); this.hide('gameover'); this.hide('pause'); this.hide('levelup');
      this.hide('settings');
      this.show('menu');
      this.buildSelectors();
      this.renderAll();
    },

    wipeSave() {
      if (!confirm('确定清空全部存档吗？（金币、商店、成就、记录都将丢失）')) return;
      Save.reset();
      this.settings = Object.assign({}, Save.data.settings);
      this.buildSelectors();
      this.renderAll();
      this.toast('🗑 存档已清空');
    },

    toast(msg) {
      const el = this.el.toast;
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
    },

    fmt(s) {
      s = Math.max(0, Math.floor(s || 0));
      return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    },
  };

  global.DSUI = UI;
})(window);
