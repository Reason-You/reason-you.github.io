async (page) => {
  const browser = page.context().browser();
  const base = 'http://127.0.0.1:3001';
  const directory = '.cache/campfire';
  const query = 'lat=31.2989&lon=121.5035&skyUtc=2026-01-15T13:00:00Z&skydebug=1';
  const report = { physicalDeviceTesting: false, browser: 'Chromium', captures: [], checks: [], failures: [], pageErrors: [] };
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const check = async (name, task) => {
    try { const result = await task(); report.checks.push({ name, passed: true, result }); }
    catch (error) { report.failures.push({ name, error: String(error) }); }
  };
  const url = () => `${base}/stars-above/?${query}`;
  const ready = async (p) => {
    await p.waitForFunction(() => window.__sky?.rendered &&
      window.__sky.snapshot.date.toISOString() === '2026-01-15T13:00:00.000Z' &&
      window.__sky.lightPollution.source === 'viirs' &&
      document.querySelector('footer time')?.dateTime === window.__sky.snapshot.date.toISOString());
    await p.waitForFunction(() => Math.abs(document.querySelector('nav').firstElementChild.getBoundingClientRect().top) < 0.01);
    await p.evaluate(() => document.fonts.ready);
    await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const screenshot = async (p, name, preserveMotion = false) => {
    const path = `${directory}/${name}.png`;
    await p.screenshot({ path, scale: 'css', fullPage: false, animations: preserveMotion ? 'allow' : 'disabled' });
    report.captures.push(path);
  };
  const fireReady = async (p, on) => {
    await p.waitForFunction(on => {
      const decoration = document.querySelector('.campfire-decoration');
      const flames = document.querySelector('.campfire-flames');
      const glow = document.querySelector('.campfire-glow');
      return decoration?.dataset.fireOn === String(on) && flames && glow &&
        (on ? Number(getComputedStyle(flames).opacity) > 0.999 && Number(getComputedStyle(glow).opacity) > 0.999
          : Number(getComputedStyle(flames).opacity) < 0.001 && Number(getComputedStyle(glow).opacity) < 0.001);
    }, on);
  };
  const skyData = async (p) => p.evaluate(() => JSON.stringify({
    snapshot: window.__sky.snapshot, camera: window.__sky.camera,
    rendered: window.__sky.rendered, pollution: window.__sky.lightPollution,
  }));
  const startEvidence = async (p) => p.evaluate(() => {
    const canvas = document.querySelector('.look-up-stars');
    const ctx = canvas.getContext('2d');
    window.__fireEvidence = {
      sky: window.__sky,
      snapshot: JSON.stringify({ snapshot: window.__sky.snapshot, camera: window.__sky.camera,
        rendered: window.__sky.rendered, pollution: window.__sky.lightPollution }),
      pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data.slice(),
      storage: JSON.stringify({ ...localStorage }), draws: 0,
    };
    const original = ctx.clearRect;
    ctx.clearRect = function (...args) { window.__fireEvidence.draws++; return original.apply(this, args); };
  });
  const compareEvidence = async (p) => p.evaluate(() => {
    const baseline = window.__fireEvidence;
    const canvas = document.querySelector('.look-up-stars');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let changedChannels = Math.abs(pixels.length - baseline.pixels.length);
    for (let i = 0; i < pixels.length; i++) if (pixels[i] !== baseline.pixels[i]) changedChannels++;
    return {
      sameObject: baseline.sky === window.__sky,
      sameSnapshot: baseline.snapshot === JSON.stringify({ snapshot: window.__sky.snapshot, camera: window.__sky.camera,
        rendered: window.__sky.rendered, pollution: window.__sky.lightPollution }),
      changedCanvasChannels: changedChannels,
      canvasDraws: baseline.draws,
      sameStorage: baseline.storage === JSON.stringify({ ...localStorage }),
    };
  });
  const assertEvidence = (evidence) => {
    assert(evidence.sameObject && evidence.sameSnapshot, 'fire must not alter astronomical snapshot or projected star alpha');
    assert(evidence.changedCanvasChannels === 0, `star Canvas changed ${evidence.changedCanvasChannels} channels`);
    assert(evidence.canvasDraws === 0, `${evidence.canvasDraws} unwanted Canvas redraws`);
    assert(evidence.sameStorage, 'fire must not persist state');
  };
  const probeIntervals = () => {
    window.__fireIntervals = new Map();
    const start = window.setInterval.bind(window), stop = window.clearInterval.bind(window);
    window.setInterval = (callback, delay, ...args) => {
      const id = start(callback, delay, ...args); window.__fireIntervals.set(id, delay); return id;
    };
    window.clearInterval = id => { window.__fireIntervals.delete(id); stop(id); };
  };
  const viewports = [
    { name: 'desktop-1280', width: 1280, height: 720, mobile: false },
    { name: 'mobile-390', width: 390, height: 844, mobile: true },
    { name: 'mobile-375', width: 375, height: 812, mobile: true },
    { name: 'desktop-1440', width: 1440, height: 900, mobile: false },
  ];

  for (const viewport of viewports) {
    await check(`${viewport.name}: layout, pointer, coexistence and refresh`, async () => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.mobile ? 2 : 1, isMobile: viewport.mobile, hasTouch: viewport.mobile, timezoneId: 'Asia/Shanghai' });
      const p = await context.newPage();
      p.on('pageerror', error => report.pageErrors.push(error.message));
      await p.addInitScript(probeIntervals);
      const activate = async () => {
        const button = p.locator('.campfire-toggle');
        if (viewport.mobile) await button.tap(); else await button.click();
      };
      await p.goto(url()); await ready(p); await fireReady(p, false);
      assert(await p.getByRole('button', { name: 'Light campfire', exact: true }).getAttribute('aria-pressed') === 'false', 'initially off');
      const layout = await p.evaluate(() => {
        const sky = document.querySelector('.look-up-sky').getBoundingClientRect();
        const fire = document.querySelector('.campfire-toggle').getBoundingClientRect();
        const glow = document.querySelector('.campfire-glow').getBoundingClientRect();
        const canvas = document.querySelector('.look-up-stars');
        return {
          sky: sky.toJSON(), fire: fire.toJSON(), glow: glow.toJSON(),
          footer: document.querySelector('footer').getBoundingClientRect().toJSON(),
          documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
          documentHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight,
          dpr: devicePixelRatio, visualScale: visualViewport.scale,
          footerTime: document.querySelector('footer time span')?.textContent,
          isoTime: document.querySelector('footer time').dateTime,
          rendered: window.__sky.rendered.length, interactive: window.__sky.interactiveStars.length,
          limitingMagnitude: window.__sky.lightPollution.limitingMagnitude,
          canvasWidth: canvas.width, canvasHeight: canvas.height,
          layerOrder: {
            decoration: getComputedStyle(document.querySelector('.campfire-decoration')).zIndex,
            scene: getComputedStyle(document.querySelector('.look-up-scene')).zIndex,
            hitButton: getComputedStyle(document.querySelector('.campfire-toggle')).zIndex,
          },
        };
      });
      assert(layout.fire.width >= 44 && layout.fire.height >= 44, '44px touch target');
      assert(layout.fire.bottom < layout.footer.top && layout.glow.bottom <= layout.footer.top, 'fire/light avoid footer');
      assert(Math.abs(layout.fire.x + layout.fire.width / 2 - viewport.width / 2) < 1, 'horizontal centre');
      assert(layout.glow.height <= layout.sky.height * 0.15 + 1, 'light limited to bottom 15%');
      assert(layout.documentWidth <= viewport.width && layout.documentHeight <= viewport.height + 1, 'no overflow');
      assert(layout.footerTime === 'January 15, 2026 · 21:00 · Facing South', 'local observation time');
      await screenshot(p, `${viewport.name}-B-off`);
      if (!viewport.mobile) {
        await p.locator('.campfire-toggle').hover();
        await p.waitForFunction(() => Number(getComputedStyle(document.querySelector('.campfire-hint')).opacity) > 0.02, null, { timeout: 1500 });
        await screenshot(p, `${viewport.name}-B-hover`);
        await p.mouse.move(10, 10);
        await p.waitForFunction(() => Number(getComputedStyle(document.querySelector('.campfire-hint')).opacity) < 0.01);
      }
      await startEvidence(p);
      await activate(); await fireReady(p, true);
      const litEvidence = await compareEvidence(p); assertEvidence(litEvidence);
      assert(await p.locator('.look-up-label').count() === 0, 'fire does not select a star');
      assert(await p.getByRole('button', { name: 'Extinguish campfire', exact: true }).getAttribute('aria-pressed') === 'true', 'native click/tap switches once');
      await screenshot(p, `${viewport.name}-C-on`);

      const target = await p.evaluate(() => {
        const star = window.__sky.interactiveStars.find(entry => entry.name.english === 'Betelgeuse');
        const scene = document.querySelector('.look-up-scene').getBoundingClientRect();
        return { x: star.point.x + scene.left, y: star.point.y + scene.top };
      });
      if (!viewport.mobile) {
        await p.mouse.move(target.x, target.y);
        await p.waitForFunction(() => document.querySelector('.look-up-label')?.textContent.includes('Betelgeuse'));
        await p.mouse.move(10, 10);
        await p.waitForFunction(() => !document.querySelector('.look-up-label'));
      }
      if (viewport.mobile) await p.touchscreen.tap(target.x, target.y); else await p.mouse.click(target.x, target.y);
      await p.waitForFunction(() => document.querySelector('.look-up-label')?.textContent.includes('Betelgeuse'));
      assert(await p.locator('.campfire-toggle').getAttribute('aria-pressed') === 'true', 'star leaves fire state intact');
      await activate(); await fireReady(p, false);
      assert(await p.locator('.look-up-label').textContent() === '参宿四Betelgeuse', 'extinguishing preserves pinned name');
      await activate(); await fireReady(p, true);
      assert(await p.locator('.look-up-label').textContent() === '参宿四Betelgeuse', 'lighting preserves pinned name');
      if (viewport.name === 'desktop-1280' || viewport.name === 'mobile-390') {
        await p.waitForFunction(() => Number(getComputedStyle(document.querySelector('.look-up-label')).opacity) > 0.999);
        if (!viewport.mobile) await p.mouse.move(10, 10);
        await screenshot(p, `${viewport.name}-D-on-selected`);
      }
      await startEvidence(p);
      const postLabelLayout = await p.evaluate(() => ({
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        footer: document.querySelector('footer').getBoundingClientRect().toJSON(),
      }));
      assertEvidence(await compareEvidence(p));
      await activate(); await fireReady(p, false);
      await activate(); await fireReady(p, true);
      assertEvidence(await compareEvidence(p));
      const unchangedLayout = await p.evaluate(() => ({
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        footer: document.querySelector('footer').getBoundingClientRect().toJSON(),
        skyOpacity: getComputedStyle(document.querySelector('.look-up-sky')).opacity,
        skyFilter: getComputedStyle(document.querySelector('.look-up-sky')).filter,
        sceneOpacity: getComputedStyle(document.querySelector('.look-up-scene')).opacity,
        canvasOpacity: getComputedStyle(document.querySelector('.look-up-stars')).opacity,
        canvasFilter: getComputedStyle(document.querySelector('.look-up-stars')).filter,
      }));
      assert(unchangedLayout.width === postLabelLayout.width && unchangedLayout.height === postLabelLayout.height &&
        unchangedLayout.footer.top === postLabelLayout.footer.top, 'no layout shift from fire toggles');
      assert(unchangedLayout.skyOpacity === '1' && unchangedLayout.sceneOpacity === '1' &&
        unchangedLayout.canvasOpacity === '1' && unchangedLayout.skyFilter === 'none' && unchangedLayout.canvasFilter === 'none', 'no star opacity/filter change');
      await p.reload(); await ready(p); await fireReady(p, false);
      assert(await p.locator('.look-up-label').count() === 0, 'reload resets transient labels');
      const keyboardButton = p.locator('.campfire-toggle');
      await keyboardButton.focus(); await p.keyboard.press('Enter'); await fireReady(p, true);
      await p.keyboard.press('Space'); await fireReady(p, false);
      await p.waitForFunction(() => document.querySelector('.campfire-decoration').getAnimations({ subtree: true }).length === 0);
      await context.close();
      return { layout, litEvidence, repeatedToggleEvidence: 'identical snapshot and Canvas pixels; zero redraws', keyboard: 'Enter/Space pass', refresh: 'off' };
    });
  }

  await check('embers finish naturally; no spawning or loops after extinguishing; route cleanup', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai' });
    const p = await context.newPage(); await p.addInitScript(probeIntervals);
    await p.goto(url()); await ready(p);
    await p.locator('.campfire-toggle').tap(); await fireReady(p, true);
    await p.waitForFunction(() => document.querySelectorAll('.campfire-ember').length > 0);
    const before = await p.evaluate(() => ({ count: document.querySelectorAll('.campfire-ember').length,
      timers: [...window.__fireIntervals.values()], animations: document.querySelector('.campfire-decoration').getAnimations({ subtree: true }).length }));
    assert(before.count <= 3 && before.timers.filter(delay => delay === 2800).length === 1, 'bounded ember generator');
    await p.locator('.campfire-toggle').tap();
    assert(await p.evaluate(() => ![...window.__fireIntervals.values()].includes(2800)), 'generator stops immediately');
    await p.waitForFunction(() => !document.querySelector('.campfire-ember') &&
      document.querySelector('.campfire-decoration').getAnimations({ subtree: true }).length === 0);
    await p.locator('.campfire-toggle').tap(); await fireReady(p, true);
    await p.evaluate(() => { window.__detachedFire = document.querySelector('.campfire-decoration'); });
    await p.getByRole('button', { name: 'Open main menu' }).tap();
    await p.locator('nav a').filter({ hasText: /^Home$/ }).last().tap();
    await p.waitForFunction(() => !document.querySelector('.look-up-sky'));
    const after = await p.evaluate(() => ({ fireTimers: [...window.__fireIntervals.values()].filter(delay => delay === 2800).length,
      detachedAnimations: window.__detachedFire.getAnimations({ subtree: true }).length }));
    assert(after.fireTimers === 0 && after.detachedAnimations === 0, 'route clears generator and animations');
    await context.close(); return { before, after };
  });

  const waitForPhase = async (p, phaseClass, timeout = 15000) =>
    p.waitForSelector(`.campfire-marshmallow.m-${phaseClass}`, { timeout });

  await check('marshmallow roasts, rests, counts and re-roasts in a loop', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
    const p = await context.newPage(); await p.addInitScript(probeIntervals);
    await p.goto(url()); await ready(p); await fireReady(p, false);
    assert(await p.locator('.campfire-marshmallow').count() === 0, 'no marshmallow while off');
    assert(await p.locator('.campfire-count').count() === 0, 'no count while off');
    await startEvidence(p);
    await p.locator('.campfire-toggle').click(); await fireReady(p, true);
    await waitForPhase(p, 'entering');
    const white = await p.evaluate(() => ({
      cream: getComputedStyle(document.querySelector('.campfire-marshmallow-cream')).opacity,
      caramel: getComputedStyle(document.querySelector('.campfire-marshmallow-caramel')).opacity,
    }));
    assert(Number(white.cream) === 0 && Number(white.caramel) === 0, 'enters white');
    await waitForPhase(p, 'roasting');
    await p.waitForTimeout(250);
    const earlyToast = await p.evaluate(() =>
      Number(getComputedStyle(document.querySelector('.campfire-marshmallow-caramel')).opacity));
    await p.waitForTimeout(800);
    const lateToast = await p.evaluate(() =>
      Number(getComputedStyle(document.querySelector('.campfire-marshmallow-caramel')).opacity));
    assert(lateToast > earlyToast + 0.15, `caramel builds during roasting (${earlyToast.toFixed(2)} → ${lateToast.toFixed(2)})`);
    await waitForPhase(p, 'ready');
    assert(await p.getByRole('button', { name: 'Eat roasted marshmallow', exact: true }).isVisible(), 'eat button appears');
    await p.waitForTimeout(1200);
    assert(await p.locator('.campfire-marshmallow.m-ready').count() === 1, 'roasted marshmallow rests, no auto exit');
    await screenshot(p, 'desktop-1280-marshmallow-ready');

    // Fast double click: the second click lands on the disabled bite button,
    // not the fire toggle beneath.
    const bite = await p.getByRole('button', { name: 'Eat roasted marshmallow', exact: true }).boundingBox();
    await p.mouse.click(bite.x + bite.width / 2, bite.y + bite.height / 2);
    await p.mouse.click(bite.x + bite.width / 2, bite.y + bite.height / 2);
    await p.mouse.click(bite.x + bite.width / 2, bite.y + bite.height / 2);
    await p.waitForSelector('.campfire-count');
    assert(await p.locator('.campfire-count').textContent() === 'Marshmallow · 1', 'singular text for the first');
    assert(await p.locator('.campfire-toggle').getAttribute('aria-pressed') === 'true', 'rapid bites keep the fire lit');
    await waitForPhase(p, 'entering');

    for (let i = 2; i <= 3; i++) {
      await waitForPhase(p, 'ready');
      await p.getByRole('button', { name: 'Eat roasted marshmallow', exact: true }).click();
      await p.waitForFunction(i => document.querySelector('.campfire-count')?.textContent ===
        `Marshmallows · ${i}`, i);
    }
    await screenshot(p, 'desktop-1280-marshmallows-3');
    assertEvidence(await compareEvidence(p));

    await p.locator('.campfire-toggle').click(); await fireReady(p, false);
    await p.waitForFunction(() => !document.querySelector('.campfire-marshmallow') &&
      !document.querySelector('.campfire-count'), null, { timeout: 2000 });
    await screenshot(p, 'desktop-1280-marshmallow-reset');
    await p.locator('.campfire-toggle').click(); await fireReady(p, true);
    await waitForPhase(p, 'entering');
    assert(await p.locator('.campfire-count').count() === 0, 'relight restarts from zero');
    await waitForPhase(p, 'ready');
    await p.getByRole('button', { name: 'Eat roasted marshmallow', exact: true }).focus();
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => document.querySelector('.campfire-count')?.textContent === 'Marshmallow · 1');
    await p.locator('.campfire-toggle').click(); await fireReady(p, false);
    await context.close();
    return { caramel: [earlyToast, lateToast], loop: 3, keyboard: 'Enter bites', rapid: 'single count, fire stays lit' };
  });

  await check('extinguishing during every marshmallow phase resets cleanly', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai' });
    const p = await context.newPage(); await p.addInitScript(probeIntervals);
    await p.goto(url()); await ready(p);
    const reset = async () => {
      await p.locator('.campfire-toggle').tap(); await fireReady(p, false);
      await p.waitForFunction(() => !document.querySelector('.campfire-marshmallow') &&
        !document.querySelector('.campfire-count') && !document.querySelector('.campfire-eat'), null, { timeout: 2000 });
    };
    for (const phaseClass of ['entering', 'roasting', 'ready']) {
      await p.locator('.campfire-toggle').tap(); await fireReady(p, true);
      await waitForPhase(p, phaseClass);
      await reset();
    }
    // Mid-bite extinguish cancels the pending count and the next stick.
    await p.locator('.campfire-toggle').tap(); await fireReady(p, true);
    await waitForPhase(p, 'ready');
    await p.getByRole('button', { name: 'Eat roasted marshmallow', exact: true }).tap();
    await waitForPhase(p, 'eating');
    await reset();
    await p.waitForTimeout(1500);
    assert(await p.locator('.campfire-marshmallow').count() === 0, 'no ghost marshmallow after mid-bite reset');
    assert(await p.locator('.campfire-count').count() === 0, 'cancelled bite never counts');
    // Rapid off/on still yields a fresh white roast.
    await p.locator('.campfire-toggle').tap(); await fireReady(p, true);
    await waitForPhase(p, 'entering');
    await p.locator('.campfire-toggle').tap(); await fireReady(p, false);
    await p.locator('.campfire-toggle').tap(); await fireReady(p, true);
    await waitForPhase(p, 'entering');
    assert(await p.locator('.campfire-count').count() === 0, 'rapid toggles keep the tally empty');
    await reset();
    await context.close();
    return { phases: ['entering', 'roasting', 'ready', 'eating'], rapidToggle: 'clean' };
  });

  await check('mobile bite and fire hit areas stay separate; route change clears the roast', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai' });
    const p = await context.newPage(); await p.addInitScript(probeIntervals);
    await p.goto(url()); await ready(p);
    await p.locator('.campfire-toggle').tap(); await fireReady(p, true);
    await waitForPhase(p, 'ready');
    const separation = await p.evaluate(() => {
      const eat = document.querySelector('.campfire-eat').getBoundingClientRect();
      const fire = document.querySelector('.campfire-toggle').getBoundingClientRect();
      return {
        eat: { w: eat.width, h: eat.height, cx: eat.x + eat.width / 2, cy: eat.y + eat.height / 2 },
        uncovered: { left: eat.x - fire.x, right: fire.x + fire.width - (eat.x + eat.width),
          above: eat.y - fire.y, below: fire.y + fire.height - (eat.y + eat.height) },
        fire: { w: fire.width, h: fire.height },
      };
    });
    assert(separation.eat.w >= 44 && separation.eat.h >= 44, 'bite target ≥ 44px');
    assert(separation.uncovered.left >= 40 && separation.uncovered.above >= 15 && separation.uncovered.below >= 15,
      `fire toggle keeps a reachable band around the bite zone (${JSON.stringify(separation.uncovered)})`);
    const fireCentre = await p.evaluate(() => {
      const fire = document.querySelector('.campfire-toggle').getBoundingClientRect();
      return { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2 };
    });
    assert(await p.evaluate(({ x, y }) => {
      const eat = document.querySelector('.campfire-eat').getBoundingClientRect();
      return !(x >= eat.x && x <= eat.x + eat.width && y >= eat.y && y <= eat.y + eat.height);
    }, fireCentre), 'flame centre is never covered by the bite zone');
    await p.touchscreen.tap(separation.eat.cx, separation.eat.cy);
    await p.waitForSelector('.campfire-count');
    assert(await p.locator('.campfire-toggle').getAttribute('aria-pressed') === 'true', 'biting does not extinguish');
    await waitForPhase(p, 'ready');
    await screenshot(p, 'mobile-390-marshmallow-ready');
    await p.evaluate(() => { window.__detachedFire = document.querySelector('.campfire-decoration'); });
    await p.getByRole('button', { name: 'Open main menu' }).tap();
    await p.locator('nav a').filter({ hasText: /^Home$/ }).last().tap();
    await p.waitForFunction(() => !document.querySelector('.look-up-sky'));
    const after = await p.evaluate(() => ({
      detached: !document.contains(window.__detachedFire),
      liveMarshmallow: Boolean(document.querySelector('.campfire-marshmallow')),
      liveEat: Boolean(document.querySelector('.campfire-eat')),
      detachedAnimations: window.__detachedFire.getAnimations({ subtree: true }).length,
      emberTimers: [...window.__fireIntervals.values()].filter(delay => delay === 2800).length,
    }));
    assert(after.detached && !after.liveMarshmallow && !after.liveEat &&
      after.detachedAnimations === 0 && after.emberTimers === 0, 'route change unmounts and stops everything');
    await context.close();
    return { separation, after };
  });

  await check('reduced motion keeps the roast static but fully playable', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
    const p = await context.newPage(); await p.addInitScript(probeIntervals);
    await p.goto(url()); await ready(p);
    await p.locator('.campfire-toggle').tap(); await fireReady(p, true);
    await p.waitForSelector('.campfire-marshmallow.m-reduced.m-roasting');
    const white = await p.evaluate(() =>
      Number(getComputedStyle(document.querySelector('.campfire-marshmallow-caramel')).opacity));
    assert(white === 0, 'rests white through the static roast wait');
    await p.waitForSelector('.campfire-marshmallow.m-reduced.m-ready');
    const toasted = await p.waitForFunction(() =>
      Number(getComputedStyle(document.querySelector('.campfire-marshmallow-caramel')).opacity) >= 0.8,
      null, { timeout: 3000 }).then(() => p.evaluate(() =>
      Number(getComputedStyle(document.querySelector('.campfire-marshmallow-caramel')).opacity)));
    assert(toasted >= 0.8, `settles into the roasted colour (${toasted})`);
    const loops = await p.evaluate(() => document.querySelector('.campfire-decoration')
      .getAnimations({ subtree: true }).filter(a => a.effect.getTiming().iterations === Infinity).length);
    assert(loops === 0, 'no looping animation under reduced motion');
    await p.getByRole('button', { name: 'Eat roasted marshmallow', exact: true }).tap();
    await p.waitForSelector('.campfire-count');
    assert(await p.locator('.campfire-count').textContent() === 'Marshmallow · 1', 'reduced motion still counts');
    await p.waitForSelector('.campfire-marshmallow.m-reduced.m-roasting');
    await screenshot(p, 'mobile-390-reduced-marshmallow');
    await p.locator('.campfire-toggle').tap(); await fireReady(p, false);
    await p.waitForFunction(() => !document.querySelector('.campfire-marshmallow') && !document.querySelector('.campfire-count'));
    await context.close();
    return { white, toasted, loops };
  });

  await check('reduced motion keeps static fire and glow with no ember timer or movement', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
    const p = await context.newPage(); await p.addInitScript(probeIntervals);
    await p.goto(url()); await ready(p);
    await p.locator('.campfire-toggle').tap(); await fireReady(p, true);
    const reduced = await p.evaluate(() => ({
      animations: document.querySelector('.campfire-decoration').getAnimations({ subtree: true })
        .filter(animation => animation.effect.getTiming().iterations === Infinity).length,
      embers: document.querySelectorAll('.campfire-ember').length,
      generator: [...window.__fireIntervals.values()].includes(2800),
      flame: getComputedStyle(document.querySelector('.campfire-flame-breathe')).animationName,
      warmth: getComputedStyle(document.querySelector('.campfire-glow-breathe')).animationName,
    }));
    assert(reduced.animations === 0 && reduced.embers === 0 && !reduced.generator &&
      reduced.flame === 'none' && reduced.warmth === 'none', 'static reduced motion');
    await screenshot(p, 'mobile-390-reduced-motion-on');
    const staticMeteors = await p.evaluate(() => new Promise((resolve) => {
      const meteorCanvas = document.querySelectorAll('.look-up-scene canvas')[0];
      const first = meteorCanvas.toDataURL();
      setTimeout(() => resolve(meteorCanvas.toDataURL() === first), 400);
    }));
    assert(staticMeteors, 'reduced motion keeps the Look Up meteors grounded');
    await p.locator('.campfire-toggle').tap(); await fireReady(p, false);
    await p.goto(`${base}/cv/?${query}`);
    await p.getByRole('button', { name: 'Open main menu' }).tap();
    await p.locator('nav a').filter({ hasText: /^Stars Above$/ }).last().tap(); await ready(p);
    assert(await p.locator('.sky-entering').count() === 0, 'reduced motion skips sky entry');
    await p.getByRole('button', { name: 'Open main menu' }).tap();
    await p.locator('nav a').filter({ hasText: /^Home$/ }).last().tap();
    await p.waitForFunction(() => !document.querySelector('.look-up-sky'));
    const direct = await p.evaluate(() => ({
      fadeClasses: Boolean(document.querySelector('.sky-background-fade-in, .sky-background-fade-out')),
      canvasOpacity: getComputedStyle(document.querySelector('canvas')).opacity,
    }));
    assert(!direct.fadeClasses && direct.canvasOpacity === '1', 'reduced motion leaves Look Up without fades');
    await p.waitForTimeout(700);
    assert(await p.locator('.look-up-exit-ghost').count() === 0, 'reduced motion skips the exit ghost');
    await context.close(); return { ...reduced, directExit: direct, staticMeteors };
  });

  await check('browser timezone and local sky parameter drive Footer; other pages retain Last updated', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'America/New_York' });
    const p = await context.newPage(); await p.goto(url()); await ready(p);
    const utcClock = await p.locator('footer time span').first().textContent();
    assert(utcClock === 'January 15, 2026 · 08:00 · Facing South', 'uses browser timezone, not observer longitude');
    await p.goto(`${base}/stars-above/?lat=31.2989&lon=121.5035&sky=2026-01-15T08:00&skydebug=1`); await ready(p);
    assert(await p.locator('footer time span').first().textContent() === utcClock, 'timezone-less sky uses browser local time');
    for (const path of ['/', '/research/', '/cv/']) {
      await p.goto(`${base}${path}?${query}`);
      assert((await p.locator('footer p').textContent()).trim().startsWith('Last updated:'), `${path} footer unchanged`);
    }
    await context.close(); return { utcClock, localSkyClock: utcClock, pages: ['Home', 'Research', 'CV'] };
  });

  await check('normal live sky publishes the clock only with the seven-minute snapshot update', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
    const p = await context.newPage();
    await p.clock.install({ time: '2026-01-15T13:00:00Z' });
    await p.goto(`${base}/stars-above/?lat=31.2989&lon=121.5035&skydebug=1`);
    await p.waitForFunction(() => window.__sky?.rendered && window.__sky.lightPollution.source === 'viirs');
    const before = await p.evaluate(() => window.__sky.snapshot.date.getTime());
    await p.clock.fastForward(421000);
    await p.waitForFunction(before => window.__sky.snapshot.date.getTime() > before &&
      document.querySelector('footer time').dateTime === window.__sky.snapshot.date.toISOString(), before);
    const after = await p.evaluate(() => ({ timestamp: window.__sky.snapshot.date.getTime(),
      footer: document.querySelector('footer time span')?.textContent, iso: document.querySelector('footer time').dateTime }));
    assert(after.timestamp - before >= 420000, 'seven-minute computation cadence');
    await context.close(); return { before, after };
  });

  await check('sky entry starts promptly, settles with a long tail, and crossfades the old background', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
    const p = await context.newPage(); await p.goto(`${base}/cv/?${query}`);
    await p.waitForFunction(() => Math.abs(document.querySelector('nav').firstElementChild.getBoundingClientRect().top) < 0.01);
    await p.evaluate(() => {
      window.__entrySamples = [];
      window.__entryT0 = performance.now();
      const tick = () => {
        const scene = document.querySelector('.look-up-scene');
        if (scene) {
          const s = getComputedStyle(scene);
          const bg = document.querySelector('.sky-background');
          const bgStyle = bg ? getComputedStyle(bg) : null;
          window.__entrySamples.push({
            t: Math.round(performance.now() - window.__entryT0),
            y: s.transform === 'none' ? 0 : new DOMMatrixReadOnly(s.transform).m42,
            o: Number(s.opacity),
            bg: bgStyle ? { y: bgStyle.transform === 'none' ? 0 : new DOMMatrixReadOnly(bgStyle.transform).m42,
              o: Number(bgStyle.opacity) } : null,
          });
        }
        if (performance.now() - window.__entryT0 < 1100) requestAnimationFrame(tick);
        else window.__entryDone = true;
      };
      requestAnimationFrame(tick);
    });
    await p.evaluate(() => {
      [...document.querySelectorAll('nav a')].find((a) => a.textContent.trim() === 'Stars Above').click();
    });
    await p.waitForSelector('.sky-entering');
    const style = await p.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.look-up-scene'));
      return { name: s.animationName, duration: s.animationDuration, delay: s.animationDelay,
        easing: s.animationTimingFunction, opacity: s.opacity,
        translateY: new DOMMatrixReadOnly(s.transform).m42,
        skyCanvases: document.querySelectorAll('.look-up-stars').length,
        meteorLayer: document.querySelectorAll('.look-up-scene canvas').length };
    });
    assert(style.name === 'look-up-arrive' && style.duration === '0.6s' && style.delay === '0.12s', 'tuned timing 120ms/600ms');
    assert(style.easing === 'cubic-bezier(0.16, 1, 0.3, 1)', 'long-tail deceleration curve');
    assert(style.translateY < 0 && style.skyCanvases === 1, 'single star canvas, translated before motion');
    assert(style.meteorLayer === 2, 'meteor layer rides inside the entering sky');
    await screenshot(p, 'desktop-1280-entry-start', true);
    await p.waitForFunction(() => window.__entryDone === true);
    const samples = await p.evaluate(() => window.__entrySamples);
    const initial = samples[0];
    assert(initial.y < 0 && initial.o === 0, 'no frozen visible frame before movement');
    const moveIdx = samples.findIndex((s, i) => i > 0 && Math.abs(s.y - initial.y) > 0.5);
    const settleIdx = samples.findIndex((s) => Math.abs(s.y) < 2 && s.t > samples[moveIdx].t);
    const holdMs = samples[moveIdx].t - initial.t;
    const settleMs = samples[settleIdx].t - samples[moveIdx].t;
    const span = samples.slice(moveIdx, settleIdx);
    const third = Math.max(1, Math.floor(span.length / 3));
    const speed = (arr) => arr.length < 2 ? 0
      : Math.abs(arr[arr.length - 1].y - arr[0].y) / (arr[arr.length - 1].t - arr[0].t);
    const earlySpeed = speed(span.slice(0, third));
    const lateSpeed = speed(span.slice(-third));
    const opacityFullMs = samples.find((s) => s.o >= 0.99).t - initial.t;
    const bgSamples = samples.filter((s) => s.bg !== null);
    assert(holdMs >= 60 && holdMs <= 260, `brief visible hold ~120ms, got ${holdMs}ms`);
    assert(settleMs >= 300 && settleMs <= 620, `covers distance then eases imperceptibly (${settleMs}ms to 2px)`);
    assert(samples.some((s) => s.t >= samples[moveIdx].t + 560 && Math.abs(s.y) < 0.01), 'full 600ms tail before cleanup');
    assert(earlySpeed > lateSpeed * 1.8, `decelerating settle (${earlySpeed.toFixed(2)} vs ${lateSpeed.toFixed(2)} px/ms)`);
    assert(opacityFullMs >= 120 && opacityFullMs <= 480, `sky fades in during the slide (${opacityFullMs}ms)`);
    assert(bgSamples.length >= 2 && bgSamples.some((s) => s.bg.o < 0.9), 'old background fades out during the swap');
    assert(Math.max(...bgSamples.map((s) => s.bg.y)) > 100, 'old background descends with the sky (meteors included)');
    const moving = samples.filter((s) => s.bg !== null && Math.abs(s.y - initial.y) > 1);
    const spreads = moving.map((s) => s.bg.y - s.y);
    assert(moving.length >= 3 && Math.max(...spreads) - Math.min(...spreads) < 8,
      `background and sky descend in lockstep (spread ${(Math.max(...spreads) - Math.min(...spreads)).toFixed(1)}px)`);
    assert(samples[samples.length - 1].bg === null, 'old background unmounts after the fade');
    await ready(p);
    // The 600ms entry plus its 120ms delay is cleaned up shortly after the
    // sampler window; wait for the class removal instead of assuming the clock.
    await p.waitForFunction(() => !document.querySelector('.sky-entering'), null, { timeout: 5000 });
    const final = await p.evaluate(() => ({ transform: getComputedStyle(document.querySelector('.look-up-scene')).transform,
      willChange: getComputedStyle(document.querySelector('.look-up-scene')).willChange,
      opacity: getComputedStyle(document.querySelector('.look-up-scene')).opacity,
      canvases: document.querySelectorAll('canvas').length }));
    assert(final.transform === 'none' && final.willChange === 'auto' &&
      final.opacity === '1' && final.canvases === 2,
      `entry cleanup with resting opacity 1 and meteors flying (${JSON.stringify(final)})`);
    await screenshot(p, 'desktop-1280-entry-finished');
    await context.close();
    return { holdMs, settleMs, earlySpeed, lateSpeed, opacityFullMs, style, final };
  });
  await check('leaving Look Up lifts the sky away and fades the page background in', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
    const p = await context.newPage(); await p.goto(url()); await ready(p);
    await p.evaluate(() => {
      window.__exitSamples = [];
      window.__exitT0 = performance.now();
      const tick = () => {
        const ghost = document.querySelector('.look-up-exit-ghost');
        const starsLayer = document.querySelector('.look-up-exit-stars');
        const bg = document.querySelector('.sky-background');
        let ghostSample = null;
        if (ghost) {
          const s = getComputedStyle(ghost);
          ghostSample = { y: s.transform === 'none' ? 0 : new DOMMatrixReadOnly(s.transform).m42,
            z: s.zIndex, pe: s.pointerEvents,
            stars: starsLayer ? Number(getComputedStyle(starsLayer).opacity) : null };
        }
        let bgSample = null;
        if (bg) {
          const s = getComputedStyle(bg);
          bgSample = { y: s.transform === 'none' ? 0 : new DOMMatrixReadOnly(s.transform).m42,
            o: Number(s.opacity) };
        }
        window.__exitSamples.push({ t: Math.round(performance.now() - window.__exitT0),
          ghost: ghostSample, bg: bgSample });
        if (performance.now() - window.__exitT0 < 1400) requestAnimationFrame(tick);
        else window.__exitDone = true;
      };
      requestAnimationFrame(tick);
    });
    await p.evaluate(() => {
      [...document.querySelectorAll('nav a')].find((a) => a.textContent.trim() === 'CV').click();
    });
    await p.waitForFunction(() => window.__exitDone === true);
    const samples = await p.evaluate(() => window.__exitSamples);
    const ghosts = samples.filter((s) => s.ghost);
    assert(ghosts.length >= 5, 'exit ghost present during the transition');
    assert(ghosts[0].ghost.z === '5' && ghosts[0].ghost.pe === 'none', 'ghost sits above the background, below content, inert');
    assert(Math.abs(ghosts[0].ghost.y) < 5 && ghosts[0].ghost.stars > 0.9, 'ghost starts in place with the star layer visible');
    const lastGhost = ghosts[ghosts.length - 1].ghost;
    assert(lastGhost.y < -110, `ghost rises to the previous background position (${lastGhost.y.toFixed(0)}px)`);
    assert(Math.min(...ghosts.map((s) => s.ghost.stars)) <= 0.2, 'star layer dissolves as it rises');
    assert(!samples[samples.length - 1].ghost, 'ghost removed after the animation');
    const seen = samples.filter((s) => s.bg !== null);
    assert(seen.length >= 3, 'background wrapper present');
    assert(Math.max(...seen.map((s) => s.bg.y)) > 100, 'background rises from the sky position (meteors included)');
    assert(Math.abs(seen[seen.length - 1].bg.y) < 8, 'background lands at rest');
    assert(Math.min(...seen.map((s) => s.bg.o)) < 0.5, 'background starts faded out');
    assert(Math.max(...seen.map((s) => s.bg.o)) >= 0.99, 'background reaches full opacity');
    const both = samples.filter((s) => s.ghost && s.bg !== null);
    const gaps = both.map((s) => s.bg.y - s.ghost.y);
    assert(both.length >= 3 && Math.max(...gaps) - Math.min(...gaps) < 8,
      `ghost and background rise in lockstep (spread ${(Math.max(...gaps) - Math.min(...gaps)).toFixed(1)}px)`);
    await p.waitForFunction(() => !document.querySelector('.sky-background-fade-in'));
    const settled = await p.evaluate(() => ({ canvases: document.querySelectorAll('canvas').length,
      canvasOpacity: getComputedStyle(document.querySelector('canvas')).opacity,
      footer: document.querySelector('footer p')?.textContent.trim() }));
    assert(settled.canvases >= 2 && settled.canvasOpacity === '1', 'page background stays mounted at full opacity');
    assert(settled.footer?.startsWith('Last updated:'), 'destination footer intact');
    await context.close();
    return { ghostRise: lastGhost.y, starsMinOpacity: Math.min(...ghosts.map((s) => s.ghost.stars)),
      lockstepSpread: Math.max(...gaps) - Math.min(...gaps), settled };
  });
  await check('flames grow from the wood and extinguish faster than they light', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai' });
    const p = await context.newPage(); await p.goto(url()); await ready(p);
    const record = (key, ms) => p.evaluate(({ key, ms }) => new Promise((resolve) => {
      window[key] = [];
      const t0 = performance.now();
      const tick = () => {
        const flames = document.querySelector('.campfire-flames');
        const glow = document.querySelector('.campfire-glow');
        if (flames && glow) {
          const s = getComputedStyle(flames);
          window[key].push({ t: Math.round(performance.now() - t0),
            scaleY: new DOMMatrixReadOnly(s.transform).m22, o: Number(s.opacity),
            glowScale: new DOMMatrixReadOnly(getComputedStyle(glow).transform).m22 });
        }
        if (performance.now() - t0 < ms) requestAnimationFrame(tick); else resolve(window[key]);
      };
      requestAnimationFrame(tick);
    }), { key, ms });
    const before = await p.evaluate(() => ({
      scaleY: new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.campfire-flames')).transform).m22,
      glowScale: new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.campfire-glow')).transform).m22,
    }));
    const igniteRun = record('__ignite', 1600);
    await p.locator('.campfire-toggle').tap();
    const ignite = await igniteRun;
    // Measure growth from the first frame of movement so tap-dispatch lag
    // under load does not count as flame time.
    const igniteStart = ignite.find((s) => s.scaleY > 0.56) ?? ignite[0];
    const igniteDone = ignite.find((s) => s.scaleY >= 0.995 && s.o >= 0.99);
    if (igniteDone) igniteDone.t -= igniteStart.t;
    const glowGrown = ignite.some((s) => s.glowScale >= 0.99);
    const extinguishRun = record('__extinguish', 1400);
    await p.locator('.campfire-toggle').tap();
    const extinguish = await extinguishRun;
    const firstOut = extinguish[0];
    const outStart = extinguish.find((s) => s.o < 0.998) ?? firstOut;
    const outDone = extinguish.find((s) => s.o <= 0.01);
    const extinguishMs = outDone ? outDone.t - outStart.t : null;
    assert(before.scaleY < 0.7 && before.glowScale < 0.9, 'flames and glow rest compact when off');
    assert(igniteDone && igniteDone.t >= 550 && igniteDone.t <= 900, `flames grow upward over ~700ms (${igniteDone?.t}ms)`);
    assert(glowGrown, 'glow expands to full reach');
    assert(extinguishMs !== null && extinguishMs <= 600, `extinguish quicker than ignite (${extinguishMs}ms)`);
    assert(extinguishMs < (igniteDone?.t ?? 9999), 'asymmetric fire timing');
    await fireReady(p, false);
    await context.close();
    return { before, igniteMs: igniteDone?.t, extinguishMs, glowGrown };
  });
  await check('names accumulate per star, remove individually, blank clicks keep them, footer button and Escape clear all', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
    const p = await context.newPage(); await p.goto(url()); await ready(p);
    assert(!(await p.getByRole('button', { name: 'Clear names', exact: true }).isVisible()), 'clear button hidden with no names');
    const stars = await p.evaluate(() => {
      const scene = document.querySelector('.look-up-scene').getBoundingClientRect();
      const picked = [];
      for (const s of window.__sky.interactiveStars) {
        if (picked.every((q) => Math.hypot(q.point.x - s.point.x, q.point.y - s.point.y) >= 60)) picked.push(s);
        if (picked.length === 3) break;
      }
      return picked.map((s) => ({ name: s.name.english, x: s.point.x + scene.left, y: s.point.y + scene.top }));
    });
    for (const star of stars) await p.mouse.click(star.x, star.y);
    await p.waitForFunction((n) => document.querySelectorAll('.look-up-label').length === n, stars.length);
    assert(await p.getByRole('button', { name: 'Clear names', exact: true }).isVisible(), 'clear button appears with names');
    const blank = await p.evaluate(() => {
      const scene = document.querySelector('.look-up-scene').getBoundingClientRect();
      for (let y = 20; y < scene.height - 20; y += 24) {
        for (let x = 20; x < scene.width - 20; x += 24) {
          if (!window.__sky.interactiveStars.some((s) => Math.hypot(s.point.x - x, s.point.y - y) < 34))
            return { x: x + scene.left, y: y + scene.top };
        }
      }
      return null;
    });
    await p.mouse.click(blank.x, blank.y);
    await p.waitForTimeout(300);
    assert(await p.locator('.look-up-label').count() === stars.length, 'blank clicks keep every name');
    await p.mouse.click(stars[0].x, stars[0].y);
    await p.waitForFunction((n) => document.querySelectorAll('.look-up-label').length === n, stars.length - 1);
    assert(await p.getByRole('button', { name: 'Clear names', exact: true }).isVisible(), 'button stays while names remain');
    await p.locator('.look-up-star-focus').first().focus();
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => document.querySelectorAll('.look-up-label').length === 0);
    assert(!(await p.getByRole('button', { name: 'Clear names', exact: true }).isVisible()), 'button hides after Escape');
    for (const star of stars.slice(0, 2)) await p.mouse.click(star.x, star.y);
    await p.waitForFunction(() => document.querySelectorAll('.look-up-label').length === 2);
    await p.getByRole('button', { name: 'Clear names', exact: true }).click();
    await p.waitForFunction(() => document.querySelectorAll('.look-up-label').length === 0);
    const meteors = await p.evaluate(() => new Promise((resolve) => {
      const sceneCanvases = [...document.querySelectorAll('.look-up-scene canvas')];
      const meteorCanvas = sceneCanvases[0];
      const starCanvas = document.querySelector('.look-up-stars');
      const m1 = meteorCanvas.toDataURL();
      const s1 = starCanvas.toDataURL();
      setTimeout(() => resolve({
        meteorChanged: meteorCanvas.toDataURL() !== m1,
        starChanged: starCanvas.toDataURL() !== s1,
      }), 450);
    }));
    assert(meteors.meteorChanged && !meteors.starChanged, 'meteors fly across the resting sky without touching star pixels');
    await context.close();
    return { pinnedAtOnce: stars.length, individualRemoval: true, blankKeeps: true,
      escapeClears: true, footerClears: true, meteorsAtRest: meteors };
  });
  await check('125% browser pinch zoom retains layout and keyboard toggle without star changes', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai' });
    const p = await context.newPage(); await p.goto(url()); await ready(p);
    const cdp = await context.newCDPSession(p);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.25 });
    const geometry = await p.evaluate(() => ({ scale: visualViewport.scale,
      documentWidth: document.documentElement.scrollWidth, layoutWidth: innerWidth,
      fireWidth: document.querySelector('.campfire-toggle').getBoundingClientRect().width,
      footerTop: document.querySelector('footer').getBoundingClientRect().top,
      fireBottom: document.querySelector('.campfire-toggle').getBoundingClientRect().bottom }));
    assert(geometry.scale === 1.25 && geometry.documentWidth <= geometry.layoutWidth &&
      geometry.fireBottom < geometry.footerTop, 'zoomed layout stays within its CSS viewport');
    await startEvidence(p);
    await p.locator('.campfire-toggle').focus(); await p.keyboard.press('Enter'); await fireReady(p, true);
    const evidence = await compareEvidence(p); assertEvidence(evidence);
    await p.keyboard.press('Space'); await fireReady(p, false);
    await context.close(); return { geometry, evidence };
  });
  report.ok = report.failures.length === 0 && report.pageErrors.length === 0;
  return report;
}
