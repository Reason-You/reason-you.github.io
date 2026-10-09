// playwright-cli open http://127.0.0.1:3001/; playwright-cli run-code --filename=scripts/verify_stars_v2.cjs
async (page) => {
  const browser = page.context().browser();
  const base = await page.evaluate(() => location.origin);
  const winter = 'skyUtc=2026-01-15T13:00:00Z&skydebug=1';
  const result = { checks: [], failures: [], errors: [], physicalDevices: false };
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const check = async (name, task) => {
    try { result.checks.push({ name, result: await task() }); }
    catch (error) { result.failures.push({ name, error: String(error) }); }
  };
  const make = async (options = {}) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai', ...options });
    context.on('page', p => {
      p.on('pageerror', error => result.errors.push(error.message));
      p.on('console', message => {
        if (message.type() === 'error' && /hydration|hydrating|did not match|server rendered/i.test(message.text())) result.errors.push(message.text());
      });
    });
    const p = await context.newPage();
    await p.addInitScript(() => {
      const start = window.setTimeout.bind(window), stop = window.clearTimeout.bind(window);
      window.__timers = new Map();
      window.setTimeout = (fn, delay, ...args) => {
        const id = start(() => { window.__timers.delete(id); fn(...args); }, delay);
        window.__timers.set(id, delay); return id;
      };
      window.clearTimeout = id => { window.__timers.delete(id); stop(id); };
    });
    return { context, p };
  };
  const ready = async p => {
    await p.waitForFunction(() => window.__sky?.rendered && document.querySelector('footer time')?.dateTime === window.__sky.snapshot.date.toISOString());
    await p.waitForFunction(() => !document.querySelector('.sky-entering') && Math.abs(document.querySelector('nav').firstElementChild.getBoundingClientRect().top) < 0.1);
    await p.evaluate(() => document.fonts.ready);
  };
  const light = async (p, on) => {
    if (await p.evaluate(() => matchMedia('(pointer: coarse)').matches)) await p.locator('.campfire-toggle').tap();
    else await p.locator('.campfire-toggle').click();
    await p.waitForFunction(on => document.querySelector('.campfire-decoration').dataset.fireOn === String(on), on);
  };
  const geometry = p => p.evaluate(() => ({
    sky: document.querySelector('.look-up-sky').getBoundingClientRect().toJSON(),
    footer: document.querySelector('footer').getBoundingClientRect().toJSON(),
    overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight + 1,
    time: document.querySelector('footer time').innerText,
  }));
  const stars = p => p.evaluate(() => {
    const rect = document.querySelector('.look-up-scene').getBoundingClientRect();
    const picked = [];
    for (const entry of window.__sky.interactiveStars) {
      if (picked.every(s => Math.hypot(s.point.x - entry.point.x, s.point.y - entry.point.y) > 80)) picked.push(entry);
      if (picked.length === 3) break;
    }
    return picked.map(s => ({ x: rect.left + s.point.x, y: rect.top + s.point.y, id: s.star.id }));
  });
  const blank = p => p.mouse.click(12, 100);
  const home = async (p, mobile) => {
    if (mobile) await p.getByRole('button', { name: 'Open main menu' }).click();
    await p.locator('nav a').filter({ hasText: /^Home$/ }).last().click();
    await p.waitForFunction(() => !document.querySelector('.look-up-sky'));
  };
  const snapshotBaseline = p => p.evaluate(() => {
    const ctx = document.querySelector('.look-up-stars').getContext('2d');
    window.__baseline = { sky: window.__sky, pixels: ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data.slice(), draws: 0 };
    const clear = ctx.clearRect;
    ctx.clearRect = function(...args) { window.__baseline.draws++; return clear.apply(this, args); };
  });
  const snapshotUnchanged = p => p.evaluate(() => {
    const ctx = document.querySelector('.look-up-stars').getContext('2d');
    const data = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
    const before = window.__baseline;
    return before.sky === window.__sky && before.draws === 0 && data.length === before.pixels.length && data.every((v, i) => v === before.pixels[i]);
  });

  for (const size of [[1280,720], [1440,900], [390,844], [375,812]]) {
    const mobile = size[0] < 640;
    await check(`${size.join('x')}: home, exploration, roast, footer, location, return`, async () => {
      const { context, p } = await make({ viewport: { width: size[0], height: size[1] }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1,
        geolocation: { latitude: 40.7128, longitude: -74.006 }, permissions: ['geolocation'] });
      try {
        await p.goto(base);
        await p.evaluate(() => document.fonts.ready);
        await p.waitForTimeout(1000);
        const link = p.locator('.marshmallow-link');
        await link.waitFor();
        assert((await link.getAttribute('href')).replace(/\/$/, '') === '/stars-above', 'internal route');
        assert(await link.getAttribute('target') === null, 'same tab');
        await link.scrollIntoViewIfNeeded();
        const normal = await link.evaluate(el => ({ color: getComputedStyle(el).color, strong: getComputedStyle(el.querySelector('strong')).color, transition: getComputedStyle(el).transitionDuration }));
        assert(normal.color === 'rgb(248, 250, 252)' && normal.strong === normal.color && normal.transition === '0.4s', 'bold original color and restore timing');
        if (!mobile) {
          await link.hover();
          await p.waitForFunction(() => getComputedStyle(document.querySelector('.marshmallow-link strong')).color === 'rgb(200, 154, 107)');
          assert(await link.evaluate(el => getComputedStyle(el).transitionDuration) === '0.8s', 'dark caramel timing');
          await p.screenshot({ path: `/tmp/stars-v2-${size[0]}-caramel.png`, animations: 'allow' });
          await p.mouse.move(0, 0); await p.waitForTimeout(450);
          assert(await link.evaluate(el => getComputedStyle(el).color) === normal.color, 'restore original color');
          await p.keyboard.press('Tab'); await link.focus(); await p.waitForTimeout(850);
          assert(await link.evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none' && getComputedStyle(el.querySelector('strong')).color === 'rgb(200, 154, 107)'), 'keyboard focus');
        }
        await p.evaluate(() => {
          window.__documentMarker = 'same-document'; window.__sawEntry = false;
          new MutationObserver(() => { if (document.querySelector('.sky-entering')) window.__sawEntry = true; }).observe(document.body, { subtree: true, attributes: true });
        });
        if (mobile) await link.tap(); else await link.click();
        await p.waitForURL('**/stars-above/**');
        await p.waitForTimeout(1100);
        assert(await p.evaluate(() => window.__documentMarker === 'same-document' && window.__sawEntry), 'client navigation and existing transition');
        await p.evaluate(() => localStorage.removeItem('stars-above-star-hint-seen'));
        await p.goto(`${base}/stars-above/?${winter}`); await ready(p);
        const initial = await geometry(p);
        assert(!initial.overflow, 'viewport overflow');
        assert(initial.time === `${mobile ? 'Jan' : 'January'} 15, 2026 · 21:00 · Facing South`, 'rendered local clock');
        assert(await p.locator('.sky-clear-names').count() === 0, 'clear hidden');
        await p.waitForFunction(() => Number(getComputedStyle(document.querySelector('.look-up-star-hint')).opacity) > 0.99);
        const canHover = await p.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);
        assert((await p.locator('.look-up-star-hint').innerText()) === (canHover ? 'Hover over a bright star' : 'Tap a bright star'), 'correct exploration hint');
        await p.screenshot({ path: `/tmp/stars-v2-${size[0]}-hint-off.png`, animations: 'allow' });
        const targets = await stars(p); assert(targets.length === 3, 'three separated named stars');
        if (mobile) await p.touchscreen.tap(targets[0].x, targets[0].y);
        else await p.mouse.move(targets[0].x, targets[0].y);
        await p.waitForFunction(() => document.querySelector('.look-up-label') && localStorage.getItem('stars-above-star-hint-seen') === '1');
        await p.waitForFunction(() => Number(getComputedStyle(document.querySelector('.look-up-star-hint')).opacity) < 0.01);
        if (!mobile) await p.mouse.click(targets[0].x, targets[0].y);
        for (const target of targets.slice(1)) {
          if (mobile) await p.touchscreen.tap(target.x, target.y); else await p.mouse.click(target.x, target.y);
        }
        await p.mouse.move(0,0);
        await p.waitForFunction(() => document.querySelectorAll('.look-up-star-focus[aria-pressed="true"]').length === 3);
        assert(JSON.stringify((await geometry(p)).sky) === JSON.stringify(initial.sky), 'pinning does not resize sky');
        await snapshotBaseline(p);
        await p.evaluate(() => {
          window.__roastStart = performance.now(); window.__roastSamples = [];
          const tick = () => {
            const m = document.querySelector('.campfire-marshmallow');
            window.__roastSamples.push({ t: performance.now() - window.__roastStart, present: !!m,
              opacity: m ? Number(getComputedStyle(m).opacity) : 0,
              caramel: m ? Number(getComputedStyle(m.querySelector('.campfire-marshmallow-caramel')).opacity) : 0 });
            if (performance.now() - window.__roastStart < 4100) requestAnimationFrame(tick);
          }; requestAnimationFrame(tick);
          document.querySelector('.campfire-toggle').click();
        });
        await p.waitForFunction(() => !!document.querySelector('.campfire-marshmallow'));
        await p.waitForTimeout(350);
        await p.screenshot({ path: `/tmp/stars-v2-${size[0]}-white.png`, animations: 'allow' });
        await p.waitForFunction(() => Number(getComputedStyle(document.querySelector('.campfire-marshmallow-caramel')).opacity) > 0.65);
        await p.screenshot({ path: `/tmp/stars-v2-${size[0]}-roasted.png`, animations: 'allow' });
        await p.waitForFunction(() => !document.querySelector('.campfire-marshmallow'));
        const samples = await p.evaluate(() => window.__roastSamples);
        const first = samples.find(s => s.present), last = samples.filter(s => s.present).at(-1);
        assert(first.t >= 760 && first.t <= 1050 && last.t - first.t >= 2850 && last.t - first.t <= 3150, '800ms delay and 3s sequence');
        assert(samples.some(s => s.present && s.caramel === 0) && samples.some(s => s.caramel > 0.65), 'white to localized caramel');
        assert(await snapshotUnchanged(p), 'fire/roast does not recompute or redraw stars');
        assert(await p.locator('.look-up-star-focus[aria-pressed="true"]').count() === 3, 'roast preserves names');
        await light(p, false); await light(p, true); await p.waitForTimeout(1200);
        assert(await p.locator('.campfire-marshmallow').count() === 0, 'completed roast not replayed');
        await light(p, false);
        const label = p.getByRole('button', { name: 'Fudan sky', exact: true });
        await label.click();
        assert((await p.locator('.sky-location-popover').innerText()).includes('31.30° N, 121.50° E'), 'Fudan coordinates');
        assert(JSON.stringify((await geometry(p)).sky) === JSON.stringify(initial.sky), 'popover does not resize sky');
        await p.keyboard.press('Escape'); assert(await p.locator('.sky-location-popover').count() === 0, 'Escape closes location');
        await label.click(); await label.click(); assert(await p.locator('.sky-location-popover').count() === 0, 'trigger toggles');
        await label.click(); await p.locator('.sky-location-popover').click(); assert(await p.locator('.sky-location-popover').count() === 1, 'inside stays open');
        await blank(p); assert(await p.locator('.sky-location-popover').count() === 0, 'blank closes');
        await p.getByRole('button', { name: 'Clear names', exact: true }).click();
        await p.waitForFunction(() => !document.querySelector('.look-up-label') && !document.querySelector('.sky-clear-names'));
        assert(JSON.stringify((await geometry(p)).sky) === JSON.stringify(initial.sky), 'clearing does not resize sky');
        await p.getByRole('button', { name: 'Use my sky', exact: true }).click();
        await p.waitForFunction(() => window.__sky.observer.source === 'geolocation' && window.__sky.observer.latitude === 40.7128);
        await p.getByRole('button', { name: 'Your sky', exact: true }).click();
        assert((await p.locator('.sky-location-popover').innerText()).includes('40.71° N, 74.01° W'), 'visitor location');
        await p.keyboard.press('Escape');
        await p.getByRole('button', { name: 'Back to Fudan sky', exact: true }).click();
        await p.waitForFunction(() => window.__sky.observer.source === 'default');
        await home(p, mobile);
        await p.waitForTimeout(850);
        assert((await p.locator('footer').innerText()).includes('Last updated:') && (await p.locator('footer').innerText()).includes('Built with PRISM'), 'Home footer unchanged');
        assert(await p.locator('.look-up-exit-ghost').count() === 0, 'exit cleaned');
        await p.locator('.marshmallow-link').click(); await p.waitForTimeout(1100);
        assert(await p.locator('.campfire-toggle').getAttribute('aria-pressed') === 'false', 'reentry fire off');
        assert(await p.locator('.look-up-star-hint').evaluate(el => getComputedStyle(el).opacity) === '0', 'hint persists');
        return { initial, roastDelay: first.t, roastDuration: last.t - first.t };
      } finally { await context.close(); }
    });
  }

  await check('cancellation, replay, timeout cleanup, multi-name toggle and keyboard', async () => {
    const { context, p } = await make();
    try {
      await p.goto(`${base}/stars-above/?${winter}`); await ready(p);
      await light(p, true); await p.waitForTimeout(300); await light(p, false); await p.waitForTimeout(1100);
      assert(await p.locator('.campfire-marshmallow').count() === 0, 'cancel during ignition wait');
      await light(p, true); await p.waitForFunction(() => !!document.querySelector('.campfire-marshmallow'));
      await p.waitForTimeout(1000); await light(p, false);
      await p.waitForFunction(() => !document.querySelector('.campfire-marshmallow'));
      await light(p, true); await p.waitForFunction(() => !!document.querySelector('.campfire-marshmallow'));
      await p.waitForFunction(() => !document.querySelector('.campfire-marshmallow'));
      await light(p, false); await light(p, true); await p.waitForTimeout(1300);
      assert(await p.locator('.campfire-marshmallow').count() === 0, 'once after completed replay');
      await light(p, false);
      const targets = await stars(p);
      for (const target of targets) await p.mouse.click(target.x, target.y);
      await p.mouse.click(targets[0].x, targets[0].y); await p.waitForTimeout(250);
      assert(await p.locator('.look-up-label').count() === 2, 'individual unpin');
      await blank(p); assert(await p.locator('.look-up-star-focus[aria-pressed="true"]').count() === 2, 'blank preserves');
      const star = p.locator('.look-up-star-focus').first(); await star.focus(); await p.keyboard.press('Escape');
      await p.waitForFunction(() => !document.querySelector('.look-up-label'));
      await p.keyboard.press('Enter'); assert(await star.getAttribute('aria-pressed') === 'true', 'Enter pins');
      await p.keyboard.press('Space'); assert(await star.getAttribute('aria-pressed') === 'false', 'Space unpins');
      await p.locator('.campfire-toggle').focus(); await p.keyboard.press('Enter');
      assert(await p.locator('.campfire-toggle').getAttribute('aria-pressed') === 'true', 'keyboard ignites');
      await p.keyboard.press('Space'); assert(await p.locator('.campfire-toggle').getAttribute('aria-pressed') === 'false', 'keyboard extinguishes');
      await p.reload(); await ready(p);
      await light(p, true); await p.waitForFunction(() => !!document.querySelector('.campfire-marshmallow'));
      await p.evaluate(() => { window.__detached = document.querySelector('.campfire-decoration'); });
      await home(p, false); await p.waitForTimeout(900);
      assert(await p.evaluate(() => window.__detached.getAnimations({ subtree: true }).length === 0 && ![...window.__timers.values()].includes(3000)), 'unmount clears animation and roast timeout');
      return true;
    } finally { await context.close(); }
  });

  await check('light theme, reduced motion and static roast', async () => {
    const { context, p } = await make({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      await p.addInitScript(() => localStorage.setItem('theme-storage', JSON.stringify({ state: { theme: 'light' }, version: 0 })));
      await p.goto(base); await p.locator('.marshmallow-link').waitFor();
      assert(await p.evaluate(() => document.documentElement.classList.contains('light')), 'persisted light theme');
      await p.keyboard.press('Tab'); await p.locator('.marshmallow-link').focus(); await p.waitForTimeout(850);
      assert(await p.locator('.marshmallow-link strong').evaluate(el => getComputedStyle(el).color) === 'rgb(154, 107, 63)', 'light caramel contrast');
      await p.locator('.marshmallow-link').click(); await p.waitForTimeout(400);
      assert(await p.locator('.sky-entering').count() === 0, 'no reduced route motion');
      await p.goto(`${base}/stars-above/?${winter}`); await ready(p);
      await light(p, true); await p.waitForFunction(() => !!document.querySelector('.campfire-marshmallow.m-static'));
      assert(await p.locator('.campfire-marshmallow').evaluate(el => el.getAnimations({ subtree: true }).length === 0), 'static marshmallow');
      assert(await p.locator('.campfire-marshmallow-caramel').evaluate(el => getComputedStyle(el).opacity) === '0.85', 'light caramel already roasted');
      const still = await p.evaluate(() => new Promise(resolve => {
        const c = document.querySelector('.look-up-scene canvas'), pixels = c.toDataURL();
        setTimeout(() => resolve(c.toDataURL() === pixels), 300);
      })); assert(still, 'reduced meteors static');
      await p.waitForFunction(() => !document.querySelector('.campfire-marshmallow'));
      await light(p,false); await light(p,true); await p.waitForTimeout(1100);
      assert(await p.locator('.campfire-marshmallow').count() === 0, 'reduced roast once');
      await home(p,true); assert(await p.locator('.look-up-exit-ghost').count() === 0, 'no reduced exit ghost');
      return true;
    } finally { await context.close(); }
  });

  await check('custom places, UTC/local times, real clock, no-bright-star hint and persistent storage', async () => {
    const { context, p } = await make({ timezoneId: 'America/New_York' });
    try {
      await p.goto(`${base}/stars-above/?${winter}&lat=-24.95&lon=15.99`); await ready(p);
      assert(await p.locator('footer time').innerText() === 'January 15, 2026 · 08:00 · Facing South', 'system timezone distinct from longitude');
      await p.getByRole('button', { name: 'Custom sky', exact: true }).click();
      assert((await p.locator('.sky-location-popover').innerText()).includes('24.95° S, 15.99° E'), 'custom coordinate signs');
      await p.goto(`${base}/stars-above/?sky=2026-01-15T08:00&skydebug=1`); await ready(p);
      assert(await p.locator('footer time').innerText() === 'January 15, 2026 · 08:00 · Facing South', 'local fixed time');
      const target = (await stars(p))[0]; await p.mouse.move(target.x,target.y);
      await p.waitForFunction(() => localStorage.getItem('stars-above-star-hint-seen') === '1');
      await p.reload(); await ready(p); assert(await p.locator('.look-up-star-hint').evaluate(el => getComputedStyle(el).opacity) === '0', 'refresh persistence');
      await p.evaluate(() => localStorage.removeItem('stars-above-star-hint-seen'));
      await p.goto(`${base}/stars-above/?${winter}&mag=-10`); await ready(p);
      assert(await p.locator('.look-up-star-focus').count() === 0 && await p.locator('.look-up-star-hint').evaluate(el => getComputedStyle(el).opacity) === '0', 'no interactive stars hides hint');
      await p.goto(`${base}/stars-above/?skydebug=1`); await ready(p);
      assert(await p.evaluate(() => Math.abs(Date.now() - window.__sky.snapshot.date.getTime()) < 20000), 'current rendered clock');
      await p.waitForFunction(() => window.__sky.lightPollution.source === 'viirs');
      const meteor = await p.evaluate(() => new Promise(resolve => {
        const m = document.querySelector('.look-up-scene canvas'), s = document.querySelector('.look-up-stars');
        const ctx = m.getContext('2d'), original = ctx.moveTo, points = [], b = s.toDataURL();
        ctx.moveTo = function(x, y) { points.push([x, y]); return original.call(this, x, y); };
        setTimeout(() => {
          ctx.moveTo = original;
          resolve({ moving: points.length > 6 && new Set(points.map(p => p.join(','))).size > 6, stars: s.toDataURL() === b });
        }, 450);
      })); assert(meteor.moving && meteor.stars,'meteors move independently');
      for(const route of ['research','cv']) {
        await p.goto(`${base}/${route}/`);
        assert((await p.locator('footer').innerText()).includes('Last updated:') && (await p.locator('footer').innerText()).includes('Built with PRISM') && await p.locator('.sky-clear-names').count()===0,'other page footer unchanged');
      }
      return true;
    } finally { await context.close(); }
  });
  await check('seven-minute snapshot cadence, bounded embers and reduced hint', async () => {
    const { context, p } = await make();
    try {
      await p.clock.install({ time: '2026-01-15T13:00:00Z' });
      await p.goto(`${base}/stars-above/?skydebug=1`); await ready(p);
      const before = await p.evaluate(() => window.__sky.snapshot.date.getTime());
      await p.clock.fastForward(421000);
      await p.waitForFunction(before => window.__sky.snapshot.date.getTime() >= before + 420000 && document.querySelector('footer time').dateTime === window.__sky.snapshot.date.toISOString(), before);
      await p.goto(`${base}/stars-above/?${winter}`); await ready(p);
      await p.clock.resume();
      await light(p, true); await p.waitForFunction(() => !!document.querySelector('.campfire-ember'));
      assert(await p.locator('.campfire-ember').count() <= 3, 'bounded embers');
      await light(p, false); await p.waitForTimeout(4000);
      assert(await p.locator('.campfire-ember').count() === 0 && await p.locator('.campfire-decoration').evaluate(el => el.getAnimations({subtree:true}).length === 0), 'embers finish without spawning and fire rests');
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await p.evaluate(() => localStorage.removeItem('stars-above-star-hint-seen'));
      await p.reload(); await ready(p);
      const target = (await stars(p))[0]; await p.mouse.move(target.x, target.y);
      await p.waitForFunction(() => localStorage.getItem('stars-above-star-hint-seen') === '1');
      return true;
    } finally { await context.close(); }
  });

  await check('preview scenes and intermediate footer widths', async () => {
    const { context, p } = await make();
    try {
      const scenes = [
        'skyUtc=2026-01-15T13:00:00Z',
        'skyUtc=2026-07-15T13:00:00Z',
        'skyUtc=2026-01-15T04:00:00Z',
        'lat=-24.77&lon=15.96&skyUtc=2026-05-15T20:00:00Z',
      ];
      const evidence = [];
      for (const query of scenes) {
        await p.goto(`${base}/stars-above/?${query}&skydebug=1`); await ready(p);
        await p.waitForFunction(() => window.__sky.lightPollution.source === 'viirs');
        evidence.push(await p.evaluate(() => ({ observer: window.__sky.observer, date: window.__sky.snapshot.date.toISOString(), named: window.__sky.interactiveStars.length, magnitude: window.__sky.lightPollution.limitingMagnitude, time: document.querySelector('footer time').innerText })));
      }
      for (const width of [640, 768]) {
        await p.setViewportSize({ width, height: 844 }); await p.waitForTimeout(200);
        assert(!(await geometry(p)).overflow, `footer fits at ${width}px`);
      }
      return evidence;
    } finally { await context.close(); }
  });

  const inputDevices = [
    { name: 'desktop mouse', width: 1280, height: 720, touch: false },
    { name: 'phone touch', width: 390, height: 844, touch: true },
    { name: 'tablet touch 768', width: 768, height: 1024, touch: true },
    { name: 'tablet touch 820', width: 820, height: 1180, touch: true },
    { name: 'narrow desktop mouse', width: 390, height: 844, touch: false },
  ];
  for (const device of inputDevices) {
    await check(`${device.name}: input hint, successful discovery and persistence`, async () => {
      const { context, p } = await make({ viewport: { width: device.width, height: device.height }, isMobile: device.touch, hasTouch: device.touch });
      try {
        await p.goto(`${base}/stars-above/?${winter}`); await ready(p);
        await p.waitForFunction(() => Number(getComputedStyle(document.querySelector('.look-up-star-hint')).opacity) > 0.99);
        const capabilities = await p.evaluate(() => ({ hover: matchMedia('(hover: hover)').matches, fine: matchMedia('(pointer: fine)').matches, coarse: matchMedia('(pointer: coarse)').matches }));
        const expected = device.touch ? 'Tap a bright star' : 'Hover over a bright star';
        assert(await p.locator('.look-up-star-hint').innerText() === expected, 'input capability, not viewport width');
        assert(capabilities.coarse === device.touch && capabilities.hover !== device.touch, 'emulated primary input');
        assert(await p.evaluate(() => localStorage.getItem('stars-above-star-hint-seen') === null), 'showing hint is not completion');
        const target = (await stars(p))[0];
        if (device.touch) await p.touchscreen.tap(target.x, target.y); else await p.mouse.move(target.x, target.y);
        await p.waitForFunction(() => document.querySelector('.look-up-label [lang="zh-CN"]')?.textContent.trim() && localStorage.getItem('stars-above-star-hint-seen') === '1');
        await p.waitForFunction(() => Number(getComputedStyle(document.querySelector('.look-up-star-hint')).opacity) < 0.01);
        await p.reload(); await ready(p);
        assert(await p.locator('.look-up-star-hint').evaluate(el => getComputedStyle(el).opacity) === '0', 'seen hint stays retired after refresh');
        return { ...capabilities, text: expected };
      } finally { await context.close(); }
    });
  }

  const sampleQuery = 'lat=31.30&lon=121.50&skyUtc=2026-01-15T13:00:00Z&skydebug=1';
  const fullQuery = `${sampleQuery}&sky=2026-01-15T22:00&bortle=2&mag=5.5&note=tea%20%26%20cream%2Bmilk&tag=one&tag=two&label=%E6%98%9F%E7%A9%BA`;
  const navigationCases = [
    { name: 'plain mouse', query: '', activation: 'click' },
    { name: 'sample mouse', query: sampleQuery, activation: 'click' },
    { name: 'all parameters keyboard', query: fullQuery, activation: 'keyboard' },
    { name: 'local time phone tap', query: 'lat=31.30&lon=121.50&sky=2026-01-15T21:00&bortle=4&skydebug=1', activation: 'tap' },
    { name: 'all parameters new tab', query: fullQuery, activation: 'middle' },
    { name: 'plain new tab', query: '', activation: 'middle' },
    { name: 'changed query keyboard', query: sampleQuery, changedQuery: fullQuery, activation: 'keyboard' },
  ];
  for (const scenario of navigationCases) {
    await check(`${scenario.name}: About link query preservation`, async () => {
      const touch = scenario.activation === 'tap';
      const { context, p } = await make({ viewport: { width: touch ? 390 : 1280, height: touch ? 844 : 720 }, isMobile: touch, hasTouch: touch });
      try {
        await p.goto(`${base}/${scenario.query ? `?${scenario.query}` : ''}`);
        const query = scenario.changedQuery ?? scenario.query;
        if (scenario.changedQuery) await p.evaluate(q => history.replaceState(null, '', `${location.pathname}?${q}`), scenario.changedQuery);
        const expected = await p.evaluate(q => [...new URLSearchParams(q).entries()], query);
        await p.waitForFunction(expected => {
          const link = document.querySelector('.marshmallow-link');
          return link && JSON.stringify([...new URL(link.href).searchParams.entries()]) === JSON.stringify(expected);
        }, expected);
        const link = p.locator('.marshmallow-link');
        assert((await link.innerText()) === 'Let’s roast marshmallows at the end of the universe!', 'original sentence');
        await link.scrollIntoViewIfNeeded();
        await p.waitForTimeout(900);
        await p.evaluate(() => {
          window.__documentMarker = 'query-navigation'; window.__sawEntry = false;
          new MutationObserver(() => { if (document.querySelector('.sky-entering')) window.__sawEntry = true; }).observe(document.body, { subtree: true, attributes: true });
        });
        const sourceUrl = p.url();
        let destination = p;
        if (scenario.activation === 'middle') {
          const opened = context.waitForEvent('page');
          await link.click({ button: 'middle' }); destination = await opened;
        } else if (scenario.activation === 'keyboard') {
          await p.keyboard.press('Tab'); await link.focus(); await p.keyboard.press('Enter');
        } else if (touch) await link.tap();
        else await link.click();
        await destination.waitForURL(url => url.pathname.replace(/\/$/, '') === '/stars-above');
        const received = await destination.evaluate(() => [...new URL(location.href).searchParams.entries()]);
        assert(JSON.stringify(received) === JSON.stringify(expected), 'all query entries preserved once, including duplicate keys and encoded values');
        if (scenario.activation === 'middle') assert(p.url() === sourceUrl, 'new tab leaves Home intact');
        else {
          await destination.waitForTimeout(1100);
          assert(await destination.evaluate(() => window.__documentMarker === 'query-navigation' && window.__sawEntry), 'client routing with sky transition');
        }
        await destination.waitForFunction(() => !!document.querySelector('footer time')?.dateTime);
        if (query) {
          await ready(destination);
          const frame = await destination.evaluate(() => ({ date: window.__sky.snapshot.date.toISOString(), observer: window.__sky.observer, pollution: window.__sky.lightPollution }));
          assert(frame.date === '2026-01-15T13:00:00.000Z' && frame.observer.latitude === 31.3 && frame.observer.longitude === 121.5, 'URL time and observer applied');
          if (query.includes('mag=')) assert(frame.pollution.limitingMagnitude === 5.5 && frame.pollution.source === 'override', 'mag preserved and takes precedence over bortle');
          if (scenario.activation === 'tap') assert(frame.pollution.bortleApprox === 4, 'bortle preserved');
        }
        return { activation: scenario.activation, entries: expected.length };
      } finally { await context.close(); }
    });
  }

  result.ok = !result.failures.length && !result.errors.length;
  return result;
}
