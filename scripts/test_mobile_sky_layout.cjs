async page => {
  const browser=page.context().browser(),base=await page.evaluate(()=>location.origin);
  const report={checks:[],captures:[],errors:[],failures:[]};
  const assert=(value,message)=>{if(!value)report.failures.push(message)};
  const url=base+'/stars-above/?skyUtc=2026-10-13T06:50:00Z&facing=south&skydebug=1';
  for(const [width,height,motion,theme] of [
    [360,800,'reduce','dark'],[390,844,'no-preference','dark'],
    [412,915,'reduce','dark'],[1280,900,'no-preference','dark'],[390,844,'reduce','light'],
  ]){
    const mobile=width<640;
    const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,reducedMotion:motion,timezoneId:'Asia/Shanghai'});
    await context.addInitScript(theme=>{
      localStorage.setItem('theme-storage',JSON.stringify({state:{theme},version:0}));
      localStorage.setItem('stars-above-star-hint-seen','1');
    },theme);
    const p=await context.newPage();
    p.on('pageerror',error=>report.errors.push(error.message));
    const key=`${width}-${theme}-${motion}`;
    async function settle(){
      await p.waitForFunction(()=>window.__sky?.lightPollution.source==='viirs'&&window.__sky.snapshot.date.toISOString()==='2026-10-13T06:50:00.000Z');
      await p.evaluate(()=>document.fonts.ready);
      await p.waitForFunction(()=>Math.abs(document.querySelector('.look-up-scene').getBoundingClientRect().top-document.querySelector('.look-up-sky').getBoundingClientRect().top)<.1);
      await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    }
    async function tap(hip){
      const point=await p.evaluate(hip=>{
        const e=window.__sky.interactiveStars.find(e=>e.star.hip===hip),b=document.querySelector('.look-up-scene').getBoundingClientRect();
        return e?{id:e.star.id,x:b.left+e.point.x,y:b.top+e.point.y}:null;
      },hip);
      assert(point,`${key}: HIP ${hip} visible`);
      if(mobile)await p.touchscreen.tap(point.x,point.y);else await p.mouse.click(point.x,point.y);
      await p.waitForFunction(id=>document.querySelector(`.look-up-star-focus[aria-pressed="true"][aria-label]`)&&
        [...document.querySelectorAll('.look-up-label')].some(e=>+e.dataset.starId===id&&getComputedStyle(e).visibility==='visible'),point.id);
    }
    async function audit(name){
      await p.waitForTimeout(300);
      const state=await p.evaluate(()=>{
        const visible=e=>{const s=getComputedStyle(e);return s.visibility!=='hidden'&&s.display!=='none'&&+s.opacity>.001};
        const overlap=(a,b)=>a.left<b.right+9.9&&a.right>b.left-9.9&&a.top<b.bottom+9.9&&a.bottom>b.top-9.9;
        const labels=[...document.querySelectorAll('.look-up-label')].filter(visible);
        const rects=labels.map(e=>e.getBoundingClientRect()),sky=document.querySelector('.look-up-sky').getBoundingClientRect();
        const controls=[...document.querySelectorAll('.look-up-sky button:not(.look-up-star-focus), .look-up-sky [role="dialog"], .campfire-art, .campfire-hint, .campfire-count, .campfire-notifications, .look-up-star-hint')].filter(visible).map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height);
        const clear=rects.every((a,i)=>rects.slice(i+1).every(b=>!overlap(a,b))&&controls.every(b=>!overlap(a,b))&&
          a.left>=sky.left+11.9&&a.right<=sky.right-11.9&&a.top>=sky.top+11.9&&a.bottom<=sky.bottom-11.9);
        const constellationNames=[...document.querySelectorAll('.constellation-label')].filter(visible);
        const namesClear=constellationNames.length<=1&&constellationNames.every(e=>rects.every(r=>!overlap(e.getBoundingClientRect(),r)));
        return {clear,namesClear,labels:labels.map(e=>({id:+e.dataset.starId,text:e.innerText,rect:e.getBoundingClientRect().toJSON()})),pinned:document.querySelectorAll('.look-up-star-focus[aria-pressed="true"]').length,
          sameSky:window.__sky===window.__beforeLayout,figures:[...document.querySelectorAll('.constellation-preview g')].map(g=>({id:g.dataset.constellation,lines:g.querySelectorAll('line').length})),pollution:window.__sky.lightPollution};
      });
      assert(state.clear&&state.namesClear&&state.sameSky,`${key}/${name}: ${JSON.stringify(state)}`);
      if(name!=='achievement panel')assert(state.labels.length===state.pinned,`${key}/${name}: every pinned bilingual name is visible`);
      report.checks.push({key,name,...state});return state;
    }
    try{
      await p.goto(url);await settle();
      await p.evaluate(()=>{
        window.__beforeLayout=window.__sky;
        window.__layoutTrace={running:true,frames:0,collisions:[]};
        function tick(){
          const trace=window.__layoutTrace;if(!trace.running)return;trace.frames++;
          const labels=[...document.querySelectorAll('.look-up-label')].filter(e=>getComputedStyle(e).visibility==='visible'&&+getComputedStyle(e).opacity>.001);
          for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
            const a=labels[i].getBoundingClientRect(),b=labels[j].getBoundingClientRect();
            if(a.left<b.right+9.9&&a.right>b.left-9.9&&a.top<b.bottom+9.9&&a.bottom>b.top-9.9)trace.collisions.push({a:a.toJSON(),b:b.toJSON()});
          }
          requestAnimationFrame(tick);
        }requestAnimationFrame(tick);
      });
      await tap(85927);await tap(85696);
      if(!mobile)await p.mouse.move(0,0);
      const pair=await audit('Shaula and Lesath');assert(pair.labels.length===2,'both nearby names retained');
      const continuity=await p.evaluate(()=>{
        const g=document.querySelector('.constellation-preview g[data-constellation="Sco"]');
        const a=g?.querySelector('line[data-from-hip="82514"][data-to-hip="82671"]'),b=g?.querySelector('line[data-from-hip="82671"][data-to-hip="84143"]');
        return {count:g?.querySelectorAll('line').length,connected:!!a&&!!b&&a.getAttribute('x2')===b.getAttribute('x1')&&a.getAttribute('y2')===b.getAttribute('y1'),faintStarDrawn:window.__sky.rendered.some(e=>e.star.hip===82671)};
      });
      assert(continuity.count===12&&continuity.connected&&!continuity.faintStarDrawn,`${key}: complete Scorpius through the faint vertex`);
      const path=`.cache/sky-layout/${key}-pair.png`;await p.screenshot({path,scale:'css',animations:'disabled'});report.captures.push(path);
      await tap(80816);if(!mobile)await p.mouse.move(0,0);
      const edge=await p.evaluate(()=>{
        const l=document.querySelector('.constellation-preview g[data-constellation="Her"] line[data-from-hip="80816"][data-to-hip="81693"]');
        return l?{x1:+l.getAttribute('x1'),y1:+l.getAttribute('y1'),x2:+l.getAttribute('x2'),y2:+l.getAttribute('y2')}:null;
      });
      assert(edge&&edge.y1>0&&edge.y2===0,`${key}: Hercules line reaches the top edge`);await audit('clipped Hercules');
      const remaining=await p.locator('.look-up-star-focus[aria-pressed="false"]').evaluateAll(buttons=>buttons.map(button=>button.getAttribute('aria-label')));
      for(const name of remaining){await p.getByRole('button',{name,exact:true}).focus();await p.keyboard.press('Enter');}
      await p.evaluate(()=>document.activeElement?.blur());
      const dense=await audit('all visible named stars');assert(dense.labels.length>=15,`${key}: crowded real sky`);
      await p.getByRole('button',{name:'Achievements',exact:true}).click();await p.getByRole('dialog').waitFor();await audit('achievement panel');
      await p.getByRole('button',{name:'Close Campfire Log',exact:true}).click();
      await p.getByRole('dialog').waitFor({state:'detached'});await audit('panel closed');
      await p.setViewportSize({width:mobile?844:1000,height:mobile?390:720});await settle();
      await p.evaluate(()=>{window.__beforeLayout=window.__sky});await audit('resized sky');
      await p.keyboard.press('Escape');await p.waitForTimeout(250);
      assert(await p.locator('.look-up-label').count()===0&&await p.locator('.constellation-preview g').count()===0,`${key}: Escape clears names and figures`);
      const trace=await p.evaluate(()=>{window.__layoutTrace.running=false;return window.__layoutTrace});
      assert(!trace.collisions.length,`${key}: animation frames have no star-name collisions: ${JSON.stringify(trace.collisions.slice(0,3))}`);
      report.checks.push({key,name:'animated layout',frames:trace.frames,collisions:trace.collisions.length,continuity,edge});
    }catch(error){report.failures.push(`${key}: ${error.message}`)}finally{await context.close()}
  }
  assert(!report.errors.length,JSON.stringify(report.errors));report.ok=report.failures.length===0;return report;
}
