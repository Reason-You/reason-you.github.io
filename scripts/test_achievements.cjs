const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,filename)=>{module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},fileName:filename}).outputText,filename)};
const {ACHIEVEMENTS,ACHIEVEMENT_STORAGE_KEY}=require('../src/lib/achievements/definitions.ts');
const {evaluateAchievements}=require('../src/lib/achievements/evaluate.ts');
const {SPECIAL_EXCLUSIONS,sampleMarshmallowOutcome,roastTimings}=require('../src/lib/achievements/marshmallow.ts');
const {campfireReducer,INITIAL_CAMPFIRE}=require('../src/lib/achievements/session.ts');
const {parseAchievementRecord,loadAchievementRecord,saveAchievementRecord,emptyAchievementRecord}=require('../src/lib/achievements/persistence.ts');
const {useAchievementStore}=require('../src/lib/stores/achievementStore.ts');
const {createMarshmallowMeteor,meteorPosition,meteorFrame}=require('../src/lib/sky/marshmallow-meteor.ts');
const {BACKGROUND_METEOR,meteorPhotometry}=require('../src/lib/sky/meteor-appearance.ts');
const taste='a-taste-of-the-stars',wish='make-a-wish-at-the-marshmallowids';
const milestones=[10,20,30,42,64,75,88,99,100];
const event=(eaten,outcome='normal',meteorReleased=false)=>({eaten,outcome,meteorReleased,origin:{x:720,y:700},directions:['south']});
const confirm=(s,facing='south',roll=.4)=>{s=campfireReducer(s,{type:'roast',roll});s=campfireReducer(s,{type:'ready'});s=campfireReducer(s,{type:'eat',facing,origin:{x:720,y:700}});return campfireReducer(s,{type:'confirm'})};

test('twelve discoveries: nine quantity milestones, exploration, starlight and Marshmallowids',()=>{
 assert.equal(ACHIEVEMENTS.length,12);assert.equal(new Set(ACHIEVEMENTS.map(a=>a.icon)).size,12);
 assert.deepEqual(ACHIEVEMENTS.filter(a=>a.type==='quantity').map(a=>a.milestone),milestones);
 assert.equal(ACHIEVEMENTS.find(a=>a.id===wish).name,'Make a Wish at the Marshmallowids');
 assert.equal(ACHIEVEMENTS.find(a=>a.id===taste).name,'A Taste of the Stars');
 assert.ok(!ACHIEVEMENTS.some(a=>a.id==='halfway-to-the-end-of-the-universe'||a.id==='a-little-too-close-to-the-sun'));
});
test('one mutually exclusive draw follows 82/12/3/3 percentages and exact boundaries',()=>{
 const counts={normal:0,starlit:0,fireball:0,burnt:0};for(let i=0;i<10000;i++)counts[sampleMarshmallowOutcome(1,i/10000)]++;
 assert.deepEqual(counts,{normal:8200,starlit:1200,fireball:300,burnt:300});
 assert.equal(sampleMarshmallowOutcome(1,.819999),'normal');assert.equal(sampleMarshmallowOutcome(1,.82),'starlit');assert.equal(sampleMarshmallowOutcome(1,.94),'fireball');assert.equal(sampleMarshmallowOutcome(1,.97),'burnt');
});
test('important counts and forty always stay normal; fifty can be special',()=>{
 assert.deepEqual(SPECIAL_EXCLUSIONS,[10,20,30,40,42,64,75,88,99,100]);
 for(const n of SPECIAL_EXCLUSIONS)for(const roll of [0,.85,.95,.99])assert.equal(sampleMarshmallowOutcome(n,roll),'normal');
 assert.equal(sampleMarshmallowOutcome(50,.95),'fireball');assert.deepEqual(evaluateAchievements(event(40),[]),[]);assert.deepEqual(evaluateAchievements(event(50),[]),[]);
});
test('confirmed exact milestones award once; none after one hundred',()=>{
 const unlocked=[];for(let n=1;n<=125;n++){const ids=evaluateAchievements(event(n),unlocked);assert.deepEqual(ids,milestones.includes(n)?[ACHIEVEMENTS.find(a=>a.milestone===n).id]:[]);unlocked.push(...ids)}assert.equal(unlocked.length,9);
});
test('any starlight awards Taste; only a successfully released rare fireball awards Wish',()=>{
 assert.deepEqual(evaluateAchievements(event(1,'starlit',true),[]),[taste]);
 assert.deepEqual(evaluateAchievements(event(1,'fireball',false),[]),[taste]);
 assert.deepEqual(evaluateAchievements(event(1,'fireball',true),[]),[wish,taste]);
 assert.deepEqual(evaluateAchievements(event(2,'fireball',true),[wish,taste]),[]);
 assert.deepEqual(evaluateAchievements(event(1,'burnt'),[]),[]);
});
test('direction progress only changes at a completed bite and remains order independent',()=>{
 const e={...event(42),directions:['east','south','west','north','east']};assert.deepEqual(evaluateAchievements(e,[]),['the-answer-was-marshmallows','four-skies-one-campfire']);
 assert.deepEqual(evaluateAchievements({...e,eaten:40},[]),['four-skies-one-campfire']);
 for(const missing of ['south','west','north','east'])assert.deepEqual(evaluateAchievements({...e,eaten:4,directions:e.directions.filter(d=>d!==missing)},[]),[]);
});
test('outcome stays fixed for the lifecycle; repeated roast, eat and confirm actions do not duplicate',()=>{
 let s=campfireReducer(INITIAL_CAMPFIRE,{type:'toggle'});s=campfireReducer(s,{type:'enter'});s=campfireReducer(s,{type:'roast',roll:.95});assert.equal(s.outcome,'fireball');assert.equal(campfireReducer(s,{type:'roast',roll:.4}),s);
 s=campfireReducer(s,{type:'ready'});assert.equal(s.eaten,0);s=campfireReducer(s,{type:'eat',facing:'west',origin:{x:700,y:650}});assert.equal(campfireReducer(s,{type:'eat',facing:'east'}),s);
 s=campfireReducer(s,{type:'confirm'});assert.equal(s.eaten,1);assert.deepEqual(s.completion,{eaten:1,directions:['west'],outcome:'fireball',origin:{x:700,y:650}});assert.equal(campfireReducer(s,{type:'confirm'}),s);
});
test('extinguishing cancels every unfinished phase, retaining only the visit count',()=>{
 for(const phase of ['entering','roasting','ready','eating']){const s=campfireReducer({...INITIAL_CAMPFIRE,fireOn:true,phase,eaten:39,directions:['west','north'],outcome:'fireball',biteFacing:'east'},{type:'toggle'});assert.equal(s.eaten,39);assert.equal(s.outcome,'normal');assert.deepEqual(s.directions,[]);assert.equal(s.completion,null);assert.equal(campfireReducer(s,{type:'confirm'}),s)}
});
test('counts continue across ignitions; four directions never combine across separate fires',()=>{
 let s=campfireReducer(INITIAL_CAMPFIRE,{type:'toggle'});s=campfireReducer(s,{type:'enter'});s=confirm(s,'south');s=campfireReducer(s,{type:'enter'});s=confirm(s,'west');s=campfireReducer(s,{type:'toggle'});s=campfireReducer(s,{type:'toggle'});s=campfireReducer(s,{type:'enter'});s=confirm(s,'north');s=campfireReducer(s,{type:'enter'});s=confirm(s,'east');assert.equal(s.eaten,4);assert.deepEqual(s.directions,['north','east']);assert.deepEqual(evaluateAchievements(s.completion,[]),[]);
});
test('a full visit reaches 120 with all twelve discoveries, once each',()=>{
 let s=campfireReducer(INITIAL_CAMPFIRE,{type:'toggle'});s=campfireReducer(s,{type:'enter'});const unlocked=[];
 for(let n=1;n<=120;n++){s=confirm(s,['south','west','north','east'][Math.min(n-1,3)],n===5?.85:n===6?.95:.4);assert.equal(s.eaten,n);unlocked.push(...evaluateAchievements({...s.completion,meteorReleased:true},unlocked));assert.equal(campfireReducer(s,{type:'confirm'}),s);s=campfireReducer(s,{type:'enter'})}
 assert.equal(new Set(unlocked).size,12);assert.equal(unlocked.length,12);
});
test('smooth cooking curve is continuous, strictly decreasing and approaches 800ms',()=>{
 assert.equal(roastTimings(0).total,2400);let previous=2400;
 for(let count=.1;count<=500;count+=.1){const t=roastTimings(count);assert.ok(t.total<previous&&t.total>800);assert.ok(Math.abs(t.wait+t.enter+t.roast-t.total)<1e-9);previous=t.total}
 assert.ok(roastTimings(100).total<830);assert.ok(Math.abs(roastTimings(1000).total-800)<1e-9);
});
test('rare fireballs have independent 3–10x brightness and durations strictly above one second',()=>{
 for(const roll of [0,.1,.5,.99,1]){const f=createMarshmallowMeteor(1,'fireball',{x:720,y:700},1440,755,()=>roll);assert.ok(f.brightnessGain>=3&&f.brightnessGain<=10);assert.ok(f.durationMs>1000&&f.durationMs<=2000);assert.deepEqual(meteorPosition(f,0),f.origin);assert.deepEqual(meteorPosition(f,1),f.end)}
});
test('both starlight kinds release from the captured surface point; normal and burnt do not',()=>{
 for(const kind of ['starlit','fireball']){const f=createMarshmallowMeteor(1,kind,{x:213,y:662},390,709,()=>.5);assert.deepEqual(meteorFrame(f,0,false).head,f.origin);assert.ok(meteorFrame(f,f.durationMs*.5,false).head.y<f.origin.y);assert.ok(f.end.x>=24&&f.end.x<=366);assert.equal(meteorFrame(f,f.durationMs,false).opacity,0)}
 for(const kind of ['normal','burnt'])assert.equal(createMarshmallowMeteor(1,kind,{x:213,y:662},390,709),null);
 assert.equal(createMarshmallowMeteor(1,'fireball',null,390,709),null);
});
test('stroke energy scales with the requested gain, without clamping away the bright end',()=>{
 for(const dark of [true,false])for(const gain of [1.5,2.8,3,6.5,10]){const p=meteorPhotometry(gain,gain>=3,dark);const baseline=(dark?BACKGROUND_METEOR.dark:BACKGROUND_METEOR.light).opacity*BACKGROUND_METEOR.tipAlpha*BACKGROUND_METEOR.referenceWidth;assert.ok(Math.abs((p.coreWidth*p.coreAlpha+p.plumeWidth*p.plumeAlpha+p.haloWidth*p.haloAlpha)/baseline-gain)<1e-9);assert.ok(p.coreAlpha<=1&&p.plumeAlpha<=1&&p.haloAlpha<=1)}
});
test('reduced motion replaces flight with a local short trail and preserves the acknowledgement',()=>{
 const f=createMarshmallowMeteor(1,'fireball',{x:213,y:662},390,709,()=>.5);for(const t of [0,300,1000])assert.deepEqual(meteorFrame(f,t,true).head,f.origin);assert.equal(meteorFrame(f,f.durationMs,true).opacity,0);
});
test('existing records retain known discoveries and drop the removed fifty/burnt entries',()=>{
 const parsed=parseAchievementRecord({version:1,unlocked:{'cosmic-roaster':'2026-01-15T13:00:00Z','halfway-to-the-end-of-the-universe':'2026-01-15T14:00:00Z','a-little-too-close-to-the-sun':'2026-01-15T15:00:00Z'},recentId:'a-little-too-close-to-the-sun'});assert.deepEqual(parsed,{version:1,unlocked:{'cosmic-roaster':'2026-01-15T13:00:00Z'},recentId:'cosmic-roaster'});
});
test('malformed, old and blocked storage remains usable; valid records round-trip',()=>{
 const deny=()=>{throw Error('disabled')};assert.deepEqual(loadAchievementRecord(deny),emptyAchievementRecord());assert.equal(saveAchievementRecord(emptyAchievementRecord(),deny),false);
 for(const value of ['{','null','[]','{"version":0}'])assert.deepEqual(loadAchievementRecord(()=>({getItem:()=>value})),emptyAchievementRecord());
 let saved;const provider=()=>({getItem:()=>saved,setItem:(key,value)=>{assert.equal(key,ACHIEVEMENT_STORAGE_KEY);saved=value}});assert.equal(saveAchievementRecord(emptyAchievementRecord(),provider),true);assert.deepEqual(loadAchievementRecord(provider),emptyAchievementRecord());
});
test('permanent discoveries award once; the rare wish is selected when its Taste unlocks together',()=>{
 useAchievementStore.setState({record:emptyAchievementRecord(),hydrated:true});assert.deepEqual(useAchievementStore.getState().discover(event(1,'fireball',true)),[wish,taste]);const record=useAchievementStore.getState().record;assert.equal(record.recentId,wish);assert.deepEqual(useAchievementStore.getState().discover(event(2,'fireball',true)),[]);assert.equal(useAchievementStore.getState().record,record);
});
