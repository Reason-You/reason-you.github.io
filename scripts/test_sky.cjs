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
const { computeSky, twilightFactor } = require('../src/lib/sky/astro.ts');
const { DEFAULT_OBSERVER, SKY_DAYTIME_VISIBILITY } = require('../src/lib/sky/constants.ts');
const { createCamera, project } = require('../src/lib/sky/projection.ts');
const { projectSkyStars, magnitudeToAlpha, magnitudeToRadius, colorIndexToRgb } = require('../src/lib/sky/renderer.ts');
const {
  createLookUpCamera, interactiveStars, hitTestStar, togglePinnedId, reconcilePinnedIds, positionStarLabel,
} = require('../src/lib/sky/look-up.ts');
const names = require('../src/lib/sky/star-names-data.json');
const { formatSkyTime, formatSkyTimeShort } = require('../src/lib/sky/time.ts');
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

test('pinhole camera stays orthonormal with square pixels and valid FOV across supported viewports', () => {
  for (const [width, height] of [[1280, 575], [390, 667], [320, 350], [844, 280], [640, 400], [1920, 945]]) {
    const camera = createLookUpCamera(width, height);
    assert.ok(Number.isFinite(camera.scale) && camera.scale > 0);
    for (const v of [camera.right, camera.up, camera.forward]) near(Math.hypot(...v), 1);
    const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
    near(dot(camera.right, camera.up), 0);
    near(dot(camera.right, camera.forward), 0);
    near(dot(camera.up, camera.forward), 0);
    const center = project(47.5, 180, camera);
    near(center.x, width / 2);
    near(center.y, height / 2);
    const horizontalFov = 2 * Math.atan(width / (2 * camera.scale)) * 180 / Math.PI;
    const verticalFov = 2 * Math.atan(height / (2 * camera.scale)) * 180 / Math.PI;
    assert.ok(horizontalFov > 0 && horizontalFov < 180 && verticalFov > 0 && verticalFov < 180);
    near(width < 640 ? verticalFov : horizontalFov, width < 640 ? 75 : 100);
    assert.equal(project(-47.5, 0, camera), null);
    const lower = project(20, 180, camera);
    near(lower.y - center.y, Math.tan(27.5 * Math.PI / 180) * camera.scale);
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
      const camera = createLookUpCamera(width, height);
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
  const camera = createLookUpCamera(1280, 575);
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

test('daytime floor, light theme suppression, size and low-saturation color mappings remain', () => {
  assert.equal(twilightFactor(20), 0);
  assert.equal(twilightFactor(-20), 1);
  const snapshot = computeSky(new Date('2026-01-15T04:00:00Z'), DEFAULT_OBSERVER, city);
  assert.equal(snapshot.visibility, SKY_DAYTIME_VISIBILITY);
  const camera = createLookUpCamera(1280, 575);
  const dark = projectSkyStars(snapshot, camera, { isDark: true, mobile: false, presentation: 'look-up' });
  const light = projectSkyStars(snapshot, camera, { isDark: false, mobile: false, presentation: 'look-up' });
  assert.ok(dark.length > 0 && light.length > 0);
  near(light[0].alpha / dark[0].alpha, 0.14);
  assert.ok(magnitudeToRadius(-1) > magnitudeToRadius(3));
  assert.ok(magnitudeToAlpha(1, 4, 1) > magnitudeToAlpha(3, 4, 1));
  assert.deepEqual(colorIndexToRgb(undefined), [255, 253, 248]);
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

test('footer uses the system timezone, 24-hour clock and rendered instant', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Shanghai';
    assert.equal(formatSkyTime(Date.parse('2026-01-15T13:00:00Z')), 'January 15, 2026 · 21:00 · Facing South');
    assert.equal(formatSkyTime(Date.parse('2026-01-15T16:00:00Z')), 'January 16, 2026 · 00:00 · Facing South');
    assert.equal(formatSkyTimeShort(Date.parse('2026-01-15T13:00:00Z')), 'Jan 15, 2026 · 21:00 · Facing South');
    assert.equal(formatSkyTimeShort(Date.parse('2026-01-15T16:00:00Z')), 'Jan 16, 2026 · 00:00 · Facing South');
    process.env.TZ = 'America/New_York';
    assert.equal(formatSkyTime(Date.parse('2026-01-15T13:00:00Z')), 'January 15, 2026 · 08:00 · Facing South');
    assert.equal(formatSkyTime(Date.parse('2026-07-15T13:00:00Z')), 'July 15, 2026 · 09:00 · Facing South');
    assert.equal(formatSkyTimeShort(Date.parse('2026-07-15T13:00:00Z')), 'Jul 15, 2026 · 09:00 · Facing South');
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
