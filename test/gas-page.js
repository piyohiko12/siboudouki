// GAS から配信したときの動きを、ブラウザで確かめる。
//
// 本物のデプロイの代わりに、google.script.run のふりをする物を先に置いておき、
// 呼ばれた関数をそのまま gas/Code.gs（偽のスプレッドシート付き）へ渡す。
// これで「送信」と「書きかけの預かり」が、実際につながるかを見る。
const fs = require('fs'), vm = require('vm');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const base = '/home/user/siboudouki/';
const URL = process.env.URL || 'http://127.0.0.1:8765/index.html';

// ── スプレッドシートの代わり（test/gas.js と同じ作り）──
function fakeSheet(header, rows, name) {
  const grid = [header.slice()].concat((rows || []).map(r => r.slice()));
  const pad = () => {
    const w = Math.max(...grid.map(r => r.length));
    grid.forEach(r => { while (r.length < w) r.push(''); });
  };
  const noop = () => api;
  const api = {
    setValues(v) { v[0].forEach((x, i) => { grid[api._r - 1][api._c - 1 + i] = x; }); pad(); return api; },
    getValues() {
      const out = [];
      for (let i = 0; i < api._h; i++) out.push(grid[api._r - 1 + i].slice(api._c - 1, api._c - 1 + api._w));
      return out;
    },
    getValue() { return grid[api._r - 1][api._c - 1]; },
    setFontWeight: noop, setBackground: noop, setFontColor: noop,
    setVerticalAlignment: noop, setWrap: noop
  };
  return {
    grid, name: name || '回答',
    getLastRow: () => grid.length,
    getLastColumn: () => Math.max(...grid.map(r => r.length)),
    getRange(r, c, h, w) { api._r = r; api._c = c; api._h = h || 1; api._w = w || 1; return api; },
    appendRow(v) { grid.push(v.slice()); pad(); },
    deleteRow(r) { grid.splice(r - 1, 1); },
    setColumnWidth: () => {}, setFrozenRows: () => {}, setRowHeight: () => {}, hideSheet: () => {}
  };
}

const box = { '回答': fakeSheet([]) };
const ctx = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => box[n] || null,
      insertSheet: (n) => { box[n] = fakeSheet([], [], n); return box[n]; }
    }),
    getUi: () => { throw new Error('no ui'); }
  },
  Session: { getActiveUser: () => ({ getEmail: () => 'hanako@example.ed.jp' }) },
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: 1 },
    createHtmlOutputFromFile: () => ({ setTitle: () => ({ addMetaTag: () => ({ setXFrameOptionsMode: () => ({}) }) }) })
  },
  Utilities: { formatDate: () => '2026/01/01 00:00:00', getUuid: () => 'uuid' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {} }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => ({ getContent: () => t }) }), MimeType: { JSON: 1 } },
  Logger: { log: () => {} }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(base + 'gas/Code.gs', 'utf8'), ctx, { filename: 'Code.gs' });
ctx.initSheet(box['回答']);

let bad = 0;
const is = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) bad++;
  console.log((ok ? '  ok  ' : '  NG  ') + label + (ok ? '' : '  → ' + got + ' / 期待 ' + want));
};

// ページ側が google.script.run.<名前>(引数) を呼んだら、ここへ届く
const FAKE_RUN = `
  window.google = { script: { run: (function () {
    function make(ok, ng) {
      const api = {
        withSuccessHandler: (f) => make(f, ng),
        withFailureHandler: (f) => make(ok, f)
      };
      ['canKeepDraft', 'loadDraft', 'saveDraft', 'clearDraft', 'submitFromPage'].forEach(name => {
        api[name] = (arg) => {
          window.__gasCall(name, arg === undefined ? null : arg)
            .then(v => ok && ok(v), e => ng && ng({ message: String(e) }));
        };
      });
      return api;
    }
    return make();
  })() } };
`;

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 430, height: 1000 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));

  const calls = [];
  await page.exposeFunction('__gasCall', (name, arg) => {
    calls.push(name);
    return ctx[name](arg === null ? undefined : arg);
  });
  await page.addInitScript(FAKE_RUN);

  await page.goto(URL);
  await page.waitForTimeout(900);

  console.log('GAS から配信したとき:');
  is('GAS だと分かる', await page.evaluate(() => window.API.inGas()), 'true');
  is('送信先の設定は要らない', await page.evaluate(() => window.API.isConfigured()), 'true');

  // 途中まで入力する
  await page.locator('.courseCard').nth(1).click(); await page.waitForTimeout(300);
  await page.click('#nextBtn'); await page.waitForTimeout(300);
  const g = page.locator('.picks');
  for (let i = 0; i < 3; i++) { await g.nth(i).locator('.pickCard').nth(1).click(); await page.waitForTimeout(140); }
  await page.click('#nextBtn'); await page.waitForTimeout(300);
  await page.fill('#f_studentName', '山田太郎');
  await page.fill('#f_targetName', '株式会社〇〇製作所');
  await page.fill('#f_targetSub', '製造職');
  await page.waitForTimeout(3200); // サーバーへ預けるまで待つ

  is('サーバーに預けた', calls.indexOf('saveDraft') !== -1, 'true');
  is('預かった中身', JSON.parse(ctx.loadDraft()).data.studentName, '山田太郎');

  // この端末の保存を消しても、サーバーから戻ってくる
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1500);
  // 答え済みの設問は1行にたたまれているので、たたんだ表示から読む
  const nameShown = await page.textContent('[data-field="studentName"]');
  is('端末の保存が消えても続きから', nameShown.indexOf('山田太郎') !== -1, 'true');
  is('画面の位置も戻る', (await page.textContent('#stepLabel')).indexOf('基本情報') !== -1, 'true');

  // 送信まで通す。
  // 本文まで手で書くと長いので、保存内容に本文を入れて提出画面から開き直す。
  // ページを離れるときの自動保存に消されないよう、
  // 次に開いたページが動き出す前に書き込む
  await page.addInitScript(() => {
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1');
    const raw = JSON.parse(localStorage.getItem('shibou-douki-v2') || 'null');
    if (!raw) return;
    raw.data.body = 'これは送信テスト用の本文です。';
    raw.index = 10;
    localStorage.setItem('shibou-douki-v2', JSON.stringify(raw));
  });
  await page.reload(); await page.waitForTimeout(1500);
  const btn = page.locator('button:has-text("スプレッドシートに送信")');
  is('送信ボタンが押せる', await btn.isEnabled(), 'true');
  await btn.click();
  await page.waitForTimeout(1200);
  is('送信できた', (await page.textContent('#submitStatus')).indexOf('送信しました') !== -1, 'true');
  is('シートに入った', box['回答'].grid[1][box['回答'].grid[0].indexOf('名前')], '山田太郎');

  // やり直すと、サーバーの預かりも消える
  page.on('dialog', d => d.accept());
  await page.click('#resetBtn');
  await page.waitForTimeout(1500);
  is('サーバーの下書きも消えた', ctx.loadDraft(), '');

  console.log('  よんだ関数:', [...new Set(calls)].join(' , '));
  console.log('  JSエラー:', errs.length ? errs : 'なし');
  if (errs.length) bad += errs.length;
  await b.close();

  console.log('\n=== ' + (bad ? bad + ' 件おかしい' : '問題なし') + ' ===');
  process.exit(bad ? 1 : 0);
})();
