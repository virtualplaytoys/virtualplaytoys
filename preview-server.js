// Preview server for the VirtualPlayToys static site.
// Serves the site files statically and routes
// /.netlify/functions/publish-worker-edit to the REAL function code
// (netlify/functions/publish-worker-edit.js) with a file-backed
// GitHub API stub, so worker login/self-edit works in this preview.
// publish-members and save-worker-secret are not routed: the admin
// flow needs the real ADMIN_TOTP_SECRET env var.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
process.env.GITHUB_TOKEN = 'x';
process.env.GITHUB_OWNER = 'o';
process.env.GITHUB_REPO = 'r';
process.env.WORKER_SECRETS_PATH = 'worker-secrets.json';

// GitHub contents-API stub backed by files in this worktree.
global.fetch = async (url, opts) => {
  const m = String(url).match(/repos\/[^/]+\/[^/]+\/contents\/([^?]+)/);
  if (!m) throw new Error('unexpected fetch: ' + url);
  if (opts && opts.method === 'PUT') {
    const body = JSON.parse(opts.body);
    fs.writeFileSync(path.join(ROOT, decodeURIComponent(m[1])), Buffer.from(body.content, 'base64').toString('utf8'));
    return { ok: true, status: 200, text: async () => '{}' };
  }
  const fp = path.join(ROOT, decodeURIComponent(m[1]));
  try {
    const c = Buffer.from(fs.readFileSync(fp).toString('utf8')).toString('base64');
    return { status: 200, json: async () => ({ content: c, sha: 'stub' }), text: async () => '' };
  } catch (e) {
    return { status: 404, text: async () => 'not found' };
  }
};

const workerEdit = require(path.join(ROOT, 'netlify/functions/publish-worker-edit.js'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };

http.createServer(async (req, res) => {
  if (req.url.startsWith('/.netlify/functions/publish-worker-edit')) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      const out = await workerEdit.handler({ httpMethod: 'POST', body });
      res.writeHead(out.statusCode, { 'Content-Type': 'application/json' });
      res.end(out.body);
    });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(8123, '127.0.0.1', () => console.log('vpt preview server on http://127.0.0.1:8123'));
