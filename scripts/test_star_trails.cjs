const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Load the same pure TypeScript modules as the browser without a separate test bundle.
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const {
  cameraAtOffset, poleAxis, speedMultiplier, virtualElapsedMs, formatOffset,
  snapshotAtOffset, sliceOpacity, trailTailMs, TrailBuffer,
  SIDEREAL_DAY_MS, SPEED_DOUBLING_MS, SPEED_MAX, SPEED_START,
  TRAIL_TAIL_NIGHT_MS, TRAIL_TAIL_DAY_MS,
} = require('../src/lib/sky/star-trails.ts');
const { createCamera, project } = require('../src/lib/sky/projection.ts');
const { computeSky, solarSkyState } = require('../src/lib/sky/astro.ts');
const { DEFAULT_OBSERVER, SKY_DAYTIME_VISIBILITY } = require('../src/lib/sky/constants.ts');
const { createLookUpCamera } = require('../src/lib/sky/look-up.ts');

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

test('rotating about the pole keeps the camera orthonormal and preserves its handedness', () => {
  const camera = createCamera(1280, 575);
  const handedness = dot(cross(camera.right, camera.up), camera.forward);
  for (const latitude of [-47.2, 0, 31.2989, 66.5]) {
    near(Math.hypot(...poleAxis(latitude)), 1);
    for (const offsetMs of [0, 7 * 3600e3, 0.376 * SIDEREAL_DAY_MS]) {
      const rotated = cameraAtOffset(camera, latitude, offsetMs);
      assert.equal(rotated.scale, camera.scale);
      assert.equal(rotated.width, camera.width);
      assert.equal(rotated.height, camera.height);
      assert.equal(rotated.centerYFraction, camera.centerYFraction);
      for (const v of [rotated.right, rotated.up, rotated.forward]) near(Math.hypot(...v), 1, 1e-9);
      near(dot(rotated.right, rotated.up), 0, 1e-9);
      near(dot(rotated.right, rotated.forward), 0, 1e-9);
      near(dot(rotated.up, rotated.forward), 0, 1e-9);
      near(dot(cross(rotated.right, rotated.up), rotated.forward), handedness, 1e-9);
    }
  }
});

test('one full sidereal day returns the camera to itself', () => {
  const camera = createCamera(390, 667);
  const rotated = cameraAtOffset(camera, DEFAULT_OBSERVER.latitude, SIDEREAL_DAY_MS);
  for (const key of ['right', 'up', 'forward']) {
    for (let i = 0; i < 3; i += 1) near(rotated[key][i], camera[key][i], 1e-9);
  }
});

test('rigid camera rotation reproduces a fresh astronomy-engine snapshot in all four facings', () => {
  const start = new Date('2026-01-15T13:00:00Z');
  const offsetMs = 3 * 3600e3;
  const city = { limitingMagnitude: 5, bortleApprox: 6, lightProxy: 0, source: 'override' };
  const first = computeSky(start, DEFAULT_OBSERVER, city);
  const second = computeSky(new Date(start.getTime() + offsetMs), DEFAULT_OBSERVER, city);
  for (const facing of ['south', 'west', 'north', 'east']) {
    const camera = createLookUpCamera(1280, 575, facing);
    const rotated = cameraAtOffset(camera, DEFAULT_OBSERVER.latitude, offsetMs);
    let checked = 0;
    for (const star of first.stars) {
      if (star.mag > 1.6) continue;
      const later = second.stars.find(entry => entry.id === star.id);
      if (!later || star.altitude < 25 || later.altitude < 25) continue;
      const a = project(star.altitude, star.azimuth, rotated);
      const b = project(later.altitude, later.azimuth, camera);
      if (!a || !b) continue;
      // Off-frame coordinates ride the gnomonic edge where tiny angular deltas
      // explode into thousands of pixels; the renderer culls them anyway.
      if (Math.abs(b.x) > 1280 || Math.abs(b.y) > 575) continue;
      near(a.x, b.x, 2.5);
      near(a.y, b.y, 2.5);
      checked += 1;
    }
    assert.ok(checked >= 2, `facing ${facing}: compared ${checked} bright, high stars`);
  }
});

test('fast-forward rises eastern stars and sets western ones across the full sphere', () => {
  const start = new Date('2026-01-15T13:00:00Z');
  const offsetMs = 6 * 3600e3;
  const city = { limitingMagnitude: 5, bortleApprox: 6, lightProxy: 0, source: 'override' };
  const first = computeSky(start, DEFAULT_OBSERVER, city);
  const later = computeSky(new Date(start.getTime() + offsetMs), DEFAULT_OBSERVER, city);
  const frame = snapshotAtOffset(first, createLookUpCamera(1280, 575, 'east'), offsetMs);
  assert.equal(frame.snapshot.date.getTime(), start.getTime() + offsetMs);
  const frameIds = new Set(frame.snapshot.stars.map(star => star.id));
  let disagreements = 0;
  for (const star of later.stars) {
    // Only clear-cut cases: stars well above the horizon must be present in
    // the rigid frame; stars well below must be absent. Grazing stars within
    // the refraction band around the -2° cut are allowed to disagree.
    if (star.altitude > 1 && !frameIds.has(star.id)) disagreements += 1;
    if (star.altitude < -4 && frameIds.has(star.id)) disagreements += 1;
  }
  assert.ok(disagreements === 0, `${disagreements} clear-cut horizon disagreements`);
  const startIds = new Set(first.stars.map(star => star.id));
  const rose = first.celestialStars.find(star =>
    star.altitude < -5 && !startIds.has(star.id) && frameIds.has(star.id));
  const set = first.stars.find(star => star.altitude > 5 && !frameIds.has(star.id));
  assert.ok(rose, 'a star rose above the eastern horizon');
  assert.ok(set, 'a star set below the western horizon');
});

test('sunrise, daylight and the next night stay synced to the real ephemeris', () => {
  // 21:00 Shanghai on Jan 15: full night. +11h = 08:00 next day: sun up.
  // +23h = 20:00 the following evening: astronomical night again.
  const base = computeSky(new Date('2026-01-15T13:00:00Z'), DEFAULT_OBSERVER,
    { limitingMagnitude: 5, bortleApprox: 6, lightProxy: 0, source: 'override' });
  const camera = createLookUpCamera(1280, 575, 'south');
  const at = hours => snapshotAtOffset(base, camera, hours * 3600e3).snapshot;
  const night = at(0);
  const day = at(11);
  const nextNight = at(23);
  assert.ok(night.sunAltitude < -16 && night.visibility === 1, `night sun ${night.sunAltitude}`);
  assert.ok(day.sunAltitude > 0 && day.visibility === SKY_DAYTIME_VISIBILITY, `day sun ${day.sunAltitude}`);
  assert.ok(nextNight.sunAltitude < -16 && nextNight.visibility === 1, `next night sun ${nextNight.sunAltitude}`);
});

test('night keeps trails at full length; only daylight washes them out', () => {
  assert.equal(sliceOpacity(0, 0), 1);
  assert.equal(sliceOpacity(0, 1), 1);
  for (let age = 0; age <= 8 * 3600e3; age += 30 * 60 * 1000) {
    assert.equal(sliceOpacity(age, 1), 1, `night keeps ${age} ms of trail`);
  }
  assert.equal(trailTailMs(0), TRAIL_TAIL_DAY_MS);
  assert.equal(trailTailMs(1), TRAIL_TAIL_NIGHT_MS);
  const washedAge = TRAIL_TAIL_DAY_MS + 10 * 60 * 1000;
  assert.equal(sliceOpacity(washedAge, 0), 0, 'daylight tail washes the slice out');
  assert.ok(sliceOpacity(washedAge, 0.5) > 0, 'partial twilight keeps a longer tail');
  for (let age = 0; age < trailTailMs(0.5); age += 5 * 60 * 1000) {
    assert.ok(sliceOpacity(age, 0.5) >= sliceOpacity(age + 5 * 60 * 1000, 0.5), 'decay is monotonic in age');
  }
});

test('trail opacity changes continuously through twilight and the former night threshold', () => {
  for (const age of [0, 30 * 60e3, 2 * 3600e3, 8 * 3600e3]) {
    for (const twilight of [0.6, 0.9, 0.95]) {
      const before = sliceOpacity(age, twilight - 1e-4);
      const at = sliceOpacity(age, twilight);
      const after = sliceOpacity(age, twilight + 1e-4);
      assert.ok(before <= at && at <= after, `age ${age}, twilight ${twilight}: darkness preserves brightness`);
      assert.ok(after - before < 0.002, `age ${age}, twilight ${twilight}: no brightness jump`);
    }
  }
});

const renderedAt = (x, alpha = 1) => [{
  star: { id: 1, mag: 0.2, colorIndex: 0.5 }, point: { x, y: 5 }, alpha,
}];

test('the buffer keeps eight hours of deep-night trails at full brightness', () => {
  const buffer = new TrailBuffer();
  for (let minutes = 0; minutes <= 8 * 60; minutes += 5) {
    buffer.push(minutes * 60e3, renderedAt(minutes / 5), 1);
  }
  const slices = buffer.slices();
  assert.ok(slices.length > 30, 'the night retains many completed slices');
  assert.ok(slices[0].tEnd <= 15 * 60e3, 'the beginning of the exposure remains');
  assert.ok(slices.every(slice => slice.opacity === 1), 'deep-night slices stay fully bright');
});

test('daylight keeps fresh short trails throughout a long hold', () => {
  const buffer = new TrailBuffer();
  for (let minutes = 0; minutes <= 120; minutes += 1) {
    const now = minutes * 60e3;
    buffer.push(now, renderedAt(minutes, SKY_DAYTIME_VISIBILITY), 0);
    if (minutes < 10) continue;
    const slices = buffer.slices();
    assert.ok(slices.length > 0, `minute ${minutes}: daylight still has trails`);
    assert.ok(slices.some(slice => slice.opacity > 0), `minute ${minutes}: fresh trails are visible`);
    assert.ok(slices.every(slice => now - slice.tEnd < TRAIL_TAIL_DAY_MS), `minute ${minutes}: old daylight trails have faded`);
  }
});

test('dusk preserves the faded brightness of old slices and starts new slices at full brightness', () => {
  const buffer = new TrailBuffer(0);
  buffer.push(0, renderedAt(0), 1);
  buffer.push(60e3, renderedAt(1), 1);
  const old = buffer.slices().at(-1);
  buffer.push(10 * 60e3, renderedAt(2), 0);
  assert.ok(old.opacity > 0 && old.opacity < 1, 'daylight partially fades the old slice');
  let previous = old.opacity;
  for (const [minutes, twilight] of [[11, 0.3], [12, 0.6], [13, 0.8], [14, 1]]) {
    buffer.push(minutes * 60e3, renderedAt(minutes), twilight);
    assert.ok(old.opacity <= previous, `minute ${minutes}: the old slice stays faded`);
    previous = old.opacity;
    const newest = buffer.slices().at(-1);
    assert.equal(newest.tEnd, minutes * 60e3);
    assert.equal(newest.opacity, 1, `minute ${minutes}: the new slice starts bright`);
  }
});

test('a fully faded slice stays absent when the next night begins', () => {
  const buffer = new TrailBuffer(60e3);
  buffer.push(0, renderedAt(0), 1);
  buffer.push(60e3, renderedAt(1), 1);
  const old = buffer.slices()[0];
  buffer.push(20 * 60e3, renderedAt(2), 0);
  assert.equal(old.opacity, 0);
  assert.ok(!buffer.slices().includes(old), 'the faded slice is released');
  buffer.push(21 * 60e3, renderedAt(3), 1);
  assert.ok(!buffer.slices().includes(old), 'the next night keeps the old slice absent');
  assert.ok(buffer.slices().some(slice => slice.opacity === 1), 'the new night has bright trails');
});

test('frame-by-frame and static drawing preserve the same real-daylight trail history', () => {
  const animated = new TrailBuffer();
  const still = new TrailBuffer();
  const ctx = { canvas: { width: 100, height: 100 }, clearRect() {}, stroke() {} };
  const start = Date.parse('2026-01-15T13:00:00Z');
  let first;
  let sawDaylight = false;
  for (let minutes = 0; minutes <= 24 * 60; minutes += 3) {
    const now = start + minutes * 60e3;
    const sky = solarSkyState(new Date(now), DEFAULT_OBSERVER);
    const rendered = renderedAt(minutes / 3, sky.visibility);
    animated.push(now, rendered, sky.twilight);
    still.push(now, rendered, sky.twilight);
    animated.draw(ctx, { isDark: true });
    if (!first && still.slices().length) first = still.slices()[0];
    if (sky.sunAltitude > 0) {
      sawDaylight = true;
      assert.equal(sky.visibility, SKY_DAYTIME_VISIBILITY, 'daytime stars retain their visibility floor');
      assert.ok(still.slices().length > 0, 'the static path records fresh daytime trails');
    }
  }
  still.draw(ctx, { isDark: true });
  assert.ok(sawDaylight && first, 'the exposure spans night, daylight and the next night');
  assert.equal(first.opacity, 0, 'daylight fully fades the first night');
  assert.ok(!still.slices().includes(first), 'the first night stays absent after sunset');
  assert.ok(still.slices().some(slice => slice.opacity === 1), 'the following night accumulates bright trails');
  assert.deepEqual(still.slices(), animated.slices(), 'drawing frequency leaves the recorded history unchanged');
});

test('trail buffer keeps a bounded ring of slices and resets cleanly', () => {
  const buffer = new TrailBuffer(1000, 4);
  const star = { id: 1, mag: 0.2, colorIndex: 0.5 };
  let x = 0;
  for (let i = 0; i < 20; i += 1) {
    buffer.push(i * 1000, [{ star, point: { x, y: 5 }, alpha: 0.5 }], 1);
    x += 3;
  }
  const slices = buffer.slices();
  assert.ok(slices.length >= 3 && slices.length <= 4, `ring bounded (${slices.length})`);
  assert.ok(slices.every(slice => slice.tEnd > 0));
  buffer.clear();
  assert.equal(buffer.slices().length, 0);
});

test('speed ramp starts at 60x, caps at 3600x and integrates continuously', () => {
  assert.equal(speedMultiplier(0), SPEED_START);
  assert.equal(speedMultiplier(-5), SPEED_START);
  near(speedMultiplier(SPEED_DOUBLING_MS), 2 * SPEED_START, 1e-9);
  assert.equal(speedMultiplier(1e6), SPEED_MAX);
  for (let t = 250; t <= 8000; t += 250) {
    assert.ok(speedMultiplier(t) <= SPEED_MAX + 1e-9);
    assert.ok(speedMultiplier(t) >= speedMultiplier(t - 250) - 1e-9);
  }
  assert.equal(virtualElapsedMs(0), 0);
  assert.equal(virtualElapsedMs(-3), 0);
  const rampEndMs = SPEED_DOUBLING_MS * Math.log2(SPEED_MAX / SPEED_START);
  near(virtualElapsedMs(rampEndMs), virtualElapsedMs(rampEndMs) + 0, 1e-6);
  // Slope just past the cap equals SPEED_MAX (continuity of the integral).
  const dt = 1;
  near((virtualElapsedMs(rampEndMs + dt) - virtualElapsedMs(rampEndMs)) / dt, SPEED_MAX, 1e-6);
  // Closed form agrees with midpoint numeric integration of the ramp.
  let numeric = 0;
  let previous = 0;
  for (let t = 250; t <= 6000; t += 250) {
    numeric += speedMultiplier((t + previous) / 2) * 250;
    previous = t;
  }
  const closed = virtualElapsedMs(6000);
  assert.ok(Math.abs(closed - numeric) / closed < 0.01, `midpoint ${numeric} ≈ closed ${closed}`);
});

test('offset labels stay compact across minutes, hours and days', () => {
  assert.equal(formatOffset(38 * 60e3), '+38m');
  assert.equal(formatOffset((2 * 60 + 14) * 60e3), '+2h 14m');
  assert.equal(formatOffset(5 * 3600e3), '+5h');
  assert.equal(formatOffset(26 * 3600e3), '+1d 2h');
  assert.equal(formatOffset((26 * 60 + 40) * 60e3), '+1d 2h 40m');
  assert.equal(formatOffset(-38 * 60e3), '\u221238m');
  assert.equal(formatOffset(0), '+0m');
});
