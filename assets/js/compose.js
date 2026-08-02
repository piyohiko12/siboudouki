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

  /** 「〜から」「〜ため」などで終わっていたら、その形をそろえる */
  function asReason(s) {
    let t = bare(s);
    if (!t) return '';
    t = t.replace(/です$/, '');
    if (/(から|ため|ので)$/.test(t)) return t;
    return t + 'から';
  }

  /** 「〜したい」で終わる文か、名詞句かを見分けて自然につなぐ */
  function asWish(s) {
    const t = bare(s);
    if (!t) return '';
    if (/(たい|ほしい|しい)$/.test(t)) return t + 'と考えました';
    if (/(こと|力|経験|知識|技術)$/.test(t)) return t + 'を身につける必要があると考えました';
    return t + 'が必要だと考えました';
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
    [/います/g, 'いる'], [/いました/g, 'いた'],
    [/ありません/g, 'ない'], [/できません/g, 'できない'], [/いません/g, 'いない']
  ];

  // 先に処理する定型の語尾（長いものから順に並べる）
  const FIXED = [
    [/ていました/g, 'ていた'],
    [/ています/g, 'ている'],
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

  function lex(mode) {
    return LEX[mode] || LEX.shingaku;
  }

  // ── テンプレート定義 ───────────────────────────────────
  const TEMPLATES = [
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
    }
  ];

  // ── 生成の共通材料 ────────────────────────────────────
  function materials(d) {
    const mode = d.course === 'shushoku' ? 'shushoku' : 'shingaku';
    const L = lex(mode);
    const name = bare(d.targetName) || L.honorific;
    const sub = bare(d.targetSub);
    const efforts = d.efforts || [];
    const chain = d.whyChain || {};

    return {
      mode: mode,
      job: mode === 'shushoku',
      L: L,
      name: name,
      // 進学は「〇〇大学経済学部」、就職は「株式会社〇〇の製造職」とつなぐ
      nameFull: !sub ? name : (mode === 'shushoku' ? name + 'の' + sub : name + sub),
      sub: sub,
      efforts: efforts,
      effortTop: efforts[0] || '学校生活',
      effortDetail: flow(d.effortDetail),
      effortLearned: flow(d.effortLearned),
      strengths: d.strengths || [],
      personality: d.personality || [],
      licenses: bare(d.licenses),
      futureDream: bare(d.futureDream),
      futureWhy: flow(d.futureWhy),
      knewBy: bare(d.knewBy),
      visited: d.visited || [],
      visitImpression: flow(d.visitImpression),
      attract: d.attractPoints || [],
      feature: flow(d.targetFeature),
      policy: bare(d.targetPolicy),
      studyWant: flow(d.studyWant),
      jobUnderstanding: flow(d.jobUnderstanding),
      mainReason: bare(d.mainReason),
      // 深掘りの最も深い答えを「本当の動機」として使う
      deepReason: firstOf(chain.why3, chain.why2, chain.why1),
      midReason: firstOf(chain.why2, chain.why1),
      mustReason: flow(d.mustReason),
      after: d.afterEnter || [],
      afterEnterDetail: flow(d.afterEnterDetail),
      contribution: flow(d.contribution),
      afterGrad: flow(d.afterGrad)
    };
  }

  /** 文オブジェクト: p は優先度（1=必須 2=推奨 3=余裕があれば） */
  function S(text, p) {
    const t = String(text || '').trim();
    return t ? { text: t, p: p || 2 } : null;
  }

  // ── テンプレート1: 結論先行型 ──────────────────────────
  function buildPrep(m) {
    const L = m.L;
    const paras = [];

    paras.push([
      S('私が' + m.nameFull + 'を志望した理由は、' + asReason(m.mainReason) + 'です。', 1),
      // 深掘りの答えは「志望理由の根拠」なので、結論のすぐ後ろに置く
      m.deepReason ? S('そう考えるようになったのは、' + asReason(m.deepReason) + 'です。', 2) : null
    ]);

    const p2 = [];
    if (m.feature) {
      p2.push(S(m.job
        ? m.name + 'の、' + bare(m.feature) + 'に強く関心を持ち、私が' + L.wantNoun + 'と重なっていると感じました。'
        : m.name + 'には' + bare(m.feature) + 'があり、私が' + L.wantNoun + 'と重なっていると感じました。', 1));
    }
    if (m.job && m.jobUnderstanding) p2.push(S(m.jobUnderstanding, 2));
    if (!m.job && m.studyWant) p2.push(S(m.studyWant, 2));
    if (m.attract.length) p2.push(S('特に' + joinNouns(m.attract, 3) + 'に強くひかれました。', 2));
    if (m.visitImpression) p2.push(S(m.knewBy ? m.knewBy + 'に参加した際、' + bare(m.visitImpression) + '。' : m.visitImpression, 2));
    if (m.policy) p2.push(S(bare(m.policy) + 'という考え方にも共感しています。', 3));
    paras.push(p2);

    const p3 = [];
    p3.push(S('私は高校で' + m.effortTop + 'に力を入れてきました。', 1));
    if (m.effortDetail) p3.push(S(m.effortDetail, 2));
    if (m.effortLearned) p3.push(S('この経験から、' + bare(m.effortLearned) + '。', 1));
    if (m.job && m.contribution) p3.push(S(m.contribution, 1));
    if (m.job && m.licenses) p3.push(S('また、' + m.licenses + 'を取得しており、仕事の中で活かしていきたいと考えています。', 3));
    paras.push(p3);

    const p4 = [];
    if (m.mustReason) p4.push(S(m.mustReason, 2));
    paras.push(p4);

    const p5 = [];
    if (m.after.length) p5.push(S(L.joinAfter + 'は、' + joinNouns(m.after, 3) + 'に取り組みたいと考えています。', 1));
    if (m.afterEnterDetail) p5.push(S(m.afterEnterDetail, 2));
    if (m.afterGrad) p5.push(S(m.afterGrad, 3));
    paras.push(p5);

    paras.push([S('以上の理由から、私は' + m.nameFull + 'を志望します。', 1)]);
    return paras;
  }

  // ── テンプレート2: エピソード型 ────────────────────────
  function buildStory(m) {
    const L = m.L;
    const paras = [];

    const p1 = [];
    p1.push(S('私は高校の3年間、' + m.effortTop + 'に力を注いできました。', 1));
    if (m.effortDetail) p1.push(S(m.effortDetail, 2));
    if (m.effortLearned) p1.push(S('この経験を通して、' + bare(m.effortLearned) + '。', 1));
    paras.push(p1);

    const p2 = [];
    p2.push(S((m.knewBy ? m.knewBy + 'で' : '') + m.nameFull + 'を知り、' + L.metPhrase + 'と感じました。', 1));
    if (m.visitImpression) p2.push(S(m.visitImpression, 2));
    if (m.attract.length) p2.push(S('中でも' + joinNouns(m.attract, 3) + 'は、私が' + L.lifeNoun + 'で最も大切にしたい点です。', 2));
    paras.push(p2);

    const p3 = [];
    if (m.feature) p3.push(S('特に魅力を感じたのは、' + bare(m.feature) + 'です。', 1));
    if (m.job && m.jobUnderstanding) p3.push(S(m.jobUnderstanding, 2));
    if (!m.job && m.studyWant) p3.push(S(m.studyWant, 2));
    if (m.deepReason) p3.push(S('なぜなら、' + asReason(m.deepReason) + 'です。', 2));
    if (m.mustReason) p3.push(S(m.mustReason, 2));
    if (m.policy) p3.push(S(bare(m.policy) + 'という方針も、私の考えと重なります。', 3));
    paras.push(p3);

    const p4 = [];
    if (m.after.length) p4.push(S(L.joinAfter + 'は' + joinNouns(m.after, 3) + 'に力を入れたいです。', 1));
    if (m.afterEnterDetail) p4.push(S(m.afterEnterDetail, 2));
    if (m.job && m.contribution) p4.push(S(m.contribution, 2));
    if (m.afterGrad) p4.push(S(m.afterGrad, 3));
    paras.push(p4);

    paras.push([S('高校で身につけたことを土台に、' + m.name + 'でさらに成長したいと考え、志望しました。', 1)]);
    return paras;
  }

  // ── テンプレート3: 将来目標型 ──────────────────────────
  function buildFuture(m) {
    const L = m.L;
    const paras = [];

    const p1 = [];
    p1.push(S('私は将来、' +
      (m.futureDream || (m.job ? '任された仕事をやり切れる社会人になること' : 'やりたいことを見つけ、社会に貢献する仕事に就くこと')) +
      'を目指しています。', 1));
    if (m.futureWhy) p1.push(S(m.futureWhy, 2));
    paras.push(p1);

    const p2 = [];
    p2.push(S('その目標に近づくために、' + (m.job ? '働くうえでは' : '進学先では') +
      (m.mainReason ? asWish(m.mainReason) : '主体的に学ぶ力を身につける必要があると考えました') + '。', 1));
    if (m.deepReason) p2.push(S('そう考えたのは、' + asReason(m.deepReason) + 'です。', 2));
    paras.push(p2);

    const p3 = [];
    if (m.feature) {
      p3.push(S(m.job
        ? m.name + 'の、' + bare(m.feature) + 'は、私の目標に直接つながると考えています。'
        : m.nameFull + 'には' + bare(m.feature) + 'があり、私の目標に直接つながると考えています。', 1));
    }
    if (m.job && m.jobUnderstanding) p3.push(S(m.jobUnderstanding, 3));
    if (!m.job && m.studyWant) p3.push(S(m.studyWant, 3));
    if (m.attract.length) p3.push(S('また、' + joinNouns(m.attract, 3) + 'も志望の大きな理由です。', 3));
    if (m.visitImpression) p3.push(S(m.visitImpression, 3));
    if (m.mustReason) p3.push(S(m.mustReason, 2));
    paras.push(p3);

    const p4 = [];
    p4.push(S('私は高校で' + m.effortTop + 'に取り組んできました。', 2));
    if (m.effortDetail) p4.push(S(m.effortDetail, 3));
    if (m.effortLearned) {
      p4.push(S('この経験から、' + bare(m.effortLearned) + '。', 2));
      p4.push(S('ここで得たものを、' + (m.job ? '仕事の場でも' : '進学先でも') + '活かしたいです。', 3));
    }
    if (m.job && m.contribution) p4.push(S(m.contribution, 2));
    paras.push(p4);

    const p5 = [];
    if (m.after.length) p5.push(S(L.joinAfter + 'は' + joinNouns(m.after, 3) + 'に取り組みます。', 1));
    if (m.afterEnterDetail) p5.push(S(m.afterEnterDetail, 2));
    if (m.afterGrad) p5.push(S(m.afterGrad, 3));
    paras.push(p5);

    paras.push([S('目標を実現できる環境がそろっていると考え、私は' + m.nameFull + 'を志望します。', 1)]);
    return paras;
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

    // 優先度3（あれば良い）→2（推奨）の順に削る。
    // 同じ優先度の中では「削れば上限内に収まる中で最も短い文」を選び、削りすぎを防ぐ。
    let guard = 0;
    while (countChars(render(work)) > limit && guard++ < 60) {
      const total = countChars(render(work));
      const need = total - limit;
      let picked = null;

      for (let priority = 3; priority >= 2 && !picked; priority--) {
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

  global.COMPOSE = {
    TEMPLATES: TEMPLATES,
    generate: generate,
    countChars: countChars,
    toPlainTone: toPlainTone
  };
})(window);
