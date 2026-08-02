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

  // ── まとめて実行 ─────────────────────────────────────
  function run(text, data) {
    const t = String(text || '');
    const d = data || {};
    return [
      checkLength(t, d),
      checkTone(t, d),
      checkTargetName(t, d),
      checkFuture(t, d),
      checkConditionOnly(t, d),
      checkSpoken(t),
      checkNegative(t, d),
      checkSentenceLength(t),
      checkVague(t),
      checkConcrete(t),
      checkRepeatEnding(t),
      checkOpening(t),
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
    'この学校にしか当てはまらない内容になっている',
    '高校での経験と、進学先で学びたいことがつながっている',
    '入学後の学びと、卒業後の進路がつながっている'
  ];

  const MANUAL_SHUSHOKU = [
    '会社名を、求人票のとおりに正しく書いた（株式会社の位置も）',
    '会社のホームページの文をそのまま写していない（自分の言葉になっている）',
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
