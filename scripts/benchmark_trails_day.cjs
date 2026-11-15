async page => {
  const baseUrl = page.url().match(/^https?:\/\/[^/]+/)?.[0] || 'http://localhost:3000';
  const scenario = {"name":"Dense daylight seam rendering","utc":"2026-11-15T11:57:00Z","query":"&lat=31.2989&lon=121.5035&mag=7.7","source":"override","holdMs":11814};
  const report = { scenario, phases: [], actions: [], errors: [], clock: 'native RAF and performance.now' };
  const context = await page.context().browser().newContext({
    viewport: { width: scenario.mobile ? 390 : 1280, height: scenario.mobile ? 844 : 900 },
    deviceScaleFactor: scenario.mobile ? 3 : 2, hasTouch: !!scenario.mobile, isMobile: !!scenario.mobile,
    reducedMotion: scenario.reduced ? 'reduce' : 'no-preference', timezoneId: 'Asia/Shanghai',
  });
  try {
    await context.addInitScript(() => {
      localStorage.setItem('theme-storage', JSON.stringify({ state: { theme: 'dark' }, version: 0 }));
      localStorage.setItem('stars-above-star-hint-seen', '1');
      window.__audit = { counts: {}, tasks: [], frames: [], pointerId: 1 };
      addEventListener('pointerdown', e => { window.__audit.pointerId = e.pointerId; }, true);
      const clear = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        const key = [...this.canvas.classList].find(c => /look-up-(stars|trails|guides|ground)|sky-guides/.test(c)) || 'other';
        window.__audit.counts[key] = (window.__audit.counts[key] || 0) + 1;
        return clear.apply(this, args);
      };
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(list => {
        window.__audit.tasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration })));
      }).observe({ type: 'longtask', buffered: true });
      if (PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')) new PerformanceObserver(list => {
        window.__audit.frames.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration,
          blocking: e.blockingDuration, scripts: e.scripts.map(s => ({ duration: s.duration, forcedLayout: s.forcedStyleAndLayoutDuration, invoker: s.invoker, source: s.sourceURL.split('/').pop(), function: s.sourceFunctionName })) })));
      }).observe({ type: 'long-animation-frame', buffered: true });
      window.__measureNative = async (name, duration, drag) => {
        const q = window.__audit, counts = { ...q.counts }, gaps = [], renders = [];
        const started = performance.now(), root = document.querySelector('.look-up-sky');
        let previousFrame, previousSky = window.__sky;
        while (performance.now() - started < duration) {
          const timestamp = await new Promise(requestAnimationFrame);
          if (previousFrame !== undefined) gaps.push(timestamp - previousFrame);
          previousFrame = timestamp;
          if (drag) {
            const phase = (performance.now() - started) / duration * Math.PI * 2;
            root.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: q.pointerId,
              pointerType: drag.touch ? 'touch' : 'mouse', isPrimary: true, buttons: 1,
              clientX: drag.x + 140 * Math.sin(phase), clientY: drag.y + 45 * Math.sin(phase * 2) }));
          }
          if (window.__sky !== previousSky) { renders.push(window.__sky.renderDurationMs); previousSky = window.__sky; }
        }
        const finished = performance.now();
        const stats = a => { const s = [...a].sort((a, b) => a - b); return { n: a.length, mean: a.reduce((a, b) => a + b, 0) / (a.length || 1), p50: s[Math.floor(s.length * .5)] ?? 0, p95: s[Math.floor(s.length * .95)] ?? 0, p99: s[Math.floor(s.length * .99)] ?? 0, max: s.at(-1) ?? 0 }; };
        const frames = stats(gaps);
        return { name, elapsed: finished - started, fps: frames.mean ? 1000 / frames.mean : 0, frameMs: frames,
          gapsOver25ms: gaps.filter(x => x > 25).length, gapsOver50ms: gaps.filter(x => x > 50).length,
          renderMs: stats(renders), canvasDraws: Object.fromEntries(Object.entries(q.counts).map(([k, v]) => [k, v - (counts[k] || 0)])),
          longTasks: q.tasks.filter(e => e.start >= started && e.start < finished),
          longFrames: q.frames.filter(e => e.start >= started && e.start < finished).sort((a, b) => b.duration - a.duration).slice(0, 3),
          state: { stars: window.__sky.rendered.length, catalogue: window.__sky.snapshot.celestialStars.length,
            view: window.__sky.view, dragging: window.__sky.dragging, holding: root.hasAttribute('data-time-holding'),
            opacity: Number(getComputedStyle(document.querySelector('.look-up-trails')).opacity), sunAltitude: window.__sky.snapshot.sunAltitude } };
      };
    });
    const p = await context.newPage();
    p.on('pageerror', e => report.errors.push(e.message));
    await p.goto(`${baseUrl}/stars-above/?skydebug=1&skyUtc=${scenario.utc}${scenario.query || ''}`);
    await p.waitForFunction(source => window.__sky?.lightPollution.source === source, scenario.source);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(850);
    report.environment = await p.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl'), ext = gl?.getExtension('WEBGL_debug_renderer_info'); return { ua: navigator.userAgent, dpr: devicePixelRatio, hardwareThreads: navigator.hardwareConcurrency,
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, observers: PerformanceObserver.supportedEntryTypes }; });
    const cdp = await context.newCDPSession(p);
    const measure = async (name, duration, drag) => { const result = await p.evaluate(({ name, duration, drag }) => window.__measureNative(name, duration, drag), { name, duration, drag }); report.phases.push(result); return result; };
    const startPan = async () => {
      const b = await p.locator('.look-up-sky').boundingBox(), x = b.x + b.width * .5, y = b.y + b.height * .3;
      if (scenario.mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      else { await p.mouse.move(x, y); await p.mouse.down(); }
      return { x, y, touch: !!scenario.mobile };
    };
    const endPan = async () => { if (scenario.mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await p.mouse.up(); };
    await p.getByRole('button', { name: 'Light campfire', exact: true }).click();
    await measure('idle with campfire', 650);
    await measure('pan without grid or trails', 850, await startPan()); await endPan();
    await p.getByRole('button', { name: 'Show sky grid' }).click();
    await measure('pan with grid', 850, await startPan()); await endPan();
    if (await p.getByRole('button', { name: 'Reset view', exact: true }).count()) await p.getByRole('button', { name: 'Reset view', exact: true }).click();
    const play = await p.locator('.sky-time-button').boundingBox();
    if (scenario.reduced) {
      const pending = measure('reduced static exposure entry', 850);
      await p.locator('.sky-time-button').click(); await pending;
    } else {
      await p.mouse.move(play.x + play.width / 2, play.y + play.height / 2); await p.mouse.down();
      await measure('hold ramp and maximum speed with grid', scenario.holdMs);
      const released = await p.evaluate(() => performance.now()); await p.mouse.up();
      report.releaseTime = released;
    }
    if (!report.releaseTime) report.releaseTime = await p.evaluate(() => performance.now());
    await measure('retained trails pan with grid', 1600, await startPan()); await endPan();
    await p.getByRole('button', { name: 'Hide sky grid' }).click();
    await measure('retained trails pan without grid', 1600, await startPan()); await endPan();
    report.final = await p.evaluate(() => ({ dragging: window.__sky.dragging, opacity: getComputedStyle(document.querySelector('.look-up-trails')).opacity }));
    await cdp.detach();
  } finally { await context.close(); }
  return report;
}
