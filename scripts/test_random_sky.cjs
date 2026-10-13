const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { Body } = require('astronomy-engine');

require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(outputText, filename);
};
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.resolve(__dirname, '../src', request.slice(2)) : request, ...args);
};

const { DARK_SKY_DESTINATIONS } = require('../src/lib/sky/destinations.ts');
const { computeSky, getBodyAltitude } = require('../src/lib/sky/astro.ts');
const { DEFAULT_OBSERVER } = require('../src/lib/sky/constants.ts');
const { readOverrides } = require('../src/lib/sky/observer.ts');
const { destinationObserver, destinationPollution, nightDestinations, selectRandomSky,
  findNightPreviewTime, readSkyPreview } = require('../src/lib/sky/random-sky.ts');

test('the supplied 15 coordinate lookups retain stable identities and atlas provenance', () => {
  assert.equal(DARK_SKY_DESTINATIONS.length, 15);
  assert.equal(new Set(DARK_SKY_DESTINATIONS.map(site => site.id)).size, 15);
  assert.equal(DARK_SKY_DESTINATIONS.find(site => site.id === 'steens').latitude, 42.59753);
  assert.equal(DARK_SKY_DESTINATIONS.find(site => site.id === 'namibrand').longitude, 16.06038);
  assert.equal(DARK_SKY_DESTINATIONS.find(site => site.id === 'chatham').longitude, -176.55);
  for (const site of DARK_SKY_DESTINATIONS) {
    assert.ok(site.chineseName && site.chineseDescription && site.country && site.englishName);
  }
  assert.equal(destinationPollution().source, 'atlas-2025');
  assert.equal(destinationPollution().datasetYear, 2025);
  assert.equal(destinationPollution().bortleApprox, 1);
});

test('real-time choices stay below -18°, avoid repeatable alternatives, and prefer a Moon below the horizon', () => {
  for (const monthDay of ['03-20', '06-21', '09-22', '12-21']) {
    for (let hour = 0; hour < 24; hour++) {
      const date = new Date(`2026-${monthDay}T${String(hour).padStart(2, '0')}:00:00Z`);
      const eligible = nightDestinations(date);
      assert.ok(eligible.length, date.toISOString());
      const previous = eligible[0].destination.id;
      const alternatives = eligible.filter(site => site.destination.id !== previous);
      for (const rng of [() => 0, () => 0.999]) {
        const selected = selectRandomSky(date, previous, rng);
        assert.ok(selected.sunAltitude < -18);
        if (alternatives.length) assert.notEqual(selected.destination.id, previous);
        const pool = alternatives.length ? alternatives : eligible;
        if (pool.some(site => site.moonAltitude < 0)) assert.ok(selected.moonAltitude < 0);
      }
      const one = selectRandomSky(date, previous, () => 0, [eligible[0].destination]);
      assert.equal(one.destination.id, previous);
      const daylight = DARK_SKY_DESTINATIONS.filter(site => getBodyAltitude(Body.Sun, date, site) >= -18);
      assert.equal(selectRandomSky(date, undefined, Math.random, daylight), null);
    }
  }
});

test('every destination has a true night preview at both solstices and equinoxes, including across the date line', () => {
  for (const utc of ['2026-03-20T00:01:00Z', '2026-06-21T23:59:00Z', '2026-09-22T12:00:00Z', '2026-12-21T00:00:00Z']) {
    const reference = new Date(utc);
    for (const site of DARK_SKY_DESTINATIONS) {
      const date = findNightPreviewTime(site, reference);
      assert.ok(date, site.id);
      assert.equal(date.toISOString().slice(0, 10), reference.toISOString().slice(0, 10));
      const sky = computeSky(date, destinationObserver(site), destinationPollution());
      assert.ok(sky.sunAltitude < -18, `${site.id}: ${sky.sunAltitude}`);
      assert.equal(sky.visibility, 1);
      assert.ok(sky.stars.length > 500, site.id);
    }
  }
});

test('preview URLs resolve each ID and details flag; random stays live and legacy parameters still parse', () => {
  for (const site of DARK_SKY_DESTINATIONS) {
    const preview = readSkyPreview(`skyPreview=${site.id}&skyNight=1&skyDetails=1`);
    assert.equal(preview.kind, 'destination');
    assert.equal(preview.destination.id, site.id);
    assert.equal(preview.night, true);
    assert.equal(preview.details, true);
    assert.equal(readSkyPreview(`skyPreview=${site.id}`).night, false);
  }
  assert.deepEqual(readSkyPreview('skyPreview=random&skyNight=1'), { kind: 'random', details: false });
  assert.deepEqual(readSkyPreview('skyPreview=fudan'), { kind: 'fudan', details: false });
  assert.equal(readSkyPreview('skyPreview=unknown&skyNight=1'), null);
  assert.equal(readSkyPreview(''), null);
  const legacy = readOverrides('lat=-25&lon=16&skyUtc=2026-10-14T20:00:00Z&bortle=3');
  assert.equal(legacy.observer.latitude, -25);
  assert.equal(legacy.date.toISOString(), '2026-10-14T20:00:00.000Z');
  assert.equal(legacy.pollution.bortleApprox, 3);
});

test('store transitions restore Fudan, close details, leave preview time for real-time random, and reject late location results', async () => {
  const pollutionModule = require('../src/lib/sky/lightPollution.ts');
  const fudanPollution = { ...pollutionModule.FUDAN_FALLBACK };
  pollutionModule.getLightPollution = async () => fudanPollution;
  const stored = new Map();
  global.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  const { useSkyStore } = require('../src/lib/stores/skyStore.ts');
  await useSkyStore.getState().initialize('skyPreview=namibrand&skyNight=1&skyDetails=1');
  let state = useSkyStore.getState();
  assert.equal(state.destination.id, 'namibrand');
  assert.equal(state.detailsOpen, true);
  assert.equal(state.nightPreview, true);
  assert.ok(state.dateOverride !== null);
  state.randomSky();
  state = useSkyStore.getState();
  assert.notEqual(state.destination.id, 'namibrand');
  assert.equal(state.detailsOpen, false);
  assert.equal(state.nightPreview, false);
  assert.equal(state.dateOverride, null);
  assert.ok(getBodyAltitude(Body.Sun, new Date(), state.observer) < -18);
  await state.resetSky();
  state = useSkyStore.getState();
  assert.deepEqual(state.observer, DEFAULT_OBSERVER);
  assert.equal(state.destination, null);
  assert.equal(state.dateOverride, null);
  assert.equal(state.pollution, fudanPollution);
  await state.initialize('skyPreview=fudan&skyDetails=1');
  assert.equal(useSkyStore.getState().detailsOpen, true);

  let finishLookup;
  pollutionModule.getLightPollution = () => new Promise(resolve => { finishLookup = resolve; });
  const pending = useSkyStore.getState().resetSky();
  useSkyStore.getState().randomSky();
  const selected = useSkyStore.getState().destination.id;
  finishLookup(fudanPollution);
  await pending;
  assert.equal(useSkyStore.getState().destination.id, selected);
  assert.equal(useSkyStore.getState().observer.source, 'random');
  assert.equal(useSkyStore.getState().pollution.source, 'atlas-2025');
});
