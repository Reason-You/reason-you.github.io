async page => {
  const baseUrl = page.url().match(/^https?:\/\/[^/]+/)?.[0] || 'http://localhost:3000';
  const report = { checks: [], failures: [], errors: [] };
  const assert = (value, message) => { if (!value) report.failures.push(message); };
  const open = async (options = {}) => {
    const c = await page.context().browser().newContext({ viewport: { width: options.width ?? (options.mobile ? 390 : 1280), height: options.mobile ? 844 : 900 },
      hasTouch: !!options.mobile, isMobile: !!options.mobile, reducedMotion: options.reduced ? 'reduce' : 'no-preference', deviceScaleFactor: 1 });
    await c.addInitScript(hidden => {
      localStorage.setItem('theme-storage', JSON.stringify({ state: { theme: 'dark' }, version: 0 }));
      if (hidden) { window.__qaHidden = true; Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__qaHidden }); }
    }, options.hidden);
    const p = await c.newPage(); p.on('pageerror', e => report.errors.push(e.message));
    await p.clock.install({ time: new Date('2026-01-15T13:00:00Z') });
    await p.goto(`${baseUrl}/stars-above/?skydebug=1&skyUtc=2026-01-15T13:00:00Z${options.east ? '&facing=east' : ''}`);
    await p.waitForFunction(() => window.__sky?.lightPollution.source === 'viirs'); await p.waitForTimeout(750);
    await p.clock.pauseAt(new Date(await p.evaluate(() => Date.now() + 100)));
    return { c, p };
  };
  const polarisPrompt = 'Hold for trails';
  const staticPrompt = 'Tap for trails';
  const hint = p => p.locator('.sky-discovery-hint');
  const text = async p => (await hint(p).allTextContents()).map(t => t.trim());
  const advance = (p, ms) => p.clock.runFor(ms);

  {
    const { c, p } = await open();
    try {
      await advance(p, 1400); assert((await text(p)).join() === polarisPrompt, 'desktop first prompt introduces the Polaris observation');
      await p.waitForTimeout(230); await p.screenshot({ path: '.cache/sky-verification/hint-desktop-play.png' });
      const style = await hint(p).evaluate(e => { const s = getComputedStyle(e); return { fontSize: s.fontSize, background: s.backgroundColor, border: s.borderWidth, color: s.color }; });
      assert(style.background === 'rgba(0, 0, 0, 0)' && style.border === '0px', 'hint remains plain text without a card or border');
      const view = await p.evaluate(() => window.__sky.view); await hint(p).click(); await advance(p, 250);
      assert((await hint(p).count()) === 0 && (await p.locator('.sky-time-button').getAttribute('aria-pressed')) === 'false', 'clicking play hint only dismisses it');
      assert(await p.evaluate(v => JSON.stringify(window.__sky.view) === JSON.stringify(v) && !localStorage.getItem('stars-above-learned-trails'), view), 'dismissal neither pans the sky nor marks trails learned');
      await advance(p, 9000); assert((await hint(p).count()) === 0, 'dismissal ends the intro round');
      report.checks.push({ case: 'desktop click dismissal', style });
    } finally { await c.close(); }
  }
  {
    const { c, p } = await open();
    try {
      await advance(p, 8500); assert((await text(p)).join() === 'Click to roast', 'idle intro advances to one fire caption');
      await p.waitForTimeout(230); await p.screenshot({ path: '.cache/sky-verification/hint-desktop-fire.png' });
      const b = await hint(p).boundingBox(); await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await advance(p, 250);
      assert((await p.getByRole('button', { name: 'Light campfire', exact: true }).count()) === 1, 'two quick hint clicks do not fall through and light the fire');
      assert(!await p.evaluate(() => localStorage.getItem('stars-above-learned-fire')), 'dismissal does not mark fire learned');
      await p.reload(); await p.waitForFunction(() => window.__sky?.lightPollution.source === 'viirs'); await advance(p, 15000);
      assert((await hint(p).count()) === 0, 'same session does not replay the intro after reload');
      report.checks.push({ case: 'automatic second caption and double-click capture' });
    } finally { await c.close(); }
  }
  {
    const { c, p } = await open();
    try {
      await advance(p, 1400); await p.getByRole('button', { name: 'Light campfire', exact: true }).click(); await advance(p, 2700);
      assert((await text(p)).join() === 'Click to taste', 'the first ready marshmallow receives its contextual short caption');
      assert(await p.evaluate(() => localStorage.getItem('stars-above-learned-fire') === '1'), 'successful lighting is remembered');
      await p.waitForTimeout(230); await p.screenshot({ path: '.cache/sky-verification/hint-desktop-taste.png' });
      await hint(p).click(); await advance(p, 250);
      assert((await p.locator('.campfire-count').count()) === 0 && (await p.getByRole('button', { name: 'Extinguish campfire', exact: true }).count()) === 1, 'taste hint dismissal neither eats nor extinguishes');
      await p.getByRole('button', { name: 'Eat roasted marshmallow', exact: true }).click(); await advance(p, 350);
      assert(await p.evaluate(() => localStorage.getItem('stars-above-learned-taste') === '1'), 'only confirmed eating marks taste learned');
      await advance(p, 4000); assert((await hint(p).count()) === 0, 'later marshmallows receive no repeated caption');
      report.checks.push({ case: 'fire and first taste learning' });
    } finally { await c.close(); }
  }
  {
    const { c, p } = await open();
    try {
      await advance(p, 1400); const b = await p.locator('.sky-time-button').boundingBox();
      assert((await p.locator('.sky-time-button').innerText()).trim() === 'Hold for trails', 'the hold action remains visible on the button');
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await advance(p, 350); await p.mouse.up(); await advance(p, 250);
      assert(!await p.evaluate(() => localStorage.getItem('stars-above-learned-trails')), 'a short press is not marked as learning hold');
      assert((await hint(p).count()) === 0, 'a short press keeps the action label as the only guidance');
      await p.mouse.down(); await advance(p, 1250); await p.mouse.up(); await advance(p, 250);
      assert(await p.evaluate(() => localStorage.getItem('stars-above-learned-trails') === '1'), 'an effective hold is remembered');
      assert((await hint(p).count()) === 0, 'holding ends the intro');
      await p.evaluate(() => sessionStorage.removeItem('stars-above-hints-started'));
      await p.reload(); await p.waitForFunction(() => window.__sky?.lightPollution.source === 'viirs'); await advance(p, 1400);
      assert((await text(p)).join() === 'Click to roast', 'a learned play gesture is skipped on a later round');
      report.checks.push({ case: 'hold threshold and persistent learning' });
    } finally { await c.close(); }
  }
  {
    const { c, p } = await open();
    try {
      await advance(p, 1400);
      const button = p.locator('.sky-time-button');
      const clock = p.locator('.stars-above-clock');
      const previewTime = await clock.locator('time').getAttribute('datetime');
      assert((await clock.innerText()).trim() === (await clock.locator('time').innerText()).trim(), 'the footer clock only shows observation time');
      await button.focus(); await p.keyboard.down('Space'); await advance(p, 100);
      assert((await button.getAttribute('aria-pressed')) === 'true', 'keyboard hold accelerates the sky');
      assert(/\d+×/.test(await button.innerText()), 'the active button displays the time multiplier');
      await p.keyboard.up('Space'); await advance(p, 250);
      assert((await button.getAttribute('aria-pressed')) === 'false', 'Space release ends acceleration');
      assert((await hint(p).count()) === 0, 'keyboard use dismisses the introductory prompt');
      const toolbar = p.locator('.sky-time-travel');
      const live = p.getByRole('button', { name: 'Back to live', exact: true });
      assert(await live.count() === 0, 'only the trail reset is offered while a fixed preview is advanced');
      await toolbar.getByRole('button', { name: 'Reset preview', exact: true }).press('Enter'); await advance(p, 32);
      assert(await clock.locator('time').getAttribute('datetime') === previewTime, 'reset returns to the original preview time');
      await toolbar.getByRole('button', { name: 'Back to live', exact: true }).press('Enter'); await advance(p, 32);
      assert(await live.count() === 0 && !new URL(p.url()).searchParams.has('skyUtc'), 'leaving a preview restores the live clock');
      report.checks.push({ case: 'keyboard feedback and prompt dismissal' });
    } finally { await c.close(); }
  }
  {
    const { c, p } = await open({ east: true });
    try {
      await advance(p, 8500); assert((await hint(p).count()) === 0, 'offscreen campfire receives no misplaced hint');
      for (let i = 0; i < 3; i++) { await p.locator('.sky-direction-trigger').click(); await advance(p, 350); }
      assert((await hint(p).count()) === 0, 'turning back to north does not replay skipped hints');
      report.checks.push({ case: 'world-space visibility' });
    } finally { await c.close(); }
  }
  {
    const { c, p } = await open({ hidden: true });
    try {
      await advance(p, 5000);
      assert((await hint(p).count()) === 0 && !await p.evaluate(() => sessionStorage.getItem('stars-above-hints-started')), 'a background opening does not consume the intro');
      await p.evaluate(() => { window.__qaHidden = false; document.dispatchEvent(new Event('visibilitychange')); }); await advance(p, 1400);
      assert((await text(p)).join() === polarisPrompt, 'foreground arrival starts the intro');
      await p.evaluate(() => { window.__qaHidden = true; document.dispatchEvent(new Event('visibilitychange')); }); await advance(p, 250);
      await p.evaluate(() => { window.__qaHidden = false; document.dispatchEvent(new Event('visibilitychange')); }); await advance(p, 9000);
      assert((await hint(p).count()) === 0, 'a shown intro retires on leaving the page');
      report.checks.push({ case: 'visibility event logic' });
    } finally { await c.close(); }
  }
  for (const reduced of [false, true]) {
    const { c, p } = await open({ mobile: true, reduced, width: reduced ? 320 : 390 });
    try {
      await advance(p, 1400); const first = await text(p);
      assert(first.join() === (reduced ? staticPrompt : polarisPrompt), `mobile ${reduced ? 'reduced' : 'normal'} first caption uses the right gesture`);
      const caption = await hint(p).boundingBox();
      const live = await p.getByRole('button', { name: 'Back to live', exact: true }).boundingBox();
      assert(caption && live && caption.y + caption.height <= live.y + 0.5, 'the mobile hint leaves the preview return button available');
      if (!reduced) {
        await advance(p, 6600); assert((await text(p)).join() === 'Tap to roast', 'mobile fire caption uses Tap');
        await p.waitForTimeout(230); await p.screenshot({ path: '.cache/sky-verification/hint-mobile-fire.png' });
        const button = p.locator('.sky-time-button');
        assert((await button.innerText()).trim() === 'Hold for trails', 'mobile hold label remains visible');
        await button.tap(); await advance(p, 250);
        assert((await hint(p).count()) === 0, 'a mobile tap dismisses the hint');
      } else {
        assert((await p.locator('.sky-time-button').innerText()).trim() === 'Show 1 hour of trails', 'reduced motion labels the exposure duration');
        await p.locator('.sky-time-button').press('Enter'); await advance(p, 250);
        const reset = await p.getByRole('button', { name: 'Reset preview', exact: true }).boundingBox();
        const direction = await p.locator('.sky-direction-trigger').boundingBox();
        const action = await p.locator('.sky-time-button').boundingBox();
        const disjoint = (a, b) => a && b && (a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
        assert(disjoint(reset, direction) && disjoint(action, direction), '320px static preview controls never intersect the direction button');
        assert(await p.evaluate(() => localStorage.getItem('stars-above-learned-trails') === '1'), 'reduced static exposure immediately records the click gesture');
      }
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert(!overflow, 'mobile hints introduce no horizontal overflow');
      const location = await p.locator('.stars-above-observation').evaluate(row => {
        const place = row.querySelector('.stars-above-place').getBoundingClientRect();
        const coordinates = row.querySelector('.stars-above-coordinates');
        const box = coordinates.getBoundingClientRect();
        return { text: coordinates.textContent, right: box.right, viewport: innerWidth,
          sameRow: Math.abs(place.y + place.height / 2 - box.y - box.height / 2) < 1 };
      });
      assert(location.text === '31.2989° N, 121.5035° E' && location.sameRow && location.right <= location.viewport,
        'both coordinates stay visible on the location row with the details closed');
      report.checks.push({ case: reduced ? 'mobile reduced mode' : 'mobile touch copy', first });
    } finally { await c.close(); }
  }
  {
    const context = await page.context().browser().newContext({
      viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    });
    const p = await context.newPage();
    p.on('pageerror', error => report.errors.push(error.message));
    let releaseTile;
    const gate = new Promise(resolve => { releaseTile = resolve; });
    try {
      await p.route('**/light-pollution/tiles/**', async route => {
        const tile = await route.fetch();
        await gate;
        await route.fulfill({ response: tile });
      });
      await p.goto(`${baseUrl}/stars-above/?skydebug=1&skyUtc=2026-11-18T14:00:00Z`,
        { waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => window.__sky?.lightPollution.source === 'fallback');
      const button = p.locator('.sky-time-button');
      const box = await button.boundingBox();
      const touch = await context.newCDPSession(p);
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
      });
      await p.waitForFunction(() => document.querySelector('.look-up-sky').hasAttribute('data-time-holding'));
      const response = p.waitForResponse(r => r.url().includes('/light-pollution/tiles/'));
      releaseTile();
      await response;
      await p.waitForFunction(() => Date.parse(document.querySelector('footer time').dateTime) >= Date.parse('2026-11-18T14:02:00Z'));
      assert(await button.getAttribute('aria-pressed') === 'true', 'the first touch remains held after the pollution tile arrives');
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForFunction(() => window.__sky?.lightPollution.source === 'viirs');
      assert(await p.locator('.look-up-sky').getAttribute('data-trails-active') !== null, 'releasing the first hold retains its exposure');
      report.checks.push({ case: 'cold first touch across a city pollution update' });
    } finally {
      releaseTile();
      await context.close();
    }
  }
  return report;
}
