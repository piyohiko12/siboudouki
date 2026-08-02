/**
 * GAS ウェブアプリへの送信
 *
 * CORS について:
 *   Content-Type を 'text/plain' にすると、ブラウザはプリフライト(OPTIONS)を送らない。
 *   GAS は OPTIONS に応答できないため、これが最も確実に通る方法。
 *   本文は JSON 文字列にしておき、GAS 側で JSON.parse する。
 */
(function (global) {
  'use strict';

  const cfg = global.APP_CONFIG || {};

  function isConfigured() {
    return !!(cfg.GAS_ENDPOINT && /^https:\/\/script\.google\.com\//.test(cfg.GAS_ENDPOINT));
  }

  /**
   * @param {Object} payload 送信する内容
   * @returns {Promise<{ok:boolean, message:string, row?:number}>}
   */
  async function submit(payload) {
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

  global.API = { submit: submit, isConfigured: isConfigured };
})(window);
