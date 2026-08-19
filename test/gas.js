// GAS（受信側）の列そろえを、スプレッドシートの代わりの偽物で確かめる。
// アプリに設問が増えて COLUMNS の途中に列が入っても、
// すでに記録してある行がずれないことを見る。
const fs = require('fs'), vm = require('vm');
const base = '/home/user/siboudouki/';

/** 最低限のシートの代わり */
function fakeSheet(header, rows) {
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
    setFontWeight: noop, setBackground: noop, setFontColor: noop,
    setVerticalAlignment: noop, setWrap: noop
  };
  return {
    grid: grid,
    getLastRow: () => grid.length,
    getLastColumn: () => Math.max(...grid.map(r => r.length)),
    getRange(r, c, h, w) { api._r = r; api._c = c; api._h = h || 1; api._w = w || 1; return api; },
    appendRow(v) { grid.push(v.slice()); pad(); },
    setColumnWidth: () => {}, setFrozenRows: () => {}, setRowHeight: () => {}
  };
}

function load(sheet) {
  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }),
      getUi: () => { throw new Error('no ui'); }
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

console.log('\n=== ' + (bad ? bad + ' 件おかしい' : '問題なし') + ' ===');
process.exit(bad ? 1 : 0);
