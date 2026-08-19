/**
 * 1枚のHTMLにまとめる。
 *
 *   node tools/single-file.js [書き出し先フォルダ]
 *
 * index.html に並んでいる CSS と JS を、そのままの順で埋め込む。
 * 読み込む本数を手で書くと api.js のように入れ忘れるので、
 * index.html の <script src> を読み取って並べている。
 *
 * 書き出すもの:
 *   preview.html   … ダブルクリックで開ける1枚版（配布用）
 *   wrapped.html   … プレビューを公開するとき用（<html> の外枠なし）
 *   gas/Index.html … GAS から配信するとき、Apps Script に貼るファイル
 *                    （書き出し先を指定してもリポジトリ内に更新する）
 */
const fs = require('fs'), path = require('path');
const base = path.resolve(__dirname, '..') + '/';
const out = process.argv[2] || process.cwd();

let html = fs.readFileSync(base + 'index.html', 'utf8');

html = html.replace(/<link[^>]*href="([^"]+\.css)"[^>]*>/g,
  (_, href) => '<style>\n' + fs.readFileSync(base + href, 'utf8') + '\n</style>');

const srcs = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)].map(m => m[1]);
const js = srcs.map(s => '/* ' + s + ' */\n' + fs.readFileSync(base + s, 'utf8')).join('\n');
html = html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>\s*/g, '');
// 置きかえ文字列に $ が入っていると特別な意味になってしまうので、関数で渡す
html = html.replace('</body>', function () { return '<script>\n' + js + '\n</script>\n</body>'; });

fs.writeFileSync(path.join(out, 'preview.html'), html);

// Artifact 用：<!doctype>/<html>/<head>/<body> は公開側が付けるので外す
const head = html.match(/<head[^>]*>([\s\S]*)<\/head>/)[1]
  .replace(/<meta[^>]*charset[^>]*>/, '')
  .replace(/<link[^>]*rel="icon"[^>]*>/, '');
const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
fs.writeFileSync(path.join(out, 'wrapped.html'), head + '\n' + body);

// GAS 配信用。Apps Script の HTML ファイルは <base target="_top"> を入れておかないと、
// 中のリンクがサンドボックスの iframe の中で開いてしまう
fs.writeFileSync(base + 'gas/Index.html',
  html.replace('<head>', '<head>\n  <base target="_top">'));

console.log('埋め込んだJS:', srcs.join(' , '));
console.log('書き出し:', path.join(out, 'preview.html'));
console.log('        ', path.join(out, 'wrapped.html'));
console.log('        ', base + 'gas/Index.html');
