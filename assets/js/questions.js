/**
 * 設問定義（アプリの唯一の情報源）
 *
 * 設計の原則
 *   生徒に答えてもらうのは「単語」か「名詞のかたまり」だけにする。
 *   動詞・助詞・語尾はすべてアプリ側が組み立てる。
 *   こうしないと、生徒が書いた文の語尾と枠が合わず
 *   「看護師になりたいを目指しています」のような非文が生まれる。
 *
 *   選択肢で決められるものは、すべて選択肢にする。
 *   選択肢には、その語を文に組み込むための「型」を持たせている。
 *
 * 進路（進学／就職）によって聞くことが変わるため、
 * buildSteps(mode) がモードに応じた設問セットを組み立てて返す。
 */
(function (global) {
  'use strict';

  /** 進路の選択肢 */
  const COURSES = [
    {
      id: 'shingaku',
      icon: '🎓',
      name: '進学',
      sub: '大学・短大・専門学校 など',
      desc: '志望理由書・自己推薦書を作ります。「そこで何を学びたいか」を軸に組み立てます。',
      targetLabel: '志望校',
      docName: '志望理由書'
    },
    {
      id: 'shushoku',
      icon: '💼',
      name: '就職',
      sub: '企業・公務員 など',
      desc: '応募書類・面接用の志望動機を作ります。「そこでどう働きたいか」を軸に組み立てます。',
      targetLabel: '志望する会社',
      docName: '志望動機'
    }
  ];

  function courseOf(mode) {
    return COURSES.find(function (c) { return c.id === mode; }) || COURSES[0];
  }

  function job(mode) { return mode === 'shushoku'; }

  // ══════════════════════════════════════════════════════
  //  選択肢と、その「文への組み込み方」
  //  {X} の部分に、生徒が書いた単語が入る。
  // ══════════════════════════════════════════════════════

  /** 魅力カード：どこで感じたか */
  const WHERE_SHINGAKU = [
    { label: 'オープンキャンパス', lead: 'オープンキャンパスに参加したとき、' },
    { label: '体験授業', lead: '体験授業を受けたとき、' },
    { label: '学校見学', lead: '学校を見学したとき、' },
    { label: '個別相談', lead: '個別相談で話を聞いたとき、' },
    { label: '学園祭', lead: '学園祭を見に行ったとき、' },
    { label: '在校生・卒業生の話', lead: '在校生の方から話を聞いたとき、' },
    { label: '先生の話', lead: '先生から話を聞いたとき、' },
    { label: '学校案内・パンフレット', lead: '学校案内を読んだとき、' },
    { label: '学校のホームページ', lead: '学校のホームページを見たとき、' },
    { label: '進学ガイダンス', lead: '進学ガイダンスで話を聞いたとき、' }
  ];

  const WHERE_SHUSHOKU = [
    { label: '職場見学', lead: '職場見学に行ったとき、' },
    { label: '会社説明会', lead: '会社説明会に参加したとき、' },
    { label: 'インターンシップ', lead: 'インターンシップに参加したとき、' },
    { label: '先輩社員の話', lead: '先輩社員の方から話を聞いたとき、' },
    { label: '先生の話', lead: '先生から話を聞いたとき、' },
    { label: '求人票', lead: '求人票を読んだとき、' },
    { label: '会社のホームページ', lead: '会社のホームページを見たとき、' },
    { label: '会社案内・パンフレット', lead: '会社案内を読んだとき、' },
    { label: '製品を実際に見て', lead: '実際に製品を見たとき、' }
  ];

  /**
   * 魅力カード：そのときの気持ち
   *  te  … 文の途中でつなぐ形（「わくわくし、〜」）
   *  end … 文を締める形（「〜わくわくしました。」）
   */
  const FEELINGS = [
    { label: 'わくわくした', te: 'わくわくし', end: 'わくわくしました' },
    { label: 'おどろいた', te: 'おどろき', end: 'おどろきました' },
    { label: '自分もやってみたい', te: '自分もやってみたいと思い', end: '自分もやってみたいと思いました' },
    { label: '見習いたい', te: '自分も見習いたいと思い', end: '自分も見習いたいと思いました' },
    { label: '安心した', te: '安心し', end: '安心しました' },
    { label: '想像とちがった', te: '思っていたものとのちがいにおどろき', end: '思っていたものとちがい、見方が変わりました' },
    { label: '自分に合うと感じた', te: '自分に合っていると感じ', end: '自分に合っていると感じました' },
    { label: 'あこがれた', te: 'あこがれを持ち', end: 'あこがれを持ちました' },
    { label: '刺激を受けた', te: '強い刺激を受け', end: '強い刺激を受けました' },
    { label: '責任の重さを感じた', te: '責任の重さを感じ', end: '責任の重さを感じました' },
    { label: '楽しそうだと思った', te: '楽しそうだと感じ', end: '楽しそうだと感じました' },
    { label: '真剣さが伝わった', te: '真剣さが伝わり', end: '真剣さが伝わってきました' }
  ];

  /** がんばったこと：いつのことか（そのまま「私は◯◯、〜」に入る） */
  const EFFORT_WHEN = ['1年生のとき', '2年生のとき', '3年生のとき',
    '1年生から3年間', '2年生からの2年間', '入学してからずっと'];

  /** 将来の目標：答えの種類によって、文の作り方を変える */
  const FUTURE_KIND = [
    { label: 'なりたい職業がある', frame: '私は将来、{X}になりたいと考えています。' },
    { label: '興味のある分野がある', frame: '私は将来、{X}の分野に進みたいと考えています。' },
    { label: 'やってみたい仕事がある', frame: '私は将来、{X}に関わる仕事に就きたいと考えています。' },
    { label: 'まだ決まっていない', frame: '将来の進路はまだはっきり決めていませんが、{X}に強い関心があります。' }
  ];

  /** 将来の目標のきっかけ：どこで出会ったか */
  const WHY_SOURCE = [
    { label: '身近な人の姿を見て', frame: '{X}を見たことがきっかけです。' },
    { label: '家族から聞いて', frame: '家族から聞いた{X}の話がきっかけです。' },
    { label: '授業・実習で', frame: '授業で取り組んだ{X}がきっかけです。' },
    { label: '部活動で', frame: '部活動での{X}がきっかけです。' },
    { label: 'アルバイトで', frame: 'アルバイト先での{X}がきっかけです。' },
    { label: '本・ニュースで', frame: '{X}について知ったことがきっかけです。' },
    { label: '自分の体験から', frame: '自分が経験した{X}がきっかけです。' },
    { label: '見学・説明会で', frame: '見学先で目にした{X}がきっかけです。' }
  ];

  /** 志望先の特色：それが何の種類か（「◯◯大学の授業「△△」」の◯◯の部分） */
  const FEATURE_KIND_SHINGAKU = ['授業', '演習', 'ゼミ', '実習', 'コース', 'プログラム', '資格取得の支援', '留学制度', '行事'];
  const FEATURE_KIND_SHUSHOKU = ['製品', '技術', 'サービス', '設備', '研修制度', '取り組み', '事業'];

  /** 志望理由のひとこと：語尾（{X} に生徒が書いた名詞が入る） */
  const WANT_VERB_SHINGAKU = [
    { label: '学びたい', frame: '{X}について学びたい' },
    { label: '身につけたい', frame: '{X}を身につけたい' },
    { label: '理解を深めたい', frame: '{X}への理解を深めたい' },
    { label: '研究したい', frame: '{X}について研究したい' },
    { label: '挑戦したい', frame: '{X}に挑戦したい' },
    { label: '役に立ちたい', frame: '{X}の役に立ちたい' }
  ];

  const WANT_VERB_SHUSHOKU = [
    { label: '取り組みたい', frame: '{X}に取り組みたい' },
    { label: '技術を身につけたい', frame: '{X}の技術を身につけたい' },
    { label: '作りたい', frame: '{X}を作りたい' },
    { label: '支えたい', frame: '{X}を支えたい' },
    { label: '役に立ちたい', frame: '{X}の役に立ちたい' },
    { label: '挑戦したい', frame: '{X}に挑戦したい' }
  ];

  /** 活かせる力を、どこで身につけたか（就職） */
  const CONTRIB_FROM = ['アルバイト', '部活動', '実習', '委員会活動', '学校行事', '資格の勉強', '日々の授業', '家での手伝い'];

  /** 卒業後・将来像を、いつの話として書くか */
  const AFTER_WHEN_SHINGAKU = ['卒業後', '在学中', '将来'];
  const AFTER_WHEN_SHUSHOKU = ['3年後', '5年後', '10年後'];

  // ── 選択肢を文に組み込むための小道具 ────────────────────
  function whereList(mode) {
    return job(mode) ? WHERE_SHUSHOKU : WHERE_SHINGAKU;
  }

  function wantVerbList(mode) {
    return job(mode) ? WANT_VERB_SHUSHOKU : WANT_VERB_SHINGAKU;
  }

  /** {X} に単語を入れて文の断片を作る */
  function fill(frame, word) {
    return String(frame || '').replace('{X}', String(word || '').trim());
  }

  /** 選んだ場面から、文の書き出しを取り出す（自由入力ならそのまま使う） */
  function whereLead(label, mode) {
    const hit = whereList(mode).find(function (w) { return w.label === label; });
    if (hit) return hit.lead;
    return label ? label + 'のとき、' : '';
  }

  /** 選んだ感情を1つの述語にまとめる（最大2つまで） */
  function feelPhrase(labels) {
    const picked = (labels || [])
      .map(function (l) { return FEELINGS.find(function (f) { return f.label === l; }); })
      .filter(Boolean)
      .slice(0, 2);
    if (!picked.length) return '';
    if (picked.length === 1) return picked[0].end;
    return picked[0].te + '、' + picked[1].end;
  }

  /** 「なりたい職業がある」＋「看護師」→「私は将来、看護師になりたいと考えています。」 */
  function futureSentence(kind, word) {
    if (!String(word || '').trim()) return '';
    const hit = FUTURE_KIND.find(function (k) { return k.label === kind; }) || FUTURE_KIND[2];
    return fill(hit.frame, word);
  }

  /** 「授業・実習で」＋「福祉体験」→「授業で取り組んだ福祉体験がきっかけです。」 */
  function whySourceSentence(source, word) {
    if (!String(word || '').trim()) return '';
    const hit = WHY_SOURCE.find(function (s) { return s.label === source; });
    if (!hit) return String(word).trim() + 'がきっかけです。';
    return fill(hit.frame, word);
  }

  /** 「身につけたい」＋「地域の課題を調べる力」→「地域の課題を調べる力を身につけたい」 */
  function wantPhrase(verbLabel, word, mode) {
    const w = String(word || '').trim();
    if (!w) return '';
    const list = wantVerbList(mode);
    const hit = list.find(function (v) { return v.label === verbLabel; }) || list[0];
    return fill(hit.frame, w);
  }


  // ══════════════════════════════════════════════════════
  //  文章構成をえらぶための3つの質問
  //  ここで型が決まると、次のステップで聞く質問が変わる。
  // ══════════════════════════════════════════════════════
  const PICKER = [
    {
      id: 'pickTarget',
      q: function (isJob) {
        return isJob ? 'その会社について、いちばん語れることは？' : 'その学校について、いちばん語れることは？';
      },
      options: [
        {
          label: function (isJob) { return isJob ? '職場見学や説明会で、心が動いた場面がある' : '見学や体験授業で、心が動いた場面がある'; },
          note: 'その場面から書き出すと、あなたにしか書けない文章になります',
          vote: { scene: 2 }
        },
        {
          label: function (isJob) { return isJob ? 'やりたい仕事の中身が、はっきりしている' : '学びたい内容が、はっきりしている'; },
          note: '結論から言い切る書き方が向いています',
          vote: { prep: 2 }
        },
        {
          label: function () { return '名前や条件は知っているが、まだ言葉にできていない'; },
          note: '順番に質問に答えていけば形になります',
          vote: { prep: 1 }
        }
      ]
    },
    {
      id: 'pickSelf',
      q: function () { return '自分について、いちばん語れることは？'; },
      options: [
        {
          label: function () { return '高校で打ち込んだ活動がある'; },
          note: 'その体験から語り始める書き方が向いています',
          vote: { story: 2 }
        },
        {
          label: function () { return '将来やりたいことが、はっきりしている'; },
          note: '将来から逆算する書き方が向いています',
          vote: { future: 2 }
        },
        {
          label: function () { return '今の自分に足りないものを感じている'; },
          note: '背伸びせずに意欲を示せる書き方が向いています',
          vote: { gap: 2 }
        },
        {
          label: function () { return 'まだ整理できていない'; },
          note: '質問に答えるうちに見つかります',
          vote: { prep: 1 }
        }
      ]
    },
    {
      id: 'pickLength',
      q: function () { return 'どのくらいの長さで書きますか？'; },
      options: [
        { label: function () { return '300字くらいまで'; }, note: '履歴書の志望動機欄', vote: { prep: 1 }, chars: 300 },
        { label: function () { return '400〜600字'; }, note: '志望理由書・エントリーシート', vote: {}, chars: 500 },
        { label: function () { return '600字以上'; }, note: 'じっくり書く。面接でも話せる形に', vote: { three: 2 }, chars: 700 }
      ]
    }
  ];

  /** 同点のときに優先する順（前ほど強い） */
  const TIE_BREAK = ['scene', 'story', 'future', 'gap', 'three', 'prep'];

  /**
   * 3つの答えから構成を決める。
   * 票が同じときは TIE_BREAK の順で決める。
   * @returns {{id:string, reason:string}}
   */
  function decide(picks) {
    const score = {};
    const reasons = [];

    PICKER.forEach(function (q) {
      const chosen = (picks || {})[q.id];
      const opt = q.options.find(function (o, i) { return String(i) === String(chosen); });
      if (!opt) return;
      Object.keys(opt.vote).forEach(function (k) { score[k] = (score[k] || 0) + opt.vote[k]; });
      if (Object.keys(opt.vote).length) reasons.push(opt.label(false));
    });

    let best = 'prep';
    let bestScore = -1;
    TIE_BREAK.forEach(function (id) {
      const v = score[id] || 0;
      if (v > bestScore) { bestScore = v; best = id; }
    });

    return {
      id: best,
      reason: reasons.length
        ? '「' + reasons.join('」「') + '」と答えたので、この型を選びました。'
        : '迷ったときに、いちばん読みやすい型です。'
    };
  }

  /** 選んだ長さから目標字数を取り出す */
  function pickChars(picks) {
    const q = PICKER[2];
    const opt = q.options.find(function (o, i) { return String(i) === String((picks || {})[q.id]); });
    return opt ? opt.chars : 0;
  }

  // ══════════════════════════════════════════════════════
  //  設問
  //  only を持つ設問は、その構成を選んだときだけ出す。
  // ══════════════════════════════════════════════════════
  function buildSteps(mode, template) {
    const isJob = job(mode);
    const tpl = template || 'prep';

    function usable(f) {
      if (!f) return false;
      return !f.only || f.only.indexOf(tpl) !== -1;
    }

    return [
      // ───────────────────────────── STEP 1
      {
        id: 'basic',
        no: 1,
        title: '基本情報',
        lead: isJob
          ? 'まずは、どの会社に向けた志望動機かをはっきりさせよう。'
          : 'まずは、どの学校に向けた志望理由書かをはっきりさせよう。',
        fields: [
          {
            id: 'studentName', type: 'text', label: '名前', required: true,
            placeholder: '例）山田 太郎',
            hint: '先生が誰の下書きか分かるように書きます。'
          },
          {
            id: 'highSchool', type: 'text', label: '在籍している高校名',
            placeholder: '例）〇〇県立△△高等学校'
          },
          {
            id: 'className', type: 'text', label: 'クラス・出席番号',
            placeholder: '例）3年2組 15番'
          },
          {
            id: 'targetName', type: 'text', required: true,
            label: isJob ? '志望する会社名' : '志望校名',
            placeholder: isJob ? '例）株式会社〇〇製作所' : '例）〇〇大学 / △△専門学校',
            hint: isJob
              ? '正式名称で書きます。「株式会社」を前につけるか後ろにつけるかも求人票どおりに。'
              : '正式名称で書きます。「〇〇大学」「学校法人△△ □□専門学校」など。'
          },
          {
            id: 'targetSub', type: 'text',
            label: isJob ? '希望する職種' : '学部・学科・コース',
            placeholder: isJob ? '例）製造職 / 総合職 / 事務職'
              : '例）経済学部 経済学科 / 情報処理科 / 看護学科'
          },
          {
            id: 'examType', type: 'select',
            label: isJob ? '応募の方法' : '入試の方式',
            options: isJob
              ? ['学校斡旋（求人票）', '自己開拓', '公務員試験', '縁故', 'その他・未定']
              : ['総合型選抜（AO）', '学校推薦型選抜（公募）', '指定校推薦', '一般選抜', 'その他・未定'],
            hint: isJob
              ? '学校斡旋の場合は、学校の名前を背負って応募することを意識して書きます。'
              : '推薦なら、その学校の「求める学生像」に寄せると効果的です。'
          },
          {
            id: 'targetChars', type: 'number', label: '目標の文字数', required: true,
            default: isJob ? 300 : 500, min: 100, max: 2000, step: 50,
            hint: isJob
              ? '履歴書の志望動機欄なら200〜300字、エントリーシートなら400字前後が目安です。'
              : '募集要項に指定があればその数字を。指定がなければ500〜800字が目安です。'
          },
          {
            id: 'tone', type: 'select', label: '文体',
            options: ['です・ます調', 'だ・である調'],
            default: 'です・ます調',
            hint: isJob
              ? '応募書類は「です・ます調」が基本です。途中で混ぜないこと。'
              : '志望理由書は「です・ます調」が一般的ですが、指定があればそれに従います。'
          }
        ]
      },

      // ───────────────────────────── STEP 2
      {
        id: 'self',
        no: 2,
        title: '自分を知る',
        lead: '答えるのは単語だけで大丈夫です。文にするのはアプリの仕事なので、文末は気にせず書いてください。',
        fields: [
          {
            id: 'efforts', type: 'chips', label: '高校生活でがんばったこと', required: true,
            options: ['部活動', '生徒会', '委員会', 'クラス役員', '学校行事', '課題研究・探究学習',
              '資格・検定の取得', '実習・実験', '勉強・定期考査', 'アルバイト', 'ボランティア',
              '皆勤・無遅刻無欠席', '地域の活動'],
            allowFree: true,
            hint: '当てはまるものを押します。いちばん上に押したものが文章の中心になります。'
          },
          {
            id: 'effortWhen', type: 'select', label: 'それは、いつのことですか', required: true,
            options: EFFORT_WHEN,
            default: '1年生から3年間',
            hint: '「私は◯◯、〜に力を入れてきました。」という文になります。'
          },
          {
            id: 'effortRole', type: 'text', label: '役割があれば、その名前だけ',
            placeholder: '例）副キャプテン',
            hint: '単語だけで大丈夫です。なければ空のままで構いません。'
          },
          {
            id: 'effortAction', type: 'text', label: '具体的に取り組んだこと', required: true,
            placeholder: '例）練習メニューの見直し',
            hint: '「〜すること」ではなく「◯◯の△△」という形の短い言葉で。数を入れると強くなります（例：週3回の朝練習）。'
          },
          {
            id: 'effortResult', type: 'text', label: 'その結果どうなったか',
            only: ['prep', 'story', 'gap', 'three'],
            placeholder: '例）県大会ベスト8',
            hint: '数字や順位が入ると説得力が出ます。単語で構いません。'
          },
          {
            id: 'effortLearned', type: 'text', label: 'そこから学んだこと', required: true,
            placeholder: '例）役割を分けることの大切さ',
            hint: '「この経験から、◯◯を学びました。」という文になります。「〜の大切さ」「〜する力」のような形が入れやすいです。'
          },
          {
            id: 'strengths', type: 'chips',
            label: isJob ? '仕事で活かせそうな得意なこと' : '得意な教科・好きなこと',
            options: isJob
              ? ['体力がある', '手先が器用', '正確に作業できる', 'コツコツ続けられる', '人と話すこと',
                'パソコン操作', '計算', 'ものづくり', '整理整頓', '早起き・時間を守る', '力仕事', '接客']
              : ['国語', '数学', '英語', '理科', '地歴・公民', '情報', '商業', '工業', '家庭', '保健体育',
                'プログラミング', 'ものづくり', '調べること', '発表すること'],
            allowFree: true
          },
          {
            id: 'licenses', type: 'text',
            label: isJob ? '持っている資格・免許' : '持っている資格・検定',
            placeholder: isJob ? '例）危険物取扱者乙種4類' : '例）実用英語技能検定2級',
            hint: '名前だけで大丈夫です。複数あるときは「、」で区切ってください。'
          },
          {
            id: 'personality', type: 'chips', label: '自分の性格（人から言われることでもOK）',
            options: ['まじめ', 'こつこつ続けられる', '責任感が強い', '好奇心が強い', '人の話をよく聞く',
              'まわりを見て動ける', 'リーダーシップがある', '前向き', '落ち着いている', '明るい'],
            allowFree: true
          },
          {
            id: 'futureKind', type: 'select', label: '将来について、今いえるのはどれですか', required: true,
            only: ['future'],
            options: FUTURE_KIND.map(function (k) { return k.label; }),
            default: '興味のある分野がある',
            hint: '選んだ内容に合わせて、次の欄の言葉が文章に組み込まれます。'
          },
          {
            id: 'futureDream', type: 'text', label: 'その職業名・分野名', required: true,
            only: ['future'],
            placeholder: isJob ? '例）ものづくり' : '例）看護師 / 情報 / 地域づくり',
            hint: '単語だけで大丈夫です。「〜になりたい」までは書かなくて構いません。'
          },
          {
            id: 'futureWhySource', type: 'select', label: 'そう思ったきっかけは、どこにありましたか',
            only: ['future'],
            options: WHY_SOURCE.map(function (s) { return s.label; }),
            hint: '選ばなくても進めますが、選ぶと文章に厚みが出ます。'
          },
          {
            id: 'futureWhyWhat', type: 'text', label: 'そのとき見たこと・経験したこと',
            only: ['future'],
            placeholder: isJob ? '例）先輩が新人に教えている姿' : '例）祖母の入院',
            hint: '出来事を短い言葉で。上で選んだきっかけと組み合わせて文になります。'
          },
          {
            id: 'gapNow', type: 'text', label: '今の自分に足りないと感じている力', required: true,
            only: ['gap'],
            placeholder: isJob ? '例）自分から動く力' : '例）人に伝える力',
            hint: 'この構成の出発点になります。「◯◯する力」の形で書くと入れやすいです。'
          }
        ].filter(usable)
      },

      // ───────────────────────────── STEP 3
      {
        id: 'research',
        no: 3,
        title: isJob ? '会社を知る' : '学校を知る',
        lead: isJob
          ? 'その会社を「調べた証拠」を集めよう。ここが薄いと、どの会社にも出せる文章になってしまう。'
          : 'その学校を「調べた証拠」を集めよう。ここが薄いと、どの学校にも出せる文章になってしまう。',
        note: isJob
          ? '調べ方のヒント：求人票／会社のホームページ／会社説明会・職場見学／進路指導室の資料／その会社で働く先輩の話'
          : '調べ方のヒント：学校のホームページ／オープンキャンパス・体験授業／学校案内パンフレット／進学ガイダンス／在校生や卒業生の話',
        fields: [
          {
            id: 'knewBy', type: 'select',
            label: isJob ? 'その会社を知ったきっかけ' : 'その学校を知ったきっかけ',
            options: isJob
              ? ['学校に届いた求人票', '会社説明会', '職場見学', 'インターンシップ', '先生からの紹介',
                '先輩・家族から聞いた', '会社のホームページ', 'その他']
              : ['オープンキャンパス', '体験授業', '進学ガイダンス', '学校案内・ホームページ',
                '先生からの紹介', '先輩・家族から聞いた', 'その他']
          },
          {
            id: 'visited', type: 'chips',
            label: '実際に行った・体験したこと',
            options: isJob
              ? ['会社説明会', '職場見学', 'インターンシップ', '個別面談', '先輩訪問', 'まだ行っていない']
              : ['オープンキャンパス', '体験授業', '学校見学', '個別相談会', '学園祭', '進学説明会', 'まだ行っていない'],
            allowFree: true
          },
          {
            id: 'attractCards', type: 'cards', required: true,
            label: '魅力カード',
            max: 3,
            whereOptions: whereList(mode),
            feelOptions: FEELINGS.map(function (f) { return f.label; }),
            hint: 'あなたが「いいな」と思った瞬間を、1枚ずつカードにします。ここに書いたことが、そのまま本文の中心になります。まず1枚、できれば2〜3枚。',
            whatPlaceholder: isJob
              ? '例）社員の方が、作業を始める前に必ずおたがいに声をかけ合っていた'
              : '例）学生同士が、答えではなく考え方のほうを話し合っていた',
            linkPlaceholder: isJob
              ? '例）アルバイトで、声をかけ合うとミスが減った経験と重なります'
              : '例）課題研究で、人と話すほど自分の考えが整理された経験と重なります'
          },
          {
            id: 'attractPoints', type: 'chips', label: '魅力を感じた点（分類）', required: true,
            options: isJob
              ? ['仕事の内容', '会社の製品・サービス', '技術力', '地域への貢献', '研修・人材育成',
                '資格取得の支援', '職場の雰囲気', '会社の理念', '安定性', '働き方・休日', '若手の活躍']
              : ['学べる内容・カリキュラム', '取得できる資格', '実習・演習の多さ', '就職・進学実績',
                '設備・施設', '先生・教授の研究', '少人数教育', '留学・国際交流', '奨学金制度',
                '学校の雰囲気', '通学のしやすさ'],
            allowFree: true,
            hint: '2〜3個にしぼると、文章がぼやけません。'
          },
          {
            id: 'featureKind', type: 'select', required: true,
            label: isJob ? '関心を持ったのは、どの種類のものですか' : '関心を持ったのは、どの種類のものですか',
            options: isJob ? FEATURE_KIND_SHUSHOKU : FEATURE_KIND_SHINGAKU,
            default: isJob ? '技術' : '授業',
            hint: isJob
              ? '「株式会社◯◯の技術「△△」に強く関心を持ちました。」という文になります。'
              : '「◯◯大学の授業「△△」に強く関心を持ちました。」という文になります。'
          },
          {
            id: 'featureName', type: 'text', required: true,
            label: 'その名前（正確に）',
            placeholder: isJob ? '例）〇〇部品の精密加工' : '例）地域経済フィールドワーク',
            hint: 'ここに固有名詞が入るかどうかで、文章の説得力が決まります。パンフレットや求人票の表記どおりに。'
          },
          {
            id: 'featureDetail', type: 'text',
            only: ['prep', 'future', 'scene', 'three'],
            label: 'そこでできること・特徴',
            placeholder: isJob ? '例）検査から出荷までの一貫生産' : '例）自治体と組んだ課題調査',
            hint: '「〜すること」「〜の◯◯」のように、ものごとの名前で書いてください。'
              + '「そこでは◯◯に関わることができると知りました。」という文になります。'
          },
          isJob
            ? {
              id: 'jobTask', type: 'text', label: 'その仕事は、何をする仕事ですか',
              placeholder: '例）部品の加工と寸法の確認',
              hint: '「◯◯を行う仕事だと理解しています。」という文になります。仕事内容を正しく書けていると、面接でも強いです。'
            }
            : {
              id: 'studyWant', type: 'text', label: '特に受けたい授業・科目の名前',
              placeholder: '例）地域経済論',
              hint: 'シラバスや学校案内に載っている名前をそのまま。「特に「◯◯」を学びたいと考えています。」という文になります。'
            },
          {
            id: 'targetPolicy', type: 'text',
            only: ['prep', 'story', 'three'],
            label: isJob ? '共感した理念の言葉' : '共感した教育目標の言葉',
            placeholder: isJob ? '例）安全第一、品質第二' : '例）自ら学び、自ら考える',
            hint: 'ホームページに載っている言葉をそのまま。かぎかっこは自動でつきます。'
          }
        ].filter(usable)
      },

      // ───────────────────────────── STEP 4
      {
        id: 'connect',
        no: 4,
        title: 'つなげる',
        lead: isJob
          ? '「自分」と「会社」をつなぐ、いちばん大事なステップ。ここが志望動機の心臓部です。'
          : '「自分」と「学校」をつなぐ、いちばん大事なステップ。ここが志望理由の心臓部です。',
        fields: [
          {
            id: 'wantObject', type: 'text', label: 'そこで何を得たいですか', required: true,
            placeholder: isJob ? '例）正確さを求められるものづくり' : '例）地域の課題を調べる力',
            hint: '名詞で書いてください。次の欄で選ぶ言葉とつないで、志望理由の一文になります。'
          },
          {
            id: 'wantVerb', type: 'select', label: 'それを、どうしたいですか', required: true,
            options: wantVerbList(mode).map(function (v) { return v.label; }),
            default: wantVerbList(mode)[0].label,
            hint: '「私が◯◯を志望した理由は、△△を□□したいからです。」という文になります。'
          },
          {
            id: 'whyChain', type: 'whychain', label: 'なぜ？を3回くり返して深掘りしよう', required: true,
            source: 'wantObject',
            hint: '表面的な理由から、あなたにしか書けない本当の動機へ降りていきます。短い言葉で構いません。'
          },
          {
            id: 'mustPoint', type: 'text', required: true,
            label: isJob ? '他の会社にはない、この会社の違い' : '他の学校にはない、この学校の違い',
            placeholder: isJob ? '例）検査工程まで自社で行う体制' : '例）提言まで行う地域連携',
            hint: isJob
              ? '「同じような会社は他にもありますが、◯◯には△△という違いがあります。」という文になります。'
              : '「同じような学校は他にもありますが、◯◯には△△という違いがあります。」という文になります。'
          },
          {
            id: 'afterEnter', type: 'chips', required: true,
            label: isJob ? '入社したらがんばりたいこと' : '入学したらやりたいこと',
            options: isJob
              ? ['仕事を早く覚えること', '資格の取得', '専門技術の習得', 'チームでの仕事', '安全の徹底',
                '改善の提案', '後輩の指導', '幅広い工程の経験']
              : ['専門分野の勉強', '資格取得', '研究・ゼミ活動', '実習・インターンシップ', '留学・語学',
                'サークル・部活動', 'ボランティア活動', '学園祭などの行事'],
            allowFree: true,
            hint: '文章の中で「〜に取り組みたい」とつなげます。'
          },
          {
            id: 'afterAction', type: 'text', label: 'まず何から始めますか', required: true,
            placeholder: isJob ? '例）先輩への質問' : '例）地域の方への取材',
            hint: '短い言葉で。「まずは◯◯から始めたいです。」という文になります。'
          },
          isJob ? {
            id: 'contributionFrom', type: 'select', label: '仕事で活かせる力は、どこで身につけましたか',
            options: CONTRIB_FROM,
            default: 'アルバイト'
          } : null,
          isJob ? {
            id: 'contribution', type: 'text', label: 'その力の名前',
            placeholder: '例）手順を崩さずに作業を続ける力',
            hint: '「アルバイトで身につけた◯◯は、この仕事でも活かせると考えています。」という文になります。'
          } : null,
          {
            id: 'afterGradWhen', type: 'select',
            label: isJob ? 'いつの自分の話をしますか' : 'いつの話をしますか',
            options: isJob ? AFTER_WHEN_SHUSHOKU : AFTER_WHEN_SHINGAKU,
            default: isJob ? '5年後' : '卒業後'
          },
          {
            id: 'afterGradWhat', type: 'text',
            label: isJob ? 'そのとき身につけていたいもの' : 'そのとき目指していること',
            placeholder: isJob ? '例）後輩に教えられる技術' : '例）地域づくりに関わる仕事',
            hint: isJob
              ? '「5年後には、◯◯を身につけていたいです。」という文になります。'
              : '「卒業後は、◯◯を目指したいと考えています。」という文になります。'
          }
        ].filter(usable)
      }
    ];
  }

  /** チップ入力欄のうち、文章生成で「〜や〜」とつなぐ最大数 */
  const CHIP_JOIN_LIMIT = 3;

  global.QUESTIONS = {
    COURSES: COURSES,
    PICKER: PICKER,
    decide: decide,
    pickChars: pickChars,
    FEELINGS: FEELINGS,
    courseOf: courseOf,
    buildSteps: buildSteps,
    whereList: whereList,
    whereLead: whereLead,
    feelPhrase: feelPhrase,
    futureSentence: futureSentence,
    whySourceSentence: whySourceSentence,
    wantPhrase: wantPhrase,
    CHIP_JOIN_LIMIT: CHIP_JOIN_LIMIT
  };
})(window);
