import { readFileSync } from 'node:fs';

// What Do? tests. Each one starts riding a fresh level 1 (the countdown skipped); options:
//   quiet: an empty road (no traffic, nothing in the road) · god: can't crash · x: hold the rider at this x · speed: m/s
// g.js(code) runs code inside the game (Game, player, spawnCar... are all in scope); g.step(s) plays s seconds.

// a tow-truck ramp whose low end is dz metres ahead of the rider (in the right lane, x = RAMP_X)
const RAMP = (dz) => `(() => {
  const r = player.run, zLow = player.z - ${dz}, ch = r.chunks.find((c) => zLow <= c.z0 && zLow > c.z0 - CH);
  towTruck(new THREE.Group(), [], ch, r, zLow - ch.z0); return zLow;
})()`;
const LANDED = '!player.jumped && !player.roof && player.hy === 0 && player.vy === 0';

export default (test) => {
  // ---------- the basics ----------
  test('the countdown leads into the ride', async (g) => {
    g.eq(await g.js("startFromMenu(); Game.state"), 'countdown');
    await g.until("Game.state === 'play'", 4);
    await g.step(1);
    await g.expect('player.speed > 10 && player.z < -5', 'riding forward');
  });

  test('every per-frame updater runs', async (g) => {
    // (they once ended up inside a // comment and silently stopped)
    const names = ['updateBubbles', 'updateCitySound', 'updateSteam', 'updateLeaves', 'updateAlarms', 'updateSnaps', 'updateDecor', 'updateItems', 'updateDrone', 'updateEagle', 'updateUfo', 'updateRivalDebris', 'updateParticles', 'updateCamera', 'updateHud', 'checkStreetSpots', 'updateShouts', 'simulate', 'present'];
    const counts = await g.js(`(() => {
      const n = {}, keep = {}, names = [...new Set(${JSON.stringify(names)})];
      for (const f of names) { keep[f] = eval(f); n[f] = 0; eval(f + ' = function () { n[f]++; return keep[f].apply(this, arguments); }'); }
      const su = Sky.update; n.SkyUpdate = 0; Sky.update = function () { n.SkyUpdate++; return su.apply(this, arguments); };
      try { __step(0.5); } finally { for (const f of names) eval(f + ' = keep[f]'); Sky.update = su; }
      return n;
    })()`);
    const idle = Object.keys(counts).filter((k) => counts[k] === 0);
    g.ok(!idle.length, 'never called: ' + idle.join(', '));
  });

  test('20 s of real traffic in god mode', async (g) => {
    await g.step(20);
    await g.expect("Game.state === 'play' || Game.state === 'winning'", 'still riding');
    await g.expect('Game.score > 100', 'scoring');
  }, { god: true });

  test('the same seed plays out the same way; another seed differs', async (g) => {
    // all in one go each (no gap where a timer could fire): 15 s of real traffic in god mode, then where everything is
    const snap = (seed) => g.js(`(() => { __reset({ seed: ${seed}, god: true }); __step(15);
      return JSON.stringify([Math.round(Game.score), player.z.toFixed(3), player.run.ents.map((e) => e.type + ':' + e.kind + ':' + e.z.toFixed(2)), RIVAL_CRASHES.length]); })()`);
    const a = await snap(7), b = await snap(7), c = await snap(8);
    g.eq(a, b, 'seed 7 twice');
    g.ok(a !== c, 'seed 8 should differ from seed 7');
  });

  // ---------- the file's layout ----------
  test('the CONTENTS list at the top of the script matches the section banners', async (g) => {
    const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const toc = /\/\* CONTENTS[^\n]*\n([\s\S]*?)\*\//.exec(src)[1].split('\n').map((l) => l.trim()).filter(Boolean);
    const banners = [...src.matchAll(/^\/\* =+\n {3}(.+)\n/gm)].map((m) => m[1].split(/ — |: | \(/)[0].trim());
    g.eq(toc, banners, 'CONTENTS vs banners');
  });

  // ---------- the awards table ----------
  test('every award the game pays is in the AWARDS table, and every table entry is paid somewhere', async (g) => {
    const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const table = await g.js('Object.keys(AWARDS)'), tricks = await g.js('Object.values(TRICK_NAMES)');
    const given = new Set([...src.matchAll(/give\('([^']+)'/g)].map((m) => m[1]));
    for (const m of src.matchAll(/give\(\w+ \? '([^']+)' : '([^']+)'/g)) { given.add(m[1]); given.add(m[2]); }   // give(x ? 'A' : 'B', ...)
    for (const t of tricks) given.add(t);
    for (const n of await g.js("[...Object.values(KINDS).map((k) => k.near).filter(Boolean), ...Object.values(NEAR_BY_TYPE), 'CLOSE SHAVE!']")) given.add(n);   // near misses: by kind
    const missing = [...given].filter((n) => !table.includes(n));
    g.ok(!missing.length, 'paid but not in the table: ' + missing.join(', '));
    const unpaid = table.filter((n) => !given.has(n) && !['LEVEL CLEAR', 'RIDING'].includes(n));   // (those two are paid outside give)
    g.ok(!unpaid.length, 'in the table but never paid: ' + unpaid.join(', '));
    g.ok(!/[^.\w]award\(/.test(src), 'something still calls award() instead of give()');
  });

  test('every kind of thing in the street is in KINDS', async (g) => {
    const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const kinds = new Set([...src.matchAll(/addStatic\([^;]*?'(\w+)'\)/g)].map((m) => m[1]));
    // and whatever turns up in 30 s of riding that you can hit
    for (const k of await g.js(`(() => { const seen = new Set(); for (let i = 0; i < 30; i++) { __step(1);
      for (const r of runs) { for (const e of r.ents) if (e.lethal && e.kind) seen.add(e.kind); for (const ch of r.chunks) for (const st of ch.statics) seen.add(st.kind); } }
      return [...seen]; })()`)) kinds.add(k);
    const known = await g.js('Object.keys(KINDS)'), missing = [...kinds].filter((k) => !known.includes(k));
    g.ok(!missing.length, 'not in KINDS: ' + missing.join(', '));
  }, { god: true });

  test('the scoring guide lists the table', async (g) => {
    const rows = await g.js("buildScoring(), [...document.querySelectorAll('#scoreList .srow .sn')].map((e) => e.firstChild.textContent)");
    for (const n of ['THREAD THE NEEDLE!', 'ROOF LANDING!', 'CAR / BUS / TRUCK SURFING', 'BUNNY HOP', 'RIVAL SMOKED!', 'CHAIN']) g.ok(rows.includes(n), 'guide is missing ' + n);
    g.ok(!rows.includes('HOP 360'), 'guide: false entries stay out');
  });

  // ---------- tow-truck ramp ----------
  for (const dx of [0, -1.4, 1.4]) {
    test('ramp: up the bed ' + (dx ? (dx > 0 ? 'right' : 'left') + ' of centre' : 'in the middle') + ', launch, land', async (g) => {
      await g.js(RAMP(25)); await g.js('__pin(RAMP_X + ' + dx + ')');
      await g.until('player.onRamp', 3);
      await g.until('player.jumped', 3);
      await g.expect('player.hy > 2', 'launched off the top');
      await g.until(LANDED, 4);
      await g.expectAlive();
      await g.expectAward(/^BIG AIR!/);
    }, { quiet: true, speed: 19 });
  }

  test('ramp: riding into the side of the bed is a crash', async (g) => {
    const zLow = await g.js(RAMP(15));
    await g.js('__pin(RAMP_X - 3)');
    await g.until('player.z < ' + (zLow - 3), 3);
    await g.js('__pin(RAMP_X)'); await g.step(0.2);
    await g.expectDeath('towbed');
  }, { quiet: true, speed: 19 });

  // ---------- jumps and roofs ----------
  test('jumping over an oncoming car: CAR JUMP!', async (g) => {
    await g.js("spawnCar(player.run, 1, player.z - 14, 'sedan'); player.hy = 3; player.vy = 6; player.jumped = true");
    await g.until(LANDED, 3);
    await g.expectAlive();
    await g.expectAward(/^CAR JUMP!/);
  }, { quiet: true, speed: 19, x: -2.25 });

  for (const kind of ['bus', 'truck']) {
    test('roof: land on a moving ' + kind + ', ride it, drop off the front', async (g) => {
      await g.js(`spawnCar(player.run, 3, player.z - 3, '${kind}'); player.hy = 3.6; player.vy = 0; player.jumped = true`);
      await g.until('player.roof', 1);
      await g.expectAward(/^ROOF LANDING!/);
      await g.until(LANDED, 8);
      await g.expectAlive();
      await g.expectAward(new RegExp('^' + kind.toUpperCase() + ' SURFING'));
    }, { quiet: true, speed: 19, x: 6.75 });
  }

  test('roof: land on a parked car', async (g) => {
    const found = await g.js(`(() => {
      const s = player.run.chunks.flatMap((c) => c.statics).filter((s) => s.kind === 'parked' && s.veh && KINDS[s.veh.kind] && KINDS[s.veh.kind].roof && KINDS[s.veh.kind].roof.cabin && s.z < player.z - 15).sort((a, b) => b.z - a.z)[0];
      if (!s) return false;
      const c = KINDS[s.veh.kind].roof;   // just above the back of its cabin roof, coming down
      player.z = s.z - c.back + c.len / 2 - 0.3; __pin(s.x); player.hy = c.cabin + 0.04; player.vy = -0.1; player.jumped = true; return true;
    })()`);
    if (!found) { g.note('(no parked car on this street)'); return; }
    await g.until('player.roof', 1);
    await g.expectAward(/^ROOF LANDING!/);
  }, { quiet: true, speed: 19 });

  // ---------- cross traffic ----------
  test('cross traffic: behind two bumpers inside a second is THREAD THE NEEDLE!', async (g) => {
    // car A crosses 5 m ahead going right, car B 12 m ahead going left: each is 3.5 m clear of the rider
    // (bumper to rider) at the moment the rider crosses its path, then they go on away from the rider
    await g.js(`(() => {
      const r = player.run, z = player.z, gap = (e) => P_HW + e.hw + 3.5;
      const a = spawnCross(r, { zc: z - 5 - 4.5 }, 0, 1, 30, 0); a.x = player.x + gap(a) - 30 * 5 / 19;
      const b = spawnCross(r, { zc: z - 12 + 4.5 }, 0, -1, 30, 0); b.x = player.x - gap(b) + 30 * 12 / 19;
    })()`);
    await g.step(1.2);
    await g.expectAlive();
    await g.expectAward(/^BEHIND THE BUMPER!/);
    await g.expectAward(/^THREAD THE NEEDLE!/);
  }, { quiet: true, speed: 19, x: 0 });

  test('cross traffic: one pass after a restart is not THREAD THE NEEDLE! (the last game’s pass is forgotten)', async (g) => {
    await g.js('SC.lastCross = { t: 50, e: {}, front: true, tight: 1 }; resetScoring()');   // a pass late in the game before
    await g.js(`(() => { const a = spawnCross(player.run, { zc: player.z - 5 - 4.5 }, 0, 1, 30, 0); a.x = player.x + P_HW + a.hw + 3.5 - 30 * 5 / 19; })()`);
    await g.step(0.8);
    await g.expectAward(/^BEHIND THE BUMPER!/);
    await g.expectNoAward(/^THREAD THE NEEDLE!/);
  }, { quiet: true, speed: 19, x: 0 });

  // ---------- near misses, by kind ----------
  for (const [what, spawn, re] of [
    ['the hot-dog guy', "spawnPed(player.run, 'hotdog', player.x + 1.2, player.z - 10, 'stand')", /^RELISH THE MOMENT!/],
    ['a pedestrian', "spawnPed(player.run, 'business', player.x + 1.2, player.z - 10, 'stand')", /^EXCUSE ME!/],
    ['the preacher', "spawnPed(player.run, 'preacher', player.x + 1.4, player.z - 10, 'stand', { hw: 0.45, hd: 0.4 })", /^HALLELUJAH!/],
    ['a skateboarder', "Object.assign(spawnBike(player.run, player.x + 1.2, player.z - 10, 1, 'skate'), { v: 0 })", /^SKATE DODGE!/]]) {
    test('near miss: ' + what, async (g) => {
      await g.js(spawn);
      await g.step(1);
      await g.expectAlive();
      await g.expectAward(re);
    }, { quiet: true, speed: 19, x: 0 });
  }
  test('near miss: what a pedestrian says comes from KINDS', async (g) => {
    await g.js("spawnPed(player.run, 'hotdog', player.x + 1.2, player.z - 10, 'stand')");
    await g.step(1);
    const said = await g.js('BUBBLES.map((b) => b.el.textContent)');
    g.ok(said.length && await g.js('BUBBLES.every((b) => KINDS.hotdog.bubbles.includes(b.el.textContent))'), 'bubbles: ' + JSON.stringify(said));
  }, { quiet: true, speed: 19, x: 0 });

  // ---------- tricks ----------
  test('mashed hops and spins are worth almost nothing and leave the chain alone', async (g) => {
    await g.js('for (let i = 0; i < 6; i++) { hop(); __step(0.8); spin360(); __step(0.8); }');
    const a = (await g.js('__log.awards')).filter((x) => /^(BUNNY HOP|SPIN 360!|HOP 360)/.test(x.label));   // (not whatever else it rode past)
    g.ok(a.length >= 10, 'awards: ' + a.length);
    g.ok(a.every((x) => x.chain === 'none'), 'all chain-neutral');
    g.ok(a.reduce((t, x) => t + x.pts, 0) < 200, 'total ' + a.reduce((t, x) => t + x.pts, 0));
    await g.expect('SC.chainN <= 1', 'no chain');
  }, { quiet: true, speed: 19 });

  test('a spin off a ramp is an AIR 360', async (g) => {
    await g.js(RAMP(20)); await g.js('__pin(RAMP_X)');
    await g.until('player.jumped', 3);
    await g.js('spin360()');
    await g.until(LANDED, 4);
    await g.expectAlive();
    await g.expectAward(/^AIR 360!/);
  }, { quiet: true, speed: 19 });

  test('landing mid-spin is a crash', async (g) => {
    await g.js('player.hy = 1.2; player.vy = 0; player.jumped = true; spin360()');
    await g.step(0.6);
    await g.expectDeath('midspin');
  }, { quiet: true, speed: 19 });

  // ---------- characters ----------
  test('squashing Pizza Rat calls the UFO UFO_DELAY seconds later', async (g) => {
    await g.js("const e = spawnPed(player.run, 'rat', player.x, player.z - 8, 'cross', { xLim: 12, hw: 0.3, hd: 0.6, bubbleY: 1.2 }); e.vx = 0");
    await g.until('UFO.pending', 2);
    await g.expectAlive();
    const t = await g.until("UFO.state !== 'off'", 8);
    const d = await g.js('UFO_DELAY'); g.ok(Math.abs(t - d) < 1, 'arrived after ' + t.toFixed(2) + ' s (UFO_DELAY is ' + d + ')');
  }, { quiet: true, speed: 19, x: 0 });

  test('dollar bills: grab one, and enough of them call a rival', async (g) => {
    await g.js('Game.billAt = Game.elapsed + 0.05');
    await g.until('BILL.on', 1);
    await g.js('BILL.x = player.x; BILL.z = player.z - 12');   // (wherever it blew in from: put it just ahead in the lane)
    await g.until('(__pin(clamp(BILL.x, -8, 8)), !BILL.on)', 5);
    await g.expectAward(/^COLD HARD CASH!/);
    await g.expect('Game.cash === 1');
    await g.js('Game.cash = RIVAL_CASH; __step(0.1)');
    await g.expect("player.run.ents.some((e) => e.type === 'rival')", 'a rival rode in');
    await g.expect('Game.cash === 0');
  }, { quiet: true, speed: 19, x: 0 });

  test('riding into the rival wipes him out, not you', async (g) => {
    await g.js('const e = spawnRival(); e.x = player.x; e.z = player.z - 1.2; e.v = 0');
    await g.step(0.3);
    await g.expectAlive();
    await g.expectAward(/^RIVAL WIPED OUT!/);
  }, { quiet: true, speed: 19, x: 2.25 });

  // ---------- crash, replay, level end ----------
  test('a crash plays the replay, then the game-over screen; sky things are hidden after', async (g) => {
    await g.step(3);   // something to replay
    await g.js("die('taxi', null)");
    await g.expectDeath('taxi');
    await g.until("Game.state === 'replay'", 5);
    await g.until("Game.state === 'over'", 20);
    await g.expect("!$('overScreen').classList.contains('hidden')", 'game-over screen up');
    await g.expect('!UFO.mesh.visible && !UFO.beam.visible', 'no UFO left behind');
  }, { quiet: true, speed: 19 });

  test('surviving the level clears it', async (g) => {
    await g.js('Game.elapsed = Game.levelTime - 0.1');
    await g.until("Game.state === 'winning' || Game.state === 'win'", 1);
    await g.until("!$('winScreen').classList.contains('hidden')", 4);
  }, { quiet: true, speed: 19 });

  // ---------- menus with a controller ----------
  test('controller: pause, reach DEBUG, its first button is UFO, BACK and resume', async (g) => {
    await g.js('__press(9)');
    g.eq(await g.js('Game.state'), 'paused');
    // DEBUG is at the right of the SCORING / SETTINGS row: down to that row, then right
    const found = await g.js(`(() => {
      for (let i = 0; i < 8 && !(NAV.el && NAV.el.parentNode.contains($('dbgOpen'))); i++) __press(13);
      for (let i = 0; i < 4 && !(NAV.el && NAV.el.id === 'dbgOpen'); i++) __press(15);
      return NAV.el && NAV.el.id === 'dbgOpen';
    })()`);
    g.ok(found, 'DEBUG reachable from the pause screen with the d-pad');
    await g.js('__press(0)');
    g.eq(await g.js('navScreen().id'), 'debugScreen');
    g.eq(await g.js('NAV.el.dataset.act'), 'ufo');
    await g.js('__press(12)');
    g.eq(await g.js('NAV.el.id'), 'dbgBack', 'up from the top wraps to BACK');
    await g.js('__press(1)');
    g.eq(await g.js('navScreen().id'), 'pauseScreen');
    await g.js('__press(9)');
    g.eq(await g.js('Game.state'), 'play');
  });
};
