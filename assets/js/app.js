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
      template: 'prep',
      body: '',
      manualChecks: []
    },
    custom: {},          // チップの自由追加分 { fieldId: [..] }
    bodyEdited: false,   // 本文を手で直したか（自動再生成の上書き確認に使う）
    submitted: null
  };

  /** 選んだ進路に応じた設問セット */
  function steps() {
    return global.QUESTIONS.buildSteps(state.data.course || 'shingaku');
  }

  function isJob() {
    return state.data.course === 'shushoku';
  }

  /** 進路選択を 0 番目、以降に設問4ステップ + 組み立て/見直し/提出 */
  function views() {
    return [
      { id: 'start', title: '進路をえらぶ' },
      { id: 'basic', title: '基本情報' },
      { id: 'self', title: '自分を知る' },
      { id: 'research', title: isJob() ? '会社を知る' : '学校を知る' },
      { id: 'connect', title: 'つなげる' },
      { id: 'compose', title: '組み立てる' },
      { id: 'review', title: '見直す' },
      { id: 'submit', title: '提出する' }
    ];
  }

  // ── 保存／復元 ────────────────────────────────────
  let saveTimer = null;

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        data: state.data, custom: state.custom, index: state.index, bodyEdited: state.bodyEdited
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
      state.index = Math.min(saved.index || 0, views().length - 1);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 旧バージョンの保存データを、今の形に寄せる */
  function migrate() {
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

    // 旧データには存在しないテンプレートIDが入っていることがある
    if (!global.COMPOSE.TEMPLATES.some(function (t) { return t.id === state.data.template; })) {
      state.data.template = 'prep';
    }
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

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── 入力欄の描画 ──────────────────────────────────
  function optionsFor(field) {
    return (field.options || []).concat(state.custom[field.id] || []);
  }

  function renderField(field) {
    const wrap = h('div', { class: 'field', 'data-field': field.id });

    wrap.appendChild(h('label', { class: 'field__label', for: 'f_' + field.id }, [
      document.createTextNode(field.label),
      field.required ? h('span', { class: 'badge badge--required', text: '必須' }) : null
    ]));

    if (field.hint) wrap.appendChild(h('p', { class: 'field__hint', text: field.hint }));

    let input;
    const val = state.data[field.id];

    switch (field.type) {
      case 'textarea':
        input = h('textarea', {
          id: 'f_' + field.id,
          class: 'input input--area',
          rows: field.rows || 3,
          placeholder: field.placeholder || ''
        });
        input.value = val || '';
        input.addEventListener('input', function () {
          state.data[field.id] = input.value;
          updateCounter(wrap, input.value);
          scheduleSave();
        });
        wrap.appendChild(input);
        wrap.appendChild(h('div', { class: 'field__count', text: (val || '').length + '字' }));
        break;

      case 'select': {
        input = h('select', { id: 'f_' + field.id, class: 'input' });
        input.appendChild(h('option', { value: '', text: '選んでください' }));
        (field.options || []).forEach(function (o) {
          input.appendChild(h('option', { value: o, text: o }));
        });
        input.value = val || field.default || '';
        input.addEventListener('change', function () {
          state.data[field.id] = input.value;
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
        input.value = val != null && val !== '' ? val : (field.default || '');
        if (state.data[field.id] == null || state.data[field.id] === '') state.data[field.id] = field.default;
        input.addEventListener('input', function () {
          state.data[field.id] = Number(input.value);
          scheduleSave();
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
          placeholder: field.placeholder || ''
        });
        input.value = val || '';
        input.addEventListener('input', function () {
          state.data[field.id] = input.value;
          emitChange(field.id);
          scheduleSave();
        });
        wrap.appendChild(input);
    }

    wrap.appendChild(h('p', { class: 'field__error', text: '' }));
    return wrap;
  }

  function updateCounter(wrap, value) {
    const c = wrap.querySelector('.field__count');
    if (c) c.textContent = String(value || '').length + '字';
  }

  function renderChips(field) {
    const box = h('div', { class: 'chips' });
    const selected = state.data[field.id] || [];

    function repaint() {
      box.innerHTML = '';
      const cur = state.data[field.id] || [];
      optionsFor(field).forEach(function (opt) {
        const on = cur.indexOf(opt) !== -1;
        box.appendChild(h('button', {
          type: 'button',
          class: 'chip' + (on ? ' is-on' : ''),
          'aria-pressed': on ? 'true' : 'false',
          onclick: function () {
            const list = (state.data[field.id] || []).slice();
            const i = list.indexOf(opt);
            if (i === -1) list.push(opt); else list.splice(i, 1);
            state.data[field.id] = list;
            scheduleSave();
            repaint();
          }
        }, [opt]));
      });

      if (field.allowFree) {
        box.appendChild(h('button', {
          type: 'button', class: 'chip chip--add',
          onclick: function () {
            const v = (prompt('追加したい内容を入力してください') || '').trim();
            if (!v) return;
            state.custom[field.id] = (state.custom[field.id] || []).concat([v]);
            state.data[field.id] = (state.data[field.id] || []).concat([v]);
            save();
            repaint();
          }
        }, ['＋ 自分で追加']));
      }
    }

    if (!state.data[field.id]) state.data[field.id] = selected;
    repaint();
    return box;
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
        el.appendChild(h('label', { class: 'attrCard__label', text: '① どこで感じた？' }));
        const sel = h('select', { class: 'input' });
        sel.appendChild(h('option', { value: '', text: '選んでください' }));
        (field.whereOptions || []).forEach(function (w) {
          sel.appendChild(h('option', { value: w.label, text: w.label }));
        });
        sel.value = card.where || '';
        sel.addEventListener('change', function () { card.where = sel.value; scheduleSave(); });
        el.appendChild(sel);

        // ② 何を見た・聞いた
        el.appendChild(h('label', { class: 'attrCard__label', text: '② 何を見た・聞いた？' }));
        el.appendChild(h('p', { class: 'attrCard__hint', text: 'ここがいちばん大事。「すごかった」ではなく、その場の様子をそのまま書く。' }));
        const what = h('textarea', {
          class: 'input input--area', rows: 2, placeholder: field.whatPlaceholder || ''
        });
        what.value = card.what || '';
        what.addEventListener('input', function () {
          card.what = what.value;
          emitChange(field.id);
          scheduleSave();
        });
        el.appendChild(what);

        // ③ そのときの気持ち
        el.appendChild(h('label', { class: 'attrCard__label', text: '③ そのとき、どう感じた？' }));
        el.appendChild(h('p', { class: 'attrCard__hint', text: '近いものを2つまで。文章の中で自然な形に変換されます。' }));
        el.appendChild(renderFeelChips(card, field));

        // ④ 自分とのつながり
        el.appendChild(h('label', { class: 'attrCard__label', text: '④ 自分の何とつながる？（書けたら）' }));
        const link = h('textarea', {
          class: 'input input--area', rows: 2, placeholder: field.linkPlaceholder || ''
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
      return global.COMPOSE.cardPreview(card, state.data.course) || '（②を書くと、ここに文章が出ます）';
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
            if (i !== -1) card.feel.splice(i, 1);
            else if (card.feel.length < 2) card.feel.push(opt);
            else return; // 2つまで
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
    'なぜ、そう思ったのですか？',
    'では、なぜそう感じるようになったのですか？',
    'さらに、それはあなたにとってどういう意味がありますか？'
  ];

  function renderWhyChain(field) {
    const box = h('div', { class: 'why' });
    const chain = state.data.whyChain;
    const quotes = [];

    function quoteOf(i) {
      if (i === 0) return state.data[field.source] || '（前のらんに志望理由を書いてください）';
      return chain['why' + i] || '（上のらんに答えてください）';
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
        ])
      ]);

      const ta = h('textarea', {
        class: 'input input--area', rows: 2,
        placeholder: i === 2 ? '例）自分で決めて動ける環境のほうが、力を発揮できると気づいたから'
          : '例）文化祭で、生徒が自分たちで企画を運営していたから'
      });
      ta.value = chain[key] || '';
      ta.addEventListener('input', function () {
        chain[key] = ta.value;
        refreshQuotes();
        scheduleSave();
      });
      step.appendChild(ta);
      box.appendChild(step);
    }

    // 上の「志望理由をひとことで」を書き換えたら、1段目の引用も追従させる
    onDataChange(function (id) { if (id === field.source) refreshQuotes(); });

    return box;
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

  // ── 各ビューの描画 ────────────────────────────────
  /** 進路を変えると、選択肢の中身が変わる設問はいったん白紙に戻す */
  const COURSE_SPECIFIC_FIELDS = ['strengths', 'attractPoints', 'afterEnter', 'visited',
    'knewBy', 'examType', 'studyWant', 'jobUnderstanding', 'contribution'];

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
    state.data.targetChars = id === 'shushoku' ? 300 : 500;
    state.data.body = '';
    state.bodyEdited = false;
    save();
    render();
  }

  function viewStart() {
    const card = h('div', { class: 'card' }, [
      h('h2', { class: 'card__title', text: 'まず、進路をえらんでください' }),
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
      card.appendChild(h('p', { class: 'field__error', text: 'どちらかを選ぶと、次へ進めます。' }));
      return card;
    }

    const job = isJob();
    card.appendChild(h('h3', { class: 'card__sub', text: 'この先の流れ' }));
    card.appendChild(h('ol', { class: 'flow' }, [
      ['材料を集める', 'STEP 1〜4。単語や短い文で答えるだけ。文章にする必要はありません。'],
      ['組み立てる', 'STEP 5。3つの構成から選ぶと、下書きが自動でできます。'],
      ['見直す', 'STEP 6。文字数・話し言葉・文体などを自動でチェックします。'],
      ['提出する', 'STEP 7。先生のスプレッドシートに送信、印刷、コピーができます。']
    ].map(function (x) {
      return h('li', {}, [h('strong', { text: x[0] }), h('span', { text: x[1] })]);
    })));

    card.appendChild(h('div', { class: 'notice' }, [
      h('strong', { text: 'かかる時間の目安：40〜60分' }),
      h('p', {
        text: job
          ? '求人票と、会社のホームページを手元に用意しておくと、STEP 3 がスムーズです。'
          : '学校案内のパンフレットと、学校のホームページを手元に用意しておくと、STEP 3 がスムーズです。'
      })
    ]));

    if (!global.API.isConfigured()) {
      card.appendChild(h('div', { class: 'notice notice--warn' }, [
        h('strong', { text: '送信先が未設定です' }),
        h('p', { text: 'config.js に GAS のURLが入っていないため、STEP 7 の「スプレッドシートに送信」は使えません。下書き作成・チェック・印刷・コピーはそのまま使えます。' })
      ]));
    }
    return card;
  }

  function viewQuestions(stepId) {
    const step = steps().find(function (s) { return s.id === stepId; });
    const card = h('div', { class: 'card' }, [
      h('h2', { class: 'card__title', text: 'STEP ' + step.no + '　' + step.title }),
      h('p', { class: 'lead', text: step.lead }),
      step.note ? h('div', { class: 'notice notice--tip' }, [h('p', { text: step.note })]) : null
    ]);
    step.fields.forEach(function (f) { card.appendChild(renderField(f)); });
    return card;
  }

  function viewCompose() {
    const card = h('div', { class: 'card' }, [
      h('h2', { class: 'card__title', text: 'STEP 5　組み立てる' }),
      h('p', { class: 'lead', text: '構成を選ぶと、あなたが書いた材料をつないで下書きを作ります。できた文章は自由に直せます。' })
    ]);

    const rec = global.COMPOSE.recommend(state.data);
    card.appendChild(h('div', { class: 'notice notice--tip' }, [
      h('strong', { text: 'あなたにおすすめ：' + (global.COMPOSE.TEMPLATES.find(function (t) { return t.id === rec.id; }) || {}).name }),
      h('p', { text: rec.reason + ' もちろん、別の型を選んでもすぐに切り替わります。' })
    ]));

    const picker = h('div', { class: 'templates' });
    global.COMPOSE.TEMPLATES.forEach(function (t) {
      picker.appendChild(h('button', {
        type: 'button',
        class: 'tplCard' + (state.data.template === t.id ? ' is-on' : '') + (rec.id === t.id ? ' is-rec' : ''),
        onclick: function () {
          state.data.template = t.id;
          regenerate(true);
          render();
        }
      }, [
        rec.id === t.id ? h('span', { class: 'tplCard__badge', text: 'おすすめ' }) : null,
        h('span', { class: 'tplCard__name', text: t.name }),
        h('span', { class: 'tplCard__summary', text: t.summary }),
        h('span', { class: 'tplCard__order', text: t.order(isJob()) })
      ]));
    });
    card.appendChild(picker);

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
      h('h2', { class: 'card__title', text: 'STEP 6　見直す' }),
      h('p', { class: 'lead', text: '機械でチェックできるところを自動で確認しました。赤は直しましょう。黄色は読み返して判断してください。' }),
      h('div', { class: 'scoreRow' }, [
        h('span', { class: 'score score--error', text: '要修正 ' + errors }),
        h('span', { class: 'score score--warn', text: '確認 ' + warns }),
        h('span', { class: 'score score--ok', text: 'OK ' + (results.length - errors - warns) })
      ])
    ]);

    const list = h('ul', { class: 'checks' });
    results.forEach(function (r) {
      list.appendChild(h('li', { class: 'check check--' + r.level }, [
        h('div', { class: 'check__head' }, [
          h('span', { class: 'check__icon', text: r.level === 'ok' ? '✓' : r.level === 'warn' ? '!' : '×' }),
          h('span', { class: 'check__label', text: r.label })
        ]),
        h('p', { class: 'check__msg', text: r.message }),
        r.samples.length ? h('ul', { class: 'check__samples' }, r.samples.map(function (s) {
          return h('li', { text: s });
        })) : null
      ]));
    });
    card.appendChild(list);

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
        onclick: function () { state.index = 5; render(); }
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
      className: d.className || '',
      targetName: d.targetName || '',
      targetSub: d.targetSub || '',
      examType: d.examType || '',
      targetChars: d.targetChars || '',
      tone: d.tone || '',
      efforts: (d.efforts || []).join('、'),
      effortDetail: d.effortDetail || '',
      effortLearned: d.effortLearned || '',
      strengths: (d.strengths || []).join('、'),
      licenses: d.licenses || '',
      personality: (d.personality || []).join('、'),
      futureDream: d.futureDream || '',
      futureWhy: d.futureWhy || '',
      gapNow: d.gapNow || '',
      knewBy: d.knewBy || '',
      visited: (d.visited || []).join('、'),
      attractPoints: (d.attractPoints || []).join('、'),
      targetFeature: d.targetFeature || '',
      studyWant: d.studyWant || '',
      jobUnderstanding: d.jobUnderstanding || '',
      targetPolicy: d.targetPolicy || '',
      mainReason: d.mainReason || '',
      why1: d.whyChain.why1 || '',
      why2: d.whyChain.why2 || '',
      why3: d.whyChain.why3 || '',
      mustReason: d.mustReason || '',
      afterEnter: (d.afterEnter || []).join('、'),
      afterEnterDetail: d.afterEnterDetail || '',
      contribution: d.contribution || '',
      afterGrad: d.afterGrad || '',
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
      h('h2', { class: 'card__title', text: 'STEP 7　提出する' }),
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
  function render() {
    const V = views();
    const view = V[state.index];
    const root = document.getElementById('view');
    root.innerHTML = '';
    changeListeners = []; // 前の画面のDOMを参照している通知先を捨てる

    let node;
    if (view.id === 'start') node = viewStart();
    else if (view.id === 'compose') node = viewCompose();
    else if (view.id === 'review') node = viewReview();
    else if (view.id === 'submit') node = viewSubmit();
    else node = viewQuestions(view.id);
    root.appendChild(node);

    renderNav(V);
    renderProgress(V);
    save();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderProgress(V) {
    const pct = Math.round((state.index / (V.length - 1)) * 100);
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('stepLabel').textContent =
      state.index === 0 ? V[0].title : 'STEP ' + state.index + ' / ' + (V.length - 1) + '　' + V[state.index].title;

    const tabs = document.getElementById('stepTabs');
    tabs.innerHTML = '';
    V.forEach(function (v, i) {
      // 進路を選ぶまでは先へ飛べないようにする
      const locked = i > 0 && !state.data.course;
      tabs.appendChild(h('button', {
        type: 'button',
        title: v.title,
        class: 'tab' + (i === state.index ? ' is-on' : '') + (i < state.index ? ' is-done' : ''),
        disabled: locked ? 'disabled' : null,
        onclick: function () { if (!locked) { state.index = i; render(); } }
      }, [i === 0 ? '◎' : String(i)]));
    });
  }

  function renderNav(V) {
    const prev = document.getElementById('prevBtn');
    const next = document.getElementById('nextBtn');
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
    const step = steps().find(function (s) { return s.id === view.id; });
    if (step && !validateStep(step)) return;
    if (view.id === 'connect') regenerate(!state.bodyEdited);
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
