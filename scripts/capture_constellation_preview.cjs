async page => {
  const browser=page.context().browser(),base=await page.evaluate(()=>location.origin);
  const capture=await page.evaluate(()=>new URLSearchParams(location.search).get('screenshots')==='1');
  const source=await (await page.context().request.get(base+'/data/constellation-lines.json')).json();
  const scenarios=[
    {id:'Ori',utc:'2026-01-15T14:00:00Z',facing:'south',hip:24436},
    {id:'Sco',utc:'2026-06-15T16:00:00Z',facing:'south',hip:80763},
    {id:'Cyg',utc:'2026-07-15T14:00:00Z',facing:'east',hip:102098},
    {id:'Cas',utc:'2026-09-15T15:00:00Z',facing:'north',hip:4427},
    {id:'UMa',utc:'2026-04-15T13:00:00Z',facing:'north',hip:62956},
  ];
  const report={checks:[],failures:[],errors:[],captures:[]},goldens=new Map();
  const assert=(v,m)=>{if(!v)throw new Error(m)};
  const shot=async(p,name)=>{if(capture){const path=`.cache/campfire-log/${name}.png`;await p.screenshot({path,scale:'css',animations:'disabled'});report.captures.push(path)}};
  const target=async(p,hip)=>p.evaluate(hip=>{
    const entry=window.__sky.interactiveStars.find(s=>s.star.hip===hip),box=document.querySelector('.look-up-scene').getBoundingClientRect();
    if(!entry)return null;return {x:box.left+entry.point.x,y:box.top+entry.point.y,name:entry.name.english,id:entry.star.id};
  },hip);
  const inspect=async p=>p.evaluate(()=>{
    const canvas=document.querySelector('.look-up-stars'),g=document.querySelector('.constellation-preview g');
    const lines=[...document.querySelectorAll('.constellation-preview line')].map(l=>({fromHip:Number(l.dataset.fromHip),toHip:Number(l.dataset.toHip),x1:Number(l.getAttribute('x1')),y1:Number(l.getAttribute('y1')),x2:Number(l.getAttribute('x2')),y2:Number(l.getAttribute('y2'))}));
    const camera=window.__sky.camera,visible=window.__sky.rendered;
    return {constellation:g?.dataset.constellation,opacity:g?Number(getComputedStyle(g).opacity):null,width:g?.getAttribute('stroke-width'),pointerEvents:getComputedStyle(document.querySelector('.constellation-preview')??canvas).pointerEvents,
      lines,valid:lines.every(l=>[[l.fromHip,l.x1,l.y1],[l.toHip,l.x2,l.y2]].every(([hip,x,y])=>visible.some(e=>e.star.hip===hip&&e.star.altitude>=0&&e.star.mag<=window.__sky.lightPollution.limitingMagnitude&&Math.abs(e.point.x-x)<1e-9&&Math.abs(e.point.y-y)<1e-9&&x>=0&&x<=camera.width&&y>=0&&y<=camera.height))),sameSky:window.__sky===window.__beforePreviewSky,starCount:visible.length};
  });
  for(const scene of scenarios)for(const width of [1440,390])for(const alpha of [null,.08,.12]){
    const name=`${scene.id}-${width}-${alpha===null?'original':alpha}`;
    const context=await browser.newContext({viewport:{width,height:width===1440?900:844},deviceScaleFactor:2,isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce',timezoneId:'Asia/Shanghai'});
    await context.addInitScript(()=>localStorage.setItem('theme-storage',JSON.stringify({state:{theme:'dark'},version:0})));
    const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
    try{
      const query=`skyUtc=${scene.utc}&facing=${scene.facing}&bortle=2&skydebug=1${alpha===null?'':`&constellationPreview=${alpha}`}`;
      const url=`${base}/stars-above/?${query}`;await p.goto(url);
      await p.waitForFunction(({facing})=>window.__sky?.rendered&&window.__sky.facing===facing&&window.__sky.lightPollution.source==='override',scene);
      await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(1100);
      const identity=await p.evaluate(()=>JSON.stringify({snapshot:window.__sky.snapshot,camera:window.__sky.camera,rendered:window.__sky.rendered})),goldenKey=`${scene.id}-${width}`;
      if(alpha===null)goldens.set(goldenKey,identity);else assert(goldens.get(goldenKey)===identity,'preview does not alter astronomy, projection, alpha or count');
      await p.evaluate(()=>{window.__beforePreviewSky=window.__sky});
      const point=await target(p,scene.hip);assert(point,'named connecting star in field');
      if(width===390)await p.touchscreen.tap(point.x,point.y);else await p.mouse.move(point.x,point.y);
      await p.locator('.look-up-label').waitFor();assert((await p.locator('.look-up-label').innerText()).includes(point.name),'existing name shown');
      if(alpha!==null)await p.waitForFunction(({id,alpha})=>{const g=document.querySelector('.constellation-preview g');return g?.dataset.constellation===id&&Math.abs(Number(getComputedStyle(g).opacity)-alpha)<.00001},{id:scene.id,alpha});
      else assert(await p.locator('.constellation-preview').count()===0,'no default layer');
      const state=await inspect(p);assert(state.valid&&state.sameSky,'real endpoints, no sky redraw');
      if(alpha!==null){assert(state.lines.length>0&&state.width==='0.6'&&state.pointerEvents==='none','thin auxiliary layer');const graph=source.constellations.find(c=>c.id===scene.id);assert(state.lines.every(l=>graph.lines.some(e=>e.fromHip===l.fromHip&&e.toHip===l.toHip)),'source HIP graph');}
      await shot(p,`constellation-${name}`);
      if(width===390)await p.getByRole('button',{name:'Clear names',exact:true}).tap();else await p.mouse.move(0,0);
      await p.waitForFunction(()=>!document.querySelector('.constellation-preview g'));
      if(scene.id==='Ori'&&alpha===.12)await shot(p,`constellation-${scene.id}-${width}-cleared`);
      if(alpha!==null){
        if(width===390)await p.touchscreen.tap(point.x,point.y);else await p.mouse.move(point.x,point.y);
        await p.waitForFunction(()=>!!document.querySelector('.constellation-preview g'));
        await p.locator('.sky-direction-trigger').click();await p.waitForFunction(f=>window.__sky.facing!==f,scene.facing);
        assert(await p.locator('.constellation-preview g').count()===0,'direction clears old lines');
      }
      report.checks.push({name,url,state});
    }catch(e){report.failures.push({name,error:String(e)})}finally{await context.close()}
  }
  // Normal-motion hover intent, rapid switching and field-of-view updates.
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2,reducedMotion:'no-preference'}),p=await context.newPage();
  p.on('pageerror',e=>report.errors.push(e.message));
  try{
    await p.goto(`${base}/stars-above/?skyUtc=2026-07-15T13:00:00Z&facing=north&bortle=2&skydebug=1&constellationPreview=0.12`);
    await p.waitForFunction(()=>window.__sky?.rendered&&window.__sky.facing==='north'&&window.__sky.lightPollution.source==='override');await p.waitForTimeout(1100);
    const first=await target(p,102098);await p.mouse.move(first.x,first.y);await p.locator('.look-up-label').waitFor();
    assert(await p.locator('.constellation-preview g').count()===0,'name precedes 200ms hover intent');
    await p.waitForFunction(()=>document.querySelector('.constellation-preview g')?.dataset.constellation==='Cyg');await p.waitForTimeout(250);
    const secondHip=await p.evaluate(source=>window.__sky.interactiveStars.find(s=>source.some(c=>c.id!=='Cyg'&&c.lines.some(l=>l.fromHip===s.star.hip||l.toHip===s.star.hip)))?.star.hip,source.constellations);
    assert(secondHip,'second supported constellation visible');const second=await target(p,secondHip);
    for(let i=0;i<6;i++){await p.mouse.move(second.x,second.y);await p.mouse.move(first.x,first.y)}await p.mouse.move(second.x,second.y);
    const expected=source.constellations.find(c=>c.lines.some(l=>l.fromHip===secondHip||l.toHip===secondHip)).id;
    await p.waitForFunction(id=>{const groups=document.querySelectorAll('.constellation-preview g');return groups.length===1&&groups[0].dataset.constellation===id},expected);await p.waitForTimeout(250);
    assert((await inspect(p)).valid,'rapid switch endpoints');await p.setViewportSize({width:390,height:844});await p.waitForTimeout(500);assert((await inspect(p)).valid,'resize endpoints');
    await p.goto(`${base}/stars-above/?skyUtc=2026-01-15T14:00:00Z&facing=south&mag=0&skydebug=1&constellationPreview=0.12`);await p.waitForFunction(()=>window.__sky?.lightPollution.limitingMagnitude===0);assert(await p.locator('.constellation-preview g').count()===0,'invisible endpoints do not leave lines');
    report.checks.push({name:'normal-motion hover delay, rapid switch, resize and magnitude cut',result:true});
  }catch(e){report.failures.push({name:'normal-motion transitions',error:String(e)})}finally{await context.close()}
  report.ok=!report.failures.length&&!report.errors.length;return report;
}