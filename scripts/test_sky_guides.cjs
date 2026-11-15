const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { Horizon, Observer } = require('astronomy-engine');

require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const { createSkyGuides, drawSkyGuides } = require('../src/lib/sky/guides.ts');
const { createCamera, project } = require('../src/lib/sky/projection.ts');
const { cameraAtOffset, zenithAtOffset } = require('../src/lib/sky/star-trails.ts');
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);
const view = (azimuth, centerAltitude = 40, width = 1280, height = 650) =>
  createCamera(width, height, { azimuth, centerAltitude, horizontalFov: 100 });
const date = new Date('2026-01-15T13:00:00Z');
const observer = { latitude: 31.2989, longitude: 121.5035 };
const endpoints = line => line.segments.flatMap(({ from, to }) => [from, to]);
const nearest = (points, expected) => Math.min(...points.map(point => Math.hypot(point.x - expected.x, point.y - expected.y)));

test('meridians converge at the visible celestial pole in each hemisphere', () => {
  for (const [latitude, azimuth, dec] of [[31.2989, 0, 90], [-32.4, 180, -90]]) {
    const camera = view(azimuth);
    const { lines } = createSkyGuides(date, { ...observer, latitude }, camera);
    const horizontal = Horizon(date, new Observer(latitude, observer.longitude, 10), 0, dec, 'normal');
    const expected = project(horizontal.altitude, horizontal.azimuth, camera);
    for (const line of lines.filter(line => line.kind === 'ra')) {
      near(nearest(endpoints(line), expected), 0, 1e-7);
    }
  }
});

test('an equatorial observer sees refracted meridian convergence near the horizon', () => {
  for (const [azimuth, dec] of [[0, 90], [180, -90]]) {
    const camera = view(azimuth, 0);
    const { lines } = createSkyGuides(date, { ...observer, latitude: 0 }, camera);
    const horizontal = Horizon(date, new Observer(0, observer.longitude, 10), 0, dec, 'normal');
    const expected = project(horizontal.altitude, horizontal.azimuth, camera);
    for (const line of lines.filter(line => line.kind === 'ra')) near(nearest(endpoints(line), expected), 0, 1e-7);
  }
});

test('grid intersections match independent astronomy-engine Horizon coordinates', () => {
  let checked = 0;
  for (const latitude of [-43.9, 0, 31.2989]) {
    const place = { ...observer, latitude };
    const location = new Observer(latitude, observer.longitude, 10);
    for (const azimuth of [0, 90, 180, 270]) {
      const camera = view(azimuth);
      const { lines } = createSkyGuides(date, place, camera);
      for (const ra of [0, 4, 8, 12, 16, 20]) {
        for (const dec of [-60, -30, 0, 30, 60]) {
          const horizontal = Horizon(date, location, ra, dec, 'normal');
          const expected = project(horizontal.altitude, horizontal.azimuth, camera);
          if (horizontal.altitude < 1 || !expected || expected.x < 1 || expected.x > camera.width - 1 ||
              expected.y < 1 || expected.y > camera.height - 1) continue;
          const raLine = lines.find(line => line.kind === 'ra' && line.value === ra);
          const decLine = lines.find(line => line.kind === 'dec' && line.value === dec);
          near(nearest(endpoints(raLine), expected), 0, 1e-7);
          near(nearest(endpoints(decLine), expected), 0, 1e-7);
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked >= 25, `checked ${checked} visible intersections`);
});

test('the grid clips to the live horizon and camera frame during time travel', () => {
  for (const latitude of [-90, -43.9, 0, 31.2989, 90]) {
    for (const azimuth of [0, 90, 180, 270]) {
      const baseCamera = view(azimuth, 47.5, 320, 580);
      for (const offset of [0, 6 * 3600e3]) {
        const camera = cameraAtOffset(baseCamera, latitude, offset);
        const horizon = zenithAtOffset(latitude, offset);
        const { lines } = createSkyGuides(date, { ...observer, latitude }, camera, horizon);
        for (const line of lines) {
          for (const point of endpoints(line)) {
            assert.ok(point.x >= 0 && point.x <= camera.width && point.y >= 0 && point.y <= camera.height);
            const x = (point.x - camera.width / 2) / camera.scale;
            const y = (camera.height * camera.centerYFraction - point.y) / camera.scale;
            const direction = camera.forward.map((value, i) => value + x * camera.right[i] + y * camera.up[i]);
            assert.ok(direction.reduce((sum, value, i) => sum + value * horizon[i], 0) >= -1e-8);
          }
        }
      }
    }
  }
});

test('time-rotated grid intersections agree with the new date and reveal newly risen coordinates', () => {
  const offset = 3 * 3600e3;
  const later = new Date(date.getTime() + offset);
  const location = new Observer(observer.latitude, observer.longitude, 10);
  let checked = 0;
  let rose = 0;
  for (const azimuth of [0, 90, 180, 270]) {
    const baseCamera = view(azimuth);
    const camera = cameraAtOffset(baseCamera, observer.latitude, offset);
    const { lines } = createSkyGuides(date, observer, camera, zenithAtOffset(observer.latitude, offset));
    for (const ra of [0, 4, 8, 12, 16, 20]) {
      for (const dec of [-60, -30, 0, 30, 60]) {
        const first = Horizon(date, location, ra, dec, 'normal');
        const next = Horizon(later, location, ra, dec, 'normal');
        const expected = project(next.altitude, next.azimuth, baseCamera);
        if (!expected || expected.x < 1 || expected.x > baseCamera.width - 1 ||
            expected.y < 1 || expected.y > baseCamera.height - 1 || next.altitude < 10) continue;
        const line = lines.find(line => line.kind === 'ra' && line.value === ra);
        const rigid = project(first.altitude, first.azimuth, camera);
        near(nearest(endpoints(line), rigid), 0, 1e-7);
        if (first.altitude > 25 && next.altitude > 25) {
          assert.ok(Math.hypot(rigid.x - expected.x, rigid.y - expected.y) < 2.5);
          checked += 1;
        }
        if (first.altitude < -5) rose += 1;
      }
    }
  }
  assert.ok(checked >= 3, `compared ${checked} high grid intersections`);
  assert.ok(rose >= 1, `revealed ${rose} newly risen grid intersections`);
});

test('canvas drawing renders only grid lines and restores its drawing state', () => {
  let saved = 0;
  let restored = 0;
  const ctx = {
    clearRect() {}, save() { saved += 1; }, restore() { restored += 1; },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    arc() { assert.fail('the grid uses meridian intersections without pole markers'); },
    fillText() { assert.fail('the grid has no numeric labels'); },
  };
  drawSkyGuides(ctx, date, observer, view(180), { isDark: true });
  assert.equal(saved, 1);
  assert.equal(restored, 1);
});
