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
    afterGradKind: 'なっていたい自分の姿',
    efforts: ['毎日走った'], effortWhen: '1年生から3年間', effortRole: '',
    effortAction: '練習メニューを毎日考えた',
    effortResult: '県大会に出場した',
    effortHard: '毎日続けること', effortHow: '記録を毎日つけること',
    effortLearned: '続けることが力になる', valueFound: '続けること', contributeTo: '地域の人',
    licenses: '英検2級を持っている',
    personality: [], strengths: ['人と話すのが好き'], strengthScene: '発表の資料づくり',
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
    afterEnter: ['専門分野の勉強'], afterAction: '先輩に質問する', dailyImage: 'ゼミで話し合っている場面',
    afterGradWhen: '卒業後', afterGradWhat: '地域に関わる仕事がしたい'
  },
  丁寧語: {
    course: 'shushoku', targetName: '株式会社〇〇', targetSub: '製造職', targetChars: 600,
    orgType: '役所・公的機関（公務員）', effortActionKind: '自分が作ったもの・仕組み',
    afterGradKind: 'なっていたい自分の姿',
    efforts: ['アルバイト'], effortWhen: '2年生からの2年間', effortRole: 'リーダー',
    effortAction: '毎日メモを取りました',
    effortResult: 'ミスが減りました',
    effortHard: '新しい人に伝わらないことです', effortHow: '一人ずつ見せました',
    effortLearned: '手順を守ることが大切です', valueFound: '手順を守ることです', contributeTo: '現場の人',
    licenses: '危険物取扱者乙種4類',
    personality: ['責任感が強い'], strengths: [], personalityScene: '締め切りが近いときに',
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
    afterEnter: ['仕事を早く覚えること'], afterAction: '先輩に聞きます', dailyImage: '先輩と作業している場面',
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
    afterGradKind: 'なっていたい自分の姿',
    efforts: ['部活動'], effortWhen: '1年生から3年間',
    effortAction: 'あいさつ', effortResult: '皆勤', effortHard: '早起き', effortHow: '目覚まし',
    effortLearned: '手伝い', valueFound: 'あいさつ', contributeTo: '職場',
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
  featureName: '少人数で進める',
  afterGradKind: '目指していること', afterGradWhat: '地元での就職',
  wantObject: '設計の技術', wantVerb: '身につけたい'
});
// 3つの活動を選び、2つ目・3つ目にも答えたとき（述語まじり）
// 魅力カード④「そこに心をひかれたのは、なぜですか」の書き方いろいろ
CASES['理由を〜から'] = Object.assign({}, CASES.述語, {
  targetChars: 1200,
  attractCards: [{ where: '体験授業', weight: 3, feel: ['わくわくした'],
    what: '学生同士が話し合っていました', link: '前に似たことがあったから' }]
});
CASES['理由を出来事で'] = Object.assign({}, CASES.体言止めだけ, {
  targetChars: 1200,
  attractCards: [{ where: '体験授業', weight: 3, feel: ['わくわくした'],
    what: '学生同士が話し合っていた', link: '課題研究で、人と話すほど考えが整理された' }]
});
CASES['理由を名詞で'] = Object.assign({}, CASES.丁寧語, {
  targetChars: 1200,
  attractCards: [{ where: '体験授業', weight: 3, feel: ['わくわくした'],
    what: '学生同士が話し合っていました', link: 'チームで動くことの大切さ' }]
});

// 「そこでできること・その特徴・魅力」に、魅力そのものを書いたとき
CASES['理由を〜から'] = Object.assign({}, CASES.述語, {
  targetChars: 1200, featureDetail: '若手でも挑戦できるから'
});
CASES['理由を点で'] = Object.assign({}, CASES.体言止めだけ, {
  targetChars: 1200, featureDetail: 'だれもが挑戦できる点'
});
CASES['理由を丁寧語で'] = Object.assign({}, CASES.丁寧語, {
  targetChars: 1200, featureDetail: '一人ひとりに合わせて教えてもらえます'
});

CASES['どれを名前で'] = Object.assign({}, CASES.述語, {
  targetChars: 1200,
  efforts: ['学校行事'], effortWhich: '文化祭'
});
CASES['どれを述語で'] = Object.assign({}, CASES.体言止めだけ, {
  targetChars: 1200,
  efforts: ['部活動'], effortWhich: '毎日走っていました'
});
CASES['どれを聞かない活動'] = Object.assign({}, CASES.述語, {
  targetChars: 1200,
  efforts: ['皆勤・無遅刻無欠席'], effortWhich: ''
});
CASES['どれをテーマで'] = Object.assign({}, CASES.丁寧語, {
  targetChars: 1200,
  efforts: ['課題研究・探究学習'], effortWhich: '地元商店街の活性化'
});

// 「活かせる場面」を、述語・体言止め・助詞つきなど、ばらばらの形で書いたとき
CASES['場面の書き方いろいろ'] = Object.assign({}, CASES.述語, {
  targetChars: 1200,
  personality: ['責任感が強い'], personalityScene: '後輩に手順を教えること',
  personalityEpisode: '任された係を3年間続けました',
  strengths: ['人と話すのが好き'], strengthScene: '意見が分かれたときに',
  strengthEpisode: '毎日の声かけ'
});
CASES['場面が体言止め'] = Object.assign({}, CASES.述語, {
  targetChars: 1200,
  personality: ['まじめ'], personalityScene: '品出し', personalityEpisode: '毎日の片づけ',
  strengths: ['調べること'], strengthScene: '安全確認', strengthEpisode: '図書室に通った'
});
CASES['場面が丁寧語'] = Object.assign({}, CASES.述語, {
  targetChars: 1200,
  personality: ['明るい'], personalityScene: 'お客様に声をかけます',
  personalityEpisode: '毎朝いちばんに教室を開けています',
  strengths: ['あいさつ'], strengthScene: '朝の準備をします', strengthEpisode: '毎日玄関に立ちました'
});
CASES['姿で締める'] = Object.assign({}, CASES.体言止めだけ, {
  orgType: '福祉施設・団体など', effortActionKind: '自分がやった行動',
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
  [/というという/, 'という重複'],
  [/[ぁ-んァ-ヶ一-龥]を作りましたこと/, '作りました＋こと'],
  [/「」|「[^」]{0,1}」/, '中身のないかぎかっこ'],
  [/貴(?:社|校|学|庁|院|施設)[^はにをのでとがもだへやか、。「]/, '敬称のあとの助詞なし'],
  [/(?:する|した|ない|たい|れる|ある|いる|です|ます|ました)の場面/, '述語＋の場面'],
  [/(?:ことの場面|ときの場面|場面の場面|場面場面|でで|にに)/, '場面のつなぎ重複'],
  [/点こそ[^。]*点です。/, '「点」の重複'],
  [/魅力[^。]*魅力/, '「魅力」の重複'],
  [/知りました[^。]*知りました/, '「知りました」の重複'],
  [/強みで、[^。]*強み/, '強みの重複'],
  [/そう感じたのは、[^。]*(からからです|があるからからです)/, '理由の受け方の重複'],
  [/(?:です|ます|ました)からです。/, '丁寧語＋からです'],
  [/(?:ました|ます|です)(?:では|に取り組み|にも)/, '丁寧語のあとに助詞'],
  [/では[^。]*では[^。]*では/, '「では」が3つ']
].filter(function (r) { return r[1]; });

let bad = 0;
let runs = 0;
Object.keys(CASES).forEach(name => {
  W.COMPOSE.TEMPLATES.forEach(t => {
    ['です・ます調', 'だ・である調'].forEach(tone => {
      const d = Object.assign({}, CASES[name], { tone: tone });
      const r = W.COMPOSE.generate(d, t.id);
      runs++;
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
console.log('\n=== ' + runs + '通り × 非文パターン' + NG.length + '種 → ' +
  (bad ? bad + '件 要確認' : '指摘なし') + ' ===');
