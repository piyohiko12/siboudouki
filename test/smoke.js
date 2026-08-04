// 新しい設問（単語で答える方式）で、生成される文章を確認する
const fs = require('fs'), vm = require('vm');
const base = '/home/user/siboudouki/';
const s = { window: {}, console }; s.window.window = s.window; vm.createContext(s);
['assets/js/questions.js', 'assets/js/compose.js', 'assets/js/checklist.js']
  .forEach(f => vm.runInContext(fs.readFileSync(base + f, 'utf8'), s, { filename: f }));
const W = s.window;

['shingaku', 'shushoku'].forEach(m => {
  W.COMPOSE.TEMPLATES.forEach(t => {
    const st = W.QUESTIONS.buildSteps(m, t.id);
    const all = st.reduce((a, x) => a.concat(x.fields), []);
    const sel = all.filter(f => f.type === 'select' || f.type === 'chips').length;
    const txt = all.filter(f => f.type === 'text').length;
    const area = all.filter(f => f.type === 'textarea').length;
    console.log(m + ' / ' + t.name + ': 全' + all.length + '問  選択式' + sel + '  単語' + txt + '  記述' + area);
  });
});

// 型をえらぶ3問 → 判定
console.log('\n-- 型の判定 --');
[[0,0,1],[1,1,1],[2,3,0],[0,1,2],[1,2,1],[2,0,2]].forEach(a => {
  const picks = { pickTarget: a[0], pickSelf: a[1], pickLength: a[2] };
  const r = W.QUESTIONS.decide(picks);
  console.log(JSON.stringify(a) + ' → ' + r.id + ' / ' + W.QUESTIONS.pickChars(picks) + '字  ' + r.reason);
});

const common = {
  studentName: '山田太郎', highSchool: '〇〇県立△△高等学校', tone: 'です・ます調',
  whyChain: {
    why1: '文化祭の運営で自分たちで決めて動くのが楽しかった',
    why2: '任されたほうが責任を感じて力が出た',
    why3: '自分で考えて動ける環境'
  }
};

const shingaku = Object.assign({}, common, {
  course: 'shingaku', targetName: '〇〇大学', targetSub: '経済学部経済学科', targetChars: 500,
  orgType: '大学・短期大学', effortActionKind: '自分がやった行動',
  featureNamed: '決まった名前がある', afterGradKind: '目指していること',
  efforts: ['課題研究・探究学習', '生徒会'],
  effortWhen: '2年生からの2年間', effortRole: '班長',
  effortAction: '地元商店街での聞き取り調査',
  effortResult: '200人分のアンケート集計と校内発表',
  effortLearned: '数字にして伝えることの大切さ',
  strengths: ['地歴・公民', '調べること'], licenses: '実用英語技能検定2級',
  personality: ['こつこつ続けられる'],
  futureKind: '興味のある分野がある', futureDream: '地域づくり',
  futureWhySource: '自分の体験から', futureWhyWhat: '商店街の空き店舗の増加',
  gapNow: '人に伝える力',
  knewBy: 'オープンキャンパス', visited: ['オープンキャンパス', '体験授業'],
  attractCards: [
    { where: '体験授業', weight: 3, feel: ['わくわくした', '自分もやってみたい'],
      what: '学生同士が、答えではなく考え方のほうを話し合っていた',
      link: '課題研究で、人と話すほど自分の考えが整理された経験と重なります' },
    { where: '在校生・卒業生の話', weight: 2, feel: ['おどろいた'],
      what: '3年生の方が、自分の研究テーマを自分の言葉で説明してくれた', link: '' }
  ],
  attractPoints: ['学べる内容・カリキュラム', '実習・演習の多さ'],
  featureKind: '演習', featureName: '地域経済フィールドワーク',
  featureDetail: '自治体と組んだ課題調査',
  studyWant: '地域経済論', targetPolicy: '学びを地域に還す',
  wantObject: '地域の課題を調べる力', wantVerb: '身につけたい',
  mustPoint: '提言まで行う地域連携',
  afterEnter: ['専門分野の勉強', '実習・インターンシップ'],
  afterAction: '地域の方への取材',
  afterGradWhen: '卒業後', afterGradWhat: 'まちづくりに関わる仕事'
});

const shushoku = Object.assign({}, common, {
  course: 'shushoku', targetName: '株式会社〇〇製作所', targetSub: '製造職', targetChars: 300,
  orgType: '会社（民間企業）', effortActionKind: '自分がやった行動',
  featureNamed: '決まった名前がある', afterGradKind: '身につけていたい力・技術',
  efforts: ['アルバイト', '部活動'],
  effortWhen: '2年生からの2年間', effortRole: '',
  effortAction: '混雑する時間帯の動き方のメモ作り',
  effortResult: '新しく入った人への引き継ぎ',
  effortLearned: '手順を共有することの大切さ',
  strengths: ['正確に作業できる', 'コツコツ続けられる'], licenses: '危険物取扱者乙種4類',
  personality: ['責任感が強い'],
  futureKind: 'なりたい職業がある', futureDream: '後輩に教えられる技術者',
  futureWhySource: 'アルバイトで', futureWhyWhat: '先輩が新人に丁寧に教えている姿',
  gapNow: '自分から動く力',
  knewBy: '職場見学', visited: ['会社説明会', '職場見学'],
  attractCards: [
    { where: '職場見学', weight: 3, feel: ['おどろいた', '見習いたい'],
      what: '社員の方が、作業を始める前に必ずおたがいに声をかけ合っていた',
      link: 'アルバイトで、声をかけ合うとミスが減った経験と重なります' }
  ],
  attractPoints: ['仕事の内容', '技術力'],
  featureKind: '技術', featureName: '〇〇部品の精密加工',
  featureDetail: '検査から出荷までの一貫生産', jobTask: '部品の加工と寸法の確認',
  targetPolicy: '安全第一、品質第二',
  wantObject: '正確さを求められるものづくり', wantVerb: '取り組みたい',
  mustPoint: '検査工程まで自社で行う体制',
  afterEnter: ['仕事を早く覚えること', '資格の取得'],
  afterAction: '先輩への質問',
  contributionFrom: 'アルバイト', contribution: '手順を崩さずに作業を続ける力',
  afterGradWhen: '5年後', afterGradWhat: '後輩に教えられる技術'
});

[['進学', shingaku], ['就職', shushoku]].forEach(([label, data]) => {
  console.log('\n\n############ ' + label + 'モード ############');
  for (const t of W.COMPOSE.TEMPLATES) {
    const r = W.COMPOSE.generate(data, t.id);
    console.log('\n===== ' + t.name + ' (' + r.chars + '字 / 目標' + r.target + ') =====');
    console.log(r.text);
    const c = W.CHECKLIST.run(r.text, data);
    console.log('-- ' + c.filter(x => x.level !== 'ok').map(x => x.label + '=' + x.level).join(' | ') || '-- 指摘なし');
  }
  console.log('\n--- だ・である調 ---\n' + W.COMPOSE.generate(Object.assign({}, data, { tone: 'だ・である調' }), 'prep').text);
});

['shingaku', 'shushoku'].forEach(c => {
  const e = W.COMPOSE.generate({ course: c, whyChain: {} }, 'story');
  console.log('\n===== 空データ(' + c + ') ' + e.chars + '字 =====\n' + e.text);
});
