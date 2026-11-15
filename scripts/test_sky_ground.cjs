const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const { createCamera, project } = require('../src/lib/sky/projection.ts');
const { cameraAtOffset, zenithAtOffset, TrailBuffer } = require('../src/lib/sky/star-trails.ts');
const { getCatalog } = require('../src/lib/sky/catalog.ts');
const { SKY_DAYTIME_VISIBILITY, SKY_VIEW, SKY_CENTER_Y } = require('../src/lib/sky/constants.ts');
const { projectSkyStars, drawSky } = require('../src/lib/sky/renderer.ts');
const { interactiveStars, hitTestStar } = require('../src/lib/sky/look-up.ts');
const {
  LOOK_UP_DEFAULT_ALTITUDE, CAMPFIRE_AZIMUTH, CAMPFIRE_ALTITUDE,
  horizonScreenY, projectCampfire, presetAltitude,
} = require('../src/lib/sky/ground.ts');

const DEG = Math.PI / 180;
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cameraFor = (width, height, altitude = 22.5, azimuth = 0) => createCamera(width, height, {
  azimuth, centerAltitude: altitude,
  horizontalFov: width < 640 ? 2 * Math.atan(Math.tan(75 * DEG / 2) * width / height) / DEG : 100,
});

test('the local horizon rises into view when looking down and leaves when looking up', () => {
  for (const [width, height] of [[1280, 575], [390, 703]]) {
    const low = horizonScreenY(cameraFor(width, height, 0));
    const middle = horizonScreenY(cameraFor(width, height, 20));
    const high = horizonScreenY(cameraFor(width, height, 47.5));
    near(low, height / 2);
    assert.ok(middle > low && middle < height);
    assert.ok(high > height);
    assert.equal(horizonScreenY(cameraFor(width, height, 90)), Infinity);
  }
});

test('every visible zero-altitude direction lies on the same projected horizon line', () => {
  for (const facing of [0, 45, 90, 180, 270, 359]) {
    for (const altitude of [0, 12, 22.5, 60]) {
      const camera = cameraFor(1280, 650, altitude, facing);
      const y = horizonScreenY(camera);
      for (const delta of [-40, -20, 0, 20, 40]) {
        const point = project(0, facing + delta, camera);
        if (point) near(point.y, y);
      }
      near(y, horizonScreenY(cameraFor(1280, 650, altitude, 0)));
    }
  }
});

test('the north-side fire follows turning and looking while disappearing outside the view', () => {
  assert.equal(CAMPFIRE_AZIMUTH, 0);
  assert.equal(CAMPFIRE_ALTITUDE, -2);
  const centered = projectCampfire(cameraFor(1280, 767));
  const left = projectCampfire(cameraFor(1280, 767, 22.5, 25));
  const right = projectCampfire(cameraFor(1280, 767, 22.5, 335));
  assert.ok(centered.visible && left.visible && right.visible);
  near(centered.x, 640);
  assert.ok(left.x < centered.x && right.x > centered.x);
  near(left.x + right.x, 1280);
  const lowered = projectCampfire(cameraFor(1280, 767, 0));
  assert.ok(lowered.y < centered.y);
  assert.equal(projectCampfire(cameraFor(1280, 767, 70)).visible, false);
  for (const azimuth of [80, 90, 180, 270, 280]) {
    assert.equal(projectCampfire(cameraFor(1280, 767, 22.5, azimuth)).visible, false);
  }
});

test('campfire size follows perspective scale and keeps a usable small-screen floor', () => {
  const regular = projectCampfire(cameraFor(1280, 767, 0));
  const larger = projectCampfire(cameraFor(2560, 1534, 0));
  near(larger.scale, regular.scale * 2);
  const turned = projectCampfire(cameraFor(1280, 767, 0, 30));
  assert.ok(turned.scale > regular.scale);
  const small = projectCampfire(cameraFor(320, 180, 0));
  assert.ok(small.scale >= 0.68);
  assert.ok(136 * small.scale >= 92 && 108 * small.scale >= 73);
});

test('a fixed local horizon agrees with the time-rotated celestial frame', () => {
  const physical = cameraFor(1280, 767, 22.5, 0);
  const fire = projectCampfire(physical);
  for (const latitude of [-47, 0, 31.2989, 70]) {
    for (const offset of [1e3, 2 * 3600e3, 11 * 3600e3]) {
      const rotated = cameraAtOffset(physical, latitude, offset);
      const zenith = zenithAtOffset(latitude, offset);
      near(dot(zenith, rotated.right), 0);
      const celestialHorizon = rotated.height * rotated.centerYFraction +
        rotated.scale * dot(zenith, rotated.forward) / dot(zenith, rotated.up);
      near(celestialHorizon, horizonScreenY(physical));
      assert.deepEqual(projectCampfire(physical), fire);
    }
  }
  assert.notDeepEqual(projectCampfire(cameraAtOffset(physical, 31.2989, 2 * 3600e3)), fire);
});

test('portrait and wide presets keep the fire above the controls with most of the frame as sky', () => {
  assert.equal(LOOK_UP_DEFAULT_ALTITUDE, 35);
  for (const [width, height] of [[390, 703], [320, 400], [1280, 575], [1280, 767], [844, 249], [1920, 947], [2560, 650]]) {
    const altitude = presetAltitude(width, height);
    const camera = cameraFor(width, height, altitude);
    const fire = projectCampfire(camera);
    const horizon = horizonScreenY(camera);
    assert.ok(altitude >= 0 && altitude <= 35, `${width}×${height}: bounded preset`);
    const clearance = width < 640 ? 56 : 24;
    assert.ok(fire.visible && fire.y <= height - clearance + 1e-8, `${width}×${height}: foot clearance`);
    assert.ok(fire.y - 108 * fire.scale >= 0, `${width}×${height}: complete fire`);
    assert.ok(horizon >= height / 2 && horizon < height, `${width}×${height}: sky and ground both visible`);
    assert.ok((height - horizon) / height < (height >= 575 ? 0.12 : 0.18), `${width}×${height}: compact ground strip`);
  }
  assert.ok(presetAltitude(390, 703) > 30);
  assert.ok(presetAltitude(2560, 650) < presetAltitude(1280, 767));
  assert.equal(presetAltitude(1920, 100), 0);
});

test('low views hide underground stars from drawing and named hit targets while daylight stays at forty percent', () => {
  assert.equal(SKY_DAYTIME_VISIBILITY, 0.4);
  const catalog = getCatalog();
  const named = ['Betelgeuse', 'Rigel', 'Sirius'].map(name => catalog.find(star => star.name === name));
  assert.ok(named.every(Boolean));
  const stars = named.map((star, index) => ({
    ...star, mag: 2, altitude: [40, 0, -1][index], azimuth: [-12, 12, 0][index],
  }));
  const snapshot = { stars, visibility: 1, twilight: 1,
    pollution: { limitingMagnitude: 6, bortleApprox: 2, lightProxy: 0, source: 'override' } };
  for (const [width, height] of [[1280, 650], [390, 703]]) {
    const camera = cameraFor(width, height, 20);
    const horizonY = horizonScreenY(camera);
    const style = { isDark: true, mobile: width < 640, presentation: 'look-up', horizonY };
    const unmasked = projectSkyStars(snapshot, camera, { ...style, horizonY: undefined });
    assert.equal(unmasked.length, 3, 'the refracted underground fixture is inside the camera frame');
    const night = projectSkyStars(snapshot, camera, style);
    assert.deepEqual(night.map(entry => entry.star.id), stars.slice(0, 2).map(star => star.id));
    assert.ok(night.every(entry => entry.point.y <= horizonY));
    const namedTargets = interactiveStars(night, camera);
    assert.equal(namedTargets.length, 2);
    assert.ok(namedTargets.every(entry => entry.point.y <= horizonY));
    const underground = unmasked.find(entry => entry.star.id === stars[2].id);
    assert.equal(hitTestStar(namedTargets, underground.point.x, underground.point.y, 28), null);
    const arcs = [];
    const ctx = { clearRect() {}, beginPath() {}, fill() {}, arc(x, y) { arcs.push({ x, y }); } };
    assert.deepEqual(drawSky(ctx, snapshot, camera, style), night);
    assert.equal(arcs.length, 2);
    assert.ok(arcs.every(point => point.y <= horizonY));
    const day = projectSkyStars({ ...snapshot, visibility: SKY_DAYTIME_VISIBILITY, twilight: 0 }, camera, style);
    assert.deepEqual(day.map(entry => entry.star.id), night.map(entry => entry.star.id));
    day.forEach((entry, index) => { assert.ok(entry.alpha > 0); near(entry.alpha / night[index].alpha, 0.4); });
  }
});

test('the homepage star window ignores the Look Up ground boundary', () => {
  const star = getCatalog().find(entry => entry.name === 'Betelgeuse');
  const snapshot = { stars: [{ ...star, altitude: 60, azimuth: 180 }], visibility: 1, twilight: 1,
    pollution: { limitingMagnitude: 6, bortleApprox: 2, lightProxy: 0, source: 'override' } };
  for (const [width, height] of [[1280, 650], [390, 703]]) {
    const camera = createCamera(width, height, SKY_VIEW, width < 640 ? SKY_CENTER_Y.mobile : SKY_CENTER_Y.desktop);
    const style = { isDark: true, mobile: width < 640, presentation: 'background' };
    const home = projectSkyStars(snapshot, camera, style);
    assert.ok(home.length > 0);
    assert.deepEqual(projectSkyStars(snapshot, camera, { ...style, horizonY: 0 }), home);
  }
});

test('a full-sky setting trail reaches the horizon and ends at the ground edge', () => {
  const camera = cameraFor(1280, 650, 20, 270), horizonY = horizonScreenY(camera);
  const star = { ...getCatalog().find(entry => entry.name === 'Sirius'), mag: 2, altitude: 0.1, azimuth: 270 };
  const buffer = new TrailBuffer();
  buffer.begin({ date: new Date(0), observer: { latitude: 31.2989, longitude: 121.5035 }, celestialStars: [star] }, 0);
  buffer.push(600000, 1);
  const previousPath = global.Path2D, segments = [];
  global.Path2D = class {
    moveTo(x, y) { this.from = { x, y }; }
    lineTo(x, y) { segments.push({ from: this.from, to: { x, y } }); }
  };
  try {
    buffer.draw({ canvas: { width: camera.width, height: camera.height }, clearRect() {}, stroke() {} }, { isDark: true, camera });
    assert.ok(segments.some(({ from, to }) => from.y < horizonY && Math.abs(to.y - horizonY) < 1e-6),
      'a setting arc ends exactly at the horizon');
    assert.ok(segments.every(({ from, to }) => from.y <= horizonY + 1e-6 && to.y <= horizonY + 1e-6));
  } finally { global.Path2D = previousPath; }
});
