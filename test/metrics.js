// 文章の「読み心地」を数字で見る。改善の前後で比べるための物差し。
const fs = require('fs'), vm = require('vm');
// OLD=<git参照> をつけると、そのときのコードで測って前後を比べられる。
//   node test/metrics.js            いまのコード
//   OLD=HEAD~1 node test/metrics.js 1つ前のコミット
const root = require('path').join(__dirname, '..');
let base = require('path').join(root, 'assets/js') + '/';
if (process.env.OLD) {
  const os = require('os'), cp = require('child_process');
  base = fs.mkdtempSync(os.tmpdir() + '/shibou-') + '/';
  ['questions.js', 'compose.js', 'checklist.js'].forEach(f => {
    fs.writeFileSync(base + f,
      cp.execSync('git show ' + process.env.OLD + ':assets/js/' + f, { cwd: root }));
  });
  console.log('（' + process.env.OLD + ' のコードで測ります）\n');
}
const s = { window: {}, console }; s.window.window = s.window; vm.createContext(s);
['questions.js', 'compose.js', 'checklist.js']
  .forEach(f => vm.runInContext(fs.readFileSync(base + f, 'utf8'), s, { filename: f }));
const W = s.window;

const src = fs.readFileSync(__dirname + '/smoke.js', 'utf8');
const D = new Function('return (function(){' +
  src.slice(src.indexOf('const common'), src.indexOf("[['進学'")) +
  'return {shingaku,shushoku};})()')();

function sentences(text) { return text.replace(/\n\n/g, '').match(/[^。]*。/g) || []; }

function measure(text) {
  const paras = text.split('\n\n');
  const sents = sentences(text);

  // 語尾（末尾5字）の最大出現数
  const endings = {};
  sents.forEach(x => { const k = x.slice(-6); endings[k] = (endings[k] || 0) + 1; });
  const maxEnding = Math.max.apply(null, Object.values(endings).concat([0]));

  return {
    文数: sents.length,
    一文だけの段落: paras.slice(0, -1).filter(p => sentences(p).length === 1).length,
    私の数: (text.match(/私/g) || []).length,
    その中で: (text.match(/その中で/g) || []).length,
    同語尾の最大: maxEnding,
    と考えています: (text.match(/と考えています|と考えている/g) || []).length,
    文頭が私: sents.filter(x => /^私/.test(x)).length
  };
}

const KEYS = ['文数', '一文だけの段落', '私の数', 'その中で', '同語尾の最大', 'と考えています', '文頭が私'];
const total = {}; KEYS.forEach(k => total[k] = 0);
let n = 0;

[['進学', D.shingaku, 600], ['就職', D.shushoku, 600]].forEach(([label, d, chars]) => {
  W.COMPOSE.TEMPLATES.forEach(t => {
    const r = W.COMPOSE.generate(Object.assign({}, d, { targetChars: chars }), t.id);
    const m = measure(r.text);
    n++; KEYS.forEach(k => total[k] += m[k]);
    console.log('  ' + label + ' ' + t.name.padEnd(7, '　') + ' ' +
      KEYS.map(k => k + '=' + m[k]).join('  '));
  });
});

console.log('\n【平均】' + KEYS.map(k => k + '=' + (total[k] / n).toFixed(1)).join('  '));

// 同じ回答を別の生徒が入れたとき、文章がどれだけ似るか
const NAMES = ['山田太郎', '佐藤花子', '鈴木一郎', '田中美咲', '高橋健太', '伊藤さくら',
  '渡辺翔', '中村optimism'.replace('optimism', '結衣'), '小林大輝', '加藤ひなた'];
const texts = NAMES.map(n =>
  W.COMPOSE.generate(Object.assign({}, D.shingaku, { studentName: n, targetChars: 600 }), 'prep').text);
let pairs = 0, sum = 0, worst = 0;
for (let i = 0; i < texts.length; i++) {
  for (let j = i + 1; j < texts.length; j++) {
    const x = sentences(texts[i]), y = sentences(texts[j]);
    const same = x.filter(t => y.indexOf(t) !== -1).length / x.length;
    pairs++; sum += same; worst = Math.max(worst, same);
    }
}
console.log('\n【別人が同じ回答をしたとき】' + NAMES.length + '人 ' + pairs + '組で比較');
console.log('  完全に同じ文の割合：平均 ' + (sum / pairs * 100).toFixed(0) + '%  最悪 ' + (worst * 100).toFixed(0) + '%');
console.log('  ちがう文の出方（先頭2文）:');
[0, 1, 2].forEach(i => console.log('    ' + NAMES[i] + '：' + sentences(texts[i]).slice(0, 1).join('')));
