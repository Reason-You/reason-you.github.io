async page => {
  const baseUrl = page.url().match(/^https?:\/\/[^/]+/)?.[0] || 'http://localhost:3000';
  const report={checks:[],failures:[],errors:[]}, assert=(v,m)=>{if(!v)report.failures.push(m)};
  const c=await page.context().browser().newContext({viewport:{width:1280,height:900},deviceScaleFactor:2,reducedMotion:'no-preference',timezoneId:'Asia/Shanghai'});
  try {
    await c.addInitScript(()=>{
      Math.random=()=>.5;
      localStorage.setItem('theme-storage',JSON.stringify({state:{theme:'dark'},version:0}));
      sessionStorage.setItem('stars-above-hints-started','1');
      window.__m={draws:0,heads:[],ts:0};
      const raf=window.requestAnimationFrame;
      window.requestAnimationFrame=cb=>raf(ts=>{window.__rafTime=ts;cb(ts)});
      const clear=CanvasRenderingContext2D.prototype.clearRect,arc=CanvasRenderingContext2D.prototype.arc;
      CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.hasAttribute('data-meteor-background')){window.__m.draws++;window.__m.heads=[];window.__m.ts=performance.now()}return clear.apply(this,args)};
      CanvasRenderingContext2D.prototype.arc=function(x,y,...rest){if(this.canvas.hasAttribute('data-meteor-background'))window.__m.heads.push({x,y});return arc.call(this,x,y,...rest)};
    });
    const p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));
    await p.clock.install({time:new Date('2026-01-15T13:00:00Z')});
    await p.goto(baseUrl + '/stars-above/?skydebug=1&skyUtc=2026-01-15T13:00:00Z');
    await p.waitForFunction(()=>window.__sky?.lightPollution.source==='viirs');await p.waitForTimeout(850);
    await p.clock.pauseAt(new Date(await p.evaluate(()=>Date.now()+100)));await p.clock.runFor(4000);
    const read=()=>p.evaluate(()=>({
      ...window.__m,camera:window.__sky.localCamera,now:performance.now(),
      active:document.querySelector('.look-up-sky').hasAttribute('data-trails-active'),
      holding:document.querySelector('.look-up-sky').hasAttribute('data-time-holding'),
      meteorOpacity:Number(getComputedStyle(document.querySelector('[data-meteor-background]')).opacity),
      trailOpacity:Number(getComputedStyle(document.querySelector('.look-up-trails')).opacity)
    }));
    const origin=await read();report.origin=origin;assert(origin.heads.length>0,'deterministic meteors are visible in the initial sky');
    const expected=current=>{
      const dt=(current.ts-origin.ts)/1000,vx=Math.cos(.425)*53,vy=Math.sin(.425)*53;
      const x=(origin.heads[0].x+vx*dt-origin.camera.width/2)/origin.camera.scale;
      const y=(origin.camera.height*origin.camera.centerYFraction-origin.heads[0].y-vy*dt)/origin.camera.scale;
      const d=origin.camera.forward.map((v,i)=>v+x*origin.camera.right[i]+y*origin.camera.up[i]);
      const dot=a=>d.reduce((sum,v,i)=>sum+v*a[i],0), depth=dot(current.camera.forward);
      return {x:current.camera.width/2+dot(current.camera.right)/depth*current.camera.scale,y:current.camera.height*current.camera.centerYFraction-dot(current.camera.up)/depth*current.camera.scale};
    };
    const compare=(state,name)=>{const target=expected(state),head=state.heads[0];const error=head?Math.hypot(head.x-target.x,head.y-target.y):Infinity;assert(error<.1,name+' follows the physical camera while retaining its own flight');report.checks.push({name,errorPx:error,head,target,state:{now:state.now,ts:state.ts,active:state.active,holding:state.holding,meteorOpacity:state.meteorOpacity,camera:state.camera}})};
    const pan=async(dx,dy)=>{
      const b=await p.locator('.look-up-sky').boundingBox(),x=b.x+b.width*.5,y=b.y+b.height*.4;
      await p.mouse.move(x,y);await p.mouse.down();for(let i=1;i<=4;i++){await p.mouse.move(x+dx*i/4,y+dy*i/4);await p.clock.runFor(32)}await p.mouse.up();await p.waitForTimeout(50);await p.clock.runFor(64);
    };
    await pan(80,35);compare(await read(),'horizontal and vertical drag');
    await pan(-40,-55);compare(await read(),'reverse drag');
    await p.locator('.sky-direction-trigger').click();await p.clock.runFor(64);assert((await read()).heads.length===0,'turning East moves the original northern meteors out of view');
    for(let i=0;i<3;i++){await p.locator('.sky-direction-trigger').click();await p.clock.runFor(64)}compare(await read(),'returning North');
    await p.setViewportSize({width:1000,height:800});await p.waitForTimeout(100);await p.clock.runFor(128);compare(await read(),'viewport resize');
    const hold=async()=>{const b=await p.locator('.sky-time-button').boundingBox();await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.waitForTimeout(50);await p.clock.runFor(400);const during=await read();report.during=during;assert(during.active&&during.holding&&during.meteorOpacity===0,'pressing Play hides meteors throughout the exposure');await p.mouse.up();await p.clock.runFor(64);return read()};
    const released=await hold();report.released=released;assert(released.active&&!released.holding&&released.meteorOpacity===0,'releasing Play keeps meteors hidden');
    const until=async(ms)=>{const state=await read();if(ms>state.now-released.now)await p.clock.runFor(ms-(state.now-released.now))};
    await until(18000);await pan(45,-15);const at18=await read();assert(at18.draws===released.draws&&at18.meteorOpacity===0&&at18.active,'retained trails keep meteor RAF paused during dragging');
    await until(22000);const at22=await read();assert(at22.draws===released.draws&&at22.meteorOpacity===0&&at22.trailOpacity>0&&at22.trailOpacity<1,'fading trails keep meteors hidden and paused');
    await until(24500);await p.waitForTimeout(500);await p.clock.runFor(64);const done=await read();report.done=done;assert(!done.active&&done.meteorOpacity===1&&done.draws>at22.draws,'meteors return only after the full exposure clears');
    report.checks.push({name:'complete exposure lifecycle',releasedDraws:released.draws,at18Draws:at18.draws,at22Draws:at22.draws,resumedDraws:done.draws});
    await hold();await p.getByRole('button',{name:'Return the sky to the present moment'}).click();await p.clock.runFor(500);await p.waitForTimeout(500);await p.clock.runFor(64);const reset=await read();report.reset=reset;assert(!reset.active&&reset.meteorOpacity===1,'now clears trails and restores meteors');
    await p.emulateMedia({reducedMotion:'reduce'});await p.clock.runFor(64);await p.locator('.sky-time-button').click();await p.clock.runFor(64);const reduced=await read();assert(reduced.active&&reduced.meteorOpacity===0,'reduced-motion exposure has the same hidden meteor state');await p.clock.runFor(24500);assert(!(await read()).active,'reduced-motion exposure releases the hidden state after fading');
    await p.emulateMedia({reducedMotion:'no-preference'});await p.goto(baseUrl + '/');await p.waitForTimeout(200);await p.clock.runFor(4000);const home=await p.evaluate(()=>({...window.__m,hasMeteor:!!document.querySelector('[data-meteor-background]')}));assert(home.hasMeteor&&home.draws>0&&home.heads.length>0,'homepage screen-space meteors continue to animate');report.checks.push({name:'homepage',draws:home.draws,heads:home.heads.length});
    return report;
  } finally {await c.close()}
}
