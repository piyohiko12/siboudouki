/**
 * GAS ウェブアプリとのやりとり
 *
 * このアプリは2通りの置き方ができる。
 *
 *   ① どこかのサーバー（GitHub Pages など）に置く
 *      → GAS の /exec に fetch で送る。
 *        Content-Type を 'text/plain' にすると、ブラウザはプリフライト(OPTIONS)を
 *        送らない。GAS は OPTIONS に応答できないため、これが最も確実に通る。
 *
 *   ② GAS 自体から配信する（doGet でこのページを返す）
 *      → ページは GAS のサンドボックス（iframe）の中で動く。
 *        fetch は使わず google.script.run で直接よぶ。合言葉も要らない。
 *
 * 下書きの保存先も、この2つで変える。
 * GAS 配信のとき、iframe のアドレスは読み込みのたびに変わることがあり、
 * localStorage が前回の続きとして残らない。
 * そのため、サーバー側（スプレッドシート）にも下書きを預ける。
 */
(function (global) {
  'use strict';

  const cfg = global.APP_CONFIG || {};

  /** GAS から配信されている（google.script.run が使える）か */
  function inGas() {
    return !!(global.google && global.google.script && global.google.script.run);
  }

  function isConfigured() {
    if (inGas()) return true;
    return !!(cfg.GAS_ENDPOINT && /^https:\/\/script\.google\.com\//.test(cfg.GAS_ENDPOINT));
  }

  /** google.script.run を Promise で使えるようにする */
  function callGas(name, arg) {
    return new Promise(function (resolve, reject) {
      global.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(function (err) {
          reject(new Error((err && err.message) || 'サーバー側でエラーが起きました。'));
        })[name](arg);
    });
  }

  // ── 提出 ────────────────────────────────────────
  /**
   * @param {Object} payload 送信する内容
   * @returns {Promise<{ok:boolean, message:string, row?:number}>}
   */
  async function submit(payload) {
    if (inGas()) {
      const res = await callGas('submitFromPage', payload);
      if (!res || !res.ok) throw new Error((res && res.message) || '送信に失敗しました。');
      return res;
    }

    if (!isConfigured()) {
      throw new Error('送信先が設定されていません。config.js の GAS_ENDPOINT を設定してください。');
    }

    const body = JSON.stringify(Object.assign({ token: cfg.SHARED_TOKEN || '' }, payload));

    const res = await fetch(cfg.GAS_ENDPOINT, {
      method: 'POST',
      // プリフライトを避けるため、あえて text/plain を使う
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
      redirect: 'follow'
    });

    if (!res.ok) {
      throw new Error('送信に失敗しました（HTTP ' + res.status + '）。URLとデプロイ設定を確認してください。');
    }

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      // ログイン画面のHTMLが返ってきたときなど
      throw new Error('サーバーの応答を読み取れませんでした。デプロイ時のアクセス権を「全員」にしてください。');
    }

    if (!json.ok) throw new Error(json.message || '送信に失敗しました。');
    return json;
  }

  // ── 下書きの預け先 ──────────────────────────────
  /**
   * サーバーに下書きを預けられるか。
   * GAS 配信で、かつ誰が開いているか分かる（同じドメインのユーザーに限定して
   * デプロイしてある）ときだけ true になる。
   */
  let draftReady = null;

  function canKeepDraft() {
    if (!inGas()) return Promise.resolve(false);
    if (draftReady) return draftReady;
    draftReady = callGas('canKeepDraft').catch(function () { return false; });
    return draftReady;
  }

  async function loadDraft() {
    if (!(await canKeepDraft())) return null;
    try {
      return (await callGas('loadDraft')) || null;
    } catch (e) {
      return null;
    }
  }

  async function saveDraft(text) {
    if (!(await canKeepDraft())) return false;
    try {
      await callGas('saveDraft', String(text || ''));
      return true;
    } catch (e) {
      return false;
    }
  }

  async function clearDraft() {
    if (!(await canKeepDraft())) return false;
    try {
      await callGas('clearDraft');
      return true;
    } catch (e) {
      return false;
    }
  }

  global.API = {
    submit: submit,
    isConfigured: isConfigured,
    inGas: inGas,
    canKeepDraft: canKeepDraft,
    loadDraft: loadDraft,
    saveDraft: saveDraft,
    clearDraft: clearDraft
  };
})(window);
