/**
 * 志望動機メーカー ─ Google Apps Script（受信・保存側）
 *
 * 役割:
 *   Webアプリから送られてきた回答を、スプレッドシートに1行として記録する。
 *
 * 使い方は docs/03_SETUP.md を参照。
 */

// ── 設定 ─────────────────────────────────────────────
var SHEET_NAME = '回答';

/** 同じ「名前 + 志望校」の行があれば、追加せずに上書きする（書き直しを想定） */
var UPDATE_IF_EXISTS = true;

/** 列の定義。順番がそのままスプレッドシートの列順になる。 */
var COLUMNS = [
  { key: 'timestamp',       label: '送信日時',            width: 140 },
  { key: 'studentName',     label: '名前',                width: 110 },
  { key: 'juniorHigh',      label: '中学校',              width: 150 },
  { key: 'className',       label: 'クラス・番号',        width: 110 },
  { key: 'targetSchool',    label: '志望校',              width: 180 },
  { key: 'targetCourse',    label: '学科・コース',        width: 140 },
  { key: 'examType',        label: '受験の種類',          width: 100 },
  { key: 'bodyChars',       label: '本文字数',            width: 80 },
  { key: 'targetChars',     label: '目標字数',            width: 80 },
  { key: 'template',        label: '構成',                width: 110 },
  { key: 'body',            label: '本文',                width: 460 },
  { key: 'mainReason',      label: '志望理由（ひとこと）', width: 220 },
  { key: 'why1',            label: 'なぜ1',               width: 200 },
  { key: 'why2',            label: 'なぜ2',               width: 200 },
  { key: 'why3',            label: 'なぜ3',               width: 200 },
  { key: 'mustReason',      label: 'この学校でなければ',   width: 240 },
  { key: 'efforts',         label: 'がんばったこと',      width: 160 },
  { key: 'effortDetail',    label: 'がんばったこと詳細',  width: 260 },
  { key: 'effortLearned',   label: '学んだこと',          width: 220 },
  { key: 'strengths',       label: '得意・好きな教科',    width: 160 },
  { key: 'personality',     label: '性格',                width: 160 },
  { key: 'futureDream',     label: '将来やりたいこと',    width: 180 },
  { key: 'futureWhy',       label: 'そのきっかけ',        width: 220 },
  { key: 'knewBy',          label: '知ったきっかけ',      width: 150 },
  { key: 'visited',         label: '参加したもの',        width: 150 },
  { key: 'visitImpression', label: '印象に残ったこと',    width: 240 },
  { key: 'attractPoints',   label: '魅力を感じた点',      width: 180 },
  { key: 'curriculum',      label: '学校独自の制度',      width: 240 },
  { key: 'clubWant',        label: '入りたい部活',        width: 120 },
  { key: 'schoolPolicy',    label: '共感した教育目標',    width: 200 },
  { key: 'afterEnter',      label: '入学後にやりたいこと', width: 180 },
  { key: 'afterEnterDetail',label: '入学後の取り組み',    width: 240 },
  { key: 'afterGrad',       label: '卒業後の進路',        width: 200 },
  { key: 'tone',            label: '文体',                width: 90 }
];

// ── 受信エンドポイント ────────────────────────────────

/**
 * Webアプリからの POST を受け取る。
 * フロント側は Content-Type: text/plain で JSON 文字列を送ってくる
 * （CORSのプリフライトを避けるため）。
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, message: '送信内容が空です。' });
    }

    var payload = JSON.parse(e.postData.contents);

    if (!checkToken(payload.token)) {
      return json({ ok: false, message: '合言葉が違います。config.js の SHARED_TOKEN を確認してください。' });
    }
    if (!String(payload.studentName || '').trim()) {
      return json({ ok: false, message: '名前が入力されていません。' });
    }
    if (!String(payload.body || '').trim()) {
      return json({ ok: false, message: '本文が空です。' });
    }

    var saved = saveRow(payload);
    return json({ ok: true, row: saved.row, mode: saved.mode, message: '保存しました。' });

  } catch (err) {
    return json({ ok: false, message: 'サーバー側でエラーが起きました: ' + err.message });
  }
}

/** 動作確認用。ブラウザでURLを開くとこれが返る。 */
function doGet() {
  return json({
    ok: true,
    message: '志望動機メーカーの受信サーバーは動作しています。',
    sheet: SHEET_NAME,
    columns: COLUMNS.length
  });
}

// ── 保存処理 ─────────────────────────────────────────

function saveRow(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // 同時送信で行が壊れないようにする
  try {
    var sheet = getSheet();
    payload.timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');

    var values = COLUMNS.map(function (c) {
      var v = payload[c.key];
      return v === undefined || v === null ? '' : v;
    });

    var existing = UPDATE_IF_EXISTS ? findRow(sheet, payload.studentName, payload.targetSchool) : -1;

    if (existing > 0) {
      sheet.getRange(existing, 1, 1, values.length).setValues([values]);
      return { row: existing, mode: 'update' };
    }

    sheet.appendRow(values);
    var row = sheet.getLastRow();
    sheet.getRange(row, 1, 1, values.length).setVerticalAlignment('top').setWrap(true);
    return { row: row, mode: 'insert' };

  } finally {
    lock.releaseLock();
  }
}

/** 同じ名前・同じ志望校の行を探す（見つからなければ -1）*/
function findRow(sheet, name, school) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;

  var nameCol = colIndex('studentName');
  var schoolCol = colIndex('targetSchool');
  var data = sheet.getRange(2, 1, last - 1, COLUMNS.length).getValues();

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][nameCol - 1]).trim() === String(name).trim() &&
        String(data[i][schoolCol - 1]).trim() === String(school).trim()) {
      return i + 2;
    }
  }
  return -1;
}

function colIndex(key) {
  for (var i = 0; i < COLUMNS.length; i++) {
    if (COLUMNS[i].key === key) return i + 1;
  }
  return -1;
}

// ── シート準備 ────────────────────────────────────────

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    initSheet(sheet);
  } else if (sheet.getLastRow() === 0) {
    initSheet(sheet);
  }
  return sheet;
}

function initSheet(sheet) {
  var labels = COLUMNS.map(function (c) { return c.label; });
  sheet.getRange(1, 1, 1, labels.length).setValues([labels]);

  var header = sheet.getRange(1, 1, 1, labels.length);
  header.setFontWeight('bold')
        .setBackground('#2f6fd0')
        .setFontColor('#ffffff')
        .setVerticalAlignment('middle');

  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 34);

  COLUMNS.forEach(function (c, i) {
    sheet.setColumnWidth(i + 1, c.width || 140);
  });
}

// ── 合言葉 ───────────────────────────────────────────

/**
 * スクリプトプロパティ FORM_TOKEN と照合する。
 * FORM_TOKEN を設定していない場合は、誰でも送信できる（校内利用なら実用上これで足りる）。
 */
function checkToken(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('FORM_TOKEN');
  if (!expected) return true;
  return String(token || '') === expected;
}

// ── セットアップ用（スクリプトエディタから手動実行）────────

/**
 * 最初に1回だけ実行する。
 * シートを作り、合言葉を設定する。
 */
function setup() {
  var sheet = getSheet();
  initSheet(sheet);

  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('FORM_TOKEN');
  if (!token) {
    token = Utilities.getUuid().slice(0, 8);
    props.setProperty('FORM_TOKEN', token);
  }
  notify('セットアップ完了',
    'シート「' + SHEET_NAME + '」を準備しました。\n\n' +
    '合言葉(FORM_TOKEN): ' + token + '\n\n' +
    'この文字列を config.js の SHARED_TOKEN に貼り付けてください。');
}

/** 保存されている合言葉を確認する */
function showToken() {
  notify('合言葉', PropertiesService.getScriptProperties().getProperty('FORM_TOKEN') || '（未設定）');
}

/** 画面が使えるときはダイアログ、使えないときは実行ログに出す */
function notify(title, message) {
  try {
    SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log(title + ': ' + message);
  }
}

/** 送信テスト（スプレッドシートにテスト行が1行入る）*/
function testSubmit() {
  var res = doPost({
    postData: {
      contents: JSON.stringify({
        token: PropertiesService.getScriptProperties().getProperty('FORM_TOKEN') || '',
        studentName: 'テスト太郎',
        juniorHigh: 'テスト中学校',
        targetSchool: 'テスト高等学校',
        targetCourse: '普通科',
        body: 'これは動作確認用のテスト送信です。',
        bodyChars: 20,
        targetChars: 400
      })
    }
  });
  notify('送信テストの結果', res.getContent());
}

// ── ユーティリティ ────────────────────────────────────

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** スプレッドシートを開いたときのメニュー */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('志望動機メーカー')
    .addItem('初期セットアップ', 'setup')
    .addItem('合言葉を表示', 'showToken')
    .addItem('送信テスト', 'testSubmit')
    .addToUi();
}
