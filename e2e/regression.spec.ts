import { expect, test } from '@playwright/test';

test('seeded missions and active combat continue identically after restoration', async ({ page }, testInfo) => {
  const evidence = await page.evaluate(async () => {
    const path = (document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src;
    const { scene: s, game } = await import(path);
    const savePath = '/src/game/runSave.ts'; const { readRunSnapshot } = await import(savePath);
    const objectivePath = '/src/game/objectives.ts'; const { seedForVergeContract } = await import(objectivePath);
    game.loop.sleep();
    const snapshot = () => { s.saveSnapshot(); return JSON.parse(localStorage.getItem('grovebound-run-v1')!); };
    const results = [];
    for (const name of ['waylight', 'seedheart', 'stag', 'forgeAssault', 'coolantRun', 'altarRite', 'moonflame',
      'combat', 'slow-terrain', 'upgrade', 'quarry-choice', 'moon-choice']) {
      const region = ['forgeAssault', 'coolantRun', 'combat', 'moon-choice'].includes(name) ? 1
        : ['altarRite', 'moonflame'].includes(name) ? 2 : 0;
      const seed = seedForVergeContract(144, ['waylight', 'seedheart', 'stag'].includes(name) ? name : 'waylight');
      s.beginRun('warden', 'staff', 0, ['staff', 'bow'], false, false, false, 'bow', seed);
      s.region = region; s.quarryRoute = name === 'coolantRun' ? name : 'forgeAssault';
      s.moonRoute = name === 'moonflame' ? name : 'altarRite'; s.startRegion();
      s.stats.maxHealth = 500; s.stats.regen = 20; s.health = 500;
      const target = s.nextRequiredObjective();
      if (target) s.hero.setPosition(target.x, target.y);
      if (name === 'combat') {
        s.hero.setPosition(900, 900); s.stageSeconds = 100;
        s.spawnEnemy('wisp', { x: 650, y: 900 }); s.spawnEnemy('thornback', { x: 1120, y: 900 });
        s.spawnEnemy('boss', { x: 900, y: 1100 });
        s.spawnEmberField(900, 1050, 8, 3.6, 0.3);
        s.enemies[0].lance = { ...s.enemies[0].lance, cooldown: 0, windup: 0.6, fromX: 650, fromY: 900, toX: 900, toY: 900 };
        s.enemies[1].charge = { ...s.enemies[1].charge, cooldown: 0, windup: 0, dashRemaining: 0.22,
          fromX: 1120, fromY: 900, toX: 850, toY: 900, hit: false };
        s.enemies[2].strike = { cooldown: 0, windup: 0.7, x: 900, y: 900, radius: 125 };
        s.enemies[2].burnRemaining = 2.6; s.enemies[2].burnDamage = 8; s.enemies[2].burnTickClock = 0.4;
        s.enemies[2].burnSource = 'staff'; s.enemies[2].tangleRemaining = 1.2;
        s.commandChain = { weapon: 'staff', remaining: 2.5 };
        s.weapons[0].commandCooldown = 6.5;
      } else if (name === 'slow-terrain') {
        const field = s.objects.find((o: {kind: string}) => o.kind === 'bramble');
        s.hero.setPosition(field.x, field.y); s.updateHazards(); s.mineNearbyField();
      } else if (name === 'upgrade') s.gainXp(100);
      else if (name.endsWith('-choice')) s.routeChoiceRegion = name === 'quarry-choice' ? 1 : 2;
      else {
        for (let i = 0; i < (name === 'coolantRun' ? 150 : 60); i++) s.update(i * 1000 / 60, 1000 / 60);
      }
      const initial = snapshot();
      const valid = readRunSnapshot() !== null;
      const advance = () => {
        s.pausedByUser = false; s.joyVector.set(0.4, -0.2);
        for (let i = 0; i < 120; i++) s.update(i * 1000 / 60, 1000 / 60);
        return snapshot();
      };
      const uninterrupted = advance();
      s.restoreRun(structuredClone(initial));
      const restored = snapshot();
      const continued = advance();
      const differences = (a: Record<string, unknown>, b: Record<string, unknown>) =>
        [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
      results.push({ name, valid, roundTripDifferences: differences(initial, restored),
        continuationDifferences: differences(uninterrupted, continued), seconds: initial.seconds,
        enemies: initial.enemies.length, coolantCarryRemaining: initial.coolantCarryRemaining });
    }
    return results;
  });
  await testInfo.attach('save-continuation-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  for (const result of evidence) {
    expect(result.valid, result.name).toBe(true);
    expect(result.roundTripDifferences, `${result.name} round trip`).toEqual([]);
    expect(result.continuationDifferences, `${result.name} continuation`).toEqual([]);
  }
});

test.beforeEach(async ({ page }) => {
  await page.goto('/?seed=24');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#start-button').click();
});

test('all nine terrain fields remain resumable', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = (document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src; const { scene: s, game } = await import(path);
    const savePath = '/src/game/runSave.ts'; const { readRunSnapshot } = await import(savePath);
    game.loop.sleep();
    for (let region = 0; region < 3; region++) {
      s.region = region; s.startRegion();
      for (const object of [...s.objects]) {
        if (['bramble', 'ore', 'moonstone'].includes(object.kind)) s.hitObject(object, 10000);
      }
    }
    s.saveSnapshot();
    return { cleared: s.metrics.terrain, restored: readRunSnapshot()?.metrics.terrain };
  });
  expect(result).toEqual({ cleared: 9, restored: 9 });
});

test('reload retains the direct mining cooldown', async ({ page }) => {
  const before = await page.evaluate(async () => {
    const path = (document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src; const { scene: s, game } = await import(path);
    game.loop.sleep();
    const field = s.objects.find((o: {kind: string}) => o.kind === 'bramble');
    s.hero.setPosition(field.x, field.y); s.mineNearbyField(); s.saveSnapshot();
    return { cooldown: s.mineCooldown, hp: field.hp };
  });
  await page.reload();
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#resume-run-button').click();
  const after = await page.evaluate(async () => {
    const path = (document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src; const { scene: s, game } = await import(path);
    game.loop.sleep(); s.setPaused(false);
    const cooldown = s.mineCooldown;
    s.mineNearbyField();
    return { cooldown, hp: s.objects.find((o: {kind: string}) => o.kind === 'bramble').hp };
  });
  expect(after).toEqual(before);
});

test('Space activates a focused command and retains its focus', async ({ page }) => {
  await page.evaluate(async () => {
    const path = (document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src; const { scene: s, game } = await import(path);
    game.loop.sleep(); s.spawnEnemy('brute', { x: 1000, y: 900 });
  });
  const bow = page.locator('[data-focus="bow"]');
  await bow.focus();
  await page.keyboard.press('Space');
  await expect(bow).toHaveAttribute('aria-pressed', 'true');
  await expect(bow).toBeFocused();
});

test('Space resumes a paused run through its native button', async ({ page }) => {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(page.locator('#resume-button')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#pause')).toBeHidden();
  await expect(page.locator('#game canvas')).toBeFocused();
});

test('active fire and attack warnings survive a real page reload', async ({ page }, testInfo) => {
  const before = await page.evaluate(async () => {
    const path = (document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src;
    const { scene: s, game } = await import(path);
    game.loop.sleep();
    s.region = 2; s.startRegion();
    s.spawnEnemy('wisp', { x: 650, y: 900 });
    s.spawnEnemy('thornback', { x: 1030, y: 900 });
    s.spawnEnemy('boss', { x: 900, y: 1200 });
    s.spawnEmberField(940, 940, 8, 3.6, 0.3);
    s.enemies[0].lance.cooldown = 0; s.enemies[1].charge.cooldown = 0; s.enemies[2].strike.cooldown = 0;
    s.update(0, 1000 / 60); s.setPaused(true); s.saveSnapshot();
    return JSON.parse(localStorage.getItem('grovebound-run-v1')!);
  });
  expect(before.enemies[0].wispLance.windup).toBeGreaterThan(0);
  expect(before.enemies[1].thornbackCharge.windup).toBeGreaterThan(0);
  expect(before.enemies[2].bossStrike.windup).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#resume-run-button').click();
  const after = await page.evaluate(async () => {
    const path = (document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src;
    const { scene: s, game } = await import(path);
    game.loop.sleep(); s.saveSnapshot();
    return JSON.parse(localStorage.getItem('grovebound-run-v1')!);
  });
  expect(after).toEqual(before);
  await testInfo.attach('reload-snapshot', { body: JSON.stringify(after, null, 2), contentType: 'application/json' });
});

test('field keyboard controls work and stop when a HUD control is focused', async ({ page }) => {
  const position = () => page.evaluate(async () => {
    const path = (document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src;
    const { scene: s } = await import(path); return s.hero.x;
  });
  const before = await position();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(200);
  await page.keyboard.up('ArrowRight');
  expect(await position()).toBeGreaterThan(before + 10);
  await page.keyboard.press('Space', { delay: 80 });
  await expect(page.locator('#special-cooldown')).not.toHaveText('READY');
  await page.locator('[data-focus="bow"]').focus();
  const stopped = await position();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(200);
  await page.keyboard.up('ArrowRight');
  expect(await position()).toBe(stopped);
});

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`keyboard commands and core HUD fit ${size.width}x${size.height}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(size);
    await page.locator('[data-focus="bow"]').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('[data-focus="bow"]')).toBeFocused();
    for (const selector of ['#pause-button', '#mission-card', '#special-button', '#weapon-tray', '#stats', '#toast']) {
      const box = await page.locator(selector).boundingBox();
      expect(box, selector).not.toBeNull();
      expect(box!.x, selector).toBeGreaterThanOrEqual(0);
      expect(box!.y, selector).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, selector).toBeLessThanOrEqual(size.width);
      expect(box!.y + box!.height, selector).toBeLessThanOrEqual(size.height);
    }
    await page.screenshot({ path: testInfo.outputPath(`hud-${size.width}.png`) });
    expect(errors).toEqual([]);
  });
}

test('region floor texture stays bounded across repeated region loads', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = (document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src;
    const { scene: s, game } = await import(path); game.loop.sleep();
    const count = Object.keys(s.textures.list).length;
    for (let i = 0; i < 12; i++) { s.region = i % 3; s.startRegion(); }
    return { before: count, after: Object.keys(s.textures.list).length,
      width: s.textures.get('region-floor').getSourceImage().width };
  });
  expect(result.after).toBe(result.before);
  expect(result.width).toBe(1800);
});
