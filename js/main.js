/* =====================================================================
   夜刃求生 v2 · 入口
   ===================================================================== */
(function () {
  'use strict';

  function boot() {
    const Save = window.DSSave;
    const UI = window.DSUI;
    const Game = window.DSGame;

    Save.load();
    UI.settings = Object.assign({}, Save.data.settings);
    window.DSAudio.on = UI.settings.sfx !== false;

    UI.init();
    Game.init(document.getElementById('game'), UI);

    // 应用持久化的显示设置
    if (UI.settings.bigText) document.body.classList.add('big-text');
    Object.assign(Game.settings, UI.settings);

    // 首次交互时创建音频上下文（浏览器策略要求用户手势）
    const unlock = () => {
      window.DSAudio.init();
      window.DSAudio.resume();
      window.DSAudio.on = UI.settings.sfx !== false;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // 离开页面时落盘
    window.addEventListener('pagehide', () => Save.flush());
    window.addEventListener('beforeunload', () => Save.flush());

    // 暴露给控制台调试
    window.__DSH_GAME__ = Game;
    console.log('%c夜刃求生 v2.3.2', 'color:#ffd166;font-weight:bold', '—— 纯原生 Canvas 肉鸽割草');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
