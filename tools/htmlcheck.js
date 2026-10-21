#!/usr/bin/env node
/* 校验 index.html 中包含 UI/引擎引用的全部元素 ID */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ids = new Set();
const re = /id="([^"]+)"/g;
let m;
while ((m = re.exec(html))) ids.add(m[1]);

let bad = 0;
const needs = [
  // UI 元素表
  'menu', 'hud', 'levelup', 'gameover', 'pause', 'settings', 'toast', 'achPop',
  'cards', 'loadout', 'charInfo', 'bestList', 'shopList', 'shopGold', 'achList',
  'achProgress', 'bestGrid', 'menuSettings', 'modalSettings', 'hpFill', 'hpText',
  'xpFill', 'xpText', 'dashFill', 'dashText', 'timeText', 'killText', 'goldText',
  'warning', 'comboTag', 'bossBar', 'bossName', 'bossFill', 'levelupSub',
  'rerollLeft', 'goTitle', 'goStats', 'goTip', 'goBreakdown', 'goRewards',
  'pauseBreakdown', 'achPopName', 'btnMute', 'selChar', 'selDiff', 'nextEvent',
  // 挑战
  'dailyDate', 'streakText', 'dailyCard', 'randomMods', 'challengeHistory',
  'btnRandomChallenge', 'btnStartChallenge',
  // 按钮
  'btnStart', 'btnRetry', 'btnMenu', 'btnSkip', 'btnReroll', 'btnBanish',
  'btnResume', 'btnRestart', 'btnQuit', 'btnPauseSet', 'btnCloseSet', 'btnWipe',
  // 结构
  'bestFilter', 'tabs',
];
for (const n of needs) {
  if (!ids.has(n)) { console.log('  MISSING: ' + n); bad++; }
}

// index.html 中的 data-tab 应与 ui.js switchTab 支持一致
const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map((x) => x[1]);
const panels = [...html.matchAll(/data-panel="([^"]+)"/g)].map((x) => x[1]);
const tabSet = new Set(tabs), panelSet = new Set(panels);
for (const t of tabs) if (!panelSet.has(t)) { console.log('  tab 无对应 panel: ' + t); bad++; }
for (const p of panels) if (!tabSet.has(p)) { console.log('  panel 无对应 tab: ' + p); bad++; }

console.log('  ids total: ' + ids.size + ', tabs: ' + tabs.join(','));
// game.js 旧引用检查
if (/game\.js/.test(html)) { console.log('  STALE ref game.js'); bad++; }
// 挑战面板结构
if (!html.includes('data-panel="daily"')) { console.log('  missing daily panel'); bad++; }

console.log(bad === 0 ? '  HTML 结构校验全部通过 ✓' : '  发现 ' + bad + ' 个问题');
process.exit(bad ? 1 : 0);
