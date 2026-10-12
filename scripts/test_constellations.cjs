const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }, fileName: filename,
  });module._compile(outputText, filename);
};
const { CONSTELLATIONS, constellationForHip, projectConstellation, readConstellationPreview } = require('../src/lib/sky/constellations.ts');
const { getCatalog } = require('../src/lib/sky/catalog.ts');
const { computeSky } = require('../src/lib/sky/astro.ts');
const { projectSkyStars } = require('../src/lib/sky/renderer.ts');
const { createLookUpCamera } = require('../src/lib/sky/look-up.ts');
const { project } = require('../src/lib/sky/projection.ts');
const { DEFAULT_OBSERVER } = require('../src/lib/sky/constants.ts');
const data = require('../public/data/constellation-lines.json');

test('five source graphs contain 68 unique real HIP segments and 67 catalogued endpoints',()=>{
  assert.deepEqual(CONSTELLATIONS.map(c=>c.name),['Orion','Scorpius','Cygnus','Cassiopeia','Ursa Major']);
  assert.deepEqual(CONSTELLATIONS.map(c=>c.lines.length),[24,12,9,4,19]);
  const hips=new Set(getCatalog().map(s=>s.hip));const endpoints=new Set();
  for(const c of CONSTELLATIONS){
    assert.equal(new Set(c.lines.map(l=>`${l.fromHip}-${l.toHip}`)).size,c.lines.length);
    for(const line of c.lines){assert.ok(line.fromHip<line.toHip);assert.ok(hips.has(line.fromHip));assert.ok(hips.has(line.toHip));endpoints.add(line.fromHip);endpoints.add(line.toHip);}
  }
  assert.equal(endpoints.size,67);assert.equal(data.license,'CC-BY-SA-4.0');assert.equal(data.author,"Stellarium's team");
  assert.ok(data.source.includes('d4a1322b6a81bf15dc4ef65c267b2fc846c5f3ca'));
  for(const [hip,id] of [[24436,'Ori'],[80763,'Sco'],[102098,'Cyg'],[3179,'Cas'],[54061,'UMa']])assert.equal(constellationForHip(hip).id,id);
  assert.equal(constellationForHip(32349),null);assert.equal(constellationForHip(null),null);
});
test('preview accepts only the two explicit levels; ordinary skies have no overlay',()=>{
  for(const v of [null,'','1','0','0.10','invalid'])assert.equal(readConstellationPreview(v),null);
  assert.equal(readConstellationPreview('0.08'),.08);assert.equal(readConstellationPreview('0.12'),.12);
});
test('every real endpoint reuses the current camera projection across locations, dates, magnitude limits and directions',()=>{
  let total=0;
  for(const utc of ['2026-01-15T13:00:00Z','2026-07-15T13:00:00Z'])for(const observer of [DEFAULT_OBSERVER,{...DEFAULT_OBSERVER,latitude:51.5,longitude:0}])for(const limit of [4.15,6.8])for(const facing of ['south','west','north','east'])for(const [width,height] of [[1440,780],[390,710]]){
    const snapshot=computeSky(new Date(utc),observer,{limitingMagnitude:limit,bortleApprox:2,lightProxy:0,source:'override'});
    const camera=createLookUpCamera(width,height,facing),rendered=projectSkyStars(snapshot,camera,{isDark:true,mobile:width<640,presentation:'look-up'});
    const before=JSON.stringify(rendered);
    for(const c of CONSTELLATIONS)for(const segment of projectConstellation(c,rendered,camera)){
      total++;
      for(const [hip,point] of [[segment.fromHip,segment.from],[segment.toHip,segment.to]]){
        const star=rendered.find(e=>e.star.hip===hip).star;
        assert.ok(star.altitude>=0&&star.mag<=limit);assert.deepEqual(point,project(star.altitude,star.azimuth,camera));
        assert.ok(point.x>=0&&point.x<=width&&point.y>=0&&point.y<=height);
      }
    }
    assert.equal(JSON.stringify(rendered),before);
  }
  assert.ok(total>100);
});
test('missing, below-horizon, out-of-frame and culled endpoints remove their segment without invented replacements',()=>{
  const c=CONSTELLATIONS[3],line=c.lines[0],camera=createLookUpCamera(1440,780);
  const from={star:{hip:line.fromHip,altitude:30,mag:1},point:{x:400,y:200},alpha:.5};
  const to={star:{hip:line.toHip,altitude:40,mag:2},point:{x:500,y:300},alpha:.4};
  assert.equal(projectConstellation(c,[from,to],camera).length,1);
  for(const entries of [[from],[from,{...to,star:{...to.star,altitude:-.1}}],[from,{...to,point:{x:1500,y:300}}],[from,{...to,point:{x:500,y:-1}}],[]])assert.deepEqual(projectConstellation(c,entries,camera),[]);
});
