// 実際に生徒が作った文章の再現。ここが直るまで直す。
const fs = require('fs'), vm = require('vm');
const s = { window: {}, console }; s.window.window = s.window; vm.createContext(s);
['questions.js', 'compose.js', 'checklist.js'].forEach(f =>
  vm.runInContext(fs.readFileSync('/home/user/siboudouki/assets/js/' + f, 'utf8'), s, { filename: f }));
const W = s.window;

const D = {
  course: 'shushoku', tone: 'です・ます調', targetChars: 500,
  studentName: '生徒A', targetName: '浦美術館', targetSub: '倉庫作業・配達',
  orgType: '会社（民間企業）', template: 'prep',
  efforts: ['学校行事'], effortWhen: '1年生から3年間',
  effortRole: 'クラスTシャツの作成係',
  effortAction: 'デザイン作成', effortActionKind: '自分が作ったもの・仕組み',
  effortHard: 'みんなの意見を反映させること', effortHow: '',
  effortLearned: 'みんなの意見をまとめることの難しさ',
  effortUse: 'チームで一つの製品を仕上げる作業',
  personality: [], strengths: [], licenses: '',
  knewBy: '職場見学', subReason: 'ものづくりに関わりたいから', attractCards: [{
    where: '職場見学', weight: 3, feel: ['自分も見習いたいと思った', '安心した'],
    what: '会社の人の雰囲気が良かった', link: '自分の落ち着いた雰囲気と合う'
  }],
  attractPoints: [],
  featureName: '倉庫作業の管理方法に魅力を感じた',
  featureKind: '仕事の進め方',
  featureDetail: '倉庫管理', featureSource: '',
  jobTask: '', targetPolicy: '',
  valueFound: '会社の雰囲気',
  wantObject: '倉庫管理の技術', wantVerb: '技術を身につけたい',
  whyChain: { why1: '成長できる', why2: '', why3: '成長できる' },
  mustPoint: '',
  afterEnter: ['先輩からの技術の習得'], afterAction: '',
  contributionFrom: '実習', contribution: '学校での培った整理整頓を活かして頑張りたい',
  afterGradWhen: '', afterGradKind: '', afterGradWhat: '', contributeTo: ''
};

const NG = [
  [/の技術の技術|の力の力|の知識の知識/, '名詞の重複'],
  [/作成を作りました|制作を作りました|作りを作りました|づくりを作りました/, '「作る」の重複'],
  [/に魅力を感じたという/, '感想を特色として受けている'],
  [/[^ま]する。|[^まし]た。$/m, null],
  [/活かして頑張りたい」という姿勢/, '「〜たい」を姿勢として受けている']
].filter(r => r[1]);

const r = W.COMPOSE.generate(D, 'prep');
console.log(r.chars + '字\n');
r.text.split('\n\n').forEach(p => console.log(p + '\n'));

console.log('── 見つかった問題 ──');
NG.forEach(n => { if (n[0].test(r.text)) console.log('  ✗ ' + n[1]); });
// 文体の混ざり
const plain = (r.text.match(/[^。\n]*[^すたん]。/g) || []).filter(x => !/です。|ます。|ました。|でした。|ません。/.test(x));
plain.forEach(x => console.log('  ✗ 常体が混ざる: ' + x.trim()));
console.log('  チェック: ' + (W.CHECKLIST.run(r.text, D).filter(x => x.level !== 'ok')
  .map(x => x.label + '=' + x.level).join(' | ') || 'なし'));
