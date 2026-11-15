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

const {
  createCamera, horizonToVector, project, projectSkySegment,
  unprojectSkyPoint, projectSkyDirection, projectSkyDirectionSegment,
} = require('../src/lib/sky/projection.ts');
const { cameraAtOffset, poleAxis, SIDEREAL_DAY_MS } = require('../src/lib/sky/star-trails.ts');
const { computeSky } = require('../src/lib/sky/astro.ts');
const { DEFAULT_OBSERVER } = require('../src/lib/sky/constants.ts');
const { createLookUpCamera } = require('../src/lib/sky/look-up.ts');
const { createTrailOrbit, trailOrbitDirection, createTrailProjector, createTrailIndex } = require('../src/lib/sky/trail-geometry.ts');
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));

test('screen directions round-trip through every supported camera pose and frame centre', () => {
  for (const [width, height] of [[1280, 767], [390, 703], [844, 249]]) {
    for (const azimuth of [0, 37, 180, 359]) {
      for (const centerAltitude of [0, 35, 80, 90]) {
        for (const centerY of [0.3, 0.5]) {
          const camera = createCamera(width, height, { azimuth, centerAltitude, horizontalFov: 100 }, centerY);
          for (const point of [{ x: 0, y: 0 }, { x: width, y: height },
            { x: width / 2, y: height * centerY }, { x: -50, y: height + 100 }]) {
            const direction = unprojectSkyPoint(point, camera);
            near(Math.hypot(...direction), 1);
            const restored = projectSkyDirection(direction, camera);
            assert.ok(restored);
            near(restored.x, point.x); near(restored.y, point.y);
          }
        }
      }
    }
  }
});

test('physical-camera directions preserve a real two-hour stellar arc through a new view', () => {
  const start = Date.parse('2026-01-15T13:00:00Z');
  const pollution = { limitingMagnitude: 6.5, bortleApprox: 2, lightProxy: 0, source: 'override' };
  const first = computeSky(new Date(start), DEFAULT_OBSERVER, pollution);
  const capture = createCamera(1280, 767, { azimuth: 180, centerAltitude: 47.5, horizontalFov: 100 });
  const target = createCamera(1280, 767, { azimuth: 200, centerAltitude: 42, horizontalFov: 100 });
  const inside = (point, margin = 20) => point && point.x > margin && point.x < 1280 - margin && point.y > margin && point.y < 767 - margin;
  const arcs = new Map();
  let checked = 0;
  for (const offset of [0, 30 * 60e3, 60 * 60e3, 90 * 60e3, 120 * 60e3]) {
    const later = computeSky(new Date(start + offset), DEFAULT_OBSERVER, pollution);
    const laterById = new Map(later.stars.map(star => [star.id, star]));
    const captureAtTime = cameraAtOffset(capture, DEFAULT_OBSERVER.latitude, offset);
    const targetAtTime = cameraAtOffset(target, DEFAULT_OBSERVER.latitude, offset);
    for (const star of first.celestialStars) {
      if (star.mag > 3) continue;
      const current = laterById.get(star.id);
      if (!current || current.altitude < 25) continue;
      const captured = project(star.altitude, star.azimuth, captureAtTime);
      const expected = project(star.altitude, star.azimuth, targetAtTime);
      const fresh = project(current.altitude, current.azimuth, target);
      if (!inside(captured) || !inside(expected) || !inside(fresh)) continue;
      const direction = unprojectSkyPoint(captured, capture);
      const moved = projectSkyDirection(direction, target);
      assert.ok(moved);
      near(moved.x, expected.x); near(moved.y, expected.y);
      near(moved.x, fresh.x, 2.5); near(moved.y, fresh.y, 2.5);
      const entry = { direction, moved, collapsed: unprojectSkyPoint(captured, captureAtTime) };
      if (!arcs.has(star.id)) arcs.set(star.id, []);
      arcs.get(star.id).push(entry);
      checked++;
    }
  }
  assert.ok(checked >= 25 && arcs.size >= 5, `${checked} comparisons across ${arcs.size} real stars`);
  const arc = [...arcs.values()].find(points => points.length >= 3 && distance(points[0].direction, points.at(-1).direction) > 0.1);
  assert.ok(arc, 'one real star retains a moving arc rather than a single old-epoch direction');
  for (const point of arc) near(distance(point.collapsed, arc[0].collapsed), 0);
  const segment = projectSkyDirectionSegment(arc[0].direction, arc[1].direction, target);
  assert.ok(segment);
  near(segment.from.x, arc[0].moved.x); near(segment.from.y, arc[0].moved.y);
  near(segment.to.x, arc[1].moved.x); near(segment.to.y, arc[1].moved.y);
  for (const point of arc) {
    const restored = projectSkyDirection(point.direction, capture);
    near(distance(unprojectSkyPoint(restored, capture), point.direction), 0);
  }
});

test('direction points retain offscreen head positions and reject the near plane and back of the camera', () => {
  const camera = createCamera(800, 600, { azimuth: 0, centerAltitude: 90, horizontalFov: 100 });
  const outside = unprojectSkyPoint({ x: 1200, y: 300 }, camera);
  near(projectSkyDirection(outside, camera).x, 1200);
  assert.equal(projectSkyDirection(camera.forward.map(value => -value), camera), null);
  assert.equal(projectSkyDirection([Math.sqrt(1 - 0.02 ** 2), 0, 0.02], camera), null);
  assert.ok(projectSkyDirection([Math.sqrt(1 - 0.021 ** 2), 0, 0.021], camera).x > camera.width);
});

test('direction segments retain crossings with offscreen endpoints at all four edges', () => {
  const camera = createCamera(800, 600, { azimuth: 180, centerAltitude: 90, horizontalFov: 100 });
  const at = (x, y) => unprojectSkyPoint({ x, y }, camera);
  for (const [from, to, expectedFrom, expectedTo] of [
    [[100, 300], [-100, 300], [100, 300], [0, 300]],
    [[700, 300], [900, 300], [700, 300], [800, 300]],
    [[400, 100], [400, -100], [400, 100], [400, 0]],
    [[400, 500], [400, 700], [400, 500], [400, 600]],
    [[-100, 300], [900, 300], [0, 300], [800, 300]],
  ]) {
    const segment = projectSkyDirectionSegment(at(...from), at(...to), camera);
    assert.ok(segment);
    near(segment.from.x, expectedFrom[0]); near(segment.from.y, expectedFrom[1]);
    near(segment.to.x, expectedTo[0]); near(segment.to.y, expectedTo[1]);
  }
  assert.equal(projectSkyDirectionSegment(at(-100, 100), at(-100, 500), camera), null);
});

test('direction segments clip the local horizon and the camera front before perspective division', () => {
  const camera = createCamera(800, 600, { azimuth: 180, centerAltitude: 15, horizontalFov: 100 });
  const from = horizonToVector(20, 180), below = horizonToVector(-20, 180);
  const segment = projectSkyDirectionSegment(from, below, camera);
  const horizon = project(0, 180, camera);
  assert.ok(segment);
  near(segment.to.x, horizon.x); near(segment.to.y, horizon.y);
  assert.equal(projectSkyDirectionSegment(horizonToVector(-10, 170), below, camera), null);
  assert.equal(projectSkyDirectionSegment(horizonToVector(20, 0), horizonToVector(20, 30), camera), null);
  const acrossFront = projectSkyDirectionSegment(from, horizonToVector(20, 0), camera);
  assert.ok(acrossFront);
  near(acrossFront.to.y, 0);
  assert.ok([acrossFront.from, acrossFront.to].every(point => point.depth >= 0.02 && Number.isFinite(point.x) && Number.isFinite(point.y)));
});

test('the angular segment API keeps its custom horizon through the shared direction clipper', () => {
  const camera = createCamera(800, 600, { azimuth: 0, centerAltitude: 30, horizontalFov: 100 });
  const from = { altitude: 20, azimuth: -30 }, to = { altitude: 20, azimuth: 30 };
  const angular = projectSkySegment(from, to, camera);
  const vectors = projectSkyDirectionSegment(horizonToVector(from.altitude, from.azimuth), horizonToVector(to.altitude, to.azimuth), camera);
  assert.deepEqual(angular, vectors);
  const eastOnly = projectSkySegment(from, to, camera, [1, 0, 0]);
  assert.ok(eastOnly && eastOnly.from.x > angular.from.x);
  near(eastOnly.from.x, camera.width / 2);
  near(eastOnly.to.x, angular.to.x); near(eastOnly.to.y, angular.to.y);
});

test('trail reprojection APIs use no trigonometry in their hot path', () => {
  const camera = createCamera(800, 600, { azimuth: 0, centerAltitude: 60, horizontalFov: 100 });
  const from = unprojectSkyPoint({ x: 200, y: 200 }, camera);
  const to = unprojectSkyPoint({ x: 600, y: 300 }, camera);
  const functions = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2'];
  const original = functions.map(name => Math[name]);
  try {
    functions.forEach(name => { Math[name] = () => { throw new Error(`${name} in trail reprojection`); }; });
    near(distance(unprojectSkyPoint(projectSkyDirection(from, camera), camera), from), 0);
    const segment = projectSkyDirectionSegment(from, to, camera);
    assert.ok(segment);
    near(segment.from.x, 200); near(segment.to.x, 600);
  } finally {
    functions.forEach((name, i) => { Math[name] = original[i]; });
  }
});

const pointDistance = (point, segment) => {
  const dx = segment.to.x - segment.from.x, dy = segment.to.y - segment.from.y;
  const denominator = dx * dx + dy * dy;
  const blend = denominator ? Math.max(0, Math.min(1,
    ((point.x - segment.from.x) * dx + (point.y - segment.from.y) * dy) / denominator)) : 0;
  return Math.hypot(point.x - segment.from.x - blend * dx, point.y - segment.from.y - blend * dy);
};

test('parameterized orbits advance each local star in the same direction as the sidereal camera', () => {
  const direction = horizonToVector(35, 135);
  const camera = createCamera(1280, 767, { azimuth: 200, centerAltitude: 40, horizontalFov: 100 });
  for (const latitude of [-47, 0, 31.2989, 70, 90]) {
    const orbit = createTrailOrbit(direction, poleAxis(latitude));
    near(distance(trailOrbitDirection(orbit, 0), direction), 0);
    for (const angle of [0.03, 0.8, Math.PI, 4]) {
      const current = trailOrbitDirection(orbit, angle);
      near(Math.hypot(...current), 1);
      const expected = projectSkyDirection(direction, cameraAtOffset(camera, latitude, angle * SIDEREAL_DAY_MS / (2 * Math.PI)));
      const actual = projectSkyDirection(current, camera);
      if (!expected) assert.equal(actual, null);
      else { assert.ok(actual); near(actual.x, expected.x); near(actual.y, expected.y); }
    }
  }
});

test('whole-sky orbit projection keeps every visible fine sample within 0.18 pixels', t => {
  const from = 0.4, to = from + 2 * Math.PI * 600e3 / SIDEREAL_DAY_MS;
  let checked = 0, worst = 0;
  for (const latitude of [31.2989, -24.77]) {
    const observer = { ...DEFAULT_OBSERVER, latitude };
    const snapshot = computeSky(new Date('2026-01-15T13:00:00Z'), observer,
      { limitingMagnitude: 6.5, bortleApprox: 2, lightProxy: 0, source: 'override' });
    const orbits = snapshot.celestialStars.filter(star => star.mag <= 4).map(star =>
      createTrailOrbit(horizonToVector(star.altitude, star.azimuth), poleAxis(latitude)));
    for (const [width, height] of [[390, 703], [844, 249], [1920, 947]]) {
      for (const view of [{ azimuth: 0, altitude: 35 }, { azimuth: 90, altitude: 0 },
        { azimuth: 200, altitude: 55 }, { azimuth: 330, altitude: 85 }]) {
        const camera = createLookUpCamera(width, height, view), projector = createTrailProjector(camera);
        for (const orbit of orbits) {
          const lines = [];
          projector.appendCoordinates(orbit, from, to, (x1, y1, x2, y2) =>
            lines.push({ from: { x: x1, y: y1 }, to: { x: x2, y: y2 } }));
          for (const line of lines) for (const point of [line.from, line.to]) {
            assert.ok(point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height);
            assert.ok(unprojectSkyPoint(point, camera)[2] >= -1e-9);
          }
          for (let i = 0; i <= 60; i++) {
            const direction = trailOrbitDirection(orbit, from + (to - from) * i / 60);
            if (direction[2] < 0) continue;
            const point = projectSkyDirection(direction, camera);
            if (!point || point.x < 1 || point.x > width - 1 || point.y < 1 || point.y > height - 1) continue;
            assert.ok(lines.length > 0, 'a visible arc is never rejected by the orbit bound');
            const error = Math.min(...lines.map(line => pointDistance(point, line)));
            assert.ok(error <= 0.180001, `${width}×${height}: ${error}px orbit chord error`);
            worst = Math.max(worst, error); checked++;
          }
        }
      }
    }
  }
  assert.ok(checked > 10_000, `${checked} visible fine samples`);
  t.diagnostic(`${checked} fine samples in both hemispheres, portrait/landscape/desktop; max ${worst.toFixed(4)}px`);
});

test('long orbit intervals retain a visible crossing when both endpoints lie outside the frame', () => {
  const camera = createCamera(800, 600, { azimuth: 180, centerAltitude: 30, horizontalFov: 100 });
  const orbit = createTrailOrbit(horizonToVector(30, 90), poleAxis(90));
  const start = projectSkyDirection(trailOrbitDirection(orbit, 0), camera);
  const end = projectSkyDirection(trailOrbitDirection(orbit, Math.PI), camera);
  assert.ok(start.x < 0 && end.x > camera.width);
  const lines = [];
  createTrailProjector(camera).append(orbit, 0, Math.PI, (from, to) => lines.push({ from, to }));
  assert.ok(lines.length > 0);
  const middle = projectSkyDirection(trailOrbitDirection(orbit, Math.PI / 2), camera);
  assert.ok(Math.min(...lines.map(line => pointDistance(middle, line))) <= 0.2);
});

test('orbit geometry clips an actual rise at the local ground and shares angular samples between stars', () => {
  const camera = createCamera(800, 600, { azimuth: 90, centerAltitude: 0, horizontalFov: 100 });
  const orbit = createTrailOrbit(horizonToVector(-10, 90), poleAxis(0));
  const projector = createTrailProjector(camera), lines = [];
  const end = 20 * Math.PI / 180;
  projector.append(orbit, 0, end, (from, to) => lines.push({ from, to }));
  assert.ok(lines.length > 0);
  near(lines[0].from.y, 300);
  assert.ok(lines.every(line => line.from.y <= 300 + 1e-8 && line.to.y <= 300 + 1e-8));
  const other = createTrailOrbit(horizonToVector(-5, 90), poleAxis(0));
  const sin = Math.sin, cos = Math.cos;
  try {
    Math.sin = Math.cos = () => { throw new Error('repeated trig for the same exposure interval'); };
    let segments = 0;
    projector.append(other, 0, end, () => segments++);
    assert.ok(segments > 0);
  } finally { Math.sin = sin; Math.cos = cos; }
});

test('the world grid retains every visible real arc and exactly matches exhaustive geometry', t => {
  const snapshot = computeSky(new Date('2026-01-15T13:00:00Z'), DEFAULT_OBSERVER,
    { limitingMagnitude: 7.7, bortleApprox: 1, lightProxy: 0, source: 'override' });
  const orbits = snapshot.celestialStars.map(star =>
    createTrailOrbit(horizonToVector(star.altitude, star.azimuth), poleAxis(DEFAULT_OBSERVER.latitude)));
  let exhaustiveVisits = 0, indexedVisits = 0, visibleArcs = 0;
  for (const from of [0, 1.7, 3.9]) {
    const to = from + 2 * Math.PI * 600e3 / SIDEREAL_DAY_MS;
    const index = createTrailIndex(orbits, from, to);
    const members = [...index.values()].flatMap(indices => [...indices]);
    assert.equal(members.length, orbits.length);
    assert.equal(new Set(members).size, orbits.length);
    for (const [width, height] of [[320, 350], [844, 249], [1920, 947]]) {
      for (const view of [{ azimuth: 0, altitude: 0 }, { azimuth: 90, altitude: 35 },
        { azimuth: 180, altitude: 85 }, { azimuth: 359.9, altitude: 35 }, { azimuth: 37.5, altitude: 90 }]) {
        const projector = createTrailProjector(createLookUpCamera(width, height, view));
        const geometry = starIndex => {
          const lines = [];
          projector.append(orbits[starIndex], from, to, (a, b, connected) =>
            lines.push([a.x, a.y, b.x, b.y, !!connected]));
          return lines;
        };
        const exhaustive = new Map();
        for (let i = 0; i < orbits.length; i++) {
          const lines = geometry(i); exhaustiveVisits++;
          if (lines.length) exhaustive.set(i, lines);
        }
        const selected = new Map();
        for (const cell of projector.visibleCells) for (const i of index.get(cell) ?? []) {
          const lines = geometry(i); indexedVisits++;
          if (lines.length) selected.set(i, lines);
        }
        assert.deepEqual([...selected.keys()].sort((a, b) => a - b), [...exhaustive.keys()].sort((a, b) => a - b),
          'cell filtering never omits a visible star interval');
        for (const [i, lines] of exhaustive) assert.deepEqual(selected.get(i), lines,
          'indexed and exhaustive projection produce identical endpoints and continuity');
        visibleArcs += exhaustive.size;
      }
    }
  }
  assert.ok(visibleArcs > 10_000);
  assert.ok(indexedVisits < exhaustiveVisits / 2);
  t.diagnostic(`${visibleArcs} visible real arcs; ${indexedVisits}/${exhaustiveVisits} orbit visits; identical geometry`);
});

test('connected flags join continuous subsegments and restart after a true clip gap or a different star', () => {
  const camera = createLookUpCamera(1920, 947, { azimuth: 0, altitude: 35 });
  const orbit = createTrailOrbit(horizonToVector(40, 0), poleAxis(DEFAULT_OBSERVER.latitude));
  const projector = createTrailProjector(camera), lines = [];
  const end = 2 * Math.PI * 1200e3 / SIDEREAL_DAY_MS;
  const collect = (from, to, connected) => lines.push({ from, to, connected });
  projector.append(orbit, 0, end, collect);
  assert.ok(lines.length >= 2);
  assert.equal(lines[0].connected, false);
  assert.ok(lines.slice(1).every(line => line.connected === true));
  for (let i = 1; i < lines.length; i++) {
    near(lines[i].from.x, lines[i - 1].to.x); near(lines[i].from.y, lines[i - 1].to.y);
  }
  const previousLength = lines.length;
  projector.append(createTrailOrbit(horizonToVector(41, 1), poleAxis(DEFAULT_OBSERVER.latitude)), 0, end, collect);
  assert.equal(lines[previousLength].connected, false, 'a new star always starts a new subpath');

  const zenithCamera = createCamera(800, 600, { azimuth: 0, centerAltitude: 90, horizontalFov: 100 });
  const crossing = createTrailOrbit(horizonToVector(45, 90), poleAxis(90));
  const clipped = [];
  createTrailProjector(zenithCamera).append(crossing, 0, Math.PI,
    (from, to, connected) => clipped.push({ from, to, connected }));
  assert.equal(clipped.filter(line => !line.connected).length, 2, 'two visible islands retain their real offscreen gap');
  let gap = 0;
  for (let i = 1; i < clipped.length; i++) {
    const separation = Math.hypot(clipped[i].from.x - clipped[i - 1].to.x, clipped[i].from.y - clipped[i - 1].to.y);
    if (clipped[i].connected) near(separation, 0);
    else gap = Math.max(gap, separation);
  }
  assert.ok(gap > 20);
});

test('numeric orbit output exactly matches the object API through visible and clipped arcs', () => {
  const camera = createLookUpCamera(1920, 947, { azimuth: 0, altitude: 35 });
  const projector = createTrailProjector(camera);
  for (const [altitude, azimuth] of [[40, 0], [0, 48], [-1, 5], [65, 80], [45, 350]]) {
    const orbit = createTrailOrbit(horizonToVector(altitude, azimuth), poleAxis(DEFAULT_OBSERVER.latitude));
    const from = 0, to = 2 * Math.PI * 1200e3 / SIDEREAL_DAY_MS;
    const objects = [], coordinates = [];
    projector.append(orbit, from, to, (a, b, connected) => {
      assert.ok(a.depth >= 0.02 && b.depth >= 0.02);
      objects.push([a.x, a.y, b.x, b.y, connected]);
    });
    projector.appendCoordinates(orbit, from, to, (x1, y1, x2, y2, connected) =>
      coordinates.push([x1, y1, x2, y2, connected]));
    assert.deepEqual(coordinates, objects);
  }
});
