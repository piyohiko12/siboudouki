/**
 * 1枚のHTMLにまとめる（プレビューを配るとき用）。
 *
 *   node tools/single-file.js <書き出し先フォルダ>
 *
 * index.html に並んでいる CSS と JS を、そのままの順で埋め込む。
 * 読み込む本数を手で書くと api.js のように入れ忘れるので、
 * index.html の <script src> を読み取って並べている。
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

console.log('埋め込んだJS:', srcs.join(' , '));
console.log('preview.html / wrapped.html を書き出しました');
