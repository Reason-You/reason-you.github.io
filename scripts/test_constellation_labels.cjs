async page => {
 const base=await page.evaluate(()=>location.origin),browser=page.context().browser(),report={checks:[],errors:[],captures:[]};
 const assert=(v,m)=>{if(!v)throw Error(m)};
 const directory='.cache/constellation-labels';
 const memberData=await(await page.context().request.get(base+'/data/constellation-membership.json')).json();
 const members=Object.fromEntries(Object.entries(memberData.constellations).flatMap(([id,ids])=>ids.map(starId=>[starId,id])));
 async function target(p,hip){return p.evaluate(hip=>{const e=window.__sky.interactiveStars.find(e=>e.star.hip===hip),b=document.querySelector('.look-up-scene').getBoundingClientRect();return e?{x:b.left+e.point.x,y:b.top+e.point.y,id:e.star.id,name:e.name.english}:null},hip)}
 async function audit(p){return p.evaluate(()=>{
  const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return r.width&&r.height&&s.visibility!=='hidden'&&s.display!=='none'&&+s.opacity>.001};
  const names=[...document.querySelectorAll('.constellation-label')].filter(visible),sky=document.querySelector('.look-up-sky').getBoundingClientRect();
  const controls=[...document.querySelectorAll('.look-up-sky .look-up-label, .look-up-sky button:not(.look-up-star-focus), .look-up-sky a, .look-up-sky [role="dialog"], .campfire-art, .campfire-hint, .campfire-count, .campfire-notifications, .look-up-star-hint')].filter(visible);
  const boxes=controls.map(e=>({kind:e.className,rect:e.getBoundingClientRect().toJSON()}));
  const overlap=(a,b,gap)=>a.left<b.right+gap&&a.right>b.left-gap&&a.top<b.bottom+gap&&a.bottom>b.top-gap;
  const clear=names.length<=1&&names.every(e=>{const r=e.getBoundingClientRect();return r.left>=sky.left&&r.right<=sky.right&&r.top>=sky.top&&r.bottom<=sky.bottom&&boxes.every(b=>!overlap(r,b.rect,9.99))});
  return {clear,names:names.map(e=>({id:e.dataset.constellation,text:e.innerText,rect:e.getBoundingClientRect().toJSON(),pointer:getComputedStyle(e).pointerEvents})),controls:boxes,pollution:window.__sky.lightPollution.source,skyUnchanged:window.__sky===window.__beforeNames};
 })}
 async function check(p,name,requireName=true){await p.waitForTimeout(500);const state=await audit(p);assert(state.clear&&state.skyUnchanged,JSON.stringify({name,state}));if(requireName)assert(state.names.length===1,`${name}: constellation name visible`);assert(state.names.every(n=>n.pointer==='none'),'noninteractive annotation');const path=`${directory}/${name}.png`;await p.screenshot({path,scale:'css',animations:'disabled'});report.captures.push(path);report.checks.push({name,state});return state}
 async function settle(p){await p.waitForFunction(()=>window.__sky?.lightPollution.source==='viirs');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(1100);await p.evaluate(()=>{window.__beforeNames=window.__sky})}
 const scenes=[['Ori','2026-01-15T14:00:00Z','south',24436],['UMa','2026-04-15T13:00:00Z','north',62956],['Cas','2026-09-15T15:00:00Z','north',4427],['Sco','2026-06-15T16:00:00Z','south',80763]];
 for(const width of [1440,390])for(const theme of ['dark','light']){
  const c=await browser.newContext({viewport:{width,height:width===390?844:900},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce'});await c.addInitScript(theme=>localStorage.setItem('theme-storage',JSON.stringify({state:{theme},version:0})),theme);
  const p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
  try{
   for(const [id,utc,facing,hip] of scenes){
    await p.goto(`${base}/stars-above/?skyUtc=${utc}&facing=${facing}&skydebug=1`);await settle(p);const point=await target(p,hip);assert(point,`${id} named anchor`);
    if(width===390)await p.touchscreen.tap(point.x,point.y);else await p.mouse.move(point.x,point.y);
    await p.waitForFunction(id=>document.querySelector('.constellation-label')?.dataset.constellation===id,id);await check(p,`${width}-${theme}-${id}`);
    if(id==='Ori'){
     if(width===1440)await p.mouse.click(point.x,point.y);
     const second=await target(p,27989);assert(second,'Betelgeuse anchor');if(width===390)await p.touchscreen.tap(second.x,second.y);else await p.mouse.click(second.x,second.y);
     await check(p,`${width}-${theme}-Ori-two-stars`);
     const third=await target(p,32349);assert(third,'Sirius anchor');if(width===390)await p.touchscreen.tap(third.x,third.y);else await p.mouse.click(third.x,third.y);
     if(width===1440)await p.mouse.move(0,0);let state=await check(p,`${width}-${theme}-two-constellations`);assert(state.names[0].id==='CMa','last selection priority');assert(await p.locator('.constellation-preview g').count()===2,'two figures, one name');
     if(width===1440){await p.mouse.move(point.x,point.y);state=await check(p,`${width}-${theme}-hover-priority`);assert(state.names[0].id==='Ori','hover priority');await p.mouse.move(0,0)}
     if(width===390)await p.touchscreen.tap(third.x,third.y);else await p.mouse.click(third.x,third.y);
     if(width===1440)await p.mouse.move(0,0);state=await check(p,`${width}-${theme}-fallback`);assert(state.names[0].id==='Ori','cancel latest selection falls back');
     await p.getByRole('button',{name:'Achievements',exact:true}).click();await p.getByRole('dialog').waitFor();await check(p,`${width}-${theme}-popup`,false);await p.keyboard.press('Escape');
     await p.locator('.campfire-toggle').click();await p.locator('.campfire-marshmallow.m-ready').waitFor();await check(p,`${width}-${theme}-campfire`);
     await p.getByRole('button',{name:'Clear names',exact:true}).click();await p.waitForTimeout(250);assert(!(await audit(p)).names.length,'clear removes constellation name');
    }
   }
  }finally{await c.close()}
 }
 // Actual unnamed members, fast transitions and per-frame collision monitoring.
 const c=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});await c.addInitScript(()=>localStorage.setItem('theme-storage',JSON.stringify({state:{theme:'dark'},version:0})));const p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));
 try{
  await p.goto(`${base}/stars-above/?skyUtc=2026-01-15T14:00:00Z&facing=south&skydebug=1`);await settle(p);
  await p.evaluate(()=>{
   window.__nameAudit={frames:0,violations:[],running:true};
   function tick(){const state=window.__nameAudit;if(!state.running)return;state.frames++;
    const visible=e=>getComputedStyle(e).visibility==='visible'&&+getComputedStyle(e).opacity>.001;
    const labels=[...document.querySelectorAll('.constellation-label')].filter(visible),stars=[...document.querySelectorAll('.look-up-label')].filter(visible);
    for(const label of labels){const a=label.getBoundingClientRect();for(const star of stars){const b=star.getBoundingClientRect();if(a.left<b.right+9.99&&a.right>b.left-9.99&&a.top<b.bottom+9.99&&a.bottom>b.top-9.99)state.violations.push({a:a.toJSON(),b:b.toJSON()})}}
    if(labels.length>1)state.violations.push({count:labels.length});requestAnimationFrame(tick);
   }requestAnimationFrame(tick);
  });
  const rigel=await target(p,24436),sirius=await target(p,32349);
  await p.mouse.move(rigel.x,rigel.y);await p.waitForTimeout(80);assert(await p.locator('.constellation-label').count()===0,'name does not precede intent');await p.waitForTimeout(500);
  for(let i=0;i<5;i++){await p.mouse.click(rigel.x,rigel.y);await p.mouse.move(sirius.x,sirius.y);await p.waitForTimeout(90);await p.mouse.move(rigel.x,rigel.y);await p.waitForTimeout(90)}
  await p.mouse.click(sirius.x,sirius.y);await p.mouse.move(0,0);await check(p,'desktop-motion-multi');
  const unnamed=await p.evaluate(members=>{const b=document.querySelector('.look-up-scene').getBoundingClientRect(),f=window.__sky;const star=f.rendered.find(e=>e.star.mag>3&&members[e.star.id]==='Ori'&&e.point.x>20&&e.point.x<f.camera.width-20&&e.point.y>40&&e.point.y<f.camera.height-140);return {x:b.left+star.point.x,y:b.top+star.point.y}},members);
  await p.mouse.move(unnamed.x,unnamed.y);let state=await check(p,'desktop-unnamed-member');assert(state.names[0].id==='Ori','unnamed member names constellation');
  await p.setViewportSize({width:1000,height:720});await p.waitForTimeout(400);await p.evaluate(()=>{window.__beforeNames=window.__sky});await check(p,'desktop-resize');
  await p.getByRole('button',{name:'Clear names',exact:true}).click();await p.waitForTimeout(260);assert(!(await audit(p)).names.length,'clear motion removes name');
  const trace=await p.evaluate(()=>{window.__nameAudit.running=false;return window.__nameAudit});assert(!trace.violations.length,JSON.stringify(trace));report.checks.push({name:'frame-by-frame star-name collision audit',trace});
  await p.goto(`${base}/stars-above/?skyUtc=2026-07-15T20:00:00Z&facing=south&lat=-24.77&lon=15.96&skydebug=1`);await settle(p);
  const long=await p.evaluate(members=>{const b=document.querySelector('.look-up-scene').getBoundingClientRect(),f=window.__sky;const s=f.rendered.find(e=>members[e.star.id]==='TrA'&&e.point.x>12&&e.point.x<f.camera.width-12&&e.point.y>20&&e.point.y<f.camera.height-100);return s?{x:b.left+s.point.x,y:b.top+s.point.y}:null},members);
  assert(long,'long-name southern constellation');await p.mouse.move(long.x,long.y);await check(p,'southern-long-name');
 }finally{await c.close()}
 // A genuinely cramped viewport with real names, real campfire and real achievement panel.
 const small=await browser.newContext({viewport:{width:320,height:350},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await small.addInitScript(()=>localStorage.setItem('theme-storage',JSON.stringify({state:{theme:'dark'},version:0})));const s=await small.newPage();s.on('pageerror',e=>report.errors.push(e.message));
 try{
  await s.goto(`${base}/stars-above/?skyUtc=2026-01-15T14:00:00Z&facing=south&skydebug=1`);await settle(s);
  const button=s.getByRole('button',{name:/Rigel/});await s.keyboard.press('Tab');await button.focus();await s.keyboard.press('Enter');await s.getByRole('button',{name:'Achievements',exact:true}).click();await s.getByRole('dialog').waitFor();
  const state=await check(s,'mobile-no-space',false);assert(state.names.length===0,'no space hides name');assert(await s.locator('.constellation-preview line').count()>0,'hidden name retains lines');assert(await s.locator('.look-up-label').count()>0,'hidden name retains star names');
  await s.setViewportSize({width:844,height:390});await s.waitForTimeout(400);await s.evaluate(()=>{window.__beforeNames=window.__sky});await check(s,'mobile-landscape',false);
 }finally{await small.close()}
 assert(!report.errors.length,JSON.stringify(report.errors));report.ok=true;return report;
}
