// 設問まわりの「そろっているはず」を機械で確かめる。
//   ・設問IDの重複、ラベル落ち、選択肢の重複
//   ・グループの見出しが二度出ないか（設問が飛び飛びに並んでいないか）
//   ・進路（進学／就職）に合わない言葉が混じっていないか
//   ・答えた内容が payload とスプレッドシートの列にそろっているか
const fs = require('fs'), vm = require('vm');
const base = '/home/user/siboudouki/';
const s = { window: {}, console }; s.window.window = s.window; vm.createContext(s);
['assets/js/questions.js', 'assets/js/compose.js', 'assets/js/checklist.js']
  .forEach(f => vm.runInContext(fs.readFileSync(base + f, 'utf8'), s, { filename: f }));
const W = s.window, Q = W.QUESTIONS;

let bad = 0;
const ng = (...a) => { bad++; console.log('  NG  ' + a.join(' ')); };

// 答えが一通り入っている状態。showIf で出る設問まで見たいので埋めておく
const FILLED = {
  shushoku: {
    course: 'shushoku', orgType: '会社（民間企業）', targetName: '株式会社〇〇製作所', targetSub: '製造職',
    knewBy: 'その他', knewByOther: '家族から聞いた',
    featureKind: '仕事内容', featureName: '〇〇部品の精密加工', featureDetail: '検査まで自社で行うこと',
    efforts: ['アルバイト'], effortWhich: 'コンビニでのアルバイト', effortHard: '意見がまとまらないこと',
    strengths: ['正確に作業できる'], personality: ['責任感が強い'],
    futureKind: '身につけていたい力・技術', afterGradKind: '身につけていたい力・技術'
  }
};
FILLED.shingaku = Object.assign({}, FILLED.shushoku, {
  course: 'shingaku', orgType: '大学', targetName: '〇〇大学', targetSub: '経済学部経済学科',
  featureKind: '授業・カリキュラム', featureName: '地域経済フィールドワーク',
  efforts: ['資格・検定の取得']
});

const MODES = ['shingaku', 'shushoku'];

// ── 1. 設問そのものの点検 ────────────────────────────
console.log('設問の作り:');
MODES.forEach(mode => {
  W.COMPOSE.TEMPLATES.forEach(t => {
    const d = Object.assign({}, FILLED[mode], { template: t.id });
    const seen = {};
    Q.buildSteps(mode, t.id, d).forEach(st => {
      const labels = {};
      st.fields.forEach(f => {
        if (seen[f.id]) ng('設問IDが重複', mode, t.id, f.id);
        seen[f.id] = 1;
        const lab = typeof f.label === 'function' ? f.label(d) : f.label;
        if (!lab) ng('ラベルがない', mode, t.id, f.id);
        else if (labels[lab]) ng('同じ設問文が2つ', mode, t.id, st.id, '「' + lab + '」');
        labels[lab] = 1;
        if (f.options) {
          const o = {};
          f.options.forEach(x => { if (o[x]) ng('選択肢が重複', mode, t.id, f.id, x); o[x] = 1; });
        }
        if (f.default != null && f.options && f.options.indexOf(f.default) === -1) {
          ng('はじめの値が選択肢にない', mode, t.id, f.id, f.default);
        }
      });
    });
  });
});

// ── 2. 見出しが二度出ないか ──────────────────────────
// 同じグループの設問が飛び飛びに並んでいると、
// 画面では「1 入社したあとのこと」「2 何年後かの自分」「3 入社したあとのこと」と出てしまう
console.log('見出しの並び:');
MODES.forEach(mode => {
  W.COMPOSE.TEMPLATES.forEach(t => {
    const d = Object.assign({}, FILLED[mode], { template: t.id });
    [Q.buildSteps(mode, t.id, d), Q.buildSteps(mode, t.id)].forEach(steps => {
      steps.forEach(st => {
        let prev = null; const order = [], seen = {};
        st.fields.forEach(f => { if (f.group !== prev) { order.push(f.group); prev = f.group; } });
        order.forEach(g => {
          if (seen[g]) ng('見出しが二度出る', mode, t.id, st.id, g, '→', order.join(' , '));
          seen[g] = 1;
        });
      });
    });
  });
});

// ── 3. 進路に合わない言葉 ────────────────────────────
// 「進学なのに求人票」「就職なのにオープンキャンパス」を防ぐ
console.log('進路ごとの言葉:');
const WRONG = {
  shingaku: /会社|入社|求人|社員|職種|業務内容|貴社/,
  shushoku: /入学(?!して)|進学|大学|学科|オープンキャンパス|貴学|貴校/
};
// 例として両方を並べている説明は、わざとそう書いている
const ALLOW = ['valueFound.avoid', 'afterGradWhat.examples'];
MODES.forEach(mode => {
  const seen = {};
  W.COMPOSE.TEMPLATES.forEach(t => {
    const d = Object.assign({}, FILLED[mode], { template: t.id });
    Q.buildSteps(mode, t.id, d).forEach(st => {
      const look = (where, v) => {
        if (typeof v === 'function') { try { v = v(d); } catch (e) { return; } }
        if (Array.isArray(v)) v = v.join(' ');
        if (typeof v !== 'string') return;
        const hit = v.match(WRONG[mode]);
        if (!hit || ALLOW.indexOf(where) !== -1 || seen[mode + where]) return;
        seen[mode + where] = 1;
        ng(mode, where, '…「' + hit[0] + '」', v.slice(0, 60));
      };
      look(st.id + '.title', st.title); look(st.id + '.lead', st.lead); look(st.id + '.note', st.note);
      (st.groups || []).forEach(g => { look(st.id + '.g', g.name); look(st.id + '.gd', g.desc); });
      st.fields.forEach(f => ['label', 'hint', 'avoid', 'placeholder', 'examples']
        .forEach(k => look(f.id + '.' + k, f[k])));
    });
  });
});

// ── 4. 答えの受け渡し ────────────────────────────────
console.log('答えの受け渡し:');
const ids = new Set();
MODES.forEach(m => W.COMPOSE.TEMPLATES.forEach(t =>
  Q.buildSteps(m, t.id).forEach(st => st.fields.forEach(f => ids.add(f.id)))));

const app = fs.readFileSync(base + 'assets/js/app.js', 'utf8');
const pay = app.match(/function payload\(\)[\s\S]*?\n  \}/)[0];
const payKeys = [...pay.matchAll(/^\s{6}([A-Za-z0-9_]+):/gm)].map(x => x[1]);
// カードと「なぜ？」は、1つの欄が複数の列にばらけるので別あつかい
const SPREAD = ['attractCards', 'whyChain'];
[...ids].forEach(id => {
  if (SPREAD.indexOf(id) === -1 && payKeys.indexOf(id) === -1) ng('先生に届かない設問', id);
});

const gas = fs.readFileSync(base + 'gas/Code.gs', 'utf8');
const cols = [...gas.matchAll(/key:\s*'([^']+)'/g)].map(x => x[1]);
// course は courseName として送る。timestamp は受信側でつける
const ONLY_APP = ['course'], ONLY_GAS = ['timestamp'];
payKeys.forEach(k => {
  if (cols.indexOf(k) === -1 && ONLY_APP.indexOf(k) === -1) ng('シートに列がない', k);
});
cols.forEach(k => {
  if (payKeys.indexOf(k) === -1 && ONLY_GAS.indexOf(k) === -1 && !/^card\d/.test(k)) {
    ng('送っていない列', k);
  }
});

// ── 5. 必須のつながり ────────────────────────────────
// 「それを、どうやって乗り越えましたか」は、
// 「いちばん大変だったこと」を書いた人にだけ出す。
// 前の欄が空のまま必須にすると、「それ」が何も指さない設問になる
console.log('必須のつながり:');
MODES.forEach(mode => {
  W.COMPOSE.TEMPLATES.forEach(t => {
    const blank = Object.assign({}, FILLED[mode], { template: t.id, effortHard: '' });
    const shown = [];
    Q.buildSteps(mode, t.id, blank).forEach(st => st.fields.forEach(f => shown.push(f.id)));
    if (shown.indexOf('effortHow') !== -1) {
      ng('大変だったことが空なのに「乗り越え方」が出る', mode, t.id);
    }
  });
});

console.log('\n=== ' + (bad ? bad + ' 件おかしい' : '問題なし') + ' ===');
process.exit(bad ? 1 : 0);
