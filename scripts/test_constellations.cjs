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
test('ordinary skies enable 0.12 interaction; explicit preview levels remain available',()=>{
  assert.equal(readConstellationPreview(null),.12);
  for(const v of ['','1','0','0.10','invalid'])assert.equal(readConstellationPreview(v),null);
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

const { CONSTELLATION_NAMES } = require('../src/lib/sky/constellation-names.ts');
const { placeConstellationLabel, rectsOverlap, CONSTELLATION_LABEL_GAP } = require('../src/lib/sky/constellation-label.ts');

test('all 88 Chinese names match the exact IAU/Stellarium ID and Latin name pairs',()=>{
  assert.equal(Object.keys(CONSTELLATION_NAMES).length,88);
  assert.deepEqual(Object.keys(CONSTELLATION_NAMES).sort(),CONSTELLATIONS.map(c=>c.id).sort());
  assert.equal(new Set(Object.values(CONSTELLATION_NAMES).map(n=>n.chinese)).size,88);
  for(const c of CONSTELLATIONS){const name=CONSTELLATION_NAMES[c.id];assert.equal(name.english,c.name);assert.equal(name.chinese,name.chinese.trim());assert.ok(name.chinese.endsWith('座'));}
  for(const [id,chinese] of Object.entries({Ori:'猎户座',Sco:'天蝎座',Cyg:'天鹅座',Cas:'仙后座',UMa:'大熊座',UMi:'小熊座',CMa:'大犬座',CMi:'小犬座',CrB:'北冕座',CrA:'南冕座'}))assert.equal(CONSTELLATION_NAMES[id].chinese,chinese);
});
const labelSegments=[{fromHip:1,toHip:2,from:{x:160,y:140},to:{x:260,y:250}},{fromHip:2,toHip:3,from:{x:260,y:250},to:{x:340,y:180}}];
const labelViewport={x:0,y:0,width:600,height:450};
test('constellation name placement avoids measured long/short star-label rectangles with ten-pixel clearance',()=>{
  const obstacles=[{x:180,y:140,width:130,height:45},{x:330,y:240,width:55,height:45}];
  for(const width of [40,95,160]){
    const size={width,height:31},position=placeConstellationLabel({segments:labelSegments,size,viewport:labelViewport,obstacles});assert.ok(position);
    assert.ok(obstacles.every(r=>!rectsOverlap({...position,...size},r,CONSTELLATION_LABEL_GAP)));
    assert.ok(position.x>=12&&position.y>=12&&position.x+width<=588&&position.y+31<=438);
  }
});
test('constellation name stays stable until a new obstacle requires relocation',()=>{
  const size={width:80,height:31},first=placeConstellationLabel({segments:labelSegments,size,viewport:labelViewport,obstacles:[]});assert.ok(first);
  assert.deepEqual(placeConstellationLabel({segments:labelSegments,size,viewport:labelViewport,obstacles:[],previous:first}),first);
  const obstacle={...first,...size};const next=placeConstellationLabel({segments:labelSegments,size,viewport:labelViewport,obstacles:[obstacle],previous:first});assert.ok(next);assert.ok(!rectsOverlap({...next,...size},obstacle,10));
});
test('no space or no visible geometry hides the name instead of moving star labels or leaving the viewport',()=>{
  assert.equal(placeConstellationLabel({segments:labelSegments,size:{width:80,height:31},viewport:labelViewport,obstacles:[labelViewport]}),null);
  assert.equal(placeConstellationLabel({segments:[],size:{width:80,height:31},viewport:labelViewport,obstacles:[]}),null);
  assert.equal(placeConstellationLabel({segments:labelSegments,size:{width:700,height:31},viewport:labelViewport,obstacles:[]}),null);
});

const { selectConstellationLabel } = require('../src/lib/sky/constellations.ts');
test('label selection falls back to a visible pinned figure when the latest figure is clipped out',()=>{
  const rigel=getCatalog().find(s=>s.hip===24436).id,sirius=getCatalog().find(s=>s.hip===32349).id;
  assert.equal(selectConstellationLabel(null,[rigel,sirius],['Ori','CMa'],['Ori']),'Ori');
  assert.equal(selectConstellationLabel('Ori',[rigel,sirius],['Ori','CMa'],['Ori','CMa']),'Ori');
  assert.equal(selectConstellationLabel(null,[sirius],['Ori','CMa'],['Ori']),'Ori');
  assert.equal(selectConstellationLabel(null,[],[],[]),null);
});
test('elongated constellation labels follow the explored visible segment, not the distant global centroid',()=>{
  const segments=[{fromHip:1,toHip:2,from:{x:80,y:140},to:{x:150,y:180}},
    {fromHip:3,toHip:4,from:{x:500,y:200},to:{x:650,y:200}}];
  const size={width:80,height:31},anchor={x:80,y:140};
  const point=placeConstellationLabel({segments,size,viewport:{x:0,y:0,width:800,height:500},obstacles:[],anchor});assert.ok(point);
  assert.ok(Math.hypot(point.x+40-anchor.x,point.y+15.5-anchor.y)<80);
  const blocked={...point,...size};const next=placeConstellationLabel({segments,size,viewport:{x:0,y:0,width:800,height:500},obstacles:[blocked],anchor,previous:point});assert.ok(next);assert.ok(!rectsOverlap({...next,...size},blocked,10));
});

test('visible isolated members retain a nearby name when light pollution removes their connecting segment',()=>{
  const segments=[{fromHip:1,toHip:2,from:{x:500,y:200},to:{x:650,y:200}}],anchor={x:80,y:140},size={width:80,height:31};
  const point=placeConstellationLabel({segments,size,viewport:{x:0,y:0,width:800,height:500},obstacles:[],anchor});assert.ok(point);
  assert.ok(Math.hypot(point.x+40-anchor.x,point.y+15.5-anchor.y)<80);
});
