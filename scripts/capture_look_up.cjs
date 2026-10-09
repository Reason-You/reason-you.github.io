async (page) => {
  const base = 'http://127.0.0.1:3001';
  const directory = '.cache/look-up-preview';
  const scenes = [
    { key: 'A-winter', lat: 31.2989, lon: 121.5035, utc: '2026-01-15T13:00:00Z', star: 'Betelgeuse', chinese: '参宿四' },
    { key: 'B-summer', lat: 31.2989, lon: 121.5035, utc: '2026-07-15T13:00:00Z', star: 'Antares', chinese: '心宿二' },
    { key: 'C-namibrand', lat: -24.77, lon: 15.96, utc: '2026-05-15T20:00:00Z', star: 'Acrux', chinese: '十字架二' },
  ];
  const report = { captures: [], checks: [], errors: [] };
  const browser = page.context().browser();
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const mobile = await mobileContext.newPage();
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const url = (scene) => `${base}/stars-above/?lat=${scene.lat}&lon=${scene.lon}&skyUtc=${scene.utc}&skydebug=1`;
  const pages = [{ page, key: 'desktop', width: 1280, height: 720 },
    { page: mobile, key: 'mobile', width: 390, height: 844 }];

  for (const viewport of pages) {
    const current = viewport.page;
    current.on('pageerror', error => report.errors.push(error.message));
    await current.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const scene of scenes) {
      await current.goto(url(scene), { waitUntil: 'load' });
      await current.waitForFunction(({ utc, lat }) =>
        window.__sky?.snapshot.date.toISOString() === utc.replace('Z', '.000Z') &&
        window.__sky.observer.latitude === lat && window.__sky.lightPollution.source === 'viirs', scene);
      await current.waitForFunction(() => Math.abs(document.querySelector('nav').firstElementChild.getBoundingClientRect().top) < 0.1 &&
        [...document.images].every(image => image.complete));
      await current.evaluate(() => document.fonts.ready);
      const stats = await current.evaluate(() => {
        const data = window.__sky;
        const sky = document.querySelector('.look-up-sky').getBoundingClientRect();
        const footer = document.querySelector('footer').getBoundingClientRect();
        return {
          sky: sky.toJSON(), footer: footer.toJSON(),
          scrollHeight: document.documentElement.scrollHeight, innerHeight: window.innerHeight,
          canvasCount: document.querySelectorAll('canvas').length,
          renderedStars: data.rendered.length, interactiveStars: data.interactiveStars.length,
          limitingMagnitude: data.lightPollution.limitingMagnitude, source: data.lightPollution.source,
          sunAltitude: data.snapshot.sunAltitude,
          computeDurationMs: data.computeDurationMs, renderDurationMs: data.renderDurationMs,
          horizontalFov: 2 * Math.atan(data.camera.width / (2 * data.camera.scale)) * 180 / Math.PI,
          verticalFov: 2 * Math.atan(data.camera.height / (2 * data.camera.scale)) * 180 / Math.PI,
          filtered: data.rendered.every(entry => entry.star.mag <= data.lightPollution.limitingMagnitude),
          interactiveFiltered: data.interactiveStars.every(entry => entry.star.mag <= 3),
          points: data.interactiveStars.map(entry => ({
            id: entry.star.id, name: entry.name.english, chinese: entry.name.chinese,
            altitude: entry.star.altitude, azimuth: entry.star.azimuth,
            x: entry.point.x, y: entry.point.y,
          })),
        };
      });
      assert(stats.canvasCount === 1, `${scene.key}/${viewport.key}: one canvas`);
      assert(stats.scrollHeight <= stats.innerHeight + 1, `${scene.key}/${viewport.key}: viewport overflow`);
      assert(stats.sky.top === (viewport.key === 'desktop' ? 80 : 64), 'navigation height');
      assert(Math.abs(stats.sky.bottom - stats.footer.top) < 1, 'sky meets footer');
      assert(stats.footer.bottom <= stats.innerHeight + 1, 'footer within viewport');
      assert(stats.filtered && stats.interactiveFiltered, 'magnitude filtering');
      assert(Math.abs((viewport.key === 'mobile' ? stats.verticalFov : stats.horizontalFov) -
        (viewport.key === 'mobile' ? 75 : 100)) < 0.01, 'responsive perspective FOV');
      assert(await current.locator('.look-up-label').count() === 0, 'default names hidden');
      const target = stats.points.find(entry => entry.name === scene.star);
      assert(target, `${scene.star} visible`);
      const tap = async (point) => {
        if (viewport.key === 'mobile') await current.touchscreen.tap(point.x, point.y + stats.sky.top);
        else await current.mouse.click(point.x, point.y + stats.sky.top);
      };
      const label = current.locator('.look-up-label');
      const waitLabel = async (name) => {
        await current.waitForFunction(name => {
          const label = document.querySelector('.look-up-label');
          return label?.lastElementChild.textContent === name && Number(getComputedStyle(label).opacity) > 0.99;
        }, name);
      };
      const noLabel = async () => current.waitForFunction(() => !document.querySelector('.look-up-label'));
      const checkLabelBounds = async () => {
        const bounds = await label.boundingBox();
        assert(bounds.x >= 0 && bounds.x + bounds.width <= stats.sky.width,
          `${scene.key}/${viewport.key}: label horizontal bounds`);
        assert(bounds.y >= stats.sky.top && bounds.y + bounds.height <= stats.sky.bottom,
          `${scene.key}/${viewport.key}: label avoids nav/footer`);
        assert(await label.count() === 1, 'one label');
      };
      const blankPath = `${directory}/${scene.key}-${viewport.key}-blank.png`;
      await current.screenshot({ path: blankPath, scale: 'css', fullPage: false, animations: 'disabled' });

      if (viewport.key === 'desktop') {
        let hoverPoint;
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
          const point = { x: target.x + 15 * Math.cos(angle), y: target.y + 15 * Math.sin(angle) };
          if (stats.points.every(entry => entry.id === target.id || Math.hypot(entry.x - point.x, entry.y - point.y) > 15)) {
            hoverPoint = point; break;
          }
        }
        assert(hoverPoint, 'nearest target at 15 CSS px');
        await current.mouse.move(hoverPoint.x, hoverPoint.y + stats.sky.top);
        await waitLabel(scene.star);
        await current.mouse.move(15, 15);
        await noLabel();
        report.checks.push(`${scene.key}: mouse hover at 15 CSS px and pointer leave`);
      }
      await tap(target);
      await waitLabel(scene.star);
      assert(await label.locator('[lang="zh-CN"]').textContent() === scene.chinese, 'bilingual name');
      if (viewport.key === 'desktop') await current.mouse.move(15, 15);
      await waitLabel(scene.star);
      await checkLabelBounds();
      assert(await current.locator('.look-up-star-focus[aria-pressed="true"]').count() === 1,
        'selected label is pinned');
      const selectedPath = `${directory}/${scene.key}-${viewport.key}-selected.png`;
      await current.screenshot({ path: selectedPath, scale: 'css', fullPage: false, animations: 'disabled' });
      report.captures.push({ scene: scene.key, viewport: viewport.key, blank: blankPath,
        selected: selectedPath, selectedStar: target, ...stats });

      // Navigation/footer actions do not bubble into the sky.
      await current.locator('footer p').click();
      await waitLabel(scene.star);
      if (viewport.key === 'mobile') {
        await current.getByRole('button', { name: 'Open main menu' }).tap();
        await waitLabel(scene.star);
        await current.getByRole('button', { name: 'Open main menu' }).tap();
        await current.waitForFunction(() => document.querySelector('nav').getBoundingClientRect().height <= 64);
      }
      await tap(target);
      await noLabel();
      const other = stats.points.find(entry => entry.id !== target.id &&
        Math.hypot(entry.x - target.x, entry.y - target.y) > 45 && entry.x > 30 && entry.x < stats.sky.width - 30);
      assert(other, 'second interactive star');
      await tap(target);
      await waitLabel(scene.star);
      await tap(other);
      await waitLabel(other.name);
      await checkLabelBounds();
      let blank = null;
      for (let y = 25; y < stats.sky.height - 20 && !blank; y += 60) {
        for (let x = 25; x < stats.sky.width - 20; x += 60) {
          if (stats.points.every(entry => Math.hypot(entry.x - x, entry.y - y) > 35)) {
            blank = { x, y }; break;
          }
        }
      }
      assert(blank, 'empty sky point');
      await tap(blank);
      await noLabel();
      const extremes = [stats.points.reduce((a, b) => a.y < b.y ? a : b),
        stats.points.reduce((a, b) => a.y > b.y ? a : b),
        stats.points.reduce((a, b) => a.x < b.x ? a : b),
        stats.points.reduce((a, b) => a.x > b.x ? a : b)];
      // Focus reaches separately catalogued close components without pointer ambiguity.
      for (const entry of extremes) {
        await current.getByRole('button', { name: `${entry.chinese}, ${entry.name}`, exact: true }).focus();
        await current.keyboard.press('Enter');
        await waitLabel(entry.name);
        await checkLabelBounds();
        await current.keyboard.press('Escape');
        await noLabel();
      }
      report.checks.push(`${scene.key}/${viewport.key}: pin, leave, same-star toggle, switch, blank dismiss, nav/footer isolation, keyboard, edge label bounds`);
    }
  }

  assert(Math.abs(report.captures[0].limitingMagnitude - report.captures[3].limitingMagnitude) < 1e-10,
    'same city limit on desktop and phone');
  assert(Math.abs(report.captures[2].limitingMagnitude - report.captures[5].limitingMagnitude) < 1e-10,
    'same dark-sky limit on desktop and phone');

  // Native history integration updates the shared sky store without remounting the page.
  await page.goto(url(scenes[0]));
  await page.waitForFunction(() => window.__sky?.snapshot.date.toISOString() === '2026-01-15T13:00:00.000Z');
  const winter = await page.evaluate(() => {
    const star = window.__sky.interactiveStars.find(entry => entry.name.english === 'Betelgeuse');
    return { x: star.point.x, y: star.point.y + document.querySelector('.look-up-sky').getBoundingClientRect().top };
  });
  await page.mouse.click(winter.x, winter.y);
  await page.waitForFunction(() => document.querySelector('.look-up-label')?.lastElementChild.textContent === 'Betelgeuse');
  await page.evaluate(href => history.pushState(null, '', href), url(scenes[1]));
  await page.waitForFunction(() => window.__sky?.snapshot.date.toISOString() === '2026-07-15T13:00:00.000Z');
  await page.waitForFunction(() => !document.querySelector('.look-up-label'));
  report.checks.push('URL time change closes a selected star after it leaves the visible sky');

  await page.context().grantPermissions(['geolocation'], { origin: base });
  await page.context().setGeolocation({ latitude: 31.2989, longitude: 121.5035 });
  await page.getByRole('button', { name: 'Use my sky', exact: true }).click();
  await page.waitForFunction(() => window.__sky.observer.source === 'geolocation');
  assert(await page.locator('footer').textContent().then(text => text.includes('Your sky')), 'local footer');
  await page.getByRole('button', { name: 'Back to Fudan sky', exact: true }).click();
  await page.waitForFunction(() => window.__sky.observer.source === 'default');
  report.checks.push('Use my sky and Back to Fudan sky preserve the shared observer/preferences workflow');

  // Settle the observer update and its ResizeObserver delivery before measuring idle work.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  // A static astronomy frame stays static throughout 60 display frames.
  const idleDraws = await page.evaluate(() => new Promise(resolve => {
    const ctx = document.querySelector('.look-up-sky canvas').getContext('2d');
    const original = ctx.clearRect;
    let draws = 0, frames = 0;
    ctx.clearRect = function (...args) { draws++; return original.apply(this, args); };
    const observe = () => {
      if (++frames === 60) { ctx.clearRect = original; resolve(draws); }
      else requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  }));
  assert(idleDraws === 0, `sky has no per-frame canvas redraw (${idleDraws} idle draws)`);
  report.checks.push('0 canvas redraws across 60 idle display frames');

  await page.getByRole('button', { name: /Current theme:/ }).click();
  await page.getByRole('button', { name: /Current theme:/ }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains('light'));
  assert(await page.locator('canvas').count() === 1, 'light theme one canvas');
  await page.getByRole('button', { name: /Current theme:/ }).click();
  report.checks.push('existing dark/light theme toggles on Look Up');

  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.waitForURL(`${base}/?**`);
  assert(await page.locator('canvas').count() === 2, 'homepage keeps star and meteor canvases');
  await page.getByRole('link', { name: 'Look Up', exact: true }).click();
  await page.waitForFunction(() => !!document.querySelector('.look-up-sky'));
  assert(await page.locator('canvas').count() === 1, 'navigation unmounts homepage canvases');
  assert(await page.evaluate(() => new URL(location.href).searchParams.get('skyUtc')) === scenes[1].utc,
    'navigation retains sky test URL');
  report.checks.push('Home → Look Up navigation retains query, homepage effects and unique static route');
  assert(report.errors.length === 0, `page errors: ${report.errors.join('; ')}`);
  await mobileContext.close();
  return report;
}
