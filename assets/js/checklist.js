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

  function checkSchoolName(text, d) {
    const school = String(d.targetSchool || '').trim();
    if (!school) return result('school', '志望校名', 'warn', '志望校名が未入力です。');
    // 「〇〇高等学校」「〇〇高校」どちらの書き方でも拾えるように短縮形も見る
    const shortName = school.replace(/(高等学校|高校|中等教育学校)$/, '');
    if (text.indexOf(school) !== -1 || (shortName && text.indexOf(shortName) !== -1)) {
      return result('school', '志望校名', 'ok', '本文に志望校名が入っています。');
    }
    return result('school', '志望校名', 'error',
      '本文に「' + school + '」が出てきません。どの学校への志望動機か分かるように書きましょう。');
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

  function checkFuture(text) {
    if (/入学|高校生活|入学後|3年間|三年間/.test(text)) {
      return result('future', '入学後の目標', 'ok', '入学後について書かれています。');
    }
    return result('future', '入学後の目標', 'error',
      '「入学したら何をしたいか」が書かれていません。志望動機で最も重視される部分です。');
  }

  const NEGATIVE = ['他の学校より', 'ほかの学校より', 'レベルが低い', '偏差値が低い', '仕方なく', '滑り止め', '第二志望'];

  function checkNegative(text) {
    const hits = NEGATIVE.filter(function (w) { return text.indexOf(w) !== -1; });
    if (!hits.length) return result('negative', '他校への配慮', 'ok', '他校を下げる表現はありません。');
    return result('negative', '他校への配慮', 'error',
      '他の学校を下げる書き方や、消極的な理由は避けましょう。',
      hits.map(function (w) { return '「' + w + '」'; }));
  }

  function checkRepeatEnding(text) {
    const ends = sentences(text)
      .map(function (s) { return s.replace(/[。！？!?]$/, '').slice(-3); })
      .filter(Boolean);
    for (let i = 0; i + 2 < ends.length; i++) {
      if (ends[i] === ends[i + 1] && ends[i + 1] === ends[i + 2]) {
        return result('repeat', '語尾のくり返し', 'warn',
          '「' + ends[i] + '」で終わる文が3つ続いています。語尾を変えると単調さがなくなります。');
      }
    }
    return result('repeat', '語尾のくり返し', 'ok', '語尾に変化があります。');
  }

  function checkOpening(text) {
    const first = sentences(text)[0] || '';
    if (/志望|理由|目指/.test(first)) {
      return result('opening', '書き出し', 'ok', '書き出しで志望の話に入れています。');
    }
    return result('opening', '書き出し', 'warn',
      '書き出しに「志望した理由は」などの言葉がありません。エピソードから始める構成なら問題ありませんが、最初の3行で何の話か伝わるか確認しましょう。');
  }

  const NOTATION = [
    ['僕', '私'],
    ['ぼく', '私'],
    ['俺', '私'],
    ['わたし', '私'],
    ['自分は', '私は'],
    ['御校', '貴校 または 正式名称']
  ];

  function checkNotation(text) {
    const hits = NOTATION.filter(function (p) { return text.indexOf(p[0]) !== -1; });
    const marks = /[!！?？♪★☆♡→]/.test(text);
    const out = hits.map(function (p) { return '「' + p[0] + '」→「' + p[1] + '」'; });
    if (marks) out.push('「!」「?」などの記号は使わないほうが無難です');
    if (!out.length) return result('notation', '表記', 'ok', '表記の問題はありません。');
    return result('notation', '表記', 'warn', '志望理由書での書き方にそろえましょう。', out);
  }

  // ── まとめて実行 ─────────────────────────────────────
  function run(text, data) {
    const t = String(text || '');
    return [
      checkLength(t, data),
      checkTone(t, data),
      checkSchoolName(t, data),
      checkFuture(t),
      checkSpoken(t),
      checkNegative(t),
      checkSentenceLength(t),
      checkVague(t),
      checkConcrete(t),
      checkRepeatEnding(t),
      checkOpening(t),
      checkNotation(t)
    ];
  }

  /** 人が目で見るチェック項目（自動判定できないもの） */
  const MANUAL = [
    '志望校の名前・学科名を、正式名称で正しく書いた',
    '学校のパンフレットやHPの文をそのまま写していない（自分の言葉になっている）',
    'この学校にしか当てはまらない内容になっている',
    '中学校での経験と、高校でやりたいことがつながっている',
    '誤字・脱字がないか、声に出して読んで確かめた',
    '家族か先生に一度読んでもらった'
  ];

  global.CHECKLIST = { run: run, MANUAL: MANUAL, sentences: sentences };
})(window);
