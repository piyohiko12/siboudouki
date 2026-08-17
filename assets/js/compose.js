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
    [/ありません/g, 'ない'], [/できません/g, 'できない'], [/いません/g, 'いない'],
    // 「準備をします」のように、直前が漢語でない「します」も「する」に直す
    // （一般則だと「し＋ます」を五段活用と見て「す」になってしまう）
    [/しました/g, 'した'], [/します/g, 'する']
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
      name: '挑戦意欲型',
      summary: '「入ってから挑戦したいこと」から入る型。これからの意欲をまっすぐ示せる。',
      order: function (job) {
        return job ? '挑戦したいこと → だから志望 → ここならできる → 経験 → 将来像'
          : '挑戦したいこと → だから志望 → ここなら学べる → 経験 → 卒業後';
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
  function cardSentences(card, mode, base, idx, offset) {
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
    // 開始位置を生徒ごとにずらすので、1枚目の枠も人によって変わる
    const i = (idx || 0) + (offset || 0);
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

  /**
   * いまの型で聞いていない欄の答えを、本文づくりから外す。
   *
   * 型を変える前に答えた内容はデータに残る。それをそのまま使うと、
   * 「聞かれていないのに文章に出てくる」「答えていない内容で重複判定される」
   * といったことが起きる。型を変えた時点で、その型の設問だけに絞る。
   */
  let ALL_FIELD_IDS = null;

  function allFieldIds(mode) {
    if (ALL_FIELD_IDS) return ALL_FIELD_IDS;
    const ids = {};
    TEMPLATES.forEach(function (t) {
      global.QUESTIONS.buildSteps(mode, t.id).forEach(function (s) {
        s.fields.forEach(function (f) { ids[f.id] = true; });
      });
    });
    ALL_FIELD_IDS = Object.keys(ids);
    return ALL_FIELD_IDS;
  }

  function scopeToTemplate(d, templateId) {
    const mode = d.course === 'shushoku' ? 'shushoku' : 'shingaku';
    const asked = {};
    global.QUESTIONS.buildSteps(mode, templateId, d).forEach(function (s) {
      s.fields.forEach(function (f) { asked[f.id] = true; });
    });

    const out = Object.assign({}, d);
    allFieldIds(mode).forEach(function (id) { if (!asked[id]) delete out[id]; });
    return out;
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
      cardOffset: 0, // generate() で生徒ごとの値に差し替える
      /** i 番目のカードの文を、指定した優先度で取り出す */
      cardSent: function (i, base) {
        return cards[i] ? cardSentences(cards[i], mode, base, i, this.cardOffset) : [];
      },

      studentName: bare(d.studentName),
      efforts: efforts,
      // 「部活動」ではなく「吹奏楽部での活動」のように、答えた名前で呼ぶ
      effortTop: Q.effortTopWord(d) || efforts[0] || '学校生活',
      // 生徒がわざわざ書いた具体は、一般論より先に本文へ入れる。
      // （0=骨組み 1=必須 2=推奨 3=余裕があれば）
      pTraits: (bare(d.personalityScene) || bare(d.personalityEpisode)) ? 2 : 3,
      pStrengths: (bare(d.strengthScene) || bare(d.strengthEpisode)) ? 2 : 3,
      strengthEpisode: bare(d.strengthEpisode),
      strengthScene: bare(d.strengthScene),
      effortWhen: bare(d.effortWhen),
      effortRole: bare(d.effortRole),
      effortAction: bare(d.effortAction),
      effortMade: d.effortActionKind === '自分が作ったもの・仕組み',
      effortResult: bare(d.effortResult),
      effortHard: bare(d.effortHard),
      effortHow: bare(d.effortHow),
      effortLearned: bare(d.effortLearned),
      effortUseLine: Q.effortUseLine(d),

      // 得意なこと・性格は、設問側と同じ関数で文にする（プレビューとずれないように）
      traitLine: Q.traitSentence(d, isJob),
      traitScene: (d.personality || []).length && bare(d.personalityEpisode) && bare(d.personalityScene)
        ? 'この強みは、' + Q.sceneAt(d.personalityScene)
        : '',
      strengthLine: Q.strengthSentence(d, isJob),
      strengthScene2: (d.strengths || []).length && bare(d.strengthEpisode) && bare(d.strengthScene)
        ? 'この力は、' + Q.sceneAt(d.strengthScene)
        : '',
      hasPersonality: (d.personality || []).length > 0,
      licenses: bare(d.licenses),

      futureLine: Q.futureSentence(d.futureKind, d.futureDream),
      futureDream: bare(d.futureDream),
      whyLine: Q.whySourceSentence(d.futureWhySource, d.futureWhyWhat),
      gapNow: bare(d.gapNow),

      knewBy: bare(d.knewBy),
      knewBySource: Q.knewBySource(d),
      subReasonLine: Q.subReasonSentence(d, mode),
      attract: d.attractPoints || [],
      featureKind: bare(d.featureKind),
      featureName: bare(d.featureName),
      featureDetail: bare(d.featureDetail),
      featureSource: bare(d.featureSource),
      studyWant: bare(d.studyWant),
      jobTask: bare(d.jobTask),
      policy: bare(d.targetPolicy),

      want: want,
      wantObject: bare(d.wantObject),
      // 深掘りの最も深い答えを「本当の動機」として使う
      deepReason: firstOf(chain.why3, chain.why2, chain.why1),
      midReason: firstOf(chain.why2, chain.why1),

      valueFound: bare(d.valueFound),
      mustPoint: bare(d.mustPoint),
      after: d.afterEnter || [],
      afterAction: bare(d.afterAction),
      contributionFrom: bare(d.contributionFrom),
      contribution: bare(d.contribution),
      afterGradWhen: bare(d.afterGradWhen),
      afterGradIsSelf: d.afterGradKind === 'なっていたい自分の姿',
      afterGradWhat: bare(d.afterGradWhat),
      dailyImage: bare(d.dailyImage),
      contributeTo: bare(d.contributeTo)
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

  // ══════════════════════════════════════════════════════
  //  言い回しのばらつき
  //
  //  アプリが供給する定型句が全員同じだと、同じ回答をした2人の文章が
  //  1文もちがわない、という状態になる。それではこのアプリの意味がない。
  //  そこで、意味の変わらない言い回しを複数持ち、生徒ごとに選び分ける。
  //  乱数ではなく回答から作った数で選ぶので、同じ生徒なら毎回同じ文になる。
  // ══════════════════════════════════════════════════════
  function hashOf(str) {
    // FNV-1a。「seed + salt」方式だと、2人の差が6の倍数のときに
    // すべての箇所で同じ選択になってしまうので、箇所ごとに独立に計算する。
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  /** salt を変えると、同じ生徒でも別の箇所では独立に選ばれる */
  function variant(m, list, salt) {
    const src = (m.studentName || '') + '|' + (m.name || '') + '|' + (m.wantObject || '')
      + '#' + (salt || 0);
    return list[hashOf(src) % list.length];
  }

  /** 志望理由のひとこと */
  function sHead(m) {
    return variant(m, [
      '私が' + m.nameFull + 'を志望した理由は、' + m.want + 'からです。',
      '私が' + m.nameFull + 'を志望するのは、' + m.want + 'からです。',
      m.want + 'と考えています。これが、私が' + m.nameFull + 'を志望した理由です。'
    ], 1);
  }

  /**
   * なぜなぜ深掘りの答え。名詞止めでも文でも成り立つ形にする。
   * 「〜から」「〜ので」まで書く生徒が多いので、いったん外してから語尾をつけ直す。
   */
  const DEEP_LEAD = {
    think: ['そう考えるようになったのは、', 'そう思うようになったのは、', 'この考えに至ったのは、'],
    why: ['なぜなら、', 'その理由は、', 'というのも、'],
    felt: ['そう思うようになったのは、', 'この気持ちの根にあるのは、', 'そう感じるようになったのは、'],
    decided: ['そう考えたのは、', 'そう判断したのは、', 'そこまで思うようになったのは、']
  };

  function sDeep(m, kind) {
    const lead = variant(m, DEEP_LEAD[kind] || DEEP_LEAD.think, 9);
    const t = bare(m.deepReason).replace(/(からです|から|ので|ため)$/, '');
    return fit(t, lead + '{X}があるからです。', lead + '{X}からです。');
  }

  /** 志望先の特色。固有名詞をかぎかっこで囲んで示す */
  /**
   * 「〜に魅力を感じた」「〜がよかった」のような感想の語尾を落とす。
   * 名前を聞いている欄に感想を書く生徒がいるため、枠にはめる前に整える。
   */
  const IMPRESSION_END =
    /(に魅力を感じた|に興味を持った|に関心を持った|にひかれた|に惹かれた|がよかった|が良かった|が印象に残った|と思った|と感じた|がすごかった)$/;

  function trimImpression(text) {
    return bare(text).replace(IMPRESSION_END, '');
  }

  function sFeature(m) {
    const name = trimImpression(m.featureName);
    if (!name) return '';
    const kind = m.featureKind || (m.job ? '取り組み' : '学び');
    const lead = variant(m, [
      '私が特に関心を持ったのは、',
      '中でも強く心を引かれたのは、',
      'とりわけ関心を持ったのは、'
    ], 2) + m.name + 'の';

    // 形は1つだけ。「少人数で進める」のような述語だけ、名詞の形に受け直す
    return lead + kind + 'の' + global.QUESTIONS.featureWord(name) + 'です。';
  }

  /**
   * 「それを、なぜ魅力に感じましたか」。
   * 「〜だから」と理由で書く人、「〜できること」と名詞で書く人がいるので分ける。
   * すぐ前の文が「強く心を引かれたのは〜です」なので、ここは別の言い方で受ける。
   */
  function sFeatureDetail(m) {
    const t = bare(m.featureDetail);
    if (!t) return '';
    if (/(こと|点|ところ)$/.test(t)) {
      // 「〜点こそ…心を動かされた点です」と同じ言葉が並ばないようにする
      const tails = ['に、大きな魅力を感じています。', 'は、ほかにはない魅力だと感じました。']
        .concat(/点$/.test(t) ? [] : ['こそ、私が調べていて心を動かされた点です。']);
      return t + variant(m, tails, 27);
    }
    const plain = bare(global.QUESTIONS.plainWord(t))
      .replace(/(ので|ため)$/, 'から')
      .replace(/から$/, '');
    if (!plain) return '';
    if (global.QUESTIONS.isPredicate(plain)) {
      return variant(m, [
        '魅力に感じたのは、{X}からです。',
        '{X}という点に、大きな魅力を感じました。',
        'そこにひかれたのは、{X}からです。'
      ], 10).replace('{X}', plain);
    }
    return plain + variant(m, [
      'という点に、大きな魅力を感じています。',
      'という点が、いちばんの魅力だと感じました。'
    ], 28);
  }

  /** 進学＝学びたい科目 ／ 就職＝仕事の理解 */
  function sLearnOrTask(m) {
    if (m.job) {
      return fit(m.jobTask, '{X}を行う仕事だと理解しています。', '{X}という仕事だと理解しています。');
    }
    // 科目名はかぎかっこで囲むので、どう書かれても文が壊れない
    if (!m.studyWant) return '';
    return variant(m, [
      '特に「' + m.studyWant + '」を学びたいと考えています。',
      // 「中でも」は特色の文でも使うので、ここでは重ならない言い方にする
      '「' + m.studyWant + '」は、いちばん受けてみたい授業です。',
      'とりわけ「' + m.studyWant + '」に強い関心があります。'
    ], 11);
  }

  function sPolicy(m) {
    if (!m.policy) return '';
    return variant(m, [
      '「' + m.policy + '」という考え方にも共感しています。',
      '「' + m.policy + '」という言葉にも、強く共感しました。',
      '「' + m.policy + '」という姿勢にも心を動かされました。'
    ], 12);
  }

  function sEffortIntro(m) {
    // 前後の段落と「ました」が並びやすいので、ここは体言で受ける
    const lead = (m.effortWhen || '高校生活で') + '、' + variant(m, [
      'いちばん力を入れてきたのは',
      '私がもっとも打ち込んだのは',
      'いちばん時間をかけてきたのは'
    ], 4);
    return fit(m.effortTop, lead + '{X}です。', lead + '{X}ことです。')
      || lead + '学校生活です。';
  }

  /** 「デザイン作成」のように、それ自体が「作る」を含む言葉 */
  const MAKE_END = /(作成|制作|製作|作り|づくり|づくり|設計)$/;

  function sEffortAction(m) {
    const lead = m.effortRole ? m.effortRole + 'として、'
      // 「取り組む中で、〜に取り組みました」と重ならない言い回しにしておく
      : variant(m, ['その中で、', 'その活動では、', '日々の活動の中で、'], 7);

    if (!m.effortMade) {
      return fit(m.effortAction, lead + '{X}に取り組みました。', lead + '{X}ことに力を注ぎました。');
    }
    // 「デザイン作成を作りました」にならないよう、受け方を変える
    return MAKE_END.test(bare(m.effortAction))
      ? fit(m.effortAction, lead + '{X}を担当しました。', lead + '{X}ことを担当しました。')
      : fit(m.effortAction, lead + '{X}を作りました。', lead + '{X}ものを作りました。');
  }

  function sEffortResult(m) {
    // 直前の文がすでに「その中で」を使うので、ここでは繰り返さない。
    // また「〜ました」を続けると語尾が4つ並ぶため、体言で受ける形も混ぜる。
    const pair = variant(m, [
      ['{X}は、そこで生まれた成果です。', '{X}ことが、そこで生まれた成果です。'],
      ['{X}という結果につながりました。', '{X}という結果につながりました。'],
      ['{X}が、目に見える形での成果です。', '{X}ことが、目に見える形での成果です。']
    ], 8);
    return fit(m.effortResult, pair[0], pair[1]);
  }

  /** いちばん大変だったこと。ここがあると、次の「乗り越え方」が活きる */
  function sEffortHard(m) {
    return fit(m.effortHard, 'いちばん大変だったのは{X}です。', '{X}ことが、いちばん大変でした。');
  }

  /** どう乗り越えたか。困ったときにどう動く人かが、いちばん伝わる部分 */
  function sEffortHow(m) {
    if (!m.effortHard) return '';
    return fit(m.effortHow,
      'それでも{X}によって、続けることができました。',
      'それでも{X}ことで、続けることができました。');
  }

  /** 心が動いた場面と自分の経験に共通するもの。志望理由の芯になる */
  function sValue(m) {
    return fit(m.valueFound,
      'そこから私は、{X}を大切にするようになりました。',
      'そこから私は、{X}ことを大切にするようになりました。');
  }

  /** 特色をどこで知ったか。調べた事実をはっきりさせる */
  function sFeatureSource(m) {
    if (!m.featureName || !m.featureSource) return '';
    // 「知ったきっかけ」の文と「知りました」が並ばないよう、受け方を分ける
    if (m.knewBy) {
      return variant(m, [
        'このことは、' + m.featureSource + 'で確かめました。',
        m.featureSource + 'を読んで、この点を確かめました。'
      ], 30);
    }
    return 'このことは、' + m.featureSource + 'で知りました。';
  }

  /** 入ったあとの一場面。具体的な絵が浮かぶほど、本気度が伝わる */
  function sDailyImage(m) {
    return fit(m.dailyImage, '{X}を思い描いています。', '{X}自分を思い描いています。');
  }

  /** いずれは誰の役に立ちたいか。文章の締めに芯を通す */
  function sContributeTo(m) {
    return fit(m.contributeTo,
      'いずれは{X}の役に立てる人になりたいと考えています。',
      'いずれは{X}人になりたいと考えています。');
  }



  function sEffortLearned(m) {
    const lead = variant(m, ['この経験から、', 'この取り組みを通して、', 'ここから私は、'], 5);
    return fit(m.effortLearned, lead + '{X}を学びました。', lead + '{X}ということを学びました。');
  }

  /** 学んだことを、志望先の場面につなぐ。設問側のプレビューと同じ関数を使う */
  function sEffortUse(m) {
    return m.effortUseLine;
  }

  /** 「◯◯という点」の◯◯がすでに「点」で終わっていないか（「点という点」を防ぐ） */
  const NOUN_TAIL = /(点|ところ|こと|違い|ちがい)$/;

  function sMust(m) {
    const dup = NOUN_TAIL.test(bare(m.mustPoint));
    // どの枠も「という」で受けるので、名詞でも述語でも文になる。
    // 答えがすでに「〜点」で終わっていたら、「という点」は重ねない。
    return fit(m.mustPoint, variant(m, [
      '同じような' + m.L.org + 'は他にもありますが、' + m.name + 'には{X}'
        + (dup ? 'があります。' : 'という違いがあります。'),
      'ほかにも' + m.L.org + 'はありますが、' + m.name + 'にしかない{X}'
        + (dup ? 'にひかれました。' : 'という点にひかれました。'),
      '私が' + m.name + 'でなければならないと考えるのは、{X}'
        + (dup ? 'があるからです。' : 'という点があるからです。')
    ], 3));
  }

  function sAfter(m) {
    const lead = m.L.joinAfter + 'は、';
    const tail = variant(m, [
      'に取り組みたいと考えています。',
      'に力を入れたいと考えています。',
      'にしっかり取り組んでいきたいです。'
    ], 6);
    return fit(joinNouns(m.after, 3),
      lead + '{X}' + tail,
      lead + '{X}こと' + tail);
  }

  function sAfterAction(m) {
    const lead = variant(m, ['まずは', 'はじめの一歩として、', 'そのために、まずは'], 13);
    return fitWish(m.afterAction,
      lead + '{X}から始めたいです。',
      lead + '{X}ことから始めたいです。',
      lead + '{X}と思っています。');
  }

  function sContribution(m) {
    const from = m.contributionFrom || '高校生活';
    const lead = from + variant(m, ['で身につけた', 'で培った', 'を通して身につけた'], 14);
    const tail = m.job ? 'この仕事でも活かせると考えています。' : 'ここでの学びにも活かせると考えています。';
    // 「〜したい」まで書かれたら、そのまま意欲の文として受ける
    return fitWish(m.contribution,
      lead + '{X}は、' + tail,
      lead + '「{X}」という姿勢は、' + tail,
      from + 'で得たものを持って、{X}と考えています。');
  }

  /**
   * 魅力カードの④「そこに心をひかれたのは、なぜですか」。
   * 「〜だから」と理由の形で書く人、「〜した」と出来事だけ書く人、
   * 「部活動での経験」と名詞で書く人がいるので、どれも同じ枠で受ける。
   */
  function cardLink(text) {
    const t = bare(text);
    if (!t) return '';
    // すでに「です・ます」で書いてあれば、その言葉をそのまま尊重する
    if (/(です|ます|ました|ません|でした)$/.test(t)) return flow(t);

    const lead = 'そう感じたのは、';
    // 「〜ので」「〜ため」は「〜から」にそろえてから、末尾を落とす
    const plain = global.QUESTIONS.plainWord(t)
      .replace(/(ので|ため)$/, 'から')
      .replace(/から$/, '');
    if (!plain) return '';
    if (global.QUESTIONS.isPredicate(plain)) return lead + plain + 'からです。';
    // 「大切さ」「難しさ」のような言葉は「〜がある」では受けられない
    if (/(さ|点)$/.test(plain)) return lead + plain + 'を知っているからです。';
    return lead + plain + 'があるからです。';
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
  /**
   * 性格。きっかけの出来事まで答えた人は、そこから書き出す。
   * 「まじめです」だけの文は誰にでも書けてしまうため。
   */
  function sSelfTraits(m) {
    return m.traitLine;
  }

  /** その性格が働く場面。きっかけを別の文にしたときだけ、ここで受ける */
  function sSelfTraitsScene(m) {
    if (!m.traitScene) return '';
    return m.traitScene
      + variant(m, ['活かせると思います。', '力になれると思います。', '役に立てると考えています。'], 23);
  }

  /**
   * 得意なこと。
   * 性格の文がすでにあるときは、きっかけか場面まで答えている場合だけ足す。
   * 「強みの言いっぱなし」が2文続くのを避けるため。
   */
  function sStrengths(m) {
    if (!m.strengthLine) return '';
    // 性格を答えている人の「得意なのは〇〇です」だけの文は、情報が薄いので落とす
    if (m.hasPersonality && !m.strengthScene2
      && !global.QUESTIONS.sceneAt(m.strengthScene) && !bare(m.strengthEpisode)) return '';
    return m.strengthLine;
  }

  /** その得意なことが働く場面 */
  function sStrengthsScene(m) {
    if (!m.strengthScene2) return '';
    return m.strengthScene2
      + variant(m, ['活かせると考えています。', '役に立つと思います。', '活かしていきたいです。'], 24);
  }

  /**
   * その職種／学科を選んだ理由。
   * 会社を選んだ理由とは別の軸なので、特色の文とは離して置く。
   */
  function sSubReason(m) {
    return m.subReasonLine;
  }

  /**
   * その志望先を知ったきっかけ。
   * エピソード型は sBridge が同じことを言うので、そちらに任せる。
   */
  function sKnewBy(m, kind) {
    if (kind === 'story') return '';
    const by = m.knewBySource;
    if (!by) return '';
    return variant(m, [
      m.nameFull + 'を知ったのは、' + by + 'がきっかけでした。',
      by + 'で' + m.nameFull + 'を知りました。',
      m.nameFull + 'のことは、' + by + 'で知りました。'
    ], 29);
  }

  /**
   * 自分の話から志望先の話へ渡る一文。
   * 段落が急に切り替わると読みにくいので、型ごとに橋を架ける。
   */
  function sBridge(m, kind) {
    if (kind === 'story') {
      const by = m.knewBySource;
      return by
        ? 'そんな私が' + m.nameFull + 'を知ったのは、' + by + 'がきっかけでした。'
        : 'そんな中で出会ったのが、' + m.nameFull + 'でした。';
    }
    if (kind === 'scene') {
      return 'あの場面が忘れられず、' + m.nameFull + 'について調べるようになりました。';
    }
    return '';
  }

  /**
   * 魅力の分類チップ。
   * カードがあるときは「ほかにも見ていた点」として添え、
   * カードが1枚もないときだけ、魅力そのものを述べる文に使う。
   * 「魅力を感じました」は使い回し表現の判定に引っかかるので避ける。
   */
  function sAttract(m, lead) {
    const list = joinNouns(m.attract, 3);
    if (!list) return '';
    return m.cards.length
      ? fit(list, '{X}といった点にも、特に注目しました。', '{X}という点にも、特に注目しました。')
      : fit(list, lead + '{X}に心を引かれました。', lead + '{X}という点に心を引かれました。');
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
    push(p1, sDeep(m, 'think'), 2);
    paras.push(p1);

    const p2 = [];
    push(p2, sKnewBy(m, 'prep'), 3);
    push(p2, sFeature(m), 1);
    push(p2, sFeatureDetail(m), 2);
    push(p2, sFeatureSource(m), 3);
    push(p2, sLearnOrTask(m), 2);
    push(p2, sPolicy(m), 3);
    push(p2, sSubReason(m), 1);
    paras.push(p2);

    // 魅力カード：自分が見てきた場面を、そのまま段落にする
    const p3 = [];
    m.cardSent(0, 0).forEach(function (s) { p3.push(s); });
    m.cardSent(1, 2).forEach(function (s) { p3.push(s); });
    m.cardSent(2, 3).forEach(function (s) { p3.push(s); });
    push(p3, sAttract(m, '特に'), 3);
    paras.push(p3);
    paras.push([S(sValue(m), 1)]);

    const p4 = [];
    push(p4, sEffortIntro(m), 1);
    push(p4, sEffortAction(m), 2);
    push(p4, sEffortResult(m), 2);
    push(p4, sEffortHard(m), 2);
    push(p4, sEffortHow(m), 2);
    push(p4, sEffortLearned(m), 1);
    push(p4, sEffortUse(m), 2);
    push(p4, sSelfTraits(m), m.pTraits);
    push(p4, sSelfTraitsScene(m), m.pTraits);
    push(p4, sStrengths(m), m.pStrengths);
    push(p4, sStrengthsScene(m), 3);
    push(p4, sLicenses(m), 3);
    push(p4, sContribution(m), 1);
    paras.push(p4);

    const p5 = [];
    push(p5, sMust(m), 1);
    paras.push(p5);

    const p6 = [];
    push(p6, sAfter(m), 1);
    push(p6, sAfterAction(m), 2);
    push(p6, sDailyImage(m), 3);
    push(p6, sAfterGrad(m), 3);
    push(p6, sContributeTo(m), 3);
    paras.push(p6);

    paras.push([S(variant(m, [
      '以上の理由から、私は' + m.nameFull + 'を志望します。',
      '以上が、私が' + m.nameFull + 'を志望する理由です。',
      'これらの理由から、私は' + m.nameFull + 'を志望します。'
    ], 20), 0)]);
    return paras;
  }

  // ── テンプレート2: エピソード型 ────────────────────────
  function buildStory(m) {
    const paras = [];

    const p1 = [];
    push(p1, sEffortIntro(m), 0);
    push(p1, sEffortAction(m), 2);
    push(p1, sEffortResult(m), 2);
    push(p1, sEffortHard(m), 2);
    push(p1, sEffortHow(m), 2);
    push(p1, sEffortLearned(m), 1);
    push(p1, sEffortUse(m), 2);
    push(p1, sSelfTraits(m), m.pTraits);
    push(p1, sSelfTraitsScene(m), m.pTraits);
    push(p1, sStrengths(m), m.pStrengths);
    push(p1, sStrengthsScene(m), 3);
    push(p1, sLicenses(m), 3);
    paras.push(p1);

    const p2 = [];
    push(p2, sBridge(m, 'story'), 0);
    push(p2, variant(m, [
      m.L.metPhrase + 'と感じたことを、今でも覚えています。',
      // 「ここで働きたい。」と言い切ると、本文だけが常体になってしまう
      '「' + m.L.metPhrase + '」。そう感じたことを、今でもよく覚えています。',
      'そのとき' + m.L.metPhrase + 'と思ったことは、今も心に残っています。'
    ], 26), 2);
    push(p2, sSubReason(m), 1);
    m.cardSent(0, 0).forEach(function (s) { p2.push(s); });
    m.cardSent(1, 2).forEach(function (s) { p2.push(s); });
    push(p2, sAttract(m, '中でも'), 3);
    paras.push(p2);
    paras.push([S(sValue(m), 1)]);

    const p3 = [];
    // ここが抜けていると、必須で聞いた「手に入れたいもの」が本文に一度も出ない
    push(p3, variant(m, [
      'この出会いから、私は' + m.want + 'と考えるようになりました。',
      'そして私は、' + m.want + 'と考えるようになりました。',
      'こうして、' + m.want + 'という思いが固まりました。'
    ], 34), 1);
    push(p3, sKnewBy(m, 'story'), 3);
    push(p3, sFeature(m), 1);
    push(p3, sFeatureDetail(m), 2);
    push(p3, sLearnOrTask(m), 2);
    push(p3, sDeep(m, 'why'), 2);
    push(p3, sMust(m), 1);
    push(p3, sPolicy(m), 3);
    paras.push(p3);
    paras.push([S(sValue(m), 1)]);

    const p4 = [];
    push(p4, sAfter(m), 1);
    push(p4, sAfterAction(m), 2);
    push(p4, sDailyImage(m), 3);
    push(p4, sContribution(m), 1);
    push(p4, sAfterGrad(m), 3);
    push(p4, sContributeTo(m), 3);
    paras.push(p4);

    paras.push([S(variant(m, [
      '高校で身につけたことを土台に、' + m.name + 'でさらに成長したいと考え、志望しました。',
      'ここまでの経験を活かし、' + m.name + 'でさらに力を伸ばしたいと考えています。',
      '高校での3年間で得たものを持って、' + m.name + 'の門をたたきたいと考えています。'
    ], 21), 0)]);
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
    push(p2, variant(m, [
      'その目標に近づくために、' + (m.job ? '働くうえでは' : '進学先では') + m.want + 'と考えました。',
      'この目標に近づくには、' + m.want + 'ことが欠かせないと考えています。',
      'そのためにまず、' + m.want + 'と考えました。'
    ], 30), 1);
    push(p2, sDeep(m, 'decided'), 2);
    paras.push(p2);

    const p3 = [];
    push(p3, sKnewBy(m, 'future'), 3);
    push(p3, sFeature(m), 1);
    push(p3, sFeatureDetail(m), 3);
    push(p3, sFeatureSource(m), 3);
    push(p3, sLearnOrTask(m), 3);
    m.cardSent(0, 0).forEach(function (s) { p3.push(s); });
    m.cardSent(1, 3).forEach(function (s) { p3.push(s); });
    push(p3, sSubReason(m), 1);
    push(p3, sAttract(m, '特に'), 3);
    push(p3, sMust(m), 1);
    paras.push(p3);
    paras.push([S(sValue(m), 1)]);

    const p4 = [];
    push(p4, sEffortIntro(m), 1);
    push(p4, sEffortAction(m), 3);
    push(p4, sEffortHard(m), 3);
    push(p4, sEffortHow(m), 3);
    push(p4, sEffortLearned(m), 2);
    push(p4, sEffortUse(m), 2);
    push(p4, sSelfTraits(m), m.pTraits);
    push(p4, sSelfTraitsScene(m), m.pTraits);
    push(p4, sStrengths(m), m.pStrengths);
    push(p4, sStrengthsScene(m), 3);
    push(p4, sLicenses(m), 3);
    push(p4, sContribution(m), 2);
    paras.push(p4);

    const p5 = [];
    push(p5, sAfter(m), 1);
    push(p5, sAfterAction(m), 2);
    push(p5, sDailyImage(m), 3);
    push(p5, sAfterGrad(m), 2);
    push(p5, sContributeTo(m), 3);
    paras.push(p5);

    paras.push([S(variant(m, [
      '目標を実現できる環境がそろっていると考え、私は' + m.nameFull + 'を志望します。',
      'この目標に近づける場所だと確信し、' + m.nameFull + 'を志望します。',
      '目標に向かって進める場所だと考え、私は' + m.nameFull + 'を志望します。'
    ], 22), 0)]);
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
      ? variant(m, [
        '調べるほど、私は' + m.want + 'と考えるようになりました。',
        '調べれば調べるほど、' + m.want + 'という気持ちが強くなりました。',
        'それから調べていくうちに、' + m.want + 'と思うようになりました。'
      ], 27)
      : sHead(m), 0);
    push(p2, sDeep(m, 'felt'), 2);
    // 志望先の固有名詞は「調べた証拠」そのもの。字数が苦しくても最後まで残す
    push(p2, sKnewBy(m, 'scene'), 3);
    push(p2, sFeature(m), 1);
    push(p2, sLearnOrTask(m), 2);
    push(p2, sFeatureDetail(m), 3);
    push(p2, sFeatureSource(m), 3);
    push(p2, sSubReason(m), 1);
    m.cardSent(1, 2).forEach(function (s) { p2.push(s); });
    m.cardSent(2, 3).forEach(function (s) { p2.push(s); });
    push(p2, sAttract(m, '特に'), 3);
    paras.push(p2);
    paras.push([S(sValue(m), 1)]);

    const p3 = [];
    push(p3, sEffortIntro(m), 1);
    push(p3, sEffortAction(m), 3);
    push(p3, sEffortHard(m), 2);
    push(p3, sEffortHow(m), 2);
    push(p3, sEffortLearned(m), 1);
    push(p3, sEffortUse(m), 2);
    push(p3, sSelfTraits(m), m.pTraits);
    push(p3, sSelfTraitsScene(m), m.pTraits);
    push(p3, sStrengths(m), m.pStrengths);
    push(p3, sStrengthsScene(m), 3);
    push(p3, sLicenses(m), 3);
    push(p3, sContribution(m), 1);
    paras.push(p3);

    const p4 = [];
    push(p4, sMust(m), 1);
    push(p4, sAfter(m), 1);
    push(p4, sAfterAction(m), 2);
    push(p4, sDailyImage(m), 3);
    push(p4, sAfterGrad(m), 3);
    push(p4, sContributeTo(m), 3);
    paras.push(p4);

    paras.push([S(variant(m, [
      'あの日に感じた気持ちを大切に、' + m.nameFull + 'を志望します。',
      'あのときの気持ちは今も変わりません。だからこそ、' + m.nameFull + 'を志望します。',
      'あの場面で動いた気持ちを胸に、' + m.nameFull + 'を志望します。'
    ], 23), 0)]);
    return paras;
  }

  // ── テンプレート5: 挑戦意欲型 ──────────────────────────
  // 「入ってから挑戦したいこと」を出発点にする。これからの意欲をまっすぐ示せる。
  function buildGap(m) {
    const paras = [];

    const p1 = [];
    push(p1, fitWish(m.gapNow,
      '私がこれから挑戦したいのは、{X}です。',
      '私がこれから挑戦したいのは、{X}ことです。',
      // 「海外で働きたい」と書かれたら、「〜たいことです」にせず意欲の文で受ける
      '私はこれから、{X}と考えています。')
      || '私には、高校生活の中で「これをやってみたい」と思うようになったことがあります。', 0);
    push(p1, variant(m, [
      'その気持ちが、' + m.nameFull + 'を志望するきっかけになりました。',
      'この挑戦ができる場所を探して、たどり着いたのが' + m.nameFull + 'でした。',
      'だからこそ、' + m.nameFull + 'を志望します。'
    ], 28), 0);
    paras.push(p1);

    const p2 = [];
    push(p2, sEffortIntro(m), 1);
    push(p2, sEffortAction(m), 2);
    push(p2, sEffortResult(m), 3);
    push(p2, sEffortHard(m), 2);
    push(p2, sEffortHow(m), 2);
    push(p2, sEffortLearned(m), 1);
    push(p2, sEffortUse(m), 2);
    push(p2, sSelfTraits(m), m.pTraits);
    push(p2, sSelfTraitsScene(m), m.pTraits);
    push(p2, sStrengths(m), m.pStrengths);
    push(p2, sStrengthsScene(m), 3);
    push(p2, sLicenses(m), 3);
    push(p2, 'この経験があるからこそ、次の挑戦に向かえると感じています。', 2);
    paras.push(p2);

    const p3 = [];
    push(p3, variant(m, [
      'そこで、' + m.want + 'と考えるようになりました。',
      'この挑戦のために、' + m.want + 'と考えました。',
      'だから私は、' + m.want + 'と考えています。'
    ], 29), 1);
    push(p3, sKnewBy(m, 'gap'), 3);
    push(p3, sFeature(m), 1);
    push(p3, sFeatureDetail(m), 2);
    push(p3, sLearnOrTask(m), 3);
    m.cardSent(0, 0).forEach(function (s) { p3.push(s); });
    m.cardSent(1, 3).forEach(function (s) { p3.push(s); });
    push(p3, sSubReason(m), 1);
    push(p3, sAttract(m, '特に'), 3);
    push(p3, sMust(m), 1);
    paras.push(p3);
    paras.push([S(sValue(m), 1)]);

    const p4 = [];
    push(p4, sAfter(m), 1);
    push(p4, sAfterAction(m), 1);
    push(p4, sDailyImage(m), 3);
    push(p4, sContribution(m), 2);
    push(p4, sAfterGrad(m), 2);
    push(p4, sContributeTo(m), 3);
    paras.push(p4);

    paras.push([S(variant(m, [
      'ここでもっと伸びたいという気持ちを持って、' + m.nameFull + 'を志望します。',
      'ここでさらに伸びたいという気持ちで、' + m.nameFull + 'を志望します。',
      'さらに一歩進みたいと考え、' + m.nameFull + 'を志望します。'
    ], 24), 0)]);
    return paras;
  }

  // ── テンプレート6: 三つの理由型 ────────────────────────
  // 面接で「志望動機を教えてください」と聞かれたとき、そのまま話せる形。
  function buildThree(m) {
    const paras = [];

    paras.push([S(variant(m, [
      '私が' + m.nameFull + 'を志望する理由は、大きく三つあります。',
      '私が' + m.nameFull + 'を志望する理由を、三つに整理しました。',
      '私が' + m.nameFull + 'を志望するのには、三つの理由があります。'
    ], 31), 0)]);

    const p2 = [];
    push(p2, '一つ目は、' + m.want + 'からです。', 0);
    push(p2, sDeep(m, 'think'), 2);
    push(p2, sKnewBy(m, 'three'), 3);
    push(p2, sFeature(m), 1);
    push(p2, sLearnOrTask(m), 2);
    push(p2, sFeatureDetail(m), 3);
    push(p2, sFeatureSource(m), 3);
    paras.push(p2);

    const p3 = [];
    push(p3, variant(m, [
      '二つ目は、実際に自分の目で見て感じたことです。',
      '二つ目は、自分の足で確かめたことがあるという点です。',
      '二つ目は、この目で見て心が動いた場面があることです。'
    ], 32), 0);
    m.cardSent(0, 0).forEach(function (s) { p3.push(s); });
    m.cardSent(1, 2).forEach(function (s) { p3.push(s); });
    push(p3, sAttract(m, '特に'), 3);
    push(p3, sSubReason(m), 1);
    push(p3, sPolicy(m), 3);
    push(p3, sValue(m), 1);
    paras.push(p3);

    const p4 = [];
    push(p4, variant(m, [
      '三つ目は、私自身の経験とのつながりです。',
      '三つ目は、これまでの自分の経験と重なる点があることです。',
      '三つ目は、高校で積み重ねてきたことが活かせるという点です。'
    ], 33), 0);
    push(p4, sEffortIntro(m), 1);
    push(p4, sEffortAction(m), 3);
    push(p4, sEffortResult(m), 3);
    push(p4, sEffortHard(m), 2);
    push(p4, sEffortHow(m), 2);
    push(p4, sEffortLearned(m), 1);
    push(p4, sEffortUse(m), 2);
    push(p4, sSelfTraits(m), m.pTraits);
    push(p4, sSelfTraitsScene(m), m.pTraits);
    push(p4, sStrengths(m), m.pStrengths);
    push(p4, sStrengthsScene(m), 3);
    push(p4, sLicenses(m), 3);
    push(p4, sContribution(m), 1);
    paras.push(p4);

    const p5 = [];
    push(p5, sMust(m), 1);
    push(p5, sAfter(m), 1);
    push(p5, sAfterAction(m), 2);
    push(p5, sDailyImage(m), 3);
    push(p5, sAfterGrad(m), 3);
    push(p5, sContributeTo(m), 3);
    paras.push(p5);

    paras.push([S(variant(m, [
      '以上の三つの理由から、私は' + m.nameFull + 'を志望します。',
      'この三つの理由から、私は' + m.nameFull + 'を志望します。',
      '以上の三点が、私が' + m.nameFull + 'を志望する理由です。'
    ], 25), 0)]);
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
  // family が同じものは「同じ語尾」として数える。
  // 「取り組みたいと考えています」と「活かせると考えています」は
  // 別の語尾に見えて、読むと同じ響きになるため。
  const ENDING_VARIANTS = [
    { key: 'たいと考えています。', family: 'kangae', alts: ['たいです。', 'たいと思っています。'] },
    // 「〜ています。」で終わる仲間は、響きが同じなので同じ family でまとめて数える。
    // 別々に扱うと「考えています→思っています」の言いかえで単調さが残ってしまう
    { key: 'たいと思っています。', family: 'kangae', alts: ['たいです。', 'たいと考えています。'] },
    { key: 'と考えています。', family: 'kangae', alts: ['と考えました。', 'と思っています。'] },
    { key: 'と思っています。', family: 'kangae', alts: ['と思います。', 'と考えました。'] },
    { key: 'と考えました。', family: 'kangae', alts: ['と思いました。'] },
    { key: 'と思いました。', family: 'omoi', alts: ['と感じました。'] },
    { key: 'に残りました。', family: 'nokori', alts: ['に残っています。'] },
    { key: 'があります。', family: 'aru', alts: ['がありました。'] },
    // 「〜たいからです」「〜だからです」は「ためです」に置きかえられない
    // （「取り組みたいためです」「好きだためです」になってしまう）ので、そのままにする
    { key: 'たいからです。', family: 'kara', alts: [] },
    { key: 'だからです。', family: 'kara', alts: [] },
    { key: 'があるからです。', family: 'kara', alts: ['があるためです。'] },
    { key: 'からです。', family: 'kara', alts: ['ためです。'] }
  ];

  function endingOf(sentence) {
    for (let i = 0; i < ENDING_VARIANTS.length; i++) {
      if (sentence.slice(-ENDING_VARIANTS[i].key.length) === ENDING_VARIANTS[i].key) {
        return ENDING_VARIANTS[i];
      }
    }
    return null;
  }

  /**
   * 同じ語尾が続いたとき、または文章全体で3回以上出てきたときに言いかえる。
   *
   * 隣り合っていなくても、「〜と考えています。」が4回出てくれば単調に読める。
   * 長くなる言いかえは字数を押し出すので、目標に余裕があるときだけ使う。
   */
  function varyEndings(text, target) {
    // まず文章全体で数える（同じ響きのものはまとめて数える）
    const seen = {};
    (text.match(/[^。\n]*。/g) || []).forEach(function (x) {
      const v = endingOf(x);
      if (v) seen[v.family] = (seen[v.family] || 0) + 1;
    });

    const used = {};
    let prev = '';

    return text.split('\n\n').map(function (para) {
      const sents = para.match(/[^。]*。/g);
      if (!sents) return para;

      const out = sents.map(function (sent) {
        const v = endingOf(sent);
        const key = v ? v.family : sent.slice(-5);
        if (v) used[v.family] = (used[v.family] || 0) + 1;

        // 直前と同じか、全体で3回以上出るうちの3回目以降なら言いかえる
        const tooMany = v && seen[v.family] >= 3 && used[v.family] >= 3;
        if (key !== prev && !tooMany) { prev = key; return sent; }

        if (v) {
          // 言いかえたら family が変わるものを優先する（同じ響きを避けるため）
          const alt = v.alts.find(function (a) {
            const hit = ENDING_VARIANTS.find(function (x) { return x.key === a; });
            return (!hit || hit.family !== v.family) && a.length <= v.key.length;
          }) || v.alts.find(function (a) { return a.length <= v.key.length; }) || v.alts[0];

          if (alt) {
            const fixed = sent.slice(0, sent.length - v.key.length) + alt;
            if (countChars(fixed) <= countChars(sent) || countChars(text) < target) {
              const hit = ENDING_VARIANTS.find(function (x) { return x.key === alt; });
              prev = hit ? hit.family : alt;
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

  /**
   * 「私」が多すぎるときだけ、外しても意味が変わらない主語を落とす。
   *
   * 志望理由書に「私」は何度か出てよいが、17文で6回は目につく。
   * 主語がなくても誰の話か分かる文だけを対象にする。
   */
  const WATASHI_DROP = [
    [/私が特に関心を持ったのは、/, '特に関心を持ったのは、'],
    [/私は将来、/, '将来、'],
    [/私がもっとも打ち込んだのは/, 'もっとも打ち込んだのは']
  ];

  function trimWatashi(text) {
    let out = text;
    WATASHI_DROP.forEach(function (r) {
      if ((out.match(/私/g) || []).length <= 3) return;
      out = out.replace(r[0], r[1]);
    });
    return out;
  }

  /**
   * 一文だけの段落を、次の段落の先頭につなぐ。
   *
   * 字数調整で文が削られると「同じような学校は他にもありますが……。」が
   * 1行だけの段落として残ることがある。志望理由書としては見た目が悪く、
   * 話のまとまりも見えにくい。
   * 書き出しと結びは、1文でもそのまま独立させる（そういう型なので）。
   */
  function mergeLoneParagraphs(paras) {
    const out = paras.map(function (p) { return p.filter(Boolean); })
      .filter(function (p) { return p.length; });

    for (let i = 1; i < out.length - 1; i++) {
      if (out[i].length !== 1 || countChars(out[i][0].text) >= 70) continue;

      // 結びは独立させたいので、その手前の段落は前へ寄せる
      if (i + 1 === out.length - 1) {
        out[i - 1] = out[i - 1].concat(out[i]);
      } else {
        out[i + 1] = out[i].concat(out[i + 1]);
      }
      out.splice(i, 1);
      i--;
    }
    return out;
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

  /** 固有名詞（かぎかっこ）や数字を含む文か。削る順を決めるのに使う */
  function hasConcrete(text) {
    return /「[^」]{2,}」|[0-9０-９]/.test(text);
  }

  /**
   * 削る文を1つ選ぶ。
   * 基本は「削れば上限内に収まる中で、いちばん短い文」。削りすぎを防ぐため。
   * ただし同じくらいの長さなら、固有名詞や数字を含まない文のほうを先に削る。
   * 「貴校の演習「◯◯」です」のような具体語こそ、志望動機の説得力そのものなので。
   */
  function choose(cands, need) {
    if (!cands.length) return null;

    const enough = cands.filter(function (c) { return c.len >= need; })
      .sort(function (a, b) { return a.len - b.len; });
    if (enough.length) {
      const min = enough[0].len;
      return enough.find(function (c) { return !c.concrete && c.len <= min * 1.3; }) || enough[0];
    }

    // どれ1つでは足りないので、いちばん長い文を削って次の回に回す
    const rest = cands.slice().sort(function (a, b) { return b.len - a.len; });
    return rest.find(function (c) { return !c.concrete; }) || rest[0];
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
            if (s.p === priority) {
              cands.push({ i: i, k: k, len: countChars(s.text), concrete: hasConcrete(s.text) });
            }
          });
        });
        if (!cands.length) continue;

        // 同じ優先度なら、固有名詞や数字を含まない文から先に削る。
        // 「貴校の演習「◯◯」です」のような具体語こそ、志望動機の説得力そのものなので。
        picked = choose(cands, need);
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
    // いまの型で聞いていない欄は使わない（型を変える前の答えが混ざらないように）
    const m = materials(scopeToTemplate(data, tpl.id));
    const target = Number(data.targetChars) || 400;

    m.cardOffset = hashOf((m.studentName || '') + '|cards') % 3;
    let paras = tpl.build(m);
    paras = fitToLength(paras, target);
    paras = mergeLoneParagraphs(paras);

    let text = render(paras);
    text = useHonorific(text, m);
    text = varyEndings(text, target);
    text = trimWatashi(text);
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
    // 「〜から」「〜ので」のような語尾は、本文に入れるときに落ちる。
    // そのままの形で探すと「使われていない」と誤って出てしまう
    const raw = String(text || '').replace(/[\s　]/g, '').replace(/(から|ので|ため|こと)$/, '');
    const key = raw.slice(0, len || 10);
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

    // 型を変えると、前の型で答えた内容がデータに残る。
    // いまの型で聞いていない欄まで「使われていない」と言うと、
    // 答えた覚えのない指摘が出てしまうので、聞いている欄だけを見る。
    const asked = {};
    global.QUESTIONS.buildSteps(job ? 'shushoku' : 'shingaku', d.template, d)
      .forEach(function (step) {
        step.fields.forEach(function (f) { asked[f.id] = true; });
      });

    (d.attractCards || []).forEach(function (c, i) {
      if (c && bare(c.what)) items.push({ label: '魅力カード' + (i + 1), text: c.what });
    });

    [
      ['effortAction', '取り組んだこと', d.effortAction],
      ['effortResult', 'その結果', d.effortResult],
      ['effortLearned', 'そこから学んだこと', d.effortLearned],
      ['effortUse', '学びを活かせる場面', d.effortUse],
      ['futureWhyWhat', '将来の目標のきっかけ', d.futureWhyWhat],
      ['gapNow', '挑戦したいこと', d.gapNow],
      ['featureName', '志望先の特色（名前）', d.featureName],
      ['featureDetail', '魅力に感じた理由', d.featureDetail],
      [job ? 'jobTask' : 'studyWant', job ? '仕事の理解' : '受けたい授業', job ? d.jobTask : d.studyWant],
      ['mustPoint', 'ここでなければの違い', d.mustPoint],
      ['contribution', job ? '活かせる力' : null, job ? d.contribution : null],
      ['afterAction', 'まず始めること', d.afterAction],
      ['afterGradWhat', job ? '将来の姿' : '卒業後の目標', d.afterGradWhat],
      ['targetPolicy', '共感した理念', d.targetPolicy],
      ['licenses', '資格・免許', d.licenses],
      ['effortWhich', 'どの活動か', d.effortWhich],
      ['knewBy', '知ったきっかけ', d.knewBy],
      ['knewByOther', 'きっかけ（その他）', d.knewByOther],
      ['subReason', '職種・学科を選んだ理由', d.subReason],
      ['strengthEpisode', '得意だと思うきっかけ', d.strengthEpisode],
      ['strengthScene', '得意なことを活かせる場面', d.strengthScene],
      ['personalityEpisode', 'その性格だと思うきっかけ', d.personalityEpisode],
      ['personalityScene', '性格を活かせる場面', d.personalityScene]
    ].forEach(function (row) {
      if (asked[row[0]] && row[1] && bare(row[2])) items.push({ label: row[1], text: row[2] });
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
