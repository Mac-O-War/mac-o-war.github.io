// What Do? test runner: node tests/run.mjs [part of a test's name, or several: ramp|roof]
// One headless Chrome, one page load. Every test starts from a fresh level (resetWorld) and moves the game forward
// in fixed 1/60 s steps without drawing anything, so a few seconds of play take a fraction of a second.
// The game itself is untouched: the runner loads a temporary copy with a few test hooks added at the end of its script.
// A failed test saves a screenshot to tests/.out/. No npm packages needed (Node 20+, Chrome).
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (typeof WebSocket === 'undefined') {   // Node 20 keeps WebSocket behind a flag: run again with it
  const c = spawn(process.execPath, ['--experimental-websocket', '--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit' });
  c.on('exit', (code) => process.exit(code));
} else await main();

async function main() {
  const T0 = Date.now(), HERE = dirname(fileURLToPath(import.meta.url)), GAME = join(HERE, '..'), OUT = join(HERE, '.out'), TMP = mkdtempSync(join(tmpdir(), 'whatdo-tests-'));   // (its own folder each run: an old Chrome may still be letting go of the last one)
  const filter = (process.argv[2] || '').toLowerCase();
  rmSync(OUT, { recursive: true, force: true });

  // ---------- the game with test hooks ----------
  let s = readFileSync(join(GAME, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  const swap = (a, b) => { if (!s.includes(a)) throw new Error('runner: the game no longer contains: ' + a.slice(0, 60)); s = s.replace(a, b); };
  swap('<head>', '<head>\n<base href="' + pathToFileURL(GAME).href + '/">');   // vendor/, fonts/, icons/ from the real folder
  swap('function frame(now) {\n  requestAnimationFrame(frame);', 'function frame(now) {\n  if (!window.__noraf) requestAnimationFrame(frame);');
  swap('requestAnimationFrame(frame);\n})();\n</script>', 'requestAnimationFrame(frame);\n' + readFileSync(join(HERE, 'hooks.js'), 'utf8') + '\n})();\n</script>');
  s = s.replace('const rnd = makeRng(', 'let rnd = makeRng(');   // so a test can wrap it to see who draws random numbers
  s = s.replace(/<script data-goatcounter[^\n]*<\/script>/, '');   // no analytics from tests
  writeFileSync(join(TMP, 'index.html'), s);

  // ---------- tests ----------
  const tests = [];
  for (const f of readdirSync(HERE).filter((f) => f.endsWith('.test.mjs')).sort()) {
    const mod = await import(pathToFileURL(join(HERE, f)).href);
    mod.default((name, fn, opts) => tests.push({ name, fn, opts: opts || {} }));
  }
  const todo = tests.filter((t) => !filter || filter.split('|').some((f) => t.name.toLowerCase().includes(f)));   // (a|b: either)

  // ---------- Chrome ----------
  const chromePath = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p));
  if (!chromePath) throw new Error('Chrome not found: set CHROME to its path');
  const prof = join(TMP, 'profile');
  const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files',
    '--autoplay-policy=no-user-gesture-required', '--window-size=960,540', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let port;
  for (let i = 0; i < 100 && !port; i++) { try { port = readFileSync(join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { await sleep(50); } }
  let wsUrl;
  for (let i = 0; i < 100 && !wsUrl; i++) { try { const l = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); const p = l.find((t) => t.type === 'page'); if (p) wsUrl = p.webSocketDebuggerUrl; } catch (e) { /* not up yet */ } if (!wsUrl) await sleep(50); }
  if (!wsUrl) { chrome.kill(); throw new Error('could not connect to Chrome'); }
  const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(), errors = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') { const x = d.params.exceptionDetails; errors.push((x.exception && x.exception.description) || x.text); }
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error: ' + d.params.args.map((a) => a.value !== undefined ? a.value : a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  // run code inside the game's own scope (so tests see Game, player, award... directly)
  const js = async (code) => {
    const r = await send('Runtime.evaluate', { expression: 'window.__val(window.__T(' + JSON.stringify(code) + '))', returnByValue: true, awaitPromise: true });
    if (r.error) throw new Error(r.error.message);
    const x = r.result.exceptionDetails;
    if (x) throw new Error('in the game: ' + ((x.exception && x.exception.description) || x.text).split('\n').slice(0, 3).join(' / ') + '\n    code: ' + code.slice(0, 200));
    return r.result.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: pathToFileURL(join(TMP, 'index.html')).href });
  for (let i = 0; i < 300; i++) {
    const r = await send('Runtime.evaluate', { expression: "typeof window.__T === 'function'", returnByValue: true });
    if (r.result && r.result.result && r.result.result.value) break; await sleep(25);
  }
  const loadErrors = errors.splice(0);
  const tLoad = Date.now() - T0;

  // ---------- run ----------
  let pass = 0, fail = 0;
  const g = makeApi(js);
  if (loadErrors.length) { fail++; console.log('\x1b[31m✗ page load\x1b[0m\n    ' + loadErrors.join('\n    ')); }
  for (const t of todo) {
    const t1 = Date.now(); errors.length = 0; g.notes.length = 0;
    let err = null;
    try {
      await js('__reset(' + JSON.stringify(t.opts) + ')');
      await t.fn(g);
      if (errors.length) throw new Error('page error: ' + errors.join('\n    '));
    } catch (e) { err = e; }
    const ms = Date.now() - t1;
    if (!err) { pass++; console.log('\x1b[32m✓\x1b[0m ' + t.name + ' \x1b[90m' + ms + ' ms\x1b[0m'); continue; }
    fail++;
    console.log('\x1b[31m✗ ' + t.name + '\x1b[0m \x1b[90m' + ms + ' ms\x1b[0m\n    ' + String(err.message || err).replace(/\n/g, '\n    '));
    if (g.notes.length) console.log('    ' + g.notes.join('\n    '));
    try {
      console.log('    awards: ' + JSON.stringify(await js('__log.awards.map((a) => a.label)')) + ' · deaths: ' + JSON.stringify(await js('__log.deaths')) + ' · state: ' + await js('Game.state'));
      await js('__render()');
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      mkdirSync(OUT, { recursive: true });
      const f = join(OUT, t.name.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') + '.png');
      writeFileSync(f, Buffer.from(shot.result.data, 'base64')); console.log('    screenshot: ' + f);
    } catch (e) { /* the page may be gone */ }
  }
  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' passed, ' + fail + ' failed\x1b[0m \x1b[90m(' + ((Date.now() - T0) / 1000).toFixed(1) + ' s; browser and load ' + (tLoad / 1000).toFixed(1) + ' s)\x1b[0m');
  const gone = new Promise((r) => chrome.once('exit', r));
  try { await Promise.race([send('Browser.close'), sleep(2000)]); ws.close(); } catch (e) { /* ignore */ }
  await Promise.race([gone, sleep(3000)]); chrome.kill();
  try { rmSync(TMP, { recursive: true, force: true, maxRetries: 5 }); } catch (e) { /* the OS cleans its temp folder eventually */ }
  process.exit(fail ? 1 : 0);
}

// what a test gets: run code in the game, step time, and check things
function makeApi(js) {
  const notes = [];
  const fail = (msg) => { throw new Error(msg); };
  const g = {
    js, notes,
    note: (s) => notes.push(s),
    step: (sec) => js('__step(' + sec + ')'),
    // step until a condition (game code) holds, at most `max` seconds; returns how long it took
    until: async (cond, max = 10) => {
      const t = await js('__until(() => (' + cond + '), ' + max + ')');
      if (t < 0) fail('never happened within ' + max + ' s: ' + cond);
      return t;
    },
    awards: () => js('__log.awards.map((a) => a.label)'),
    async expectAward(re, msg) { const a = await g.awards(); if (!a.some((l) => re.test(l))) fail((msg || 'expected an award matching ' + re) + '; got ' + JSON.stringify(a)); },
    async expectNoAward(re) { const a = await g.awards(); const hit = a.filter((l) => re.test(l)); if (hit.length) fail('expected no award matching ' + re + '; got ' + JSON.stringify(hit)); },
    async expectAlive() { const st = await js('Game.state'), d = await js('__log.deaths'); if (st !== 'play' || d.length) fail('expected to be riding; state ' + st + ', deaths ' + JSON.stringify(d)); },
    async expectDeath(kind) { const d = await js('__log.deaths'); if (!d.includes(kind)) fail('expected a crash into ' + kind + '; deaths ' + JSON.stringify(d) + ', state ' + await js('Game.state')); },
    async expect(code, msg) { const v = await js(code); if (!v) fail((msg || 'expected') + ': ' + code + ' was ' + JSON.stringify(v)); },
    eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) fail((msg || 'expected equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); },
    ok(v, msg) { if (!v) fail(msg || 'expected true'); }
  };
  return g;
}
