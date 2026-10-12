async page => {
 const browser=page.context().browser(),base=await page.evaluate(()=>location.origin),report={checks:[],errors:[]};
 const assert=(v,m)=>{if(!v)throw Error(m)};
 const graph=await(await page.context().request.get(base+'/data/constellation-lines.json')).json();
 const membership=await(await page.context().request.get(base+'/data/constellation-membership.json')).json();
 const members=Object.fromEntries(Object.entries(membership.constellations).flatMap(([id,stars])=>stars.map(star=>[star,id])));
 assert(graph.constellations.length===88,'88 source graphs');
 for(const [width,reducedMotion] of [[1440,'no-preference'],[390,'no-preference'],[1440,'reduce'],[390,'reduce']]){
  const c=await browser.newContext({viewport:{width,height:width===390?844:900},isMobile:width===390,hasTouch:width===390,reducedMotion});
  await c.addInitScript(()=>localStorage.setItem('theme-storage',JSON.stringify({state:{theme:'dark'},version:0})));
  const p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
  const query='skyUtc=2026-01-15T14:00:00Z&facing=south&skydebug=1';
  async function points(){return p.evaluate(({graph,members})=>{
   const {rendered,camera,interactiveStars}=window.__sky,b=document.querySelector('.look-up-scene').getBoundingClientRect();
   const visible=rendered.filter(e=>e.star.altitude>=0&&e.point.x>=0&&e.point.x<=camera.width&&e.point.y>=0&&e.point.y<=camera.height);
   const hips=new Set(visible.map(e=>e.star.hip));const available=graph.constellations.filter(g=>g.lines.some(l=>hips.has(l.fromHip)&&hips.has(l.toHip))).map(g=>g.id);
   return visible.filter(e=>available.includes(members[e.star.id])&&e.point.x>12&&e.point.x<camera.width-12&&e.point.y>40&&e.point.y<camera.height-140&&
    !visible.some(other=>other!==e&&other.star.mag<e.star.mag&&Math.hypot(other.point.x-e.point.x,other.point.y-e.point.y)<=1))
    .map(e=>({id:members[e.star.id],starId:e.star.id,hip:e.star.hip,mag:e.star.mag,x:b.left+e.point.x,y:b.top+e.point.y,
     named:interactiveStars.some(s=>s.star.id===e.star.id),nonVertex:!graph.constellations.find(g=>g.id===members[e.star.id]).lines.some(l=>l.fromHip===e.star.hip||l.toHip===e.star.hip)}));
  },{graph,members})}
  async function activate(point){if(width===390)await p.touchscreen.tap(point.x,point.y);else await p.mouse.click(point.x,point.y);await p.waitForTimeout(300)}
  async function inspect(expected){
   await p.waitForFunction(expected=>{
    const ids=[...document.querySelectorAll('.constellation-preview g')].map(g=>g.dataset.constellation).sort();
    return JSON.stringify(ids)===JSON.stringify([...expected].sort());
   },expected);await p.waitForTimeout(260);
   const state=await p.evaluate(()=>{
    const gs=[...document.querySelectorAll('.constellation-preview g')],{rendered,camera}=window.__sky;
    return {ids:gs.map(g=>g.dataset.constellation),labels:document.querySelectorAll('.look-up-label').length,sameSky:window.__sky===window.__beforeConstellation,
     valid:gs.every(g=>Math.abs(+getComputedStyle(g).opacity-.12)<1e-5&&g.getAttribute('stroke-width')==='0.6'&&getComputedStyle(g.closest('svg')).pointerEvents==='none'&&[...g.querySelectorAll('line')].every(l=>[[+l.dataset.fromHip,+l.getAttribute('x1'),+l.getAttribute('y1')],[+l.dataset.toHip,+l.getAttribute('x2'),+l.getAttribute('y2')]].every(([hip,x,y])=>rendered.some(e=>e.star.hip===hip&&e.star.altitude>=0&&e.star.mag<=window.__sky.lightPollution.limitingMagnitude&&e.point.x===x&&e.point.y===y)&&x>=0&&x<=camera.width&&y>=0&&y<=camera.height)))};
   });assert(state.valid&&state.sameSky,JSON.stringify({width,reducedMotion,expected,state}));return state;
  }
  try{
   await p.goto(`${base}/stars-above/?${query}`);await p.waitForFunction(()=>window.__sky?.lightPollution.source==='viirs');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(1100);
   const normal=await p.evaluate(()=>JSON.stringify({snapshot:window.__sky.snapshot,camera:window.__sky.camera,rendered:window.__sky.rendered}));
   assert(await p.locator('.constellation-preview').count()===0,'ordinary sky remains off');
   await p.goto(`${base}/stars-above/?${query}&constellationPreview=0.12`);await p.waitForFunction(()=>window.__sky?.lightPollution.source==='viirs');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(1100);
   assert(normal===await p.evaluate(()=>JSON.stringify({snapshot:window.__sky.snapshot,camera:window.__sky.camera,rendered:window.__sky.rendered})),'astronomy and star rendering unchanged');
   await p.evaluate(()=>{window.__beforeConstellation=window.__sky});await inspect([]);
   const all=await points(),rigel=all.find(e=>e.hip===24436),sirius=all.find(e=>e.hip===32349),betelgeuse=all.find(e=>e.hip===27989);
   assert(rigel?.named&&sirius?.named&&betelgeuse?.named,'named anchors in real VIIRS sky');
   const groups=new Map();for(const point of all)if(!groups.has(point.id)||point.mag>3)groups.set(point.id,point);
   if(width===1440){
    for(const point of groups.values()){
     await p.mouse.move(0,0);await p.waitForTimeout(250);await p.mouse.move(point.x,point.y);
     await p.waitForTimeout(80);assert(await p.locator('.constellation-preview g').count()===0,'200ms hover intent');
     const state=await inspect([point.id]);report.checks.push({width,reducedMotion,name:'all-member hover',target:point,...state});
    }
    await p.mouse.move(0,0);await p.waitForTimeout(250);
   }
   const faint=all.find(e=>e.mag>3&&!e.named),unnamed=all.find(e=>!e.named&&e!==faint);
   assert(faint&&unnamed,'faint and unnamed click-rejection probes');
   for(const target of [faint,unnamed]){
    await activate(target);if(width===1440)await p.mouse.move(0,0);await p.waitForTimeout(250);
    const state=await inspect([]);assert(state.labels===0,'unnamed/faint star does not pin');
   }
   assert(await p.locator('button[aria-label$=" constellation"]').count()===0,'no unnamed keyboard click controls');
   await activate(rigel);if(width===1440)await p.mouse.move(0,0);let state=await inspect(['Ori']);assert(state.labels===1,'click fixes name and figure');
   await activate(betelgeuse);if(width===1440)await p.mouse.move(0,0);state=await inspect(['Ori']);assert(state.labels===2,'same constellation is not doubled');
   await activate(sirius);if(width===1440)await p.mouse.move(0,0);state=await inspect(['Ori','CMa']);assert(state.labels===3,'second constellation accumulates');
   await activate(rigel);if(width===1440)await p.mouse.move(0,0);state=await inspect(['Ori','CMa']);assert(state.labels===2,'cancel one name retains all figures');
   await activate(betelgeuse);if(width===1440)await p.mouse.move(0,0);state=await inspect(['Ori','CMa']);assert(state.labels===1,'constellation without remaining own names stays until global clear');
   const blank=await p.evaluate(()=>{
    const {rendered,camera}=window.__sky,b=document.querySelector('.look-up-scene').getBoundingClientRect();
    for(let y=60;y<camera.height-150;y+=45)for(let x=35;x<camera.width-35;x+=45)if(rendered.every(e=>Math.hypot(e.point.x-x,e.point.y-y)>30))return {x:b.left+x,y:b.top+y};
   });assert(blank,'blank-sky probe');await activate(blank);state=await inspect(['Ori','CMa']);assert(state.labels===1,'blank clicks leave selections intact');
   await activate(sirius);state=await inspect([]);assert(state.labels===0,'last name clears every figure under stationary pointer');
   if(width===1440){await p.mouse.move(sirius.x+1,sirius.y);await p.waitForTimeout(350);await inspect([]);await p.mouse.move(0,0);await p.mouse.move(sirius.x,sirius.y);await inspect(['CMa']);await p.mouse.move(0,0)}
   await activate(rigel);if(width===1440)await p.mouse.move(0,0);await inspect(['Ori']);
   await p.keyboard.press('Escape');state=await inspect([]);assert(state.labels===0,'Escape clears names and figures');
   await activate(rigel);if(width===1440)await p.mouse.move(0,0);await inspect(['Ori']);await p.getByRole('button',{name:'Clear names',exact:true}).click();state=await inspect([]);assert(state.labels===0,'Clear names clears figures');
   if(width===1440){
    const button=p.getByRole('button',{name:/Rigel/});await p.keyboard.press('Tab');await button.focus();await p.keyboard.press('Enter');await p.mouse.move(0,0);state=await inspect(['Ori']);assert(state.labels===1,'keyboard pins named bright star');
   }else{await activate(rigel);await inspect(['Ori'])}
   await p.setViewportSize({width:width===390?375:1200,height:800});await p.waitForTimeout(400);await p.evaluate(()=>{window.__beforeConstellation=window.__sky});await inspect(['Ori']);
   await p.locator('.sky-direction-trigger').click();await p.waitForTimeout(400);await p.evaluate(()=>{window.__beforeConstellation=window.__sky});state=await inspect([]);assert(state.labels===0,'direction clears names and figures');
   await p.getByRole('button',{name:'Achievements',exact:true}).click();await p.getByRole('dialog').waitFor();await p.keyboard.press('Escape');
   await p.locator('.campfire-toggle').click();await p.locator('.campfire-marshmallow.m-ready').waitFor();await p.locator('.campfire-eat').click();await p.waitForFunction(()=>document.querySelector('.campfire-count')?.textContent==='Marshmallow · 1');
   report.checks.push({width,reducedMotion,name:'named-only clicks, sticky accumulation, last-name clear, Escape, clear button, keyboard, resize, direction, popup and campfire',ok:true});
  }finally{await c.close()}
 }
 assert(!report.errors.length,JSON.stringify(report.errors));report.ok=true;return report;
}
