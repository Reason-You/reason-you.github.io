async page => {
  const browser=page.context().browser(),base=await page.evaluate(()=>location.origin);
  const capture=await page.evaluate(()=>new URLSearchParams(location.search).get('screenshots')==='1');
  const directory='.cache/campfire-log';
  const ids=['cosmic-roaster','still-hungry','phd-in-marshmallows','the-answer-was-marshmallows','halfway-to-the-end-of-the-universe','64-bit-sugar-rush','three-quarters-still-here','88-constellations-one-campfire','just-one-more','at-the-end-of-the-universe','four-skies-one-campfire','a-little-too-close-to-the-sun'];
  const names=['Cosmic Roaster','Still Hungry?','Ph.D. in Marshmallows','The Answer Was Marshmallows','Halfway to the End of the Universe','64-bit Sugar Rush','Three Quarters. Still Here?','88 Constellations, One Campfire','Just One More.','At the End of the Universe','Four Skies, One Campfire','A Little Too Close to the Sun'];
  const milestones=[10,20,30,42,50,64,75,88,99,100],key='stars-above-achievements-v1';
  const report={checks:[],failures:[],errors:[],captures:[]};
  const assert=(v,m)=>{if(!v)throw new Error(m)};
  const ready=p=>p.waitForFunction(()=>window.__sky?.rendered&&window.__sky.lightPollution.source==='viirs');
  const shot=async(p,name)=>{if(capture){const path=`${directory}/${name}.png`;await p.screenshot({path,scale:'css',animations:'disabled'});report.captures.push(path)}};
  const setup=async({width=1440,theme='dark',record=null,clock=false,deny=false}={})=>{
    const context=await browser.newContext({viewport:{width,height:width<640?844:900},deviceScaleFactor:2,isMobile:width<640,hasTouch:width<640,reducedMotion:'reduce',timezoneId:'Asia/Shanghai'});
    await context.addInitScript(({theme,record,key,deny})=>{
      localStorage.setItem('theme-storage',JSON.stringify({state:{theme},version:0}));
      if(record!==null)localStorage.setItem(key,typeof record==='string'?record:JSON.stringify(record));
      window.__roastRoll=.99;Math.random=()=>window.__roastRoll;
      if(deny){Storage.prototype.getItem=function(){throw new Error('Storage disabled')};Storage.prototype.setItem=function(){throw new Error('Storage disabled')};}
    },{theme,record,key,deny});
    const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
    if(clock)await p.clock.install({time:new Date('2026-01-15T13:00:00Z')});
    await p.goto(`${base}/stars-above/?skyUtc=2026-01-15T13:00:00Z&skydebug=1`);await ready(p);await p.evaluate(()=>document.fonts.ready);
    if(clock)await p.clock.runFor(1300);else await p.waitForTimeout(1100);
    return {p,context};
  };
  const check=async(name,options,task)=>{
    let context;
    try{const setupResult=await setup(options);context=setupResult.context;report.checks.push({name,result:await task(setupResult.p,context)})}
    catch(e){report.failures.push({name,error:String(e)})}finally{await context?.close()}
  };
  const seed=n=>({version:1,unlocked:Object.fromEntries(ids.slice(0,n).map(id=>[id,'2026-01-15T13:00:00.000Z'])),recentId:n?ids[n-1]:null});
  const phase=async(p,selector)=>{await p.waitForSelector(`.campfire-marshmallow.m-${selector}`)};
  const count=async(p,n)=>{await p.waitForFunction(n=>document.querySelector('.campfire-count')?.textContent===`${n===1?'Marshmallow':'Marshmallows'} · ${n}`,n)};
  const next=async p=>{
    for(let i=0;i<12;i++){
      const state=await p.evaluate(()=>document.querySelector('.campfire-marshmallow')?.className.match(/m-(idle|entering|roasting|ready|eating|retreat)/)?.[1]??'idle');
      if(state==='ready')return;
      await p.clock.runFor(state==='roasting'?710:state==='entering'?210:510);
    }
    throw new Error('marshmallow did not reach ready');
  };
  const light=async p=>{await p.locator('.campfire-toggle').click();await next(p)};
  const bite=async(p,n)=>{await p.evaluate(()=>{window.__beforeBiteSky=window.__sky});await p.getByRole('button',{name:'Eat roasted marshmallow',exact:true}).click();await phase(p,'eating');await p.clock.runFor(270);await count(p,n);assert(await p.evaluate(()=>window.__beforeBiteSky===window.__sky),'confirmed bite and discovery do not redraw sky')};

  for(const width of [1440,390])for(const theme of ['dark','light']){
    await check(`${width}px ${theme}: first log, twelve hidden slots, close/focus/layout`,{width,theme},async p=>{
      await p.evaluate(()=>{window.__baselineSky=window.__sky;const canvas=document.querySelector('.look-up-stars');window.__baselineCanvas=[canvas.width,canvas.height];});
      const trigger=p.getByRole('button',{name:'Achievements',exact:true});assert(await trigger.isVisible(),'entry always visible');
      await trigger.click();const log=p.getByRole('dialog',{name:'Campfire Log'});await log.waitFor();
      assert((await log.innerText()).includes('0 / 12 discovered'),'zero discoveries');assert(await log.locator('li').count()===12,'twelve slots');
      assert((await log.locator('li').allTextContents()).every(t=>t==='???'),'locked text only');assert(await log.locator('.campfire-discovery').count()===0,'locked slots have no buttons');assert(await log.locator('.achievement-icon').count()===0,'locked slots do not expose icons');
      for(const name of names)assert(!(await log.innerText()).includes(name),'hidden name not exposed');
      assert(await p.getByRole('button',{name:'Close Campfire Log'}).evaluate(el=>el===document.activeElement),'opening moves keyboard focus');
      const geometry=await log.evaluate(el=>({box:el.getBoundingClientRect().toJSON(),width:innerWidth,height:innerHeight,sky:document.querySelector('.look-up-sky').getBoundingClientRect().toJSON(),canvas:[document.querySelector('.look-up-stars').width,document.querySelector('.look-up-stars').height],sameSky:window.__sky===window.__baselineSky,overflow:document.documentElement.scrollWidth>innerWidth}));
      assert(geometry.box.width<=390&&geometry.box.right<=width&&geometry.box.height<=geometry.sky.height*.7+1&&!geometry.overflow,'popup geometry');assert(geometry.sameSky&&JSON.stringify(geometry.canvas)===JSON.stringify(await p.evaluate(()=>window.__baselineCanvas)),'opening does not redraw/resize sky');
      await shot(p,`log-${width}-${theme}-empty`);
      await p.keyboard.press('Escape');await log.waitFor({state:'detached'});assert(await trigger.evaluate(el=>el===document.activeElement),'Escape focus return');
      await trigger.click();await log.waitFor();await p.locator('.look-up-sky').click({position:{x:4,y:300}});await log.waitFor({state:'detached'});
      await trigger.click();await log.waitFor();await trigger.click();await log.waitFor({state:'detached'});
      await trigger.click();await log.waitFor();await p.getByRole('button',{name:'Close Campfire Log'}).click();await log.waitFor({state:'detached'});return geometry;
    });
  }
  for(const width of [1440,390]){
    await check(`${width}px: three discoveries, selection, full names, scroll isolation`,{width,record:seed(3)},async p=>{
      await p.getByRole('button',{name:'Achievements',exact:true}).click();const log=p.getByRole('dialog',{name:'Campfire Log'});await log.waitFor();
      assert((await log.innerText()).includes('3 / 12 discovered'),'three restored');assert((await log.locator('.campfire-log-selection').innerText()).includes(names[2]),'most recent selected');
      assert(await log.locator('.campfire-discovery-locked').count()===9,'remaining questions');assert(await log.locator('.campfire-discovery .achievement-icon').count()===3,'each unlocked achievement has its own icon');
      const fonts=await log.evaluate(el=>({body:getComputedStyle(document.body).fontFamily,panel:getComputedStyle(el).fontFamily,title:getComputedStyle(el.querySelector('h2')).fontFamily,selected:getComputedStyle(el.querySelector('h3')).fontFamily}));assert(fonts.body===fonts.panel&&fonts.body===fonts.title&&fonts.body===fonts.selected,'main-site interface font');await shot(p,`log-${width}-three-phd`);
      await log.getByRole('button',{name:/Cosmic Roaster/}).click();assert((await log.locator('.campfire-log-selection').innerText()).includes(names[0]),'select another record');
      await log.getByRole('button',{name:/Ph.D. in Marshmallows/}).click();await shot(p,`log-${width}-selected-phd`);
      await log.getByRole('button',{name:/Cosmic Roaster/}).focus();await p.keyboard.press('Tab');await p.keyboard.press('Enter');
      assert((await log.locator('.campfire-log-selection').innerText()).includes(names[1]),'keyboard list selection');
      assert(await p.evaluate(()=>!document.querySelector('.campfire-decoration').dataset.fireOn.includes('true')),'log clicks do not light fire');return true;
    });
    await check(`${width}px: selected 42 and long discovery with internally scrolling list`,{width,record:seed(12)},async p=>{
      await p.getByRole('button',{name:'Achievements',exact:true}).click();const log=p.getByRole('dialog',{name:'Campfire Log'});await log.waitFor();
      assert((await log.innerText()).includes('12 / 12 discovered'),'all restored');
      await log.getByRole('button',{name:/The Answer Was Marshmallows/}).click();await shot(p,`log-${width}-selected-42`);
      await log.getByRole('button',{name:/Halfway to the End of the Universe/}).click();await shot(p,`log-${width}-long-name`);
      const scroll=await log.locator('.campfire-discoveries').evaluate(el=>{const before=scrollY;el.scrollTop=el.scrollHeight;return {inner:el.scrollTop,outer:scrollY-before,overflow:el.scrollHeight>el.clientHeight}});
      assert(scroll.overflow&&scroll.inner>0&&scroll.outer===0,'only list scrolls');await shot(p,`log-${width}-scrolled`);
      assert((await log.locator('.campfire-discovery').allTextContents()).every((t,i)=>t.includes(names[i])),'all names intact');return scroll;
    });
  }
  await check('count survives relighting; direction progress restarts; refresh resets only the visit tally', {clock:true}, async p=>{
    await light(p);await bite(p,1);await next(p);await p.locator('.sky-direction-trigger').click();await p.waitForFunction(()=>window.__sky.facing==='west');await bite(p,2);
    await p.locator('.campfire-toggle').click();await count(p,2);await p.clock.runFor(300);await p.locator('.sky-direction-trigger').click();await p.waitForFunction(()=>window.__sky.facing==='north');
    await light(p);await bite(p,3);await next(p);await p.locator('.sky-direction-trigger').click();await p.waitForFunction(()=>window.__sky.facing==='east');await bite(p,4);
    assert(await p.evaluate(key=>!JSON.parse(localStorage.getItem(key)||'null')?.unlocked['four-skies-one-campfire'],key),'directions from the previous fire do not qualify');
    await next(p);await p.locator('.sky-direction-trigger').click();await p.waitForFunction(()=>window.__sky.facing==='south');await bite(p,5);await next(p);await p.locator('.sky-direction-trigger').click();await p.waitForFunction(()=>window.__sky.facing==='west');await bite(p,6);
    await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'null')?.unlocked['four-skies-one-campfire'],key);
    await p.locator('.campfire-toggle').click();await count(p,6);await p.reload();await ready(p);await p.clock.runFor(1200);
    assert(await p.locator('.campfire-count').count()===0,'refresh starts a new visit count');await p.getByRole('button',{name:'Achievements',exact:true}).click();assert((await p.getByRole('dialog').innerText()).includes('1 / 12 discovered'),'refresh keeps permanent discovery');return true;
  });
  await check('120 confirmed bites, all twelve discoveries, silent 40, direction-at-click and delayed discovery', {clock:true},async(p,context)=>{
    await p.evaluate(()=>{window.__gameSky=window.__sky;window.__canvasDraws=0;const ctx=document.querySelector('.look-up-stars').getContext('2d');const clear=ctx.clearRect;ctx.clearRect=function(...args){window.__canvasDraws++;return clear.apply(this,args)}});
    await light(p);const milestonesSeen=[];
    for(let n=1;n<=120;n++){
      if(n===2||n===3||n===40){await p.locator('.sky-direction-trigger').click();await p.waitForFunction(f=>window.__sky.facing===f,n===2?'west':n===3?'north':'east');}
      if(n===5)await p.evaluate(()=>window.__roastRoll=.99);
      assert(await p.locator('.campfire-marshmallow').getAttribute('data-burnt')===(n===5?'true':'false'),'single burnt fifth roast; protected milestones stay normal');
      if(n===40){
        await p.getByRole('button',{name:'Eat roasted marshmallow',exact:true}).click();await phase(p,'eating');
        await p.locator('.sky-direction-trigger').click();await p.waitForFunction(()=>window.__sky.facing==='south');
        await p.clock.runFor(270);await count(p,n);
        assert(await p.locator('.campfire-notification').count()===0,'fortieth bite silent');
        assert(await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).unlocked['four-skies-one-campfire']!==undefined,key),'four directions completed at click even after turning during bite');
        await shot(p,'campfire-forty-silent');
        await p.locator('.campfire-toggle').click();await count(p,40);await p.clock.runFor(300);await light(p);
        assert(await p.locator('.campfire-notification').count()===0,'fortieth tally stays quiet after relighting');
      }else await bite(p,n);
      if(milestones.includes(n)){
        const i=milestones.indexOf(n);await p.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key)||'null')?.unlocked[id],{key,id:ids[i]});
        await p.waitForFunction(name=>document.querySelector('.campfire-notification')?.textContent.includes(name),names[i]);milestonesSeen.push({count:n,name:names[i]});
        if(n===10){await p.clock.runFor(200);await shot(p,'campfire-unlocked-ten');}
      }
      if(n===41){await p.waitForFunction(()=>document.querySelector('.campfire-notification')?.textContent.includes('Four Skies, One Campfire'));await p.clock.runFor(200);await shot(p,'campfire-four-skies-deferred');}
      if(n===4)await p.evaluate(()=>window.__roastRoll=0);
      if(n<120)await next(p);
    }
    const record=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);assert(Object.keys(record.unlocked).length===12&&ids.every(id=>record.unlocked[id]),'all twelve earned through gameplay; no quantity discoveries above 100');
    await p.locator('.campfire-toggle').click();await count(p,120);assert(await p.evaluate(key=>Object.keys(JSON.parse(localStorage.getItem(key)).unlocked).length,key)===12,'extinguishing preserves achievements and the visit tally');
    await p.reload();await ready(p);await p.clock.runFor(1200);assert(await p.locator('.campfire-count').count()===0,'reload resets only the visit tally');await p.getByRole('button',{name:'Achievements',exact:true}).click();assert((await p.getByRole('dialog').innerText()).includes('12 / 12 discovered'),'reload retains permanent record');
    await p.keyboard.press('Escape');await p.locator('nav a').filter({hasText:/^Home$/}).last().click();await p.waitForURL(url=>url.pathname==='/');
    assert(await p.getByRole('button',{name:'Achievements',exact:true}).count()===0,'entry scoped to Stars Above');await p.locator('.marshmallow-link').click();await ready(p);
    await p.getByRole('button',{name:'Achievements',exact:true}).click();assert((await p.getByRole('dialog').innerText()).includes('12 / 12 discovered'),'return retains discoveries');
    return {milestonesSeen,record};
  });
  await check('burnt fifth roast, one-time result, edible count, hint/achievement queue, no reaward', {clock:true},async p=>{
    await light(p);
    for(let n=1;n<=4;n++){await bite(p,n);if(n<4)await next(p)}
    await p.evaluate(()=>window.__roastRoll=0);await next(p);assert(await p.locator('.campfire-marshmallow').getAttribute('data-burnt')==='true','fifth roast burns');
    await p.waitForFunction(()=>document.querySelector('.campfire-notification')?.textContent.includes('A little too close to the Sun.'));await p.clock.runFor(200);await shot(p,'campfire-burnt-ready');
    await p.evaluate(()=>window.__roastRoll=.99);assert(await p.locator('.campfire-marshmallow').getAttribute('data-burnt')==='true','draw stable through ready');await bite(p,5);
    assert((await p.locator('.campfire-notification').innerText()).includes('A little too close to the Sun.'),'existing hint is not overwritten');
    await p.clock.runFor(2700);await p.waitForFunction(()=>document.querySelector('.campfire-notification')?.textContent.includes('A Little Too Close to the Sun'));await p.clock.runFor(200);await shot(p,'campfire-burnt-unlocked');
    const record=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);assert(Object.keys(record.unlocked).length===1&&record.unlocked[ids[11]],'first burnt discovery');
    await p.locator('.campfire-toggle').click();await count(p,5);await p.clock.runFor(300);await p.evaluate(()=>window.__roastRoll=0);await light(p);
    for(let n=6;n<=10;n++){
      assert(await p.locator('.campfire-marshmallow').getAttribute('data-burnt')==='false','first four of a new fire and cumulative milestone ten are normal');await bite(p,n);await next(p);
    }
    assert(await p.locator('.campfire-marshmallow').getAttribute('data-burnt')==='true','eligible eleventh cumulative roast can burn');await bite(p,11);await p.clock.runFor(3500);
    assert(await p.locator('.campfire-notification-name').count()===0,'burnt achievement does not reappear');
    const repeated=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);assert(Object.keys(repeated.unlocked).length===2&&repeated.unlocked[ids[11]]===record.unlocked[ids[11]]&&repeated.unlocked[ids[0]],'burnt timestamp retained; quantity ten earned across ignitions');return repeated;
  });
  await check('quantity and four-direction discoveries queue in priority order',{clock:true},async p=>{
    await light(p);
    for(let n=1;n<=10;n++){
      if([2,3,10].includes(n)){await p.locator('.sky-direction-trigger').click();await p.waitForFunction(f=>window.__sky.facing===f,n===2?'west':n===3?'north':'east');}
      await bite(p,n);if(n<10)await next(p);
    }
    assert((await p.locator('.campfire-notification-name').innerText())===names[0],'quantity first');
    await p.clock.runFor(2700);await p.waitForFunction(()=>document.querySelector('.campfire-notification-name')?.textContent==='Four Skies, One Campfire');return true;
  });
  for(const [label,options] of [['malformed storage',{record:'{bad json'}],['old version',{record:{version:0,unlocked:ids}}],['disabled storage',{deny:true,clock:true}]]){
    await check(label,options,async p=>{
      await p.getByRole('button',{name:'Achievements',exact:true}).click();assert((await p.getByRole('dialog').innerText()).includes('0 / 12 discovered'),'fresh usable log');await p.keyboard.press('Escape');
      if(options.deny){
        await light(p);for(let n=1;n<=10;n++){await bite(p,n);if(n<10)await next(p)}
        await p.locator('.campfire-toggle').click();await p.getByRole('button',{name:'Achievements',exact:true}).click();
        await p.waitForFunction(()=>document.querySelector('.campfire-log-total')?.textContent==='1 / 12 discovered');
        assert((await p.getByRole('dialog').innerText()).includes('Cosmic Roaster'),'unavailable storage retains in-memory discovery');
      }else{await p.locator('.campfire-toggle').click();await p.waitForSelector('.campfire-marshmallow.m-ready');await p.getByRole('button',{name:'Eat roasted marshmallow',exact:true}).click();await count(p,1)}
      return true;
    });
  }
  report.ok=!report.failures.length&&!report.errors.length;return report;
}