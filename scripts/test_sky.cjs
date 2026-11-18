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

const { getCatalog } = require('../src/lib/sky/catalog.ts');
const { computeSky, createSkyComputation, twilightFactor } = require('../src/lib/sky/astro.ts');
const { DEFAULT_OBSERVER, SKY_DAYTIME_VISIBILITY } = require('../src/lib/sky/constants.ts');
const { createCamera, project } = require('../src/lib/sky/projection.ts');
const { drawSky, projectSkyStars, magnitudeToAlpha, magnitudeToRadius, colorIndexToRgb, starInkRgb, trailHeadPoint } = require('../src/lib/sky/renderer.ts');
const {
  createLookUpCamera, interactiveStars, hitTestStar, togglePinnedId, reconcilePinnedIds, positionStarLabel, positionStarLabels,
  readFacing, SKY_DIRECTIONS, viewForFacing, normalizeSkyView, directionName, cardinalFacing, dragSkyView,
} = require('../src/lib/sky/look-up.ts');
const names = require('../src/lib/sky/star-names-data.json');
const { formatSkyTime, formatSkyTimeShort, formatSkyTimeCompact } = require('../src/lib/sky/time.ts');
const city = { limitingMagnitude: 4, bortleApprox: 8, lightProxy: 0, source: 'override' };
const darkSky = { ...city, limitingMagnitude: 6.5, bortleApprox: 1 };
const scenes = [
  ['A', '2026-01-15T13:00:00Z', DEFAULT_OBSERVER, city, 'Betelgeuse'],
  ['B', '2026-07-15T13:00:00Z', DEFAULT_OBSERVER, city, 'Antares'],
  ['C', '2026-05-15T20:00:00Z', { ...DEFAULT_OBSERVER, latitude: -24.77, longitude: 15.96 }, darkSky, 'Acrux'],
];
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

test('all 145 bilingual names join unique HYG/HIP identities; 179 entries satisfy mag <= 3', () => {
  const catalog = getCatalog();
  const bright = catalog.filter(star => star.mag <= 3);
  const named = bright.filter(star => star.name);
  assert.equal(catalog.length, 8920);
  assert.equal(bright.length, 179);
  assert.equal(named.length, 145);
  assert.equal(names.length, 145);
  assert.equal(new Set(catalog.map(star => star.id)).size, 8920);
  assert.equal(new Set(names.map(star => star.hygId)).size, 145);
  for (const name of names) {
    const star = named.find(star => star.id === name.hygId);
    assert.ok(star, name.english);
    assert.equal(star.hip, name.hip);
    assert.equal(star.name, name.english);
    assert.ok(name.chinese && name.bayer && name.hd && name.sourceUrl && name.sourceEvidence);
  }
  assert.equal(names.find(star => star.hygId === 39644).chinese, '弧矢增三十二');
  assert.equal(names.find(star => star.hygId === 107742).chinese, '败臼一');
  assert.equal(names.find(star => star.hygId === 118485).chinese, '北河二B');
});

test('incremental sky preparation yields between frames without changing the astronomy result', () => {
  const date = new Date('2026-11-18T12:00:00Z');
  const ideal = { ...city, limitingMagnitude: 7.6, bortleApprox: 1 };
  const computation = createSkyComputation(date, DEFAULT_OBSERVER, ideal);
  let snapshot = null;
  let chunks = 0;
  while (!snapshot) {
    snapshot = computation.runFor(0);
    chunks += 1;
    assert.ok(chunks < 1000);
  }
  assert.ok(chunks > 2);
  assert.deepEqual(snapshot, computeSky(date, DEFAULT_OBSERVER, ideal));
  assert.equal(snapshot.celestialStars.length, 8920);
});

test('pinhole camera stays orthonormal with square pixels and valid FOV across supported viewports', () => {
  for (const [width, height] of [[1280, 575], [390, 667], [320, 350], [844, 280], [640, 400], [1920, 945]]) {
    const camera = createLookUpCamera(width, height);
    assert.ok(Number.isFinite(camera.scale) && camera.scale > 0);
    for (const v of [camera.right, camera.up, camera.forward]) near(Math.hypot(...v), 1);
    const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
    near(dot(camera.right, camera.up), 0);
    near(dot(camera.right, camera.forward), 0);
    near(dot(camera.up, camera.forward), 0);
    const center = project(35, 0, camera);
    near(center.x, width / 2);
    near(center.y, height / 2);
    const horizontalFov = 2 * Math.atan(width / (2 * camera.scale)) * 180 / Math.PI;
    const verticalFov = 2 * Math.atan(height / (2 * camera.scale)) * 180 / Math.PI;
    assert.ok(horizontalFov > 0 && horizontalFov < 180 && verticalFov > 0 && verticalFov < 180);
    near(width < 640 ? verticalFov : horizontalFov, width < 640 ? 75 : 100);
    assert.equal(project(-35, 180, camera), null);
    const lower = project(0, 0, camera);
    near(lower.y - center.y, Math.tan(35 * Math.PI / 180) * camera.scale);
  }
});

test('four cardinal cameras reproject one immutable sky snapshot and cycle back to North', () => {
  const snapshot = computeSky(new Date('2026-01-15T13:00:00Z'), DEFAULT_OBSERVER, city);
  const original = JSON.stringify(snapshot);
  let facing = 'north';
  for (const expected of ['north', 'east', 'south', 'west']) {
    assert.equal(facing, expected);
    const camera = createLookUpCamera(1280, 575, facing);
    const center = project(35, SKY_DIRECTIONS[facing].azimuth, camera);
    near(center.x, 640);
    near(center.y, 287.5);
    const rendered = projectSkyStars(snapshot, camera, { isDark: true, mobile: false, presentation: 'look-up' });
    assert.ok(rendered.length > 0);
    assert.equal(JSON.stringify(snapshot), original);
    facing = SKY_DIRECTIONS[facing].next;
  }
  assert.equal(facing, 'north');
  assert.equal(readFacing('north'), 'north');
  assert.equal(readFacing('south'), 'south');
  assert.equal(readFacing('east'), 'east');
  assert.equal(readFacing('west'), 'west');
  assert.equal(readFacing(null), 'north');
  assert.equal(readFacing('invalid'), 'north');
});

test('continuous views preserve square pixels and stable orthogonal axes through the zenith', () => {
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  for (const [width, height] of [[1280, 575], [390, 667]]) {
    const scale = createLookUpCamera(width, height).scale;
    for (const azimuth of [0, 37.5, 90, 180, 270, 359.99]) {
      for (const altitude of [0, 47.5, 80, 89.999, 90]) {
        const camera = createLookUpCamera(width, height, { azimuth, altitude });
        near(camera.scale, scale);
        for (const axis of [camera.right, camera.up, camera.forward]) near(Math.hypot(...axis), 1);
        near(dot(camera.right, camera.up), 0);
        near(dot(camera.right, camera.forward), 0);
        near(dot(camera.up, camera.forward), 0);
        near(camera.right[2], 0, 1e-12);
        const center = project(altitude, azimuth, camera);
        near(center.x, width / 2);
        near(center.y, height / 2);
      }
    }
    const before = createLookUpCamera(width, height, { azimuth: 37.5, altitude: 89.999 });
    const zenith = createLookUpCamera(width, height, { azimuth: 37.5, altitude: 90 });
    near(dot(before.right, zenith.right), 1);
    assert.ok(dot(before.up, zenith.up) > 0.999999, 'reaching the zenith preserves screen orientation');
  }
});

test('view normalization and cardinal presets provide deterministic reset destinations', () => {
  assert.deepEqual(normalizeSkyView({ azimuth: -1, altitude: 100 }), { azimuth: 359, altitude: 90 });
  assert.deepEqual(normalizeSkyView({ azimuth: 721, altitude: -10 }), { azimuth: 1, altitude: 0 });
  for (const facing of ['south', 'west', 'north', 'east']) {
    const preset = viewForFacing(facing);
    assert.deepEqual(preset, { azimuth: SKY_DIRECTIONS[facing].azimuth, altitude: 35 });
    assert.deepEqual(viewForFacing(facing, 47.5), { azimuth: SKY_DIRECTIONS[facing].azimuth, altitude: 47.5 });
    assert.deepEqual(createLookUpCamera(1280, 575, facing), createLookUpCamera(1280, 575, preset));
  }
  assert.equal(directionName(0), 'North');
  assert.equal(directionName(359.9), 'North');
  assert.equal(directionName(45), 'NE');
  assert.equal(directionName(90), 'East');
  assert.equal(directionName(135), 'SE');
  assert.equal(directionName(180), 'South');
  assert.equal(directionName(225), 'SW');
  assert.equal(directionName(270), 'West');
  assert.equal(directionName(-45), 'NW');
});

test('cardinal facing follows the current azimuth with clockwise ties at forty-five degrees', () => {
  for (const [azimuth, facing] of [
    [0, 'north'], [44.999, 'north'], [45, 'east'], [90, 'east'], [134.999, 'east'],
    [135, 'south'], [180, 'south'], [224.999, 'south'], [225, 'west'], [270, 'west'],
    [314.999, 'west'], [315, 'north'], [359.9, 'north'], [-45, 'north'], [-46, 'west'], [720, 'north'],
  ]) assert.equal(cardinalFacing(azimuth), facing, `${azimuth} degrees`);
});

test('dragging moves sky content with the pointer at the camera perspective scale', () => {
  for (const [width, height] of [[1280, 575], [390, 667]]) {
    for (const altitude of [0, 47.5, 59]) {
      const start = { azimuth: 0, altitude };
      const camera = createLookUpCamera(width, height, start);
      for (const dx of [-20, 20]) {
        const view = dragSkyView(start, dx, 0, camera);
        const moved = project(start.altitude, start.azimuth, createLookUpCamera(width, height, view));
        near(moved.x - width / 2, dx, 0.15);
        assert.ok(dx > 0 ? view.azimuth > 350 : view.azimuth > 0 && view.azimuth < 10,
          'horizontal dragging crosses north without reversing motion');
      }
      const down = dragSkyView(start, 0, 20, camera);
      const moved = project(start.altitude, start.azimuth, createLookUpCamera(width, height, down));
      near(moved.y - height / 2, 20);
    }
  }
});

test('dragging stays bounded at the horizon and zenith without amplifying azimuth into a flip', () => {
  for (const altitude of [0, 47.5, 89.999, 90]) {
    const start = { azimuth: 359, altitude };
    const camera = createLookUpCamera(390, 667, start);
    assert.deepEqual(dragSkyView(start, 0, 0, camera), start);
    const up = dragSkyView(start, 0, 1e6, camera).altitude;
    const down = dragSkyView(start, 0, -1e6, camera).altitude;
    assert.ok(up <= 90 && up >= Math.min(90, altitude + 89.9));
    assert.ok(down >= 0 && down <= Math.max(0, altitude - 89.9));
    const right = dragSkyView(start, 2, 0, camera);
    const left = dragSkyView(start, -2, 0, camera);
    const delta = view => ((view.azimuth - start.azimuth + 540) % 360) - 180;
    assert.ok(delta(right) < 0 && delta(right) > -1);
    assert.ok(delta(left) > 0 && delta(left) < 1);
  }
});

// Independent mean-sidereal-time horizon equations; allow precession/nutation/refraction.
function approximateHorizon(date, observer, star) {
  const deg = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const centuries = (jd - 2451545) / 36525;
  const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545) +
    0.000387933 * centuries ** 2 - centuries ** 3 / 38710000;
  const ha = (gmst + observer.longitude - star.ra * 15) * deg;
  const dec = star.dec * deg;
  const lat = observer.latitude * deg;
  return {
    altitude: Math.asin(Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha)) / deg,
    azimuth: (Math.atan2(-Math.sin(ha) * Math.cos(dec),
      Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(ha)) / deg + 360) % 360,
  };
}

for (const [scene, utc, observer, pollution, selectedName] of scenes) {
  test(`scene ${scene}: astronomy agrees with independent horizon equations; target visible at both aspect ratios`, () => {
    const snapshot = computeSky(new Date(utc), observer, pollution);
    assert.ok(snapshot.sunAltitude < -16);
    assert.equal(snapshot.visibility, 1);
    const target = snapshot.stars.find(star => star.name === selectedName);
    assert.ok(target);
    const approximate = approximateHorizon(snapshot.date, observer, target);
    const deg = Math.PI / 180;
    const angularSeparation = Math.acos(Math.min(1,
      Math.sin(target.altitude * deg) * Math.sin(approximate.altitude * deg) +
      Math.cos(target.altitude * deg) * Math.cos(approximate.altitude * deg) *
      Math.cos((target.azimuth - approximate.azimuth) * deg)
    )) / deg;
    assert.ok(angularSeparation < 0.5, `J2000 approximation differs by ${angularSeparation}°`);
    for (const [width, height] of [[1280, 575], [390, 667]]) {
      const camera = createLookUpCamera(width, height, { azimuth: 180, altitude: 47.5 });
      const rendered = projectSkyStars(snapshot, camera, { isDark: true, mobile: width < 640, presentation: 'look-up' });
      const interactive = interactiveStars(rendered, camera);
      assert.ok(interactive.some(entry => entry.star.name === selectedName));
      assert.ok(rendered.every(entry => Number.isFinite(entry.point.x) && Number.isFinite(entry.point.y)));
      assert.ok(rendered.every(entry => entry.star.mag <= pollution.limitingMagnitude));
      assert.ok(interactive.every(entry => entry.star.mag <= 3));
    }
  });
}

test('Look Up renders bottom-of-frame stars with unchanged magnitude limit; homepage mask remains', () => {
  const camera = createLookUpCamera(1280, 575, { azimuth: 180, altitude: 47.5 });
  const snapshot = {
    visibility: 1, twilight: 1, pollution: city,
    stars: [{ ...getCatalog().find(star => star.name === 'Betelgeuse'), altitude: 20, azimuth: 180 }],
  };
  const full = projectSkyStars(snapshot, camera, { isDark: true, mobile: false, presentation: 'look-up' });
  assert.equal(full.length, 1);
  assert.ok(full[0].point.y > camera.height * 0.9);
  assert.equal(projectSkyStars(snapshot, camera, { isDark: true, mobile: false }).length, 0);
  const belowLimit = { ...snapshot, pollution: { ...city, limitingMagnitude: 0 } };
  assert.equal(projectSkyStars(belowLimit, camera, { isDark: true, mobile: false, presentation: 'look-up' }).length, 0);
  assert.equal(createCamera(1280, 720).centerYFraction, 0.5);
});

test('daylight keeps the star chart legible and the homepage star window faint', () => {
  assert.equal(twilightFactor(20), 0);
  assert.equal(twilightFactor(-20), 1);
  const snapshot = computeSky(new Date('2026-01-15T04:00:00Z'), DEFAULT_OBSERVER, city);
  assert.equal(snapshot.visibility, SKY_DAYTIME_VISIBILITY);
  const camera = createLookUpCamera(1280, 575, { azimuth: 180, altitude: 47.5 });
  const dark = projectSkyStars(snapshot, camera, { isDark: true, mobile: false, presentation: 'look-up' });
  const light = projectSkyStars(snapshot, camera, { isDark: false, mobile: false, presentation: 'look-up' });
  assert.ok(dark.length > 0 && light.length > 0);
  assert.ok(light[0].alpha >= dark[0].alpha);
  const darkWindow = projectSkyStars(snapshot, camera, { isDark: true, mobile: false });
  const lightWindow = projectSkyStars(snapshot, camera, { isDark: false, mobile: false });
  near(lightWindow[0].alpha / darkWindow[0].alpha, 0.14);
  assert.ok(magnitudeToRadius(-1) > magnitudeToRadius(3));
  assert.ok(magnitudeToAlpha(1, 4, 1) > magnitudeToAlpha(3, 4, 1));
  assert.deepEqual(colorIndexToRgb(undefined), [255, 253, 248]);
});

test('Shanghai comparison adds faint stars after sunset without shifting bright stars', () => {
  const camera = createLookUpCamera(390, 690, { azimuth: 0, altitude: 47.5 });
  const style = { isDark: true, mobile: true, presentation: 'look-up' };
  const stars = [1, 6].map((mag, index) => ({ id: index, mag, altitude: 48, azimuth: index }));
  const scene = { stars, pollution: darkSky, cityLimitingMagnitude: 4, visibility: 1, twilight: 1 };
  const night = projectSkyStars(scene, camera, style);
  const dusk = projectSkyStars({ ...scene, twilight: 0.5 }, camera, style);
  const day = projectSkyStars({ ...scene, twilight: 0 }, camera, style);
  assert.equal(night.length, 2);
  assert.deepEqual(day.map(entry => entry.star.mag), [1]);
  near(dusk[1].alpha, night[1].alpha / 2);
  assert.deepEqual(night[0].point, day[0].point);
});

test('bright-star radius gain is bounded, monotonic and smooth at mag 0.6', () => {
  const base = mag => Math.min(2.6, Math.max(0.8, 2.6 - (mag + 1.5) * 0.22));
  near(magnitudeToRadius(-1.5) - base(-1.5), 0.3);
  for (let i = 0; i <= 900; i += 1) {
    const mag = -2 + i / 100;
    const gain = magnitudeToRadius(mag) - base(mag);
    assert.ok(gain >= -1e-12 && gain <= 0.3 + 1e-12);
    assert.ok(magnitudeToRadius(mag) >= magnitudeToRadius(mag + 0.01));
    if (mag >= 0.6) near(gain, 0);
  }
  const step = 1e-5;
  const at = magnitudeToRadius(0.6);
  near(at, base(0.6));
  near(magnitudeToRadius(0.6 - step), at, 1e-5);
  near((at - magnitudeToRadius(0.6 - step)) / step,
    (magnitudeToRadius(0.6 + step) - at) / step, 1e-5);
});

test('both sky presentations share soft bright-star halos without changing projection or alpha', () => {
  const snapshot = computeSky(new Date('2026-01-15T13:00:00Z'), DEFAULT_OBSERVER, darkSky);
  for (const presentation of ['background', 'look-up']) {
    for (const isDark of [true, false]) {
      const arcs = [], gradients = [];
      const ctx = {
        clearRect() {}, fillRect() {}, beginPath() {}, fill() {},
        arc(x, y, radius) { arcs.push({ x, y, radius }); },
        createLinearGradient() { return { addColorStop() {} }; },
        createRadialGradient(x, y, inner, endX, endY, radius) {
          const gradient = { x, y, radius, stops: [], addColorStop(offset, color) { this.stops.push([offset, color]); } };
          gradients.push(gradient);
          return gradient;
        },
      };
      const camera = createLookUpCamera(1440, 720, { azimuth: 180, altitude: 47.5 });
      const style = { presentation, isDark, mobile: false };
      const projected = projectSkyStars(snapshot, camera, style);
      const rendered = drawSky(ctx, snapshot, camera, style);
      assert.deepEqual(rendered, projected);
      const bright = rendered.filter(({ star }) => star.mag < 0.6);
      assert.ok(bright.length > 0);
      assert.equal(gradients.length, bright.length);
      assert.equal(arcs.length, rendered.length + bright.length);
      for (let i = 0; i < bright.length; i += 1) {
        const { star, point, alpha } = bright[i];
        const gradient = gradients[i];
        near(gradient.x, point.x); near(gradient.y, point.y);
        near(gradient.radius, magnitudeToRadius(star.mag) * 3.8);
        const ink = !isDark && presentation === 'look-up';
        const color = (ink ? starInkRgb(star.colorIndex) : colorIndexToRgb(star.colorIndex)).join(', ');
        assert.deepEqual(gradient.stops, [
          [0, `rgba(${color}, ${(alpha * (ink ? 0.14 : 0.42)).toFixed(3)})`], [1, `rgba(${color}, 0)`],
        ]);
      }
    }
  }
});

test('trail heads blend through half size to the stroke radius while preserving stars and alpha', () => {
  const camera = createLookUpCamera(1440, 720, { azimuth: 180, altitude: 47.5 });
  const seed = getCatalog().find(star => star.name === 'Betelgeuse');
  const stars = [0.2, 0.8, 2.2].map((mag, index) => ({
    ...seed, id: index + 1, mag, altitude: 47.5, azimuth: 170 + index * 10,
  }));
  const snapshot = { stars, visibility: 1, twilight: 1, pollution: city };
  const capture = (visibility, trailBlend) => {
    const circles = [], gradients = [];
    let arc;
    const ctx = {
      clearRect() {}, beginPath() {},
      arc(x, y, radius) { arc = { x, y, radius }; },
      fill() { circles.push({ ...arc, style: this.fillStyle }); },
      createRadialGradient(x, y, inner, endX, endY, radius) {
        const gradient = { radius, stops: [], addColorStop(offset, color) { this.stops.push([offset, color]); } };
        gradients.push(gradient);
        return gradient;
      },
    };
    const rendered = drawSky(ctx, { ...snapshot, visibility }, camera,
      { isDark: true, mobile: false, presentation: 'look-up', trailBlend });
    return { rendered, points: circles.filter(circle => typeof circle.style === 'string'), gradients };
  };

  const night = capture(1, 0);
  for (const visibility of [1, SKY_DAYTIME_VISIBILITY]) {
    const normal = capture(visibility, 0);
    const half = capture(visibility, 0.5);
    const trail = capture(visibility, 1);
    assert.equal(normal.rendered.length, 3);
    assert.deepEqual(half.rendered, normal.rendered, 'halfway restoration preserves star positions and alpha');
    assert.deepEqual(trail.rendered, normal.rendered, 'trail heads preserve star positions and alpha');
    assert.deepEqual(half.points.map(point => point.style), normal.points.map(point => point.style));
    assert.deepEqual(trail.points.map(point => point.style), normal.points.map(point => point.style));
    for (const [index, expectedRadius] of [1.1, 0.7, 0.45].entries()) {
      near(trail.points[index].radius, expectedRadius);
      near(half.points[index].radius, (normal.points[index].radius + expectedRadius) / 2);
      near(normal.rendered[index].alpha / night.rendered[index].alpha, visibility);
    }
    assert.equal(normal.gradients.length, 1);
    assert.equal(half.gradients.length, 1);
    assert.equal(trail.gradients.length, 0, 'full trail heads have no halo');
    near(half.gradients[0].radius, normal.gradients[0].radius);
    const haloAlpha = gradient => Number(gradient.stops[0][1].match(/, ([\d.]+)\)$/)[1]);
    near(haloAlpha(half.gradients[0]), haloAlpha(normal.gradients[0]) / 2, 0.001);
  }
});

test('trail heads return from their endpoints while reported projections stay unchanged', () => {
  const camera = createLookUpCamera(1440, 720, { azimuth: 180, altitude: 47.5 });
  const seed = getCatalog().find(star => star.name === 'Betelgeuse');
  const snapshot = {
    visibility: 1, twilight: 1, pollution: city,
    stars: [
      { ...seed, id: 1, mag: 0.2, altitude: 47.5, azimuth: 180 },
      { ...seed, id: 2, mag: 1.5, altitude: 47.5, azimuth: 190 },
    ],
  };
  const style = { isDark: true, mobile: false, presentation: 'look-up' };
  const projected = projectSkyStars(snapshot, camera, style);
  const point = projected[0].point;
  const trailHeadPositions = new Map([[1, { x: point.x + 12, y: point.y - 8 }]]);
  const normalRadius = magnitudeToRadius(0.2);
  const cases = [
    [0, 0, 0, 0, normalRadius],
    [0.5, 0.5, 6, -4, (normalRadius + 1.1) / 2],
    [1, 1, 12, -8, 1.1],
    [0, 1, 12, -8, normalRadius],
    [1, 0, 0, 0, 1.1],
    [1, undefined, 0, 0, 1.1],
  ];
  for (const [trailBlend, trailPositionBlend, offsetX, offsetY, expectedRadius] of cases) {
    const circles = [], halos = [];
    let arc;
    const ctx = {
      clearRect() {}, beginPath() {},
      arc(x, y, radius) { arc = { x, y, radius }; },
      fill() { circles.push({ ...arc, style: this.fillStyle }); },
      createRadialGradient(x, y) {
        const gradient = { x, y, addColorStop() {} };
        halos.push(gradient);
        return gradient;
      },
    };
    const rendered = drawSky(ctx, snapshot, camera, { ...style, trailBlend, trailPositionBlend, trailHeadPositions });
    assert.deepEqual(rendered, projected, 'drawing anchors preserve the projected star records');
    const points = circles.filter(circle => typeof circle.style === 'string');
    near(points[0].x, point.x + offsetX);
    near(points[0].y, point.y + offsetY);
    near(points[0].radius, expectedRadius);
    near(points[1].x, projected[1].point.x);
    near(points[1].y, projected[1].point.y);
    assert.equal(halos.length, trailBlend === 1 ? 0 : 1, 'size blend controls the halo independently of position');
    for (const halo of halos) {
      near(halo.x, points[0].x);
      near(halo.y, points[0].y);
    }
  }
});

test('shared trail-head coordinates retain depth and leave unanchored points intact', () => {
  const point = { x: 10, y: 20, depth: 0.75 };
  const anchor = { x: 30, y: 8 };
  assert.strictEqual(trailHeadPoint(point, undefined, 1), point);
  assert.deepEqual(trailHeadPoint(point, anchor, 0), point);
  assert.deepEqual(trailHeadPoint(point, anchor, 0.5), { x: 20, y: 14, depth: 0.75 });
  assert.deepEqual(trailHeadPoint(point, anchor, 1), { x: 30, y: 8, depth: 0.75 });
  assert.deepEqual(point, { x: 10, y: 20, depth: 0.75 });
});

test('nearest pointer hit, mouse/touch radii, and brightness tie-break for unresolved components', () => {
  const entry = (id, x, y, mag = 1) => ({ star: { id, mag }, point: { x, y } });
  const stars = [entry(1, 100, 100), entry(2, 111, 100, 2)];
  assert.equal(hitTestStar(stars, 110, 100, 16).star.id, 2);
  assert.equal(hitTestStar(stars, 85, 100, 16).star.id, 1);
  assert.equal(hitTestStar(stars, 73, 100, 16), null);
  assert.equal(hitTestStar(stars, 73, 100, 28).star.id, 1);
  assert.equal(hitTestStar([entry(1, 100, 100, 2), entry(2, 100.1, 100, 1)], 100, 100, 16).star.id, 2);
});

test('names accumulate: clicks toggle one star at a time; updates keep only visible stars', () => {
  let ids = [];
  ids = togglePinnedId(ids, 1);
  ids = togglePinnedId(ids, 2);
  ids = togglePinnedId(ids, 3);
  assert.deepEqual(ids, [1, 2, 3]);
  ids = togglePinnedId(ids, 2);
  assert.deepEqual(ids, [1, 3]);
  ids = reconcilePinnedIds(ids, [3, 4]);
  assert.deepEqual(ids, [3]);
  ids = reconcilePinnedIds(ids, [4, 5]);
  assert.deepEqual(ids, []);
  ids = togglePinnedId(ids, 4);
  ids = reconcilePinnedIds(ids, [4, 5]);
  assert.deepEqual(ids, [4]);
});

test('footer shows device dates, 24-hour clocks and UTC offsets across daylight saving', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Shanghai';
    assert.equal(formatSkyTime(Date.parse('2026-01-15T13:00:00Z')), 'January 15, 2026 21:00 UTC+8');
    assert.equal(formatSkyTime(Date.parse('2026-01-15T16:00:00Z')), 'January 16, 2026 00:00 UTC+8');
    assert.equal(formatSkyTimeShort(Date.parse('2026-01-15T13:00:00Z')), 'Jan 15, 2026 21:00 UTC+8');
    assert.equal(formatSkyTimeShort(Date.parse('2026-01-15T16:00:00Z')), 'Jan 16, 2026 00:00 UTC+8');
    assert.equal(formatSkyTimeCompact(Date.parse('2026-01-15T16:00:00Z')), '01/16 00:00 UTC+8');
    process.env.TZ = 'America/New_York';
    assert.equal(formatSkyTime(Date.parse('2026-01-15T13:00:00Z')), 'January 15, 2026 08:00 UTC-5');
    assert.equal(formatSkyTime(Date.parse('2026-07-15T13:00:00Z')), 'July 15, 2026 09:00 UTC-4');
    assert.equal(formatSkyTimeShort(Date.parse('2026-07-15T13:00:00Z')), 'Jul 15, 2026 09:00 UTC-4');
    assert.equal(formatSkyTimeCompact(Date.parse('2026-01-15T13:00:00Z')), '01/15 08:00 UTC-5');
    assert.equal(formatSkyTimeCompact(Date.parse('2026-07-15T13:00:00Z')), '07/15 09:00 UTC-4');
    process.env.TZ = 'UTC';
    assert.equal(formatSkyTimeCompact(Date.parse('2026-01-15T13:00:00Z')), '01/15 13:00 UTC+0');
    process.env.TZ = 'Asia/Kolkata';
    assert.equal(formatSkyTimeCompact(Date.parse('2026-01-15T13:00:00Z')), '01/15 18:30 UTC+5:30');
    process.env.TZ = 'Pacific/Chatham';
    assert.equal(formatSkyTimeCompact(Date.parse('2026-01-15T13:00:00Z')), '01/16 02:45 UTC+13:45');
    assert.equal(formatSkyTimeCompact(Date.parse('2026-07-15T13:00:00Z')), '07/16 01:45 UTC+12:45');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('measured labels stay inside the sky at all four edges', () => {
  for (const [width, height] of [[1280, 575], [390, 667]]) {
    for (const [x, y] of [[1, 1], [width - 1, 1], [1, height - 1], [width - 1, height - 1], [width / 2, height / 2]]) {
      const { left, top } = positionStarLabel(x, y, width, height, 155, 44);
      assert.ok(left >= 12 && left + 155 <= width - 12);
      assert.ok(top >= 12 && top + 44 <= height - 12);
    }
  }
});

test('nearby bilingual names keep ten-pixel clearance, all names and stable positions', () => {
  for (const [width,height] of [[360,665],[390,709],[412,780],[1280,755]]) {
    const labels=[{id:85665,x:60,y:height-130,width:42,height:44},{id:85436,x:66,y:height-129,width:42,height:44}];
    const positions=positionStarLabels(labels,width,height);
    assert.equal(positions.size,2);
    const [a,b]=labels.map(label=>({...positions.get(label.id),width:label.width,height:label.height}));
    assert.ok(a.left+a.width<=b.left-9.99||b.left+b.width<=a.left-9.99||a.top+a.height<=b.top-9.99||b.top+b.height<=a.top-9.99);
    assert.deepEqual(positionStarLabels(labels,width,height,[],positions),positions);
  }
});

test('measured star names avoid controls and the selected star centres in crowded mobile layouts', () => {
  const labels=Array.from({length:12},(_,i)=>({id:i,x:100+i%3*12,y:220+Math.floor(i/3)*22,width:i%3===0?115:56,height:44}));
  const obstacles=[{x:12,y:80,width:200,height:60},{x:220,y:550,width:150,height:60}];
  const positions=positionStarLabels(labels,390,709,obstacles);assert.equal(positions.size,labels.length);
  const rectangles=labels.map(label=>({...positions.get(label.id),width:label.width,height:label.height}));
  for(let i=0;i<rectangles.length;i++){
    const a=rectangles[i];assert.ok(a.left>=12&&a.top>=12&&a.left+a.width<=378&&a.top+a.height<=697);
    for(const b of [...rectangles.slice(i+1),...obstacles.map(r=>({left:r.x,top:r.y,width:r.width,height:r.height}))]){
      assert.ok(a.left+a.width<=b.left-9.99||b.left+b.width<=a.left-9.99||a.top+a.height<=b.top-9.99||b.top+b.height<=a.top-9.99);
    }
  }
});

test('fractional text widths retain the twelve-pixel mobile margin', () => {
  const label={id:74556,x:304.4,y:322.2,width:93.171875,height:44};
  const position=positionStarLabels([label],360,665).get(label.id);assert.ok(position);
  assert.ok(position.left>=12&&position.left+label.width<=348);
});

test('landscape names use available space across the viewport after a dense portrait selection', () => {
  const snapshot=computeSky(new Date('2026-10-13T06:50:00Z'),DEFAULT_OBSERVER,{...city,limitingMagnitude:4.146324479884627});
  const camera=createLookUpCamera(844,255,{azimuth:180,altitude:47.5});
  const stars=interactiveStars(projectSkyStars(snapshot,camera,{isDark:true,mobile:false,presentation:'look-up'}),camera);
  const labels=stars.map(({star,name,point})=>({id:star.id,x:point.x,y:point.y,width:Math.max(name.chinese.length*14,name.english.length*7),height:44}));
  const positions=positionStarLabels(labels,camera.width,camera.height);
  assert.ok(labels.length>=10);assert.equal(positions.size,labels.length);
});
