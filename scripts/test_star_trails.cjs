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
const { createLookUpCamera, viewForFacing } = require('../src/lib/sky/look-up.ts');

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
    const camera = createLookUpCamera(1280, 575, viewForFacing(facing, 47.5));
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
  const camera = createLookUpCamera(1280, 575, { azimuth: 180, altitude: 47.5 });
  const at = hours => snapshotAtOffset(base, camera, hours * 3600e3).snapshot;
  const night = at(0);
  const day = at(11);
  const nextNight = at(23);
  assert.ok(night.sunAltitude < -16 && night.visibility === 1, `night sun ${night.sunAltitude}`);
  assert.ok(day.sunAltitude > 0 && day.visibility === SKY_DAYTIME_VISIBILITY, `day sun ${day.sunAltitude}`);
  assert.ok(nextNight.sunAltitude < -16 && nextNight.visibility === 1, `next night sun ${nextNight.sunAltitude}`);
});

test('one-second frames advance the rendered clock and stars between full astronomy snapshots', () => {
  const base = computeSky(new Date('2026-01-15T13:00:00Z'), DEFAULT_OBSERVER,
    { limitingMagnitude: 5, bortleApprox: 6, lightProxy: 0, source: 'override' });
  const camera = createLookUpCamera(1280, 575, { azimuth: 180, altitude: 47.5 });
  const star = base.stars.find(star => {
    const point = project(star.altitude, star.azimuth, camera);
    return star.mag < 1.6 && point && point.x > 100 && point.x < 1180 && point.y > 100 && point.y < 475;
  });
  assert.ok(star, 'a bright star lies inside the viewing window');
  const start = project(star.altitude, star.azimuth, camera);
  let previous = start;
  for (let second = 1; second <= 7 * 60; second += 1) {
    const frame = snapshotAtOffset(base, camera, second * 1000);
    assert.equal(frame.snapshot.date.getTime(), base.date.getTime() + second * 1000);
    assert.equal(frame.snapshot.celestialStars, base.celestialStars, 'the cached star catalog is reused');
    const point = project(star.altitude, star.azimuth, frame.camera);
    assert.ok(Math.hypot(point.x - previous.x, point.y - previous.y) < 0.2, 'one-second motion stays below a pixel');
    previous = point;
  }
  assert.ok(Math.hypot(previous.x - start.x, previous.y - start.y) > 5, 'seven minutes of motion accumulates continuously');
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

test('speed ramp starts at 60x, caps at 7200x and integrates continuously', () => {
  assert.equal(SPEED_MAX, 7200);
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

const testStars = [
  { id: 1, mag: 0.2, colorIndex: 0.5, altitude: 50, azimuth: 0 },
  { id: 2, mag: 0.2, colorIndex: 0.5, altitude: 50, azimuth: 180 },
  { id: 3, mag: 2.5, colorIndex: 1.2, altitude: -40, azimuth: 90 },
];
const exposureSnapshot = (epoch = 0, stars = testStars) => ({
  date: new Date(epoch), observer: DEFAULT_OBSERVER,
  pollution: { limitingMagnitude: 5, bortleApprox: 6, lightProxy: 0, source: 'override' },
  sunAltitude: -30, twilight: 1, visibility: 1,
  stars: stars.filter(star => star.altitude >= -2), celestialStars: stars, constellationStars: [],
});
test('zero-offset frames reuse the exact snapshot and physical camera', () => {
  const snapshot = exposureSnapshot(), camera = createLookUpCamera(800, 600, 'north');
  const frame = snapshotAtOffset(snapshot, camera, 0);
  assert.equal(frame.snapshot, snapshot);
  assert.equal(frame.camera, camera);
  assert.equal(frame.snapshot.stars, snapshot.stars);
});
const beginBuffer = (span = 10 * 60e3, max = 90, start = 0, epoch = 0) => {
  const buffer = new TrailBuffer(span, max);
  buffer.begin(exposureSnapshot(epoch), start);
  return buffer;
};

test('the full-sky buffer keeps eight hours of night exposure at full brightness', () => {
  const buffer = beginBuffer();
  for (let minutes = 0; minutes <= 8 * 60; minutes += 5) buffer.push(minutes * 60e3, 1);
  const slices = buffer.slices();
  assert.ok(slices.length > 30);
  assert.equal(slices[0].tStart, 0);
  assert.ok(slices.every(slice => slice.opacity === 1));
  assert.equal(buffer.hasTrails(), true);
});

test('daylight retains fresh exposure intervals throughout a long hold', () => {
  const buffer = beginBuffer();
  for (let minutes = 0; minutes <= 120; minutes++) {
    const now = minutes * 60e3;
    buffer.push(now, 0);
    if (minutes < 10) continue;
    assert.ok(buffer.hasTrails());
    assert.ok(buffer.slices().some(slice => slice.opacity > 0));
    assert.ok(buffer.slices().every(slice => now - slice.tEnd < TRAIL_TAIL_DAY_MS));
  }
});

test('dusk keeps old daylight fading irreversible and exposes new intervals at full brightness', () => {
  const buffer = beginBuffer(60e3);
  buffer.push(60e3, 1);
  const old = buffer.slices()[0];
  buffer.push(10 * 60e3, 0);
  assert.ok(old.opacity > 0 && old.opacity < 1);
  let previous = old.opacity;
  for (const [minutes, twilight] of [[11, .3], [12, .6], [13, .8], [14, 1]]) {
    buffer.push(minutes * 60e3, twilight);
    assert.ok(old.opacity <= previous);
    previous = old.opacity;
    assert.equal(buffer.slices().at(-1).opacity, 1);
  }
});

test('an interval washed out in daylight remains absent the next night', () => {
  const buffer = beginBuffer(60e3);
  buffer.push(60e3, 1);
  const old = buffer.slices()[0];
  buffer.push(20 * 60e3, 0);
  assert.equal(old.opacity, 0);
  assert.ok(!buffer.slices().includes(old));
  buffer.push(21 * 60e3, 1);
  assert.ok(!buffer.slices().includes(old));
  assert.equal(buffer.slices().at(-1).opacity, 1);
});

test('exposure starts at the real press time even when the astronomical snapshot is stale', () => {
  const start = 7 * 60e3, buffer = beginBuffer(60e3, 90, start, 0);
  assert.equal(buffer.hasTrails(), false);
  buffer.push(start, 1);
  assert.equal(buffer.hasTrails(), false);
  buffer.push(start + 90e3, 1);
  assert.deepEqual(buffer.slices(), [{ tStart: start, tEnd: start + 60e3, opacity: 1 }]);
  const camera = createLookUpCamera(800, 600, 'north');
  const rotated = cameraAtOffset(camera, DEFAULT_OBSERVER.latitude, start + 90e3);
  const { projectSkyDirection } = require('../src/lib/sky/projection.ts');
  const actual = projectSkyDirection(buffer.headDirections().get(1), camera);
  const expected = project(testStars[0].altitude, testStars[0].azimuth, rotated);
  near(actual.x, expected.x, 1e-7);
  near(actual.y, expected.y, 1e-7);
});

test('one advance creates contiguous fixed exposure slices at every crossed boundary', () => {
  const buffer = beginBuffer(1000, 90, 250);
  buffer.push(3750, 1);
  assert.deepEqual(buffer.slices(), [
    { tStart: 250, tEnd: 1250, opacity: 1 },
    { tStart: 1250, tEnd: 2250, opacity: 1 },
    { tStart: 2250, tEnd: 3250, opacity: 1 },
  ]);
  assert.equal(buffer.hasTrails(), true);
});

test('the fifteen-hour window has the same actual intervals at different frame rates', () => {
  const duration = (30 * 60 + 3) * 60e3, windows = [];
  for (const stepMinutes of [1, 2, 4]) {
    const buffer = beginBuffer();
    for (let time = 0; time < duration; time += stepMinutes * 60e3) buffer.push(time, 1);
    buffer.push(duration, 1);
    const slices = buffer.slices();
    assert.ok(slices[0].tStart >= duration - 15 * 3600e3);
    assert.ok(slices[0].tStart <= duration - 15 * 3600e3 + 10 * 60e3);
    assert.ok(slices.every(slice => slice.opacity === 1));
    windows.push(slices);
  }
  assert.deepEqual(windows[1], windows[0]);
  assert.deepEqual(windows[2], windows[0]);
});

function withRecordedPaths(check) {
  const previous = global.Path2D;
  global.Path2D = class {
    commands = [];
    moveTo(x, y) { this.commands.push(['M', x, y]); }
    lineTo(x, y) { this.commands.push(['L', x, y]); }
  };
  class Gradient {
    constructor(...coordinates) { this.coordinates = coordinates; this.stops = []; }
    addColorStop(offset, color) { this.stops.push({ offset, color }); }
  }
  const context = () => ({
    canvas: { width: 800, height: 600 }, strokes: [], gradients: [],
    clearRect() { this.strokes = []; },
    createLinearGradient(...coordinates) { const gradient = new Gradient(...coordinates); this.gradients.push(gradient); return gradient; },
    stroke(path) { this.strokes.push({ path, alpha: this.strokeStyle, width: this.lineWidth }); },
  });
  try { check(context); }
  finally {
    if (previous === undefined) delete global.Path2D;
    else global.Path2D = previous;
  }
}
const captureView = { azimuth: 0, centerAltitude: 35, horizontalFov: 100 };
const pathGeometry = ctx => ctx.strokes.map(stroke => stroke.path.commands);
const pathSegments = ctx => ctx.strokes.flatMap(stroke => {
  let previous;
  const segments = [];
  for (const command of stroke.path.commands) {
    const point = command.slice(1);
    if (command[0] === 'L') segments.push(JSON.stringify([...previous, ...point]));
    previous = point;
  }
  return segments;
}).sort();

test('unequal neighboring trail slices share a continuous brightness boundary and retain their original geometry and decay', () => withRecordedPaths(context => {
  const { createTrailOrbit, createTrailProjector } = require('../src/lib/sky/trail-geometry.ts');
  const { horizonToVector } = require('../src/lib/sky/projection.ts');
  const snapshot = exposureSnapshot(0, [testStars[0]]), buffer = new TrailBuffer();
  const camera = createCamera(800, 600, captureView), elapsed = 22 * 60e3;
  buffer.begin(snapshot, 0);
  buffer.push(elapsed, 0);
  const intervals = [...buffer.slices(), buffer.current].map(slice => ({ ...slice }));
  const expected = [], projector = createTrailProjector(camera);
  const orbit = createTrailOrbit(horizonToVector(testStars[0].altitude, testStars[0].azimuth), poleAxis(DEFAULT_OBSERVER.latitude));
  for (const slice of intervals) projector.append(orbit, slice.tStart * 2 * Math.PI / SIDEREAL_DAY_MS, slice.tEnd * 2 * Math.PI / SIDEREAL_DAY_MS,
    (from, to) => expected.push(JSON.stringify([from.x, from.y, to.x, to.y])));
  for (const isDark of [true, false]) {
    const ctx = context();
    buffer.draw(ctx, { isDark, camera });
    assert.deepEqual(pathSegments(ctx), expected.sort(), 'smoothing keeps the exact projected arcs and exposure endpoints');
    assert.deepEqual([...buffer.slices(), buffer.current], intervals, 'rendering leaves time ranges and irreversible opacity unchanged');
    assert.equal(ctx.strokes.length, 3);
    const center = stroke => typeof stroke.alpha === 'string' ? stroke.alpha : stroke.alpha.stops.find(stop => stop.offset === .5).color;
    const edge = (stroke, end) => typeof stroke.alpha === 'string' ? stroke.alpha : (end ? stroke.alpha.stops.at(-1) : stroke.alpha.stops[0]).color;
    const alphaOf = color => Number(color.match(/, ([\d.]+)\)$/)[1]);
    ctx.strokes.forEach((stroke, i) => assert.equal(alphaOf(center(stroke)), Number(Math.min(.75, (isDark ? .85 : 1.8) * intervals[i].opacity).toFixed(3))));
    for (let i = 0; i < ctx.strokes.length - 1; i++) assert.equal(edge(ctx.strokes[i], true), edge(ctx.strokes[i + 1], false), 'both sides of a join use the same color and alpha');
    assert.ok(ctx.gradients.length >= 2);
  }
  const ctx = context();
  buffer.draw(ctx, { isDark: true, camera });
  const [oldPath, middlePath, headPath] = ctx.strokes.map(stroke => stroke.path);
  buffer.push(elapsed + 60e3, 0);
  buffer.draw(ctx, { isDark: true, camera });
  assert.equal(ctx.strokes[0].path, oldPath);
  assert.equal(ctx.strokes[1].path, middlePath);
  assert.notEqual(ctx.strokes[2].path, headPath, 'the advancing head gets its new full interval');
}));

test('a real star entering the viewport retains its full-arc gradient anchors through clipping and reprojection', () => withRecordedPaths(context => {
  const { projectSkyDirection, horizonToVector } = require('../src/lib/sky/projection.ts');
  const { createTrailOrbit, trailOrbitDirection } = require('../src/lib/sky/trail-geometry.ts');
  const start = Date.parse('2026-11-16T02:27:00Z');
  const sky = computeSky(new Date(start), DEFAULT_OBSERVER, { limitingMagnitude: 5, bortleApprox: 6, lightProxy: 0, source: 'override' });
  const altair = sky.celestialStars.find(star => star.id === 97338);
  assert.ok(altair);
  const buffer = new TrailBuffer(), ctx = context(), camera = createLookUpCamera(800, 600, { azimuth: 135, altitude: 30 });
  buffer.begin({ ...sky, celestialStars: [altair] }, start);
  buffer.push(start + 22 * 60e3, 0);
  buffer.draw(ctx, { isDark: true, camera });
  const first = ctx.strokes[0];
  assert.ok(first.alpha.coordinates[0] < 0, 'the gradient starts at the physical arc endpoint outside the viewport');
  assert.equal(first.path.commands[0][1], 0, 'the visible stroke is clipped at the viewport edge');
  const orbit = createTrailOrbit(horizonToVector(altair.altitude, altair.azimuth), poleAxis(DEFAULT_OBSERVER.latitude));
  const from = projectSkyDirection(trailOrbitDirection(orbit, 0), camera);
  const to = projectSkyDirection(trailOrbitDirection(orbit, 600e3 * 2 * Math.PI / SIDEREAL_DAY_MS), camera);
  assert.deepEqual(first.alpha.coordinates, [from.x, from.y, to.x, to.y]);
  const geometry = pathGeometry(ctx), colors = ctx.strokes.map(stroke => stroke.alpha);
  buffer.draw(ctx, { isDark: true, camera: createLookUpCamera(800, 600, { azimuth: 145, altitude: 30 }) });
  buffer.draw(ctx, { isDark: true, camera });
  assert.deepEqual(pathGeometry(ctx), geometry);
  assert.deepEqual(ctx.strokes.map(stroke => stroke.alpha), colors);
}));

test('coincident real binary components keep one graded stroke per style and retain both star identities', () => withRecordedPaths(context => {
  const sky = computeSky(new Date('2026-04-15T13:00:00Z'), DEFAULT_OBSERVER,
    { limitingMagnitude: 5, bortleApprox: 6, lightProxy: 0, source: 'override' });
  const pair = sky.celestialStars.filter(star => star.id === 118742 || star.id === 118743);
  assert.equal(pair.length, 2);
  assert.equal(pair[0].altitude, pair[1].altitude);
  assert.equal(pair[0].azimuth, pair[1].azimuth);
  const camera = createLookUpCamera(800, 600, { azimuth: pair[0].azimuth, altitude: Math.min(75, pair[0].altitude) });
  const draw = stars => {
    const buffer = new TrailBuffer(), ctx = context();
    buffer.begin({ ...sky, celestialStars: stars }, sky.date.getTime());
    buffer.push(sky.date.getTime() + 22 * 60e3, 0);
    buffer.draw(ctx, { isDark: true, camera });
    return { buffer, ctx };
  };
  const single = draw([pair[0]]), binary = draw(pair);
  assert.equal(binary.buffer.headDirections().size, 2);
  assert.ok(binary.ctx.gradients.length > 0);
  assert.equal(binary.ctx.strokes.length, single.ctx.strokes.length, 'coincident same-style curves keep their original single coverage');
  assert.deepEqual(pathGeometry(binary.ctx), pathGeometry(single.ctx));
  assert.deepEqual(binary.ctx.strokes.map(stroke => stroke.alpha), single.ctx.strokes.map(stroke => stroke.alpha));
}));

test('the same exposure exists in opposite directions even when the initial viewport excludes those stars', () => withRecordedPaths(context => {
  const snapshot = exposureSnapshot();
  snapshot.stars = [testStars[0]];
  const buffer = new TrailBuffer();
  buffer.begin(snapshot, 0);
  buffer.push(20 * 60e3, 1);
  const ctx = context(), north = createCamera(800, 600, captureView), south = createCamera(800, 600, { ...captureView, azimuth: 180 });
  buffer.draw(ctx, { isDark: true, camera: north });
  assert.ok(ctx.strokes.some(stroke => stroke.path.commands.length > 0));
  const northGeometry = JSON.parse(JSON.stringify(pathGeometry(ctx)));
  buffer.draw(ctx, { isDark: true, camera: south });
  assert.ok(ctx.strokes.some(stroke => stroke.path.commands.length > 0), 'southern stars accumulated the same exposure while north was displayed');
  assert.ok(buffer.headDirections().has(2));
  buffer.draw(ctx, { isDark: true, camera: north });
  assert.deepEqual(pathGeometry(ctx), northGeometry, 'A to B to A regenerates the same physical history');
}));

test('closed paths are reused while an open interval only appends its newly exposed time', () => withRecordedPaths(context => {
  const buffer = beginBuffer(1000), ctx = context(), camera = createCamera(800, 600, captureView);
  buffer.push(500, 1);
  buffer.draw(ctx, { isDark: true, camera });
  const open = ctx.strokes[0].path, prefix = open.commands.map(command => [...command]);
  buffer.push(750, 1);
  buffer.draw(ctx, { isDark: true, camera });
  assert.equal(ctx.strokes[0].path, open);
  assert.deepEqual(open.commands.slice(0, prefix.length), prefix);
  assert.ok(open.commands.length > prefix.length);
  buffer.push(1000, 1);
  buffer.draw(ctx, { isDark: true, camera });
  const closed = ctx.strokes[0].path;
  assert.notEqual(closed, open, 'closing creates one compact interval path');
  const geometry = closed.commands.map(command => [...command]);
  buffer.push(1250, 1);
  buffer.draw(ctx, { isDark: true, camera });
  assert.equal(ctx.strokes[0].path, closed);
  assert.deepEqual(closed.commands, geometry);
  buffer.draw(ctx, { isDark: true, camera: createCamera(800, 600, captureView) });
  assert.equal(ctx.strokes[0].path, closed, 'an equivalent physical camera reuses its paths');
}));

test('changing or resizing the camera preserves exposure intervals and daylight brightness', () => withRecordedPaths(context => {
  const buffer = beginBuffer(60e3), ctx = context(), camera = createCamera(800, 600, captureView);
  buffer.push(60e3, 1);
  buffer.push(120e3, 0);
  const slices = buffer.slices().map(slice => ({ ...slice }));
  buffer.draw(ctx, { isDark: true, camera });
  const alpha = ctx.strokes.map(stroke => stroke.alpha);
  const geometry = JSON.parse(JSON.stringify(pathGeometry(ctx)));
  buffer.draw(ctx, { isDark: true, camera: createCamera(390, 703, { ...captureView, azimuth: 180 }) });
  assert.equal(buffer.hasTrails(), true);
  assert.deepEqual(buffer.slices(), slices);
  buffer.draw(ctx, { isDark: true, camera });
  assert.deepEqual(ctx.strokes.map(stroke => stroke.alpha), alpha);
  assert.deepEqual(pathGeometry(ctx), geometry);
}));

test('drawing frequency leaves the real daylight exposure history unchanged', () => withRecordedPaths(context => {
  const animated = beginBuffer(), still = beginBuffer(), ctx = context(), camera = createCamera(800, 600, captureView);
  const start = Date.parse('2026-01-15T13:00:00Z');
  for (let minutes = 0; minutes <= 24 * 60; minutes += 10) {
    const twilight = solarSkyState(new Date(start + minutes * 60e3), DEFAULT_OBSERVER).twilight;
    animated.push(minutes * 60e3, twilight);
    still.push(minutes * 60e3, twilight);
    animated.draw(ctx, { isDark: true, camera });
  }
  still.draw(ctx, { isDark: true, camera });
  assert.deepEqual(still.slices(), animated.slices());
  assert.ok(still.slices().some(slice => slice.opacity === 1));
}));

test('full-sky head directions share the final frame epoch and follow rigid camera rotation', () => {
  const buffer = beginBuffer(), camera = createCamera(800, 600, captureView), elapsed = 3 * 3600e3;
  buffer.push(elapsed, 1);
  const directions = buffer.headDirections(), rotated = cameraAtOffset(camera, DEFAULT_OBSERVER.latitude, elapsed);
  const { projectSkyDirection } = require('../src/lib/sky/projection.ts');
  assert.equal(directions.size, testStars.length);
  for (const star of testStars) {
    near(Math.hypot(...directions.get(star.id)), 1, 1e-9);
    const actual = projectSkyDirection(directions.get(star.id), camera), expected = project(star.altitude, star.azimuth, rotated);
    assert.equal(actual === null, expected === null);
    if (!actual) continue;
    near(actual.x, expected.x, 1e-7);
    near(actual.y, expected.y, 1e-7);
  }
});

test('clearing or beginning another exposure discards the old timeline, catalogue and path cache', () => withRecordedPaths(context => {
  const buffer = beginBuffer(1000, 4), ctx = context(), camera = createCamera(800, 600, captureView);
  buffer.push(20000, 1);
  assert.equal(buffer.slices().length, 4);
  buffer.draw(ctx, { isDark: true, camera });
  buffer.clear();
  assert.equal(buffer.hasTrails(), false);
  assert.equal(buffer.slices().length, 0);
  assert.equal(buffer.headDirections().size, 0);
  buffer.draw(ctx, { isDark: true, camera });
  assert.equal(ctx.strokes.length, 0);
  buffer.begin(exposureSnapshot(30000, [testStars[1]]), 31000);
  buffer.push(32000, 1);
  assert.equal(buffer.headDirections().size, 1);
  assert.ok(buffer.headDirections().has(2));
  assert.deepEqual(buffer.slices(), [{ tStart: 31000, tEnd: 32000, opacity: 1 }]);
  buffer.begin(exposureSnapshot(40000, []), 40000);
  buffer.push(41000, 1);
  assert.equal(buffer.hasTrails(), false);
}));

test('connected trail segments share one subpath per star without joining different stars', () => withRecordedPaths(context => {
  const stars = [{ ...testStars[0], altitude: 7, azimuth: 45 }, { ...testStars[0], id: 4, altitude: 7, azimuth: 44 }];
  const buffer = new TrailBuffer(), ctx = context(), camera = createCamera(1920, 947, captureView);
  buffer.begin(exposureSnapshot(0, stars), 0);
  buffer.push(10 * 60e3, 1);
  buffer.draw(ctx, { isDark: true, camera });
  const commands = ctx.strokes.flatMap(stroke => stroke.path.commands);
  assert.equal(commands.filter(command => command[0] === 'M').length, 2, 'each star starts a separate subpath');
  assert.ok(commands.filter(command => command[0] === 'L').length > 2, 'continuous arc segments omit repeated moveTo calls');
  assert.equal(ctx.lineCap, 'butt');
  assert.equal(ctx.lineJoin, 'round');
}));

test('world-cell candidates preserve the complete unindexed geometry across sky directions', () => withRecordedPaths(context => {
  const { createTrailOrbit, createTrailProjector } = require('../src/lib/sky/trail-geometry.ts');
  const { horizonToVector } = require('../src/lib/sky/projection.ts');
  const stars = Array.from({ length: 256 }, (_, id) => ({
    id, mag: 2.5, colorIndex: .4,
    altitude: Math.asin((id + .5) / 128 - 1) * 180 / Math.PI, azimuth: id * 137.508 % 360,
  }));
  const buffer = new TrailBuffer(), ctx = context(), pole = poleAxis(DEFAULT_OBSERVER.latitude);
  buffer.begin(exposureSnapshot(0, stars), 0);
  buffer.push(10 * 60e3, 1);
  const slice = buffer.slices()[0];
  let index;
  for (const azimuth of [0, 90, 180, 270]) {
    const camera = createCamera(800, 600, { ...captureView, azimuth });
    buffer.draw(ctx, { isDark: true, camera });
    const actual = pathSegments(ctx), expected = [];
    const projector = createTrailProjector(camera);
    for (const star of stars) projector.append(
      createTrailOrbit(horizonToVector(star.altitude, star.azimuth), pole), 0, 2 * Math.PI * 600e3 / SIDEREAL_DAY_MS,
      (from, to) => expected.push(JSON.stringify([from.x, from.y, to.x, to.y])),
    );
    assert.deepEqual(actual, expected.sort(), `azimuth ${azimuth}: indexing keeps every visible segment`);
    if (!index) index = buffer.worldIndices.get(slice);
    else assert.equal(buffer.worldIndices.get(slice), index, 'the world index survives camera changes');
  }
  assert.equal([...index.values()].reduce((total, candidates) => total + candidates.length, 0), stars.length, 'the index covers the whole celestial sphere');
}));

test('current indexing is lazy, invalidates on advance and is released with expired slices', () => withRecordedPaths(context => {
  const buffer = beginBuffer(1000, 2), ctx = context(), camera = createCamera(800, 600, captureView);
  buffer.push(500, 1);
  buffer.draw(ctx, { isDark: true, camera });
  const current = buffer.current;
  assert.ok(buffer.worldIndices.has(current));
  buffer.push(750, 1);
  assert.ok(!buffer.worldIndices.has(current));
  buffer.draw(ctx, { isDark: true, camera });
  assert.ok(!buffer.worldIndices.has(current), 'same-view incremental painting does not rebuild the index');
  buffer.draw(ctx, { isDark: true, camera: createCamera(800, 600, { ...captureView, azimuth: 30 }) });
  assert.ok(buffer.worldIndices.has(current), 'a full current-interval repaint builds its index once');
  buffer.push(1000, 1);
  buffer.draw(ctx, { isDark: true, camera });
  assert.ok(buffer.worldIndices.has(current), 'the closed interval has a reusable world index');
  buffer.push(4000, 1);
  assert.ok(!buffer.worldIndices.has(current), 'expired time-window slices release their index');
  buffer.draw(ctx, { isDark: true, camera });
  assert.equal(buffer.worldIndices.size, 2);
  buffer.clear();
  assert.equal(buffer.worldIndices.size, 0);
}));

test('daylight-washed intervals release their world index permanently', () => withRecordedPaths(context => {
  const buffer = beginBuffer(60e3), ctx = context(), camera = createCamera(800, 600, captureView);
  buffer.push(60e3, 1);
  buffer.draw(ctx, { isDark: true, camera });
  const old = buffer.slices()[0];
  assert.ok(buffer.worldIndices.has(old));
  buffer.push(20 * 60e3, 0);
  assert.ok(!buffer.worldIndices.has(old));
  buffer.push(21 * 60e3, 1);
  assert.ok(!buffer.worldIndices.has(old));
}));

test('neighboring slices with equal opacity keep separate additive strokes', () => withRecordedPaths(context => {
  const buffer = new TrailBuffer(1000), ctx = context(), camera = createCamera(800, 600, captureView);
  buffer.begin(exposureSnapshot(0, [testStars[0]]), 0);
  buffer.push(2000, 1);
  buffer.draw(ctx, { isDark: true, camera });
  assert.equal(ctx.strokes.length, 2);
  assert.notEqual(ctx.strokes[0].path, ctx.strokes[1].path);
  assert.equal(ctx.strokes[0].alpha, ctx.strokes[1].alpha);
  assert.equal(ctx.gradients.length, 0, 'uniform night exposure retains the grouped drawing path');
  assert.ok(ctx.strokes.every(stroke => stroke.path.commands.length > 0));
}));
