/**
 * アプリ設定
 * ここだけを書き換えれば動きます。（docs/03_SETUP.md の手順を参照）
 */
window.APP_CONFIG = {
  /**
   * GAS ウェブアプリのURL。
   * Apps Script で「デプロイ > 新しいデプロイ > ウェブアプリ」で発行したURLを貼り付けます。
   * 例: 'https://script.google.com/macros/s/AKfycb.../exec'
   * 空のままでも、送信以外の機能（下書き作成・チェック・印刷）はすべて使えます。
   */
  GAS_ENDPOINT: '',

  /**
   * 合言葉。GAS 側のスクリプトプロパティ FORM_TOKEN と同じ文字列にします。
   * いたずら投稿を防ぐための簡易的な仕組みです。
   */
  SHARED_TOKEN: '',

  /** 画面に出すクラス名など（任意）*/
  APP_TITLE: '志望動機メーカー',
  SUBTITLE: '進学・就職の志望動機を、質問に答えながら作ろう',

  /** 送信後に編集を続けられるようにするか */
  ALLOW_RESUBMIT: true
};
