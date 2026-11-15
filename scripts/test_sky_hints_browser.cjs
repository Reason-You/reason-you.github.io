async page => {
  const baseUrl = page.url().match(/^https?:\/\/[^/]+/)?.[0] || 'http://localhost:3000';
  const report = { checks: [], failures: [], errors: [] };
  const assert = (value, message) => { if (!value) report.failures.push(message); };
  const open = async (options = {}) => {
    const c = await page.context().browser().newContext({ viewport: { width: options.mobile ? 390 : 1280, height: options.mobile ? 844 : 900 },
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
  const hint = p => p.locator('.sky-discovery-hint');
  const text = async p => (await hint(p).allTextContents()).map(t => t.trim());
  const advance = (p, ms) => p.clock.runFor(ms);

  {
    const { c, p } = await open();
    try {
      await advance(p, 1400); assert((await text(p)).join() === 'Hold for trails', 'desktop first prompt is the short hold caption');
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
      assert((await p.locator('.sky-time-button').innerText()).trim() === 'Hold', 'the hold action remains visible on the button');
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await advance(p, 350); await p.mouse.up(); await advance(p, 250);
      assert(!await p.evaluate(() => localStorage.getItem('stars-above-learned-trails')), 'a short press is not marked as learning hold');
      assert((await text(p)).join() === 'Press & hold', 'the first short press explains how to hold');
      await hint(p).click(); await advance(p, 250);
      assert((await hint(p).count()) === 0, 'the short-press caption supports click dismissal');
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await advance(p, 100); await p.mouse.up(); await advance(p, 250);
      assert((await hint(p).count()) === 0, 'the short-press caption appears only once per visit');
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
      await button.focus(); await p.keyboard.down('Space'); await advance(p, 100);
      assert((await button.getAttribute('aria-pressed')) === 'true', 'keyboard hold accelerates the sky');
      const ring = await button.locator('.sky-time-icon').evaluate(e => {
        const s = getComputedStyle(e, '::before'); return { border: s.borderTopWidth, opacity: Number(s.opacity) };
      });
      assert(ring.border === '1px' && ring.opacity > 0, 'a fine ring confirms the hold immediately');
      await p.keyboard.up('Space'); await advance(p, 250);
      assert((await text(p)).join() === 'Press & hold', 'a short keyboard press receives the same caption');
      await advance(p, 6200); assert((await hint(p).count()) === 0, 'the short-press caption expires after six seconds');
      report.checks.push({ case: 'keyboard feedback and caption expiry', ring });
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
      assert((await text(p)).join() === 'Hold for trails', 'foreground arrival starts the intro');
      await p.evaluate(() => { window.__qaHidden = true; document.dispatchEvent(new Event('visibilitychange')); }); await advance(p, 250);
      await p.evaluate(() => { window.__qaHidden = false; document.dispatchEvent(new Event('visibilitychange')); }); await advance(p, 9000);
      assert((await hint(p).count()) === 0, 'a shown intro retires on leaving the page');
      report.checks.push({ case: 'visibility event logic' });
    } finally { await c.close(); }
  }
  for (const reduced of [false, true]) {
    const { c, p } = await open({ mobile: true, reduced });
    try {
      await advance(p, 1400); const first = await text(p);
      assert(first.join() === (reduced ? 'Tap for trails' : 'Hold for trails'), `mobile ${reduced ? 'reduced' : 'normal'} first caption uses the right gesture`);
      if (!reduced) {
        await advance(p, 6600); assert((await text(p)).join() === 'Tap to roast', 'mobile fire caption uses Tap');
        await p.waitForTimeout(230); await p.screenshot({ path: '.cache/sky-verification/hint-mobile-fire.png' });
        const button = p.locator('.sky-time-button');
        assert((await button.innerText()).trim() === 'Hold', 'mobile hold label remains visible');
        await button.tap(); await advance(p, 250);
        assert((await text(p)).join() === 'Press & hold', 'a mobile tap receives the hold caption');
      } else {
        assert((await p.locator('.sky-time-button').innerText()).trim() === 'Tap', 'reduced motion labels the static action as Tap');
        await p.locator('.sky-time-button').click(); await advance(p, 250);
        assert(await p.evaluate(() => localStorage.getItem('stars-above-learned-trails') === '1'), 'reduced static exposure immediately records the click gesture');
      }
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert(!overflow, 'mobile hints introduce no horizontal overflow');
      report.checks.push({ case: reduced ? 'mobile reduced mode' : 'mobile touch copy', first });
    } finally { await c.close(); }
  }
  return report;
}
