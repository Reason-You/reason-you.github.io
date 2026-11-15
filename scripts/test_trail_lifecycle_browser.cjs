async page => {
  const baseUrl = page.url().match(/^https?:\/\/[^/]+/)?.[0] || 'http://localhost:3000';
  const report={checks:[],failures:[],errors:[]},assert=(v,m)=>{if(!v)report.failures.push(m)};
  for(const mode of ['desktop','touch','reduced']) {
    const mobile=mode!=='desktop',c=await page.context().browser().newContext({viewport:{width:mobile?390:1280,height:900},hasTouch:mobile,isMobile:mobile,reducedMotion:mode==='reduced'?'reduce':'no-preference',colorScheme:'light',timezoneId:'Asia/Shanghai'});
    await c.addInitScript(()=>{
      localStorage.setItem('theme-storage',JSON.stringify({state:{theme:'dark'},version:0}));localStorage.setItem('stars-above-star-hint-seen','1');
      window.__q={paths:[],heads:[]};
      const move=Path2D.prototype.moveTo,line=Path2D.prototype.lineTo;
      Path2D.prototype.moveTo=function(x,y){this.__qLast=[x,y];return move.call(this,x,y)};
      Path2D.prototype.lineTo=function(x,y){this.__qSegments??=[];if(this.__qLast)this.__qSegments.push([this.__qLast[0],this.__qLast[1],x,y]);this.__qLast=[x,y];return line.call(this,x,y)};
      const clear=CanvasRenderingContext2D.prototype.clearRect,stroke=CanvasRenderingContext2D.prototype.stroke,arc=CanvasRenderingContext2D.prototype.arc;
      CanvasRenderingContext2D.prototype.clearRect=function(...a){if(this.canvas.classList.contains('look-up-trails'))window.__q.paths=[];if(this.canvas.classList.contains('look-up-stars'))window.__q.heads=[];return clear.apply(this,a)};
      CanvasRenderingContext2D.prototype.stroke=function(...args){const path=args[0];if(this.canvas.classList.contains('look-up-trails')&&path)window.__q.paths.push(path);return stroke.apply(this,args)};
      CanvasRenderingContext2D.prototype.arc=function(x,y,r,...rest){if(this.canvas.classList.contains('look-up-stars'))window.__q.heads.push({x,y,r});return arc.call(this,x,y,r,...rest)};
    });
    const p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.clock.install({time:new Date('2026-01-15T13:00:00Z')});
    await p.goto(baseUrl + '/stars-above/?skydebug=1&skyUtc=2026-01-15T13:00:00Z');await p.waitForFunction(()=>window.__sky?.lightPollution.source==='viirs');await p.waitForTimeout(850);
    await p.clock.pauseAt(new Date(await p.evaluate(()=>Date.now()+200)));
    const read=()=>p.evaluate(()=>{
      const s=window.__sky,q=window.__q,canvas=document.querySelector('.look-up-trails');
      const stars=s.rendered.filter(e=>e.point.x>2&&e.point.x<s.camera.width-2&&e.point.y>2&&e.point.y<s.groundY-2);
      const aligned=stars.filter(e=>q.paths.some(p=>p.__qSegments?.some(a=>Math.hypot(a[2]-e.point.x,a[3]-e.point.y)<.15))).map(e=>e.star.id);
      return{opacity:Number(getComputedStyle(canvas).opacity),segments:q.paths.reduce((n,p)=>n+(p.__qSegments?.length??0),0),aligned,stars:stars.map(e=>({id:e.star.id,x:e.point.x,y:e.point.y})),view:s.view,thin:q.heads.every(e=>e.r<=1.10001),elapsed:performance.now()-window.__released};
    });
    const pan=async(dx,dy)=>{
      const box=await p.locator('.look-up-sky').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.3;
      if(mobile){const d=await c.newCDPSession(p);await d.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(let i=1;i<=4;i++){await d.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/4,y:y+dy*i/4,id:1}]});await p.clock.runFor(32)}await d.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await d.detach();}
      else{await p.mouse.move(x,y);await p.mouse.down();for(let i=1;i<=4;i++){await p.mouse.move(x+dx*i/4,y+dy*i/4);await p.clock.runFor(32)}await p.mouse.up();}
      await p.clock.runFor(32);
    };
    const until=async(ms)=>{const elapsed=await p.evaluate(()=>performance.now()-window.__released);if(ms>elapsed)await p.clock.runFor(ms-elapsed)};
    if(mode==='reduced'){await p.locator('.sky-time-button').click();}
    else{const b=await p.locator('.sky-time-button').boundingBox();await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.clock.runFor(7200);await p.mouse.up();}
    await p.evaluate(()=>window.__released=performance.now());await p.clock.runFor(32);
    const captured=await read();assert(captured.segments>0&&captured.opacity===1,`${mode}: exposure starts full retention`);
    await until(5000);await pan(mobile?45:100,-25);const moved=await read();
    const common=moved.stars.filter(e=>captured.aligned.includes(e.id));
    assert(moved.opacity===1&&moved.segments>0,`${mode}: pan preserves visible trails and full opacity`);
    assert(common.length>0&&common.filter(e=>moved.aligned.includes(e.id)).length>=common.length-1,`${mode}: moved star heads remain on their trail ends`);
    const turns=[];
    await until(8000);for(let i=0;i<4;i++){
      await p.locator('.sky-direction-trigger').click();await p.clock.runFor(32);const turn=await read();
      turns.push({view:turn.view,stars:turn.stars.length,aligned:turn.aligned.length,newStars:turn.aligned.filter(id=>!captured.aligned.includes(id)).length,segments:turn.segments});
      assert(turn.opacity===1&&turn.segments>0&&turn.aligned.length>=turn.stars.length-1,`${mode}: all visible star heads have historical trails after direction turn ${i+1}`);
    }
    assert(turns.some(t=>t.newStars>3),`${mode}: directions outside the exposure view have their own historical trails`);
    const returned=await read();assert(returned.opacity===1&&captured.stars.every(a=>returned.stars.some(b=>a.id===b.id&&Math.hypot(a.x-b.x,a.y-b.y)<.001)),`${mode}: turning back restores original star positions`);
    if(mode==='desktop'){await pan(80,-10);await p.getByRole('button',{name:'Reset view',exact:true}).click();await p.clock.runFor(32);const reset=await read();assert(reset.opacity===1&&reset.aligned.length>=reset.stars.length-1,'Reset view preserves full-sky retained history');}
    assert(await p.locator('.look-up-sky').evaluate(e=>getComputedStyle(e).outlineStyle==='none'),`${mode}: dragging sky shows no browser outline`);
    await until(19000);const at19=await read();assert(at19.opacity===1&&at19.segments>0,`${mode}: trails stay fully visible at the original 19-second mark`);
    await until(21000);const at21=await read();assert(at21.opacity>.7&&at21.opacity<.95,`${mode}: fade begins at the original 20-second mark`);
    await until(22000);const beforeFadePan=await read();await pan(mobile?-15:40,15);
    if(mode==='desktop'){await p.setViewportSize({width:1000,height:800});await p.clock.runFor(64);await p.locator('button[title^="Current theme: Dark"]:visible').first().click();await p.clock.runFor(32);}
    const duringFade=await read();assert(duringFade.opacity<beforeFadePan.opacity&&duringFade.opacity>0&&duringFade.segments>0,`${mode}: moving during fade continues fading without resetting`);
    await until(24500);const done=await read();assert(done.segments===0&&!done.thin,`${mode}: trails clear and normal stars return after the original 24 seconds`);
    report.checks.push({mode,turns,captured:{segments:captured.segments,aligned:captured.aligned.length},moved:{segments:moved.segments,aligned:moved.aligned.length,common:common.length},at19:at19.opacity,at21:at21.opacity,duringFade:duringFade.opacity,done:{segments:done.segments,thin:done.thin}});
    await c.close();
  }
  return report;
}
