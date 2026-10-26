/* ---------- test hooks: added to the end of the game's script by tests/run.mjs (never shipped) ---------- */
window.__noraf = true;   // the game only moves when a test steps it
window.__T = (c) => eval(c);   // run test code in the game's scope
window.__val = (v) => (v && typeof v === 'object' && (v.mesh || v.isObject3D || ![Object, Array].includes(v.constructor)) ? '[' + (v.type || v.constructor.name) + (v.kind ? ' ' + v.kind : '') + ']' : v);   // (game objects don't travel: a name instead)
const __log = window.__log = { awards: [], deaths: [] };
const __test = { pinX: null, quiet: false };
const __orig = { give, die, spawnTraffic, triggerCross, genChunk };
give = function (name, x, label) { const pts = __orig.give(name, x, label); __log.awards.push({ name, label: label || name, pts, chain: AWARDS[name] && AWARDS[name].chain }); return pts; };
die = function (kind, ent) { const was = Game.state; __orig.die(kind, ent); if (was === 'play' && Game.state !== 'play') __log.deaths.push(kind); };
// quiet: an empty road (no traffic, no cross traffic, nothing standing in the road), so a test only meets what it puts there
spawnTraffic = function (run, dt, playing) { if (!__test.quiet) __orig.spawnTraffic(run, dt, playing); };
triggerCross = function (run, I) { if (__test.quiet) { I.triggered = true; return; } __orig.triggerCross(run, I); };
genChunk = function (run, z0, idx) { __orig.genChunk(run, z0, idx); if (__test.quiet) __quietChunk(run, run.chunks[run.chunks.length - 1]); };
function __quietChunk(run, ch) {
  ch.statics = ch.statics.filter((s) => Math.abs(s.x) - s.hw > 8.5);   // keep the sidewalks, parked cars and bike lane
  ch.items = [];
}
function __quietRun(run) {
  for (let i = run.ents.length - 1; i >= 0; i--) killEnt(run, i);
  for (const ch of run.chunks) __quietChunk(run, ch);
  run.ramps.length = 0; run.closures = run.closures.filter((c) => c.lane !== 3 || !c.ch);
}
// opts: { seed (default 1), god, quiet, level, speed, x }
window.__reset = (o) => {
  o = o || {};
  __test.pinX = null; __test.quiet = !!o.quiet;
  if (Game.state === 'replay') endReplay();
  showScreen(null); SETTINGS_UI.open = false; DBG_UI.open = false; LB.open = false;
  rnd.seed(o.seed !== undefined ? o.seed : 1); sfxRnd.seed(1); LINE_IX.clear();   // the same seed plays out the same way
  startFromMenu();
  if (o.level) { Game.level = o.level; beginLevel(); }
  Game.debug.god = !!o.god; Game.cash = 0;
  if (o.quiet) { for (const r of runs) __quietRun(r); Game.billAt = Infinity; }
  Game.cd = -1; __step(1 / 60);   // skip the countdown
  if (o.speed) player.speed = o.speed;
  if (o.x !== undefined) { player.x = o.x; __test.pinX = o.x; }
  __log.awards.length = 0; __log.deaths.length = 0;
  return Game.state;
};
window.__pin = (x) => { __test.pinX = x; if (x !== null) player.x = x; };   // hold the rider at this x (null: let go)
window.__step = (sec) => {
  const n = Math.max(1, Math.round(sec * 60)), rr = renderer.render;
  renderer.render = () => {};   // no drawing: that's most of a frame's cost
  try {
    for (let k = 0; k < n; k++) {
      if (__test.pinX !== null && Game.state === 'play') { player.x = __test.pinX; player.vx = 0; }
      lastT = 0; frame(1000 / 60);   // exactly 1/60 s every time (a clock plus 16.67 ms rounds differently as the clock grows)
    }
  } finally { renderer.render = rr; }
  return Game.state;
};
window.__until = (cond, max) => {   // step until cond() holds; the seconds it took, or -1
  for (let k = 0; k <= max * 60; k++) { if (cond()) return k / 60; __step(1 / 60); }
  return -1;
};
window.__render = () => renderer.render(scene, camera);
// a fake game controller (the game reads navigator.getGamepads())
window.__pad = { id: 'Test Pad (STANDARD GAMEPAD)', connected: true, mapping: 'standard', index: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
navigator.getGamepads = () => [window.__pad];
window.__press = (i, sec) => { __pad.buttons[i].pressed = true; __pad.buttons[i].value = 1; __step(sec || 0.1); __pad.buttons[i].pressed = false; __pad.buttons[i].value = 0; __step(0.1); };
