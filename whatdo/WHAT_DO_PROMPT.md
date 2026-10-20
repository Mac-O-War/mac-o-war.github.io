# Master Prompt — "What Do?" (single-file 3D voxel EUC city runner)

> Paste everything below this line into an AI code generator to recreate the game.

---

Act as an expert full-stack web game developer, 3D graphics programmer and Web Audio engineer. Write a complete, production-ready, **single-file `index.html`** game (embedded `<style>` and `<script>`, no placeholders, no TODOs, no truncation). Return only the code.

## 1. Concept

- **Title:** What Do?
- **Genre:** third-person 3D arcade "urban survival runner" with Crazy-Taxi-style scoring.
- **Player:** a rider on an **electric unicycle (EUC)** racing through a New York / Washington DC style city.
- **The player can never stop.** There is a base cruising speed; holding the accelerator boosts to a top speed; releasing returns to base (it still moves).
- **Lose:** hitting any obstacle (car, bus, pedestrian, cyclist, street fixture, barricade, building) = instant comic gory crash.
- **Win:** survive the level timer. Every level lasts **60 seconds**; difficulty rises each level. When the timer hits 0 the level is cleared.

## 2. Tech & rendering

- **Three.js r128** from `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`. If it fails to load, show a friendly full-screen error.
- Fonts from Google Fonts: **Press Start 2P** (HUD/UI) and **Bangers** (comic text), with monospace/Impact fallbacks.
- **No external assets.** Every model is procedural **voxel art**: write a `vox(parts)` helper that merges many boxes `[centerX, bottomY, centerZ, w, h, d, hexColor]` into one vertex-coloured `BufferGeometry` (one draw call per model). Shade faces in the vertex colours (top 1.0, sides ~0.84–0.93, bottom 0.55) for a crisp voxel look. Use `MeshLambertMaterial({vertexColors:true})`.
- **Pixel-art look:** render at a low internal resolution (target ~470 px tall on desktop, ~400 on touch: `pixelRatio = clamp(target / innerHeight, 0.3, 1)`) and upscale the canvas with `image-rendering: pixelated`. No antialiasing.
- Sharp **directional shadows** (`BasicShadowMap`, 2048 desktop / 1024 mobile) from a sun that follows the player. Hemisphere fill light. Sky-blue background with matching distance fog (~80–290).
- Building facades use small procedural canvas textures (brick, brownstone, limestone, concrete, glass curtain wall, art-deco) with lit/unlit windows, `NearestFilter`, and UVs scaled to world size so windows stay a constant size.
- Responsive full-window canvas, resize handler, `requestAnimationFrame` loop with delta-time capped at 50 ms. Target a steady 60 FPS.
- Prevent all page scrolling, pinch-zoom, double-tap zoom, pull-to-refresh and long-press menus (`touch-action:none`, `overscroll-behavior:none`, `preventDefault` on touch/gesture events except inside menu screens).

## 3. World — a chain of turning streets

- The city is a chain of straight **"runs"** (avenues). Each run has its own origin and heading (multiples of 90°). Everything in a run (chunks, cars, people) lives in **run-local coordinates** (x = lateral, −z = forward), parented to a `THREE.Group` per run. Write `toWorld`/`toLocal` helpers.
- Each run is made of **100-unit chunks**: an 80-unit block plus a 20-unit cross-street intersection. The first run is 4–6 chunks long, later runs 3–5. Generate chunks about 400 units ahead (a few per frame at most) and delete them behind the player. Keep at most the previous, current and next run alive.
- **Avenue cross-section (x):** two oncoming lanes (x = −6.75, −2.25, traffic moving toward the player) | double yellow centre line | two same-direction lanes (x = 2.25, 6.75) with dashed white lines | parking lane on the left (−11…−9, parked cars) | green bike lane on the right (9…11) | raised sidewalks (11…17) with curbs | buildings from x = 17 outward. A second row of taller buildings behind, so cross streets look deep. The player is clamped to x ∈ [−16.4, 16.4], so the sidewalks are rideable.
- **Intersections:** zebra crosswalks, stop lines, the cross street extending both ways with its own yellow lines and sidewalks, and traffic-light poles with arms over the lanes. Each light has red and green lamps that are switched on and off.
- **Street furniture (all solid):** green lamp posts, trees in tree pits, red fire hydrants, green trash baskets, hot-dog carts with striped umbrellas, newsstands, subway entrances with green globe lamps, parked cars, double-parked delivery trucks blocking the bike lane, and mid-block construction zones closing a lane (striped barriers, cones, dirt).
- **Buildings:** varied widths, depths and heights, with cornices, dark storefront glass, coloured awnings, rooftop AC units and **wooden water towers**. Occasional tall stepped art-deco spire towers.
- **Landmark plazas** (every few chunks, one side becomes a park): an obelisk (Washington-Monument style, with a flag ring), a domed Capitol building with a colonnade, a triumphal arch, and a fountain park with trees.
- **Distant skyline silhouette** beyond the fog (dome, towers, spire) that follows the player's heading, plus voxel clouds.

### Road closures that force turns

- The **last chunk of every run** is a closure: a striped barricade with flashing amber lamps, "ROAD CLOSED" signs and a big orange "DETOUR ➜" sign across the avenue just past the intersection. Behind it is a closed stub of road with an excavator, dirt piles and cones, ending in a building. The cross street on the *wrong* side is barricaded too, so only one turn is possible (left or right, random per run).
- Warnings on the way in, **in the world only (no HUD banner):** a "ROAD CLOSED AHEAD" sign, DETOUR arrow signs on posts, and turn arrows painted in the lanes.
- The next run starts at that intersection, rotated ±90°. Make the geometry seam cleanly: no overlapping buildings or z-fighting sidewalks, corner sidewalk pieces, and the closure chunk only half-builds its cross street on the turn side.
- **Turning mechanic:** steering (or tapping) toward the detour within ~32 m of the intersection *arms* the turn. Lateral steering locks, and the turn fires automatically at the point that lands you in your own lane for your current speed. The rider then arcs 90° (heading eases to 0 at ~4.4 rad/s) and the camera swings with it. Ignore the detour and you crash into the barricade or a building.
- **Traffic follows the detour:** same-direction cars and bikes reaching the closure transfer into the next run and visibly turn. Oncoming traffic from the next run turns out into the current run's oncoming lanes.

## 4. Traffic & NPCs

- **Vehicles (voxel):** yellow taxis (roof sign, checker stripe; the most common), sedans in many colours, SUVs, city buses, box trucks, and police cars with light bars. They have headlights, tail lights, bumpers, wheels and plates.
- **Same-direction traffic** is slower than the player, so you overtake. It often spawns as **side-by-side pairs** so you can lane-split. It keeps a following distance and avoids closures.
- **Oncoming traffic** drives toward you in the left lanes.
- **Erratic drivers** (more often taxis, increasing per level): sudden lane changes, random hard braking, weaving, running red lights, and oncoming cars swerving across the yellow line into your lane (show a flashing "! ONCOMING SWERVE !" warning).
- **Cross traffic:** when you approach an intersection, its light turns red for the avenue and fast cross cars are dispatched, timed to arrive about when you do. You dodge by boosting through first or easing off to let them pass. Show flashing ◀ ! / ! ▶ edge warnings plus a horn. There is ambient cross traffic at far intersections too. Avenue traffic queues at red lights (except red-light runners).
- **Pedestrians (3-frame walk animation):** regular people with phones, bags and caps; business people in suits with ties and briefcases; tourists in Hawaiian or "I ♥" shirts with sun hats and cameras that **flash**. They walk the sidewalks, cross at crosswalks (including slow tourist groups), jaywalk (some running), and stand in groups photographing landmarks, sometimes in the bike lane.
- **Cyclists** in the bike lane and **wrong-way delivery riders** with insulated food boxes. They swerve into traffic now and then, and around double-parked trucks.
- **Pigeons** peck on roads and sidewalks and scatter in flapping flight (with a feather puff and a wing sound) as you approach. They are harmless.
- Use simple AABB collision in run-local space (player half-extents ~0.3 × 0.5).

## 5. Player, camera & feel

- Voxel rider in a hi-vis orange jacket, black helmet and backpack, on a voxel EUC (round tyre that spins, shell with LED strip, tail and head light, pedals). The rider leans into steering, pitches forward at speed and waves their arms for balance. A shadow blob sits underneath.
- **Speeds:** base 19 u/s (+1.6 per level, cap 31), boost = base + 15. Accelerate at about 16 u/s², decelerate at about 12. Lateral steering up to roughly 11 + 0.12 × speed. Show the speedometer in MPH (speed × 2.1) with a 12-segment green/yellow/red bar.
- **Third-person chase camera** behind and above, following the run heading and the turn arc (offset damped relative to the player, never laggy). Field of view widens with speed. Slight roll with lean, shake on near misses and at top speed, and a higher, wider camera in portrait.
- **Sense of speed:** camera-space speed lines that stretch with speed, scrolling asphalt texture, lane dashes, FOV widening, wind noise.

## 6. Controls

- **Desktop:** ← → / A D to steer, ↑ / W / Space to boost. **Mouse:** move to steer (the rider follows the cursor; pushing the cursor to a screen edge also counts as turning that way at closures) and hold the left button to boost. P/Esc pauses, M mutes, Enter/Space starts or restarts. Tapping a steer key also arms a detour turn.
- **Mobile (touch only — NO tilt/motion controls):** large semi-transparent **◀ ▶ buttons** bottom-left for the left thumb, a big round green **GAS** button bottom-right. Multi-touch via pointer events and pointer capture.
- Device detection: show the touch UI when the primary pointer is coarse. Touchscreen laptops keep the keyboard UI until they're actually touched, then switch.
- **Full screen on mobile:** request full screen and lock landscape when the player starts, restarts or goes to the next level. Phones only allow this on finger-lift, so also call it on `pointerup`/`touchend`. If the player gets kicked out of full screen, re-enter on their next tap, unless they exited on purpose with the ⛶ toggle button. Hide the button if full screen isn't supported.

## 7. Scoring (Crazy-Taxi style)

The biggest points come from **Squeeze Play** and **Oncoming Velocity**.

- **Oncoming Velocity:** near-missing an oncoming car scores `closingSpeed² × 1.1 × (1 + tightness)`, multiplied by a **"CHICKEN!"** factor (up to about 3×) based on how late you dodged. Track each oncoming car's minimum time-to-collision while it's in your line. Popup example: "ONCOMING VELOCITY 105 MPH".
- **Squeeze Play:** whenever something lethal is within 1.5 m on **both** sides at once (two cars, a parked car and a moving one, a lamp post and a pedestrian…), run a squeeze. When it ends, award `600 × (1 + 3 × tightness) × (1 + min(2, duration × 2.5)) × (topSpeed / baseSpeed)²`. Show a live flashing "SQUEEZE!" tag and a "SQUEEZE PLAY! x8.0" popup.
- **Continuous style tricks** (live tickers on the left; they pay out when you stop doing them): **WRONG WAY** (riding the oncoming lanes; scales with speed², 2–3× while an oncoming car is bearing down in your lane), **SIDEWALK SURFING** (scales with speed²), **FULL THROTTLE** (holding top speed).
- **RAN THE RED!** — crossing an intersection's stop line while the light is red, more with cross traffic present ("…INTO TRAFFIC!").
- **Smaller awards:** near misses with same-direction cars, cross traffic, bikes, pedestrians ("EXCUSE ME!", "HEY!" + a scream) and fixtures ("CLOSE SHAVE!"), a "TIGHT TURN!" past the barricade, and "DETOUR!" for each successful turn (150 × level). There is also a slow passive distance score.
- **Chain:** every scoring event within **3 s** of the previous one raises the chain. The multiplier is 1 + 0.5 per link, up to **×5**, applied to awards. Active tricks and squeezes keep the chain alive. When a chain of 3+ ends, pay a **CHAIN BONUS** of `250 × n × (n−1) / 2` with a jingle. **Crashing loses the chain and all unpaid tricks** ("CHAIN LOST!"). Clearing a level pays everything out.
- Level-clear bonus: 1000 × level. Big comic popups (Bangers font, colour-coded per type, stacked) and a score "bump" animation.

## 8. Crash & gore (comic)

- On impact the rider **shatters into separate voxel limbs** (head, torso, arms, legs, wheel, shell) with rigid-body-ish physics. They tumble, bounce and keep **spurting blood**.
- 500+ instanced red blood cubes burst out and splat into flat puddles on the ground, plus a big pool.
- Slow motion (×0.28, ramping back to normal), the camera orbits the crash, a red screen flash, and CSS **blood blots with drips** on the screen. A giant comic word in a starburst: SPLAT! / SPLORCH! / KA-SPLAT! / SQUELCH! / BLAMMO! / WHAT DO?!
- The thing you hit reacts: a car stops and honks, a pedestrian falls over, a bike tips.
- **Funny cause-of-death lines** per obstacle, for example: "Hailed a cab. With your face.", "Thrown under the bus. Literally.", "You are now the hot dog.", "Fire hydrant: still undefeated.", "Photobombed a tourist. Fatally.", "Your order has arrived: regret.", "Ignored the ROAD CLOSED sign.", "The detour was RIGHT THERE."

## 9. Audio (all procedural Web Audio — no files)

- Create the context on the first user gesture. Master, compressor, separate SFX and music buses. Mute toggle saved to `localStorage`.
- **Engine:** electric-motor whine (saw + triangle through a low-pass, pitch rising with speed) and a speed-dependent wind noise.
- **Horns:** two detuned square oscillators (about a 1 : 1.26 ratio), single or double honk, stereo-panned by position. Cars honk when you tailgate, near-miss, cut across, or when cross traffic is coming.
- **Screams:** saw voice with a pitch sweep and vibrato through formant band-passes, plus a swept breathy noise layer (near misses with people, and several layered on death).
- **Whoosh:** band-passed white noise sweep on near misses, panned left/right.
- **Crash:** wet splat (filtered noise + low thud + squelch), metal crunch, plus pigeon flaps, countdown blips, chain blips and a level-clear jingle.
- **Music:** a looping driving synthwave track in A minor (Am–F–C–G), with kick, snare, hats, pumping saw bass, square arpeggios, and a saw lead melody every other 4-bar section. Lookahead scheduler. Tempo ~146 BPM, rising each level.

## 10. UI / UX

- Crunchy pixel-font HUD: **SCORE** (top-left) and **BEST** (top-right, gold outline when beaten), with **LEVEL, a progress bar and an MM:SS countdown** top-centre (red and pulsing in the last 10 s). Below them: the chain counter (big "CHAIN x5", a draining timer bar and the current multiplier), live trick tickers, the speedometer at bottom-centre, and mute ♫ / pause II / full-screen ⛶ buttons.
- **Start screen:** a big tilted comic "WHAT DO?" title, the tagline "ONE ELECTRIC UNICYCLE. ONE GIANT CITY. ZERO BRAKES.", a controls card showing **only the controls for the player's device** (a keyboard/mouse card on desktop, a touch card with ◀ ▶ and an animated GAS button on mobile), a short goal text ("You can't stop. Dodge cars, people, bikes & street junk. Survive 1:00 to clear each level — it gets harder every time. Roads get closed — follow the detour and turn at the intersection!"), a big bobbing **PLAY** button ("TAP TO START" on touch), best score, and a "turn your phone sideways" tip in portrait. Do **not** describe the scoring system on the start screen. Behind the menu, the camera slowly orbits the rider in the living city.
- After PLAY: a **3-2-1-GO!** countdown with beeps while the camera swings in behind the rider. **No controls explainer and no turn banner during gameplay.**
- **Game Over screen:** "GAME OVER", the cause of death, then score, level, time survived, near misses, best chain, turns made, best score, a flashing "NEW HIGH SCORE!", and a large instant **RESTART** button (pointerdown, also Enter/Space).
- **Level Clear screen:** "LEVEL N CLEAR!", a joke line, score, level bonus, near misses, next level's duration, and a **NEXT LEVEL** button. Confetti bursts while the rider coasts to a stop and cheers.
- **On short landscape screens** (max-height ~600 px), lay out the Game Over and Level Clear screens in **two columns**: all score information on the left, the big RESTART / NEXT LEVEL button on the right, so both are always visible. Shrink the start screen to fit short screens (no clipped title).
- **Pause** screen; auto-pause when the tab is hidden or the window loses focus.
- High score saved in `localStorage` (wrap every access in try/catch).
- Respect safe-area insets (notches). Every button must work instantly with mouse and touch.

## 11. Difficulty per level

Each level adds a minute to the timer, raises base speed and traffic speed, adds cars to both directions, makes erratic and red-light-running drivers more frequent, sends bigger cross-traffic waves, and adds more jaywalkers, pedestrians, bikes and construction closures.

## 12. Day-to-night cycle

- Six lighting phases: **morning → afternoon → sunset → dusk → night → dawn**, then repeat. Level N fades smoothly from phase N−1 to phase N over its duration, so level 1 runs morning→afternoon, level 4 runs dusk→night, and so on. Show the phase in the HUD, e.g. "LEVEL 3 · SUNSET".
- Each phase sets the sky and fog colours and fog distance, the hemisphere and sun colours, intensities and direction (a moon at night), and the tint of the skyline silhouette and clouds.
- **At dusk and night:**
  - **Windows:** they light up via an emissive glow map. Each facade texture has a matching mask with more lit windows at night.
  - **Street lamps:** the lamp heads glow, with additive pools of light on the road.
  - **Cars:** they switch on headlights and tail lights, with additive headlight beams on the asphalt.
  - **Rider:** the EUC gets a headlight beam too.
  - **Sky:** stars appear.

## 13. Crash instant replay + share video

- **Recording:** during play, record the last ~3.2 s every frame: the rider's pose (position, heading, lean, wheel spin, arms) and the position, rotation, visibility, scale and walk frame of every entity within 75 m.
- **Auto-replay:** after the live crash (2.8 s), play an **INSTANT REPLAY** automatically, with letterbox bars, a blinking red "● INSTANT REPLAY" label and "TAP TO SKIP".
- **Replay playback:**
  - Interpolate between recorded frames.
  - The camera tracks the rider low and slightly ahead from the **road side**, so parked cars never block it, then settles on a fixed angle by the impact point.
  - Drop to slow motion (0.3×) for the last 0.75 s.
  - At the impact frame, re-run the crash: shatter, blood, sounds, screen flash, comic word.
  - Then slow-motion orbit around the wreck for ~3 s.
- The Game Over screen gets **▶ REPLAY** and **SHARE VIDEO** buttons.
- **Video capture:**
  - Each replay frame, draw the game canvas onto a 2D canvas (1280 px long side) with a "WHAT DO?" title, "● INSTANT REPLAY", the score and the cause of death.
  - Record that canvas with `canvas.captureStream(30)` and `MediaRecorder` while the replay plays. Use the first supported type of `video/webm;codecs=vp9`, `video/webm;codecs=vp8`, `video/webm`, then MP4 for Safari. Hold the last frame for ~0.8 s.
  - Only keep a replay that plays to the end. If it's skipped, offer MAKE VIDEO, which re-runs the replay.
- **Sharing:**
  - Share through the Web Share API (`navigator.share` with a file) where it's supported, otherwise download `what-do-crash.webm` (or `.mp4`).
  - Trigger sharing on `pointerup`, because phones only grant user activation when the finger lifts.
  - Label the button SAVE VIDEO when file sharing isn't available, and NO VIDEO when the browser can't record.

## 14. Haptics (touch devices)

`navigator.vibrate` patterns for:

- countdown ticks and GO
- near misses, tricks and turns
- Oncoming Velocity
- Squeeze Play
- running red lights
- chain bonuses
- arming a turn
- crashes (live and in the replay)
- level clear

Silently skip haptics where unsupported.

## 15. Tourists photograph your crash

On a crash, tourists within ~50 m switch to a "photo" mode. If fewer than three are nearby, spawn extras on the sidewalk. Each one hurries toward the wreck, stops 4.5–8.5 m away, faces it, and takes photos with **big camera flashes** and a **shutter-click sound**. They keep shooting behind the Game Over screen and again during the replay. Don't add any other crowd reactions.

## 16. Turning from any lane

- **Arming:** steering toward the detour within ~75 m of the closure arms the turn, from any lane, including the oncoming lanes and either sidewalk. While armed, the rider can still steer to dodge traffic, but can't drift further toward the turn side than the lane edge (or the sidewalk's inner edge). That keeps riders out of parked cars and curb fixtures.
- **When it fires:** the turn starts as soon as the rider reaches the mouth of the intersection, without waiting for the centre.
  - **Left turns** fire at about `speed/4.4 + 5.5` m before the centre and land in the near (oncoming) lanes of the new street. That's realistic, and it pays WRONG WAY points.
  - **Right turns** fire at `min(12, speed/4.4 + 6.75)` m and land in the rider's own lane.
- **No parking near closures:** there are no parked cars in the last stretch before a closure.

## 17. Secret level skip

Pressing **@** on the keyboard during a level, the countdown, the pause screen or the level-clear screen skips straight to the next level, keeping your score.

## 18. Resolution setting

A **RESOLUTION** button on the start screen and the pause screen cycles through four settings. The choice is saved in `localStorage`.

| Setting | Internal resolution |
|---|---|
| **PIXEL** (default on phones) | ~470 px tall (~400 on touch), upscaled with `image-rendering: pixelated` |
| **MEDIUM** (default on desktop) | ~720 px tall |
| **HIGH** | ~1080 px tall |
| **NATIVE** | the full device pixel ratio |

Never render above the display's real pixel density. Changing the setting resizes the renderer immediately.

## 19. Pedal to the Metal (no-braking style multiplier)

- **Building it:** every 100 m (one block) ridden while holding the accelerator, without letting off, adds **+0.25×** to *all* points, up to **×2.5** (6 blocks). It stacks multiplicatively with the chain multiplier.
- **On screen:** a popup and blip at each step ("PEDAL TO THE METAL x1.50"), plus a HUD bar above the speedometer that fills toward the next block and flashes gold when maxed.
- **Losing it:** releasing the gas for more than 0.2 s resets it ("LET OFF THE GAS"). The passive distance score is also multiplied.

## 20. Dynamic music

The procedural soundtrack reacts to play every step:

| What's happening | How the music changes |
|---|---|
| Chain ×3 or higher | The square arpeggio gets louder, with an extra octave-up sparkle line |
| Chain ×5 or higher | The saw lead melody plays all the time |
| Squeeze Play active | Double-time kick, snare fills and louder hats |
| Boosting | The bass filter opens up; with Pedal to the Metal ≥1, extra off-beat octave bass notes |
| Pedal to the Metal ≥2 | Crash cymbals every two bars |
| Last 10 seconds of a level | Tempo rises by 14 BPM |

## 21. Installable PWA (multi-file package)

Besides `index.html`, ship these files:

- `manifest.webmanifest`:
  - `display: fullscreen` with a standalone fallback
  - landscape orientation
  - theme and background colour `#0d0f1a`
  - 192/512 icons plus a maskable 512 icon
  - wide and narrow screenshots
  - `categories: games`
- `sw.js`, a versioned service worker:
  - precaches the app shell, the local Three.js and the fonts
  - fetches the page network-first, with the cached copy offline
  - fetches other assets cache-first
  - deletes old caches on activate
  - waits for a `skipWaiting` message instead of activating itself
- `icons/`: icon-192, icon-512, icon-maskable-512 (the art inside the 80% safe zone), and a 180 px apple-touch-icon, all rendered from the EUC favicon.
- `vendor/three.min.js` (r128) and `fonts/*.woff2` (Press Start 2P, Bangers). Load them through local `@font-face` rules, and fall back to the CDN script if the local Three.js is missing.
- In-game PWA features:
  - an **⬇ INSTALL APP** button driven by `beforeinstallprompt`
  - an iPhone-only "Tap Share → Add to Home Screen" hint
  - the Screen Wake Lock API during play
  - `navigator.storage.persist()`
  - a **NEW VERSION — TAP TO UPDATE** toast, shown only on menus, that sends `skipWaiting` and reloads
  - the full-screen button hidden when the app already runs in fullscreen display mode
- Register the service worker only on `https` or `localhost`, so the file still works when opened directly.

Write the complete `index.html` now.
