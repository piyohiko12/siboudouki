// 選択肢を1つずつ文にして、日本語として通るかを目で確かめる
const fs = require('fs'), vm = require('vm');
const base = '/home/user/siboudouki/';
const s = { window: {}, console }; s.window.window = s.window; vm.createContext(s);
['assets/js/questions.js', 'assets/js/compose.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(base + f, 'utf8'), s, { filename: f }));
const Q = s.window.QUESTIONS, C = s.window.COMPOSE;

function head(t) { console.log('\n──── ' + t + ' ────'); }

['shingaku', 'shushoku'].forEach(mode => {
  const job = mode === 'shushoku';
  head((job ? '就職' : '進学') + '：魅力カードの場面');
  Q.whereList(mode).forEach(w => {
    console.log('  ' + w.lead + (job ? '社員の方が声をかけ合っていた' : '学生同士が話し合っていた') + 'のが印象に残りました。');
  });
});

head('気持ち（1つ選んだとき）');
Q.FEELINGS.forEach(f => console.log('  そのとき私は' + Q.feelPhrase([f.label]) + '。'));

head('気持ち（2つ選んだとき・組み合わせを2件ずつ）');
Q.FEELINGS.forEach((f, i) => {
  const g = Q.FEELINGS[(i + 1) % Q.FEELINGS.length];
  console.log('  そのとき私は' + Q.feelPhrase([f.label, g.label]) + '。');
});

head('将来の答え方（名詞で書いたとき／述語で書いたとき）');
const steps0 = Q.buildSteps('shingaku', 'future');
const flat = st => st.reduce((a, x) => a.concat(x.fields), []);
const fk = flat(steps0).find(f => f.id === 'futureKind').options;
fk.forEach(k => {
  console.log('  ' + Q.futureSentence(k, '看護師'));
  console.log('  ' + Q.futureSentence(k, '人を助けたい'));
});

head('きっかけの場（名詞／述語）');
const ws = flat(steps0).find(f => f.id === 'futureWhySource').options;
ws.forEach(w => {
  console.log('  ' + Q.whySourceSentence(w, '祖母の入院'));
  console.log('  ' + Q.whySourceSentence(w, '祖母が入院した'));
});

['shingaku', 'shushoku'].forEach(mode => {
  const job = mode === 'shushoku';
  head((job ? '就職' : '進学') + '：どうしたいか（名詞／述語）');
  const st = Q.buildSteps(mode, 'prep');
  flat(st).find(f => f.id === 'wantVerb').options.forEach(v => {
    console.log('  私が貴校を志望した理由は、' + Q.wantPhrase(v, job ? '正確なものづくり' : '地域の課題を調べる力', mode) + 'からです。');
    console.log('  私が貴校を志望した理由は、' + Q.wantPhrase(v, job ? '人の役に立つ' : '人の役に立つ', mode) + 'からです。');
  });

  head((job ? '就職' : '進学') + '：特色の種類');
  flat(st).find(f => f.id === 'featureKind').options.forEach(k => {
    console.log('  私が特に関心を持ったのは、' + (job ? '貴社' : '貴校') + 'の' + k + '「◯◯」です。');
  });

  head((job ? '就職' : '進学') + '：入学・入社後にやりたいこと');
  flat(st).find(f => f.id === 'afterEnter').options.forEach(a => {
    console.log('  ' + (job ? '入社後' : '入学後') + 'は、' + a + 'に取り組みたいと考えています。');
  });

  head((job ? '就職' : '進学') + '：いつのことか');
  flat(st).find(f => f.id === 'effortWhen').options.forEach(w => {
    console.log('  ' + w + '、いちばん力を入れてきたのは部活動です。');
  });

  head((job ? '就職' : '進学') + '：がんばったこと');
  flat(st).find(f => f.id === 'efforts').options.forEach(e => {
    console.log('  1年生から3年間、いちばん力を入れてきたのは' + e + 'です。');
  });

  head((job ? '就職' : '進学') + '：実際に行ったこと');
  flat(st).find(f => f.id === 'visited').options
    .filter(v => v.indexOf('まだ') !== 0)
    .forEach(v => console.log('  ' + v + 'にも参加し、自分の目で確かめました。'));

  head((job ? '就職' : '進学') + '：知ったきっかけ（エピソード型でだけ聞く）');
  const story = Q.buildSteps(mode, 'story');
  flat(story).find(f => f.id === 'knewBy').options.forEach(k => {
    const by = k === 'その他' ? '' : k;
    console.log('  ' + (by
      ? 'そんな私が貴校を知ったのは、' + by + 'がきっかけでした。'
      : 'そんな中で出会ったのが、貴校でした。（「その他」は文に出さない）'));
  });

  if (job) {
    head('就職：活かせる力を身につけた場');
    flat(st).find(f => f.id === 'contributionFrom').options.forEach(c => {
      console.log('  ' + c + 'で身につけた◯◯は、この仕事でも活かせると考えています。');
    });
  }

  head((job ? '就職' : '進学') + '：いつの話で締めくくるか');
  flat(st).find(f => f.id === 'afterGradWhen').options.forEach(w => {
    console.log('  ' + (job ? w + 'には、◯◯を身につけていたいです。' : w + 'は、◯◯を目指したいと考えています。'));
  });
});

// ── 追加した2〜4択：両方の枝を1文にして確かめる ──
head('志望先の種類（敬称・「入学後」の言い方）');
['shingaku', 'shushoku'].forEach(mode => {
  Q.orgTypeList(mode).forEach(o => {
    console.log('  ' + o.label + '：同じような' + o.org + 'は他にもありますが、'
      + o.honorific + 'には◯◯という違いがあります。／' + o.joinAfter + 'は、△△に取り組みたいと考えています。');
  });
});

head('取り組んだことが行動か、作ったものか');
[['自分がやった行動', '練習メニューの見直し'], ['自分が作ったもの・仕組み', '練習メニュー表']].forEach(([k, w]) => {
  const d = { course: 'shingaku', effortActionKind: k, effortAction: w, efforts: ['部活動'], whyChain: {} };
  const t = C.generate(d, 'story').text.match(/[^。]*(に取り組みました|を作りました|に力を注ぎました)。/);
  console.log('  ' + k + '：' + (t ? t[0] : '（なし）'));
});

head('志望先の特色に名前があるか');
[['そのままの名前が載っていた', '地域経済フィールドワーク'], ['名前はなく、自分の言葉でまとめた', '少人数で進める']].forEach(([k, w]) => {
  const d = { course: 'shingaku', targetName: '〇〇大学', featureNamed: k, featureName: w, featureKind: '演習', whyChain: {} };
  const t = C.generate(d, 'prep').text.match(/私が特に関心を持ったのは、[^。]*。/);
  console.log('  ' + k + '：' + (t ? t[0] : '（なし）'));
});

head('将来を「もの」で締めるか「姿」で締めるか');
[['shushoku', '身につけていたい力・技術', '後輩に教えられる技術'],
 ['shushoku', 'なっていたい自分の姿', '後輩に頼られる先輩'],
 ['shingaku', '目指していること', 'まちづくりに関わる仕事'],
 ['shingaku', 'なっていたい自分の姿', '地域を支える一人']].forEach(([c, k, w]) => {
  const d = { course: c, afterGradKind: k, afterGradWhat: w, afterGradWhen: c === 'shushoku' ? '5年後' : '卒業後', whyChain: {} };
  const t = C.generate(d, 'prep').text.match(/(5年後|卒業後)[^。]*。/);
  console.log('  ' + k + '：' + (t ? t[0] : '（なし）'));
});
