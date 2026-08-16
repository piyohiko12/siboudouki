/**
 * 画面制御（ステップ進行・入力・保存・生成・チェック・送信）
 */
(function (global) {
  'use strict';

  const cfg = global.APP_CONFIG || {};
  const STORAGE_KEY = 'shibou-douki-v2';

  // ── 状態 ──────────────────────────────────────────
  const state = {
    index: 0,
    data: {
      course: '',          // 'shingaku'（進学）/ 'shushoku'（就職）
      targetChars: 500,
      tone: 'です・ます調',
      whyChain: { why1: '', why2: '', why3: '' },
      picks: {},           // 型をえらぶ3問の答え { pickTarget: 0, ... }
      template: 'prep',
      templateManual: false, // 生徒が判定と別の型を選び直したか
      body: '',
      manualChecks: []
    },
    custom: {},          // チップの自由追加分 { fieldId: [..] }
    helpOpen: true,      // 設問の「書き方のヒント」を開いておくか
    foldDone: true,      // 答え終わった設問を1行にたたむか
    open: {},            // たたむ設定でも開いておく設問（画面を移ると空に戻す）
    touched: {},         // 生徒が自分で触った設問
    bodyEdited: false,   // 本文を手で直したか（自動再生成の上書き確認に使う）
    submitted: null
  };

  /** 選んだ進路と文章の型に応じた設問セット */
  function steps() {
    return global.QUESTIONS.buildSteps(
      state.data.course || 'shingaku', state.data.template, state.data);
  }

  function isJob() {
    return state.data.course === 'shushoku';
  }

  /**
   * 0 進路 → 1 型 → 2〜7 設問 → 8 組み立て → 9 見直し → 10 提出
   *
   * 設問は、志望動機を考える順番そのものになるように並べている。
   *   基本情報   だれが、どこへ
   *   きっかけ   志望先のどこにひかれたのか
   *   思い出す   志望先で心が動いた瞬間
   *   自分を知る 高校でやってきたことの棚おろし
   *   つなげる   自分と志望先の重なりを見つけ、志望理由の一文にする
   *   その先     入ったあと、そしてその先
   */
  function views() {
    return [
      { id: 'start', title: '進路をえらぶ', short: '進路' },
      { id: 'pick', title: '文章の型をえらぶ', short: '型' },
      { id: 'basic', title: '基本情報', short: '基本' },
      { id: 'research', title: isJob() ? '会社を選んだきっかけ' : '学校を選んだきっかけ', short: 'きっかけ' },
      { id: 'recall', title: '思い出す', short: '場面' },
      { id: 'self', title: '自分を知る', short: '自分' },
      { id: 'connect', title: 'つなげる', short: 'つなぐ' },
      { id: 'after', title: 'その先を書く', short: 'その先' },
      { id: 'compose', title: '組み立てる', short: '組立' },
      { id: 'review', title: '見直す', short: '見直し' },
      { id: 'submit', title: '提出する', short: '提出' }
    ];
  }

  /** 画面のIDから、いま何番目かを返す（並びを変えても迷子にならない） */
  function indexOf(viewId) {
    const i = views().findIndex(function (v) { return v.id === viewId; });
    return i < 0 ? 0 : i;
  }

  // ── 保存／復元 ────────────────────────────────────
  let saveTimer = null;
  // 「やり直す」を押したあとは、読み込み直すまで一切保存しない
  let saveOff = false;

  function save() {
    if (saveOff) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        data: state.data, custom: state.custom, index: state.index,
        bodyEdited: state.bodyEdited, helpOpen: state.helpOpen, foldDone: state.foldDone,
        touched: state.touched
      }));
      flashSaved();
    } catch (e) {
      console.warn('保存できませんでした', e);
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      Object.assign(state.data, saved.data || {});
      state.data.whyChain = Object.assign({ why1: '', why2: '', why3: '' }, state.data.whyChain);
      migrate();
      state.custom = saved.custom || {};
      state.bodyEdited = !!saved.bodyEdited;
      state.helpOpen = saved.helpOpen !== false;
      state.foldDone = saved.foldDone !== false;
      state.touched = saved.touched || {};
      state.index = Math.min(saved.index || 0, views().length - 1);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 旧バージョンの保存データを、今の形に寄せる */
  function migrate() {
    // 「3年2組 15番」と1行で書かせていたものを、3つの選択に分けた。
    // 前に書いた内容から、拾えるものだけ移す
    if (state.data.className && !state.data.grade) {
      const t = String(state.data.className);
      const g = t.match(/([1-3１-３一二三])\s*年/);
      const c = t.match(/([0-9０-９A-DＡ-Ｄ]+)\s*組/);
      const n = t.match(/([0-9０-９]+)\s*番/);
      const half = function (x) {
        return x.replace(/[０-９Ａ-Ｄ]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
          .replace(/一/, '1').replace(/二/, '2').replace(/三/, '3');
      };
      if (g) state.data.grade = half(g[1]) + '年';
      if (c) state.data.classGroup = half(c[1]) + '組';
      if (n) state.data.seatNo = String(Number(half(n[1]))) + '番';
    }
    delete state.data.className;
    // 「決まった名前がついていますか」は、文の形を1つにしたのでなくなった
    delete state.data.featureNamed;

    // 「印象に残ったこと」は、魅力カードの②に置き換わった
    if (state.data.visitImpression && !(state.data.attractCards || []).length) {
      state.data.attractCards = [{
        where: state.data.knewBy || '',
        what: state.data.visitImpression,
        feel: [],
        link: '',
        weight: 3
      }];
    }
    delete state.data.visitImpression;

    // 記述式だった設問を「単語で答える」形に作り替えたので、
    // 近い意味の欄へ移しておく（長すぎる場合は生徒が短くする）
    [['effortDetail', 'effortAction'],
     ['futureWhy', 'futureWhyWhat'],
     ['targetFeature', 'featureName'],
     ['jobUnderstanding', 'jobTask'],
     ['mustReason', 'mustPoint'],
     ['afterEnterDetail', 'afterAction'],
     ['mainReason', 'wantObject'],
     ['afterGrad', 'afterGradWhat']
    ].forEach(function (pair) {
      if (state.data[pair[0]] && !state.data[pair[1]]) state.data[pair[1]] = state.data[pair[0]];
      delete state.data[pair[0]];
    });

    // 旧データには存在しないテンプレートIDが入っていることがある
    if (!global.COMPOSE.TEMPLATES.some(function (t) { return t.id === state.data.template; })) {
      state.data.template = 'prep';
    }

    // 「型をえらぶ」ステップができる前の保存データには picks がない
    if (!state.data.picks || typeof state.data.picks !== 'object') state.data.picks = {};
  }

  function flashSaved() {
    const el = document.getElementById('saveIndicator');
    if (!el) return;
    el.classList.add('is-visible');
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(function () { el.classList.remove('is-visible'); }, 1400);
  }

  // ── 入力の変更通知（画面を作り直さずに関連表示を更新するため）──
  let changeListeners = [];

  function onDataChange(fn) { changeListeners.push(fn); }
  function emitChange(fieldId) {
    // 生徒が自分で触った設問を覚えておく（たたんでよいかの判断に使う）
    if (fieldId) state.touched[fieldId] = true;
    changeListeners.forEach(function (fn) { fn(fieldId); });
  }

  // ── DOM ヘルパー ──────────────────────────────────
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') el.className = attrs[k];
        else if (k === 'html') el.innerHTML = attrs[k];
        else if (k === 'text') el.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) el.setAttribute(k, attrs[k]);
      });
    }
    (children || []).filter(Boolean).forEach(function (c) {
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  /** カードの見出し（「STEP 4」を小さく上に出す） */
  function cardTitle(step, title) {
    return h('h2', { class: 'card__title' }, [
      step ? h('span', { class: 'card__step', text: 'STEP ' + step }) : null,
      document.createTextNode(title)
    ]);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── 入力欄の描画 ──────────────────────────────────
  function optionsFor(field) {
    return (field.options || []).concat(state.custom[field.id] || []);
  }

  /** label / hint / placeholder / examples は、回答に応じて変わることがある */
  function val(x) {
    return typeof x === 'function' ? x(state.data) : x;
  }

  /** 答えた設問の中身を、1行にまとめて見せる（たたんだときの表示） */
  function answerSummary(field) {
    const v = state.data[field.id];
    if (field.type === 'chips') return (v || []).join('、');
    if (field.type === 'whychain') {
      const c = state.data.whyChain || {};
      return [c.why1, c.why2, c.why3].filter(Boolean).join(' → ');
    }
    if (field.type === 'cards') {
      const n = (v || []).filter(function (c) { return c && String(c.what || '').trim(); }).length;
      return '魅力カード ' + n + '枚';
    }
    return String(v == null ? '' : v);
  }

  /**
   * 答え終わった設問を、1行にたたむ。
   * 答えるべき設問だけが開いている状態にして、長い画面でも迷わないようにする。
   */
  function renderFolded(field, no) {
    const row = h('button', {
      type: 'button',
      class: 'fieldDone ' + (field.required ? 'fieldDone--required' : 'fieldDone--optional'),
      'data-field': field.id,
      onclick: function () { state.open[field.id] = true; render(field.id); }
    }, [
      h('span', { class: 'fieldDone__check', text: '✓' }),
      h('span', { class: 'fieldDone__body' }, [
        h('span', { class: 'fieldDone__q', text: (no ? 'Q' + no + '　' : '') + val(field.label) }),
        h('span', { class: 'fieldDone__a', text: answerSummary(field) })
      ]),
      h('span', { class: 'fieldDone__edit', text: '直す' })
    ]);
    return row;
  }

  /**
   * たたんでよい設問か。
   * 初期値が入っているだけの設問は、生徒がまだ見ていないかもしれないので開いておく。
   */
  function foldable(f) {
    if (!answered(f)) return false;
    if (state.touched[f.id]) return true;
    if (f.default != null && String(state.data[f.id]) === String(f.default)) return false;
    return true;
  }

  function renderField(field, no) {
    // 答えた設問はたたんでおく。開き直すのはワンタップ
    if (state.foldDone && foldable(field) && !state.open[field.id]) {
      return renderFolded(field, no);
    }

    // 必須か任意かは、左の帯・バッジ・質問文の印の3つで示す。
    // 色の濃さだけで分けると、並んだときに見分けがつかないため。
    const wrap = h('div', {
      class: 'field ' + (field.required ? 'field--required' : 'field--optional'),
      'data-field': field.id
    });

    // 「それは」「その中で」が何を指すのかを、前の答えを引用して示す
    if (typeof field.refer === 'function') {
      const line = h('p', { class: 'field__refer' });
      const paint = function () {
        let t = '';
        try { t = field.refer(state.data) || ''; } catch (e) { t = ''; }
        line.textContent = t;
        line.classList.toggle('is-on', !!t);
      };
      paint();
      onDataChange(paint);
      wrap.appendChild(line);
    }

    // 番号とバッジを1行目、質問文を2行目にすると、長い質問でも形が崩れない
    wrap.appendChild(h('div', { class: 'field__meta' }, [
      no ? h('span', { class: 'field__no', text: 'Q' + no }) : null,
      h('span', { class: 'field__done', title: '入力済', text: '✓ 入力済' })
    ]));
    wrap.appendChild(h('label', { class: 'field__label', for: 'f_' + field.id }, [
      h('span', { class: 'field__q', text: val(field.label) }),
      field.required
        ? h('span', { class: 'badge badge--required', text: '必須' })
        : h('span', { class: 'badge badge--optional', text: '任意' })
    ]));

    // 答え終わった設問には印をつけ、残りを見つけやすくする
    const markDone = function () { wrap.classList.toggle('is-answered', answered(field)); };
    markDone();
    onDataChange(markDone);

    // 説明・例・注意はひとまとめにして、たためるようにする
    const help = [];
    const hint = val(field.hint);
    if (hint) help.push(h('p', { class: 'field__hint', text: hint }));

    // 書き方の例。押せないようにしてあるのは、写して終わりにしないため
    const examples = val(field.examples) || [];
    if (examples.length) {
      help.push(h('div', { class: 'field__ex' }, [
        h('span', { class: 'field__exCap', text: 'こんな書き方' })
      ].concat(examples.map(function (e) {
        return h('span', { class: 'field__exItem', text: e });
      }))));
    }

    if (field.avoid) {
      help.push(h('p', { class: 'field__avoid' }, [
        h('span', { class: 'field__avoidCap', text: '注意' }),
        document.createTextNode(field.avoid)
      ]));
    }

    if (help.length && state.helpOpen) {
      wrap.appendChild(h('div', { class: 'field__help' }, help));
    } else if (help.length) {
      const box = h('details', { class: 'field__help field__help--fold' }, [
        h('summary', { class: 'field__helpSum', text: '書き方のヒント' })
      ].concat(help));
      wrap.appendChild(box);
    }

    let input;
    const cur = state.data[field.id];

    switch (field.type) {
      case 'textarea':
        input = h('textarea', {
          id: 'f_' + field.id,
          class: 'input input--area',
          rows: field.rows || 3,
          placeholder: val(field.placeholder) || ''
        });
        input.value = cur || '';
        input.addEventListener('input', function () {
          state.data[field.id] = input.value;
          updateCounter(wrap, input.value);
          emitChange(field.id);
          scheduleSave();
        });
        wrap.appendChild(input);
        wrap.appendChild(h('div', { class: 'field__count', text: (cur || '').length + '字' }));
        break;

      case 'select': {
        input = h('select', { id: 'f_' + field.id, class: 'input' });
        input.appendChild(h('option', { value: '', text: '選んでください' }));
        (field.options || []).forEach(function (o) {
          input.appendChild(h('option', { value: o, text: o }));
        });
        input.value = cur || field.default || '';
        input.addEventListener('change', function () {
          state.data[field.id] = input.value;
          emitChange(field.id);
          // 選んだ内容で、あとの設問の文面や例が変わる欄は画面ごと作り直す
          if (field.rerender) { save(); render(field.id); return; }
          scheduleSave();
        });
        if (!state.data[field.id] && field.default) state.data[field.id] = field.default;
        wrap.appendChild(input);
        break;
      }

      case 'number':
        input = h('input', {
          id: 'f_' + field.id, class: 'input input--num', type: 'number',
          min: field.min, max: field.max, step: field.step
        });
        input.value = cur != null && cur !== '' ? cur : (field.default || '');
        if (state.data[field.id] == null || state.data[field.id] === '') state.data[field.id] = field.default;
        input.addEventListener('input', function () {
          state.data[field.id] = Number(input.value);
          emitChange(field.id);
          scheduleSave();
        });
        // min/max はフォーム送信時にしか効かないので、離れたときに丸める。
        // 極端な数を入れると字数調整が働かなくなるため。
        input.addEventListener('blur', function () {
          let v = Number(input.value);
          if (!v) v = field.default;
          if (field.min != null) v = Math.max(field.min, v);
          if (field.max != null) v = Math.min(field.max, v);
          input.value = v;
          state.data[field.id] = v;
          emitChange(field.id);
          save();
        });
        wrap.appendChild(input);
        break;

      case 'chips':
        wrap.appendChild(renderChips(field));
        break;

      case 'whychain':
        wrap.appendChild(renderWhyChain(field));
        break;

      case 'cards':
        wrap.appendChild(renderCards(field));
        break;

      default:
        input = h('input', {
          id: 'f_' + field.id, class: 'input', type: 'text',
          maxlength: field.maxChars || null,
          placeholder: val(field.placeholder) || ''
        });
        input.value = cur || '';
        input.addEventListener('input', function () {
          state.data[field.id] = input.value;
          updateCounter(wrap, input.value, field.maxChars);
          emitChange(field.id);
          scheduleSave();
        });
        // ここに書いた言葉が、あとの設問の文面にも使われる欄。
        // 1文字ごとに作り直すとカーソルが飛ぶので、欄を離れたときだけ作り直す
        if (field.rerender) {
          input.addEventListener('change', function () { save(); render(field.id); });
        }
        wrap.appendChild(input);
        if (field.maxChars) {
          wrap.appendChild(h('div', { class: 'field__count' }));
          updateCounter(wrap, cur || '', field.maxChars);
        }
    }

    // 入力した言葉が、本文でどんな一文になるかをその場で見せる
    if (typeof field.preview === 'function') {
      const box = h('div', { class: 'field__preview' });
      const paint = function () {
        let line = '';
        try { line = field.preview(state.data, isJob()) || ''; } catch (e) { line = ''; }
        box.innerHTML = '';
        box.classList.toggle('is-on', !!line);
        if (!line) return;
        box.appendChild(h('span', { class: 'field__previewCap', text: 'こう文になります' }));
        box.appendChild(h('p', { class: 'field__previewText', text: line }));
      };
      paint();
      onDataChange(paint);
      wrap.appendChild(box);
    }

    wrap.appendChild(h('p', { class: 'field__error', text: '' }));
    return wrap;
  }

  function updateCounter(wrap, value, max) {
    const c = wrap.querySelector('.field__count');
    if (!c) return;
    const n = String(value || '').length;
    c.textContent = max ? n + ' / ' + max + '字' : n + '字';
    c.classList.toggle('is-full', !!max && n >= max);
  }

  /**
   * 選択肢のチップ。
   * 選びすぎると文章がぼやけるので、設問ごとに上限を決めて止める。
   * 上限に達したら未選択のチップを押せなくし、いま何個選んでいるかを常に出す。
   */
  function renderChips(field) {
    const outer = h('div', { class: 'chipsBox' });
    const meter = h('p', { class: 'chips__meter' });
    const box = h('div', { class: 'chips' });
    const max = field.max || 0;

    function full() {
      return max > 0 && (state.data[field.id] || []).length >= max;
    }

    function paintMeter() {
      const n = (state.data[field.id] || []).length;
      if (!max) { meter.textContent = n ? n + '個えらびました' : ''; return; }
      meter.textContent = n + ' / ' + max + '個';
      meter.classList.toggle('is-full', n >= max);
      meter.title = n >= max ? 'これ以上は選べません。変えるときは、選んだものを押して外してください。' : '';
    }

    function repaint() {
      box.innerHTML = '';
      const cur = state.data[field.id] || [];
      const locked = full();

      optionsFor(field).forEach(function (opt) {
        const on = cur.indexOf(opt) !== -1;
        const off = locked && !on;
        box.appendChild(h('button', {
          type: 'button',
          class: 'chip' + (on ? ' is-on' : '') + (off ? ' is-locked' : ''),
          'aria-pressed': on ? 'true' : 'false',
          'aria-disabled': off ? 'true' : null,
          title: off ? max + '個まで選べます' : null,
          onclick: function () {
            const list = (state.data[field.id] || []).slice();
            const i = list.indexOf(opt);
            if (i !== -1) list.splice(i, 1);
            else if (locked) { flashLimit(meter); return; }
            else list.push(opt);
            state.data[field.id] = list;
            emitChange(field.id);
            scheduleSave();
            // 選んだ内容で設問そのものが変わる欄は、画面ごと作り直す
            if (field.rerender) { save(); render(field.id); return; }
            repaint();
          }
        }, [opt]));
      });

      if (field.allowFree) {
        box.appendChild(h('button', {
          type: 'button',
          class: 'chip chip--add' + (locked ? ' is-locked' : ''),
          'aria-disabled': locked ? 'true' : null,
          onclick: function () {
            if (locked) { flashLimit(meter); return; }
            const v = (prompt('追加したい内容を入力してください') || '').trim();
            if (!v) return;
            state.custom[field.id] = (state.custom[field.id] || []).concat([v]);
            state.data[field.id] = (state.data[field.id] || []).concat([v]);
            emitChange(field.id);
            save();
            if (field.rerender) { render(field.id); return; }
            repaint();
          }
        }, ['＋ 自分で追加']));
      }
      paintMeter();
    }

    if (!state.data[field.id]) state.data[field.id] = [];
    // 上限を後から下げた場合に備えて、あふれた分は落とす
    if (max && state.data[field.id].length > max) {
      state.data[field.id] = state.data[field.id].slice(0, max);
    }
    repaint();

    outer.appendChild(meter);
    outer.appendChild(box);
    return outer;
  }

  /** 上限に当たったことを、その場で短く知らせる */
  function flashLimit(el) {
    el.classList.add('is-hit');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('is-hit'); }, 600);
  }

  // ── 魅力カード ────────────────────────────────────
  // 「どこで・何を見て・どう感じて・自分の何とつながるか」を1枚にまとめる。
  // ここに書いた内容が、そのまま本文の中心になる。
  const WEIGHT_LABELS = ['', '気になった', 'かなり大きい', '一番の理由'];

  function renderCards(field) {
    const box = h('div', { class: 'cards' });
    if (!Array.isArray(state.data[field.id])) state.data[field.id] = [];
    const list = state.data[field.id];

    function newCard() {
      return { where: '', what: '', feel: [], link: '', weight: list.length === 0 ? 3 : 2 };
    }

    /** カードの追加・削除・★変更のときだけ作り直す（入力中は作り直さない）*/
    function repaint() {
      box.innerHTML = '';

      list.forEach(function (card, i) {
        const el = h('div', { class: 'attrCard' });

        el.appendChild(h('div', { class: 'attrCard__head' }, [
          h('span', { class: 'attrCard__no', text: '魅力カード ' + (i + 1) }),
          renderWeight(card, repaint),
          h('button', {
            type: 'button', class: 'attrCard__del', title: 'このカードを削除',
            onclick: function () {
              if (!confirm('このカードを削除しますか？')) return;
              list.splice(i, 1);
              save();
              repaint();
            }
          }, ['削除'])
        ]));

        // ① どこで感じたか
        el.appendChild(h('label', { class: 'attrCard__label', text: '① それは、どこでのことですか' }));
        el.appendChild(h('p', { class: 'attrCard__hint', text: '選んだ場面が、そのまま文章の書き出しになります。' }));
        const sel = h('select', { class: 'input' });
        sel.appendChild(h('option', { value: '', text: '選んでください' }));
        (field.whereOptions || []).forEach(function (w) {
          sel.appendChild(h('option', { value: w.label, text: w.label }));
        });
        sel.value = card.where || '';
        sel.addEventListener('change', function () { card.where = sel.value; scheduleSave(); });
        el.appendChild(sel);

        // ② 何を見た・聞いた
        el.appendChild(h('label', { class: 'attrCard__label', text: '② そこで、何を見ましたか・聞きましたか' }));
        el.appendChild(h('p', {
          class: 'attrCard__hint',
          text: 'ここがいちばん大事です。感想ではなく、目に見えたこと・耳で聞いたことを、'
            + 'そのまま書いてください。この欄だけは、短い文で書いて構いません（語尾はアプリが直します）。'
        }));
        el.appendChild(h('div', { class: 'attrCard__ex' }, [
          h('p', { class: 'attrCard__exGood' }, [
            h('span', { class: 'attrCard__exMark', text: '○' }),
            document.createTextNode(field.whatPlaceholder || '')
          ]),
          h('p', { class: 'attrCard__exBad' }, [
            h('span', { class: 'attrCard__exMark', text: '×' }),
            document.createTextNode(isJob()
              ? '雰囲気がとても良かった（＝感想だけで、何を見たのか分からない）'
              : '授業がとても良かった（＝感想だけで、何を見たのか分からない）')
          ])
        ]));
        const what = h('textarea', {
          class: 'input input--area', rows: 2,
          maxlength: field.whatChars || 100,
          placeholder: field.whatPlaceholder || ''
        });
        what.value = card.what || '';
        what.addEventListener('input', function () {
          card.what = what.value;
          emitChange(field.id);
          scheduleSave();
        });
        el.appendChild(what);

        // ③ そのときの気持ち
        el.appendChild(h('label', { class: 'attrCard__label', text: '③ そのとき、どう思いましたか' }));
        el.appendChild(h('p', {
          class: 'attrCard__hint',
          text: '近いものを' + (field.feelMax || 2) + 'つまで選びます。文の中で自然な言い方に直されます。'
        }));
        el.appendChild(renderFeelChips(card, field));

        // ④ そう感じた理由
        el.appendChild(h('label', {
          class: 'attrCard__label', text: '④ そこに心をひかれたのは、なぜですか'
        }));
        el.appendChild(h('p', {
          class: 'attrCard__hint',
          text: '②で見たことについて、あなたがそう感じた理由を書きます。'
            + '「前に似たことがあったから」でも「自分もこうなりたいと思ったから」でも構いません。'
            + '空でも進めますが、ここが書けると'
            + (isJob() ? '「この会社でなければならない理由」' : '「この学校でなければならない理由」')
            + 'がぐっと強くなります。'
        }));
        const link = h('textarea', {
          class: 'input input--area', rows: 2,
          maxlength: field.linkChars || 100,
          placeholder: field.linkPlaceholder || ''
        });
        link.value = card.link || '';
        link.addEventListener('input', function () { card.link = link.value; scheduleSave(); });
        el.appendChild(link);

        el.appendChild(h('div', { class: 'attrCard__preview' }, [
          h('span', { class: 'attrCard__previewLabel', text: 'この文になります' }),
          h('span', { class: 'attrCard__previewText', text: previewOf(card) })
        ]));

        // プレビューは入力のたびに文字だけ差し替える
        const pv = el.querySelector('.attrCard__previewText');
        [what, link].forEach(function (t) {
          t.addEventListener('input', function () { pv.textContent = previewOf(card); });
        });
        el.querySelectorAll('.chip').forEach(function (c) {
          c.addEventListener('click', function () {
            setTimeout(function () { pv.textContent = previewOf(card); }, 0);
          });
        });

        box.appendChild(el);
      });

      const max = field.max || 3;
      if (list.length < max) {
        box.appendChild(h('button', {
          type: 'button', class: 'attrCard__add',
          onclick: function () { list.push(newCard()); save(); repaint(); }
        }, [list.length === 0 ? '＋ 最初の魅力カードを作る' : '＋ 魅力をもう1つ追加する（あと' + (max - list.length) + '枚）']));
      }
    }

    function previewOf(card) {
      return global.COMPOSE.cardPreview(card, state.data.course) || '（②を書くと、ここに本文の文が出ます）';
    }

    function renderWeight(card, onChange) {
      const wrap = h('div', { class: 'stars', title: 'どのくらい大きな理由か' });
      [1, 2, 3].forEach(function (n) {
        wrap.appendChild(h('button', {
          type: 'button',
          class: 'star' + ((card.weight || 2) >= n ? ' is-on' : ''),
          'aria-label': WEIGHT_LABELS[n],
          onclick: function () { card.weight = n; save(); onChange(); }
        }, ['★']));
      });
      wrap.appendChild(h('span', { class: 'stars__label', text: WEIGHT_LABELS[card.weight || 2] }));
      return wrap;
    }

    function renderFeelChips(card, field) {
      const chips = h('div', { class: 'chips chips--sm' });
      if (!Array.isArray(card.feel)) card.feel = [];
      (field.feelOptions || []).forEach(function (opt) {
        const btn = h('button', {
          type: 'button',
          class: 'chip' + (card.feel.indexOf(opt) !== -1 ? ' is-on' : ''),
          onclick: function () {
            const i = card.feel.indexOf(opt);
            const feelMax = field.feelMax || 2;
            if (i !== -1) card.feel.splice(i, 1);
            else if (card.feel.length < feelMax) card.feel.push(opt);
            else return; // 上限まで選んでいる
            btn.className = 'chip' + (card.feel.indexOf(opt) !== -1 ? ' is-on' : '');
            chips.querySelectorAll('.chip').forEach(function (c, k) {
              c.className = 'chip' + (card.feel.indexOf(field.feelOptions[k]) !== -1 ? ' is-on' : '');
            });
            scheduleSave();
          }
        }, [opt]);
        chips.appendChild(btn);
      });
      return chips;
    }

    if (!list.length) list.push(newCard());
    repaint();
    return box;
  }

  const WHY_LABELS = [
    'なぜ、そう思うのですか？',
    'では、そう思うようになったきっかけは何ですか？',
    'それは、あなたにとってどういう意味がありますか？'
  ];

  const WHY_HINTS = [
    'まずは思いついたままで大丈夫です。',
    '「そのとき何があったか」を思い出して書きます。',
    'ここが本文に使われます。短くて構いません。'
  ];

  function renderWhyChain(field) {
    const box = h('div', { class: 'why' });
    const chain = state.data.whyChain;
    const quotes = [];

    function quoteOf(i) {
      if (i === 0) return state.data[field.source] || '（上の「手に入れたいもの」を書くと、ここに出ます）';
      return chain['why' + i] || '（ひとつ前の「なぜ？」に答えると、ここに出ます）';
    }

    // 入力のたびにDOMを作り直すとフォーカスが外れるので、引用部分だけを書き換える
    function refreshQuotes() {
      quotes.forEach(function (span, i) { span.textContent = quoteOf(i); });
    }

    for (let i = 0; i < 3; i++) {
      const key = 'why' + (i + 1);
      const quoteText = h('span', { class: 'why__quoteText', text: quoteOf(i) });
      quotes.push(quoteText);

      const step = h('div', { class: 'why__step' }, [
        h('div', { class: 'why__quote' }, [
          h('span', { class: 'why__quoteLabel', text: i === 0 ? 'あなたの答え' : 'ひとつ前の答え' }),
          quoteText
        ]),
        h('div', { class: 'why__ask' }, [
          h('span', { class: 'why__no', text: 'なぜ？' + (i + 1) }),
          h('span', { text: WHY_LABELS[i] })
        ]),
        h('p', { class: 'why__hint', text: WHY_HINTS[i] })
      ]);

      const ta = h('textarea', {
        class: 'input input--area', rows: 2,
        maxlength: 60,
        placeholder: ['文化祭で、自分たちで決めて動くのが楽しかったから',
          '任されたほうが責任を感じて力が出たから',
          '自分で考えて動ける環境'][i]
      });
      ta.value = chain[key] || '';
      const count = h('div', { class: 'field__count', text: (chain[key] || '').length + ' / 60字' });
      ta.addEventListener('input', function () {
        chain[key] = ta.value;
        count.textContent = ta.value.length + ' / 60字';
        count.classList.toggle('is-full', ta.value.length >= 60);
        refreshQuotes();
        emitChange('whyChain');
        scheduleSave();
      });
      step.appendChild(ta);
      step.appendChild(count);
      box.appendChild(step);
    }

    // 上の「志望理由をひとことで」を書き換えたら、1段目の引用も追従させる
    onDataChange(function (id) { if (id === field.source) refreshQuotes(); });

    return box;
  }

  /** その設問に答えが入っているか */
  function answered(f) {
    if (f.type === 'chips') return (state.data[f.id] || []).length > 0;
    if (f.type === 'whychain') return !!String(state.data.whyChain.why1 || '').trim();
    if (f.type === 'cards') {
      return (state.data[f.id] || []).some(function (c) { return c && String(c.what || '').trim(); });
    }
    return !!String(state.data[f.id] == null ? '' : state.data[f.id]).trim();
  }

  // ── バリデーション ────────────────────────────────
  function validateStep(step) {
    let ok = true;
    let firstBad = null;

    step.fields.forEach(function (f) {
      const wrap = document.querySelector('[data-field="' + f.id + '"]');
      const err = wrap && wrap.querySelector('.field__error');
      if (err) err.textContent = '';
      if (wrap) wrap.classList.remove('has-error');
      if (!f.required) return;

      let empty;
      if (f.type === 'chips') empty = !(state.data[f.id] || []).length;
      else if (f.type === 'whychain') empty = !String(state.data.whyChain.why1 || '').trim();
      else if (f.type === 'cards') {
        empty = !(state.data[f.id] || []).some(function (c) { return c && String(c.what || '').trim(); });
      } else empty = !String(state.data[f.id] == null ? '' : state.data[f.id]).trim();

      if (empty) {
        ok = false;
        if (wrap) {
          wrap.classList.add('has-error');
          if (err) err.textContent = f.type === 'whychain'
            ? '少なくとも「なぜ？1」は書きましょう。'
            : f.type === 'cards'
              ? '魅力カードを1枚は作りましょう。②「何を見た・聞いた」だけでも大丈夫です。'
              : 'ここは必ず入力してください。';
          if (!firstBad) firstBad = wrap;
        }
      }
    });

    if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return ok;
  }

  /**
   * 指定した位置より手前に、必須が空のままのステップがあれば、その位置を返す。
   * タブで先へ飛ぶときに使う（「次へ進む」だけを見張っていると素通りできてしまう）。
   */
  function firstIncompleteView(limit) {
    const V = views();
    const all = steps();
    for (let k = 1; k < Math.min(limit, V.length); k++) {
      const v = V[k];
      if (v.id === 'pick') {
        if (!picksDone()) return k;
        continue;
      }
      const step = all.find(function (x) { return x.id === v.id; });
      if (!step) continue;
      if (step.fields.some(function (f) { return f.required && !answered(f); })) return k;
    }
    return -1;
  }

  /** その画面の必須が空なら、赤い注意書きを出す */
  function showErrors(viewId) {
    if (viewId === 'pick') { validatePicks(); return; }
    const step = steps().find(function (s) { return s.id === viewId; });
    if (step) validateStep(step);
  }

  /** 型をえらぶ3問が埋まっているか */
  function validatePicks() {
    let ok = true;
    let firstBad = null;

    global.QUESTIONS.PICKER.forEach(function (q) {
      const wrap = document.querySelector('[data-field="' + q.id + '"]');
      const err = wrap && wrap.querySelector('.field__error');
      if (err) err.textContent = '';
      if (wrap) wrap.classList.remove('has-error');
      if ((state.data.picks || {})[q.id] != null) return;

      ok = false;
      if (wrap) {
        wrap.classList.add('has-error');
        if (err) err.textContent = 'どれか1つ選んでください。近いものでかまいません。';
        if (!firstBad) firstBad = wrap;
      }
    });

    if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return ok;
  }

  // ── 各ビューの描画 ────────────────────────────────
  /** 進路を変えると、選択肢の中身が変わる設問はいったん白紙に戻す */
  // 選択肢の中身が進路でちがう欄。進路を変えたら、前の進路の値が残らないよう白紙に戻す。
  // 残しておくと、プルダウンには何も選ばれていないのに本文だけ古い値で組まれる。
  const COURSE_SPECIFIC_FIELDS = [
    'orgType', 'examType', 'featureSource',      // 志望先の種類・応募方法・情報源
    'strengths', 'strengthScene',                // 得意なことは選択肢が進路でちがう
    'attractPoints', 'afterEnter', 'visited', 'knewBy',
    'featureKind', 'wantVerb',                   // 特色の種類・どうしたいか
    'studyWant', 'jobTask',                      // 進学だけ／就職だけの欄
    'contribution', 'contributionFrom',
    'afterGradWhen', 'afterGradKind'
  ];

  function setCourse(id) {
    if (state.data.course === id) return;

    const hasAnswers = COURSE_SPECIFIC_FIELDS.some(function (k) {
      const v = state.data[k];
      return Array.isArray(v) ? v.length > 0 : !!v;
    });
    if (state.data.course && hasAnswers &&
      !confirm('進路を変えると、選択肢の中身がちがう設問（得意なこと・魅力を感じた点など）は白紙に戻ります。変更しますか？')) {
      return;
    }

    COURSE_SPECIFIC_FIELDS.forEach(function (k) { delete state.data[k]; });

    // 魅力カードは中身を残す（いちばん大事な入力なので消さない）。
    // ただし「どこで感じたか」の選択肢は進路で変わるため、そこだけ選び直してもらう。
    (state.data.attractCards || []).forEach(function (c) { c.where = ''; });

    state.data.course = id;
    // 目標字数は STEP 1 で選んだ長さを優先し、まだなら進路ごとの目安を入れる
    state.data.targetChars = global.QUESTIONS.pickChars(state.data.picks) ||
      (id === 'shushoku' ? 300 : 500);
    state.data.body = '';
    state.bodyEdited = false;
    save();
    render();
  }

  function viewStart() {
    const card = h('div', { class: 'card' }, [
      cardTitle('', 'まず、進路をえらんでください'),
      h('p', { class: 'lead', text: '進学と就職では、書くべき内容も、見られるポイントも変わります。選んだ進路に合わせて質問と下書きの型を切り替えます。' })
    ]);

    const picker = h('div', { class: 'courses' });
    global.QUESTIONS.COURSES.forEach(function (c) {
      picker.appendChild(h('button', {
        type: 'button',
        class: 'courseCard' + (state.data.course === c.id ? ' is-on' : ''),
        'aria-pressed': state.data.course === c.id ? 'true' : 'false',
        onclick: function () { setCourse(c.id); }
      }, [
        h('span', { class: 'courseCard__icon', text: c.icon }),
        h('span', { class: 'courseCard__name', text: c.name }),
        h('span', { class: 'courseCard__sub', text: c.sub }),
        h('span', { class: 'courseCard__desc', text: c.desc })
      ]));
    });
    card.appendChild(picker);

    if (!state.data.course) {
      card.appendChild(h('p', { class: 'pickHint', text: 'どちらかを選ぶと、この先の質問が決まります。' }));
      return card;
    }

    const job = isJob();
    card.appendChild(h('h3', { class: 'card__sub', text: 'この先の流れ' }));
    // 番号は views() から引く。ステップの並びを変えても、ここがずれないように
    const st = function (id) { return 'STEP ' + indexOf(id); };
    card.appendChild(h('ol', { class: 'flow' }, [
      ['型をきめる', st('pick') + '。3つの質問に答えると、あなたに向いた文章の型が決まります。'],
      ['材料を集める', st('basic') + '〜' + indexOf('after')
        + '。単語や短い文で答えるだけ。選んだ型に必要な質問しか出ません。'],
      ['魅力を書きとめる', st('recall') + ' の「魅力カード」がいちばん大事。心が動いた場面をそのまま書きます。'],
      ['組み立てる', st('compose') + '。集めた材料が、型どおりの順番で下書きになります。'],
      ['見直す', st('review') + '。文字数・話し言葉・文体などを自動でチェックします。'],
      ['提出する', st('submit') + '。先生のスプレッドシートに送信、印刷、コピーができます。']
    ].map(function (x) {
      return h('li', {}, [h('strong', { text: x[0] }), h('span', { text: x[1] })]);
    })));

    card.appendChild(h('div', { class: 'notice' }, [
      h('strong', { text: 'かかる時間の目安：40〜60分' }),
      h('p', {
        text: (job
          ? '求人票と、会社のホームページを手元に用意しておくと、'
          : '学校案内のパンフレットと、学校のホームページを手元に用意しておくと、')
          + 'STEP ' + indexOf('research') + ' がスムーズです。'
      })
    ]));

    if (!global.API.isConfigured()) {
      card.appendChild(h('div', { class: 'notice notice--warn' }, [
        h('strong', { text: '送信先が未設定です' }),
        h('p', {
          text: 'config.js に GAS のURLが入っていないため、STEP ' + indexOf('submit')
            + ' の「スプレッドシートに送信」は使えません。下書き作成・チェック・印刷・コピーはそのまま使えます。'
        })
      ]));
    }
    return card;
  }

  // ── STEP 1：文章の型をえらぶ ──────────────────────
  /** 3問すべてに答えたか */
  function picksDone() {
    const picks = state.data.picks || {};
    return global.QUESTIONS.PICKER.every(function (q) { return picks[q.id] != null; });
  }

  /**
   * 3問の答えから型と目標字数を決める。
   * 答えを変えたら判定をやり直すので、選び直しの印は消す。
   */
  function applyPicks() {
    if (!picksDone()) return;
    const picks = state.data.picks;
    const before = state.data.template;
    state.data.template = global.QUESTIONS.decide(picks).id;
    state.data.templateManual = false;
    const chars = global.QUESTIONS.pickChars(picks);
    if (chars) state.data.targetChars = chars;
    if (state.data.template !== before) {
      state.data.body = '';
      state.bodyEdited = false;
    }
    save();
  }

  /** 型を手で選び直したとき */
  function chooseTemplate(id) {
    if (state.data.template === id) return;
    state.data.template = id;
    state.data.templateManual = true;
    state.data.body = '';
    state.bodyEdited = false;
    save();
    render();
  }

  function templateCards(decidedId) {
    const job = isJob();
    const box = h('div', { class: 'templates' });
    global.COMPOSE.TEMPLATES.forEach(function (t) {
      box.appendChild(h('button', {
        type: 'button',
        class: 'tplCard' + (state.data.template === t.id ? ' is-on' : '') + (decidedId === t.id ? ' is-rec' : ''),
        'aria-pressed': state.data.template === t.id ? 'true' : 'false',
        onclick: function () { chooseTemplate(t.id); }
      }, [
        decidedId === t.id ? h('span', { class: 'tplCard__badge', text: 'おすすめ' }) : null,
        h('span', { class: 'tplCard__name', text: t.name }),
        h('span', { class: 'tplCard__summary', text: t.summary }),
        h('span', { class: 'tplCard__order', text: t.order(job) })
      ]));
    });
    return box;
  }

  function viewPick() {
    const job = isJob();
    const picks = state.data.picks || (state.data.picks = {});

    const card = h('div', { class: 'card' }, [
      cardTitle(1, '文章の型をえらぶ'),
      h('p', {
        class: 'lead',
        text: '先に「どういう順番で書くか」を決めます。あとの質問は、選んだ型が必要とするものだけになるので、答えた材料がむだなく本文に入ります。'
      })
    ]);

    global.QUESTIONS.PICKER.forEach(function (q) {
      const wrap = h('div', { class: 'field', 'data-field': q.id });
      wrap.appendChild(h('label', { class: 'field__label' }, [
        document.createTextNode(q.q(job)),
        h('span', { class: 'badge badge--required', text: '必須' })
      ]));

      const list = h('div', { class: 'picks' });
      q.options.forEach(function (o, i) {
        const on = String(picks[q.id]) === String(i);
        list.appendChild(h('button', {
          type: 'button',
          class: 'pickCard' + (on ? ' is-on' : ''),
          'aria-pressed': on ? 'true' : 'false',
          onclick: function () { picks[q.id] = i; applyPicks(); render(); }
        }, [
          h('span', { class: 'pickCard__mark', text: on ? '✓' : '' }),
          h('span', { class: 'pickCard__label', text: o.label(job) }),
          o.note ? h('span', { class: 'pickCard__note', text: o.note }) : null
        ]));
      });
      wrap.appendChild(list);
      wrap.appendChild(h('p', { class: 'field__error', text: '' }));
      card.appendChild(wrap);
    });

    if (!picksDone()) {
      card.appendChild(h('p', { class: 'pickHint', text: '3つとも答えると、あなたに向いた型が決まります。' }));
      return card;
    }

    const decided = global.QUESTIONS.decide(picks);
    const chosen = global.COMPOSE.TEMPLATES.find(function (t) { return t.id === state.data.template; });

    card.appendChild(h('hr', { class: 'sep' }));
    card.appendChild(h('div', { class: 'notice notice--tip' }, [
      h('strong', {
        text: state.data.templateManual
          ? 'あなたが選んだ型：' + chosen.name
          : 'あなたに向いている型：' + chosen.name
      }),
      h('p', {
        text: state.data.templateManual
          ? 'おすすめは「' + (global.COMPOSE.TEMPLATES.find(function (t) { return t.id === decided.id; }) || {}).name + '」でしたが、選び直した型で進めます。'
          : decided.reason
      })
    ]));

    card.appendChild(h('h3', { class: 'card__sub', text: 'ほかの型に変えることもできます' }));
    card.appendChild(templateCards(decided.id));

    const diff = global.QUESTIONS.diffFor(state.data.course || 'shingaku', state.data.template, state.data);

    card.appendChild(h('div', { class: 'notice' }, [
      h('strong', {
        text: 'この型で答える質問：' + diff.total + '問（うち必須' + diff.required + '問）'
          + '／目標字数：' + (state.data.targetChars || 500) + '字'
      }),
      h('p', {
        text: 'この型ならではの質問が' + diff.special + '問あり、'
          + 'ほかの型では聞く' + diff.skipped + '問はここでは出しません。'
          + '聞いたことはすべて本文に使われます。'
      }),
      h('p', { text: 'ここで決めた字数は STEP 2 で変えられます。' })
    ]));

    return card;
  }

  function viewQuestions(stepId) {
    const step = steps().find(function (s) { return s.id === stepId; });
    const card = h('div', { class: 'card' }, [
      cardTitle(state.index, step.title),
      h('p', { class: 'lead', text: step.lead }),
      step.note ? h('div', { class: 'notice notice--tip' }, [h('p', { text: step.note })]) : null
    ]);

    const tpl = global.COMPOSE.TEMPLATES.find(function (t) { return t.id === state.data.template; })
      || global.COMPOSE.TEMPLATES[0];
    card.appendChild(h('p', { class: 'tplNote' }, [
      h('span', { class: 'tplNote__name', text: tpl.name }),
      h('span', { class: 'tplNote__text', text: 'に必要な質問だけを出しています' }),
      h('button', {
        type: 'button', class: 'tplNote__link',
        onclick: function () { state.index = indexOf('pick'); render(); }
      }, ['型を変える'])
    ]));

    card.appendChild(renderStepBar(step));

    // 同じ話題の設問はひとまとまりにして、見出しをつける。
    // 「それは」「その中で」が何を指すのかを、囲みで示すため。
    let openId = null;
    let openBox = null;
    let groupNo = 0;
    let qNo = 0;

    step.fields.forEach(function (f) {
      qNo += 1;
      if (!f.group) { openId = null; openBox = null; card.appendChild(renderField(f, qNo)); return; }

      if (f.group !== openId) {
        const g = (step.groups || []).find(function (x) { return x.id === f.group; })
          || { id: f.group, name: f.group };
        groupNo += 1;
        openId = f.group;
        openBox = h('section', { class: 'qgroup' }, [
          h('h3', { class: 'qgroup__head' }, [
            h('span', { class: 'qgroup__no', text: String(groupNo) }),
            h('span', { class: 'qgroup__name', text: g.name })
          ]),
          g.desc ? h('p', { class: 'qgroup__desc', text: g.desc }) : null
        ]);
        card.appendChild(openBox);
      }
      openBox.appendChild(renderField(f, qNo));
    });

    return card;
  }

  /**
   * ステップの上に出す、進み具合と表示の切り替え。
   * 「あと何問か」が見えるだけで、途中で投げ出しにくくなる。
   */
  function renderStepBar(step) {
    const bar = h('div', { class: 'stepBar' });
    const count = h('span', { class: 'stepBar__count' });
    const track = h('div', { class: 'stepBar__track' });
    const fill = h('i', { class: 'stepBar__fill' });
    track.appendChild(fill);

    const need = step.fields.filter(function (f) { return f.required; });

    function paint() {
      const done = step.fields.filter(answered).length;
      const all = step.fields.length;
      const left = need.filter(function (f) { return !answered(f); }).length;
      count.textContent = '答えた質問 ' + done + ' / ' + all + '問'
        + (left ? '（必須があと' + left + '問）' : '（必須はすべて入力済）');
      fill.style.width = Math.round((done / all) * 100) + '%';
      fill.classList.toggle('is-done', left === 0);
    }
    paint();
    onDataChange(paint);

    // 帯とバッジの意味を、ステップごとに一度だけ説明しておく
    const legend = h('div', { class: 'stepBar__legend' }, [
      h('span', { class: 'legend legend--required' }, [
        h('span', { class: 'legend__bar' }),
        document.createTextNode('必須 ' + need.length + '問')
      ]),
      h('span', { class: 'legend legend--optional' }, [
        h('span', { class: 'legend__bar' }),
        document.createTextNode('任意 ' + (step.fields.length - need.length) + '問')
      ])
    ]);

    bar.appendChild(h('div', { class: 'stepBar__body' }, [count, track, legend]));
    bar.appendChild(h('div', { class: 'stepBar__btns' }, [
      h('button', {
        type: 'button', class: 'btn btn--ghost btn--sm',
        onclick: function () {
          state.foldDone = !state.foldDone;
          state.open = {};
          save();
          render();
        }
      }, [state.foldDone ? '答えた質問も表示' : '答えた質問をたたむ']),
      h('button', {
        type: 'button', class: 'btn btn--ghost btn--sm',
        onclick: function () { state.helpOpen = !state.helpOpen; save(); render(); }
      }, [state.helpOpen ? '説明をたたむ' : '説明を表示'])
    ]));
    return bar;
  }

  function viewCompose() {
    const card = h('div', { class: 'card' }, [
      cardTitle(state.index, '組み立てる'),
      h('p', { class: 'lead', text: 'STEP 1 で決めた型に、あなたが答えた材料を流し込みました。できた文章は自由に直せます。' })
    ]);

    const tpl = global.COMPOSE.TEMPLATES.find(function (t) { return t.id === state.data.template; })
      || global.COMPOSE.TEMPLATES[0];
    card.appendChild(h('div', { class: 'tplNow' }, [
      h('div', { class: 'tplNow__body' }, [
        h('span', { class: 'tplNow__cap', text: 'この文章の型' }),
        h('strong', { class: 'tplNow__name', text: tpl.name }),
        h('span', { class: 'tplNow__order', text: tpl.order(isJob()) })
      ]),
      h('button', {
        type: 'button', class: 'btn btn--ghost btn--sm',
        onclick: function () { state.index = indexOf('pick'); render(); }
      }, ['型を選び直す'])
    ]));

    const bar = h('div', { class: 'toolbar' }, [
      h('button', {
        type: 'button', class: 'btn btn--sub',
        onclick: function () {
          if (state.bodyEdited && !confirm('手で直した内容が消えます。作り直しますか？')) return;
          regenerate(true);
          render();
        }
      }, ['下書きを作り直す']),
      h('span', { class: 'toolbar__note', id: 'composeNote' })
    ]);
    card.appendChild(bar);

    const ta = h('textarea', { class: 'input input--body', rows: 16, id: 'bodyInput' });
    ta.value = state.data.body || '';
    ta.addEventListener('input', function () {
      state.data.body = ta.value;
      state.bodyEdited = true;
      updateBodyMeter();
      scheduleSave();
    });
    card.appendChild(ta);
    card.appendChild(h('div', { class: 'meter', id: 'bodyMeter' }));
    card.appendChild(h('div', { class: 'unused', id: 'unusedBox' }));
    card.appendChild(h('p', { class: 'field__hint', text: '※ 文字数は空白と改行を除いて数えています。段落を分けたいところは1行あけてください。' }));

    ta.addEventListener('input', updateUnused);

    setTimeout(function () {
      if (!state.data.body) regenerate(true);
      updateBodyMeter();
      updateUnused();
      const note = document.getElementById('composeNote');
      if (note && state.lastNote) note.textContent = state.lastNote;
    }, 0);

    return card;
  }

  /** 集めた材料のうち、本文に入っていないものを知らせる */
  function updateUnused() {
    const box = document.getElementById('unusedBox');
    if (!box) return;
    const rest = global.COMPOSE.unusedMaterials(state.data, state.data.body || '');
    box.innerHTML = '';
    if (!rest.length) {
      box.appendChild(h('p', { class: 'unused__ok', text: '✓ 集めた材料は、ひととおり本文に入っています。' }));
      return;
    }
    box.appendChild(h('p', { class: 'unused__head', text: 'まだ本文に入っていない材料（' + rest.length + '件）' }));
    const tags = h('div', { class: 'unused__tags' });
    rest.forEach(function (label) { tags.appendChild(h('span', { class: 'unused__tag', text: label })); });
    box.appendChild(tags);
    box.appendChild(h('p', {
      class: 'unused__note',
      text: '字数に収めるため自動で削られたものです。入れたい材料があれば、本文を直接書き足すか、目標字数を増やしてください。'
    }));
  }

  function regenerate(force) {
    const r = global.COMPOSE.generate(state.data, state.data.template);
    if (force || !state.data.body) {
      state.data.body = r.text;
      state.bodyEdited = false;
    }
    state.lastNote = r.note;
    save();
  }

  function updateBodyMeter() {
    const box = document.getElementById('bodyMeter');
    if (!box) return;
    const n = global.COMPOSE.countChars(state.data.body || '');
    const target = Number(state.data.targetChars) || 400;
    const pct = Math.min(120, Math.round((n / target) * 100));
    const level = n > target ? 'over' : (n >= target * 0.9 ? 'good' : 'low');
    box.innerHTML =
      '<div class="meter__head"><span class="meter__num">' + n + ' / ' + target + ' 字</span>' +
      '<span class="meter__state meter__state--' + level + '">' +
      (level === 'over' ? '字数オーバー' : level === 'good' ? 'ちょうどよい' : 'もう少し') + '</span></div>' +
      '<div class="meter__bar"><i class="meter__fill meter__fill--' + level + '" style="width:' + Math.min(100, pct) + '%"></i></div>';
  }

  function viewReview() {
    const results = global.CHECKLIST.run(state.data.body || '', state.data);
    const errors = results.filter(function (r) { return r.level === 'error'; }).length;
    const warns = results.filter(function (r) { return r.level === 'warn'; }).length;

    const card = h('div', { class: 'card' }, [
      cardTitle(state.index, '見直す'),
      h('p', { class: 'lead', text: '機械でチェックできるところを自動で確認しました。赤は直しましょう。黄色は読み返して判断してください。' }),
      h('div', { class: 'scoreRow' }, [
        h('span', { class: 'score score--error', text: '要修正 ' + errors }),
        h('span', { class: 'score score--warn', text: '確認 ' + warns }),
        h('span', { class: 'score score--ok', text: 'OK ' + (results.length - errors - warns) })
      ])
    ]);

    function checkItem(r) {
      return h('li', { class: 'check check--' + r.level }, [
        h('div', { class: 'check__head' }, [
          h('span', { class: 'check__icon', text: r.level === 'ok' ? '✓' : r.level === 'warn' ? '!' : '×' }),
          h('span', { class: 'check__label', text: r.label })
        ]),
        h('p', { class: 'check__msg', text: r.message }),
        r.samples.length ? h('ul', { class: 'check__samples' }, r.samples.map(function (s) {
          return h('li', { text: s });
        })) : null
      ]);
    }

    // 直すべきものだけを前に出し、問題のなかった項目は畳んでおく
    const todo = results.filter(function (r) { return r.level !== 'ok'; });
    const done = results.filter(function (r) { return r.level === 'ok'; });

    if (todo.length) {
      card.appendChild(h('ul', { class: 'checks' }, todo.map(checkItem)));
    } else {
      card.appendChild(h('p', { class: 'checks__clear', text: '自動チェックはすべて通りました。あとは自分の目で確かめましょう。' }));
    }

    if (done.length) {
      card.appendChild(h('details', { class: 'checks__done' }, [
        h('summary', { text: '問題のなかった項目（' + done.length + '件）' }),
        h('ul', { class: 'checks' }, done.map(checkItem))
      ]));
    }

    card.appendChild(h('h3', { class: 'card__sub', text: '自分の目で確かめること' }));
    const man = h('ul', { class: 'manual' });
    global.CHECKLIST.manualFor(state.data.course).forEach(function (label, i) {
      const id = 'm' + i;
      const on = (state.data.manualChecks || []).indexOf(i) !== -1;
      const cb = h('input', { type: 'checkbox', id: id });
      cb.checked = on;
      cb.addEventListener('change', function () {
        const arr = (state.data.manualChecks || []).slice();
        const p = arr.indexOf(i);
        if (cb.checked && p === -1) arr.push(i);
        if (!cb.checked && p !== -1) arr.splice(p, 1);
        state.data.manualChecks = arr;
        scheduleSave();
      });
      man.appendChild(h('li', {}, [cb, h('label', { for: id, text: label })]));
    });
    card.appendChild(man);

    card.appendChild(h('div', { class: 'toolbar' }, [
      h('button', {
        type: 'button', class: 'btn btn--sub',
        onclick: function () { state.index = indexOf('compose'); render(); }
      }, ['本文を直しに戻る'])
    ]));

    card.appendChild(h('details', { class: 'preview' }, [
      h('summary', { text: '今の本文を表示する' }),
      h('div', { class: 'preview__body', text: state.data.body || '（まだ本文がありません）' })
    ]));

    return card;
  }

  function payload() {
    const d = state.data;
    const course = global.QUESTIONS.courseOf(d.course);

    // 魅力カードは1枚ずつ列に展開する（先生が横に並べて読めるように）
    const cards = (d.attractCards || []).filter(function (c) { return c && String(c.what || '').trim(); });
    const cardCols = {};
    for (let i = 0; i < 3; i++) {
      const c = cards[i] || {};
      cardCols['card' + (i + 1) + 'Where'] = c.where || '';
      cardCols['card' + (i + 1) + 'What'] = c.what || '';
      cardCols['card' + (i + 1) + 'Feel'] = (c.feel || []).join('、');
      cardCols['card' + (i + 1) + 'Link'] = c.link || '';
      cardCols['card' + (i + 1) + 'Weight'] = c.what ? (c.weight || 2) : '';
    }

    return Object.assign(cardCols, {
      course: d.course || '',
      courseName: course.name,
      studentName: d.studentName || '',
      highSchool: d.highSchool || '',
      grade: d.grade || '',
      classGroup: d.classGroup || '',
      seatNo: d.seatNo || '',
      className: global.QUESTIONS.classLabel(d),
      targetName: d.targetName || '',
      targetSub: d.targetSub || '',
      orgType: d.orgType || '',
      examType: d.examType || '',
      targetChars: d.targetChars || '',
      tone: d.tone || '',
      efforts: (d.efforts || []).join('、'),
      effortWhich: d.effortWhich || '',
      effortWhen: d.effortWhen || '',
      effortRole: d.effortRole || '',
      effortAction: d.effortAction || '',
      effortActionKind: d.effortActionKind || '',
      effortResult: d.effortResult || '',
      effortHard: d.effortHard || '',
      effortHow: d.effortHow || '',
      effortLearned: d.effortLearned || '',
      strengths: (d.strengths || []).join('、'),
      licenses: d.licenses || '',
      personality: (d.personality || []).join('、'),
      futureKind: d.futureKind || '',
      futureDream: d.futureDream || '',
      futureWhySource: d.futureWhySource || '',
      futureWhyWhat: d.futureWhyWhat || '',
      gapNow: d.gapNow || '',
      knewBy: d.knewBy || '',
      visited: (d.visited || []).join('、'),
      attractPoints: (d.attractPoints || []).join('、'),
      featureKind: d.featureKind || '',
      featureName: d.featureName || '',
      featureSource: d.featureSource || '',
      featureDetail: d.featureDetail || '',
      studyWant: d.studyWant || '',
      jobTask: d.jobTask || '',
      targetPolicy: d.targetPolicy || '',
      wantObject: d.wantObject || '',
      wantVerb: d.wantVerb || '',
      why1: d.whyChain.why1 || '',
      why2: d.whyChain.why2 || '',
      why3: d.whyChain.why3 || '',
      valueFound: d.valueFound || '',
      strengthEpisode: d.strengthEpisode || '',
      strengthScene: d.strengthScene || '',
      personalityEpisode: d.personalityEpisode || '',
      personalityScene: d.personalityScene || '',
      mustPoint: d.mustPoint || '',
      afterEnter: (d.afterEnter || []).join('、'),
      afterAction: d.afterAction || '',
      contributionFrom: d.contributionFrom || '',
      contribution: d.contribution || '',
      afterGradWhen: d.afterGradWhen || '',
      afterGradKind: d.afterGradKind || '',
      afterGradWhat: d.afterGradWhat || '',
      dailyImage: d.dailyImage || '',
      contributeTo: d.contributeTo || '',
      template: (global.COMPOSE.TEMPLATES.find(function (t) { return t.id === d.template; }) || {}).name || '',
      body: d.body || '',
      bodyChars: global.COMPOSE.countChars(d.body || '')
    });
  }

  function viewSubmit() {
    const p = payload();
    const results = global.CHECKLIST.run(state.data.body || '', state.data);
    const errors = results.filter(function (r) { return r.level === 'error'; });

    const card = h('div', { class: 'card' }, [
      cardTitle(state.index, '提出する'),
      h('p', { class: 'lead', text: '内容を確認して送信しましょう。送信するとスプレッドシートに1行追加され、先生が読めるようになります。' })
    ]);

    card.appendChild(h('dl', { class: 'summary' }, [
      ['進路', p.courseName],
      ['名前', p.studentName],
      [isJob() ? '志望する会社' : '志望校', (p.targetName + ' ' + p.targetSub).trim()],
      ['構成', p.template],
      ['文字数', p.bodyChars + ' / ' + p.targetChars + ' 字']
    ].reduce(function (acc, x) {
      acc.push(h('dt', { text: x[0] }));
      acc.push(h('dd', { text: x[1] || '（未入力）' }));
      return acc;
    }, [])));

    card.appendChild(h('div', { class: 'preview__body preview__body--final', text: state.data.body || '（本文がありません）' }));

    if (errors.length) {
      card.appendChild(h('div', { class: 'notice notice--warn' }, [
        h('strong', { text: '要修正が ' + errors.length + ' 件あります' }),
        h('p', { text: errors.map(function (e) { return e.label; }).join('、') + ' を直してから提出することをおすすめします。' })
      ]));
    }

    const status = h('p', { class: 'status', id: 'submitStatus' });

    const sendBtn = h('button', {
      type: 'button', class: 'btn btn--primary btn--wide',
      onclick: async function () {
        if (!state.data.studentName || !state.data.targetName) {
          status.className = 'status status--error';
          status.textContent = 'STEP 1 の「名前」と「' + (isJob() ? '志望する会社名' : '志望校名') + '」を入力してください。';
          return;
        }
        sendBtn.disabled = true;
        status.className = 'status';
        status.textContent = '送信しています…';
        try {
          const res = await global.API.submit(payload());
          state.submitted = new Date().toISOString();
          status.className = 'status status--ok';
          status.textContent = '送信しました。' + (res.row ? '（' + res.row + '行目に記録されました）' : '');
        } catch (e) {
          status.className = 'status status--error';
          status.textContent = e.message;
        } finally {
          sendBtn.disabled = !cfg.ALLOW_RESUBMIT && !!state.submitted;
        }
      }
    }, [global.API.isConfigured() ? 'スプレッドシートに送信する' : '送信先が未設定です']);
    sendBtn.disabled = !global.API.isConfigured();

    card.appendChild(sendBtn);
    card.appendChild(status);

    card.appendChild(h('div', { class: 'toolbar toolbar--wrap' }, [
      h('button', {
        type: 'button', class: 'btn btn--sub',
        onclick: function () {
          navigator.clipboard.writeText(state.data.body || '').then(function () {
            status.className = 'status status--ok';
            status.textContent = '本文をコピーしました。';
          });
        }
      }, ['本文をコピー']),
      h('button', {
        type: 'button', class: 'btn btn--sub',
        onclick: function () { downloadText(); }
      }, ['テキストで保存']),
      h('button', {
        type: 'button', class: 'btn btn--sub',
        onclick: function () { printBody(); }
      }, ['印刷する'])
    ]));

    return card;
  }

  function downloadText() {
    const p = payload();
    const doc = global.QUESTIONS.courseOf(p.course).docName;
    const lines = [
      doc + '　下書き（' + p.courseName + '）',
      '氏名: ' + p.studentName,
      '高校: ' + p.highSchool + ' ' + p.className,
      (isJob() ? '志望先: ' : '志望校: ') + p.targetName + ' ' + p.targetSub,
      '文字数: ' + p.bodyChars + ' / ' + p.targetChars,
      '',
      p.body
    ].join('\n');
    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: (p.studentName || 'shibou') + '_' + doc + '.txt' });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function printBody() {
    const p = payload();
    const area = document.getElementById('printArea');
    area.innerHTML =
      '<h1>' + esc(global.QUESTIONS.courseOf(p.course).docName) + '</h1>' +
      '<p class="printMeta">' + esc(p.highSchool) + '　' + esc(p.className) + '　' + esc(p.studentName) + '</p>' +
      '<p class="printMeta">' + (isJob() ? '志望先：' : '志望校：') + esc(p.targetName) + '　' + esc(p.targetSub) + '</p>' +
      '<div class="printBody">' + esc(p.body).replace(/\n/g, '<br>') + '</div>' +
      '<p class="printMeta">（' + p.bodyChars + '字）</p>';
    window.print();
  }

  // ── レンダリング ──────────────────────────────────
  /**
   * 画面を描き直す。
   * @param {String} [anchorId]  同じ画面のまま描き直すとき、位置の基準にする設問のID。
   *   選択肢を押すたびに先頭へ飛ぶと、どこを触っていたのか分からなくなるため、
   *   その設問が画面の同じ高さに来るようにスクロールを戻す。
   */
  let lastIndex = -1;
  function render(anchorId) {
    const sameView = lastIndex === state.index;
    const keepY = window.pageYOffset;
    let anchorTop = null;
    if (sameView && anchorId) {
      const before = document.querySelector('[data-field="' + anchorId + '"]');
      if (before) anchorTop = before.getBoundingClientRect().top;
    }

    // 画面が変わったら、開きっぱなしにしていた設問はたたみ直す
    if (!sameView) state.open = {};
    // いま触っていた設問は、答えたばかりでもたたまない
    // （選択肢を押したとたんにその一覧が消えると、選び直せなくなる）
    if (anchorId) state.open[anchorId] = true;

    const V = views();
    const view = V[state.index];
    const root = document.getElementById('view');
    root.innerHTML = '';
    changeListeners = []; // 前の画面のDOMを参照している通知先を捨てる

    let node;
    if (view.id === 'start') node = viewStart();
    else if (view.id === 'pick') node = viewPick();
    else if (view.id === 'compose') node = viewCompose();
    else if (view.id === 'review') node = viewReview();
    else if (view.id === 'submit') node = viewSubmit();
    else node = viewQuestions(view.id);
    root.appendChild(node);

    document.body.dataset.course = state.data.course || '';
    renderNav(V);
    renderProgress(V);
    save();
    lastIndex = state.index;

    // ステップが変わったときだけ先頭へ。同じ画面の描き直しでは動かさない。
    // なめらかスクロールにすると、中身が入れ替わったときにブラウザの
    // スクロール位置調整とぶつかって途中で止まるので、一気に戻す
    if (!sameView) {
      window.scrollTo(0, 0);
      return;
    }
    window.scrollTo({ top: keepY });
    if (anchorTop != null) {
      const after = document.querySelector('[data-field="' + anchorId + '"]');
      if (after) {
        window.scrollTo({ top: window.pageYOffset + (after.getBoundingClientRect().top - anchorTop) });
      }
    }
  }

  function renderProgress(V) {
    const pct = Math.round((state.index / (V.length - 1)) * 100);
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('stepLabel').textContent =
      state.index === 0 ? V[0].title : 'STEP ' + state.index + ' / ' + (V.length - 1) + '　' + V[state.index].title;

    const tabs = document.getElementById('stepTabs');
    tabs.innerHTML = '';
    V.forEach(function (v, i) {
      // 進路と型を決めるまでは、その先へ飛べないようにする
      const locked = (i > 0 && !state.data.course) || (i > 1 && !picksDone());
      tabs.appendChild(h('button', {
        type: 'button',
        title: v.title,
        'aria-current': i === state.index ? 'step' : null,
        class: 'tab' + (i === state.index ? ' is-on' : '') + (i < state.index ? ' is-done' : ''),
        disabled: locked ? 'disabled' : null,
        onclick: function () {
          if (locked) return;
          // 先へ飛ぶときは、途中の必須が埋まっているかを確かめる
          if (i > state.index) {
            const bad = firstIncompleteView(i);
            if (bad !== -1) {
              state.index = bad;
              render();
              setTimeout(function () { showErrors(views()[bad].id); }, 0);
              return;
            }
          }
          state.index = i;
          render();
        }
      }, [
        h('span', { class: 'tab__no', text: i === 0 ? '◎' : String(i) }),
        h('span', { class: 'tab__label', text: v.short || v.title })
      ]));
    });
  }

  function renderNav(V) {
    const prev = document.getElementById('prevBtn');
    const next = document.getElementById('nextBtn');
    prev.style.display = state.index === 0 ? 'none' : '';
    prev.disabled = state.index === 0;
    next.style.display = state.index === V.length - 1 ? 'none' : '';
    next.disabled = state.index === 0 && !state.data.course;
    next.textContent = state.index === 0 ? 'はじめる' :
      state.index === V.length - 2 ? '提出へ進む' : '次へ進む';
  }

  function goNext() {
    const V = views();
    const view = V[state.index];
    if (view.id === 'start' && !state.data.course) return;
    if (view.id === 'pick' && !validatePicks()) return;
    const step = steps().find(function (s) { return s.id === view.id; });
    if (step && !validateStep(step)) return;
    if (view.id === 'after') regenerate(!state.bodyEdited);
    state.index = Math.min(state.index + 1, V.length - 1);
    render();
  }

  function goPrev() {
    state.index = Math.max(state.index - 1, 0);
    render();
  }

  // ── 起動 ─────────────────────────────────────────
  function boot() {
    document.getElementById('appTitle').textContent = cfg.APP_TITLE || '志望動機メーカー';
    document.getElementById('appSubtitle').textContent = cfg.SUBTITLE || '';
    document.getElementById('nextBtn').addEventListener('click', goNext);
    document.getElementById('prevBtn').addEventListener('click', goPrev);
    document.getElementById('resetBtn').addEventListener('click', function () {
      if (!confirm('入力した内容をすべて消して、最初からやり直しますか？')) return;
      // 消したあとに beforeunload と自動保存が走ると、同じ内容が書き戻ってしまう。
      // 先に保存の口をすべて閉じてから消す
      window.removeEventListener('beforeunload', save);
      if (saveTimer) clearTimeout(saveTimer);
      saveOff = true;
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    });

    const restored = load();
    render();
    if (restored && state.index > 0) {
      const el = document.getElementById('saveIndicator');
      el.textContent = '前回の続きから再開しました';
      el.classList.add('is-visible');
      setTimeout(function () {
        el.classList.remove('is-visible');
        el.textContent = '保存しました';
      }, 2600);
    }

    window.addEventListener('beforeunload', save);
  }

  document.addEventListener('DOMContentLoaded', boot);
})(window);
