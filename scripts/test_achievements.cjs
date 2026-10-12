const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }, fileName: filename,
  });
  module._compile(outputText, filename);
};
const { ACHIEVEMENTS, ACHIEVEMENT_STORAGE_KEY, BURNT_EXCLUSIONS } = require('../src/lib/achievements/definitions.ts');
const { evaluateAchievements, canBurnMarshmallow, isBurntMarshmallow } = require('../src/lib/achievements/evaluate.ts');
const { campfireReducer, INITIAL_CAMPFIRE } = require('../src/lib/achievements/session.ts');
const { parseAchievementRecord, loadAchievementRecord, saveAchievementRecord, emptyAchievementRecord } = require('../src/lib/achievements/persistence.ts');
const { useAchievementStore } = require('../src/lib/stores/achievementStore.ts');

const milestones = [10,20,30,42,50,64,75,88,99,100];
const names = ['Cosmic Roaster','Still Hungry?','Ph.D. in Marshmallows','The Answer Was Marshmallows','Halfway to the End of the Universe','64-bit Sugar Rush','Three Quarters. Still Here?','88 Constellations, One Campfire','Just One More.','At the End of the Universe'];
const confirm = (state, facing='south', roll=.99) => {
  state=campfireReducer(state,{type:'roast',roll});
  state=campfireReducer(state,{type:'ready'});
  state=campfireReducer(state,{type:'eat',facing});
  return campfireReducer(state,{type:'confirm'});
};

test('the twelve stable discoveries preserve exact names and order, with no fortieth milestone',()=>{
  assert.equal(ACHIEVEMENTS.length,12);assert.equal(new Set(ACHIEVEMENTS.map(a=>a.id)).size,12);assert.equal(new Set(ACHIEVEMENTS.map(a=>a.icon)).size,12);
  assert.deepEqual(ACHIEVEMENTS.slice(0,10).map(a=>a.milestone),milestones);
  assert.deepEqual(ACHIEVEMENTS.slice(0,10).map(a=>a.name),names);
  assert.equal(ACHIEVEMENTS[10].name,'Four Skies, One Campfire');assert.equal(ACHIEVEMENTS[11].name,'A Little Too Close to the Sun');
  assert.ok(ACHIEVEMENTS.every((a,i)=>i===0||a.order>ACHIEVEMENTS[i-1].order));
});
test('only confirmed exact quantity milestones award; forty and counts above 100 stay quiet',()=>{
  const unlocked=[];
  for(let eaten=1;eaten<=125;eaten++){
    const ids=evaluateAchievements({eaten,directions:['south'],burnt:false},unlocked);
    assert.deepEqual(ids,milestones.includes(eaten)?[ACHIEVEMENTS[milestones.indexOf(eaten)].id]:[]);
    unlocked.push(...ids);
  }
  assert.equal(unlocked.length,10);
  assert.deepEqual(evaluateAchievements({eaten:10,directions:['south'],burnt:false},unlocked),[]);
});
test('the fifth and later roasts use an 8% draw, with all eleven exclusions',()=>{
  for(const number of [1,2,3,4,...BURNT_EXCLUSIONS])assert.equal(isBurntMarshmallow(number,0),false);
  assert.deepEqual([...BURNT_EXCLUSIONS].sort((a,b)=>a-b),[10,20,30,40,42,50,64,75,88,99,100]);
  for(const number of [5,6,9,39,41,101,120]){
    assert.equal(canBurnMarshmallow(number),true);assert.equal(isBurntMarshmallow(number,.079999),true);assert.equal(isBurntMarshmallow(number,.08),false);
  }
  assert.equal(Array.from({length:10000},(_,i)=>isBurntMarshmallow(5,i/10000)).filter(Boolean).length,800);
  assert.equal(isBurntMarshmallow(6,0,1),false);assert.equal(isBurntMarshmallow(9,0,4),false);assert.equal(isBurntMarshmallow(10,0,5),false);assert.equal(isBurntMarshmallow(11,0,6),true);
});
test('four confirmed directions are order-independent, deduplicated and lower priority than a quantity discovery',()=>{
  const event={eaten:42,directions:['east','north','south','west','east'],burnt:false};
  assert.deepEqual(evaluateAchievements(event,[]),['the-answer-was-marshmallows','four-skies-one-campfire']);
  assert.deepEqual(evaluateAchievements({...event,eaten:40},[]),['four-skies-one-campfire']);
  for(const missing of ['south','west','north','east'])assert.deepEqual(evaluateAchievements({...event,eaten:4,directions:event.directions.filter(d=>d!==missing)},[]),[]);
  assert.deepEqual(evaluateAchievements({...event,eaten:5,burnt:true},[]),['four-skies-one-campfire','a-little-too-close-to-the-sun']);
});
test('ready does not count; one completed bite uses the direction captured at its click',()=>{
  let s=campfireReducer(INITIAL_CAMPFIRE,{type:'toggle'});s=campfireReducer(s,{type:'enter'});s=campfireReducer(s,{type:'roast',roll:0});s=campfireReducer(s,{type:'ready'});
  assert.equal(s.eaten,0);assert.deepEqual(s.directions,[]);assert.equal(s.completion,null);
  s=campfireReducer(s,{type:'eat',facing:'west'});const duplicate=campfireReducer(s,{type:'eat',facing:'east'});assert.equal(duplicate,s);
  s=campfireReducer(s,{type:'confirm'});assert.equal(s.eaten,1);assert.deepEqual(s.directions,['west']);assert.deepEqual(s.completion,{eaten:1,directions:['west'],burnt:false});
  assert.equal(campfireReducer(s,{type:'confirm'}),s);
});
test('roast randomness is fixed for a whole lifecycle, and a second roasting action is ignored',()=>{
  let s={...INITIAL_CAMPFIRE,fireOn:true,phase:'entering',eaten:4};s=campfireReducer(s,{type:'roast',roll:0});assert.equal(s.burnt,true);
  assert.equal(campfireReducer(s,{type:'roast',roll:.99}),s);s=campfireReducer(s,{type:'ready'});s=campfireReducer(s,{type:'eat',facing:'east'});s=campfireReducer(s,{type:'confirm'});
  assert.equal(s.eaten,5);assert.equal(s.completion.burnt,true);s=campfireReducer(s,{type:'enter'});assert.equal(s.burnt,false);
});
test('extinguishing every active phase cancels unfinished bites and clears only the fire session',()=>{
  for(const phase of ['entering','roasting','ready','eating']){
    const s=campfireReducer({...INITIAL_CAMPFIRE,fireOn:true,phase,eaten:39,directions:['west','north'],burnt:true,biteFacing:'east'},{type:'toggle'});
    assert.equal(s.fireOn,false);assert.equal(s.eaten,39);assert.deepEqual(s.directions,[]);assert.equal(s.burnt,false);assert.equal(s.completion,null);
    assert.equal(campfireReducer(s,{type:'confirm'}),s);assert.equal(campfireReducer(s,{type:'ready'}),s);
    const relit=campfireReducer(s,{type:'toggle'});assert.equal(relit.phase,'idle');assert.equal(relit.eaten,39);
  }
});
test('counts accumulate across ignitions while four-direction progress starts fresh',()=>{
  let s=campfireReducer(INITIAL_CAMPFIRE,{type:'toggle'});s=campfireReducer(s,{type:'enter'});
  s=confirm(s,'south');s=campfireReducer(s,{type:'enter'});s=confirm(s,'west');
  s=campfireReducer(s,{type:'toggle'});assert.equal(s.eaten,2);assert.deepEqual(s.directions,[]);
  s=campfireReducer(s,{type:'toggle'});s=campfireReducer(s,{type:'enter'});s=confirm(s,'north');s=campfireReducer(s,{type:'enter'});s=confirm(s,'east');
  assert.equal(s.eaten,4);assert.deepEqual(s.directions,['north','east']);assert.deepEqual(evaluateAchievements(s.completion,[]),[]);
});

test('a full session through 120 counts exactly once per roast without adding later milestones',()=>{
  let s=campfireReducer(INITIAL_CAMPFIRE,{type:'toggle'});s=campfireReducer(s,{type:'enter'});const unlocked=[];
  for(let i=1;i<=120;i++){
    s=confirm(s);assert.equal(s.eaten,i);unlocked.push(...evaluateAchievements(s.completion,unlocked));
    assert.equal(campfireReducer(s,{type:'confirm'}),s);s=campfireReducer(s,{type:'enter'});
  }
  assert.deepEqual(unlocked,ACHIEVEMENTS.slice(0,10).map(a=>a.id));
});
test('versioned storage handles malformed JSON, unknown versions/IDs, and unavailable storage',()=>{
  const deny=()=>{throw new Error('storage disabled')};assert.deepEqual(loadAchievementRecord(deny),emptyAchievementRecord());assert.equal(saveAchievementRecord(emptyAchievementRecord(),deny),false);
  for(const text of ['{','null','[]','{"version":0,"unlocked":{"cosmic-roaster":"2026-01-15T13:00:00Z"}}'])assert.deepEqual(loadAchievementRecord(()=>({getItem:()=>text,setItem(){}})),emptyAchievementRecord());
  const parsed=parseAchievementRecord({version:1,unlocked:{'cosmic-roaster':'2026-01-15T13:00:00Z',unknown:'2026-01-15T14:00:00Z','still-hungry':'invalid'},recentId:'unknown'});
  assert.deepEqual(parsed,{version:1,unlocked:{'cosmic-roaster':'2026-01-15T13:00:00Z'},recentId:'cosmic-roaster'});
  let saved;const provider=()=>({getItem:key=>key===ACHIEVEMENT_STORAGE_KEY?saved:null,setItem:(key,value)=>{assert.equal(key,ACHIEVEMENT_STORAGE_KEY);saved=value}});
  assert.equal(saveAchievementRecord(parsed,provider),true);assert.deepEqual(loadAchievementRecord(provider),parsed);
});
test('permanent store awards once, tracks latest discovery, and remains usable when persistence fails',()=>{
  useAchievementStore.setState({record:emptyAchievementRecord(),hydrated:true});
  const event={eaten:10,directions:['south','west','north','east'],burnt:false};
  assert.deepEqual(useAchievementStore.getState().discover(event),['cosmic-roaster','four-skies-one-campfire']);
  const record=useAchievementStore.getState().record;assert.equal(record.recentId,'four-skies-one-campfire');assert.equal(Object.keys(record.unlocked).length,2);
  assert.deepEqual(useAchievementStore.getState().discover(event),[]);assert.equal(useAchievementStore.getState().record,record);
});
