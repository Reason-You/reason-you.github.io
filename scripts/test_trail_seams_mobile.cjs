async page => {
  const baseUrl = page.url().match(/^https?:\/\/[^/]+/)?.[0] || 'http://localhost:3000';
  const c=await page.context().browser().newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true,reducedMotion:'no-preference',timezoneId:'Asia/Shanghai'});
  try {
    await c.addInitScript(()=>{
      localStorage.setItem('theme-storage',JSON.stringify({state:{theme:'dark'},version:0}));sessionStorage.setItem('stars-above-hints-started','1');
      window.__trailStrokes=[];
      const make=CanvasRenderingContext2D.prototype.createLinearGradient,stop=CanvasGradient.prototype.addColorStop;
      CanvasRenderingContext2D.prototype.createLinearGradient=function(...coords){const g=make.apply(this,coords);g.__coords=coords;g.__stops=[];return g};
      CanvasGradient.prototype.addColorStop=function(offset,color){this.__stops?.push({offset,color});return stop.call(this,offset,color)};
      const line=Path2D.prototype.lineTo,stroke=CanvasRenderingContext2D.prototype.stroke,clear=CanvasRenderingContext2D.prototype.clearRect;
      Path2D.prototype.lineTo=function(...a){this.__segments=(this.__segments||0)+1;return line.apply(this,a)};
      CanvasRenderingContext2D.prototype.clearRect=function(...a){if(this.canvas.classList.contains('look-up-trails'))window.__trailStrokes=[];return clear.apply(this,a)};
      CanvasRenderingContext2D.prototype.stroke=function(...a){if(this.canvas.classList.contains('look-up-trails'))window.__trailStrokes.push({alpha:typeof this.strokeStyle==='string'?this.strokeStyle:{coordinates:this.strokeStyle.__coords,stops:this.strokeStyle.__stops},segments:a[0]?.__segments||0});return stroke.apply(this,a)};
    });
    const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.clock.install({time:new Date('2026-11-15T11:57:00Z')});
    await p.goto(baseUrl + '/stars-above/?skydebug=1&skyUtc=2026-11-15T11:57:00Z');await p.waitForFunction(()=>window.__sky?.lightPollution.source==='viirs');await p.waitForTimeout(700);await p.clock.pauseAt(new Date(await p.evaluate(()=>Date.now()+100)));
    await p.locator('.sky-direction-trigger').click();await p.clock.runFor(32);
    const start=await p.evaluate(()=>({camera:window.__sky.localCamera,view:window.__sky.view}));
    const dx=-start.camera.scale*Math.tan(45*Math.PI/180*Math.max(1/3,Math.cos(start.view.altitude*Math.PI/180)));
    const b=await p.locator('.look-up-sky').boundingBox(),x=b.x+b.width*.9,y=b.y+b.height*.4;
    await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+dx,y);await p.clock.runFor(32);await p.mouse.up();await p.waitForTimeout(50);await p.clock.runFor(64);
    const ramp=800*Math.log2(120),rampVirtual=60000*800/Math.LN2*119/1000;
    const holdMs=Math.round(ramp+(53520000-rampVirtual)/7200);
    const play=await p.locator('.sky-time-button').boundingBox();await p.mouse.move(play.x+play.width/2,play.y+play.height/2);await p.mouse.down();await p.clock.runFor(holdMs);await p.mouse.up();await p.clock.runFor(64);
    const result=await p.evaluate(()=>({date:window.__sky.snapshot.date.toISOString(),sunAltitude:window.__sky.snapshot.sunAltitude,twilight:window.__sky.snapshot.twilight,visibility:window.__sky.snapshot.visibility,view:window.__sky.view,camera:window.__sky.localCamera,mag:window.__sky.lightPollution.limitingMagnitude,strokes:window.__trailStrokes,meteorOpacity:getComputedStyle(document.querySelector('[data-meteor-background]')).opacity,trailsActive:document.querySelector('.look-up-sky').hasAttribute('data-trails-active'),pill:document.querySelector('.sky-time-button').parentElement.textContent}));
    await p.screenshot({path:'.cache/sky-verification/seam-day-mobile.png'});
    const gradients=result.strokes.filter(s=>typeof s.alpha==='object').map(s=>s.alpha), failures=[];
    const alphaOf=color=>Number(color.match(/, ([\d.]+)\)$/)[1]);
    const centers=[...new Set(result.strokes.map(s=>alphaOf(typeof s.alpha==='string'?s.alpha:s.alpha.stops.find(s=>s.offset===.5).color)))].sort((a,b)=>a-b);
    const key=(x,y)=>x.toFixed(6)+','+y.toFixed(6);
    const starts=new Map(gradients.map(g=>[key(g.coordinates[0],g.coordinates[1]),g]));
    let joins=0,broken=0;
    for(const g of gradients){const next=starts.get(key(g.coordinates[2],g.coordinates[3]));if(next){joins++;if(g.stops.at(-1).color!==next.stops[0].color)broken++}}
    if(gradients.length<10||joins<2||broken)failures.push('Adjacent physical segments share the exact boundary color');
    if(JSON.stringify(centers.map(a=>Math.round(a*255)))!==JSON.stringify([42,182,191]))failures.push('Original per-slice brightness levels remain at their centers');
    const segments=result.strokes.reduce((n,s)=>n+s.segments,0);
    if(segments>1500)failures.push('The original short daylight trail remains short');
    if(result.meteorOpacity!=='0'||!result.trailsActive)failures.push('Meteors remain hidden during retained trails');
    delete result.strokes;
    return {...result,holdMs,gradients:gradients.length,joins,broken,centers,segments,failures,errors};
  } finally {await c.close()}
}
