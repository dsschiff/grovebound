import Phaser from 'phaser';
import {
  HERO_INFO, REGIONS, STAT_INFO, STAT_KEYS, WEAPON_INFO, Rng, baseStatsFor, damageAfterDefense,
  generateRegionLayout, upgradeStat, xpToNextLevel,
  type Hero, type Stat, type Stats, type Upgrade, type Weapon,
} from './logic';
import { clearRunSnapshot, emptyRunMetrics, saveRunSnapshot, type EnemySave, type ObjectSave, type RunMetrics, type RunSnapshot } from './runSave';
import { soundFx } from './audio';
import { bossPhaseFor, chooseAutoTarget, pickUpgradeChoices, shouldSpawnGuardian, weaponDamage, weaponSplash } from './combat';

const WORLD = 1800;
type EnemyKind = EnemySave['kind'];
type ObjectKind = ObjectSave['kind'];
interface Enemy {
  sprite: Phaser.GameObjects.Image; kind: EnemyKind; hp: number; maxHp: number;
  speed: number; damage: number; radius: number; phase: number; pendingDamage: number; damageClock: number;
}
interface WorldObject { view: Phaser.GameObjects.Container; kind: ObjectKind; x: number; y: number; hp: number; maxHp: number; active: boolean }
interface Orb { view: Phaser.GameObjects.Container; x: number; y: number; value: number }
interface Cache { view: Phaser.GameObjects.Container; x: number; y: number; stat: Stat }
interface EquippedWeapon { id: Weapon; rank: number; cooldown: number }

export interface HudState {
  health: number; maxHealth: number; level: number; xp: number; xpNeeded: number;
  kills: number; seconds: number; stageSeconds: number; region: number;
  stats: Stats; bossHp: number | null; bossMaxHp: number | null;
  weapons: EquippedWeapon[]; special: string; specialCooldown: number;
  wardsLeft: number; gateOpen: boolean; hero: Hero;
  map: { x: number; y: number; objects: { x: number; y: number; kind: ObjectKind; active: boolean }[]; enemies: { x: number; y: number; kind: EnemyKind }[] };
}
export interface RunResult { won: boolean; kills: number; seconds: number; level: number; hero: Hero; region: number; weapons: Weapon[]; metrics: RunMetrics }
export interface GameCallbacks {
  onHud: (hud: HudState) => void;
  onUpgrade: (options: Upgrade[]) => void;
  onEnd: (result: RunResult) => void;
  onEvent: (message: string) => void;
}

export class GroveScene extends Phaser.Scene {
  private callbacks: GameCallbacks;
  private hero!: Phaser.GameObjects.Image;
  private heldWeapon!: Phaser.GameObjects.Image;
  private nav!: Phaser.GameObjects.Text;
  private petView!: Phaser.GameObjects.Arc;
  private joystickBase!: Phaser.GameObjects.Arc;
  private joystickNub!: Phaser.GameObjects.Arc;
  private bars!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private decorations: Phaser.GameObjects.GameObject[] = [];
  private enemies: Enemy[] = [];
  private objects: WorldObject[] = [];
  private orbs: Orb[] = [];
  private caches: Cache[] = [];
  private running = false;
  private choosing = false;
  private pausedByUser = false;
  private heroId: Hero = 'warden';
  private skin = false;
  private masteryRank = 0;
  private unlockedWeapons: Weapon[] = ['axe'];
  private weapons: EquippedWeapon[] = [{ id: 'axe', rank: 1, cooldown: 0 }];
  private weaponSlots = 1;
  private splashBonus = 0;
  private pet = false;
  private petClock = 0;
  private autoSpecial = false;
  private specialCooldown = 0;
  private reducedEffects = false;
  private stats: Stats = baseStatsFor('warden');
  private metrics: RunMetrics = emptyRunMetrics();
  private health = 100;
  private xp = 0;
  private level = 1;
  private kills = 0;
  private seconds = 0;
  private region = 0;
  private stageSeconds = 0;
  private spawnClock = 0;
  private cacheClock = 0;
  private hudClock = 0;
  private saveClock = 0;
  private invulnerability = 0;
  private attackPose = 0;
  private gatekeeperSpawned = false;
  private bossSpawned = false;
  private upgradeOptions: Upgrade[] = [];
  private seed = 1;
  private random = new Rng(1);
  private joyPointer: number | null = null;
  private joyOrigin = new Phaser.Math.Vector2();
  private joyVector = new Phaser.Math.Vector2();

  constructor(callbacks: GameCallbacks) { super('Grove'); this.callbacks = callbacks; }

  preload(): void {
    const base = import.meta.env.BASE_URL;
    for (const key of ['warden', 'ranger', 'ember', 'axe', 'gnarl', 'wisp', 'brute', 'briar-king', 'tree']) {
      this.load.image(key, `${base}art/${key}.png`);
    }
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, WORLD, WORLD);
    this.hero = this.add.image(900, 900, 'warden').setDisplaySize(70, 78).setDepth(5);
    this.heldWeapon = this.add.image(924, 911, 'axe').setDisplaySize(43, 43).setDepth(6);
    this.nav = this.add.text(900, 820, '', { fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#fff0bc', stroke: '#18372d', strokeThickness: 4 }).setOrigin(0.5).setDepth(12);
    this.petView = this.add.circle(900, 900, 9, 0xffe4a3).setStrokeStyle(3, 0x446c60).setDepth(7).setVisible(false);
    this.bars = this.add.graphics().setDepth(9);
    this.cameras.main.startFollow(this.hero, true, 0.14, 0.14);
    this.joystickBase = this.add.circle(0, 0, 53, 0xe9e6c6, 0.13).setStrokeStyle(2, 0xf9f0cf, 0.55).setScrollFactor(0).setDepth(100).setVisible(false);
    this.joystickNub = this.add.circle(0, 0, 23, 0xf8e8b0, 0.45).setStrokeStyle(2, 0xffffff, 0.7).setScrollFactor(0).setDepth(101).setVisible(false);
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    this.cursors = this.input.keyboard?.createCursorKeys() as Phaser.Types.Input.Keyboard.CursorKeys;
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUp, this);
    this.publishHud();
  }

  beginRun(hero: Hero, startingWeapon: Weapon, masteryRank: number, unlockedWeapons: Weapon[], reducedEffects: boolean, skin = false, autoSpecialEnabled = true): void {
    if (!this.hero) return;
    clearRunSnapshot();
    this.clearRunObjects();
    this.seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0 || 1;
    this.random = new Rng(this.seed);
    this.heroId = hero; this.skin = skin; this.masteryRank = masteryRank;
    this.unlockedWeapons = unlockedWeapons;
    this.weapons = [{ id: startingWeapon, rank: 1, cooldown: 0 }];
    this.weaponSlots = masteryRank >= 4 ? 2 : 1;
    this.splashBonus = 0; this.pet = false; this.petClock = 0;
    this.autoSpecial = masteryRank >= 5 && autoSpecialEnabled; this.specialCooldown = 0; this.reducedEffects = reducedEffects;
    this.stats = baseStatsFor(hero, masteryRank);
    this.metrics = emptyRunMetrics();
    this.health = this.stats.maxHealth;
    this.xp = 0; this.level = 1; this.kills = 0; this.seconds = 0; this.region = 0;
    this.attackPose = 0;
    this.choosing = false; this.pausedByUser = false; this.upgradeOptions = [];
    this.hero.setTexture(hero).setTint(skin ? 0xf3d28a : 0xffffff).setPosition(900, 900).setAlpha(1).setDisplaySize(70, 78);
    this.heldWeapon.setVisible(startingWeapon === 'axe').setTint(skin ? 0xffd47d : 0xffffff);
    this.startRegion();
    this.spawnCache('attack', 1050, 835);
    this.running = true;
    this.publishHud(); this.saveSnapshot();
  }

  restoreRun(snapshot: RunSnapshot): boolean {
    if (!this.hero) return false;
    this.clearRunObjects();
    this.seed = snapshot.seed; this.random = new Rng(snapshot.rngState);
    this.heroId = snapshot.hero; this.skin = snapshot.skin; this.masteryRank = snapshot.masteryRank;
    this.unlockedWeapons = snapshot.unlockedWeapons;
    this.weapons = snapshot.weapons.map(weapon => ({ ...weapon }));
    this.weaponSlots = snapshot.weaponSlots; this.splashBonus = snapshot.splashBonus;
    this.pet = snapshot.pet; this.petClock = snapshot.petClock; this.autoSpecial = snapshot.autoSpecial;
    this.specialCooldown = snapshot.specialCooldown; this.reducedEffects = snapshot.reducedEffects;
    this.stats = { ...snapshot.stats }; this.health = snapshot.health; this.xp = snapshot.xp;
    this.metrics = { ...snapshot.metrics, regionSeconds: [...snapshot.metrics.regionSeconds] as RunMetrics['regionSeconds'] };
    this.level = snapshot.level; this.kills = snapshot.kills; this.seconds = snapshot.seconds;
    this.region = snapshot.region; this.stageSeconds = snapshot.stageSeconds;
    this.spawnClock = snapshot.spawnClock; this.cacheClock = snapshot.cacheClock;
    this.invulnerability = snapshot.invulnerability;
    this.attackPose = 0;
    this.gatekeeperSpawned = snapshot.gatekeeperSpawned; this.bossSpawned = snapshot.bossSpawned;
    this.choosing = snapshot.choosing; this.upgradeOptions = [...snapshot.upgradeOptions];
    this.hero.setTexture(this.heroId).setTint(this.skin ? 0xf3d28a : 0xffffff)
      .setPosition(snapshot.x, snapshot.y).setAlpha(1).setDisplaySize(70, 78);
    this.heldWeapon.setVisible(this.weapons.some(weapon => weapon.id === 'axe')).setTint(this.skin ? 0xffd47d : 0xffffff);
    this.drawRegion();
    snapshot.objects.forEach(object => this.spawnObject(object.kind, object.x, object.y, object.hp, object.maxHp, object.active));
    snapshot.enemies.forEach(enemy => this.spawnEnemy(enemy.kind, { x: enemy.x, y: enemy.y }, enemy));
    snapshot.orbs.forEach(orb => this.spawnOrb(orb.x, orb.y, orb.value));
    snapshot.caches.forEach(cache => this.spawnCache(cache.stat, cache.x, cache.y));
    this.petView.setVisible(this.pet);
    this.running = true; this.pausedByUser = !this.choosing;
    if (this.choosing) this.callbacks.onUpgrade(this.upgradeOptions);
    this.publishHud();
    return true;
  }

  chooseUpgrade(choice: Upgrade): void {
    if (!this.running || !this.choosing || !this.upgradeOptions.includes(choice)) return;
    if (STAT_KEYS.includes(choice as Stat)) {
      const stat = choice as Stat;
      const oldMax = this.stats.maxHealth;
      this.stats = upgradeStat(this.stats, stat);
      if (stat === 'maxHealth') this.health = Math.min(this.stats.maxHealth, this.health + this.stats.maxHealth - oldMax);
    } else if (choice.startsWith('weapon:')) {
      const weapon = choice.slice(7) as Weapon;
      const equipped = this.weapons.find(item => item.id === weapon);
      if (equipped) equipped.rank = Math.min(3, equipped.rank + 1);
      else if (this.weapons.length < this.weaponSlots) this.weapons.push({ id: weapon, rank: 1, cooldown: 0 });
    } else if (choice === 'splash') this.splashBonus = Math.min(80, this.splashBonus + 20);
    else if (choice === 'pet') { this.pet = true; this.petView.setVisible(true); }
    else if (choice === 'wildArsenal') this.weaponSlots = 3;
    const info = this.upgradeInfo(choice);
    this.metrics.blessings++;
    this.floatText(`+ ${info.name.toUpperCase()}`, this.hero.x, this.hero.y - 62, info.color);
    this.burst(this.hero.x, this.hero.y, info.color, 12);
    this.choosing = false; this.upgradeOptions = [];
    this.heldWeapon.setVisible(this.weapons.some(weapon => weapon.id === 'axe'));
    this.publishHud(); this.saveSnapshot();
  }

  upgradeInfo(choice: Upgrade): { name: string; icon: string; color: string; description: string } {
    if (STAT_KEYS.includes(choice as Stat)) return STAT_INFO[choice as Stat];
    if (choice.startsWith('weapon:')) {
      const weapon = choice.slice(7) as Weapon;
      const info = WEAPON_INFO[weapon];
      const owned = this.weapons.some(item => item.id === weapon);
      return { name: owned ? `${info.name} II` : info.name, icon: info.icon, color: info.color, description: owned ? 'Increase this weapon’s damage' : 'Add this weapon to your build' };
    }
    if (choice === 'splash') return { name: 'Wide Impact', icon: '◉', color: '#ffcc92', description: 'Axe and staff hit a wider area' };
    if (choice === 'pet') return { name: 'Glowfox', icon: '✧', color: '#ffdf9b', description: 'A small companion attacks nearby foes' };
    return { name: 'Wild Arsenal', icon: '❖', color: '#ecd292', description: 'Carry a third weapon this run' };
  }

  setPaused(value: boolean): void {
    this.pausedByUser = value;
    if (value) { this.releaseJoystick(); this.saveSnapshot(); }
  }
  isRunning(): boolean { return this.running; }
  isChoosing(): boolean { return this.choosing; }
  endRunEarly(): void { this.pausedByUser = false; this.running = false; this.releaseJoystick(); clearRunSnapshot(); }

  // Localhost-only QA controls are wired in main.ts when ?debug=1 is present.
  debugApproachObjective(): void {
    if (!this.running || this.choosing) return;
    for (const enemy of this.enemies) enemy.sprite.destroy();
    this.enemies = [];
    const target = this.objects.find(object => object.kind === 'ward' && object.active)
      ?? this.objects.find(object => (object.kind === 'shrine' || object.kind === 'relic') && object.active)
      ?? this.objects.find(object => object.kind === 'gate')!;
    this.hero.setPosition(Phaser.Math.Clamp(target.x + 70, 42, WORLD - 42), target.y);
    this.saveSnapshot();
  }

  debugAdvanceRegion(): void {
    if (!this.running || this.choosing) return;
    for (const ward of this.objects.filter(object => object.kind === 'ward' && object.active)) this.hitObject(ward, ward.hp);
    this.stageSeconds = Math.max(this.stageSeconds, REGIONS[this.region].duration);
    this.updateSpawns(0);
    const guardian = this.enemies.find(enemy => enemy.kind === 'gatekeeper' || enemy.kind === 'boss');
    if (guardian) this.hitEnemy(guardian, guardian.hp);
    if (this.region < 2) {
      const gate = this.objects.find(object => object.kind === 'gate')!;
      this.hero.setPosition(gate.x, gate.y);
      this.updateObjects();
    }
    this.saveSnapshot();
  }

  debugHeal(): void { if (this.running) { this.health = this.stats.maxHealth; this.publishHud(); this.saveSnapshot(); } }

  castSpecial(): void {
    if (!this.running || this.choosing || this.pausedByUser || this.specialCooldown > 0) return;
    this.specialCooldown = 12;
    soundFx.play('special');
    const radius = this.heroId === 'ember' ? 190 : this.heroId === 'warden' ? 145 : 300;
    const color = this.heroId === 'ember' ? '#ffb67d' : this.heroId === 'ranger' ? '#b9ed9f' : '#fbe3a8';
    const circle = this.add.circle(this.hero.x, this.hero.y, radius, Phaser.Display.Color.HexStringToColor(color).color, 0.18)
      .setStrokeStyle(5, Phaser.Display.Color.HexStringToColor(color).color, 0.75).setDepth(7);
    this.tweens.add({ targets: circle, scale: 1.15, alpha: 0, duration: 380, onComplete: () => circle.destroy() });
    const targets = this.enemies.filter(enemy => this.distance(this.hero.x, this.hero.y, enemy.sprite.x, enemy.sprite.y) <= radius)
      .sort((a, b) => this.distance(this.hero.x, this.hero.y, a.sprite.x, a.sprite.y) - this.distance(this.hero.x, this.hero.y, b.sprite.x, b.sprite.y));
    for (const enemy of this.heroId === 'ranger' ? targets.slice(0, 5) : targets) this.hitEnemy(enemy, Math.round(this.stats.attack * (this.heroId === 'ember' ? 3 : 2.3)));
    for (const object of this.objects.filter(item => item.active && item.hp > 0 && this.distance(this.hero.x, this.hero.y, item.x, item.y) < radius)) {
      this.hitObject(object, Math.round(this.stats.attack * 2.3));
    }
    this.callbacks.onEvent(`${HERO_INFO[this.heroId].special.toUpperCase()}!`);
    this.saveSnapshot();
  }

  update(_time: number, deltaMs: number): void {
    if (!this.running || this.choosing || this.pausedByUser) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.seconds += dt; this.stageSeconds += dt;
    this.invulnerability = Math.max(0, this.invulnerability - dt);
    this.attackPose = Math.max(0, this.attackPose - dt);
    this.specialCooldown = Math.max(0, this.specialCooldown - dt);
    this.health = Math.min(this.stats.maxHealth, this.health + this.stats.regen * dt);
    this.moveHero(dt);
    this.updateEnemies(dt);
    if (!this.running) return;
    this.updateOrbs(dt);
    this.updateCaches();
    this.updateSpawns(dt);
    for (const weapon of this.weapons) {
      weapon.cooldown -= dt;
      if (weapon.cooldown <= 0) this.autoAttack(weapon);
    }
    this.updatePet(dt);
    if (this.autoSpecial && this.specialCooldown <= 0 && this.enemies.some(enemy => this.distance(this.hero.x, this.hero.y, enemy.sprite.x, enemy.sprite.y) < 170)) this.castSpecial();
    if (this.keys?.SPACE && Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) this.castSpecial();
    this.updateObjects();
    this.updateNavigation();
    this.drawBars();
    this.hudClock += dt; this.saveClock += dt;
    if (this.hudClock >= 0.12) { this.hudClock = 0; this.publishHud(); }
    if (this.saveClock >= 2) { this.saveClock = 0; this.saveSnapshot(); }
  }

  private startRegion(): void {
    this.clearRunObjects();
    this.stageSeconds = 0; this.spawnClock = 0; this.cacheClock = 0;
    this.gatekeeperSpawned = false; this.bossSpawned = false;
    this.hero.setPosition(900, 900);
    this.drawRegion();
    const layout = generateRegionLayout(this.seed, this.region);
    for (const clearing of layout.clearings) {
      if (clearing.kind === 'ward') this.spawnObject('ward', clearing.x, clearing.y, 150 + this.region * 95, 150 + this.region * 95, true);
      if (clearing.kind === 'shrine') {
        this.spawnObject('shrine', clearing.x - 48, clearing.y, 105 + this.region * 40, 105 + this.region * 40, true);
        this.spawnObject('relic', clearing.x + 65, clearing.y + 15, 105 + this.region * 40, 105 + this.region * 40, false);
      }
      if (clearing.kind === 'gate') this.spawnObject('gate', clearing.x, clearing.y, 0, 0, false);
    }
    this.petView.setVisible(this.pet);
    this.callbacks.onEvent(`REGION ${this.region + 1}: ${REGIONS[this.region].name.toUpperCase()}`);
  }

  private drawRegion(): void {
    for (const decoration of this.decorations) decoration.destroy();
    this.decorations = [];
    const theme = REGIONS[this.region];
    this.cameras.main.setBackgroundColor(theme.floor);
    const rng = new Rng((this.seed ^ Math.imul(this.region + 1, 7919)) >>> 0);
    const layout = generateRegionLayout(this.seed, this.region);
    const ground = this.add.graphics().setDepth(-10);
    ground.fillStyle(theme.floor).fillRect(0, 0, WORLD, WORLD);
    ground.lineStyle(170, theme.clearing, 0.35);
    for (const clearing of layout.clearings.slice(1)) ground.lineBetween(900, 900, clearing.x, clearing.y);
    for (const clearing of layout.clearings) {
      ground.fillStyle(theme.clearing, 0.72).fillCircle(clearing.x, clearing.y, clearing.radius);
      ground.lineStyle(4, theme.accent, 0.18).strokeCircle(clearing.x, clearing.y, clearing.radius - 10);
    }
    ground.lineStyle(18, theme.accent, 0.3).strokeRect(10, 10, WORLD - 20, WORLD - 20);
    this.decorations.push(ground);
    const flecks = this.add.graphics().setDepth(-9);
    for (let i = 0; i < 650; i++) {
      flecks.fillStyle(i % 9 === 0 ? theme.accent : theme.clearing, rng.range(0.12, 0.38));
      flecks.fillCircle(rng.between(30, WORLD - 30), rng.between(30, WORLD - 30), rng.range(1, 3));
    }
    this.decorations.push(flecks);
    for (let i = 0; i < 75; i++) {
      const x = rng.between(65, WORLD - 65); const y = rng.between(65, WORLD - 65);
      if (layout.clearings.some(clearing => this.distance(x, y, clearing.x, clearing.y) < clearing.radius + 55)) continue;
      if (layout.clearings.slice(1).some(clearing => this.distanceToSegment(x, y, 900, 900, clearing.x, clearing.y) < 115)) continue;
      if (this.region === 1) {
        const rock = this.add.polygon(x, y, [0, 20, 20, -15, 49, 6, 45, 34, 15, 38], 0x443f3a, 0.85).setStrokeStyle(3, 0xb07d5a, 0.6).setDepth(-3);
        this.decorations.push(rock);
      } else {
        const tree = this.add.image(x, y, 'tree').setDisplaySize(rng.between(75, 115), rng.between(88, 140)).setDepth(-3);
        if (this.region === 2) tree.setTint(0x8dbac0);
        tree.setAlpha(rng.range(0.73, 0.95)); this.decorations.push(tree);
      }
    }
  }

  private distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return this.distance(px, py, ax + t * (bx - ax), ay + t * (by - ay));
  }

  private clearRunObjects(): void {
    for (const enemy of this.enemies) enemy.sprite.destroy();
    for (const object of this.objects) object.view.destroy();
    for (const orb of this.orbs) orb.view.destroy();
    for (const cache of this.caches) { this.tweens.killTweensOf(cache.view); cache.view.destroy(); }
    this.enemies = []; this.objects = []; this.orbs = []; this.caches = [];
    this.bars?.clear(); this.nav?.setText(''); this.releaseJoystick();
  }

  private moveHero(dt: number): void {
    let dx = this.joyVector.x; let dy = this.joyVector.y;
    if (this.keys?.A?.isDown || this.cursors?.left?.isDown) dx -= 1;
    if (this.keys?.D?.isDown || this.cursors?.right?.isDown) dx += 1;
    if (this.keys?.W?.isDown || this.cursors?.up?.isDown) dy -= 1;
    if (this.keys?.S?.isDown || this.cursors?.down?.isDown) dy += 1;
    const length = Math.hypot(dx, dy);
    const attackKick = this.attackPose > 0 ? Math.sin(this.attackPose / 0.16 * Math.PI) : 0;
    if (length > 0.03) {
      this.hero.x = Phaser.Math.Clamp(this.hero.x + dx / Math.max(1, length) * this.stats.speed * dt, 42, WORLD - 42);
      this.hero.y = Phaser.Math.Clamp(this.hero.y + dy / Math.max(1, length) * this.stats.speed * dt, 42, WORLD - 42);
      if (dx !== 0) this.hero.setFlipX(dx < 0);
      this.hero.setRotation(Math.sin(this.seconds * 12) * 0.045 + attackKick * (this.hero.flipX ? -0.12 : 0.12))
        .setScale(0.35 * (1 + Math.sin(this.seconds * 12) * 0.025 + attackKick * 0.09), 78 / 220 * (1 - Math.sin(this.seconds * 12) * 0.025 - attackKick * 0.06));
    } else this.hero.setRotation(attackKick * (this.hero.flipX ? -0.12 : 0.12))
      .setScale(0.35 * (1 + Math.sin(this.seconds * 3) * 0.012 + attackKick * 0.09), 78 / 220 * (1 - attackKick * 0.06));
    this.heldWeapon.setPosition(this.hero.x + (this.hero.flipX ? -24 : 24), this.hero.y + 11).setFlipX(this.hero.flipX);
    this.hero.setAlpha(this.invulnerability > 0 && Math.floor(this.seconds * 18) % 2 === 0 ? 0.57 : 1);
    this.nav.setPosition(this.hero.x, this.hero.y - 86);
  }

  private updateSpawns(dt: number): void {
    this.spawnClock += dt;
    const wavePause = this.stageSeconds % 45 > 38;
    const interval = Math.max(0.55, 1.75 - this.region * 0.19 - this.stageSeconds / 850);
    if (!this.gatekeeperSpawned && !wavePause && this.spawnClock >= interval && this.enemies.length < 70) {
      this.spawnClock = 0;
      this.spawnEnemy(this.chooseEnemyKind());
      if (this.region > 0 && this.random.next() < 0.25) this.spawnEnemy(this.chooseEnemyKind());
    }
    this.cacheClock += dt;
    if (this.cacheClock >= 34 && this.caches.length < 4) {
      this.cacheClock = 0;
      this.spawnCache(STAT_KEYS[this.random.between(0, STAT_KEYS.length - 1)]);
    }
    if (shouldSpawnGuardian(this.wardsLeft(), this.stageSeconds, REGIONS[this.region].duration, this.gatekeeperSpawned)) {
      this.gatekeeperSpawned = true;
      const gate = this.objects.find(object => object.kind === 'gate')!;
      if (this.region === 2) { this.bossSpawned = true; this.spawnEnemy('boss', { x: gate.x, y: gate.y - 110 }); this.callbacks.onEvent('THE BRIAR KING AWAKENS'); }
      else { this.spawnEnemy('gatekeeper', { x: gate.x, y: gate.y - 105 }); this.callbacks.onEvent('GATE SENTINEL AWAKENS'); }
    }
  }

  private chooseEnemyKind(): EnemyKind {
    const roll = this.random.next();
    if (this.stageSeconds > 55 && roll < 0.16 + this.region * 0.05) return 'brute';
    if (this.stageSeconds > 25 && roll < 0.43 + this.region * 0.05) return 'wisp';
    return 'gnarl';
  }

  private spawnPoint(distance = 430): { x: number; y: number } {
    const angle = this.random.range(0, Math.PI * 2);
    return { x: Phaser.Math.Clamp(this.hero.x + Math.cos(angle) * distance, 45, WORLD - 45), y: Phaser.Math.Clamp(this.hero.y + Math.sin(angle) * distance, 45, WORLD - 45) };
  }

  private spawnEnemy(kind: EnemyKind, position?: { x: number; y: number }, saved?: EnemySave): void {
    const values = {
      gnarl: { hp: 27, speed: 77, damage: 8, radius: 23, size: 48, texture: 'gnarl' },
      wisp: { hp: 17, speed: 126, damage: 6, radius: 17, size: 43, texture: 'wisp' },
      brute: { hp: 82, speed: 53, damage: 15, radius: 31, size: 67, texture: 'brute' },
      gatekeeper: { hp: 420, speed: 67, damage: 18, radius: 38, size: 91, texture: 'brute' },
      boss: { hp: 1150, speed: 63, damage: 22, radius: 54, size: 125, texture: 'briar-king' },
    }[kind];
    const point = position ?? this.spawnPoint();
    const hp = saved?.maxHp ?? Math.round(values.hp * (kind === 'boss' || kind === 'gatekeeper' ? 1 : 1 + this.region * 0.25 + this.stageSeconds / 700));
    const sprite = this.add.image(point.x, point.y, values.texture).setDisplaySize(values.size, values.size).setDepth(4);
    if (kind === 'gatekeeper') sprite.setTint(0xf1bd8d);
    if (this.region === 2 && kind === 'wisp') sprite.setTint(0xb2e4e6);
    const phase = saved?.phase ?? (kind === 'boss' ? 0 : this.random.range(0, 6));
    this.enemies.push({ sprite, kind, hp: saved?.hp ?? hp, maxHp: hp,
      speed: values.speed + (kind === 'boss' ? phase * 10 : 0),
      damage: values.damage + (kind === 'boss' ? phase * 3 : 0),
      radius: values.radius, phase, pendingDamage: 0, damageClock: 0 });
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      const dx = this.hero.x - enemy.sprite.x; const dy = this.hero.y - enemy.sprite.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      if (distance > enemy.radius + 16) {
        const weave = enemy.kind === 'wisp' ? Math.sin(this.seconds * 7 + enemy.phase) * 0.32 : 0;
        enemy.sprite.x += (dx / distance - dy / distance * weave) * enemy.speed * dt;
        enemy.sprite.y += (dy / distance + dx / distance * weave) * enemy.speed * dt;
      } else if (this.invulnerability <= 0) this.takeDamage(enemy.damage);
      if (!this.running) break;
      enemy.sprite.setFlipX(dx < 0);
      enemy.sprite.setRotation(Math.sin(this.seconds * (enemy.kind === 'wisp' ? 8 : 3) + enemy.phase) * 0.055);
      if (enemy.pendingDamage > 0) {
        enemy.damageClock -= dt;
        if (enemy.damageClock <= 0) this.flushDamage(enemy);
      }
    }
  }

  private takeDamage(raw: number): void {
    const actual = damageAfterDefense(raw, this.stats.defense);
    this.metrics.damageTaken += Math.min(actual, this.health);
    this.health = Math.max(0, this.health - actual);
    soundFx.play('hurt');
    this.invulnerability = 0.55;
    this.floatText(`−${actual}`, this.hero.x, this.hero.y - 43, '#ffc3b4');
    if (!this.reducedEffects) this.cameras.main.shake(90, 0.003);
    this.hero.setTint(0xffb3a6);
    this.time.delayedCall(110, () => { if (this.hero.active) this.hero.setTint(this.skin ? 0xf3d28a : 0xffffff); });
    this.publishHud();
    if (this.health <= 0) this.finish(false);
  }

  private autoAttack(weapon: EquippedWeapon): void {
    const info = WEAPON_INFO[weapon.id];
    const range = info.range * this.stats.reach;
    const targetObjects = this.objects.filter(candidate => candidate.active && candidate.hp > 0);
    const selection = chooseAutoTarget({ x: this.hero.x, y: this.hero.y }, range,
      this.enemies.map(enemy => ({ x: enemy.sprite.x, y: enemy.sprite.y })), targetObjects);
    const target: Enemy | null = selection?.kind === 'enemy' ? this.enemies[selection.index] : null;
    const object: WorldObject | null = selection?.kind === 'object' ? targetObjects[selection.index] : null;
    if (!target && !object) { weapon.cooldown = 0.12; return; }
    weapon.cooldown = info.cooldown;
    soundFx.play('swing');
    this.attackPose = 0.16;
    const x = target?.sprite.x ?? object!.x; const y = target?.sprite.y ?? object!.y;
    const angle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, x, y);
    const damage = weaponDamage(this.stats.attack, weapon.id, weapon.rank);
    if (weapon.id === 'axe') {
      this.heldWeapon.setRotation(angle - 0.8);
      this.tweens.add({ targets: this.heldWeapon, rotation: angle + 1.1, duration: 140, ease: 'Cubic.Out' });
      const slash = this.add.ellipse(this.hero.x + Math.cos(angle) * 55, this.hero.y + Math.sin(angle) * 55, 92 + this.splashBonus, 25, 0xffe2ab, 0.7).setRotation(angle).setDepth(8);
      this.tweens.add({ targets: slash, alpha: 0, scaleX: 1.3, duration: 190, onComplete: () => slash.destroy() });
    } else {
      const dart = this.add.circle(this.hero.x, this.hero.y, weapon.id === 'staff' ? 12 : 7,
        this.skin ? 0xffd37a : Phaser.Display.Color.HexStringToColor(info.color).color).setDepth(8);
      this.tweens.add({ targets: dart, x, y, alpha: 0, duration: 180, onComplete: () => dart.destroy() });
    }
    if (target) {
      const splash = weaponSplash(weapon.id, this.splashBonus);
      const victims = splash > 0 ? this.enemies.filter(enemy => this.distance(enemy.sprite.x, enemy.sprite.y, x, y) < splash) : [target];
      for (const enemy of victims) this.hitEnemy(enemy, damage);
      if (splash > 0) {
        for (const nearby of this.objects.filter(item => item.active && item.hp > 0 && this.distance(item.x, item.y, x, y) < splash)) {
          this.hitObject(nearby, damage);
        }
      }
    } else if (object) this.hitObject(object, damage);
    if (!this.reducedEffects) this.burst(x, y, info.color, 3);
  }

  private hitEnemy(enemy: Enemy, damage: number): void {
    if (!this.enemies.includes(enemy)) return;
    this.metrics.foeDamage += Math.min(damage, Math.max(0, enemy.hp));
    enemy.hp -= damage; enemy.pendingDamage += damage; enemy.damageClock = 0.16;
    soundFx.play('hit');
    enemy.sprite.setTint(0xffd6a0);
    this.time.delayedCall(90, () => { if (enemy.sprite.active) enemy.sprite.clearTint(); });
    if (enemy.hp > 0) {
      if (enemy.kind === 'boss') this.updateBossPhase(enemy);
      return;
    }
    this.flushDamage(enemy);
    const x = enemy.sprite.x; const y = enemy.sprite.y;
    enemy.sprite.destroy(); this.enemies.splice(this.enemies.indexOf(enemy), 1);
    this.kills++;
    this.burst(x, y, enemy.kind === 'wisp' ? '#f8be71' : '#b4d889', enemy.kind === 'boss' ? 17 : 7);
    if (enemy.kind === 'boss') { this.finish(true); return; }
    if (enemy.kind === 'gatekeeper') { this.openGate(); return; }
    this.spawnOrb(x, y, enemy.kind === 'brute' ? 3 : 1);
  }

  private flushDamage(enemy: Enemy): void {
    if (enemy.pendingDamage <= 0) return;
    this.floatText(String(enemy.pendingDamage), enemy.sprite.x, enemy.sprite.y - (enemy.kind === 'boss' ? 78 : 39), '#fff1b1');
    enemy.pendingDamage = 0;
  }

  private updateBossPhase(boss: Enemy): void {
    const reached = bossPhaseFor(boss.hp, boss.maxHp);
    if (reached <= boss.phase) return;
    boss.phase = reached;
    boss.speed = 63 + reached * 10;
    boss.damage = 22 + reached * 3;
    this.callbacks.onEvent(reached === 3 ? 'THE KING RAGES — FINAL PHASE' : `THE KING CHANGES — PHASE ${reached + 1}`);
    for (let i = 0; i < reached + 1; i++) this.spawnEnemy(i % 2 ? 'gnarl' : 'wisp', {
      x: Phaser.Math.Clamp(boss.sprite.x + this.random.between(-160, 160), 45, WORLD - 45),
      y: Phaser.Math.Clamp(boss.sprite.y + this.random.between(-160, 160), 45, WORLD - 45),
    });
    this.burst(boss.sprite.x, boss.sprite.y, '#ffb780', 22);
    this.saveSnapshot();
  }

  private spawnObject(kind: ObjectKind, x: number, y: number, hp: number, maxHp: number, active: boolean): void {
    const tint = kind === 'ward' ? REGIONS[this.region].accent : kind === 'shrine' ? 0xd5a0eb : kind === 'relic' ? 0xffd486 : 0x9fd3df;
    const base = this.add.ellipse(0, 21, kind === 'gate' ? 125 : 70, 27, 0x132f2c, 0.55);
    const outer = kind === 'gate'
      ? this.add.star(0, -6, 6, 45, 57, tint, 0.88).setStrokeStyle(5, 0x243c3b, 0.9)
      : this.add.star(0, -7, kind === 'ward' ? 5 : 6, 24, 42, tint, 0.9).setStrokeStyle(4, 0x263e3a, 0.95);
    const core = this.add.circle(0, -7, kind === 'gate' ? 18 : 12, 0xffeed1, 0.9);
    const label = this.add.text(0, kind === 'gate' ? 54 : 43, kind === 'ward' ? 'WARDSTONE' : kind === 'shrine' ? 'SHRINE' : kind === 'relic' ? 'RELIC' : 'GATE', {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#fff0cb', stroke: '#1b3c32', strokeThickness: 4,
    }).setOrigin(0.5);
    const view = this.add.container(x, y, [base, outer, core, label]).setDepth(2).setAlpha(active ? 1 : 0.35);
    this.objects.push({ view, kind, x, y, hp, maxHp, active });
  }

  private hitObject(object: WorldObject, damage: number): void {
    if (!object.active || object.hp <= 0) return;
    this.metrics.objectDamage += Math.min(damage, object.hp);
    object.hp = Math.max(0, object.hp - damage);
    soundFx.play(object.hp > 0 ? 'hit' : 'ward');
    this.floatText(String(damage), object.x, object.y - 54, '#ffe8a0');
    object.view.setScale(1.08);
    this.tweens.add({ targets: object.view, scale: 1, duration: 100 });
    if (object.hp > 0) return;
    object.active = false; object.view.setAlpha(0.15);
    this.burst(object.x, object.y, object.kind === 'ward' ? '#c7e2a7' : '#f6d597', 16);
    if (object.kind === 'ward') {
      this.metrics.wards++;
      this.callbacks.onEvent(this.wardsLeft() > 0 ? `${this.wardsLeft()} WARDSTONE REMAINS` : 'WARDSTONES SHATTERED — HOLD THE GATE');
    } else if (object.kind === 'shrine') {
      const relic = this.objects.find(item => item.kind === 'relic')!;
      relic.active = true; relic.view.setAlpha(1);
      this.callbacks.onEvent('THE RELIC WAKES');
    } else if (object.kind === 'relic') {
      if (!this.pet) { this.pet = true; this.petView.setVisible(true); this.callbacks.onEvent('GLOWFOX JOINS YOU'); }
      else { this.weaponSlots = Math.min(3, this.weaponSlots + 1); this.callbacks.onEvent('AN EXTRA WEAPON SLOT OPENS'); }
    }
    this.publishHud(); this.saveSnapshot();
  }

  private wardsLeft(): number { return this.objects.filter(object => object.kind === 'ward' && object.active).length; }
  private openGate(): void {
    const gate = this.objects.find(object => object.kind === 'gate');
    if (gate) { gate.active = true; gate.view.setAlpha(1); this.callbacks.onEvent('GATE OPEN — FOLLOW THE ARROW'); this.saveSnapshot(); }
  }
  private updateObjects(): void {
    const gate = this.objects.find(object => object.kind === 'gate');
    if (gate?.active && this.distance(this.hero.x, this.hero.y, gate.x, gate.y) < 82) {
      if (this.region < 2) {
        this.metrics.regionSeconds[this.region] = this.stageSeconds;
        this.region++;
        this.health = Math.min(this.stats.maxHealth, this.health + 25);
        this.startRegion(); this.spawnCache(STAT_KEYS[this.random.between(0, STAT_KEYS.length - 1)], 1010, 830);
        this.publishHud(); this.saveSnapshot();
      }
    }
  }

  private updateNavigation(): void {
    const gate = this.objects.find(object => object.kind === 'gate')!;
    const target = this.objects.find(object => object.kind === 'ward' && object.active)
      ?? (!this.gatekeeperSpawned && !gate.active
        ? this.objects.find(object => (object.kind === 'shrine' || object.kind === 'relic') && object.active)
        : null)
      ?? gate;
    const dx = target.x - this.hero.x; const dy = target.y - this.hero.y;
    const angle = Math.atan2(dy, dx);
    const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
    const arrow = arrows[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
    const label = target.kind === 'ward' ? 'WARD' : target.kind === 'shrine' ? 'SHRINE' : target.kind === 'relic' ? 'RELIC' : target.active ? 'GATE' : 'HOLD';
    this.nav.setText(`${arrow} ${label} ${Math.round(Math.hypot(dx, dy) / 10) * 10}m`);
  }

  private spawnOrb(x: number, y: number, value: number): void {
    if (this.orbs.length > 95) { const old = this.orbs.shift(); old?.view.destroy(); }
    const glow = this.add.circle(0, 0, value > 1 ? 10 : 7, 0xb9eece, 0.18);
    const gem = this.add.circle(0, 0, value > 1 ? 5 : 4, value > 1 ? 0xffd980 : 0xb9f5d1).setStrokeStyle(1, 0xffffff, 0.9);
    const view = this.add.container(x, y, [glow, gem]).setDepth(3);
    this.orbs.push({ view, x, y, value });
  }
  private updateOrbs(dt: number): void {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i]; const dx = this.hero.x - orb.x; const dy = this.hero.y - orb.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 145 && distance > 1) {
        const speed = Math.max(175, 650 - distance * 2);
        orb.x += dx / distance * speed * dt; orb.y += dy / distance * speed * dt;
        orb.view.setPosition(orb.x, orb.y);
      }
      if (distance < 25) { orb.view.destroy(); this.orbs.splice(i, 1); this.gainXp(orb.value); if (this.choosing) break; }
    }
  }
  private gainXp(value: number): void {
    this.xp += value;
    if (this.xp < xpToNextLevel(this.level)) return;
    this.xp -= xpToNextLevel(this.level); this.level++;
    this.choosing = true; this.releaseJoystick();
    this.upgradeOptions = pickUpgradeChoices({ stats: this.stats, weapons: this.weapons,
      unlockedWeapons: this.unlockedWeapons, slots: this.weaponSlots, splashBonus: this.splashBonus,
      pet: this.pet, masteryRank: this.masteryRank, level: this.level }, this.random);
    this.callbacks.onUpgrade(this.upgradeOptions);
    this.publishHud(); this.saveSnapshot();
  }

  private spawnCache(stat: Stat, x?: number, y?: number): void {
    const point = x === undefined || y === undefined ? this.spawnPoint(this.random.between(145, 260)) : { x, y };
    const color = Phaser.Display.Color.HexStringToColor(STAT_INFO[stat].color).color;
    const aura = this.add.circle(0, 0, 31, color, 0.13).setStrokeStyle(2, color, 0.32);
    const disk = this.add.circle(0, 0, 21, 0x1a423a, 0.92).setStrokeStyle(3, color, 0.95);
    const gem = this.add.star(0, 0, 4, 9, 18, color).setAngle(45).setStrokeStyle(1, 0xffffff, 0.55);
    const icon = this.add.text(0, 0, STAT_INFO[stat].icon, { fontFamily: 'Georgia, serif', fontSize: '16px', color: '#19332f', fontStyle: 'bold' }).setOrigin(0.5);
    const label = this.add.text(0, 36, STAT_INFO[stat].name.toUpperCase(), { fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#f5e9bd', fontStyle: 'bold', stroke: '#17392c', strokeThickness: 3 }).setOrigin(0.5);
    const view = this.add.container(point.x, point.y, [aura, disk, gem, icon, label]).setDepth(2);
    this.tweens.add({ targets: view, scale: 1.08, duration: 850, yoyo: true, repeat: -1 });
    this.caches.push({ view, x: point.x, y: point.y, stat });
  }
  private updateCaches(): void {
    for (let i = this.caches.length - 1; i >= 0; i--) {
      const cache = this.caches[i];
      if (this.distance(this.hero.x, this.hero.y, cache.x, cache.y) < 33) {
        const oldMax = this.stats.maxHealth;
        this.stats = upgradeStat(this.stats, cache.stat);
        soundFx.play('pickup');
        if (cache.stat === 'maxHealth') this.health = Math.min(this.stats.maxHealth, this.health + this.stats.maxHealth - oldMax);
        this.floatText(`+ ${STAT_INFO[cache.stat].name.toUpperCase()}`, cache.x, cache.y - 47, STAT_INFO[cache.stat].color);
        this.burst(cache.x, cache.y, STAT_INFO[cache.stat].color, 11);
        this.tweens.killTweensOf(cache.view); cache.view.destroy(); this.caches.splice(i, 1);
        this.metrics.caches++;
        this.publishHud(); this.saveSnapshot();
      }
    }
  }

  private updatePet(dt: number): void {
    if (!this.pet) return;
    this.petView.setPosition(this.hero.x + Math.cos(this.seconds * 3) * 52, this.hero.y + Math.sin(this.seconds * 3) * 38);
    this.petClock = Math.max(0, this.petClock - dt);
    if (this.petClock > 0) return;
    const target = this.enemies.find(enemy => this.distance(this.petView.x, this.petView.y, enemy.sprite.x, enemy.sprite.y) < 240);
    if (target) { this.petClock = 1.8; this.hitEnemy(target, Math.round(this.stats.attack * 0.8)); this.burst(target.sprite.x, target.sprite.y, '#ffe6a3', 3); }
  }

  private drawBars(): void {
    this.bars.clear();
    for (const enemy of this.enemies) {
      if (enemy.hp >= enemy.maxHp && enemy.kind !== 'boss' && enemy.kind !== 'gatekeeper') continue;
      const width = enemy.kind === 'boss' ? 86 : 36;
      const x = enemy.sprite.x - width / 2; const y = enemy.sprite.y - (enemy.kind === 'boss' ? 67 : 31);
      this.bars.fillStyle(0x18312d, 0.9).fillRoundedRect(x - 2, y - 2, width + 4, 8, 3);
      this.bars.fillStyle(enemy.kind === 'boss' ? 0xeea673 : 0xeeb08e).fillRoundedRect(x, y, width * Math.max(0, enemy.hp / enemy.maxHp), 4, 2);
    }
    for (const object of this.objects) {
      if (!object.active || object.hp <= 0) continue;
      const x = object.x - 38; const y = object.y - 68;
      this.bars.fillStyle(0x18312d, 0.9).fillRoundedRect(x - 2, y - 2, 80, 9, 3);
      this.bars.fillStyle(0xf6d899).fillRoundedRect(x, y, 76 * object.hp / object.maxHp, 5, 2);
    }
  }

  private floatText(value: string, x: number, y: number, color: string): void {
    const label = this.add.text(x, y, value, { fontFamily: 'Arial, sans-serif', fontSize: '15px', fontStyle: 'bold', color, stroke: '#18372d', strokeThickness: 4 }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: label, y: y - 35, alpha: 0, duration: 780, ease: 'Cubic.Out', onComplete: () => label.destroy() });
  }
  private burst(x: number, y: number, color: string, count: number): void {
    const tint = Phaser.Display.Color.HexStringToColor(color).color;
    for (let i = 0; i < (this.reducedEffects ? Math.min(3, count) : count); i++) {
      const angle = this.random.range(0, Math.PI * 2); const distance = this.random.between(16, 49);
      const fleck = this.add.circle(x, y, this.random.between(2, 4), tint, 0.9).setDepth(12);
      this.tweens.add({ targets: fleck, x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance, alpha: 0, scale: 0.2, duration: this.random.between(280, 540), onComplete: () => fleck.destroy() });
    }
  }
  private distance(ax: number, ay: number, bx: number, by: number): number { return Math.hypot(ax - bx, ay - by); }

  private finish(won: boolean): void {
    if (!this.running) return;
    this.metrics.regionSeconds[this.region] = this.stageSeconds;
    this.running = false; this.releaseJoystick(); clearRunSnapshot();
    if (won) soundFx.play('victory');
    if (won) this.tweens.add({ targets: this.hero, scaleX: 0.44, scaleY: 0.44, yoyo: true, duration: 250 });
    else this.tweens.add({ targets: this.hero, angle: 80, alpha: 0.28, duration: 370, ease: 'Cubic.Out' });
    this.callbacks.onEnd({ won, kills: this.kills, seconds: this.seconds, level: this.level, hero: this.heroId,
      region: won ? 3 : this.region, weapons: this.weapons.map(weapon => weapon.id),
      metrics: { ...this.metrics, regionSeconds: [...this.metrics.regionSeconds] as RunMetrics['regionSeconds'] } });
    this.publishHud();
  }
  private publishHud(): void {
    const boss = this.enemies.find(enemy => enemy.kind === 'boss' || enemy.kind === 'gatekeeper');
    this.callbacks.onHud({
      health: this.health, maxHealth: this.stats.maxHealth, level: this.level, xp: this.xp,
      xpNeeded: xpToNextLevel(this.level), kills: this.kills, seconds: this.seconds,
      stageSeconds: this.stageSeconds, region: this.region, stats: { ...this.stats },
      bossHp: boss?.hp ?? null, bossMaxHp: boss?.maxHp ?? null,
      weapons: this.weapons.map(weapon => ({ ...weapon })), special: HERO_INFO[this.heroId].special,
      specialCooldown: this.specialCooldown, wardsLeft: this.wardsLeft(),
      gateOpen: this.objects.some(object => object.kind === 'gate' && object.active), hero: this.heroId,
      map: {
        x: this.hero.x, y: this.hero.y,
        objects: this.objects.map(object => ({ x: object.x, y: object.y, kind: object.kind, active: object.active })),
        enemies: this.enemies.map(enemy => ({ x: enemy.sprite.x, y: enemy.sprite.y, kind: enemy.kind })),
      },
    });
  }

  saveSnapshot(): void {
    if (!this.running) return;
    saveRunSnapshot({
      version: 1, seed: this.seed, rngState: this.random.state, hero: this.heroId, skin: this.skin,
      unlockedWeapons: [...this.unlockedWeapons], masteryRank: this.masteryRank,
      weapons: this.weapons.map(weapon => ({ ...weapon })), weaponSlots: this.weaponSlots,
      splashBonus: this.splashBonus, pet: this.pet, petClock: this.petClock,
      autoSpecial: this.autoSpecial, specialCooldown: this.specialCooldown, reducedEffects: this.reducedEffects,
      stats: { ...this.stats }, health: this.health, xp: this.xp, level: this.level, kills: this.kills,
      seconds: this.seconds, region: this.region, stageSeconds: this.stageSeconds,
      spawnClock: this.spawnClock, cacheClock: this.cacheClock,
      x: this.hero.x, y: this.hero.y, invulnerability: this.invulnerability,
      gatekeeperSpawned: this.gatekeeperSpawned, bossSpawned: this.bossSpawned,
      choosing: this.choosing, upgradeOptions: [...this.upgradeOptions],
      enemies: this.enemies.map(enemy => ({ kind: enemy.kind, x: enemy.sprite.x, y: enemy.sprite.y, hp: enemy.hp, maxHp: enemy.maxHp, phase: enemy.phase })),
      objects: this.objects.map(object => ({ kind: object.kind, x: object.x, y: object.y, hp: object.hp, maxHp: object.maxHp, active: object.active })),
      orbs: this.orbs.map(orb => ({ x: orb.x, y: orb.y, value: orb.value })),
      caches: this.caches.map(cache => ({ x: cache.x, y: cache.y, stat: cache.stat })),
      metrics: { ...this.metrics, regionSeconds: [...this.metrics.regionSeconds] as RunMetrics['regionSeconds'] },
    });
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.running || this.choosing || this.pausedByUser || this.joyPointer !== null) return;
    this.joyPointer = pointer.id; this.joyOrigin.set(pointer.x, pointer.y);
    this.joystickBase.setPosition(pointer.x, pointer.y).setVisible(true);
    this.joystickNub.setPosition(pointer.x, pointer.y).setVisible(true);
  }
  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.joyPointer) return;
    const dx = pointer.x - this.joyOrigin.x; const dy = pointer.y - this.joyOrigin.y;
    const length = Math.hypot(dx, dy); const fraction = Math.min(1, length / 53);
    this.joyVector.set(length > 0 ? dx / length * fraction : 0, length > 0 ? dy / length * fraction : 0);
    this.joystickNub.setPosition(this.joyOrigin.x + this.joyVector.x * 47, this.joyOrigin.y + this.joyVector.y * 47);
  }
  private handlePointerUp(pointer: Phaser.Input.Pointer): void { if (pointer.id === this.joyPointer) this.releaseJoystick(); }
  private releaseJoystick(): void {
    this.joyPointer = null; this.joyVector.set(0, 0);
    this.joystickBase?.setVisible(false); this.joystickNub?.setVisible(false);
  }
}
