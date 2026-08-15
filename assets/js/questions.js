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

  /**
   * 志望先の種類。
   * 大学あてに「貴校」と書くのは本来まちがい（正しくは「貴学」）。
   * 役所あてなら「貴庁」、病院なら「貴院」で、入社後という言い方も変わる。
   * ここを2〜4択で聞くだけで、本文じゅうの呼び方が正しくなる。
   */
  const ORG_TYPES = {
    shingaku: [
      { label: '大学・短期大学', honorific: '貴学', org: '大学', join: '入学', joinAfter: '入学後' },
      { label: '専門学校', honorific: '貴校', org: '専門学校', join: '入学', joinAfter: '入学後' },
      { label: '高等専門学校・その他の学校', honorific: '貴校', org: '学校', join: '入学', joinAfter: '入学後' }
    ],
    shushoku: [
      { label: '会社（民間企業）', honorific: '貴社', org: '会社', join: '入社', joinAfter: '入社後' },
      { label: '役所・公的機関（公務員）', honorific: '貴庁', org: '職場', join: '採用', joinAfter: '採用後' },
      { label: '病院・医療機関', honorific: '貴院', org: '職場', join: '就職', joinAfter: '就職後' },
      { label: '美術館・図書館などの施設', honorific: '貴館', org: '職場', join: '就職', joinAfter: '就職後' },
      { label: '福祉施設・団体など', honorific: '貴施設', org: '職場', join: '就職', joinAfter: '就職後' }
    ]
  };

  function orgTypeList(mode) {
    return ORG_TYPES[job(mode) ? 'shushoku' : 'shingaku'];
  }

  /** 選ばれた種類を返す（未選択なら先頭＝いちばん多いもの） */
  function orgTypeOf(mode, label) {
    const list = orgTypeList(mode);
    return list.find(function (o) { return o.label === label; }) || list[0];
  }

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

  // ══════════════════════════════════════════════════════
  //  活動ごとの聞き方
  //
  //  「部活動」と「アルバイト」と「課題研究」では、役割の呼び方も、
  //  やったことの粒度も、大変になる場面もまったく違う。
  //  同じ例を出していては、生徒は自分の話に置きかえられない。
  // ══════════════════════════════════════════════════════
  const ACTIVITY = {
    '部活動': {
      role: ['副キャプテン', 'パートリーダー', 'マネージャー'],
      action: ['練習メニューの見直し', '1年生への指導', '大会の運営'],
      result: ['県大会ベスト8', '部員が5人増えたこと', '自己ベストの更新'],
      hard: ['練習時間が合わないこと', 'けがからの復帰', '意見の食いちがい'],
      learned: ['続けることの大切さ', '役割を分けることの大切さ', '仲間と目標を合わせること'],
      how: ['朝練習への切り替え', '練習メニューの見直し', '一人ずつ話を聞くこと'],
      which: {
        label: '何部の活動ですか',
        examples: ['吹奏楽部', 'バスケットボール部', '野球部', '美術部'],
        frame: '{X}での活動'
      }
    },
    '生徒会': {
      role: ['副会長', '書記', '会計'],
      action: ['行事の企画', '意見箱の設置', '全校集会の進行'],
      result: ['参加者が2倍になったこと', '新しい行事の実現'],
      hard: ['意見がまとまらないこと', '先生との調整'],
      learned: ['みんなの意見をまとめることの難しさ', '先に段取りを決めておく大切さ'],
      how: ['一人ずつ話を聞くこと', '案を2つ用意して選んでもらったこと'],
      which: {
        label: '生徒会のどの仕事に、いちばん時間をかけましたか',
        examples: ['体育祭の運営', 'あいさつ運動', '広報紙の発行'],
        frame: '生徒会での{X}'
      }
    },
    '委員会': {
      role: ['委員長', '副委員長', '記録係'],
      action: ['あいさつ運動', '清掃活動の見直し', '呼びかけのポスター作り'],
      result: ['提出率が9割になったこと', '校内の変化'],
      hard: ['協力してもらえないこと', '人が集まらないこと'],
      learned: ['呼びかけ方で人の動きが変わること', '小さな改善を続ける大切さ'],
      how: ['声のかけ方を変えたこと', '当番表を作り直したこと'],
      which: {
        label: 'どの委員会ですか',
        examples: ['図書委員会', '保健委員会', '美化委員会', '放送委員会'],
        frame: '{X}での活動'
      }
    },
    'クラス役員': {
      role: ['学級委員', '班長', '会計'],
      action: ['話し合いの進行', 'クラス目標の作成'],
      result: ['クラスの雰囲気が変わったこと'],
      hard: ['意見がまとまらないこと'],
      learned: ['聞くことから始める大切さ', '決めたことを最後まで通すこと'],
      how: ['先に全員の意見を書き出したこと', '少人数で話す時間を作ったこと'],
      which: null
    },
    '学校行事': {
      role: ['クラスTシャツの作成係', '応援団長', '装飾係'],
      action: ['クラス企画の準備', '装飾の制作', '当日の進行'],
      result: ['クラス優勝', '来場者200人'],
      hard: ['みんなの意見を反映させること', '準備の時間が足りないこと'],
      learned: ['意見が分かれたときの決め方', '準備の段取りの大切さ'],
      how: ['話し合いの回数を増やしたこと', '案を絵にして見せたこと'],
      which: {
        label: 'どの学校行事ですか',
        examples: ['文化祭', '体育祭', '修学旅行', '合唱コンクール'],
        frame: '{X}'
      }
    },
    '課題研究・探究学習': {
      role: ['班長', '発表担当', '記録担当'],
      action: ['地元商店街での聞き取り調査', 'アンケートの集計', '発表資料の作成'],
      result: ['200人分のアンケート集計と校内発表', '県の発表会への出場'],
      hard: ['協力を得られないこと', 'データがそろわないこと'],
      learned: ['調べたことを人に伝える難しさ', '根拠を持って話すことの大切さ'],
      how: ['先生への相談', '別の調べ方に切りかえたこと'],
      which: {
        label: 'どんなテーマですか',
        examples: ['地元商店街の活性化', '高齢者の見守り', '再生可能エネルギー'],
        frame: '「{X}」をテーマにした課題研究'
      }
    },
    '資格・検定の取得': {
      role: [],
      action: ['毎日30分の問題演習', '過去問の分析', '苦手分野のやり直し'],
      result: ['2級合格', '3回目での合格'],
      hard: ['苦手分野の克服', '勉強時間の確保'],
      learned: ['毎日少しずつ続けることの力', '苦手から逃げない大切さ'],
      how: ['苦手分野だけをやり直したこと', '毎日の勉強時間を決めたこと'],
      which: {
        label: 'どの資格・検定ですか',
        examples: ['日商簿記2級', '第二種電気工事士', '実用英語技能検定2級'],
        frame: '{X}の取得'
      }
    },
    '実習・実験': {
      role: ['班長', '記録担当'],
      action: ['手順書どおりの作業', '測定の記録', '器具の準備'],
      result: ['誤差を半分に減らせたこと'],
      hard: ['手順を覚えること', '数値が安定しないこと'],
      learned: ['手順どおりに進める大切さ', '記録を残すことの大切さ'],
      how: ['手順を紙に書き出したこと', '先生に確認しながら進めたこと'],
      which: {
        label: 'どの実習・実験ですか',
        examples: ['旋盤実習', '課題製作', '調理実習', '看護実習'],
        frame: '{X}'
      }
    },
    '勉強・定期考査': {
      role: [],
      action: ['毎日2時間の学習', '間違い直しノートの作成'],
      result: ['学年順位が20位上がったこと', '評定の向上'],
      hard: ['部活動との両立', '苦手教科の克服'],
      learned: ['計画を立てて進める大切さ', 'できない原因を見つけること'],
      how: ['計画表の作成', '朝の時間を使ったこと'],
      which: {
        label: 'どの教科に、いちばん力を入れましたか',
        examples: ['数学', '簿記', '英語', '情報'],
        frame: '{X}の勉強'
      }
    },
    'アルバイト': {
      role: ['シフトリーダー', '新人教育担当'],
      action: ['混雑する時間帯の動き方のメモ作り', '品出しの手順の見直し', '新人への説明'],
      result: ['新しく入った人への引き継ぎ', 'ミスの件数が半分に'],
      hard: ['忙しい時間帯の対応', 'お客様からの指摘'],
      learned: ['相手に合わせて話すことの大切さ', '報告・連絡の大切さ', '段取りで仕事の速さが変わること'],
      how: ['先輩への相談', '動き方をメモにまとめたこと', '声かけを増やしたこと'],
      which: {
        label: 'どんなアルバイトですか',
        examples: ['コンビニ', '飲食店のホール', 'スーパーの品出し'],
        frame: '{X}でのアルバイト'
      }
    },
    'ボランティア': {
      role: ['班のまとめ役'],
      action: ['地域の清掃活動', '子どもへの学習支援', '募金の呼びかけ'],
      result: ['月1回の活動を2年間継続'],
      hard: ['参加者が集まらないこと', '相手に合わせて話すこと'],
      learned: ['相手の立場で考えることの大切さ', '続けることで信頼が生まれること'],
      how: ['相手に合わせて話し方を変えたこと', '呼びかけの工夫'],
      which: {
        label: 'どんなボランティアですか',
        examples: ['地域の清掃活動', '子ども食堂の手伝い', '福祉施設での活動'],
        frame: '{X}'
      }
    },
    '皆勤・無遅刻無欠席': {
      role: [],
      action: ['毎日の早起き', '体調管理', '前日の準備'],
      result: ['3年間の皆勤', '無遅刻無欠席'],
      hard: ['体調をくずしたとき', '朝が苦手なこと'],
      learned: ['体調を整えることの大切さ', '当たり前を続ける難しさ'],
      how: ['早寝早起きの習慣づけ', '前日の準備'],
      which: null
    },
    '地域の活動': {
      role: ['高校生代表'],
      action: ['祭りの運営の手伝い', '地域の方への聞き取り'],
      result: ['来場者からの感謝の言葉'],
      hard: ['大人の中で意見を言うこと'],
      learned: ['年齢のちがう人と話すこと', '地域に支えられていること'],
      how: ['先に自分の考えをまとめておいたこと', '大人の方への質問'],
      which: {
        label: 'どんな活動ですか',
        examples: ['地元の祭りの運営', '消防団の手伝い', '公民館での行事'],
        frame: '{X}'
      }
    },
    '習い事・クラブチーム': {
      role: ['キャプテン', '学年リーダー'],
      action: ['週3回の練習', '基礎の反復'],
      result: ['大会出場', '級の取得'],
      hard: ['学校生活との両立'],
      learned: ['基礎をくり返す大切さ', '両立するための時間の使い方'],
      how: ['時間の使い方の見直し', '基礎練習に戻ったこと'],
      which: {
        label: '何の習い事・チームですか',
        examples: ['ピアノ', '空手', '地域のサッカークラブ'],
        frame: '{X}'
      }
    },
    '作品づくり・制作': {
      role: ['制作担当'],
      action: ['作品の設計', '毎日の制作時間の確保'],
      result: ['コンクールへの出品', '展示'],
      hard: ['思いどおりの形にならないこと'],
      learned: ['納得いくまで直す大切さ', '締め切りから逆算すること'],
      how: ['試作をくり返したこと', '人に見てもらったこと'],
      which: {
        label: 'どんな作品ですか',
        examples: ['木工の椅子', '短編アニメーション', '油絵'],
        frame: '{X}の制作'
      }
    },
    '大会・コンクールへの挑戦': {
      role: ['代表', 'チームリーダー'],
      action: ['過去の入賞作品の研究', '毎日の練習'],
      result: ['県大会出場', '入賞'],
      hard: ['結果が出ない時期', '緊張への対応'],
      learned: ['結果が出ない時期の過ごし方', '本番までの準備の大切さ'],
      how: ['基礎からのやり直し', '本番と同じ形での練習'],
      which: {
        label: 'どの大会・コンクールですか',
        examples: ['技能検定の競技会', '写真コンクール', '県の弁論大会'],
        frame: '{X}への挑戦'
      }
    },
    '家の手伝い・家業': {
      role: [],
      action: ['毎日の夕食づくり', '店の手伝い', '弟妹の世話'],
      result: ['家族から任されるようになったこと'],
      hard: ['学校生活との両立', '時間のやりくり'],
      learned: ['任される責任の重さ', '家族と時間を合わせること'],
      how: ['家族と分担を決めたこと', '前の日に準備しておくこと'],
      which: {
        label: 'どんな手伝い・家業ですか',
        examples: ['夕食づくり', '祖父母の農作業', '店の接客'],
        frame: '{X}'
      }
    }
  };

  const ACTIVITY_DEFAULT = {
    role: ['リーダー', '記録担当', 'まとめ役'],
    action: ['毎日の記録', '手順の見直し', '仲間への声かけ'],
    result: ['続けられたこと', '周りの反応が変わったこと'],
    hard: ['時間のやりくり', '意見がまとまらないこと'],
    learned: ['続けることの大切さ', '人に合わせて説明を変える力'],
    how: ['やり方の見直し', '人への相談', '時間の使い方を変えたこと'],
    which: null
  };

  /** 選ばれた活動に合わせた例。自由入力の活動には共通の例を返す */
  function activityOf(label) {
    return ACTIVITY[label] || ACTIVITY_DEFAULT;
  }

  /** n 番目に選んだ活動 */
  function effortAt(d, i) {
    return ((d || {}).efforts || [])[i] || '';
  }

  /** 述語で書かれていたら「〜こと」で受け直す（生成側と同じ規則） */
  function asNoun(word) {
    const t = txt(word);
    if (!t) return '';
    const plain = plainWord(t);
    return isPredicate(plain) ? plain + 'こと' : t;
  }

  /**
   * 打ち込んだことの呼び名。
   * 「どれ」まで答えていれば、活動の種類ではなくその名前で呼ぶ。
   *   部活動 ＋ 吹奏楽部   → 吹奏楽部での活動
   *   学校行事 ＋ 文化祭   → 文化祭
   *   アルバイト ＋ コンビニ → コンビニでのアルバイト
   */
  function effortTopWord(d) {
    const top = effortAt(d, 0);
    if (!top) return '';
    const which = txt((d || {}).effortWhich);
    const w = activityOf(top).which;
    if (!which || !w) return asNoun(top);
    return w.frame.replace('{X}', which);
  }

  /**
   * 「そう思うきっかけ」を、文の頭につなげる形にする。
   *   部室の道具置き場を整理した → 部室の道具置き場を整理した経験から、
   *   毎日の片づけ               → 毎日の片づけの経験から、
   *   毎日片づけをしています     → 毎日片づけをしている経験から、
   */
  function fromEpisode(v, short) {
    const t = txt(v);
    if (!t) return '';
    const plain = txt(plainWord(t)).replace(/だ$/, '');
    if (!plain) return '';
    if (/経験$/.test(plain)) return plain + 'から、';
    // 性格と得意なことで2文続くので、受け方を変えて同じ言い回しが並ばないようにする
    if (short) return plain + (isPredicate(plain) ? 'ことから、' : 'から、');
    return (isPredicate(plain) ? plain : plain + 'の') + '経験から、';
  }

  /** 得意なこと・性格の一文（プレビューと生成側で同じ形） */
  function traitSentence(d, isJob) {
    const t = ((d || {}).personality || [])[0];
    if (!t) return '';
    const from = fromEpisode(d.personalityEpisode);
    const scene = sceneAt(d.personalityScene);
    if (from) return from + '自分では「' + t + '」という点が強みだと思っています。';
    if (scene) return '自分では「' + t + '」という点が強みで、' + scene + '活かせると思います。';
    return '自分では「' + t + '」という点が強みだと思っています。';
  }

  function strengthSentence(d, isJob) {
    const t = ((d || {}).strengths || [])[0];
    if (!t) return '';
    const from = fromEpisode(d.strengthEpisode, true);
    const scene = sceneAt(d.strengthScene);
    const head = isJob ? '仕事で活かせそうな点は' : '得意なのは';
    if (from) return from + '「' + t + '」には自信があります。';
    if (scene) return '得意な「' + t + '」は、' + scene + '役に立つと思います。';
    return head + '「' + t + '」です。';
  }

  /** 「いちばん力を入れてきたのは〜です。」の一文（プレビューと生成側で同じ形） */
  function effortTopSentence(d) {
    const word = effortTopWord(d) || '学校生活';
    return ((d || {}).effortWhen || '1年生から3年間') + '、いちばん力を入れてきたのは' + word + 'です。';
  }

  /** 活動名を「」でくくる。未選択なら「その活動」 */
  function effortName(d) {
    const which = txt((d || {}).effortWhich);
    const t = which || effortAt(d, 0);
    return t ? '「' + t + '」' : 'その活動';
  }

  /** 学年・クラス・出席番号。手で書かせると表記がばらつくので、選ぶ形にする */
  const GRADES = ['1年', '2年', '3年'];
  const CLASS_GROUPS = (function () {
    const a = [];
    for (let i = 1; i <= 12; i++) a.push(i + '組');
    return a.concat(['A組', 'B組', 'C組', 'D組']);
  })();
  const SEAT_NUMBERS = (function () {
    const a = [];
    for (let i = 1; i <= 50; i++) a.push(i + '番');
    return a;
  })();

  /** 3つの選択を1つの表示にまとめる（提出用・印刷用） */
  function classLabel(d) {
    const a = [txt((d || {}).grade), txt((d || {}).classGroup), txt((d || {}).seatNo)]
      .filter(Boolean);
    return a.length ? a.join(' ') : '';
  }

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

  /** 種類を選んだあと、その種類に合った書き方の例を出す */
  const FEATURE_EXAMPLES = {
    // 進学
    '授業': ['地域経済フィールドワーク', '簿記演習Ⅰ', '医療事務総論'],
    '演習': ['少人数での課題演習', 'グループ発表の演習'],
    'ゼミ': ['地域経済ゼミ', '2年次からのゼミ'],
    '実習': ['病院での臨地実習', '企業インターンシップ'],
    '研究室': ['環境デザイン研究室', '食品科学研究室'],
    '学科': ['経済学科', '医療事務学科'],
    'コース': ['医療事務コース', '国際ビジネスコース'],
    'プログラム': ['海外研修プログラム', '地域連携プログラム'],
    '留学制度': ['半年間の交換留学', '短期語学研修'],
    '施設': ['実習用の模擬病室', '24時間使える自習室'],
    '行事': ['学科合同の発表会', '地域との交流イベント'],
    // 就職
    '製品': ['自社ブランド「△△」', '〇〇向けの精密部品'],
    '技術': ['〇〇部品の精密加工', 'ミクロン単位の測定技術'],
    'サービス': ['24時間体制の保守サービス', '設置後の定期点検'],
    '設備': ['最新の5軸加工機', '自社の検査ライン'],
    '事業': ['地域の建物のリフォーム事業', '海外向けの輸出事業'],
    '研修制度': ['3か月の新人研修', '先輩がつくメンター制度'],
    '職場の体制': ['作業前の声かけの徹底', '2人1組での安全確認'],
    '仕事の進め方': ['検査から出荷までの一貫生産', '毎朝の作業計画の共有'],
    // 共通
    '資格支援制度': ['資格取得の費用補助', '対策講座の無料開講'],
    '取り組み': ['地域の清掃活動', '不良品ゼロへの取り組み']
  };

  /** 名詞で言い切っている語尾（「という点」を足すと二重になる） */
  const FEATURE_NOUN_TAIL = /(点|ところ|こと|違い|ちがい|さ|性|力|制度|体制|方針|環境|雰囲気)$/;

  /**
   * 「調べていて心をひかれたもの」の一文（生成側 sFeature と同じ形）。
   * かぎかっこを付けるかどうかは、Q3の答えで決まる。
   *   載っていた言葉    → 貴社の技術「〇〇部品の精密加工」です。
   *   自分の言葉        → 貴社の技術のうち、少人数で進めるという点です。
   *   自分の言葉（名詞）→ 貴社の技術のうち、安全への意識の高さです。
   */
  function featureSentence(d, mode) {
    const name = txt((d || {}).featureName);
    if (!name) return '';
    const isJobMode = job(mode);
    const kind = txt(d.featureKind) || (isJobMode ? '取り組み' : '学び');
    const org = txt(d.targetName) || orgTypeOf(mode, d.orgType).honorific;
    const lead = '私が特に関心を持ったのは、' + org + 'の';
    if (d.featureNamed !== 'いいえ、自分の言葉で書いた') {
      return lead + kind + '「' + name + '」です。';
    }
    return lead + kind + 'のうち、' + name
      + (FEATURE_NOUN_TAIL.test(name) ? 'です。' : 'という点です。');
  }

  /**
   * 「それを、なぜ魅力に感じましたか」の一文（生成側 sFeatureDetail と同じ形）。
   * 「〜だから」と理由で書く人、「〜できること」と名詞で書く人がいるので分ける。
   */
  function featureDetailSentence(v) {
    const t = txt(v);
    if (!t) return '';
    if (/(こと|点|ところ)$/.test(t)) return t + 'に、大きな魅力を感じています。';
    const plain = txt(plainWord(t)).replace(/(ので|ため)$/, 'から').replace(/から$/, '');
    if (!plain) return '';
    return isPredicate(plain)
      ? '魅力に感じたのは、' + plain + 'からです。'
      : plain + 'という点に、大きな魅力を感じています。';
  }

  /** 種類に合った例。表にないものは、進路ごとの共通の例を返す */
  function featureExamples(d, isJob) {
    const k = txt((d || {}).featureKind);
    if (FEATURE_EXAMPLES[k]) return FEATURE_EXAMPLES[k];
    return isJob
      ? ['〇〇部品の精密加工', '自社ブランド「△△」', '24時間体制の保守サービス']
      : ['地域経済フィールドワーク', '海外研修プログラム', '医療事務コース'];
  }

  /** 志望理由のひとこと：語尾（{X} に生徒が書いた名詞が入る） */
  // dup … 枠が足す名詞。答えがすでにその名詞で終わっていたら dupFrame を使う
  //        （「倉庫管理の技術」＋「技術を身につけたい」＝「技術の技術」を防ぐ）
  const WANT_VERB_SHINGAKU = [
    { label: '学びたい', frame: '{X}について学びたい', pred: '{X}ことを学びたい' },
    { label: '身につけたい', frame: '{X}を身につけたい', pred: '{X}力を身につけたい' },
    {
      label: '理解を深めたい', frame: '{X}への理解を深めたい', pred: '{X}ことへの理解を深めたい',
      dup: '理解', dupFrame: '{X}を深めたい'
    },
    { label: '研究したい', frame: '{X}について研究したい', pred: '{X}ことについて研究したい' },
    {
      label: '経験を積みたい', frame: '{X}の経験を積みたい', pred: '{X}経験を積みたい',
      dup: '経験', dupFrame: '{X}を積みたい'
    },
    { label: '挑戦したい', frame: '{X}に挑戦したい', pred: '{X}ことに挑戦したい' },
    { label: '将来の仕事につなげたい', frame: '{X}を将来の仕事につなげたい', pred: '{X}ことを将来の仕事につなげたい' },
    { label: '役に立ちたい', frame: '{X}の役に立ちたい', pred: '{X}ことで人の役に立ちたい' }
  ];

  const WANT_VERB_SHUSHOKU = [
    { label: '取り組みたい', frame: '{X}に取り組みたい', pred: '{X}ことに取り組みたい' },
    {
      label: '技術を身につけたい', frame: '{X}の技術を身につけたい', pred: '{X}技術を身につけたい',
      dup: '技術', dupFrame: '{X}を身につけたい'
    },
    { label: '作りたい', frame: '{X}を作りたい', pred: '{X}ものを作りたい' },
    { label: '支えたい', frame: '{X}を支えたい', pred: '{X}人を支えたい' },
    { label: '任されるようになりたい', frame: '{X}を任されるようになりたい', pred: '{X}ことを任されるようになりたい' },
    { label: '挑戦したい', frame: '{X}に挑戦したい', pred: '{X}ことに挑戦したい' },
    {
      label: '長く続けたい', frame: '{X}を長く続けたい', pred: '{X}仕事を長く続けたい',
      dup: '仕事', dupFrame: '{X}を長く続けたい'
    },
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

  /** 選んだ選択肢を並べた引用文（「まじめ」「責任感が強い」について） */
  function listRefer(list) {
    const a = (list || []).slice(0, 3).filter(function (x) { return txt(x); });
    if (!a.length) return '';
    return a.map(function (x) { return '「' + txt(x) + '」'; }).join('') + 'について';
  }

  /**
   * 「活かせる場面」の答えを、文の中につなげる形にする。
   *   後輩に手順を教える場面 → 後輩に手順を教える場面で
   *   レジが混雑したとき     → レジが混雑したときに
   *   後輩に手順を教える     → 後輩に手順を教える場面で
   *   品出し                 → 品出しの場面で
   * 生徒は「場面」まで書く人、動作だけ書く人、名詞だけ書く人に分かれるため。
   */
  function sceneAt(v) {
    let t = txt(v);
    if (!t) return '';
    // 「お客様に声をかけます」のような丁寧語は、文の途中に置けないので常体に直す
    t = txt(plainWord(t)).replace(/だ$/, '');
    if (!t) return '';
    // 「〜ときに」「〜場面で」のように助詞まで書く人がいるので、いったん落とす
    t = t.replace(/(には|では|にて|に|は)$/, '');
    t = t.replace(/([一-龥ァ-ヶー])で$/, '$1');
    // 「意見をまとめること」→「意見をまとめる」。「ことの場面で」を防ぐ。
    // 「こと」で受けていた時点で述語だと分かるので、動詞判定は通さない
    const wasKoto = /(.)こと$/.test(t);
    if (wasKoto) t = t.replace(/こと$/, '');
    if (!t) return '';
    if (/(とき|時|場合|際)$/.test(t)) return t + 'に';
    if (/(場面|ところ|作業|仕事|シーン|局面)$/.test(t)) return t + 'で';
    // 「お客様に声をかける」のように、かなだけで終わる動詞は isPredicate では拾えない。
    // 助詞を含む＝ひとまとまりの動作、と見て述語あつかいにする
    // （「あいさつ」のような単語をまちがえて動詞と見ないための条件）
    const clause = /[をがにへとで]/.test(t) && /[ぁ-んァ-ヶ一-龥](?:う|く|ぐ|す|つ|ぬ|ぶ|む|る)$/.test(t);
    if (wasKoto || clause || isPredicate(plainWord(t))) return t + '場面で';
    return t + 'の場面で';
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
    // 答えがすでに枠と同じ名詞で終わっていたら、名詞を重ねない枠を使う
    if (hit.dup && new RegExp(hit.dup + '$').test(plainWord(w))) {
      return frame(w, hit.dupFrame, hit.dupFrame);
    }
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
  /**
   * @param {String} mode      進学／就職
   * @param {String} template  文章の型
   * @param {Object} [data]    いまの回答。渡すと showIf による出し分けが働く。
   *                           省略すると「出る可能性のある設問」をすべて返す。
   */
  function buildSteps(mode, template, data) {
    const isJob = job(mode);
    const tpl = template || 'prep';

    function usable(f) {
      if (!f) return false;
      if (f.only && f.only.indexOf(tpl) === -1) return false;
      // 回答が渡されているときだけ、答えに応じた出し分けをする
      if (data && f.showIf && !f.showIf(data)) return false;
      return true;
    }

    /**
     * 型ごとに、必須かどうかと説明を調整する。
     *   requiredIn … この型のときだけ必須にする（骨組みを支える設問）
     *   noteIn     … この型のときだけ足す一言
     * 元の定義は書き換えず、複製に手を入れて返す。
     */
    function tune(f) {
      if (!f.requiredIn && !f.noteIn) return f;
      const out = Object.assign({}, f);
      if (f.requiredIn) out.required = f.requiredIn.indexOf(tpl) !== -1;
      if (f.noteIn && f.noteIn[tpl]) out.hint = (out.hint ? out.hint + ' ' : '') + f.noteIn[tpl];
      delete out.requiredIn;
      delete out.noteIn;
      return out;
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
            id: 'grade', group: 'me', type: 'select', label: '学年',
            options: GRADES,
            hint: 'ここから3つは、先生が誰の下書きかを見分けるためのものです。本文には出ません。'
          },
          {
            id: 'classGroup', group: 'me', type: 'select', label: 'クラス',
            options: CLASS_GROUPS
          },
          {
            id: 'seatNo', group: 'me', type: 'select', label: '出席番号',
            options: SEAT_NUMBERS
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
            id: 'orgType', group: 'target', type: 'select', required: true,
            label: isJob ? 'そこは、どういう組織ですか' : 'そこは、どの種類の学校ですか',
            refer: function (d) { return about(d.targetName); },
            options: orgTypeList(mode).map(function (o) { return o.label; }),
            default: orgTypeList(mode)[0].label,
            hint: isJob
              ? 'ここで「貴社」「貴庁」「貴院」「貴館」の呼び分けと、'
                + '「入社後」「採用後」「就職後」の言い方が決まります。'
              : '大学あてに「貴校」と書くのは、じつはまちがいです（正しくは「貴学」）。ここで呼び方が決まります。',
            preview: function (d) {
              const o = orgTypeOf(mode, d.orgType);
              return '本文では「' + o.honorific + '」「' + o.joinAfter + '」という言い方になります。'
                + '（例：同じような' + o.org + 'は他にもありますが、' + o.honorific + 'には……）';
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
            desc: 'いちばん時間をかけたことを1つ選び、そこを最後まで掘り下げます。'
              + 'ここから先の質問は、すべてその活動についての質問です。'
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
            id: 'efforts', group: 'effort', type: 'chips', max: 1,
            label: '高校生活で、いちばん時間をかけたことは何ですか', required: true,
            options: ['部活動', '生徒会', '委員会', 'クラス役員', '学校行事', '課題研究・探究学習',
              '資格・検定の取得', '実習・実験', '勉強・定期考査', 'アルバイト', 'ボランティア',
              '皆勤・無遅刻無欠席', '地域の活動', '習い事・クラブチーム', '作品づくり・制作',
              '大会・コンクールへの挑戦', '家の手伝い・家業'],
            allowFree: true,
            rerender: true,
            hint: '選べるのは1つです。いちばん時間をかけたものを選んでください。'
              + 'このあとの質問は、すべてここで選んだ活動についての質問になります。'
              + '当てはまるものがなければ、「＋ 自分で追加」から書き足せます。'
          },
          {
            id: 'effortWhich', group: 'effort', type: 'text', maxChars: 20,
            // 「学校行事」だけでは、文化祭か体育祭か修学旅行かが分からない。
            // 活動によっては聞くことがない（皆勤など）ので、そのときは出さない
            showIf: function (d) { return !!activityOf(effortAt(d, 0)).which; },
            required: true,
            // ここに書いた名前は、あとの設問の文面にも使われる
            rerender: true,
            label: function (d) {
              const w = activityOf(effortAt(d, 0)).which;
              return w ? w.label : 'それは、どれですか';
            },
            refer: function (d) { return about(effortAt(d, 0)); },
            placeholder: function (d) {
              const w = activityOf(effortAt(d, 0)).which;
              return w ? w.examples[0] : '';
            },
            examples: function (d) {
              const w = activityOf(effortAt(d, 0)).which;
              return w ? w.examples : [];
            },
            hint: '名前をそのまま書きます。ここが具体的なほど、'
              + '「本当にやってきた人の文章」に見えます。'
              + 'このあとの質問も、ここで書いた言葉を使って聞きます。',
            avoid: '「がんばった」「楽しかった」のような感想は書きません。名前だけで大丈夫です',
            preview: function (d) {
              return effortTopSentence(d);
            }
          },
          {
            id: 'effortWhen', group: 'effort', type: 'select',
            label: function (d) { return effortName(d) + 'に取り組んでいたのは、いつですか'; },
            required: true,
            refer: function (d) { return about((d.efforts || [])[0]); },
            options: EFFORT_WHEN,
            default: '1年生から3年間',
            preview: function (d) { return effortTopSentence(d); }
          },
          {
            id: 'effortRole', group: 'effort', type: 'text', maxChars: 15,
            // 「資格・検定の取得」「皆勤」など、役割という考え方がない活動では聞かない。
            // 空欄のまま置いておくと、関係のないことを書き込む原因になる
            showIf: function (d) { return activityOf(effortAt(d, 0)).role.length > 0; },
            label: function (d) { return effortName(d) + 'での役割（あれば）'; },
            refer: function (d) { return about(effortAt(d, 0)); },
            placeholder: function (d) { return activityOf(effortAt(d, 0)).role[0] || '班長'; },
            examples: function (d) { return activityOf(effortAt(d, 0)).role; },
            hint: '肩書きの名前だけ書きます。役割がなければ、空のままで構いません。',
            preview: function (d) {
              if (!txt(d.effortRole) || !txt(d.effortAction)) return '';
              return txt(d.effortRole) + 'として、' + txt(d.effortAction) + 'に取り組みました。';
            }
          },
          {
            id: 'effortAction', group: 'effort', type: 'text', maxChars: 30,
            label: function (d) { return effortName(d) + 'の中で、自分がやったこと'; },
            required: true,
            refer: function (d) { return about(effortAt(d, 0)); },
            placeholder: function (d) { return activityOf(effortAt(d, 0)).action[0]; },
            examples: function (d) { return activityOf(effortAt(d, 0)).action; },
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
            id: 'effortActionKind', group: 'effort', type: 'select', required: true,
            label: 'それは、どちらに近いですか',
            refer: function (d) { return about(d.effortAction); },
            options: ['自分がやった行動', '自分が作ったもの・仕組み'],
            default: '自分がやった行動',
            hint: '選んだほうに合わせて、文の受け方が変わります。'
              + '「メモ作り」なら行動、「手順表」なら作ったもの、というくらいの区別で大丈夫です。',
            preview: function (d) {
              const t = txt(d.effortAction);
              if (!t) return '';
              const lead = txt(d.effortRole) ? txt(d.effortRole) + 'として、' : 'その中で、';
              return d.effortActionKind === '自分が作ったもの・仕組み'
                ? frame(t, lead + '{X}を作りました。', lead + '{X}ものを作りました。')
                : frame(t, lead + '{X}に取り組みました。', lead + '{X}ことに力を注ぎました。');
            }
          },
          {
            id: 'effortResult', group: 'effort', type: 'text', maxChars: 30,
            label: 'それに取り組んだ結果、どうなりましたか',
            requiredIn: ['story'],
            noteIn: { story: 'エピソード型は体験が主役なので、ここが文章の山場になります。' },
            refer: function (d) { return about(d.effortAction); },
            only: ['prep', 'story', 'gap', 'three'],
            placeholder: function (d) { return activityOf(effortAt(d, 0)).result[0]; },
            examples: function (d) { return activityOf(effortAt(d, 0)).result; },
            hint: '数字・順位・回数が入ると説得力が出ます。'
              + '大きな結果でなくて構いません。「前より良くなったこと」で十分です。',
            preview: function (d) {
              return txt(d.effortResult) ? txt(d.effortResult) + 'は、その中で生まれた成果です。' : '';
            }
          },
          {
            id: 'effortHard', group: 'effort', type: 'text', maxChars: 30,
            only: ['prep', 'story', 'gap', 'three'],
            label: function (d) { return effortName(d) + 'で、いちばん大変だったこと'; },
            refer: function (d) { return about(effortAt(d, 0)); },
            placeholder: function (d) { return activityOf(effortAt(d, 0)).hard[0]; },
            examples: function (d) { return activityOf(effortAt(d, 0)).hard; },
            hint: '大変だったことを書くと、そのあとの「乗り越え方」が活きます。'
              + '空でも進めますが、ここが書けると文章にぐっと厚みが出ます。',
            avoid: '「大変でした」だけでは、何が大変だったのか伝わりません',
            preview: function (d) {
              return frame(d.effortHard,
                'いちばん大変だったのは{X}です。', '{X}ことが、いちばん大変でした。');
            }
          },
          {
            id: 'effortHow', group: 'effort', type: 'text', maxChars: 30,
            only: ['prep', 'story', 'gap', 'three'],
            requiredIn: ['story'],
            label: 'それを、どうやって乗り越えましたか',
            refer: function (d) { return about(d.effortHard); },
            placeholder: function (d) { return activityOf(effortAt(d, 0)).how[0]; },
            examples: function (d) { return activityOf(effortAt(d, 0)).how; },
            hint: '自分がとった行動を、ものごとの名前で書きます。'
              + '読み手がいちばん知りたいのは、困ったときにどう動く人かという点です。',
            preview: function (d) {
              if (!txt(d.effortHard)) return '';
              return frame(d.effortHow,
                'それでも{X}によって、続けることができました。',
                'それでも{X}ことで、続けることができました。');
            }
          },
          {
            id: 'effortLearned', group: 'effort', type: 'text', maxChars: 30,
            label: function (d) { return effortName(d) + 'をふり返って、学んだこと'; },
            required: true,
            refer: function (d) { return about((d.efforts || [])[0]); },
            placeholder: function (d) { return activityOf(effortAt(d, 0)).learned[0]; },
            examples: function (d) { return activityOf(effortAt(d, 0)).learned; },
            hint: '「〜の大切さ」「〜する力」の形にすると、そのまま文に入ります。',
            avoid: '「成長できました」だけでは、何を学んだか伝わりません',
            preview: function (d) {
              return txt(d.effortLearned) ? 'この経験から、' + txt(d.effortLearned) + 'を学びました。' : '';
            }
          },
          {
            id: 'strengths', group: 'youself', type: 'chips', max: 1,
            label: isJob ? '仕事で活かせそうな、自分の得意なこと' : '得意な教科・好きなこと',
            options: isJob
              ? ['体力がある', '手先が器用', '正確に作業できる', 'コツコツ続けられる', '人と話すこと',
                'あいさつ', '報告・連絡', 'パソコン操作', '計算', '機械の操作', 'ものづくり',
                '整理整頓', '早起き・時間を守る', '力仕事', '接客', '安全に気を配ること']
              : ['国語', '数学', '英語', '理科', '地歴・公民', '情報', '商業', '工業', '家庭', '保健体育',
                '美術', '音楽', '書道', '簿記', '福祉・看護',
                'プログラミング', 'ものづくり', '調べること', '発表すること', '文章を書くこと'],
            allowFree: true,
            hint: '選べるのは1つです。いちばん自信のあるものを選んでください。'
              + '選んだあと、下に「そう思うきっかけ」と「どんな場面で活かせそうか」を書く欄が出ます。'
              + '当てはまるものがなければ、「＋ 自分で追加」から書き足せます。',
            rerender: true,
            preview: function (d) { return strengthSentence(d, isJob); }
          },
          {
            id: 'strengthEpisode', group: 'youself', type: 'text', maxChars: 30,
            showIf: function (d) { return (d.strengths || []).length > 0; },
            label: function (d) {
              const t = ((d || {}).strengths || [])[0];
              return (t ? '「' + t + '」' : 'それ') + 'を選んだのは、どんなことがあったからですか';
            },
            refer: function (d) { return listRefer(d.strengths); },
            placeholder: isJob ? '部室の道具置き場を整理した' : 'クラスの発表資料をまとめた',
            examples: isJob
              ? ['部室の道具置き場を整理した', '毎日の片づけを任された', 'アルバイトで棚の並べ方を変えた']
              : ['クラスの発表資料をまとめた', '定期考査で点が伸びた', '課題研究で資料を集めた'],
            avoid: '「得意です」「好きです」だけでは、なぜそう思うのかが伝わりません',
            hint: 'そう思うようになった出来事を、ひとつだけ短く書きます。'
              + '選んだ言葉だけでは誰でも書ける文になりますが、'
              + 'ここがあると「本当にそうなんだ」と読み手に伝わります。',
            preview: function (d) { return strengthSentence(d, isJob); }
          },
          {
            id: 'strengthScene', group: 'youself', type: 'text', maxChars: 30,
            showIf: function (d) { return (d.strengths || []).length > 0; },
            label: isJob
              ? 'その得意なことは、会社のどんな場面で活かせそうですか'
              : 'その得意なことは、学校のどんな場面で活かせそうですか',
            refer: function (d) { return listRefer(d.strengths); },
            placeholder: isJob ? '部品を決まった場所に戻す場面' : 'グループで調べたことをまとめる場面',
            examples: isJob
              ? ['部品を決まった場所に戻す場面', 'お客様に声をかけるとき', '不良品を見つける作業']
              : ['グループで調べたことをまとめる場面', '実習でデータを記録するとき', '発表の資料づくり'],
            avoid: '「役に立つと思います」まで書くと文が二重になります。場面だけを書いてください',
            hint: 'その得意なことが実際に働く場面を、短い言葉で。'
              + '「〜する場面」「〜するとき」「〜の作業」のような書き方が入れやすいです。'
              + 'ここまで書けると、選んだだけの言葉が「使える力」に変わります。',
            preview: function (d) {
              const t = (d.strengths || [])[0];
              if (!t || !txt(d.strengthScene)) return '';
              if (!txt(d.strengthEpisode)) return strengthSentence(d, isJob);
              return 'この力は、' + sceneAt(d.strengthScene) + '役に立つと思います。';
            }
          },
          {
            id: 'licenses', group: 'youself', type: 'text', maxChars: 40,
            // 「資格・検定の取得」に時間をかけた人にだけ聞く。
            // 全員に聞くと空欄のまま進む人が多く、設問が増えるだけになるため。
            showIf: function (d) {
              return (d.efforts || []).indexOf('資格・検定の取得') !== -1;
            },
            label: '持っている資格・検定',
            refer: '「資格・検定の取得」に時間をかけたと答えました',
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
            id: 'personality', group: 'youself', type: 'chips', max: 1, label: '自分の性格',
            options: ['まじめ', 'こつこつ続けられる', '責任感が強い', '好奇心が強い', '人の話をよく聞く',
              'まわりを見て動ける', 'リーダーシップがある', '前向き', '落ち着いている', '明るい',
              'ていねい', '協調性がある', 'がまん強い', '人に頼られやすい', '負けずぎらい'],
            allowFree: true,
            hint: '選べるのは1つです。自分で思うものでも、人からよく言われるものでも構いません。'
              + '選んだあと、下に「そう思うきっかけ」と「どんな場面で活かせそうか」を書く欄が出ます。',
            rerender: true,
            preview: function (d) { return traitSentence(d, isJob); }
          },
          {
            id: 'personalityEpisode', group: 'youself', type: 'text', maxChars: 30,
            showIf: function (d) { return (d.personality || []).length > 0; },
            label: function (d) {
              const t = ((d || {}).personality || [])[0];
              return (t ? '「' + t + '」' : 'それ') + 'を選んだのは、どんなことがあったからですか';
            },
            refer: function (d) { return listRefer(d.personality); },
            placeholder: isJob ? '任された係を3年間続けた' : '班の記録係を最後まで務めた',
            examples: isJob
              ? ['任された係を3年間続けた', '先生に頼まれた仕事をやり切った', '毎朝いちばんに教室を開けた']
              : ['班の記録係を最後まで務めた', '友人の相談によく乗った', '苦手な教科を3年間続けた'],
            avoid: '「まじめです」だけでは、なぜそう言えるのかが伝わりません',
            hint: '性格は、出来事とセットにして初めて信じてもらえます。'
              + '自分でそう思った出来事でも、人からそう言われた場面でも構いません。',
            preview: function (d) { return traitSentence(d, isJob); }
          },
          {
            id: 'personalityScene', group: 'youself', type: 'text', maxChars: 30,
            showIf: function (d) { return (d.personality || []).length > 0; },
            label: isJob
              ? 'その性格は、会社のどんな場面で活かせそうですか'
              : 'その性格は、学校のどんな場面で活かせそうですか',
            refer: function (d) { return listRefer(d.personality); },
            placeholder: isJob ? '後輩に手順を教える場面' : '班で意見が分かれたとき',
            examples: isJob
              ? ['後輩に手順を教える場面', '同じ作業を毎日続けるとき', '締め切りが近いとき']
              : ['班で意見が分かれたとき', '長い期間の課題に取り組むとき', '初めての実習'],
            avoid: '「頑張りたいです」まで書くと文が二重になります。場面だけを書いてください',
            hint: '性格は、場面とセットにして初めて相手に伝わります。'
              + '「まじめです」だけでは誰にでも書けますが、'
              + '「同じ作業を毎日続けるとき」まで書くと、あなたの話になります。',
            preview: function (d) {
              const t = (d.personality || [])[0];
              if (!t || !txt(d.personalityScene)) return '';
              if (!txt(d.personalityEpisode)) return traitSentence(d, isJob);
              return 'この強みは、' + sceneAt(d.personalityScene) + '活かせると思います。';
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
            requiredIn: ['future'],
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
        ].filter(usable).map(tune)
      },

      // ───────────────────────────── 学校／会社を知る
      {
        id: 'recall',
        no: 3,
        title: '思い出す',
        lead: isJob
          ? 'ここがこの文章の心臓部です。調べる前に、まず「心が動いた瞬間」を思い出してください。'
          : 'ここがこの文章の心臓部です。調べる前に、まず「心が動いた瞬間」を思い出してください。',
        note: '見学や説明会のときのメモ・写真・もらった資料があれば、手元に出しておくと思い出しやすくなります。',
        groups: [
          {
            id: 'meet',
            name: isJob ? 'その会社との出会い' : 'その学校との出会い',
            desc: 'どこで知って、どこまで足を運んだか。事実をそのまま選びます。'
          },
          {
            id: 'card',
            name: '心が動いた場面',
            desc: 'ここがこの文章の主役です。ほかのどの設問より、時間をかける価値があります。'
          }
        ],
        fields: [
          {
            id: 'knewBy', group: 'meet', type: 'select',
            only: ['story'],
            requiredIn: ['story'],
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
            hint: '足を運んだ事実そのものが、志望の本気度を示します。'
              + '魅力カードに書いた場面と重なるものは、同じ話をくり返さないよう文章では省かれます。'
              + 'まだなら「まだ行っていない」を選んでください（文章には出ません）。',
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
            noteIn: {
              scene: '★ 場面描写型は、この1枚目のカードが文章の書き出しそのものになります。'
                + 'いちばん心が動いた場面を選んでください。',
              three: '三つの理由型では、二つ目の理由がまるごとこのカードでできています。'
            },
            hint: '「いいな」と心が動いた瞬間を、1枚ずつカードにします。'
              + 'ここに書いたことが、そのまま本文の中心になります。まず1枚。できれば2〜3枚。'
              + '立派なことを書く必要はありません。小さくても、あなたが実際に見た場面ほど強い材料になります。',
            whatPlaceholder: isJob
              ? '社員の方が、作業を始める前に必ずおたがいに声をかけ合っていた'
              : '学生同士が、答えではなく考え方のほうを話し合っていた',
            linkPlaceholder: isJob
              ? 'アルバイトで、声をかけ合うとミスが減ったことがある'
              : '課題研究で、人と話すほど自分の考えが整理された'
          },
          {
            id: 'attractPoints', group: 'card', type: 'chips', max: 3,
            label: '上のカードに書いた魅力は、どの種類のものですか',
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
            hint: 'カードを書いていれば、本文では「ほかにも注目した点」として短く添えられます。'
              + 'カードが1枚もないときは、ここが魅力そのものの文になります。'
          },
        ].filter(usable).map(tune)
      },

      // ───────────────────────────── 調べる
      {
        id: 'research',
        no: 4,
        title: isJob ? '会社を調べる' : '学校を調べる',
        lead: isJob
          ? '思い出した場面のうしろにある「中身」を確かめます。ここが薄いと、どの会社にも出せる文章になってしまいます。'
          : '思い出した場面のうしろにある「中身」を確かめます。ここが薄いと、どの学校にも出せる文章になってしまいます。',
        note: isJob
          ? '手元に用意すると早いもの：求人票／会社のホームページ／会社案内'
          : '手元に用意すると早いもの：学校案内のパンフレット／学校のホームページ／シラバス',
        groups: [
          {
            id: 'found',
            name: '調べて分かったこと',
            desc: isJob
              ? '求人票と会社のホームページから、この会社ならではの中身を書き出します。'
              : 'パンフレットと学校のホームページから、この学校ならではの中身を書き出します。'
          }
        ],
        fields: [
          {
            id: 'featureKind', group: 'found', type: 'select', required: true,
            // 先に「どの種類か」を決めておくと、次の欄で何を書けばよいかが定まる
            label: isJob
              ? '調べていて、いちばん心をひかれたのは、どれですか'
              : '調べていて、いちばん心をひかれたのは、どれですか',
            rerender: true,
            options: isJob ? FEATURE_KIND_SHUSHOKU : FEATURE_KIND_SHINGAKU,
            default: isJob ? '技術' : '授業',
            hint: (isJob
              ? '求人票や会社のホームページを見ながら、いちばん「いいな」と思ったものの種類を選びます。'
              : 'パンフレットや学校のホームページを見ながら、いちばん「いいな」と思ったものの種類を選びます。')
              + '次の欄で、その名前や魅力をくわしく書きます。',
            preview: function (d) {
              const kind = txt(d.featureKind);
              if (!kind) return '';
              const org = txt(d.targetName) || orgTypeOf(mode, d.orgType).honorific;
              return '私が特に関心を持ったのは、' + org + 'の' + kind + '「……」です。';
            }
          },
          {
            id: 'featureName', group: 'found', type: 'text', maxChars: 40, required: true,
            label: function (d) {
              const kind = txt(d.featureKind);
              if (kind) return 'その「' + kind + '」の名前、または魅力';
              return isJob
                ? '調べていて、いちばん心をひかれた技術・制度・製品などの魅力'
                : '調べていて、いちばん心をひかれた学び・制度・施設などの魅力';
            },
            refer: function (d) {
              const kind = txt(d.featureKind);
              return kind ? '「' + kind + '」を選びました' : '';
            },
            // ここに書いた言葉を、あとの設問がそのまま引用する
            rerender: true,
            placeholder: function (d) { return featureExamples(d, isJob)[0]; },
            examples: function (d) { return featureExamples(d, isJob); },
            hint: (isJob
              ? '求人票や会社案内に載っている表記どおりに写します。'
              : 'パンフレットやシラバスに載っている表記どおりに写します。')
              + '載っていなければ「少人数で進める」のように、自分の言葉で魅力を書いて構いません。'
              + 'ここに固有名詞が入るかどうかで、文章の説得力が決まります。',
            avoid: '「〜に魅力を感じた」「〜がよかった」のような感想は書きません。'
              + '載っていればその名前を、なければ「少人数で進める」のように短く言い表します',
            preview: function (d) { return featureSentence(d, mode); }
          },
          {
            id: 'featureNamed', group: 'found', type: 'select', required: true,
            // かぎかっこを付けるかどうかが変わるので、この1問だけは残す。
            // 生徒が実際に書いた言葉を引用して、はい／いいえで答えられるようにする
            label: function (d) {
              const n = txt(d.featureName);
              const src = isJob ? '求人票やホームページ' : 'パンフレットやホームページ';
              return (n ? '「' + n + '」' : 'その言葉') + 'は、' + src + 'に載っていた言葉ですか';
            },
            options: ['はい、載っていた言葉をそのまま書いた', 'いいえ、自分の言葉で書いた'],
            default: 'はい、載っていた言葉をそのまま書いた',
            hint: function (d) {
              const kind = txt(d.featureKind) || (isJob ? '取り組み' : '学び');
              const h = orgTypeOf(mode, d.orgType).honorific;
              return 'かぎかっこを付けるかどうかが変わるだけの設問です。'
                + '「はい」なら『' + h + 'の' + kind + '「◯◯」です。』、'
                + '「いいえ」なら『' + h + 'の' + kind + 'のうち、◯◯という点です。』という文になります。';
            },
            preview: function (d) { return featureSentence(d, mode); }
          },
          {
            id: 'featureDetail', group: 'found', type: 'text', maxChars: 30,
            only: ['prep', 'future', 'scene', 'three'],
            requiredIn: ['prep', 'scene'],
            noteIn: {
              prep: '結論先行型では、この一文が結論を支える理由になります。',
              scene: '場面描写型では、あの場面のあとに続く「調べて分かったこと」になります。'
            },
            label: function (d) {
              const n = txt(d.featureName);
              return (n ? '「' + n + '」' : 'それ') + 'を、なぜ魅力に感じましたか';
            },
            refer: function (d) { return about(d.featureName); },
            placeholder: isJob ? '若手でも挑戦できるから' : '自治体と組んで課題を調べられるから',
            examples: isJob
              ? ['若手でも挑戦できるから', '検査から出荷まで自社でやっているから', '安全への意識の高さ']
              : ['自治体と組んで課題を調べられるから', '2年次から少人数で学べるから', '現場で実習できること'],
            hint: 'そこに心をひかれた理由を、ひとことで。'
              + '「〜だから」で書いても、「〜できること」「〜の◯◯」のように名詞で書いても構いません。'
              + 'ここが書けると、調べたことが「自分の理由」に変わります。',
            avoid: '「すごい」「よかった」だけでは、何がよいのか読み手に伝わりません',
            preview: function (d) { return featureDetailSentence(d.featureDetail); }
          },
          {
            id: 'featureSource', group: 'found', type: 'select',
            only: ['prep', 'scene', 'three'],
            label: 'そのことを、どこで知りましたか',
            refer: function (d) { return about(d.featureName); },
            options: isJob
              ? ['求人票', '会社のホームページ', '会社案内・パンフレット', '会社説明会',
                '職場見学', '先輩社員の話', '先生の話']
              : ['学校案内・パンフレット', '学校のホームページ', 'シラバス', 'オープンキャンパス',
                '体験授業', '在校生・卒業生の話', '先生の話'],
            hint: '「どこで知ったか」まで書けると、調べた事実がはっきり伝わります。',
            preview: function (d) {
              return txt(d.featureName) && txt(d.featureSource)
                ? 'このことは、' + txt(d.featureSource) + 'で知りました。' : '';
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
            requiredIn: ['three'],
            noteIn: { three: '三つの理由型では、二つ目の理由を補う材料になります。' },
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
        ].filter(usable).map(tune)
      },

      // ───────────────────────────── つなげる
      {
        id: 'connect',
        no: 5,
        title: 'つなげる',
        lead: isJob
          ? '「自分」と「会社」を1本の線でつなぎます。ここが志望動機の心臓部です。'
          : '「自分」と「学校」を1本の線でつなぎます。ここが志望理由の心臓部です。',
        groups: [
          {
            id: 'value',
            name: 'あなたが大事にしていること',
            desc: 'ここまでに書いた「心が動いた場面」と「自分の経験」に、共通するものを探します。'
              + 'ここが見つかると、志望理由に芯が通ります。'
          },
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
        ],
        fields: [
          {
            id: 'valueFound', group: 'value', type: 'text', maxChars: 30,
            label: 'あなたが大事にしていると気づいたこと',
            refer: function (d) {
              const c = (d.attractCards || []).find(function (x) { return x && txt(x.what); });
              if (!c) return '';
              const w = txt(c.what);
              return '心が動いた場面「' + w.slice(0, 18) + (w.length > 18 ? '…' : '') + '」から';
            },
            placeholder: '人と話しながら考えを深めること',
            examples: ['人と話しながら考えを深めること', '手を動かして確かめること',
              '最後まで責任を持つこと', '声をかけ合って進めること'],
            hint: '心が動いた場面と、自分ががんばってきたこと。'
              + 'その両方に共通しているものを、ひとことで書きます。'
              + '**あなたの行動**を「〜すること」の形で書くと入れやすいです。',
            avoid: '「会社の雰囲気」「学校の設備」のような志望先のよさではなく、'
              + 'あなた自身が大事にしている行動を書きます',
            preview: function (d) {
              return frame(d.valueFound,
                'そこから私は、{X}を大切にするようになりました。',
                'そこから私は、{X}ことを大切にするようになりました。');
            }
          },
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
            avoid: '3つとも同じことを書き直すと掘り下げになりません。'
              + 'また「成長できる」「やりがいがある」は誰にでも当てはまるので、'
              + '自分の体験に近い言葉まで降りてください'
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
        ].filter(usable).map(tune)
      },

      // ───────────────────────────── その先
      {
        id: 'after',
        no: 6,
        title: 'その先を書く',
        lead: isJob
          ? '最後に、入社してからのことを書きます。ここまでの話がここへ着地します。'
          : '最後に、入学してからのことを書きます。ここまでの話がここへ着地します。',
        groups: [
          {
            id: 'after',
            name: isJob ? '入社したあとのこと' : '入学したあとのこと',
            desc: '入ってからの姿を書くと、読み手が一緒に働く／学ぶ場面を想像できます。'
          },
          {
            id: 'far',
            name: 'その先の自分',
            desc: '文章の締めくくりになります。大きな夢でなくて構いません。'
          }
        ],
        fields: [
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
          {
            id: 'contribution', group: 'after', type: 'text', maxChars: 30,
            label: isJob ? 'その仕事で活かせる、自分の力の名前' : 'その学びの場で活かせる、自分の力の名前',
            refer: function (d) {
              return about(isJob ? (txt(d.targetSub) || '希望する職種') : (txt(d.targetSub) || txt(d.targetName)));
            },
            placeholder: '手順を崩さずに作業を続ける力',
            examples: ['手順を崩さずに作業を続ける力', '初対面の人と話す力', '体力と早起きの習慣'],
            hint: '大げさな力でなくて構いません。実際に続けてきたことほど信じてもらえます。',
            avoid: '「〜を活かして頑張りたい」まで書くと文が二重になります。力の名前だけを書きます'
          },
          {
            id: 'contributionFrom', group: 'after', type: 'select',
            label: 'その力は、どこで身につけましたか',
            refer: function (d) { return about(d.contribution); },
            options: CONTRIB_FROM,
            default: 'アルバイト',
            hint: '上の欄とセットで、「自分が会社に何を返せるか」を示す一文になります。',
            preview: function (d) {
              return txt(d.contribution)
                ? (txt(d.contributionFrom) || '高校生活') + 'で身につけた' + txt(d.contribution)
                  + (isJob ? 'は、この仕事でも活かせると考えています。' : 'は、ここでの学びにも活かせると考えています。')
                : '';
            }
          },
          {
            id: 'afterGradWhen', group: 'far', type: 'select',
            label: isJob ? '最後に、何年後の自分の話をしますか' : '最後に、いつの話で締めくくりますか',
            options: isJob ? AFTER_WHEN_SHUSHOKU : AFTER_WHEN_SHINGAKU,
            default: isJob ? '5年後' : '卒業後',
            hint: '最後の段落で「その先」を示すと、文章に前向きな余韻が残ります。'
          },
          {
            id: 'afterGradKind', group: 'far', type: 'select', required: true,
            label: 'そのときのことを、どちらで書きますか',
            options: isJob
              ? ['身につけていたい力・技術', 'なっていたい自分の姿']
              : ['目指していること', 'なっていたい自分の姿'],
            default: isJob ? '身につけていたい力・技術' : '目指していること',
            hint: '「後輩に教えられる技術」なら前者、「後輩に頼られる先輩」なら後者です。'
              + '選びまちがえると「先輩を身につけていたいです」という文になってしまいます。'
          },
          {
            id: 'dailyImage', group: 'after', type: 'text', maxChars: 30,
            label: isJob ? 'どんな場面で働いている自分を思い描きますか' : 'どんな場面で学んでいる自分を思い描きますか',
            refer: function (d) {
              const a = (d.afterEnter || []).slice(0, 2);
              return a.length ? '「' + a.join('、') + '」について' : '';
            },
            placeholder: isJob ? '先輩と一緒に在庫を数えている場面' : 'ゼミで自分の考えを話している場面',
            examples: isJob
              ? ['先輩と一緒に在庫を数えている場面', '機械の音を聞き分けている場面', '後輩に手順を教えている場面']
              : ['ゼミで自分の考えを話している場面', '実習先で患者さんと話している場面', '地域の方に取材している場面'],
            hint: '入ってからの一場面を思い描いて書きます。'
              + '具体的な絵が浮かぶほど、本気で考えていることが伝わります。空でも進めます。',
            preview: function (d) {
              return frame(d.dailyImage,
                '{X}を思い描いています。', '{X}自分を思い描いています。');
            }
          },
          {
            id: 'contributeTo', group: 'far', type: 'text', maxChars: 25,
            label: 'いずれは、誰の役に立ちたいですか',
            placeholder: isJob ? '地域のものづくりを支える人' : '地域の高齢者',
            examples: isJob
              ? ['地域のものづくり', '現場で働く人', '製品を使う人']
              : ['地域の高齢者', '子どもたち', '同じ悩みを持つ人'],
            hint: '大きな話でなくて構いません。顔が浮かぶ相手を1つ書くと、'
              + '文章の最後に芯が通ります。空でも進めます。',
            preview: function (d) {
              return frame(d.contributeTo,
                'いずれは{X}の役に立てる人になりたいと考えています。',
                'いずれは{X}人になりたいと考えています。');
            }
          },
          {
            id: 'afterGradWhat', group: 'far', type: 'text', maxChars: 30,
            label: isJob ? 'そのとき、身につけていたいもの' : 'そのとき、目指していること',
            refer: function (d) { return about(d.afterGradWhen); },
            placeholder: isJob ? '後輩に教えられる技術' : '地域づくりに関わる仕事',
            examples: isJob
              ? ['後輩に教えられる技術', '任せてもらえる担当', '現場をまとめる力']
              : ['地域づくりに関わる仕事', '看護師として働くこと', '地元での就職'],
            hint: '志望先で身につけた先の話にすると、志望理由と一本の線でつながります。',
            preview: function (d) {
              const when = txt(d.afterGradWhen) || (isJob ? '5年後' : '卒業後');
              const lead = when + (isJob ? 'には、' : 'は、');
              if (d.afterGradKind === 'なっていたい自分の姿') {
                return frame(d.afterGradWhat,
                  lead + '{X}になっていたいです。', lead + '{X}ようになっていたいです。');
              }
              return isJob
                ? frame(d.afterGradWhat,
                  lead + '{X}を身につけていたいです。', lead + '{X}ようになっていたいです。')
                : frame(d.afterGradWhat,
                  lead + '{X}を目指したいと考えています。', lead + '{X}ことを目指したいと考えています。');
            }
          }
        ].filter(usable).map(tune)
      }
    ];
  }

  /**
   * 型による設問のちがいを数える。
   * 「型を選ぶと質問が変わる」ことを、選ぶ前に見せるために使う。
   * @returns {{total, required, special, skipped}}
   *   special … その型でだけ（または少数の型でだけ）聞く設問の数
   *   skipped … ほかの型では聞くのに、この型では聞かない設問の数
   */
  function diffFor(mode, template, data) {
    // data を渡すと、いまの答えで実際に出る設問だけを数える。
    // （得意なこと・性格を選ぶと、そのぶん設問が増えるため）
    const d = data || {};
    const here = buildSteps(mode, template, d)
      .reduce(function (a, s) { return a.concat(s.fields); }, []);
    const ids = here.map(function (f) { return f.id; });

    let widest = 0;
    TEMPLATE_IDS.forEach(function (id) {
      const n = buildSteps(mode, id, d)
        .reduce(function (a, s) { return a.concat(s.fields); }, []).length;
      if (n > widest) widest = n;
    });

    const all = {};
    TEMPLATE_IDS.forEach(function (id) {
      buildSteps(mode, id, d).forEach(function (s) {
        s.fields.forEach(function (f) { all[f.id] = true; });
      });
    });

    return {
      total: here.length,
      required: here.filter(function (f) { return f.required; }).length,
      special: here.filter(function (f) { return f.only && f.only.length <= 4; }).length,
      skipped: Object.keys(all).filter(function (id) { return ids.indexOf(id) === -1; }).length,
      widest: widest
    };
  }

  /** 型のID一覧（compose.js を読まずに済むよう、ここに持つ） */
  const TEMPLATE_IDS = ['scene', 'prep', 'story', 'future', 'gap', 'three'];

  /** チップ入力欄のうち、文章生成で「〜や〜」とつなぐ最大数 */
  const CHIP_JOIN_LIMIT = 3;

  global.QUESTIONS = {
    COURSES: COURSES,
    isPredicate: isPredicate,
    isWish: isWish,
    orgTypeList: orgTypeList,
    orgTypeOf: orgTypeOf,
    frame: frame,
    plainWord: plainWord,
    PICKER: PICKER,
    decide: decide,
    pickChars: pickChars,
    FEELINGS: FEELINGS,
    courseOf: courseOf,
    buildSteps: buildSteps,
    diffFor: diffFor,
    whereList: whereList,
    whereLead: whereLead,
    feelPhrase: feelPhrase,
    futureSentence: futureSentence,
    whySourceSentence: whySourceSentence,
    wantPhrase: wantPhrase,
    sceneAt: sceneAt,
    effortTopWord: effortTopWord,
    classLabel: classLabel,
    traitSentence: traitSentence,
    featureSentence: featureSentence,
    strengthSentence: strengthSentence,
    CHIP_JOIN_LIMIT: CHIP_JOIN_LIMIT
  };
})(window);
