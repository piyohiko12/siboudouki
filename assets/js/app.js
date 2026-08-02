/**
 * 画面制御（ステップ進行・入力・保存・生成・チェック・送信）
 */
(function (global) {
  'use strict';

  const cfg = global.APP_CONFIG || {};
  const STEPS = global.QUESTIONS.STEPS;
  const STORAGE_KEY = 'shibou-douki-v1';

  // intro を 0 番目、以降に設問4ステップ + 組み立て/見直し/提出
  const VIEWS = [
    { id: 'intro', title: 'はじめに' },
    { id: 'basic', title: '基本情報' },
    { id: 'self', title: '自分を知る' },
    { id: 'school', title: '学校を知る' },
    { id: 'connect', title: 'つなげる' },
    { id: 'compose', title: '組み立てる' },
    { id: 'review', title: '見直す' },
    { id: 'submit', title: '提出する' }
  ];

  // ── 状態 ──────────────────────────────────────────
  const state = {
    index: 0,
    data: {
      targetChars: 400,
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
      state.custom = saved.custom || {};
      state.bodyEdited = !!saved.bodyEdited;
      state.index = Math.min(saved.index || 0, VIEWS.length - 1);
      return true;
    } catch (e) {
      return false;
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
      else empty = !String(state.data[f.id] == null ? '' : state.data[f.id]).trim();

      if (empty) {
        ok = false;
        if (wrap) {
          wrap.classList.add('has-error');
          if (err) err.textContent = f.type === 'whychain'
            ? '少なくとも「なぜ？1」は書きましょう。'
            : 'ここは必ず入力してください。';
          if (!firstBad) firstBad = wrap;
        }
      }
    });

    if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return ok;
  }

  // ── 各ビューの描画 ────────────────────────────────
  function viewIntro() {
    return h('div', { class: 'card' }, [
      h('h2', { class: 'card__title', text: 'このアプリでできること' }),
      h('p', { class: 'lead', text: '質問に答えていくだけで、志望動機の下書きができあがります。書いた内容は自動で保存されるので、途中でやめても大丈夫です。' }),
      h('ol', { class: 'flow' }, [
        ['材料を集める', 'STEP 1〜4。単語や短い文で答えるだけ。文章にする必要はありません。'],
        ['組み立てる', 'STEP 5。3つの構成から選ぶと、下書きが自動でできます。'],
        ['見直す', 'STEP 6。文字数・話し言葉・文体などを自動でチェックします。'],
        ['提出する', 'STEP 7。先生のスプレッドシートに送信、印刷、コピーができます。']
      ].map(function (x) {
        return h('li', {}, [h('strong', { text: x[0] }), h('span', { text: x[1] })]);
      })),
      h('div', { class: 'notice' }, [
        h('strong', { text: 'かかる時間の目安：40〜60分' }),
        h('p', { text: '学校のホームページや、学校説明会でもらったパンフレットを手元に用意しておくと、STEP 3 がスムーズです。' })
      ]),
      global.API.isConfigured() ? null : h('div', { class: 'notice notice--warn' }, [
        h('strong', { text: '送信先が未設定です' }),
        h('p', { text: 'config.js に GAS のURLが入っていないため、STEP 7 の「スプレッドシートに送信」は使えません。下書き作成・チェック・印刷・コピーはそのまま使えます。' })
      ])
    ]);
  }

  function viewQuestions(stepId) {
    const step = STEPS.find(function (s) { return s.id === stepId; });
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

    const picker = h('div', { class: 'templates' });
    global.COMPOSE.TEMPLATES.forEach(function (t) {
      picker.appendChild(h('button', {
        type: 'button',
        class: 'tplCard' + (state.data.template === t.id ? ' is-on' : ''),
        onclick: function () {
          state.data.template = t.id;
          regenerate(true);
          render();
        }
      }, [
        h('span', { class: 'tplCard__name', text: t.name }),
        h('span', { class: 'tplCard__summary', text: t.summary }),
        h('span', { class: 'tplCard__order', text: t.order })
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
    card.appendChild(h('p', { class: 'field__hint', text: '※ 文字数は空白と改行を除いて数えています。段落を分けたいところは1行あけてください。' }));

    setTimeout(function () {
      if (!state.data.body) regenerate(true);
      updateBodyMeter();
      const note = document.getElementById('composeNote');
      if (note && state.lastNote) note.textContent = state.lastNote;
    }, 0);

    return card;
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
    global.CHECKLIST.MANUAL.forEach(function (label, i) {
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
    return {
      studentName: d.studentName || '',
      juniorHigh: d.juniorHigh || '',
      className: d.className || '',
      targetSchool: d.targetSchool || '',
      targetCourse: d.targetCourse || '',
      examType: d.examType || '',
      targetChars: d.targetChars || '',
      tone: d.tone || '',
      efforts: (d.efforts || []).join('、'),
      effortDetail: d.effortDetail || '',
      effortLearned: d.effortLearned || '',
      strengths: (d.strengths || []).join('、'),
      personality: (d.personality || []).join('、'),
      futureDream: d.futureDream || '',
      futureWhy: d.futureWhy || '',
      knewBy: d.knewBy || '',
      visited: (d.visited || []).join('、'),
      visitImpression: d.visitImpression || '',
      attractPoints: (d.attractPoints || []).join('、'),
      curriculum: d.curriculum || '',
      clubWant: d.clubWant || '',
      schoolPolicy: d.schoolPolicy || '',
      mainReason: d.mainReason || '',
      why1: d.whyChain.why1 || '',
      why2: d.whyChain.why2 || '',
      why3: d.whyChain.why3 || '',
      mustReason: d.mustReason || '',
      afterEnter: (d.afterEnter || []).join('、'),
      afterEnterDetail: d.afterEnterDetail || '',
      afterGrad: d.afterGrad || '',
      template: (global.COMPOSE.TEMPLATES.find(function (t) { return t.id === d.template; }) || {}).name || '',
      body: d.body || '',
      bodyChars: global.COMPOSE.countChars(d.body || '')
    };
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
      ['名前', p.studentName], ['志望校', p.targetSchool + ' ' + p.targetCourse],
      ['構成', p.template], ['文字数', p.bodyChars + ' / ' + p.targetChars + ' 字']
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
        if (!state.data.studentName || !state.data.targetSchool) {
          status.className = 'status status--error';
          status.textContent = 'STEP 1 の「名前」と「志望校名」を入力してください。';
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
    const lines = [
      '志望動機　下書き',
      '氏名: ' + p.studentName,
      '中学校: ' + p.juniorHigh + ' ' + p.className,
      '志望校: ' + p.targetSchool + ' ' + p.targetCourse,
      '文字数: ' + p.bodyChars + ' / ' + p.targetChars,
      '',
      p.body
    ].join('\n');
    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: (p.studentName || 'shibou') + '_志望動機.txt' });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function printBody() {
    const p = payload();
    const area = document.getElementById('printArea');
    area.innerHTML =
      '<h1>志望動機</h1>' +
      '<p class="printMeta">' + esc(p.juniorHigh) + '　' + esc(p.className) + '　' + esc(p.studentName) + '</p>' +
      '<p class="printMeta">志望校：' + esc(p.targetSchool) + '　' + esc(p.targetCourse) + '</p>' +
      '<div class="printBody">' + esc(p.body).replace(/\n/g, '<br>') + '</div>' +
      '<p class="printMeta">（' + p.bodyChars + '字）</p>';
    window.print();
  }

  // ── レンダリング ──────────────────────────────────
  function render() {
    const view = VIEWS[state.index];
    const root = document.getElementById('view');
    root.innerHTML = '';
    changeListeners = []; // 前の画面のDOMを参照している通知先を捨てる

    let node;
    if (view.id === 'intro') node = viewIntro();
    else if (view.id === 'compose') node = viewCompose();
    else if (view.id === 'review') node = viewReview();
    else if (view.id === 'submit') node = viewSubmit();
    else node = viewQuestions(view.id);
    root.appendChild(node);

    renderNav();
    renderProgress();
    save();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderProgress() {
    const pct = Math.round((state.index / (VIEWS.length - 1)) * 100);
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('stepLabel').textContent =
      state.index === 0 ? 'はじめに' : 'STEP ' + state.index + ' / ' + (VIEWS.length - 1) + '　' + VIEWS[state.index].title;

    const tabs = document.getElementById('stepTabs');
    tabs.innerHTML = '';
    VIEWS.forEach(function (v, i) {
      tabs.appendChild(h('button', {
        type: 'button',
        class: 'tab' + (i === state.index ? ' is-on' : '') + (i < state.index ? ' is-done' : ''),
        onclick: function () { state.index = i; render(); }
      }, [i === 0 ? '◎' : String(i)]));
    });
  }

  function renderNav() {
    const prev = document.getElementById('prevBtn');
    const next = document.getElementById('nextBtn');
    prev.disabled = state.index === 0;
    next.style.display = state.index === VIEWS.length - 1 ? 'none' : '';
    next.textContent = state.index === 0 ? 'はじめる' :
      state.index === VIEWS.length - 2 ? '提出へ進む' : '次へ進む';
  }

  function goNext() {
    const view = VIEWS[state.index];
    const step = STEPS.find(function (s) { return s.id === view.id; });
    if (step && !validateStep(step)) return;
    if (view.id === 'connect') regenerate(!state.bodyEdited);
    state.index = Math.min(state.index + 1, VIEWS.length - 1);
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
