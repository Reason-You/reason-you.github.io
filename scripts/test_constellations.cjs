const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }, fileName: filename,
  });module._compile(outputText, filename);
};
const { CONSTELLATIONS, constellationForHip, constellationForStarId, constellationHitTargets, toggleConstellationSelection, projectConstellation, readConstellationPreview } = require('../src/lib/sky/constellations.ts');
const { getCatalog } = require('../src/lib/sky/catalog.ts');
const { computeSky } = require('../src/lib/sky/astro.ts');
const { projectSkyStars } = require('../src/lib/sky/renderer.ts');
const { createLookUpCamera, interactiveStars } = require('../src/lib/sky/look-up.ts');
const { project } = require('../src/lib/sky/projection.ts');
const { DEFAULT_OBSERVER } = require('../src/lib/sky/constants.ts');
const data = require('../public/data/constellation-lines.json');

test('88 source graphs contain 695 unique real HIP segments; missing catalog endpoints stay absent',()=>{
  assert.equal(CONSTELLATIONS.length,88);assert.equal(new Set(CONSTELLATIONS.map(c=>c.id)).size,88);
  assert.deepEqual(CONSTELLATIONS.slice(0,5).map(c=>c.name),['Orion','Scorpius','Cygnus','Cassiopeia','Ursa Major']);
  assert.deepEqual(CONSTELLATIONS.slice(0,5).map(c=>c.lines.length),[24,12,9,4,19]);
  assert.equal(CONSTELLATIONS.reduce((n,c)=>n+c.lines.length,0),695);
  const hips=new Set(getCatalog().map(s=>s.hip));const endpoints=new Set();
  for(const c of CONSTELLATIONS){
    assert.equal(new Set(c.lines.map(l=>`${l.fromHip}-${l.toHip}`)).size,c.lines.length);
    for(const line of c.lines){assert.ok(line.fromHip<line.toHip);endpoints.add(line.fromHip);endpoints.add(line.toHip);}
  }
  assert.equal(endpoints.size,710);assert.deepEqual([...endpoints].filter(hip=>!hips.has(hip)).sort((a,b)=>a-b),[30665,33165]);assert.equal(data.license,'CC-BY-SA-4.0');assert.equal(data.author,"Stellarium's team");
  assert.ok(data.source.includes('d4a1322b6a81bf15dc4ef65c267b2fc846c5f3ca'));
  for(const [hip,id] of [[24436,'Ori'],[80763,'Sco'],[102098,'Cyg'],[3179,'Cas'],[54061,'UMa']])assert.equal(constellationForHip(hip).id,id);
  assert.equal(constellationForHip(32349).id,'CMa');assert.equal(constellationForHip(null),null);
});
test('HYG membership covers all 8920 existing stars, including unnamed and non-vertex members',()=>{
  const membership=require('../public/data/constellation-membership.json');
  assert.equal(membership.version,'4.1');assert.equal(Object.keys(membership.constellations).length,88);
  const ids=Object.values(membership.constellations).flat();assert.equal(ids.length,8920);assert.equal(new Set(ids).size,8920);
  assert.deepEqual(ids.sort((a,b)=>a-b),getCatalog().map(s=>s.id).sort((a,b)=>a-b));
  for(const star of getCatalog())assert.ok(constellationForStarId(star.id));
  assert.equal(constellationForStarId(null),null);assert.equal(constellationForStarId(0),null);
  const snapshot=computeSky(new Date('2026-01-15T14:00:00Z'),DEFAULT_OBSERVER,{limitingMagnitude:4.146,bortleApprox:7.6,lightProxy:1,source:'viirs'});
  const camera=createLookUpCamera(1440,780),rendered=projectSkyStars(snapshot,camera,{isDark:true,mobile:false,presentation:'look-up'});
  const targets=constellationHitTargets(rendered,camera);assert.ok(targets.some(e=>e.star.mag>3));
  assert.ok(targets.some(e=>!constellationForStarId(e.star.id).lines.some(l=>l.fromHip===e.star.hip||l.toHip===e.star.hip)));
  for(const e of targets)assert.ok(rendered.includes(e)&&projectConstellation(constellationForStarId(e.star.id),rendered,camera).length>0);
});
test('click and keyboard targets require magnitude <= 3 and verified names',()=>{
  const camera=createLookUpCamera(1440,780);
  const named=getCatalog().find(s=>s.hip===24436);
  const unnamed=getCatalog().find(s=>s.hip===14328);
  assert.ok(unnamed.mag<=3&&!unnamed.name);
  const entry=star=>({star:{...star,altitude:45,azimuth:180},point:{x:400,y:200},alpha:1});
  const faint={...named,mag:3.5};
  const targets=interactiveStars([entry(named),entry(unnamed),entry(faint)],camera);
  assert.deepEqual(targets.map(e=>e.star.id),[named.id]);
});
test('clicked constellation figures accumulate without duplicates until the last name is removed',()=>{
  const id=hip=>getCatalog().find(star=>star.hip===hip).id;
  const rigel=id(24436),betelgeuse=id(27989),sirius=id(32349);
  let state={pinnedIds:[],constellationIds:[]};
  const toggle=starId=>{state=toggleConstellationSelection(state.pinnedIds,state.constellationIds,starId)};
  toggle(rigel);assert.deepEqual(state.constellationIds,['Ori']);
  toggle(betelgeuse);assert.deepEqual(state.constellationIds,['Ori']);assert.equal(state.pinnedIds.length,2);
  toggle(sirius);assert.deepEqual(state.constellationIds,['Ori','CMa']);
  toggle(rigel);toggle(betelgeuse);assert.deepEqual(state.pinnedIds,[sirius]);assert.deepEqual(state.constellationIds,['Ori','CMa']);
  toggle(sirius);assert.deepEqual(state,{pinnedIds:[],constellationIds:[]});
  toggle(sirius);assert.deepEqual(state.constellationIds,['CMa']);
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
