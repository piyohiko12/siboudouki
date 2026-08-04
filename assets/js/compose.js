/**
 * 下書き生成エンジン
 * 集めた材料（回答）を、選んだ構成テンプレートに沿って文章に組み立てる。
 *
 * 設計方針:
 *  - 文はすべて「です・ます調」で生成し、必要なら最後に「だ・である調」へ変換する
 *  - 各文に優先度を持たせ、目標字数に収まるよう低優先度の文から自動で削る
 */
(function (global) {
  'use strict';

  // ── 文字列ユーティリティ ────────────────────────────────
  const PUNCT_END = /[。！？!?]$/;

  /** 文末に「。」を補う */
  function period(s) {
    const t = String(s || '').trim();
    if (!t) return '';
    return PUNCT_END.test(t) ? t : t + '。';
  }

  /** 複数行の入力を1つの流れる文章にする */
  function flow(s) {
    return String(s || '')
      .split(/\r?\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map(period)
      .join('');
  }

  /** 文末の「。」を外す（文の途中に埋め込むとき用） */
  function bare(s) {
    return String(s || '').trim().replace(/[。．\s]+$/, '');
  }

  /** 名詞を自然に並べる */
  function joinNouns(arr, limit) {
    const a = (arr || []).filter(Boolean).slice(0, limit || 3);
    if (a.length === 0) return '';
    if (a.length === 1) return a[0];
    if (a.length === 2) return a[0] + 'や' + a[1];
    return a.slice(0, -1).join('、') + '、' + a[a.length - 1];
  }

  /** 配列から最初の空でない値 */
  function firstOf() {
    for (let i = 0; i < arguments.length; i++) {
      const v = bare(arguments[i]);
      if (v) return v;
    }
    return '';
  }

  // ── 文体変換（です・ます → だ・である）────────────────────
  // 「ます」の直前の音（い段）を、辞書形（う段）／た形へ変換する表
  const I_TO_U = { き: 'く', ぎ: 'ぐ', し: 'す', ち: 'つ', に: 'ぬ', び: 'ぶ', み: 'む', り: 'る', い: 'う' };
  const I_TO_TA = { き: 'いた', ぎ: 'いだ', し: 'した', ち: 'った', に: 'んだ', び: 'んだ', み: 'んだ', り: 'った', い: 'った' };

  // 上の表では正しく変換できない語（上一段・下一段動詞や不規則動詞）を先に処理する
  const IRREGULAR = [
    [/行きました/g, '行った'], [/行きます/g, '行く'],
    [/てきました/g, 'てきた'], [/できました/g, 'できた'],
    [/てきます/g, 'てくる'], [/できます/g, 'できる'],
    [/来ました/g, '来た'], [/来ます/g, '来る'],
    [/見ました/g, '見た'], [/見ます/g, '見る'],
    [/起きました/g, '起きた'], [/起きます/g, '起きる'],
    [/落ちました/g, '落ちた'], [/落ちます/g, '落ちる'],
    [/借りました/g, '借りた'], [/借ります/g, '借りる'],
    [/足りました/g, '足りた'], [/足ります/g, '足りる'],
    [/過ぎました/g, '過ぎた'], [/過ぎます/g, '過ぎる'],
    [/生きました/g, '生きた'], [/生きます/g, '生きる'],
    [/用いました/g, '用いた'], [/用います/g, '用いる'],
    [/ありません/g, 'ない'], [/できません/g, 'できない'], [/いません/g, 'いない']
  ];

  // 先に処理する定型の語尾（長いものから順に並べる）
  const FIXED = [
    [/ていました/g, 'ていた'],
    [/ています/g, 'ている'],
    [/でいました/g, 'でいた'],
    [/でいます/g, 'でいる'],
    [/たいです/g, 'たい'],
    [/たいと思います/g, 'たいと考える'],
    [/ませんでした/g, 'なかった'],
    [/でしょう/g, 'だろう'],
    [/でした/g, 'だった'],
    [/ましょう/g, 'よう']
  ];

  /**
   * です・ます調 → だ・である調
   * 動詞の活用を表で処理するため、「入りました→入りた」のような誤変換を防げる。
   */
  function toPlainTone(text) {
    let t = text;

    FIXED.forEach(function (r) { t = t.replace(r[0], r[1]); });
    IRREGULAR.forEach(function (r) { t = t.replace(r[0], r[1]); });

    // 〜します：漢語2字以上なら「する」、それ以外は五段活用として処理
    t = t.replace(/([一-龥]{2,})します/g, '$1する');
    t = t.replace(/([一-龥]{2,})しました/g, '$1した');

    // 一般の「〜ました」→ た形
    t = t.replace(/(.)ました/g, function (m, c) {
      return I_TO_TA[c] || (c + 'た');
    });

    // 一般の「〜ます」→ 辞書形
    t = t.replace(/(.)ます/g, function (m, c) {
      return I_TO_U[c] ? I_TO_U[c] : c + 'る';
    });

    t = t.replace(/ですが/g, 'であるが');
    t = t.replace(/です/g, 'である');
    return t;
  }

  // ── 進路ごとの語彙 ─────────────────────────────────────
  // 文章の骨組みは共通で、呼び方だけを進学／就職で入れ替える。
  const LEX = {
    shingaku: {
      org: '学校',
      honorific: '貴校',
      join: '入学',
      joinAfter: '入学後',
      wantVerb: '学びたい',
      wantNoun: '学びたいこと',
      metPhrase: 'ここでなら自分の力をさらに伸ばせる',
      lifeNoun: '学生生活',
      docLead: '志望理由',
      featureLead: '学び'
    },
    shushoku: {
      org: '会社',
      honorific: '貴社',
      join: '入社',
      joinAfter: '入社後',
      wantVerb: '取り組みたい',
      wantNoun: '取り組みたい仕事',
      metPhrase: 'ここで働きたい',
      lifeNoun: '社会人生活',
      docLead: '志望動機',
      featureLead: '仕事'
    }
  };

  /**
   * 進路ごとの語彙に、志望先の種類（大学／専門学校／会社／役所…）の
   * 呼び方をかぶせる。大学あてなら「貴学」「大学」、役所あてなら「貴庁」「採用後」。
   */
  function lex(mode, orgType) {
    const base = LEX[mode] || LEX.shingaku;
    const o = global.QUESTIONS.orgTypeOf(mode, orgType);
    return Object.assign({}, base, {
      org: o.org, honorific: o.honorific, join: o.join, joinAfter: o.joinAfter
    });
  }

  // ── テンプレート定義 ───────────────────────────────────
  const TEMPLATES = [
    {
      id: 'scene',
      name: '場面描写型',
      summary: '見学や体験で心が動いた場面から書き出す型。魅力カードがいちばん活きる。',
      order: function (job) {
        return job ? 'その場面 → 気持ち → 志望へ → 自分の経験 → 入社後 → 結び'
          : 'その場面 → 気持ち → 志望へ → 自分の経験 → 入学後 → 結び';
      },
      build: buildScene
    },
    {
      id: 'prep',
      name: '結論先行型',
      summary: '最初に結論を言い切る、いちばん読みやすい型。迷ったらこれ。',
      order: function (job) {
        return job ? '結論 → 会社の魅力 → 自分の経験 → 他社との違い → 入社後 → 結び'
          : '結論 → 学校の魅力 → 自分の経験 → 他校との違い → 入学後 → 結び';
      },
      build: buildPrep
    },
    {
      id: 'story',
      name: 'エピソード型',
      summary: '自分の体験から語り始める型。高校時代に打ち込んだことがある人向け。',
      order: function (job) {
        return job ? '体験 → 学んだこと → 会社との出会い → 魅力 → 入社後 → 結び'
          : '体験 → 学んだこと → 学校との出会い → 魅力 → 入学後 → 結び';
      },
      build: buildStory
    },
    {
      id: 'future',
      name: '将来目標型',
      summary: '将来の目標から逆算する型。やりたいことがはっきりしている人向け。',
      order: function (job) {
        return job ? '将来像 → きっかけ → 必要な力 → 会社の特色 → 自分の経験 → 結び'
          : '将来の目標 → きっかけ → 必要な力 → 学校の特色 → 自分の経験 → 結び';
      },
      build: buildFuture
    },
    {
      id: 'gap',
      name: '成長課題型',
      summary: '「今の自分に足りないこと」から入る型。背伸びせずに意欲を示せる。',
      order: function (job) {
        return job ? '今の課題 → 埋めたい → ここなら埋まる → 経験 → 将来像'
          : '今の課題 → 埋めたい → ここなら学べる → 経験 → 卒業後';
      },
      build: buildGap
    },
    {
      id: 'three',
      name: '三つの理由型',
      summary: '理由を3つに整理して番号で示す型。字数が多いとき、面接で話すときに強い。',
      order: function (job) {
        return job ? '結論 → ①仕事の中身 → ②見てきたこと → ③自分の経験 → 結び'
          : '結論 → ①学びの中身 → ②見てきたこと → ③自分の経験 → 結び';
      },
      build: buildThree
    }
  ];

  // 観察のあとに続ける枠。生徒が動詞で書いても名詞で書いても文になるよう2種類持つ。
  const CARD_FRAME_PREDICATE = ['のが印象に残りました。', 'ことも心に残っています。', 'という場面もありました。'];
  const CARD_FRAME_NOUN = ['が印象に残りました。', 'も心に残っています。', 'も印象的でした。'];

  // 気持ちの文の書き出し。カードが2枚3枚と続いても同じ形にならないようにする。
  const FEEL_LEAD = ['そのとき私は', 'その様子を見て、私は', 'このときも私は'];

  /** 動詞・形容詞で終わっているか（判定は questions.js に持たせている） */
  function isPredicate(t) {
    return global.QUESTIONS.isPredicate(t);
  }

  /**
   * 名詞で答えてほしい欄を、文の枠にはめる。
   * 述語で書かれていたら述語用の枠を使うので、どちらで書かれても文になる。
   */
  function fit(word, noun, pred) {
    return global.QUESTIONS.frame(word, noun, pred);
  }

  /**
   * 「〜たい」まで書かれているときは、意欲の言葉が二重にならない枠を使う。
   * （「仕事がしたいことを目指したい」を防ぐ）
   */
  function fitWish(word, noun, pred, wish) {
    if (wish && global.QUESTIONS.isWish(word)) {
      return wish.replace('{X}', global.QUESTIONS.plainWord(word));
    }
    return fit(word, noun, pred);
  }

  /**
   * 魅力カード1枚を、場面 → 気持ち → 自分とのつながり の3文にする。
   * 観察部分は生徒の言葉のまま使いたいので、語尾だけ常体にそろえてから枠にはめる。
   * （「話し合っていました」と書かれても「話し合っていたのが印象に残りました」になる）
   */
  function cardSentences(card, mode, base, idx) {
    const Q = global.QUESTIONS;
    const raw = bare(card.what);
    if (!raw) return [];

    const what = toPlainTone(raw);
    const frames = isPredicate(what) ? CARD_FRAME_PREDICATE : CARD_FRAME_NOUN;
    const lead = Q.whereLead(card.where, mode);
    const feel = Q.feelPhrase(card.feel);
    // ④は「〜と重なります」まで書く人と、体験の名前だけ書く人がいる
    const link = cardLink(card.link);

    // 場面・気持ち・つながりは1つのまとまりとして扱う。
    // 別々の文にすると、字数調整で場面だけが消えて「そのとき私は安心しました。」
    // だけが残る、という壊れ方をするため。
    const i = idx || 0;
    let text = lead + what + frames[i % frames.length];
    if (feel) text += FEEL_LEAD[i % FEEL_LEAD.length] + feel + '。';
    if (link) text += link;

    return [S(text, base)];
  }

  /** 入力画面のプレビューでも、生成とまったく同じ文になるようにする */
  function cardPreview(card, mode) {
    const sents = cardSentences(card || {}, mode, 1, 0);
    if (!sents.length) return '';
    return sents.map(function (s) { return s.text; }).join('');
  }

  // ── 生成の共通材料 ────────────────────────────────────
  // 生徒が答えるのは単語（名詞）だけ。ここから下の関数が、助詞と語尾をつけて文にする。
  function materials(d) {
    const mode = d.course === 'shushoku' ? 'shushoku' : 'shingaku';
    const Q = global.QUESTIONS;
    const L = lex(mode, d.orgType);
    const isJob = mode === 'shushoku';
    const name = bare(d.targetName) || L.honorific;
    const sub = bare(d.targetSub);
    const efforts = d.efforts || [];
    const chain = d.whyChain || {};

    // ★の多いカードほど前に、削られにくい優先度で使う
    const cards = (d.attractCards || [])
      .filter(function (c) { return c && bare(c.what); })
      .slice()
      .sort(function (a, b) { return (b.weight || 2) - (a.weight || 2); });

    const want = Q.wantPhrase(d.wantVerb, d.wantObject, mode)
      || (isJob ? 'この仕事に取り組みたい' : 'ここで学びたい');

    return {
      mode: mode,
      job: isJob,
      L: L,
      name: name,
      // 進学は「〇〇大学経済学部」、就職は「株式会社〇〇の製造職」とつなぐ
      nameFull: !sub ? name : (isJob ? name + 'の' + sub : name + sub),
      sub: sub,

      cards: cards,
      /** i 番目のカードの文を、指定した優先度で取り出す */
      cardSent: function (i, base) {
        return cards[i] ? cardSentences(cards[i], mode, base, i) : [];
      },

      efforts: efforts,
      effortTop: efforts[0] || '学校生活',
      effortWhen: bare(d.effortWhen),
      effortRole: bare(d.effortRole),
      effortAction: bare(d.effortAction),
      effortMade: d.effortActionKind === '自分が作ったもの・仕組み',
      effortResult: bare(d.effortResult),
      effortLearned: bare(d.effortLearned),

      strengths: d.strengths || [],
      personality: d.personality || [],
      licenses: bare(d.licenses),

      futureLine: Q.futureSentence(d.futureKind, d.futureDream),
      futureDream: bare(d.futureDream),
      whyLine: Q.whySourceSentence(d.futureWhySource, d.futureWhyWhat),
      gapNow: bare(d.gapNow),

      knewBy: bare(d.knewBy),
      visited: d.visited || [],
      attract: d.attractPoints || [],
      featureKind: bare(d.featureKind),
      featureName: bare(d.featureName),
      featureNamed: d.featureNamed !== '名前はなく、特徴を書いた',
      featureDetail: bare(d.featureDetail),
      studyWant: bare(d.studyWant),
      jobTask: bare(d.jobTask),
      policy: bare(d.targetPolicy),

      want: want,
      wantObject: bare(d.wantObject),
      // 深掘りの最も深い答えを「本当の動機」として使う
      deepReason: firstOf(chain.why3, chain.why2, chain.why1),
      midReason: firstOf(chain.why2, chain.why1),

      mustPoint: bare(d.mustPoint),
      after: d.afterEnter || [],
      afterAction: bare(d.afterAction),
      contributionFrom: bare(d.contributionFrom),
      contribution: bare(d.contribution),
      afterGradWhen: bare(d.afterGradWhen),
      afterGradIsSelf: d.afterGradKind === 'なっていたい自分の姿',
      afterGradWhat: bare(d.afterGradWhat)
    };
  }

  /** 文オブジェクト
   * p は優先度: 0=骨組み（絶対に消さない） 1=必須 2=推奨 3=余裕があれば
   * 書き出しと結びを 0 にしておくことで、どれだけ字数を削っても
   * 「文章として始まって終わる」状態が保たれる。
   */
  function S(text, p) {
    const t = String(text || '').trim();
    return t ? { text: t, p: p === 0 ? 0 : (p || 2) } : null;
  }

  // ══════════════════════════════════════════════════════
  //  単語 → 文
  //  生徒が書いた名詞を受け取り、助詞と語尾をつけて1文にする。
  // ══════════════════════════════════════════════════════

  /** 志望理由のひとこと */
  function sHead(m) {
    return '私が' + m.nameFull + 'を志望した理由は、' + m.want + 'からです。';
  }

  /**
   * なぜなぜ深掘りの答え。名詞止めでも文でも成り立つ形にする。
   * 「〜から」「〜ので」まで書く生徒が多いので、いったん外してから語尾をつけ直す。
   */
  function sDeep(m, lead) {
    const t = bare(m.deepReason).replace(/(からです|から|ので|ため)$/, '');
    return fit(t, lead + '{X}があるからです。', lead + '{X}からです。');
  }

  /** 志望先の特色。固有名詞をかぎかっこで囲んで示す */
  function sFeature(m) {
    if (!m.featureName) return '';
    const kind = m.featureKind || (m.job ? '取り組み' : '学び');
    const lead = '私が特に関心を持ったのは、' + m.name + 'の';
    // 固有名詞はかぎかっこで、特徴を書いた人は「という◯◯」で受ける
    return m.featureNamed
      ? lead + kind + '「' + m.featureName + '」です。'
      : fit(m.featureName, lead + '{X}という' + kind + 'です。');
  }

  function sFeatureDetail(m) {
    return fit(m.featureDetail,
      'そこでは{X}に関わることができると知りました。',
      'そこでは{X}ことを知りました。');
  }

  /** 進学＝学びたい科目 ／ 就職＝仕事の理解 */
  function sLearnOrTask(m) {
    if (m.job) {
      return fit(m.jobTask, '{X}を行う仕事だと理解しています。', '{X}という仕事だと理解しています。');
    }
    // 科目名はかぎかっこで囲むので、どう書かれても文が壊れない
    return m.studyWant ? '特に「' + m.studyWant + '」を学びたいと考えています。' : '';
  }

  function sPolicy(m) {
    return m.policy ? '「' + m.policy + '」という考え方にも共感しています。' : '';
  }

  function sEffortIntro(m) {
    // 前後の段落と「ました」が並びやすいので、ここは体言で受ける
    const lead = (m.effortWhen || '高校生活で') + '、いちばん力を入れてきたのは';
    return fit(m.effortTop, lead + '{X}です。', lead + '{X}ことです。')
      || lead + '学校生活です。';
  }

  function sEffortAction(m) {
    const lead = m.effortRole ? m.effortRole + 'として、' : 'その中で、';
    return m.effortMade
      ? fit(m.effortAction, lead + '{X}を作りました。', lead + '{X}ものを作りました。')
      : fit(m.effortAction, lead + '{X}に取り組みました。', lead + '{X}ことに力を注ぎました。');
  }

  function sEffortResult(m) {
    // ここを「〜ました」にすると語尾が4つ続いて単調になるため、体言で受ける
    return fit(m.effortResult,
      '{X}は、その中で生まれた成果です。',
      '{X}ことが、その中で生まれた成果です。');
  }

  function sEffortLearned(m) {
    return fit(m.effortLearned,
      'この経験から、{X}を学びました。',
      'この経験から、{X}ということを学びました。');
  }

  function sMust(m) {
    const lead = '同じような' + m.L.org + 'は他にもありますが、' + m.name + 'には';
    // 「という」で受けるので、名詞でも述語でも文になる
    return fit(m.mustPoint, lead + '{X}という違いがあります。');
  }

  function sAfter(m) {
    const lead = m.L.joinAfter + 'は、';
    return fit(joinNouns(m.after, 3),
      lead + '{X}に取り組みたいと考えています。',
      lead + '{X}ことに取り組みたいと考えています。');
  }

  function sAfterAction(m) {
    return fitWish(m.afterAction,
      'まずは{X}から始めたいです。',
      'まずは{X}ことから始めたいです。',
      'まずは{X}と思っています。');
  }

  function sContribution(m) {
    if (!m.job) return '';
    const lead = (m.contributionFrom || '高校生活') + 'で身につけた';
    return fit(m.contribution,
      lead + '{X}は、この仕事でも活かせると考えています。',
      lead + '「{X}」という姿勢は、この仕事でも活かせると考えています。');
  }

  /**
   * 魅力カードの④。
   * 「〜と重なります」まで文で書く人はその言葉を尊重し（本文はです・ます調で
   * 組み立てるので、ここだけは常体に直さない）、体験の名前だけの人には枠をつける。
   */
  function cardLink(text) {
    const t = bare(text);
    if (!t) return '';
    return global.QUESTIONS.isPredicate(t) ? flow(t) : t + 'と重なる部分があります。';
  }

  function sAfterGrad(m) {
    const lead = (m.afterGradWhen || (m.job ? '5年後' : '卒業後')) + (m.job ? 'には、' : 'は、');

    // 「なっていたい自分の姿」を選んだ人は、「◯◯を身につけていたい」では受けられない
    if (m.afterGradIsSelf) {
      return fitWish(m.afterGradWhat,
        lead + '{X}になっていたいです。',
        lead + '{X}ようになっていたいです。',
        lead + '{X}と考えています。');
    }
    return m.job
      ? fitWish(m.afterGradWhat,
        lead + '{X}を身につけていたいです。',
        lead + '{X}ようになっていたいです。',
        lead + '{X}と考えています。')
      : fitWish(m.afterGradWhat,
        lead + '{X}を目指したいと考えています。',
        lead + '{X}ことを目指したいと考えています。',
        lead + '{X}と考えています。');
  }

  /** 資格・検定。名前だけ答えてもらっているので、ここで文にする */
  function sLicenses(m) {
    return fit(m.licenses, 'また、{X}を取得しています。', 'また、「{X}」という資格を持っています。');
  }

  /**
   * 性格・得意なこと。
   * 「責任感が強い」のように述語で答える人と「国語」のように名詞で答える人がいるので、
   * かぎかっこで囲んで「という点」で受け、どちらでも文が壊れないようにする。
   */
  function sSelfTraits(m) {
    const traits = (m.personality || []).slice(0, 3);
    if (traits.length) {
      return '自分では' + traits.map(function (t) { return '「' + t + '」'; }).join('')
        + 'という点が持ち味だと思っています。';
    }
    const good = (m.strengths || []).slice(0, 3);
    if (!good.length) return '';
    const quoted = good.map(function (t) { return '「' + t + '」'; }).join('');
    return m.job ? '仕事で活かせそうな点は' + quoted + 'です。' : '得意なのは' + quoted + 'です。';
  }

  /**
   * 実際に足を運んだこと。
   * 「まだ行っていない」は文にしない。
   * 魅力カードの場面や、知ったきっかけと重なるものも、同じ話をくり返さないよう外す。
   */
  function sVisited(m) {
    const said = m.cards.map(function (c) { return bare(c.where); }).concat([m.knewBy]);
    const been = (m.visited || []).filter(function (v) {
      return String(v).indexOf('まだ') !== 0 && said.indexOf(v) === -1;
    });
    return fit(joinNouns(been, 2),
      '{X}にも参加し、自分の目で確かめました。',
      '{X}など、自分の目で確かめる機会も持ちました。');
  }

  /**
   * 自分の話から志望先の話へ渡る一文。
   * 段落が急に切り替わると読みにくいので、型ごとに橋を架ける。
   */
  function sBridge(m, kind) {
    if (kind === 'story') {
      // 「その他」を選んだ人は、きっかけの言葉を持っていない
      const by = m.knewBy && m.knewBy !== 'その他' ? m.knewBy : '';
      return by
        ? 'そんな私が' + m.nameFull + 'を知ったのは、' + by + 'がきっかけでした。'
        : 'そんな中で出会ったのが、' + m.nameFull + 'でした。';
    }
    if (kind === 'scene') {
      return 'あの場面が忘れられず、' + m.nameFull + 'について調べるようになりました。';
    }
    return '';
  }

  /** 魅力カードが1枚もないときだけ使う、分類チップからの代替文 */
  function sAttractFallback(m, lead) {
    if (m.cards.length) return '';
    return fit(joinNouns(m.attract, 3),
      lead + '{X}に魅力を感じました。',
      lead + '{X}という点に魅力を感じました。');
  }

  /** 配列に文を積む小道具（空文字は捨てる） */
  function push(list, text, p) {
    const s = S(text, p);
    if (s) list.push(s);
  }

  // ── テンプレート1: 結論先行型 ──────────────────────────
  function buildPrep(m) {
    const paras = [];

    const p1 = [];
    push(p1, sHead(m), 0);
    push(p1, sDeep(m, 'そう考えるようになったのは、'), 2);
    paras.push(p1);

    const p2 = [];
    push(p2, sFeature(m), 1);
    push(p2, sFeatureDetail(m), 2);
    push(p2, sLearnOrTask(m), 2);
    push(p2, sPolicy(m), 3);
    push(p2, sVisited(m), 3);
    paras.push(p2);

    // 魅力カード：自分が見てきた場面を、そのまま段落にする
    const p3 = [];
    m.cardSent(0, 0).forEach(function (s) { p3.push(s); });
    m.cardSent(1, 2).forEach(function (s) { p3.push(s); });
    m.cardSent(2, 3).forEach(function (s) { p3.push(s); });
    push(p3, sAttractFallback(m, '特に'), 2);
    paras.push(p3);

    const p4 = [];
    push(p4, sEffortIntro(m), 1);
    push(p4, sEffortAction(m), 2);
    push(p4, sEffortResult(m), 2);
    push(p4, sEffortLearned(m), 1);
    push(p4, sSelfTraits(m), 3);
    push(p4, sLicenses(m), 3);
    push(p4, sContribution(m), 1);
    paras.push(p4);

    const p5 = [];
    push(p5, sMust(m), 2);
    paras.push(p5);

    const p6 = [];
    push(p6, sAfter(m), 1);
    push(p6, sAfterAction(m), 2);
    push(p6, sAfterGrad(m), 3);
    paras.push(p6);

    paras.push([S('以上の理由から、私は' + m.nameFull + 'を志望します。', 0)]);
    return paras;
  }

  // ── テンプレート2: エピソード型 ────────────────────────
  function buildStory(m) {
    const paras = [];

    const p1 = [];
    push(p1, sEffortIntro(m), 0);
    push(p1, sEffortAction(m), 2);
    push(p1, sEffortResult(m), 2);
    push(p1, sEffortLearned(m), 1);
    push(p1, sSelfTraits(m), 3);
    push(p1, sLicenses(m), 3);
    paras.push(p1);

    const p2 = [];
    push(p2, sBridge(m, 'story'), 0);
    push(p2, m.L.metPhrase + 'と感じたことを、今でも覚えています。', 2);
    push(p2, sVisited(m), 3);
    m.cardSent(0, 0).forEach(function (s) { p2.push(s); });
    m.cardSent(1, 2).forEach(function (s) { p2.push(s); });
    push(p2, sAttractFallback(m, '中でも'), 2);
    paras.push(p2);

    const p3 = [];
    push(p3, sFeature(m), 1);
    push(p3, sLearnOrTask(m), 2);
    push(p3, sDeep(m, 'なぜなら、'), 2);
    push(p3, sMust(m), 2);
    push(p3, sPolicy(m), 3);
    paras.push(p3);

    const p4 = [];
    push(p4, sAfter(m), 1);
    push(p4, sAfterAction(m), 2);
    push(p4, sContribution(m), 1);
    push(p4, sAfterGrad(m), 3);
    paras.push(p4);

    paras.push([S('高校で身につけたことを土台に、' + m.name + 'でさらに成長したいと考え、志望しました。', 0)]);
    return paras;
  }

  // ── テンプレート3: 将来目標型 ──────────────────────────
  function buildFuture(m) {
    const paras = [];

    const p1 = [];
    push(p1, m.futureLine || '私は将来の進路について考える中で、進みたい方向が見えてきました。', 0);
    push(p1, m.whyLine, 2);
    paras.push(p1);

    const p2 = [];
    push(p2, 'その目標に近づくために、' + (m.job ? '働くうえでは' : '進学先では')
      + m.want + 'と考えました。', 1);
    push(p2, sDeep(m, 'そう考えたのは、'), 2);
    paras.push(p2);

    const p3 = [];
    push(p3, sFeature(m), 1);
    push(p3, sFeatureDetail(m), 3);
    push(p3, sLearnOrTask(m), 3);
    m.cardSent(0, 0).forEach(function (s) { p3.push(s); });
    m.cardSent(1, 3).forEach(function (s) { p3.push(s); });
    push(p3, sVisited(m), 3);
    push(p3, sMust(m), 2);
    paras.push(p3);

    const p4 = [];
    push(p4, sEffortIntro(m), 1);
    push(p4, sEffortAction(m), 3);
    push(p4, sEffortLearned(m), 2);
    push(p4, sLicenses(m), 3);
    push(p4, sContribution(m), 2);
    paras.push(p4);

    const p5 = [];
    push(p5, sAfter(m), 1);
    push(p5, sAfterAction(m), 2);
    push(p5, sAfterGrad(m), 2);
    paras.push(p5);

    paras.push([S('目標を実現できる環境がそろっていると考え、私は' + m.nameFull + 'を志望します。', 0)]);
    return paras;
  }

  // ── テンプレート4: 場面描写型 ──────────────────────────
  // 魅力カードの一番の場面から書き出し、読み手をその場に連れて行く。
  function buildScene(m) {
    const paras = [];

    const p1 = m.cardSent(0, 0);
    if (p1.length) push(p1, sBridge(m, 'scene'), 0);
    else push(p1, sHead(m), 0);
    paras.push(p1);

    const p2 = [];
    push(p2, m.cards.length
      ? '調べるほど、私は' + m.want + 'と考えるようになりました。'
      : sHead(m), 0);
    push(p2, sDeep(m, 'そう思うようになったのは、'), 2);
    push(p2, sFeature(m), 2);
    push(p2, sFeatureDetail(m), 3);
    push(p2, sVisited(m), 3);
    m.cardSent(1, 2).forEach(function (s) { p2.push(s); });
    m.cardSent(2, 3).forEach(function (s) { p2.push(s); });
    paras.push(p2);

    const p3 = [];
    push(p3, sEffortIntro(m), 1);
    push(p3, sEffortAction(m), 3);
    push(p3, sEffortLearned(m), 1);
    push(p3, sSelfTraits(m), 3);
    push(p3, sLicenses(m), 3);
    push(p3, sContribution(m), 1);
    paras.push(p3);

    const p4 = [];
    push(p4, sMust(m), 2);
    push(p4, sAfter(m), 1);
    push(p4, sAfterAction(m), 2);
    push(p4, sAfterGrad(m), 3);
    paras.push(p4);

    paras.push([S('あの日に感じた気持ちを大切に、' + m.nameFull + 'を志望します。', 0)]);
    return paras;
  }

  // ── テンプレート5: 成長課題型 ──────────────────────────
  // 「今の自分に足りないこと」を出発点にする。背伸びせずに意欲を示せる。
  function buildGap(m) {
    const paras = [];

    const p1 = [];
    push(p1, fit(m.gapNow,
      '私には今、{X}が足りないと感じています。',
      '私には今、{X}ところがあると感じています。')
      || '私には、高校生活の中で「もっとこうなりたい」と感じるようになったことがあります。', 0);
    push(p1, 'その気持ちが、' + m.nameFull + 'を志望するきっかけになりました。', 0);
    paras.push(p1);

    const p2 = [];
    push(p2, sEffortIntro(m), 1);
    push(p2, sEffortAction(m), 2);
    push(p2, sEffortResult(m), 3);
    push(p2, sEffortLearned(m), 1);
    push(p2, sSelfTraits(m), 3);
    push(p2, sLicenses(m), 3);
    push(p2, '同時に、自分にはまだ足りない部分もあります。', 2);
    paras.push(p2);

    const p3 = [];
    push(p3, 'そこで、' + m.want + 'と考えるようになりました。', 1);
    push(p3, sFeature(m), 1);
    push(p3, sLearnOrTask(m), 3);
    m.cardSent(0, 0).forEach(function (s) { p3.push(s); });
    m.cardSent(1, 3).forEach(function (s) { p3.push(s); });
    push(p3, sVisited(m), 3);
    push(p3, sMust(m), 2);
    paras.push(p3);

    const p4 = [];
    push(p4, sAfter(m), 1);
    push(p4, sAfterAction(m), 1);
    push(p4, sContribution(m), 2);
    push(p4, sAfterGrad(m), 2);
    paras.push(p4);

    paras.push([S('今の自分を変えたいという気持ちを持って、' + m.nameFull + 'を志望します。', 0)]);
    return paras;
  }

  // ── テンプレート6: 三つの理由型 ────────────────────────
  // 面接で「志望動機を教えてください」と聞かれたとき、そのまま話せる形。
  function buildThree(m) {
    const paras = [];

    paras.push([S('私が' + m.nameFull + 'を志望する理由は、大きく三つあります。', 0)]);

    const p2 = [];
    push(p2, '一つ目は、' + m.want + 'からです。', 0);
    push(p2, sDeep(m, 'そう考えるようになったのは、'), 2);
    push(p2, sFeature(m), 1);
    push(p2, sLearnOrTask(m), 2);
    push(p2, sFeatureDetail(m), 3);
    paras.push(p2);

    const p3 = [];
    push(p3, '二つ目は、実際に自分の目で見て感じたことがあるからです。', 0);
    m.cardSent(0, 0).forEach(function (s) { p3.push(s); });
    m.cardSent(1, 2).forEach(function (s) { p3.push(s); });
    push(p3, sAttractFallback(m, '特に'), 2);
    push(p3, sVisited(m), 3);
    push(p3, sPolicy(m), 3);
    paras.push(p3);

    const p4 = [];
    push(p4, '三つ目は、私自身の経験とつながっているからです。', 0);
    push(p4, sEffortIntro(m), 1);
    push(p4, sEffortAction(m), 3);
    push(p4, sEffortResult(m), 3);
    push(p4, sEffortLearned(m), 1);
    push(p4, sSelfTraits(m), 3);
    push(p4, sLicenses(m), 3);
    push(p4, sContribution(m), 1);
    paras.push(p4);

    const p5 = [];
    push(p5, sMust(m), 2);
    push(p5, sAfter(m), 1);
    push(p5, sAfterAction(m), 2);
    push(p5, sAfterGrad(m), 3);
    paras.push(p5);

    paras.push([S('以上の三つの理由から、私は' + m.nameFull + 'を志望します。', 0)]);
    return paras;
  }

  // ══════════════════════════════════════════════════════
  //  仕上げ：組み上がった文章を、読みやすい日本語に整える
  // ══════════════════════════════════════════════════════

  /**
   * 2回目以降の志望先名を「貴校」「貴社」に置きかえる。
   *
   * 実際の志望理由書では、学校名を何度も繰り返さず敬称で受けるのがふつう。
   * ただし最初の1回と、結びの段落は正式名称のままにする。
   * （読み手が「どこの話か」を見失わないため。自動チェックの志望先名も残る）
   */
  function useHonorific(text, m) {
    if (!m.name || m.name === m.L.honorific) return text;

    const paras = text.split('\n\n');
    const last = paras.length - 1;
    let seen = false;

    const swapped = paras.map(function (para, i) {
      if (i === last) return para; // 結びは正式名称のまま
      return para.replace(/[^。]*。/g, function (sent) {
        return sent.replace(new RegExp(escapeRe(m.nameFull) + '|' + escapeRe(m.name), 'g'), function (hit) {
          if (!seen) { seen = true; return hit; } // 最初の1回はそのまま
          return m.L.honorific;
        });
      });
    });
    return swapped.join('\n\n');
  }

  function escapeRe(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 同じ語尾が続いたら、意味の変わらない別の言い方に替える。
   *
   * 名詞から文を組み立てる以上、「〜と考えています。」が並びやすい。
   * 長くなる置きかえは字数を押し出すので、目標字数を超えない場合だけ使う。
   */
  const ENDING_VARIANTS = [
    { key: 'たいと考えています。', alts: ['たいと思っています。', 'たいです。'] },
    { key: 'と考えています。', alts: ['と思っています。', 'と考えました。'] },
    { key: 'と考えました。', alts: ['と思いました。'] },
    { key: 'と思いました。', alts: ['と感じました。'] },
    { key: 'に残りました。', alts: ['に残っています。'] },
    { key: 'があります。', alts: ['がありました。'] }
  ];

  function endingOf(sentence) {
    for (let i = 0; i < ENDING_VARIANTS.length; i++) {
      if (sentence.slice(-ENDING_VARIANTS[i].key.length) === ENDING_VARIANTS[i].key) {
        return ENDING_VARIANTS[i];
      }
    }
    return null;
  }

  function varyEndings(text, target) {
    return text.split('\n\n').map(function (para) {
      const sents = para.match(/[^。]*。/g);
      if (!sents) return para;

      let prev = '';
      const out = sents.map(function (sent) {
        const v = endingOf(sent);
        const key = v ? v.key : sent.slice(-5);
        if (key !== prev) { prev = key; return sent; }

        // 直前と同じ語尾。長さが増えない言いかえがあれば使う
        if (v) {
          const alt = v.alts.find(function (a) { return a.length <= v.key.length; }) || v.alts[0];
          if (alt) {
            const fixed = sent.slice(0, sent.length - v.key.length) + alt;
            if (countChars(fixed) <= countChars(sent) || countChars(text) < target) {
              prev = alt;
              return fixed;
            }
          }
        }
        prev = key;
        return sent;
      });
      return out.join('');
    }).join('\n\n');
  }

  // ── 字数調整 ─────────────────────────────────────────
  function render(paras) {
    return paras
      .map(function (p) { return p.filter(Boolean).map(function (s) { return s.text; }).join(''); })
      .filter(Boolean)
      .join('\n\n');
  }

  function countChars(text) {
    // 改行と空白は字数に数えない（原稿用紙換算に近づける）
    return String(text || '').replace(/[\s　]/g, '').length;
  }

  /** 目標字数を超えていたら、優先度の低い文から削る */
  function fitToLength(paras, target) {
    const work = paras.map(function (p) { return p.filter(Boolean).slice(); });
    // 字数制限は超えないことが最優先なので、目標字数そのものを上限にする
    const limit = target;

    // 優先度3（あれば良い）→2（推奨）→1（必須）の順に削る。優先度0は残す。
    // 同じ優先度の中では「削れば上限内に収まる中で最も短い文」を選び、削りすぎを防ぐ。
    let guard = 0;
    while (countChars(render(work)) > limit && guard++ < 60) {
      const total = countChars(render(work));
      const need = total - limit;
      let picked = null;

      for (let priority = 3; priority >= 1 && !picked; priority--) {
        const cands = [];
        work.forEach(function (para, i) {
          para.forEach(function (s, k) {
            if (s.p === priority) cands.push({ i: i, k: k, len: countChars(s.text) });
          });
        });
        if (!cands.length) continue;

        const enough = cands.filter(function (c) { return c.len >= need; })
          .sort(function (a, b) { return a.len - b.len; });
        picked = enough[0] || cands.sort(function (a, b) { return b.len - a.len; })[0];
      }

      if (!picked) break; // これ以上削れる文がない
      work[picked.i].splice(picked.k, 1);
    }
    return work;
  }

  // ── 公開API ─────────────────────────────────────────
  /**
   * @param {Object} data     全回答（フラットなキー値）
   * @param {String} templateId
   * @returns {{text:string, chars:number, target:number, ratio:number, note:string}}
   */
  function generate(data, templateId) {
    const tpl = TEMPLATES.find(function (t) { return t.id === templateId; }) || TEMPLATES[0];
    const m = materials(data);
    const target = Number(data.targetChars) || 400;

    let paras = tpl.build(m);
    paras = fitToLength(paras, target);

    let text = render(paras);
    text = useHonorific(text, m);
    text = varyEndings(text, target);
    if (data.tone === 'だ・である調') text = toPlainTone(text);

    const chars = countChars(text);
    const ratio = target ? chars / target : 0;

    let note;
    if (chars > target) {
      note = '素材が多いため、目標より' + (chars - target) + '字オーバーしています。重複した説明を削ってください。';
    } else if (ratio < 0.9) {
      note = 'あと' + (Math.floor(target * 0.9) - chars) + '字ほど足りません。STEP 2〜4に戻って具体的なエピソードを増やしましょう。';
    } else {
      note = '目標の' + target + '字にきれいに収まりました。';
    }

    return { text: text, chars: chars, target: target, ratio: ratio, note: note };
  }

  // ── 使われていない材料の検出 ───────────────────────────
  /** 本文に入っているかを、先頭の数文字で照合する */
  function usedIn(body, text, len) {
    const key = String(text || '').replace(/[\s　]/g, '').slice(0, len || 10);
    if (!key) return true;
    return body.replace(/[\s　]/g, '').indexOf(key) !== -1;
  }

  /**
   * 集めた材料のうち、本文に入っていないものを返す。
   * 字数調整で自動的に削られたものに、生徒自身が気づけるようにするための機能。
   */
  function unusedMaterials(d, body) {
    const job = d.course === 'shushoku';
    const text = String(body || '');
    const items = [];

    (d.attractCards || []).forEach(function (c, i) {
      if (c && bare(c.what)) items.push({ label: '魅力カード' + (i + 1), text: c.what });
    });

    [
      ['取り組んだこと', d.effortAction],
      ['その結果', d.effortResult],
      ['そこから学んだこと', d.effortLearned],
      ['将来の目標のきっかけ', d.futureWhyWhat],
      ['今の自分に足りない力', d.gapNow],
      ['志望先の特色（名前）', d.featureName],
      ['そこでできること', d.featureDetail],
      [job ? '仕事の理解' : '受けたい授業', job ? d.jobTask : d.studyWant],
      ['ここでなければの違い', d.mustPoint],
      [job ? '活かせる力' : null, job ? d.contribution : null],
      ['まず始めること', d.afterAction],
      [job ? '将来の姿' : '卒業後の目標', d.afterGradWhat],
      ['共感した理念', d.targetPolicy],
      ['資格・免許', d.licenses]
    ].forEach(function (row) {
      if (row[0] && bare(row[1])) items.push({ label: row[0], text: row[1] });
    });

    return items.filter(function (it) { return !usedIn(text, it.text, 10); })
      .map(function (it) { return it.label; });
  }

  global.COMPOSE = {
    TEMPLATES: TEMPLATES,
    generate: generate,
    cardPreview: cardPreview,
    unusedMaterials: unusedMaterials,
    countChars: countChars,
    toPlainTone: toPlainTone
  };
})(window);
