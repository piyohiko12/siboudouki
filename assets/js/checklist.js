/**
 * 自動セルフチェック
 * 機械的に判定できることだけを担当する（内容の良し悪しは人が見る）。
 *
 * 返り値の level:
 *   'ok'    … 問題なし（緑）
 *   'warn'  … 確認したほうがよい（黄）
 *   'error' … 直したほうがよい（赤）
 */
(function (global) {
  'use strict';

  const countChars = global.COMPOSE.countChars;

  /** 文単位に分割する */
  function sentences(text) {
    return (String(text || '').match(/[^。！？!?\n]+[。！？!?]?/g) || [])
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function result(id, label, level, message, samples) {
    return { id: id, label: label, level: level, message: message, samples: samples || [] };
  }

  // ── 個別のチェック ────────────────────────────────────

  function checkLength(text, d) {
    const n = countChars(text);
    const target = Number(d.targetChars) || 400;
    const min = Math.floor(target * 0.9);
    const max = target;
    if (n === 0) return result('length', '文字数', 'error', '本文が空です。', []);
    if (n > max) {
      return result('length', '文字数', 'error',
        n + '字。指定の' + target + '字を' + (n - target) + '字オーバーしています。字数制限は必ず守りましょう。');
    }
    if (n < min) {
      return result('length', '文字数', 'warn',
        n + '字。指定の' + target + '字の9割（' + min + '字）に届いていません。あと' + (min - n) + '字ほど足しましょう。');
    }
    return result('length', '文字数', 'ok', n + '字。' + target + '字の9割〜10割におさまっています。');
  }

  function checkTone(text, d) {
    const polite = (text.match(/(です|ます)[。、\s]/g) || []).length;
    const plain = (text.match(/(である|だった|考えた|思う)[。、\s]/g) || []).length;
    const want = d.tone === 'だ・である調' ? 'plain' : 'polite';

    if (polite > 0 && plain > 0) {
      return result('tone', '文体の統一', 'error',
        'です・ます調（' + polite + 'か所）と、だ・である調（' + plain + 'か所）が混ざっています。どちらかにそろえましょう。');
    }
    if (want === 'polite' && plain > 0) {
      return result('tone', '文体の統一', 'warn', 'です・ます調を選んでいますが、だ・である調の文が見つかりました。');
    }
    if (want === 'plain' && polite > 0) {
      return result('tone', '文体の統一', 'warn', 'だ・である調を選んでいますが、です・ます調の文が残っています。');
    }
    return result('tone', '文体の統一', 'ok', '文体はそろっています。');
  }

  const SPOKEN = [
    ['なので', 'そのため / したがって'],
    ['だけど', 'しかし'],
    ['ですけど', 'ですが'],
    ['けど', 'が'],
    ['でも、', 'しかし、'],
    ['すごく', '非常に / とても'],
    ['すごい', '大きな / 優れた'],
    ['いっぱい', '多く'],
    ['ちょっと', '少し'],
    ['やっぱり', 'やはり'],
    ['たくさんの人', '多くの人'],
    ['〜とか', '〜など'],
    ['じゃない', 'ではない'],
    ['ちゃんと', 'きちんと'],
    ['どんどん', '着実に']
  ];

  function checkSpoken(text) {
    const hits = SPOKEN.filter(function (p) { return text.indexOf(p[0]) !== -1; });
    if (!hits.length) return result('spoken', '話し言葉', 'ok', '話し言葉は見つかりませんでした。');
    return result('spoken', '話し言葉', 'error',
      '書き言葉に直しましょう。',
      hits.map(function (p) { return '「' + p[0] + '」→「' + p[1] + '」'; }));
  }

  const LONG_LIMIT = 60;

  function checkSentenceLength(text) {
    const longs = sentences(text).filter(function (s) { return countChars(s) > LONG_LIMIT; });
    if (!longs.length) return result('long', '一文の長さ', 'ok', 'すべての文が' + LONG_LIMIT + '字以内です。');
    return result('long', '一文の長さ', 'warn',
      LONG_LIMIT + '字を超える文が' + longs.length + 'つあります。読点で切って2文に分けると読みやすくなります。',
      longs.map(function (s) { return s.slice(0, 45) + '…（' + countChars(s) + '字）'; }));
  }

  function checkTargetName(text, d) {
    const job = d.course === 'shushoku';
    const label = job ? '会社名' : '志望校名';
    const name = String(d.targetName || '').trim();
    if (!name) return result('target', label, 'warn', label + 'が未入力です。');

    // 「株式会社〇〇」「〇〇大学」などの前後を落とした短縮形でも拾えるようにする
    const shortName = name
      .replace(/^(株式会社|有限会社|合同会社|学校法人|社会福祉法人|医療法人)\s*/, '')
      .replace(/(株式会社|有限会社|合同会社)$/, '')
      .replace(/(大学|短期大学|専門学校|高等専門学校|高等学校)$/, '')
      .trim();

    if (text.indexOf(name) !== -1 || (shortName && text.indexOf(shortName) !== -1)) {
      return result('target', label, 'ok', '本文に' + label + 'が入っています。');
    }
    return result('target', label, 'error',
      '本文に「' + name + '」が出てきません。どこへの志望動機か分かるように書きましょう。');
  }

  function checkVague(text) {
    const n = (text.match(/思います|思う/g) || []).length;
    const others = (text.match(/かもしれ|たぶん|だいたい|なんとなく/g) || []).length;
    if (n >= 3 || others > 0) {
      return result('vague', '曖昧な表現', 'warn',
        '「思います」が' + n + '回' + (others ? '、あいまいな語が' + others + '回' : '') +
        '使われています。言い切れるところは「〜です」「〜します」と言い切ると力強くなります。');
    }
    return result('vague', '曖昧な表現', 'ok', '言い切る形で書けています。');
  }

  function checkConcrete(text) {
    const hasNumber = /[0-9０-９]|一|二|三|四|五|六|七|八|九|十/.test(text);
    const hasQuote = /「[^」]{2,}」/.test(text);
    if (hasNumber || hasQuote) {
      return result('concrete', '具体性', 'ok', '数字や固有名詞が入っており、具体的です。');
    }
    return result('concrete', '具体性', 'warn',
      '数字や固有名詞（制度名・大会名・部活名）が見当たりません。「3年間」「県大会ベスト8」「探究ゼミ」のような具体語を入れましょう。');
  }

  function checkFuture(text, d) {
    const job = d.course === 'shushoku';
    const label = job ? '入社後の目標' : '入学後の目標';
    const re = job ? /入社|働|仕事|職場|業務/ : /入学|学び|学ん|研究|履修|在学/;
    if (re.test(text)) {
      return result('future', label, 'ok', (job ? '入社後' : '入学後') + 'について書かれています。');
    }
    return result('future', label, 'error',
      '「' + (job ? '入社したらどう働きたいか' : '入学したら何を学びたいか') +
      '」が書かれていません。志望動機で最も重視される部分です。');
  }

  const NEGATIVE_COMMON = ['仕方なく', 'とりあえず', '滑り止め', '第二志望', 'なんとなく'];
  const NEGATIVE_SHINGAKU = ['他の学校より', 'ほかの学校より', 'レベルが低い', '偏差値が低い', '入りやすい'];
  const NEGATIVE_SHUSHOKU = ['他の会社より', 'ほかの会社より', '楽そう', '簡単そう', 'つぶれない'];

  function checkNegative(text, d) {
    const job = d.course === 'shushoku';
    const label = job ? '他社への配慮' : '他校への配慮';
    const words = NEGATIVE_COMMON.concat(job ? NEGATIVE_SHUSHOKU : NEGATIVE_SHINGAKU);
    const hits = words.filter(function (w) { return text.indexOf(w) !== -1; });
    if (!hits.length) return result('negative', label, 'ok', '消極的な表現はありません。');
    return result('negative', label, 'error',
      (job ? '他の会社' : '他の学校') + 'を下げる書き方や、消極的な理由は避けましょう。',
      hits.map(function (w) { return '「' + w + '」'; }));
  }

  /** 就職でよくある失敗：待遇や条件だけが理由になっている */
  const CONDITION_ONLY = [
    '給料', '給与', '年収', 'ボーナス', '賞与', '休みが多い', '休日が多い', '福利厚生',
    '家から近い', '通勤が楽', '残業が少ない', '安定している'
  ];

  function checkConditionOnly(text, d) {
    if (d.course !== 'shushoku') return null;
    const hits = CONDITION_ONLY.filter(function (w) { return text.indexOf(w) !== -1; });
    const hasWork = /仕事|技術|製品|サービス|理念|品質|お客|地域/.test(text);
    if (!hits.length) return result('condition', '志望理由の中身', 'ok', '待遇面だけの理由にはなっていません。');
    if (hasWork) {
      return result('condition', '志望理由の中身', 'warn',
        '待遇・条件にふれています。仕事の内容についても書けているので問題は少ないですが、条件面は主な理由にしないほうが無難です。',
        hits.map(function (w) { return '「' + w + '」'; }));
    }
    return result('condition', '志望理由の中身', 'error',
      '待遇や条件が志望理由の中心になっています。「その仕事で何がしたいか」を主役にしましょう。',
      hits.map(function (w) { return '「' + w + '」'; }));
  }

  // 段落が変われば読み手は一度息をつくので、同じ段落の中だけで数える
  function checkRepeatEnding(text) {
    const paragraphs = String(text || '').split(/\n{2,}/);

    for (let p = 0; p < paragraphs.length; p++) {
      const ends = sentences(paragraphs[p])
        .map(function (s) { return s.replace(/[。！？!?]$/, '').slice(-3); })
        .filter(Boolean);
      for (let i = 0; i + 2 < ends.length; i++) {
        if (ends[i] === ends[i + 1] && ends[i + 1] === ends[i + 2]) {
          return result('repeat', '語尾のくり返し', 'warn',
            '同じ段落の中で「' + ends[i] + '」で終わる文が3つ続いています。語尾を変えると単調さがなくなります。');
        }
      }
    }
    return result('repeat', '語尾のくり返し', 'ok', '語尾に変化があります。');
  }

  // 結論から入る構成でだけ、書き出しに志望の話があるかを見る。
  // 場面やエピソードから始める構成では、なくて当たり前なので指摘しない。
  const CONCLUSION_FIRST = ['prep', 'three'];

  function checkOpening(text, d) {
    const first = sentences(text)[0] || '';
    const hasReason = /志望|理由|目指/.test(first);

    if (CONCLUSION_FIRST.indexOf(d.template) === -1) {
      return result('opening', '書き出し', 'ok',
        '選んだ構成では、場面や体験から書き出すのが自然です。最初の3行で何の話か伝わるかだけ確認しましょう。');
    }
    if (hasReason) {
      return result('opening', '書き出し', 'ok', '書き出しで志望の話に入れています。');
    }
    return result('opening', '書き出し', 'warn',
      'この構成は結論から入る型です。書き出しに「志望した理由は」を置くと、ぐっと読みやすくなります。');
  }

  const NOTATION = [
    ['僕', '私'],
    ['ぼく', '私'],
    ['俺', '私'],
    ['わたし', '私'],
    ['自分は', '私は']
  ];

  // 書類では「御社／御校」は話し言葉。書き言葉は「貴社／貴校」。
  const NOTATION_SHINGAKU = [['御校', '貴校 または 正式名称'], ['貴社', '貴校（学校あて）']];
  const NOTATION_SHUSHOKU = [['御社', '貴社 または 正式名称'], ['貴校', '貴社（会社あて）']];

  function checkNotation(text, d) {
    const list = NOTATION.concat(d.course === 'shushoku' ? NOTATION_SHUSHOKU : NOTATION_SHINGAKU);
    const hits = list.filter(function (p) { return text.indexOf(p[0]) !== -1; });
    const marks = /[!！?？♪★☆♡→]/.test(text);
    const out = hits.map(function (p) { return '「' + p[0] + '」→「' + p[1] + '」'; });
    if (marks) out.push('「!」「?」などの記号は使わないほうが無難です');
    if (!out.length) return result('notation', '表記', 'ok', '表記の問題はありません。');
    return result('notation', '表記', 'warn', '志望理由書での書き方にそろえましょう。', out);
  }

  /**
   * 使い回し表現（誰が書いても同じになるフレーズ）
   * 志望動機で最も「その人らしさ」が消える原因なので、見つけたら置き換えを促す。
   */
  const CLICHE_COMMON = [
    'アットホーム', '風通しがよい', '成長できる環境', '幅広い知識', '社会に貢献',
    '人の役に立ちたい', '将来の夢を叶え', '自分を高め', '魅力を感じました', '興味を持ちました'
  ];
  const CLICHE_SHINGAKU = ['校風が自分に合', '雰囲気が自分に合', '施設が充実', '先生が親身'];
  const CLICHE_SHUSHOKU = ['安定した会社', '地域に根ざし', '手に職をつけ', '社会人として成長'];

  function checkCliche(text, d) {
    const words = CLICHE_COMMON.concat(d.course === 'shushoku' ? CLICHE_SHUSHOKU : CLICHE_SHINGAKU);
    const hits = words.filter(function (w) { return text.indexOf(w) !== -1; });
    if (!hits.length) {
      return result('cliche', '使い回し表現', 'ok', '誰でも書ける決まり文句は使われていません。');
    }
    return result('cliche', '使い回し表現', 'warn',
      '多くの人が書く表現です。あなたが実際に見た場面（魅力カード）に置き換えると、ぐっと自分だけの文章になります。',
      hits.map(function (w) { return '「' + w + '」'; }));
  }

  /**
   * 魅力カードに書いた「自分が見てきたこと」が、本文に残っているか。
   * 字数調整や手直しで落ちてしまうことがあるため、提出前に気づけるようにする。
   */
  function checkOwnExperience(text, d) {
    const cards = (d.attractCards || []).filter(function (c) { return c && String(c.what || '').trim(); });
    const flat = text.replace(/[\s　]/g, '');

    if (!cards.length) {
      return result('own', '見てきたことの反映', 'warn',
        '魅力カードが1枚もありません。STEP 3 で「どこで・何を見て・どう感じたか」を書くと、あなたにしか書けない文章になります。');
    }

    const used = cards.filter(function (c) {
      return flat.indexOf(String(c.what).replace(/[\s　]/g, '').slice(0, 10)) !== -1;
    });

    if (!used.length) {
      return result('own', '見てきたことの反映', 'error',
        '魅力カードに書いた内容が、本文に入っていません。あなたが実際に見た場面こそが、この志望動機の核心です。');
    }
    return result('own', '見てきたことの反映', 'ok',
      '自分の目で見た場面が' + used.length + '件、本文に入っています。');
  }

  // ── まとめて実行 ─────────────────────────────────────
  function run(text, data) {
    const t = String(text || '');
    const d = data || {};
    return [
      checkLength(t, d),
      checkTone(t, d),
      checkTargetName(t, d),
      checkOwnExperience(t, d),
      checkFuture(t, d),
      checkConditionOnly(t, d),
      checkCliche(t, d),
      checkSpoken(t),
      checkNegative(t, d),
      checkSentenceLength(t),
      checkVague(t),
      checkConcrete(t),
      checkRepeatEnding(t),
      checkOpening(t, d),
      checkNotation(t, d)
    ].filter(Boolean);
  }

  /** 人が目で見るチェック項目（自動判定できないもの） */
  const MANUAL_COMMON = [
    '誤字・脱字がないか、声に出して読んで確かめた',
    '家族か先生に一度読んでもらった'
  ];

  const MANUAL_SHINGAKU = [
    '志望校の名前・学部・学科名を、正式名称で正しく書いた',
    '学校のパンフレットやHPの文をそのまま写していない（自分の言葉になっている）',
    '自分が見た場面が、他の人には書けない具体的なものになっている',
    'この学校にしか当てはまらない内容になっている',
    '高校での経験と、進学先で学びたいことがつながっている',
    '入学後の学びと、卒業後の進路がつながっている'
  ];

  const MANUAL_SHUSHOKU = [
    '会社名を、求人票のとおりに正しく書いた（株式会社の位置も）',
    '会社のホームページの文をそのまま写していない（自分の言葉になっている）',
    '自分が見た場面が、他の人には書けない具体的なものになっている',
    'この会社にしか当てはまらない内容になっている',
    '仕事の内容を正しく理解して書けている',
    '高校での経験と、入社後に活かせる力がつながっている',
    '待遇や条件ではなく、仕事の中身が理由になっている'
  ];

  function manualFor(mode) {
    return (mode === 'shushoku' ? MANUAL_SHUSHOKU : MANUAL_SHINGAKU).concat(MANUAL_COMMON);
  }

  global.CHECKLIST = { run: run, manualFor: manualFor, sentences: sentences };
})(window);
