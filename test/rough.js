// 「どんな入力でも自然になるか」を確かめる。
// 名詞で答えてほしい欄に、わざと述語・丁寧語・体言止めを混ぜて生成する。
const fs = require('fs'), vm = require('vm');
const base = '/home/user/siboudouki/';
const s = { window: {}, console }; s.window.window = s.window; vm.createContext(s);
['assets/js/questions.js', 'assets/js/compose.js', 'assets/js/checklist.js']
  .forEach(f => vm.runInContext(fs.readFileSync(base + f, 'utf8'), s, { filename: f }));
const W = s.window;

// 語尾がおかしくなりやすいパターンを、欄ごとに3種類ずつ用意する
const CASES = {
  効いた欄: {},
  述語: {
    course: 'shingaku', targetName: '〇〇大学', targetSub: '経済学部', targetChars: 600,
    orgType: '大学・短期大学', effortActionKind: '自分がやった行動',
    featureNamed: '決まった名前がある', afterGradKind: 'なっていたい自分の姿',
    efforts: ['毎日走った'], effortWhen: '1年生から3年間', effortRole: '',
    effortAction: '練習メニューを毎日考えた',
    effortResult: '県大会に出場した',
    effortLearned: '続けることが力になる',
    licenses: '英検2級を持っている',
    personality: [], strengths: ['人と話すのが好き'],
    futureKind: 'なりたい職業がある', futureDream: '人を助けたい',
    futureWhySource: '自分の体験から', futureWhyWhat: '祖母が入院した',
    gapNow: 'うまく話せない',
    knewBy: 'その他', visited: ['体験授業'],
    attractCards: [{ where: '体験授業', weight: 3, feel: ['わくわくした'],
      what: '学生同士が話し合っていました', link: '課題研究' }],
    attractPoints: ['学べる内容・カリキュラム'],
    featureKind: '授業', featureName: '地域経済論',
    featureDetail: '自治体と組んで調査する',
    studyWant: '地域経済論', targetPolicy: '自ら学び、自ら考える',
    wantObject: '人の役に立つ', wantVerb: '身につけたい',
    whyChain: { why1: '楽しかったから', why2: '任されたから', why3: '自分で考えて動けると力が出る' },
    mustPoint: '提言まで行っている',
    afterEnter: ['専門分野の勉強'], afterAction: '先輩に質問する',
    afterGradWhen: '卒業後', afterGradWhat: '地域に関わる仕事がしたい'
  },
  丁寧語: {
    course: 'shushoku', targetName: '株式会社〇〇', targetSub: '製造職', targetChars: 600,
    orgType: '役所・公的機関（公務員）', effortActionKind: '自分が作ったもの・仕組み',
    featureNamed: '名前はなく、特徴を書いた', afterGradKind: 'なっていたい自分の姿',
    efforts: ['アルバイト'], effortWhen: '2年生からの2年間', effortRole: 'リーダー',
    effortAction: '毎日メモを取りました',
    effortResult: 'ミスが減りました',
    effortLearned: '手順を守ることが大切です',
    licenses: '危険物取扱者乙種4類',
    personality: ['責任感が強い'], strengths: [],
    gapNow: '自分から動けません',
    knewBy: '職場見学', visited: ['職場見学', 'まだ行っていない'],
    attractCards: [{ where: '職場見学', weight: 3, feel: ['おどろいた', '見習いたい'],
      what: '社員の方が声をかけ合っていました', link: 'アルバイトでも同じでした' }],
    attractPoints: ['仕事の内容'],
    featureKind: '技術', featureName: '精密加工',
    featureDetail: '検査まで自社で行っています',
    jobTask: '部品を加工します', targetPolicy: '安全第一',
    wantObject: '正確に作業したい', wantVerb: '取り組みたい',
    whyChain: { why1: '好きだからです', why2: '', why3: 'ものづくりが好きです' },
    mustPoint: '検査まで自社でやっています',
    afterEnter: ['仕事を早く覚えること'], afterAction: '先輩に聞きます',
    contributionFrom: 'アルバイト', contribution: '最後までやり切る',
    afterGradWhen: '5年後', afterGradWhat: '後輩に教えられる'
  },
  最小: {
    course: 'shingaku', targetChars: 300, whyChain: {},
    attractCards: [{ where: '', weight: 2, feel: [], what: 'よかった', link: '' }]
  },
  体言止めだけ: {
    course: 'shushoku', targetName: '〇〇工業', targetChars: 400,
    orgType: '病院・医療機関', effortActionKind: '自分が作ったもの・仕組み',
    featureNamed: '名前はなく、特徴を書いた', afterGradKind: 'なっていたい自分の姿',
    efforts: ['部活動'], effortWhen: '1年生から3年間',
    effortAction: 'あいさつ', effortResult: '皆勤', effortLearned: '手伝い',
    licenses: '', personality: [], strengths: [],
    knewBy: '求人票', visited: ['まだ行っていない'],
    attractCards: [{ where: '求人票', weight: 2, feel: ['安心した'], what: '休日の多さ', link: '' }],
    attractPoints: ['職場の雰囲気'],
    featureKind: '製品', featureName: '〇〇部品', featureDetail: '一貫生産',
    jobTask: '加工', targetPolicy: '安全第一',
    wantObject: 'ものづくり', wantVerb: '取り組みたい',
    whyChain: { why1: '好き', why3: 'ものづくり' },
    mustPoint: '一貫生産', afterEnter: ['資格の取得'], afterAction: '質問',
    contributionFrom: '部活動', contribution: '体力',
    afterGradWhen: '5年後', afterGradWhat: '技術'
  }
};
delete CASES.効いた欄;

// 2択の「もう一方」を選んだときの組み合わせも回す
CASES['選択の反対側'] = Object.assign({}, CASES.述語, {
  course: 'shingaku', targetName: '△△専門学校', targetSub: '情報処理科',
  orgType: '専門学校', effortActionKind: '自分が作ったもの・仕組み',
  effortAction: '練習メニュー表',
  featureNamed: '名前はなく、特徴を書いた', featureName: '少人数で進める',
  afterGradKind: '目指していること', afterGradWhat: '地元での就職',
  wantObject: '設計の技術', wantVerb: '身につけたい'
});
CASES['姿で締める'] = Object.assign({}, CASES.体言止めだけ, {
  orgType: '福祉施設・団体など', effortActionKind: '自分がやった行動',
  featureNamed: '決まった名前がある',
  afterGradKind: 'なっていたい自分の姿', afterGradWhat: '後輩に頼られる先輩'
});

// 非文になりやすい形を機械的に拾う
const NG = [
  [/[ぁ-んァ-ヶ一-龥]たいを/, 'たい＋を'],
  [/たいに(取り組|挑戦|関わ)/, 'たい＋に'],
  [/ましたを/, 'ました＋を'],
  [/ましたに/, 'ました＋に'],
  [/ましたと/, 'ました＋と'],
  [/ましたが、その中/, 'ました＋が'],
  [/ましたです/, 'ました＋です'],
  [/ますです/, 'ます＋です'],
  [/ですです/, 'です重複'],
  [/[るうくすつぬぶむ]です。/, '辞書形＋です'],
  [/[^こ]とです。/, 'と＋です'],
  [/たを/, 'た＋を'],
  [/たに取り組/, 'た＋に'],
  [/。。/, '句点重複'],
  [/、、/, '読点重複'],
  [/はの/, 'はの'],
  [/がの/, 'がの'],
  [/をを|にに|のの/, '助詞重複'],
  [/その他がきっかけ/, 'その他'],
  [/「」/, '空のかぎかっこ'],
  [/、[。]/, '読点＋句点'],
  [/^。|\n。/, '文頭の句点'],
  [/を身につけていたいです。?$/m, null],
  [/(?:する|した|ない|たい|れる|ある|いる|です|ます)になっていたい/, '述語＋になっていたい'],
  [/(?:する|した|ない|たい|れる|ある|いる|です|ます)を身につけ/, '述語＋を身につけ'],
  [/という(という|の)/, 'という重複'],
  [/[ぁ-んァ-ヶ一-龥]を作りましたこと/, '作りました＋こと'],
  [/「」|「[^」]{0,1}」/, '中身のないかぎかっこ'],
  [/貴(?:社|校|学|庁|院|施設)[^はにをのでとがもだへやか、。「]/, '敬称のあとの助詞なし']
].filter(function (r) { return r[1]; });

let bad = 0;
Object.keys(CASES).forEach(name => {
  W.COMPOSE.TEMPLATES.forEach(t => {
    ['です・ます調', 'だ・である調'].forEach(tone => {
      const d = Object.assign({}, CASES[name], { tone: tone });
      const r = W.COMPOSE.generate(d, t.id);
      const hits = NG.filter(n => n[0].test(r.text)).map(n => n[1]);
      const chk = W.CHECKLIST.run(r.text, d).filter(x => x.level === 'error');
      if (hits.length || chk.length) {
        bad++;
        console.log('\n■ ' + name + ' / ' + t.name + ' / ' + tone);
        if (hits.length) console.log('  非文パターン: ' + hits.join('、'));
        if (chk.length) console.log('  チェック: ' + chk.map(x => x.label).join('、'));
        console.log('  ' + r.text.replace(/\n\n/g, '\n  '));
      }
    });
  });
});
console.log(bad ? '\n=== ' + bad + '件 要確認 ===' : '\n=== 48通りすべて、非文パターンなし ===');
