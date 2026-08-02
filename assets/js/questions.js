/**
 * 設問定義（アプリの唯一の情報源）
 * ここを編集するだけで画面・保存データ・スプレッドシートの列が変わる。
 */
(function (global) {
  'use strict';

  /** 入力欄の種類
   *  text      : 1行テキスト
   *  textarea  : 複数行テキスト
   *  select    : プルダウン
   *  number    : 数値
   *  chips     : 候補から複数選択（自由追加可）
   *  whychain  : なぜ？を3段階で深掘りする専用UI
   */

  const STEPS = [
    // ───────────────────────────── STEP 1
    {
      id: 'basic',
      no: 1,
      title: '基本情報',
      lead: 'まずは、どの学校のための志望動機かをはっきりさせよう。',
      fields: [
        {
          id: 'studentName', type: 'text', label: '名前', required: true,
          placeholder: '例）山田 太郎',
          hint: '先生が誰の下書きか分かるように書きます。'
        },
        {
          id: 'juniorHigh', type: 'text', label: '中学校名',
          placeholder: '例）〇〇市立第一中学校'
        },
        {
          id: 'className', type: 'text', label: 'クラス・出席番号',
          placeholder: '例）3年2組 15番'
        },
        {
          id: 'targetSchool', type: 'text', label: '志望校名', required: true,
          placeholder: '例）〇〇県立△△高等学校',
          hint: '正式名称で書きます。「県立」「私立」まで含めて。'
        },
        {
          id: 'targetCourse', type: 'text', label: '学科・コース',
          placeholder: '例）普通科 特進コース / 総合学科 / 情報科'
        },
        {
          id: 'examType', type: 'select', label: '受験の種類',
          options: ['推薦入試', '一般入試', '特色選抜', 'その他・未定'],
          hint: '推薦なら「学校が求める生徒像」に寄せると効果的です。'
        },
        {
          id: 'targetChars', type: 'number', label: '目標の文字数', required: true,
          default: 400, min: 100, max: 2000, step: 50,
          hint: '募集要項に指定があればその数字を。指定がなければ400字が目安。'
        },
        {
          id: 'tone', type: 'select', label: '文体',
          options: ['です・ます調', 'だ・である調'],
          default: 'です・ます調',
          hint: '志望理由書は「です・ます調」が一般的です。途中で混ぜないこと。'
        }
      ]
    },

    // ───────────────────────────── STEP 2
    {
      id: 'self',
      no: 2,
      title: '自分を知る',
      lead: '志望動機の半分は「自分の話」。まずは材料を集めよう。単語だけでOK。',
      fields: [
        {
          id: 'efforts', type: 'chips', label: '中学校でがんばったこと', required: true,
          options: ['部活動', '生徒会', '委員会', '学級委員', '体育祭', '文化祭', '合唱コンクール',
            '勉強・定期テスト', '英語検定', '漢字検定', 'ボランティア', '習い事', '自主学習', '読書'],
          allowFree: true,
          hint: '当てはまるものを押す。なければ「＋自分で追加」から入力。'
        },
        {
          id: 'effortDetail', type: 'textarea', label: 'いちばん力を入れたことを、くわしく', required: true,
          rows: 4,
          placeholder: '例）バスケットボール部で副キャプテンを務めました。1年生のとき県大会1回戦で負け、練習メニューを自分たちで考え直しました。朝練を週3回増やし、3年の県大会でベスト8に入りました。',
          hint: '「いつ・何を・どうした・どうなった」の順に書くと具体的になります。数字を入れると強い。'
        },
        {
          id: 'effortLearned', type: 'textarea', label: 'そこから学んだこと・気づいたこと', required: true,
          rows: 3,
          placeholder: '例）人に任せるより自分でやった方が早いと思っていましたが、役割を分けた方がチーム全体が伸びると気づきました。',
          hint: 'ここが「あなたらしさ」になります。結果より「学び」が大事。'
        },
        {
          id: 'strengths', type: 'chips', label: '得意なこと・好きな教科',
          options: ['国語', '数学', '英語', '理科', '社会', '音楽', '美術', '技術・家庭', '保健体育',
            'プログラミング', 'ものづくり', '人と話すこと', '調べること', '発表すること', '絵を描くこと'],
          allowFree: true
        },
        {
          id: 'personality', type: 'chips', label: '自分の性格（人から言われることでもOK）',
          options: ['まじめ', 'こつこつ続けられる', '好奇心が強い', '人の話をよく聞く', 'まわりを見て動ける',
            'リーダーシップがある', '負けずぎらい', '落ち着いている', '明るい', '責任感が強い'],
          allowFree: true
        },
        {
          id: 'futureDream', type: 'text', label: '将来やってみたいこと・興味のある分野', required: true,
          placeholder: '例）看護師 / 建築の仕事 / まだ決まっていないが理科系に進みたい',
          hint: '決まっていなくて大丈夫。「〜の分野に興味がある」でも立派な動機になります。'
        },
        {
          id: 'futureWhy', type: 'textarea', label: 'そう思ったきっかけ', rows: 3,
          placeholder: '例）祖母が入院したとき、看護師さんが不安をやわらげてくれたことが忘れられません。',
          hint: '体験談があると説得力が一気に上がります。'
        }
      ]
    },

    // ───────────────────────────── STEP 3
    {
      id: 'school',
      no: 3,
      title: '学校を知る',
      lead: 'その学校を「調べた証拠」を集めよう。ここが薄いと、どの学校にも出せる文章になってしまう。',
      note: '調べ方のヒント：学校のホームページ／学校説明会・オープンスクール／学校案内パンフレット／文化祭・体育祭の見学／在校生や先輩の話',
      fields: [
        {
          id: 'knewBy', type: 'select', label: 'その学校を知ったきっかけ',
          options: ['学校説明会・オープンスクール', '文化祭・体育祭の見学', '先輩・友人から聞いた',
            '家族にすすめられた', '学校のホームページ・パンフレット', '先生からの紹介', 'その他'],
          allowFreeOther: true
        },
        {
          id: 'visited', type: 'chips', label: '実際に行った・体験したこと',
          options: ['学校説明会', 'オープンスクール', '体験授業', '部活動体験', '文化祭', '体育祭',
            '個別相談会', '学校見学', 'まだ行っていない'],
          allowFree: true
        },
        {
          id: 'visitImpression', type: 'textarea', label: '行ってみて印象に残ったこと', rows: 3,
          placeholder: '例）体験授業で、先生が「答えより考え方が大事」と言われたことが印象に残っています。生徒同士で話し合う時間が長く、自分もこの中で学びたいと思いました。',
          hint: 'その場で「見た・聞いた・感じた」ことは、他の人には書けない強い材料です。'
        },
        {
          id: 'attractPoints', type: 'chips', label: '魅力を感じた点', required: true,
          options: ['カリキュラム・授業内容', '探究学習', '進学実績', '資格取得のサポート', '部活動',
            '国際交流・留学制度', '実習・専門設備', '校風・雰囲気', '先生の熱心さ', '生徒の主体性',
            '制服', '通学のしやすさ', '地域との連携'],
          allowFree: true,
          hint: '2〜3個にしぼると、文章がぼやけません。'
        },
        {
          id: 'curriculum', type: 'textarea', label: 'その学校ならではの制度・授業・行事（名前を正確に）', required: true,
          rows: 3,
          placeholder: '例）2年次からの「探究ゼミ」で、地域の課題を自分でテーマ設定して1年間研究できる点。',
          hint: 'ここに固有名詞（制度名・コース名・行事名）を入れるのが最重要ポイントです。'
        },
        {
          id: 'clubWant', type: 'text', label: '入りたい部活動・委員会',
          placeholder: '例）吹奏楽部 / 科学部 / 生徒会'
        },
        {
          id: 'schoolPolicy', type: 'textarea', label: '学校の教育目標・求める生徒像で共感した言葉', rows: 2,
          placeholder: '例）「自ら学び、自ら考える」という教育目標',
          hint: '学校HPの「校訓」「教育方針」「アドミッションポリシー」を見てみよう。'
        }
      ]
    },

    // ───────────────────────────── STEP 4
    {
      id: 'connect',
      no: 4,
      title: 'つなげる',
      lead: '「自分」と「学校」をつなぐ、いちばん大事なステップ。ここが志望動機の心臓部です。',
      fields: [
        {
          id: 'mainReason', type: 'text', label: '志望理由をひとことで言うと？', required: true,
          placeholder: '例）探究学習を通して、地域の課題を自分で調べる力をつけたいから',
          hint: 'まだ浅くて大丈夫。次の「なぜ？」で深掘りします。'
        },
        {
          id: 'whyChain', type: 'whychain', label: 'なぜ？を3回くり返して深掘りしよう', required: true,
          source: 'mainReason',
          hint: '表面的な理由から、あなたにしか書けない本当の動機へ降りていきます。'
        },
        {
          id: 'mustReason', type: 'textarea', label: 'なぜ「他の学校ではなく」この学校なのか', required: true,
          rows: 3,
          placeholder: '例）探究学習を行う高校は他にもありますが、△△高校は地域の企業や大学と連携して発表の場まで用意されている点が違うと感じました。',
          hint: 'STEP 3 で書いた固有名詞を使うと、自然に「この学校でなければ」の理由になります。'
        },
        {
          id: 'afterEnter', type: 'chips', label: '入学したらやりたいこと', required: true,
          options: ['勉強', '部活動', '探究活動・研究', '生徒会活動', '委員会活動', '資格取得',
            '留学・国際交流', 'ボランティア活動', '学校行事', '苦手教科の克服'],
          allowFree: true,
          hint: '文章の中で「〜に取り組みたい」とつなげます。名詞（単語）で選んでください。'
        },
        {
          id: 'afterEnterDetail', type: 'textarea', label: 'それを、どのようにがんばるか', required: true,
          rows: 3,
          placeholder: '例）中学の生徒会で企画を進めた経験を活かし、探究ゼミでは自分から地域の方に取材を申し込み、最後まで形にしたいです。',
          hint: 'STEP 2 で書いた「がんばったこと」とつなげると説得力が出ます。'
        },
        {
          id: 'afterGrad', type: 'textarea', label: '卒業後の進路・将来の目標', rows: 2,
          placeholder: '例）卒業後は大学の社会学部に進み、地域づくりに関わる仕事に就きたいと考えています。',
          hint: '高校の3年間が「通過点」としてつながると、計画性のある志望動機になります。'
        }
      ]
    }
  ];

  /** チップ入力欄のうち、文章生成で「〜や〜」とつなぐ最大数 */
  const CHIP_JOIN_LIMIT = 3;

  global.QUESTIONS = { STEPS, CHIP_JOIN_LIMIT };
})(window);
