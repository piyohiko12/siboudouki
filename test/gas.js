// GAS（受信側）の列そろえを、スプレッドシートの代わりの偽物で確かめる。
// アプリに設問が増えて COLUMNS の途中に列が入っても、
// すでに記録してある行がずれないことを見る。
const fs = require('fs'), vm = require('vm');
const base = '/home/user/siboudouki/';

/** 最低限のシートの代わり */
function fakeSheet(header, rows, name) {
  const grid = [header.slice()].concat((rows || []).map(r => r.slice()));
  const pad = () => {
    const w = Math.max(...grid.map(r => r.length));
    grid.forEach(r => { while (r.length < w) r.push(''); });
  };
  const noop = () => api;
  const api = {
    setValues(v) {
      v[0].forEach((x, i) => { grid[api._r - 1][api._c - 1 + i] = x; });
      pad(); return api;
    },
    getValues() {
      const out = [];
      for (let i = 0; i < api._h; i++) {
        out.push(grid[api._r - 1 + i].slice(api._c - 1, api._c - 1 + api._w));
      }
      return out;
    },
    getValue() { return grid[api._r - 1][api._c - 1]; },
    setFontWeight: noop, setBackground: noop, setFontColor: noop,
    setVerticalAlignment: noop, setWrap: noop
  };
  return {
    grid: grid,
    name: name || '回答',
    getLastRow: () => grid.length,
    getLastColumn: () => Math.max(...grid.map(r => r.length)),
    getRange(r, c, h, w) { api._r = r; api._c = c; api._h = h || 1; api._w = w || 1; return api; },
    appendRow(v) { grid.push(v.slice()); pad(); },
    deleteRow(r) { grid.splice(r - 1, 1); },
    setColumnWidth: () => {}, setFrozenRows: () => {}, setRowHeight: () => {}, hideSheet: () => {}
  };
}

function load(sheet, email) {
  const sheets = { '回答': sheet };
  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n) => sheets[n] || null,
        insertSheet: (n) => { sheets[n] = fakeSheet([], [], n); return sheets[n]; }
      }),
      getUi: () => { throw new Error('no ui'); }
    },
    Session: { getActiveUser: () => ({ getEmail: () => (email === undefined ? 'hanako@example.ed.jp' : email) }) },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 1 },
      createHtmlOutputFromFile: (n) => {
        if (n !== 'Index') throw new Error('no file');
        const o = { kind: 'html', file: n };
        o.setTitle = () => o; o.addMetaTag = () => o; o.setXFrameOptionsMode = () => o;
        return o;
      }
    },
    Utilities: { formatDate: () => '2026/01/01 00:00:00', getUuid: () => 'test-uuid' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {} }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => ({ getContent: () => t }) }), MimeType: { JSON: 1 } },
    Logger: { log: () => {} }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(base + 'gas/Code.gs', 'utf8'), ctx, { filename: 'Code.gs' });
  return ctx;
}

let bad = 0;
function is(label, got, want) {
  const ok = String(got) === String(want);
  if (!ok) bad++;
  console.log((ok ? '  ok  ' : '  NG  ') + label + (ok ? '' : '  → ' + got + ' / 期待 ' + want));
}

// ── 1. まっさらなシート ───────────────────────────
{
  const sheet = fakeSheet([]);
  const ctx = load(sheet);
  ctx.initSheet(sheet);
  ctx.saveRow({ studentName: '山田太郎', targetName: '〇〇社', body: 'ほんぶん' });
  const head = sheet.grid[0], row = sheet.grid[1];
  console.log('新しいシート:');
  is('列の数が COLUMNS と同じ', head.length, ctx.COLUMNS.length);
  is('名前が名前の列に入る', row[head.indexOf('名前')], '山田太郎');
  is('本文が本文の列に入る', row[head.indexOf('本文')], 'ほんぶん');
}

// ── 2. 古いシート（途中の列がまだ無い）──────────────
{
  const ctx0 = load(fakeSheet([]));
  const all = ctx0.COLUMNS.map(c => c.label);
  // 「学びを活かせる場面」など、あとから足した列がまだ無い状態を作る
  const oldLabels = all.filter(l => ['学びを活かせる場面', 'きっかけ（その他）', '職種・学科を選んだ理由'].indexOf(l) === -1);
  const oldRow = oldLabels.map(l => '旧' + l);
  const sheet = fakeSheet(oldLabels, [oldRow]);
  const ctx = load(sheet);
  ctx.saveRow({
    studentName: '佐藤花子', targetName: '△△大学', body: '新しい本文',
    effortUse: '手順を確認する場面', knewByOther: '家族から聞いた', subReason: '学びたいから'
  });
  const head = sheet.grid[0];
  console.log('あとから列が増えたシート:');
  is('前からあった行はそのまま', sheet.grid[1][oldLabels.indexOf('名前')], '旧名前');
  is('足りない列が右端に足される', head.length, all.length);
  is('新しい行の名前', sheet.grid[2][head.indexOf('名前')], '佐藤花子');
  is('新しい列にも入る', sheet.grid[2][head.indexOf('学びを活かせる場面')], '手順を確認する場面');
  is('本文の列がずれていない', sheet.grid[2][head.indexOf('本文')], '新しい本文');
}

// ── 3. 同じ人の書き直しは上書きになる ────────────────
{
  const sheet = fakeSheet([]);
  const ctx = load(sheet);
  ctx.initSheet(sheet);
  ctx.saveRow({ studentName: '鈴木一郎', targetName: '□□社', body: '1回目' });
  const r = ctx.saveRow({ studentName: '鈴木一郎', targetName: '□□社', body: '2回目' });
  const head = sheet.grid[0];
  console.log('同じ人が出し直したとき:');
  is('行が増えない', sheet.grid.length, 2);
  is('上書きになる', r.mode, 'update');
  is('本文が新しくなる', sheet.grid[1][head.indexOf('本文')], '2回目');
}

// ── 4. アプリ本体の配信 ───────────────────────────
{
  const ctx = load(fakeSheet([]));
  console.log('アプリの配信:');
  const res = ctx.doGet();
  is('Index.html を返す', res.kind, 'html');

  // Index.html を置いていないときは、確認用のJSONに落ちる
  const ctx2 = load(fakeSheet([]));
  ctx2.HtmlService.createHtmlOutputFromFile = () => { throw new Error('no file'); };
  is('置いていなければ確認用の応答', JSON.parse(ctx2.doGet().getContent()).ok, 'true');
}

// ── 5. ページから直接よぶ送信 ──────────────────────
{
  const sheet = fakeSheet([]);
  const ctx = load(sheet);
  ctx.initSheet(sheet);
  console.log('ページからの送信:');
  is('名前が空なら断る', ctx.submitFromPage({ body: 'あ' }).ok, 'false');
  is('本文が空なら断る', ctx.submitFromPage({ studentName: '山田' }).ok, 'false');
  const r = ctx.submitFromPage({ studentName: '山田太郎', targetName: '〇〇社', body: 'ほんぶん' });
  is('ふつうに保存できる', r.ok, 'true');
  is('本文が入る', sheet.grid[1][sheet.grid[0].indexOf('本文')], 'ほんぶん');
  is('合言葉は要らない', ctx.submitFromPage({ studentName: '佐藤', targetName: '△△社', body: 'x' }).ok, 'true');
}

// ── 6. 書きかけの下書き ──────────────────────────
{
  const ctx = load(fakeSheet([]));
  console.log('書きかけの下書き:');
  is('預かれる', ctx.canKeepDraft(), 'true');
  is('はじめは空', ctx.loadDraft(), '');
  ctx.saveDraft('{"data":{"studentName":"山田太郎"},"savedAt":1}');
  is('預けたものが戻る', JSON.parse(ctx.loadDraft()).data.studentName, '山田太郎');
  ctx.saveDraft('{"data":{"studentName":"山田次郎"},"savedAt":2}');
  is('上書きになる', JSON.parse(ctx.loadDraft()).data.studentName, '山田次郎');
  ctx.clearDraft();
  is('消せる', ctx.loadDraft(), '');

  // 誰が開いているか分からないとき（匿名で公開したとき）は預からない
  const anon = load(fakeSheet([]), '');
  is('匿名なら預からない', anon.canKeepDraft(), 'false');
  is('匿名では読めない', anon.loadDraft(), '');
  is('匿名では書けない', anon.saveDraft('x'), 'false');
}

// ── 7. 人がちがえば下書きも別 ─────────────────────
{
  const shared = fakeSheet([]);
  const a = load(shared, 'a@example.ed.jp');
  const b = load(shared, 'b@example.ed.jp');
  // 同じスプレッドシートを見るように、下書きシートを共有させる
  const box = {};
  [a, b].forEach(ctx => {
    ctx.SpreadsheetApp.getActiveSpreadsheet = () => ({
      getSheetByName: (n) => box[n] || null,
      insertSheet: (n) => { box[n] = fakeSheet([], [], n); return box[n]; }
    });
  });
  a.saveDraft('{"savedAt":1,"data":{"studentName":"Aさん"}}');
  b.saveDraft('{"savedAt":1,"data":{"studentName":"Bさん"}}');
  console.log('人ごとの下書き:');
  is('Aさんの下書き', JSON.parse(a.loadDraft()).data.studentName, 'Aさん');
  is('Bさんの下書き', JSON.parse(b.loadDraft()).data.studentName, 'Bさん');
  a.clearDraft();
  is('Aを消してもBは残る', JSON.parse(b.loadDraft()).data.studentName, 'Bさん');
}

console.log('\n=== ' + (bad ? bad + ' 件おかしい' : '問題なし') + ' ===');
process.exit(bad ? 1 : 0);
