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

  // ══════════════════════════════════════════════════════
  //  述語で終わっているかの判定
  //
  //  生徒には名詞で答えてもらう設計だが、実際には
  //  「毎日練習した」「人の役に立つ」のように述語で書く人が必ずいる。
  //  そのままだと「毎日練習したに取り組みました」という非文になるので、
  //  述語かどうかを見分けて、別の枠で受けられるようにする。
  //
  //  1文字の語尾（る・つ・い…）だけで判定すると「手伝い」「あいさつ」まで
  //  動詞と見なしてしまうため、語尾のパターンを明示している。
  // ══════════════════════════════════════════════════════
  const PREDICATE_END = new RegExp([
    '(?:ました|ます|ません|でした|です|だった|である|だ)$',
    '(?:した|して|される|された|れた|られる|られた|できる|できた|しない)$',
    '(?:ない|たい|らしい|やすい|にくい|づらい|しい|よい|いい)$',
    '(?:ている|ていた|でいる|でいた|ておく|てくる|てきた|ていく|ていける)$',
    '(?:する|くる|なる|ある|いる|やる|いく|もらう|しまう)$',
    // 過去形（送りがな＋た／だ）
    '[一-龥ぁ-んァ-ヶー](?:った|んだ|いた|えた|きた|ちた|びた|みた|りた|げた|ねた|めた|べた|でた|せた|てた|れた|けた|ぜた)$',
    // 漢字＋送りがなの辞書形（考える・受け取る・話し合う など）
    '[一-龥][ぁ-ん]{0,2}(?:る|う|く|ぐ|す|つ|ぬ|ぶ|む)$'
  ].join('|'));

  /** 動詞・形容詞で終わっているか（名詞止めと区別する） */
  function isPredicate(text) {
    return PREDICATE_END.test(String(text || '').trim().replace(/[。．\s]+$/, ''));
  }

  /**
   * 丁寧語で書かれた言葉を、枠にはめる前に常体へそろえる。
   *
   * 「毎日メモを取りました」と書かれたまま枠に入れると
   * 「毎日メモを取りましたことに力を注ぎました」になってしまう。
   * 語尾はアプリ側がつけるので、受け取った言葉はいったん常体に戻す。
   * （活用表は compose.js が持っているので、実行時に借りる）
   */
  function plainWord(word) {
    const t = String(word || '').trim().replace(/[。．\s]+$/, '');
    if (!t) return '';
    const toPlain = global.COMPOSE && global.COMPOSE.toPlainTone;
    if (!toPlain) return t;
    // 文の途中に埋めるので、「である」より「だ」のほうがなじむ
    return toPlain(t).replace(/であるが$/, 'だが').replace(/である$/, 'だ');
  }

  /**
   * 名詞で答えてほしい欄の言葉を、文の枠にはめる。
   * 述語で書かれていたら、述語用の枠のほうを使う。
   * @param {String} word  生徒が書いた言葉
   * @param {String} noun  名詞のときの枠（{X} が置きかわる）
   * @param {String} pred  述語のときの枠。省略すると名詞用と同じ
   */
  function frame(word, noun, pred) {
    const t = plainWord(word);
    if (!t) return '';
    return String((isPredicate(t) && pred) ? pred : noun).replace('{X}', t);
  }

  /** 「〜たい」で終わっているか（意欲の言葉が二重にならないよう見分ける） */
  function isWish(word) {
    return /たい$/.test(plainWord(word));
  }

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
    { label: '実習室・施設の見学', lead: '実習室を見せてもらったとき、' },
    { label: '個別相談', lead: '個別相談で話を聞いたとき、' },
    { label: 'オンライン説明会', lead: 'オンライン説明会に参加したとき、' },
    { label: '学園祭', lead: '学園祭を見に行ったとき、' },
    { label: '部活動の見学', lead: '部活動を見学したとき、' },
    { label: '在校生・卒業生の話', lead: '在校生の方から話を聞いたとき、' },
    { label: '先生の話', lead: '先生から話を聞いたとき、' },
    { label: '学校案内・パンフレット', lead: '学校案内を読んだとき、' },
    { label: '学校のホームページ', lead: '学校のホームページを見たとき、' },
    { label: '学校の動画・SNS', lead: '学校が出している動画を見たとき、' },
    { label: '進学ガイダンス', lead: '進学ガイダンスで話を聞いたとき、' },
    { label: '入試説明会', lead: '入試説明会で話を聞いたとき、' }
  ];

  const WHERE_SHUSHOKU = [
    { label: '職場見学', lead: '職場見学に行ったとき、' },
    { label: '会社説明会', lead: '会社説明会に参加したとき、' },
    { label: 'オンライン説明会', lead: 'オンライン説明会に参加したとき、' },
    { label: 'インターンシップ', lead: 'インターンシップに参加したとき、' },
    { label: '職場体験', lead: '職場体験に行ったとき、' },
    { label: '個別の面談・相談', lead: '個別に話を聞いたとき、' },
    { label: '先輩社員の話', lead: '先輩社員の方から話を聞いたとき、' },
    { label: '同じ高校の先輩の話', lead: '同じ高校の先輩から話を聞いたとき、' },
    { label: '先生の話', lead: '先生から話を聞いたとき、' },
    { label: '求人票', lead: '求人票を読んだとき、' },
    { label: '会社のホームページ', lead: '会社のホームページを見たとき、' },
    { label: '会社案内・パンフレット', lead: '会社案内を読んだとき、' },
    { label: '会社の動画・SNS', lead: '会社が出している動画を見たとき、' },
    { label: '製品を実際に見て', lead: '実際に製品を見たとき、' },
    { label: '働いている人の様子', lead: '働いている方の様子を見たとき、' }
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
    { label: '真剣さが伝わった', te: 'その真剣さを感じ', end: 'その真剣さを感じました' },
    { label: 'もっと知りたくなった', te: 'もっと知りたいと思い', end: 'もっと知りたいと思いました' },
    { label: '自分にもできそうだと思った', te: '自分にもできそうだと感じ', end: '自分にもできそうだと感じました' },
    { label: '支え合っていると感じた', te: '支え合う空気を感じ', end: '支え合う空気を感じました' },
    { label: '自分の目標に近いと感じた', te: '自分の目標に近いと感じ', end: '自分の目標に近いと感じました' },
    { label: 'ていねいさにおどろいた', te: 'そのていねいさにおどろき', end: 'そのていねいさにおどろきました' },
    { label: '今の自分では足りないと思った', te: '今の自分では足りないと感じ', end: '今の自分では足りないと感じました' }
  ];

  /** がんばったこと：いつのことか（そのまま「私は◯◯、〜」に入る） */
  const EFFORT_WHEN = ['1年生のとき', '2年生のとき', '3年生のとき',
    '1・2年生の2年間', '2年生からの2年間', '1年生から3年間',
    '3年生になってから', '入学してからずっと'];

  /** 将来の目標：答えの種類によって、文の作り方を変える */
  const FUTURE_KIND = [
    {
      label: 'なりたい職業がある',
      frame: '私は将来、{X}になりたいと考えています。',
      pred: '私は将来、{X}と考えています。'
    },
    {
      label: '興味のある分野がある',
      frame: '私は将来、{X}の分野に進みたいと考えています。',
      pred: '私は将来、{X}という思いで進路を考えています。'
    },
    {
      label: 'やってみたい仕事がある',
      frame: '私は将来、{X}に関わる仕事に就きたいと考えています。',
      pred: '私は将来、{X}と思える仕事に就きたいと考えています。'
    },
    {
      label: 'まだ決まっていない',
      frame: '将来の進路はまだはっきり決めていませんが、{X}に強い関心があります。',
      pred: '将来の進路はまだはっきり決めていませんが、{X}という思いがあります。'
    }
  ];

  /** 将来の目標のきっかけ：どこで出会ったか */
  const WHY_SOURCE = [
    {
      label: '身近な人の姿を見て',
      frame: '{X}を見たことがきっかけです。', pred: '{X}姿を見たことがきっかけです。'
    },
    {
      label: '家族から聞いて',
      frame: '家族から聞いた{X}の話がきっかけです。', pred: '家族から{X}と聞いたことがきっかけです。'
    },
    {
      label: '授業・実習で',
      frame: '授業で取り組んだ{X}がきっかけです。', pred: '授業で{X}ことがきっかけです。'
    },
    {
      label: '部活動で',
      frame: '部活動での{X}がきっかけです。', pred: '部活動で{X}ことがきっかけです。'
    },
    {
      label: 'アルバイトで',
      frame: 'アルバイト先での{X}がきっかけです。', pred: 'アルバイト先で{X}ことがきっかけです。'
    },
    {
      label: '職場体験・インターンで',
      frame: '職場体験で見た{X}がきっかけです。', pred: '職場体験で{X}ことがきっかけです。'
    },
    {
      label: '委員会・生徒会で',
      frame: '委員会での{X}がきっかけです。', pred: '委員会で{X}ことがきっかけです。'
    },
    {
      label: 'ボランティア・地域の活動で',
      frame: '地域の活動での{X}がきっかけです。', pred: '地域の活動で{X}ことがきっかけです。'
    },
    {
      label: '本・ニュース・動画で',
      frame: '{X}について知ったことがきっかけです。', pred: '{X}と知ったことがきっかけです。'
    },
    {
      label: '自分の体験から',
      frame: '自分が経験した{X}がきっかけです。', pred: '{X}という自分の経験がきっかけです。'
    },
    {
      label: '見学・説明会で',
      frame: '見学先で目にした{X}がきっかけです。', pred: '見学先で{X}ことがきっかけです。'
    }
  ];

  /** 志望先の特色：それが何の種類か（「◯◯大学の授業「△△」」の◯◯の部分） */
  const FEATURE_KIND_SHINGAKU = ['授業', '演習', 'ゼミ', '実習', '研究室', '学科', 'コース',
    'プログラム', '資格支援制度', '留学制度', '施設', '行事', '取り組み'];
  const FEATURE_KIND_SHUSHOKU = ['製品', '技術', 'サービス', '設備', '事業', '研修制度',
    '資格支援制度', '職場の体制', '仕事の進め方', '取り組み'];

  /** 志望理由のひとこと：語尾（{X} に生徒が書いた名詞が入る） */
  const WANT_VERB_SHINGAKU = [
    { label: '学びたい', frame: '{X}について学びたい', pred: '{X}ことを学びたい' },
    { label: '身につけたい', frame: '{X}を身につけたい', pred: '{X}力を身につけたい' },
    { label: '理解を深めたい', frame: '{X}への理解を深めたい', pred: '{X}ことへの理解を深めたい' },
    { label: '研究したい', frame: '{X}について研究したい', pred: '{X}ことについて研究したい' },
    { label: '経験を積みたい', frame: '{X}の経験を積みたい', pred: '{X}経験を積みたい' },
    { label: '挑戦したい', frame: '{X}に挑戦したい', pred: '{X}ことに挑戦したい' },
    { label: '将来の仕事につなげたい', frame: '{X}を将来の仕事につなげたい', pred: '{X}ことを将来の仕事につなげたい' },
    { label: '役に立ちたい', frame: '{X}の役に立ちたい', pred: '{X}ことで人の役に立ちたい' }
  ];

  const WANT_VERB_SHUSHOKU = [
    { label: '取り組みたい', frame: '{X}に取り組みたい', pred: '{X}ことに取り組みたい' },
    { label: '技術を身につけたい', frame: '{X}の技術を身につけたい', pred: '{X}技術を身につけたい' },
    { label: '作りたい', frame: '{X}を作りたい', pred: '{X}ものを作りたい' },
    { label: '支えたい', frame: '{X}を支えたい', pred: '{X}人を支えたい' },
    { label: '任されるようになりたい', frame: '{X}を任されるようになりたい', pred: '{X}ことを任されるようになりたい' },
    { label: '挑戦したい', frame: '{X}に挑戦したい', pred: '{X}ことに挑戦したい' },
    { label: '長く続けたい', frame: '{X}を長く続けたい', pred: '{X}仕事を長く続けたい' },
    { label: '役に立ちたい', frame: '{X}の役に立ちたい', pred: '{X}ことで人の役に立ちたい' }
  ];

  /** 活かせる力を、どこで身につけたか（就職） */
  const CONTRIB_FROM = ['アルバイト', '部活動', '実習', '委員会活動', '生徒会', '課題研究',
    '学校行事', 'ボランティア', '資格の勉強', '日々の授業', '家での手伝い'];

  /** 卒業後・将来像を、いつの話として書くか */
  const AFTER_WHEN_SHINGAKU = ['在学中', '卒業後', '将来'];
  const AFTER_WHEN_SHUSHOKU = ['1年後', '3年後', '5年後', '10年後'];

  // ── 選択肢を文に組み込むための小道具 ────────────────────
  function whereList(mode) {
    return job(mode) ? WHERE_SHUSHOKU : WHERE_SHINGAKU;
  }

  function wantVerbList(mode) {
    return job(mode) ? WANT_VERB_SHUSHOKU : WANT_VERB_SHINGAKU;
  }

  /** 入力された値を、前後の空白と句点を落として取り出す（プレビュー用） */
  function txt(v) {
    return String(v == null ? '' : v).trim().replace(/[。．\s]+$/, '');
  }

  /** 「この設問は何についてのものか」を示す引用文 */
  function about(v) {
    const t = txt(v);
    return t ? '「' + t + '」について' : '';
  }

  /**
   * プレビュー用の志望先の呼び方。
   * 進学は「〇〇大学経済学部」、就職は「株式会社〇〇の製造職」とつなぐ（生成側と同じ規則）。
   */
  function fullName(d, mode) {
    const isJob = job(mode);
    const name = txt(d.targetName) || (isJob ? '貴社' : '貴校');
    const sub = txt(d.targetSub);
    if (!sub) return name;
    return isJob ? name + 'の' + sub : name + sub;
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
    const hit = FUTURE_KIND.find(function (k) { return k.label === kind; }) || FUTURE_KIND[2];
    return frame(word, hit.frame, hit.pred);
  }

  /** 「授業・実習で」＋「福祉体験」→「授業で取り組んだ福祉体験がきっかけです。」 */
  function whySourceSentence(source, word) {
    const hit = WHY_SOURCE.find(function (s) { return s.label === source; });
    if (!hit) return frame(word, '{X}がきっかけです。', '{X}ことがきっかけです。');
    return frame(word, hit.frame, hit.pred);
  }

  /** 「身につけたい」＋「地域の課題を調べる力」→「地域の課題を調べる力を身につけたい」 */
  function wantPhrase(verbLabel, word, mode) {
    const w = String(word || '').trim();
    if (!w) return '';
    // 「〜たい」まで書かれていたら、そのまま志望理由の述語として使う
    if (/たい$/.test(w.replace(/[。．\s]+$/, ''))) return w.replace(/[。．\s]+$/, '');
    const list = wantVerbList(mode);
    const hit = list.find(function (v) { return v.label === verbLabel; }) || list[0];
    return frame(w, hit.frame, hit.pred);
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
      // ───────────────────────────── 基本情報
      {
        id: 'basic',
        no: 1,
        title: '基本情報',
        lead: isJob
          ? 'まず、どの会社に出す志望動機かをはっきりさせます。ここは事務的な内容なので、さっと埋めてしまいましょう。'
          : 'まず、どの学校に出す志望理由書かをはっきりさせます。ここは事務的な内容なので、さっと埋めてしまいましょう。',
        groups: [
          { id: 'me', name: 'あなたのこと' },
          {
            id: 'target',
            name: isJob ? '応募する会社のこと' : '志望する学校のこと',
            desc: isJob ? '求人票を見ながら書き写します。' : '募集要項やパンフレットを見ながら書き写します。'
          },
          { id: 'setting', name: '書き方の設定', desc: 'あとから変えられます。' }
        ],
        fields: [
          {
            id: 'studentName', group: 'me', type: 'text', maxChars: 20, label: 'あなたの名前', required: true,
            placeholder: '山田 太郎',
            hint: '先生が「誰の下書きか」を見分けるために使います。本文には出ません。'
          },
          {
            id: 'highSchool', group: 'me', type: 'text', maxChars: 30, label: '高校の名前',
            placeholder: '〇〇県立△△高等学校',
            hint: '略さずに書きます。'
          },
          {
            id: 'className', group: 'me', type: 'text', maxChars: 20, label: 'クラス・出席番号',
            placeholder: '3年2組 15番'
          },
          {
            id: 'targetName', group: 'target', type: 'text', maxChars: 40, required: true,
            label: isJob ? '志望する会社の名前' : '志望する学校の名前',
            placeholder: isJob ? '株式会社〇〇製作所' : '〇〇大学',
            examples: isJob
              ? ['株式会社〇〇製作所', '〇〇工業株式会社', '〇〇市役所']
              : ['〇〇大学', '学校法人△△ □□専門学校', '〇〇短期大学'],
            hint: isJob
              ? '求人票に書いてある正式名称を、そのまま写します。「株式会社」が前につくか後ろにつくかも求人票どおりに。'
              : '募集要項やパンフレットの正式名称を、そのまま写します。',
            avoid: isJob ? '「〇〇製作所」と略さない' : '「〇〇大」と略さない',
            preview: function (d) {
              return '私が' + fullName(d, mode) + 'を志望した理由は、……';
            }
          },
          {
            id: 'targetSub', group: 'target', type: 'text', maxChars: 30,
            label: isJob ? '希望する職種' : '学部・学科・コース',
            refer: function (d) { return about(d.targetName); },
            placeholder: isJob ? '製造職' : '経済学部 経済学科',
            examples: isJob
              ? ['製造職', '総合職', '事務職']
              : ['経済学部 経済学科', '情報処理科', '看護学科'],
            hint: isJob
              ? '求人票に書いてある職種名です。分からなければ空のままでも進めます。'
              : '募集要項の書き方に合わせます。分からなければ空のままでも進めます。'
          },
          {
            id: 'examType', group: 'target', type: 'select',
            label: isJob ? 'どうやって応募しますか' : 'どの入試を受けますか',
            refer: function (d) { return about(d.targetName); },
            options: isJob
              ? ['学校斡旋（求人票）', '自己開拓', '公務員試験', '縁故', 'その他・未定']
              : ['総合型選抜（AO）', '学校推薦型選抜（公募）', '指定校推薦', '一般選抜', 'その他・未定'],
            hint: isJob
              ? '学校斡旋なら、高校の名前を背負って応募することになります。読み手は先生でもあると思って書きましょう。'
              : '推薦なら、その学校が出している「求める学生像」に寄せると効果的です。'
          },
          {
            id: 'targetChars', group: 'setting', type: 'number', label: '目標の文字数', required: true,
            default: isJob ? 300 : 500, min: 100, max: 2000, step: 50,
            hint: 'STEP 1 で選んだ長さが入っています。'
              + (isJob
                ? '履歴書の志望動機欄なら200〜300字、エントリーシートなら400字前後が目安です。'
                : '募集要項に字数の指定があれば、その数字に直してください。')
              + '指定の字数を超えると、それだけで減点されることがあります。'
          },
          {
            id: 'tone', group: 'setting', type: 'select', label: '文の終わり方',
            options: ['です・ます調', 'だ・である調'],
            default: 'です・ます調',
            hint: '迷ったら「です・ます調」。指定があるときだけ変えます。途中で混ざらないよう、アプリが最後まで統一します。',
            preview: function (d) {
              return d.tone === 'だ・である調'
                ? '「……を志望する。」という終わり方になります。'
                : '「……を志望します。」という終わり方になります。';
            }
          }
        ]
      },

      // ───────────────────────────── 自分を知る
      {
        id: 'self',
        no: 2,
        title: '自分を知る',
        lead: 'ここから材料集めです。答えるのは単語だけで大丈夫。'
          + '助詞や語尾はアプリがつけるので、文の形にしようとしなくて構いません。',
        note: '入力すると、その下に「こう文になります」が出ます。それを見ながら言葉を選んでください。',
        groups: [
          {
            id: 'effort',
            name: '高校でがんばったこと',
            desc: 'まず1つ選び、そのことだけを最後まで掘り下げます。'
              + '以下の質問は、すべてここで選んだ活動についての質問です。'
          },
          {
            id: 'youself',
            name: 'あなたの得意なこと・性格',
            desc: '文章に厚みを足す材料です。答えられるものだけで大丈夫。'
          },
          {
            id: 'future',
            name: '将来のこと',
            desc: 'この型は、将来の目標から逆算して書きます。ここが出発点です。'
          },
          {
            id: 'gap',
            name: 'これから伸ばしたいこと',
            desc: 'この型は、「今の自分に足りないこと」から書き始めます。'
          }
        ],
        fields: [
          {
            id: 'efforts', group: 'effort', type: 'chips', max: 3,
            label: '高校生活で、いちばん時間をかけたことは何ですか', required: true,
            options: ['部活動', '生徒会', '委員会', 'クラス役員', '学校行事', '課題研究・探究学習',
              '資格・検定の取得', '実習・実験', '勉強・定期考査', 'アルバイト', 'ボランティア',
              '皆勤・無遅刻無欠席', '地域の活動', '習い事・クラブチーム', '作品づくり・制作',
              '大会・コンクールへの挑戦', '家の手伝い・家業'],
            allowFree: true,
            hint: '最初に押したものが文章の中心になります。3つまで選べます。'
              + '当てはまるものがなければ、「＋ 自分で追加」から書き足せます。'
          },
          {
            id: 'effortWhen', group: 'effort', type: 'select',
            label: 'その活動に取り組んでいたのは、いつですか', required: true,
            refer: function (d) { return about((d.efforts || [])[0]); },
            options: EFFORT_WHEN,
            default: '1年生から3年間',
            preview: function (d) {
              const top = (d.efforts || [])[0] || '部活動';
              return (d.effortWhen || '1年生から3年間') + '、いちばん力を入れてきたのは' + top + 'です。';
            }
          },
          {
            id: 'effortRole', group: 'effort', type: 'text', maxChars: 15,
            label: 'その活動での役割（あれば）',
            refer: function (d) { return about((d.efforts || [])[0]); },
            placeholder: '副キャプテン',
            examples: ['副キャプテン', '会計', '班長', 'パートリーダー'],
            hint: '肩書きの名前だけ書きます。役割がなければ、空のままで構いません。',
            preview: function (d) {
              if (!txt(d.effortRole) || !txt(d.effortAction)) return '';
              return txt(d.effortRole) + 'として、' + txt(d.effortAction) + 'に取り組みました。';
            }
          },
          {
            id: 'effortAction', group: 'effort', type: 'text', maxChars: 30,
            label: 'その活動の中で、自分がやったこと', required: true,
            refer: function (d) { return about((d.efforts || [])[0]); },
            placeholder: '練習メニューの見直し',
            examples: ['練習メニューの見直し', '週3回の朝練習の記録', '1年生への声かけ', '地元商店街での聞き取り調査'],
            hint: '「何をしたか」を、ものごとの名前で短く書きます。'
              + '数（週3回・50人・3か月）が入ると、いっきに具体的になります。',
            avoid: '「がんばりました」「一生懸命やりました」のような文は書きません',
            preview: function (d) {
              return txt(d.effortAction)
                ? (txt(d.effortRole) ? txt(d.effortRole) + 'として、' : 'その中で、')
                  + txt(d.effortAction) + 'に取り組みました。'
                : '';
            }
          },
          {
            id: 'effortResult', group: 'effort', type: 'text', maxChars: 30,
            label: 'それに取り組んだ結果、どうなりましたか',
            refer: function (d) { return about(d.effortAction); },
            only: ['prep', 'story', 'gap', 'three'],
            placeholder: '県大会ベスト8',
            examples: ['県大会ベスト8', '来場者200人', 'ミスの件数が半分に', '新しく入った人への引き継ぎ'],
            hint: '数字・順位・回数が入ると説得力が出ます。'
              + '大きな結果でなくて構いません。「前より良くなったこと」で十分です。',
            preview: function (d) {
              return txt(d.effortResult) ? txt(d.effortResult) + 'は、その中で生まれた成果です。' : '';
            }
          },
          {
            id: 'effortLearned', group: 'effort', type: 'text', maxChars: 30,
            label: 'この活動全体をふり返って、学んだこと', required: true,
            refer: function (d) { return about((d.efforts || [])[0]); },
            placeholder: '役割を分けることの大切さ',
            examples: ['役割を分けることの大切さ', '人に合わせて説明を変える力', '手順を共有することの大切さ'],
            hint: '「〜の大切さ」「〜する力」の形にすると、そのまま文に入ります。',
            avoid: '「成長できました」だけでは、何を学んだか伝わりません',
            preview: function (d) {
              return txt(d.effortLearned) ? 'この経験から、' + txt(d.effortLearned) + 'を学びました。' : '';
            }
          },
          {
            id: 'strengths', group: 'youself', type: 'chips', max: 3,
            label: isJob ? '仕事で活かせそうな、自分の得意なこと' : '得意な教科・好きなこと',
            options: isJob
              ? ['体力がある', '手先が器用', '正確に作業できる', 'コツコツ続けられる', '人と話すこと',
                'あいさつ', '報告・連絡', 'パソコン操作', '計算', '機械の操作', 'ものづくり',
                '整理整頓', '早起き・時間を守る', '力仕事', '接客', '安全に気を配ること']
              : ['国語', '数学', '英語', '理科', '地歴・公民', '情報', '商業', '工業', '家庭', '保健体育',
                '美術', '音楽', '書道', '簿記', '福祉・看護',
                'プログラミング', 'ものづくり', '調べること', '発表すること', '文章を書くこと'],
            allowFree: true,
            hint: '下の「性格」を選んだ場合は、そちらが優先して使われます。',
            preview: function (d) {
              const a = (d.strengths || []).slice(0, 3);
              if (!a.length || (d.personality || []).length) return '';
              const q = a.map(function (x) { return '「' + x + '」'; }).join('');
              return isJob ? '仕事で活かせそうな点は' + q + 'です。' : '得意なのは' + q + 'です。';
            }
          },
          {
            id: 'licenses', group: 'youself', type: 'text', maxChars: 40,
            label: '持っている資格・検定',
            placeholder: isJob ? '危険物取扱者乙種4類' : '実用英語技能検定2級',
            examples: isJob
              ? ['危険物取扱者乙種4類', '第二種電気工事士', '普通自動車第一種運転免許']
              : ['実用英語技能検定2級', '日本語検定3級', '情報処理検定2級'],
            hint: '名前だけで大丈夫です。2つ以上あるときは「、」で区切ります。まだなければ空のままで構いません。',
            preview: function (d) {
              return txt(d.licenses) ? 'また、' + txt(d.licenses) + 'を取得しています。' : '';
            }
          },
          {
            id: 'personality', group: 'youself', type: 'chips', max: 3, label: '自分の性格',
            options: ['まじめ', 'こつこつ続けられる', '責任感が強い', '好奇心が強い', '人の話をよく聞く',
              'まわりを見て動ける', 'リーダーシップがある', '前向き', '落ち着いている', '明るい',
              'ていねい', '協調性がある', 'がまん強い', '人に頼られやすい', '負けずぎらい'],
            allowFree: true,
            hint: '自分で思うものでも、人からよく言われるものでも構いません。',
            preview: function (d) {
              const a = (d.personality || []).slice(0, 3);
              if (!a.length) return '';
              return '自分では' + a.map(function (x) { return '「' + x + '」'; }).join('')
                + 'という点が持ち味だと思っています。';
            }
          },
          {
            id: 'futureKind', group: 'future', type: 'select',
            label: '将来のことで、今いえるのはどれですか', required: true,
            only: ['future'],
            options: FUTURE_KIND.map(function (k) { return k.label; }),
            default: '興味のある分野がある',
            hint: 'ここで選んだ形に合わせて、次の欄の言葉が文に組み込まれます。'
              + '「まだ決まっていない」を選んでも、ちゃんと文章になります。'
          },
          {
            id: 'futureDream', group: 'future', type: 'text', maxChars: 20,
            label: 'その職業・分野の名前', required: true,
            refer: function (d) {
              return txt(d.futureKind) ? '「' + txt(d.futureKind) + '」と答えました' : '';
            },
            only: ['future'],
            placeholder: isJob ? 'ものづくり' : '看護師',
            examples: isJob
              ? ['ものづくり', '機械の整備', '人の生活を支える仕事']
              : ['看護師', '情報', '地域づくり', '保育'],
            hint: '名前だけで大丈夫です。「〜になりたい」まで書く必要はありません。',
            preview: function (d) {
              return futureSentence(d.futureKind, d.futureDream);
            }
          },
          {
            id: 'futureWhySource', group: 'future', type: 'select',
            label: 'それを目指すようになったのは、どこでのことですか',
            refer: function (d) { return about(d.futureDream); },
            only: ['future'],
            options: WHY_SOURCE.map(function (s) { return s.label; }),
            hint: '「きっかけの場所」を選びます。'
              + '選ばなくても先へ進めますが、選ぶと「なぜそう思ったか」が伝わる文章になります。'
          },
          {
            id: 'futureWhyWhat', group: 'future', type: 'text', maxChars: 30,
            label: 'そこで見たこと・起きた出来事',
            refer: function (d) {
              const dream = txt(d.futureDream);
              const src = txt(d.futureWhySource);
              if (!dream && !src) return '';
              if (!dream) return '「' + src + '」のきっかけについて';
              return '「' + dream + '」を目指すきっかけ'
                + (src ? '（' + src + '）' : '') + 'について';
            },
            only: ['future'],
            placeholder: isJob ? '先輩が新人に教えている姿' : '祖母の入院',
            examples: isJob
              ? ['先輩が新人に教えている姿', '工場見学で見た組み立ての様子']
              : ['祖母の入院', '商店街の空き店舗の増加', '文化祭のポスター作り'],
            hint: 'その場面を、短い言葉で。上で選んだきっかけと組み合わさって1つの文になります。',
            preview: function (d) {
              return whySourceSentence(d.futureWhySource, d.futureWhyWhat);
            }
          },
          {
            id: 'gapNow', group: 'gap', type: 'text', maxChars: 20,
            label: '今の自分に足りないと感じている力', required: true,
            only: ['gap'],
            placeholder: isJob ? '自分から動く力' : '人に伝える力',
            examples: isJob
              ? ['自分から動く力', '手順を説明する力', '最後までやり切る力']
              : ['人に伝える力', '深く調べる力', '初対面の人と話す力'],
            hint: 'この構成は、ここが出発点になります。「〜する力」の形にすると入れやすいです。'
              + '弱みを書くのではなく、「これから伸ばしたいこと」を書くつもりで。',
            preview: function (d) {
              return txt(d.gapNow) ? '私には今、' + txt(d.gapNow) + 'が足りないと感じています。' : '';
            }
          }
        ].filter(usable)
      },

      // ───────────────────────────── 学校／会社を知る
      {
        id: 'research',
        no: 3,
        title: isJob ? '会社を知る' : '学校を知る',
        lead: isJob
          ? 'ここがいちばん大事なステップです。「調べた証拠」と「自分の目で見たこと」を集めます。ここが薄いと、どの会社にも出せる文章になってしまいます。'
          : 'ここがいちばん大事なステップです。「調べた証拠」と「自分の目で見たこと」を集めます。ここが薄いと、どの学校にも出せる文章になってしまいます。',
        note: isJob
          ? '手元に用意すると早いもの：求人票／会社のホームページ／会社案内／説明会や職場見学のメモ'
          : '手元に用意すると早いもの：学校案内のパンフレット／学校のホームページ／オープンキャンパスのメモ',
        groups: [
          {
            id: 'meet',
            name: isJob ? 'その会社との出会い' : 'その学校との出会い',
            desc: 'どこで知って、どこまで足を運んだか。事実をそのまま選びます。'
          },
          {
            id: 'card',
            name: '心が動いた場面',
            desc: 'ここがこの文章の主役です。時間をかける価値があるのはこの2問。'
          },
          {
            id: 'found',
            name: isJob ? '調べて分かったこと' : '調べて分かったこと',
            desc: isJob
              ? '求人票と会社のホームページから、この会社ならではの中身を書き出します。'
              : 'パンフレットと学校のホームページから、この学校ならではの中身を書き出します。'
          }
        ],
        fields: [
          {
            id: 'knewBy', group: 'meet', type: 'select',
            label: isJob ? 'その会社を知ったきっかけは何ですか' : 'その学校を知ったきっかけは何ですか',
            refer: function (d) { return about(d.targetName); },
            options: isJob
              ? ['学校に届いた求人票', '会社説明会', '職場見学', '職場体験', 'インターンシップ',
                '先生からの紹介', '同じ高校の先輩の話', '家族・知人の紹介',
                '会社のホームページ', '製品を使ったこと', 'その他']
              : ['オープンキャンパス', '体験授業', '学校見学', '進学ガイダンス', '入試説明会',
                '学校案内・パンフレット', '学校のホームページ', '先生からの紹介',
                '先輩・家族の話', 'その他'],
            hint: 'エピソード型では、ここが「出会いの場面」として文章に出てきます。'
          },
          {
            id: 'visited', group: 'meet', type: 'chips', max: 4,
            label: isJob ? 'その会社について、実際に行った・参加したこと' : 'その学校について、実際に行った・参加したこと',
            refer: function (d) { return about(d.targetName); },
            options: isJob
              ? ['会社説明会', '職場見学', '職場体験', 'インターンシップ', '個別面談',
                'オンライン説明会', 'まだ行っていない']
              : ['オープンキャンパス', '体験授業', '学校見学', '個別相談会', '学園祭',
                '進学説明会', 'オンライン説明会', '部活動の見学', 'まだ行っていない'],
            allowFree: true,
            hint: '足を運んだ事実そのものが、志望の本気度を示します。まだなら「まだ行っていない」を選んでください（文章には出ません）。',
            preview: function (d) {
              const been = (d.visited || []).filter(function (v) { return String(v).indexOf('まだ') !== 0; });
              if (!been.length) return '';
              const two = been.slice(0, 2);
              return (two.length === 2 ? two[0] + 'や' + two[1] : two[0]) + 'にも参加し、自分の目で確かめました。';
            }
          },
          {
            id: 'attractCards', group: 'card', type: 'cards', required: true,
            label: '魅力カード（この文章の主役です）',
            refer: function (d) { return about(d.targetName); },
            max: 3,
            whereOptions: whereList(mode),
            feelOptions: FEELINGS.map(function (f) { return f.label; }),
            hint: '「いいな」と心が動いた瞬間を、1枚ずつカードにします。'
              + 'ここに書いたことが、そのまま本文の中心になります。まず1枚。できれば2〜3枚。'
              + '立派なことを書く必要はありません。小さくても、あなたが実際に見た場面ほど強い材料になります。',
            whatPlaceholder: isJob
              ? '社員の方が、作業を始める前に必ずおたがいに声をかけ合っていた'
              : '学生同士が、答えではなく考え方のほうを話し合っていた',
            linkPlaceholder: isJob
              ? 'アルバイトで、声をかけ合うとミスが減った経験と重なります'
              : '課題研究で、人と話すほど自分の考えが整理された経験と重なります'
          },
          {
            id: 'attractPoints', group: 'card', type: 'chips', max: 3,
            label: '上のカードに書いた魅力は、どの種類のものですか', required: true,
            refer: function (d) {
              const c = (d.attractCards || []).find(function (x) { return x && txt(x.what); });
              if (!c) return '';
              const w = txt(c.what);
              return '魅力カードに書いた「' + w.slice(0, 20) + (w.length > 20 ? '…' : '') + '」について';
            },
            options: isJob
              ? ['仕事の内容', '会社の製品・サービス', '技術力', '製品の品質', '地域への貢献',
                '研修・人材育成', '資格取得の支援', '安全への取り組み', '仕事の進め方',
                '職場の雰囲気', '先輩の様子', '会社の理念', '安定性', '働き方・休日', '若手の活躍']
              : ['学べる内容・カリキュラム', '取得できる資格', '資格試験の合格率', '実習・演習の多さ',
                '就職・進学実績', '設備・施設', '先生・教授の研究', '先生との距離の近さ',
                '少人数教育', '在校生の様子', '留学・国際交流', '奨学金制度',
                '学校の雰囲気', '通学のしやすさ'],
            allowFree: true,
            hint: '魅力カードを書いていれば、ここは分類のためだけに使われます。'
          },
          {
            id: 'featureName', group: 'found', type: 'text', maxChars: 40, required: true,
            label: isJob
              ? '調べていて、いちばん心をひかれたものの名前'
              : '調べていて、いちばん心をひかれたものの名前',
            placeholder: isJob ? '〇〇部品の精密加工' : '地域経済フィールドワーク',
            examples: isJob
              ? ['〇〇部品の精密加工', '自社ブランド「△△」', '24時間体制の保守サービス']
              : ['地域経済フィールドワーク', '海外研修プログラム', '医療事務コース'],
            hint: 'ここに固有名詞が入るかどうかで、文章の説得力が決まります。'
              + (isJob ? '求人票や会社案内の表記どおりに写します。' : 'パンフレットやシラバスの表記どおりに写します。'),
            avoid: '「いろいろな授業」「幅広い仕事」のような、どこでも言えることは書かない',
            preview: function (d) {
              if (!txt(d.featureName)) return '';
              const kind = txt(d.featureKind) || (isJob ? '取り組み' : '学び');
              const n = txt(d.targetName) || (isJob ? '貴社' : '貴校');
              return '私が特に関心を持ったのは、' + n + 'の' + kind + '「' + txt(d.featureName) + '」です。';
            }
          },
          {
            id: 'featureKind', group: 'found', type: 'select', required: true,
            label: 'それは、どの種類のものですか',
            refer: function (d) { return about(d.featureName); },
            options: isJob ? FEATURE_KIND_SHUSHOKU : FEATURE_KIND_SHINGAKU,
            default: isJob ? '技術' : '授業',
            hint: isJob
              ? '選んだ言葉が「貴社の◯◯「△△」」の◯◯に入ります。'
              : '選んだ言葉が「貴校の◯◯「△△」」の◯◯に入ります。'
          },
          {
            id: 'featureDetail', group: 'found', type: 'text', maxChars: 30,
            only: ['prep', 'future', 'scene', 'three'],
            label: 'そこでできること・その特徴',
            refer: function (d) { return about(d.featureName); },
            placeholder: isJob ? '検査から出荷までの一貫生産' : '自治体と組んだ課題調査',
            examples: isJob
              ? ['検査から出荷までの一貫生産', '海外向け製品の設計', '若手のうちからの現場配属']
              : ['自治体と組んだ課題調査', '2年次からの少人数ゼミ', '現場の病院での実習'],
            hint: '「〜すること」「〜の◯◯」のように、ものごとの名前で書きます。',
            avoid: '「〜を担当」「〜ができる」のように文の形で書くと、うまくつながりません',
            preview: function (d) {
              return txt(d.featureDetail)
                ? 'そこでは' + txt(d.featureDetail) + 'に関わることができると知りました。' : '';
            }
          },
          isJob
            ? {
              id: 'jobTask', group: 'found', type: 'text', maxChars: 30,
              label: 'その職種は、毎日どんなことをする仕事ですか',
              refer: function (d) { return about(txt(d.targetSub) || '希望する職種'); },
              placeholder: '部品の加工と寸法の確認',
              examples: ['部品の加工と寸法の確認', '注文の受付と在庫の管理', '機械の点検と修理'],
              hint: '求人票の「仕事の内容」欄を、自分の言葉で短くまとめます。'
                + 'ここを正しく書けている人は、面接でも強いです。',
              preview: function (d) {
                return txt(d.jobTask) ? txt(d.jobTask) + 'を行う仕事だと理解しています。' : '';
              }
            }
            : {
              id: 'studyWant', group: 'found', type: 'text', maxChars: 30,
              label: 'その学科で、特に受けたい授業・科目の名前',
              refer: function (d) { return about(txt(d.targetSub) || txt(d.targetName)); },
              placeholder: '地域経済論',
              examples: ['地域経済論', '基礎看護学実習', 'プログラミング演習'],
              hint: 'シラバスや学校案内に載っている名前を、そのまま写します。',
              preview: function (d) {
                return txt(d.studyWant) ? '特に「' + txt(d.studyWant) + '」を学びたいと考えています。' : '';
              }
            },
          {
            id: 'targetPolicy', group: 'found', type: 'text', maxChars: 30,
            refer: function (d) { return about(d.targetName); },
            only: ['prep', 'story', 'three'],
            label: isJob ? '共感した理念・社訓の言葉' : '共感した教育目標・校訓の言葉',
            placeholder: isJob ? '安全第一、品質第二' : '自ら学び、自ら考える',
            examples: isJob
              ? ['安全第一、品質第二', '地域とともに歩む', '人を育てる']
              : ['自ら学び、自ら考える', '実学重視', '地域に開かれた学び'],
            hint: 'ホームページに書いてある言葉を、そのまま写します。かぎかっこは自動でつきます。',
            preview: function (d) {
              return txt(d.targetPolicy)
                ? '「' + txt(d.targetPolicy) + '」という考え方にも共感しています。' : '';
            }
          }
        ].filter(usable)
      },

      // ───────────────────────────── つなげる
      {
        id: 'connect',
        no: 4,
        title: 'つなげる',
        lead: isJob
          ? '「自分」と「会社」を1本の線でつなぎます。ここが志望動機の心臓部です。'
          : '「自分」と「学校」を1本の線でつなぎます。ここが志望理由の心臓部です。',
        groups: [
          {
            id: 'why',
            name: '志望理由のひとこと',
            desc: 'まず一言でまとめ、そのあと「なぜ？」を3回くり返して掘り下げます。'
          },
          {
            id: 'only',
            name: isJob ? 'この会社でなければならない理由' : 'この学校でなければならない理由',
            desc: '読み手がいちばん知りたいところです。'
          },
          {
            id: 'after',
            name: isJob ? '入社したあとのこと' : '入学したあとのこと',
            desc: '入ってからの姿を書くと、読み手が一緒に働く／学ぶ場面を想像できます。'
          }
        ],
        fields: [
          {
            id: 'wantObject', group: 'why', type: 'text', maxChars: 25, label: isJob
              ? 'その会社で、いちばん手に入れたいものは何ですか'
              : 'その学校で、いちばん手に入れたいものは何ですか',
            required: true,
            placeholder: isJob ? '正確さを求められるものづくり' : '地域の課題を調べる力',
            examples: isJob
              ? ['正確さを求められるものづくり', '人の生活を支える技術', '現場で通用する知識']
              : ['地域の課題を調べる力', '看護の専門知識', '人前で説明する力'],
            hint: '「力」「知識」「技術」「仕事」など、ものの名前で書きます。'
              + '次の欄で選ぶ言葉とつながって、志望理由の中心になる一文ができます。',
            avoid: '「〜したい」まで書くと二重になります。名前だけで止めてください',
            preview: function (d) {
              const w = wantPhrase(d.wantVerb, d.wantObject, mode);
              if (!w) return '';
              return '私が' + fullName(d, mode) + 'を志望した理由は、' + w + 'からです。';
            }
          },
          {
            id: 'wantVerb', group: 'why', type: 'select',
            label: 'それを、どうしたいですか', required: true,
            refer: function (d) { return about(d.wantObject); },
            options: wantVerbList(mode).map(function (v) { return v.label; }),
            default: wantVerbList(mode)[0].label,
            hint: '上の欄の言葉と、いちばん自然につながるものを選びます。'
          },
          {
            id: 'whyChain', group: 'why', type: 'whychain',
            label: '「なぜ？」を3回くり返します', required: true,
            refer: function (d) {
              const w = wantPhrase(d.wantVerb, d.wantObject, mode);
              return w ? '「' + w + '」という理由を掘り下げます' : '';
            },
            source: 'wantObject',
            hint: '同じ理由でも、3回掘り下げると「あなたにしか書けない動機」に変わります。'
              + '短い言葉で構いません。3つ目の答えが本文に使われます。',
            avoid: '3つとも同じことを書き直すと、掘り下げになりません'
          },
          {
            id: 'mustPoint', group: 'only', type: 'text', maxChars: 30, required: true,
            refer: function (d) { return about(d.targetName); },
            label: isJob ? '他の会社ではなく、この会社でなければならない理由' : '他の学校ではなく、この学校でなければならない理由',
            placeholder: isJob ? '検査工程まで自社で行う体制' : '提言まで行う地域連携',
            examples: isJob
              ? ['検査工程まで自社で行う体制', '入社1年目からの現場配属', '地元にこだわった生産']
              : ['提言まで行う地域連携', '1学年30人の少人数制', '附属病院での実習'],
            hint: 'パンフレットや求人票で見つけた「ここだけ」を、ものの名前で書きます。'
              + '読み手がいちばん知りたいのは、この一文です。',
            avoid: '「雰囲気が良い」「家から近い」は、他でも言えてしまいます',
            preview: function (d) {
              if (!txt(d.mustPoint)) return '';
              const n = txt(d.targetName) || (isJob ? '貴社' : '貴校');
              return '同じような' + (isJob ? '会社' : '学校') + 'は他にもありますが、'
                + n + 'には' + txt(d.mustPoint) + 'という違いがあります。';
            }
          },
          {
            id: 'afterEnter', group: 'after', type: 'chips', max: 3, required: true,
            label: isJob ? '入社したら、がんばりたいこと' : '入学したら、やりたいこと',
            options: isJob
              ? ['仕事を早く覚えること', '資格の取得', '専門技術の習得', '先輩からの技術の習得',
                'チームでの仕事', '安全の徹底', 'あいさつと報告の徹底',
                '改善の提案', '後輩の指導', '幅広い工程の経験']
              : ['専門分野の勉強', '基礎からの学び直し', '資格取得', '資格試験の対策',
                '研究・ゼミ活動', '実習・インターンシップ', '留学・語学',
                'サークル・部活動', 'ボランティア活動', '学園祭などの行事'],
            allowFree: true,
            hint: '多く選びすぎると、かえって熱意が薄く見えます。3つまで。',
            preview: function (d) {
              const a = (d.afterEnter || []).slice(0, 3);
              if (!a.length) return '';
              const j = a.length === 1 ? a[0]
                : a.length === 2 ? a[0] + 'や' + a[1]
                  : a.slice(0, -1).join('、') + '、' + a[a.length - 1];
              return (isJob ? '入社後' : '入学後') + 'は、' + j + 'に取り組みたいと考えています。';
            }
          },
          {
            id: 'afterAction', group: 'after', type: 'text', maxChars: 25,
            label: 'その中で、まず何から始めますか', required: true,
            refer: function (d) {
              const a = (d.afterEnter || []).slice(0, 2);
              return a.length ? '「' + a.join('、') + '」について' : '';
            },
            placeholder: isJob ? '先輩への質問' : '地域の方への取材',
            examples: isJob
              ? ['先輩への質問', '作業手順のメモ取り', 'あいさつと報告']
              : ['地域の方への取材', '毎日の予習', '先生への質問'],
            hint: '入学・入社したその日からできる、小さなことで構いません。'
              + '小さいほど、本当にやるつもりだと伝わります。',
            preview: function (d) {
              return txt(d.afterAction) ? 'まずは' + txt(d.afterAction) + 'から始めたいです。' : '';
            }
          },
          isJob ? {
            id: 'contribution', group: 'after', type: 'text', maxChars: 30,
            label: 'その仕事で活かせる、自分の力の名前',
            refer: function (d) { return about(txt(d.targetSub) || '希望する職種'); },
            placeholder: '手順を崩さずに作業を続ける力',
            examples: ['手順を崩さずに作業を続ける力', '初対面の人と話す力', '体力と早起きの習慣'],
            hint: '大げさな力でなくて構いません。実際に続けてきたことほど信じてもらえます。'
          } : null,
          isJob ? {
            id: 'contributionFrom', group: 'after', type: 'select',
            label: 'その力は、どこで身につけましたか',
            refer: function (d) { return about(d.contribution); },
            options: CONTRIB_FROM,
            default: 'アルバイト',
            hint: '上の欄とセットで、「自分が会社に何を返せるか」を示す一文になります。',
            preview: function (d) {
              return txt(d.contribution)
                ? (txt(d.contributionFrom) || '高校生活') + 'で身につけた' + txt(d.contribution)
                  + 'は、この仕事でも活かせると考えています。' : '';
            }
          } : null,
          {
            id: 'afterGradWhen', group: 'after', type: 'select',
            label: isJob ? '最後に、何年後の自分の話をしますか' : '最後に、いつの話で締めくくりますか',
            options: isJob ? AFTER_WHEN_SHUSHOKU : AFTER_WHEN_SHINGAKU,
            default: isJob ? '5年後' : '卒業後',
            hint: '最後の段落で「その先」を示すと、文章に前向きな余韻が残ります。'
          },
          {
            id: 'afterGradWhat', group: 'after', type: 'text', maxChars: 30,
            label: isJob ? 'そのとき、身につけていたいもの' : 'そのとき、目指していること',
            refer: function (d) { return about(d.afterGradWhen); },
            placeholder: isJob ? '後輩に教えられる技術' : '地域づくりに関わる仕事',
            examples: isJob
              ? ['後輩に教えられる技術', '任せてもらえる担当', '現場をまとめる力']
              : ['地域づくりに関わる仕事', '看護師として働くこと', '地元での就職'],
            hint: '志望先で身につけた先の話にすると、志望理由と一本の線でつながります。',
            preview: function (d) {
              if (!txt(d.afterGradWhat)) return '';
              const when = txt(d.afterGradWhen) || (isJob ? '5年後' : '卒業後');
              return isJob
                ? when + 'には、' + txt(d.afterGradWhat) + 'を身につけていたいです。'
                : when + 'は、' + txt(d.afterGradWhat) + 'を目指したいと考えています。';
            }
          }
        ].filter(usable)
      }
    ];
  }

  /** チップ入力欄のうち、文章生成で「〜や〜」とつなぐ最大数 */
  const CHIP_JOIN_LIMIT = 3;

  global.QUESTIONS = {
    COURSES: COURSES,
    isPredicate: isPredicate,
    isWish: isWish,
    frame: frame,
    plainWord: plainWord,
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
