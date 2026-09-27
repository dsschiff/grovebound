import Phaser from 'phaser';
import {
  HERO_INFO, REGIONS, STAT_INFO, STAT_KEYS, WEAPON_INFO, WEAPON_RANKS, WEAPON_RANK_UPGRADES, Rng, baseStatsFor, damageAfterDefense,
  generateRegionLayout, upgradeStat, xpToNextLevel,
  type Hero, type Stat, type Stats, type Upgrade, type Weapon,
} from './logic';
import { clearRunSnapshot, emptyRunMetrics, emptyWeaponDamage, saveRunSnapshot, type EnemySave, type ObjectSave, type RunMetrics, type RunSnapshot } from './runSave';
import { soundFx } from './audio';
import { bossPhaseFor, bowCriticalChance, chooseAutoTarget, pickUpgradeChoices, pierceTargets, ricochetTarget,
  shouldSpawnGuardian, staffBurn, thornPierceCount, weaponDamage, weaponSplash } from './combat';
import { pilotDirection } from './pilot';
import { hazardSites, ventPhase, type VentPhase } from './hazards';
import { enemyFieldModifiers, terrainSites } from './terrain';
import { BOSS_STRIKE_WINDUP, bossStrikeCooldown, bossStrikeRadius, bossStrikeTarget, insideBossStrike, type BossStrikeState } from './bossStrike';
import { nextObjective, objectiveName, objectivesLeft } from './objectives';

const WORLD = 1800;
type EnemyKind = EnemySave['kind'];
type ObjectKind = ObjectSave['kind'];
interface Enemy {
  sprite: Phaser.GameObjects.Image; kind: EnemyKind; hp: number; maxHp: number;
  speed: number; damage: number; radius: number; phase: number; pendingDamage: number; damageClock: number;
  burnRemaining: number; burnTickClock: number; burnDamage: number; burnSource?: Weapon;
  strike?: BossStrikeState & { ring?: Phaser.GameObjects.Arc };
}
interface WorldObject { view: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text; kind: ObjectKind; x: number; y: number; hp: number; maxHp: number; active: boolean; ring?: Phaser.GameObjects.Arc; hazardPhase?: VentPhase }
interface Orb { view: Phaser.GameObjects.Container; x: number; y: number; value: number }
interface Cache { view: Phaser.GameObjects.Container; x: number; y: number; stat: Stat }
interface EquippedWeapon { id: Weapon; rank: number; cooldown: number }

export interface HudState {
  health: number; maxHealth: number; level: number; xp: number; xpNeeded: number;
  kills: number; seconds: number; stageSeconds: number; region: number;
  stats: Stats; bossHp: number | null; bossMaxHp: number | null;
  weapons: EquippedWeapon[]; weaponSlots: number; focusedWeapon: Weapon; weaponDamage: Record<Weapon, number>;
  special: string; specialCooldown: number;
  objectivesLeft: number; stepTargetsLeft: number; stepProgress: number; objectiveName: string | null;
  terrainHint: string | null; gateOpen: boolean; hero: Hero;
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
  private focusedWeapon: Weapon = 'axe';
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
  private moveDirection = new Phaser.Math.Vector2();
  private pilotEnabled = false;
  private slowed = false;

  constructor(callbacks: GameCallbacks) { super('Grove'); this.callbacks = callbacks; }

  preload(): void {
    const base = import.meta.env.BASE_URL;
    this.load.image('tree', `${base}art/tree.png`);
    for (const key of ['warden-v2', 'ranger-v2', 'ember-v2', 'root-totem', 'coolant-pump', 'forge-core',
      'moon-altar', 'mist-bloom', 'ember-vent', 'grove-gate', 'reliquary', 'fox-relic',
      'gnarl-v2', 'wisp-v2', 'brute-v2', 'briar-king-v2', 'bramble-field', 'ember-ore', 'moonstone']) {
      this.load.image(key, `${base}art/${key}.webp`);
    }
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, WORLD, WORLD);
    this.hero = this.add.image(900, 900, 'warden-v2').setDisplaySize(92, 92).setDepth(5);
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
    this.focusedWeapon = startingWeapon;
    this.weaponSlots = masteryRank >= 4 ? 3 : 2;
    this.splashBonus = 0; this.pet = false; this.petClock = 0;
    this.autoSpecial = masteryRank >= 5 && autoSpecialEnabled; this.specialCooldown = 0; this.reducedEffects = reducedEffects;
    this.stats = baseStatsFor(hero, masteryRank);
    this.metrics = emptyRunMetrics();
    this.health = this.stats.maxHealth;
    this.xp = 0; this.level = 1; this.kills = 0; this.seconds = 0; this.region = 0;
    this.attackPose = 0; this.slowed = false;
    this.choosing = false; this.pausedByUser = false; this.upgradeOptions = [];
    this.hero.setTexture(`${hero}-v2`).setTint(skin ? 0xf3d28a : 0xffffff).setPosition(900, 900).setAlpha(1).setDisplaySize(92, 92);
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
    this.focusedWeapon = snapshot.focusedWeapon ?? this.weapons[0].id;
    this.weaponSlots = snapshot.weaponSlots; this.splashBonus = snapshot.splashBonus;
    this.pet = snapshot.pet; this.petClock = snapshot.petClock; this.autoSpecial = snapshot.autoSpecial;
    this.specialCooldown = snapshot.specialCooldown; this.reducedEffects = snapshot.reducedEffects;
    this.stats = { ...snapshot.stats }; this.health = snapshot.health; this.xp = snapshot.xp;
    this.metrics = { ...snapshot.metrics, regionSeconds: [...snapshot.metrics.regionSeconds] as RunMetrics['regionSeconds'] };
    this.level = snapshot.level; this.kills = snapshot.kills; this.seconds = snapshot.seconds;
    this.region = snapshot.region; this.stageSeconds = snapshot.stageSeconds;
    this.spawnClock = snapshot.spawnClock; this.cacheClock = snapshot.cacheClock;
    this.invulnerability = snapshot.invulnerability;
    this.attackPose = 0; this.slowed = false;
    this.gatekeeperSpawned = snapshot.gatekeeperSpawned; this.bossSpawned = snapshot.bossSpawned;
    this.choosing = snapshot.choosing; this.upgradeOptions = [...snapshot.upgradeOptions];
    this.hero.setTexture(`${this.heroId}-v2`).setTint(this.skin ? 0xf3d28a : 0xffffff)
      .setPosition(snapshot.x, snapshot.y).setAlpha(1).setDisplaySize(92, 92);
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
    const info = this.upgradeInfo(choice);
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
    this.metrics.blessings++;
    this.floatText(`+ ${info.name.toUpperCase()}`, this.hero.x, this.hero.y - 62, info.color);
    this.burst(this.hero.x, this.hero.y, info.color, 12);
    this.choosing = false; this.upgradeOptions = [];
    this.publishHud(); this.saveSnapshot();
  }

  focusWeapon(weapon: Weapon): void {
    if (!this.running || !this.weapons.some(item => item.id === weapon)) return;
    this.focusedWeapon = weapon;
    const rank = this.weapons.find(item => item.id === weapon)!.rank;
    this.callbacks.onEvent(`${WEAPON_INFO[weapon].name.toUpperCase()} FOCUSED · ${WEAPON_RANKS[weapon][rank - 1].toUpperCase()} · +25% DAMAGE`);
    this.publishHud(); this.saveSnapshot();
  }

  upgradeInfo(choice: Upgrade): { name: string; icon: string; color: string; description: string } {
    if (STAT_KEYS.includes(choice as Stat)) return STAT_INFO[choice as Stat];
    if (choice.startsWith('weapon:')) {
      const weapon = choice.slice(7) as Weapon;
      const info = WEAPON_INFO[weapon];
      const owned = this.weapons.find(item => item.id === weapon);
      return { name: owned ? `${info.name} ${['I', 'II', 'III'][owned.rank]}` : info.name, icon: info.icon, color: info.color,
        description: owned ? WEAPON_RANK_UPGRADES[weapon][owned.rank - 1] : info.description };
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
  endRunEarly(): void {
    this.pausedByUser = false; this.running = false; this.releaseJoystick(); clearRunSnapshot();
    for (const enemy of this.enemies) enemy.strike?.ring?.destroy();
  }

  // Localhost-only QA controls are wired in main.ts when ?debug=1 is present.
  debugApproachObjective(): void {
    if (!this.running || this.choosing) return;
    this.clearEnemies();
    const target = this.nextRequiredObjective()
      ?? this.objects.find(object => (object.kind === 'shrine' || object.kind === 'relic') && object.active)
      ?? this.objects.find(object => object.kind === 'gate')!;
    this.hero.setPosition(Phaser.Math.Clamp(target.x + 70, 42, WORLD - 42), target.y);
    this.saveSnapshot();
  }

  debugApproachHazard(): void {
    if (!this.running || this.choosing) return;
    this.clearEnemies();
    const target = this.objects.find(object => (object.kind === 'vent' || object.kind === 'bloom') && object.active);
    if (!target) return;
    this.hero.setPosition(Phaser.Math.Clamp(target.x + 95, 42, WORLD - 42), target.y);
    this.publishHud(); this.saveSnapshot();
  }
  debugShatterHazard(): void {
    if (!this.running || this.choosing) return;
    const target = this.objects.find(object => (object.kind === 'vent' || object.kind === 'bloom') && object.active);
    if (target) this.hitObject(target, target.hp);
  }

  debugInspectTerrain(): void {
    if (!this.running || this.choosing) return;
    this.clearEnemies();
    const target = this.objects.find(object => (object.kind === 'bramble' || object.kind === 'ore' || object.kind === 'moonstone') && object.active);
    if (!target) return;
    this.hero.setPosition(Phaser.Math.Clamp(target.x + 100, 42, WORLD - 42), target.y);
    this.spawnEnemy('brute', { x: target.x - 30, y: target.y });
    const enemy = this.enemies[this.enemies.length - 1];
    enemy.hp = 5000; enemy.maxHp = 5000; enemy.speed = 0; enemy.damage = 0;
    this.publishHud(); this.saveSnapshot();
  }

  debugClearTerrain(): void {
    if (!this.running || this.choosing) return;
    const target = this.objects.find(object => (object.kind === 'bramble' || object.kind === 'ore' || object.kind === 'moonstone') && object.active);
    if (target) this.hitObject(target, target.hp);
  }

  debugMaxBuild(): void {
    if (!this.running || this.choosing) return;
    for (const id of this.unlockedWeapons) {
      if (this.weapons.length >= this.weaponSlots) break;
      if (!this.weapons.some(weapon => weapon.id === id)) this.weapons.push({ id, rank: 3, cooldown: 0 });
    }
    for (const weapon of this.weapons) weapon.rank = 3;
    this.callbacks.onEvent('RANK III WEAPONS READY');
    this.publishHud(); this.saveSnapshot();
  }

  debugOfferUpgrade(): void {
    if (!this.running || this.choosing) return;
    this.gainXp(Math.max(1, xpToNextLevel(this.level) - this.xp));
  }

  debugAdvanceRegion(): void {
    if (!this.running || this.choosing) return;
    for (let i = 0; i < 8; i++) {
      const target = this.nextRequiredObjective();
      if (!target) break;
      if (target.kind === 'pump') { target.hp = 0; this.completeObject(target); }
      else this.hitObject(target, target.hp);
    }
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
  debugSummonBoss(): void {
    if (!this.running || this.choosing) return;
    if (this.region !== 2) { this.region = 2; this.startRegion(); }
    this.clearEnemies();
    this.hero.setPosition(900, 900);
    this.spawnEnemy('boss', { x: 900, y: 690 });
    const boss = this.enemies.find(enemy => enemy.kind === 'boss')!;
    boss.speed = 0; boss.damage = 0;
    this.bossSpawned = true;
    this.publishHud(); this.saveSnapshot();
  }
  debugMarkBoss(): void {
    if (!this.running || this.choosing) return;
    const boss = this.enemies.find(enemy => enemy.kind === 'boss');
    if (!boss?.strike) return;
    const strike = boss.strike;
    strike.ring?.destroy();
    strike.x = this.hero.x; strike.y = this.hero.y;
    strike.radius = bossStrikeRadius(boss.phase); strike.windup = 1.8; strike.cooldown = 0;
    strike.ring = this.createBossStrikeMarker(strike);
    this.saveSnapshot();
  }
  setDebugPilot(enabled: boolean): void {
    this.pilotEnabled = enabled;
    if (!enabled) this.releaseJoystick();
  }

  private updateDebugPilot(): void {
    const gate = this.objects.find(object => object.kind === 'gate')!;
    const guardian = this.enemies.find(enemy => enemy.kind === 'boss' || enemy.kind === 'gatekeeper');
    const objective = this.nextRequiredObjective();
    const shrine = this.objects.find(object => (object.kind === 'shrine' || object.kind === 'relic') && object.active);
    const cache = this.health < this.stats.maxHealth * 0.55
      ? this.caches.find(item => this.distance(this.hero.x, this.hero.y, item.x, item.y) < 220) : null;
    const target = gate.active ? gate : guardian ? { x: guardian.sprite.x, y: guardian.sprite.y }
      : cache ?? objective ?? (this.stageSeconds < REGIONS[this.region].duration - 20 ? shrine : null) ?? gate;
    const enteringGate = gate.active && target === gate;
    const gathering = target === cache;
    const reach = Math.max(...this.weapons.map(weapon => WEAPON_INFO[weapon.id].range)) * this.stats.reach;
    const direction = pilotDirection({ player: { x: this.hero.x, y: this.hero.y }, target,
      desiredDistance: enteringGate || gathering || (target === objective && objective.kind === 'pump') ? 0 : Math.min(210, reach * 0.7),
      enemies: this.enemies.map(enemy => ({ x: enemy.sprite.x, y: enemy.sprite.y })),
      orbitSign: this.seed % 2 ? 1 : -1, avoidance: enteringGate ? 0.1 : gathering ? 0.35 : 1 });
    this.joyVector.set(direction.x, direction.y);
    if (this.specialCooldown > 0) return;
    const specialRange = this.heroId === 'ember' ? 190 : this.heroId === 'warden' ? 145 : 300;
    const closeEnemies = this.enemies.filter(enemy => this.distance(this.hero.x, this.hero.y, enemy.sprite.x, enemy.sprite.y) < specialRange);
    if (closeEnemies.length >= 2 || closeEnemies.some(enemy => enemy.kind === 'boss' || enemy.kind === 'gatekeeper')
      || closeEnemies.length > 0 && this.health < this.stats.maxHealth * 0.7
      || closeEnemies.length === 0 && this.objects.some(object => object.active && object.hp > 0
        && this.distance(this.hero.x, this.hero.y, object.x, object.y) < specialRange)) this.castSpecial();
  }

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
    const struck = this.heroId === 'ranger' ? targets.slice(0, 5) : targets;
    for (const enemy of struck) {
      if (this.heroId === 'ranger' && !this.reducedEffects) {
        const trail = this.add.graphics().setDepth(8);
        trail.lineStyle(5, 0xb9ed9f, 0.85).lineBetween(this.hero.x, this.hero.y, enemy.sprite.x, enemy.sprite.y);
        this.tweens.add({ targets: trail, alpha: 0, duration: 240, onComplete: () => trail.destroy() });
      }
      this.hitEnemy(enemy, Math.round(this.stats.attack * (this.heroId === 'ember' ? 3 : 2.3)));
      if (!this.running) return;
      if (this.heroId === 'ember') this.ignite(enemy, 4, Math.max(5, Math.round(this.stats.attack * 0.4)));
      if (this.heroId === 'warden' && this.enemies.includes(enemy)) {
        const direction = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.sprite.x, enemy.sprite.y);
        const push = enemy.kind === 'boss' || enemy.kind === 'gatekeeper' ? 28 : 75;
        enemy.sprite.setPosition(Phaser.Math.Clamp(enemy.sprite.x + Math.cos(direction) * push, 45, WORLD - 45),
          Phaser.Math.Clamp(enemy.sprite.y + Math.sin(direction) * push, 45, WORLD - 45));
      }
    }
    if (this.heroId === 'warden' && struck.length > 0) {
      const oldHealth = this.health;
      this.health = Math.min(this.stats.maxHealth, this.health + Math.min(12, struck.length * 3));
      if (this.health > oldHealth) this.floatText(`+${Math.ceil(this.health - oldHealth)} HP`, this.hero.x, this.hero.y - 68, '#b7edc0');
    }
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
    if (this.pilotEnabled) this.updateDebugPilot();
    if (!this.running) return;
    this.moveHero(dt);
    this.updateHazards();
    if (!this.running) return;
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
    this.updateObjects(dt);
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
    this.slowed = false;
    this.hero.setPosition(900, 900);
    this.drawRegion();
    const layout = generateRegionLayout(this.seed, this.region);
    let wardIndex = 0;
    for (const clearing of layout.clearings) {
      if (clearing.kind === 'ward') {
        if (this.region === 0) this.spawnObject('ward', clearing.x, clearing.y, 150, 150, true);
        else if (this.region === 1) this.spawnObject(wardIndex === 0 ? 'pump' : 'forge', clearing.x, clearing.y,
          wardIndex === 0 ? 240 : 320, wardIndex === 0 ? 240 : 320, wardIndex === 0);
        else if (wardIndex === 0) this.spawnObject('altar', clearing.x, clearing.y, 370, 370, false);
        wardIndex++;
      }
      if (clearing.kind === 'shrine') {
        this.spawnObject('shrine', clearing.x - 48, clearing.y, 105 + this.region * 40, 105 + this.region * 40, true);
        this.spawnObject('relic', clearing.x + 65, clearing.y + 15, 105 + this.region * 40, 105 + this.region * 40, false);
      }
      if (clearing.kind === 'gate') this.spawnObject('gate', clearing.x, clearing.y, 0, 0, false);
    }
    for (const site of hazardSites(this.seed, this.region)) {
      const hp = site.kind === 'vent' ? 180 : 210;
      this.spawnObject(site.kind, site.x, site.y, hp, hp, true);
    }
    for (const site of terrainSites(this.seed, this.region)) {
      this.spawnObject(site.kind, site.x, site.y, 135 + this.region * 65, 135 + this.region * 65, true);
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
    this.clearEnemies();
    for (const object of this.objects) object.view.destroy();
    for (const orb of this.orbs) orb.view.destroy();
    for (const cache of this.caches) { this.tweens.killTweensOf(cache.view); cache.view.destroy(); }
    this.objects = []; this.orbs = []; this.caches = [];
    this.bars?.clear(); this.nav?.setText(''); this.releaseJoystick();
  }

  private clearEnemies(): void {
    for (const enemy of this.enemies) { enemy.strike?.ring?.destroy(); enemy.sprite.destroy(); }
    this.enemies = [];
  }

  private moveHero(dt: number): void {
    let dx = this.joyVector.x; let dy = this.joyVector.y;
    if (this.keys?.A?.isDown || this.cursors?.left?.isDown) dx -= 1;
    if (this.keys?.D?.isDown || this.cursors?.right?.isDown) dx += 1;
    if (this.keys?.W?.isDown || this.cursors?.up?.isDown) dy -= 1;
    if (this.keys?.S?.isDown || this.cursors?.down?.isDown) dy += 1;
    const length = Math.hypot(dx, dy);
    this.moveDirection.set(length > 0.03 ? dx / length : 0, length > 0.03 ? dy / length : 0);
    const attackKick = this.attackPose > 0 ? Math.sin(this.attackPose / 0.16 * Math.PI) : 0;
    if (length > 0.03) {
      const speed = this.stats.speed * (this.slowed ? 0.68 : 1);
      this.hero.x = Phaser.Math.Clamp(this.hero.x + dx / Math.max(1, length) * speed * dt, 42, WORLD - 42);
      this.hero.y = Phaser.Math.Clamp(this.hero.y + dy / Math.max(1, length) * speed * dt, 42, WORLD - 42);
      if (dx !== 0) this.hero.setFlipX(dx < 0);
      this.hero.setRotation(Math.sin(this.seconds * 12) * 0.045 + attackKick * (this.hero.flipX ? -0.12 : 0.12))
        .setScale(0.36 * (1 + Math.sin(this.seconds * 12) * 0.025 + attackKick * 0.09), 0.36 * (1 - Math.sin(this.seconds * 12) * 0.025 - attackKick * 0.06));
    } else this.hero.setRotation(attackKick * (this.hero.flipX ? -0.12 : 0.12))
      .setScale(0.36 * (1 + Math.sin(this.seconds * 3) * 0.012 + attackKick * 0.09), 0.36 * (1 - attackKick * 0.06));
    this.hero.setAlpha(this.invulnerability > 0 && Math.floor(this.seconds * 18) % 2 === 0 ? 0.57 : 1);
    this.nav.setPosition(this.hero.x, this.hero.y - 110);
  }

  private updateHazards(): void {
    let slowed = false;
    let tangled = false;
    for (const object of this.objects) {
      if (!object.active || !object.ring) continue;
      const distance = this.distance(this.hero.x, this.hero.y, object.x, object.y);
      if (object.kind === 'bloom' || object.kind === 'bramble') {
        if (distance < (object.kind === 'bramble' ? 105 : 116)) {
          slowed = true;
          tangled = object.kind === 'bramble';
        }
      } else if (object.kind === 'vent') {
        const phase = ventPhase(this.stageSeconds, object.x, object.y);
        if (phase !== object.hazardPhase) {
          object.hazardPhase = phase;
          const fill = phase === 'eruption' ? 0.38 : phase === 'warning' ? 0.19 : 0.035;
          const outline = phase === 'idle' ? 0.28 : 0.95;
          object.ring.setFillStyle(0xff9a55, fill).setStrokeStyle(phase === 'eruption' ? 6 : 3, 0xffd289, outline);
          object.ring.setScale(this.reducedEffects ? 1 : phase === 'eruption' ? 1.07 : 1);
        }
        if (phase === 'eruption' && distance < 120 && this.invulnerability <= 0) {
          this.callbacks.onEvent('EMBER VENT ERUPTS');
          this.takeDamage(16);
          if (!this.running) return;
        }
      }
    }
    if (slowed && !this.slowed) this.floatText(tangled ? 'TANGLED' : 'SLOWED',
      this.hero.x, this.hero.y - 70, tangled ? '#c2eaa3' : '#b7e7ef');
    this.slowed = slowed;
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
    if (shouldSpawnGuardian(objectivesLeft(this.region, this.objects), this.stageSeconds, REGIONS[this.region].duration, this.gatekeeperSpawned)) {
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
      gnarl: { hp: 27, speed: 77, damage: 8, radius: 23, size: 48, texture: 'gnarl-v2' },
      wisp: { hp: 17, speed: 126, damage: 6, radius: 17, size: 43, texture: 'wisp-v2' },
      brute: { hp: 82, speed: 53, damage: 15, radius: 31, size: 67, texture: 'brute-v2' },
      gatekeeper: { hp: 420, speed: 67, damage: 18, radius: 38, size: 91, texture: 'brute-v2' },
      boss: { hp: 1150, speed: 63, damage: 22, radius: 54, size: 125, texture: 'briar-king-v2' },
    }[kind];
    const point = position ?? this.spawnPoint();
    const hp = saved?.maxHp ?? Math.round(values.hp * (kind === 'boss' || kind === 'gatekeeper' ? 1 : 1 + this.region * 0.25 + this.stageSeconds / 700));
    const sprite = this.add.image(point.x, point.y, values.texture).setDisplaySize(values.size, values.size).setDepth(4);
    if (kind === 'gatekeeper') sprite.setTint(0xf1bd8d);
    if (this.region === 2 && kind === 'wisp') sprite.setTint(0xb2e4e6);
    if ((saved?.burnRemaining ?? 0) > 0) sprite.setTint(0xffae72);
    const phase = saved?.phase ?? (kind === 'boss' ? 0 : this.random.range(0, 6));
    const strike = kind === 'boss' ? {
      cooldown: saved?.bossStrike?.cooldown ?? 1.8,
      windup: saved?.bossStrike?.windup ?? 0,
      x: saved?.bossStrike?.x ?? point.x,
      y: saved?.bossStrike?.y ?? point.y,
      radius: saved?.bossStrike?.radius ?? bossStrikeRadius(phase),
    } as Enemy['strike'] : undefined;
    if (strike && strike.windup > 0) strike.ring = this.createBossStrikeMarker(strike);
    this.enemies.push({ sprite, kind, hp: saved?.hp ?? hp, maxHp: hp,
      speed: values.speed + (kind === 'boss' ? phase * 10 : 0),
      damage: values.damage + (kind === 'boss' ? phase * 3 : 0),
      radius: values.radius, phase, pendingDamage: 0, damageClock: 0,
      burnRemaining: saved?.burnRemaining ?? 0, burnTickClock: saved?.burnTickClock ?? 0,
      burnDamage: saved?.burnDamage ?? 0, burnSource: saved?.burnSource, strike });
  }

  private updateEnemies(dt: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.burnRemaining > 0) {
        enemy.burnRemaining = Math.max(0, enemy.burnRemaining - dt);
        enemy.burnTickClock -= dt;
        if (enemy.burnTickClock <= 0 && enemy.burnDamage > 0) {
          enemy.burnTickClock += 1;
          this.hitEnemy(enemy, enemy.burnDamage, true, enemy.burnSource);
          if (!this.running) break;
          if (!this.enemies.includes(enemy)) continue;
        }
      }
      const dx = this.hero.x - enemy.sprite.x; const dy = this.hero.y - enemy.sprite.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      if (distance > enemy.radius + 16) {
        const weave = enemy.kind === 'wisp' ? Math.sin(this.seconds * 7 + enemy.phase) * 0.32 : 0;
        const fieldSpeed = enemyFieldModifiers(enemy.sprite.x, enemy.sprite.y, this.objects).speed;
        enemy.sprite.x += (dx / distance - dy / distance * weave) * enemy.speed * fieldSpeed * dt;
        enemy.sprite.y += (dy / distance + dx / distance * weave) * enemy.speed * fieldSpeed * dt;
      } else if (this.invulnerability <= 0) this.takeDamage(enemy.damage);
      if (!this.running) break;
      enemy.sprite.setFlipX(dx < 0);
      enemy.sprite.setRotation(Math.sin(this.seconds * (enemy.kind === 'wisp' ? 8 : 3) + enemy.phase) * 0.055);
      if (enemy.pendingDamage > 0) {
        enemy.damageClock -= dt;
        if (enemy.damageClock <= 0) this.flushDamage(enemy);
      }
      if (enemy.strike) this.updateBossStrike(enemy, dt);
      if (!this.running) break;
    }
  }

  private createBossStrikeMarker(strike: BossStrikeState): Phaser.GameObjects.Arc {
    return this.add.circle(strike.x, strike.y, strike.radius, 0xb44765, 0.27)
      .setStrokeStyle(6, 0xffd6aa, 0.95).setDepth(3);
  }

  private updateBossStrike(boss: Enemy, dt: number): void {
    const strike = boss.strike!;
    if (strike.windup > 0) {
      strike.windup = Math.max(0, strike.windup - dt);
      if (!this.reducedEffects) strike.ring?.setAlpha(0.72 + Math.sin(this.seconds * 18) * 0.2);
      if (strike.windup > 0) return;
      strike.ring?.destroy(); strike.ring = undefined;
      this.burst(strike.x, strike.y, '#ffb87e', 15);
      if (insideBossStrike({ x: this.hero.x, y: this.hero.y }, strike)) {
        if (this.invulnerability <= 0) this.takeDamage(32 + boss.phase * 5);
      } else this.floatText('DODGED', this.hero.x, this.hero.y - 51, '#bdf3cf');
      strike.cooldown = bossStrikeCooldown(boss.phase);
      this.saveSnapshot();
      return;
    }
    strike.cooldown = Math.max(0, strike.cooldown - dt);
    if (strike.cooldown > 0) return;
    const target = bossStrikeTarget({ x: this.hero.x, y: this.hero.y }, this.moveDirection);
    strike.x = target.x; strike.y = target.y; strike.radius = bossStrikeRadius(boss.phase);
    strike.windup = BOSS_STRIKE_WINDUP;
    strike.ring = this.createBossStrikeMarker(strike);
    this.callbacks.onEvent('BRIAR MARK — MOVE!');
    this.saveSnapshot();
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
    const targetObjects = this.objects.filter(candidate => candidate.active && candidate.hp > 0 && candidate.kind !== 'pump');
    const selection = chooseAutoTarget({ x: this.hero.x, y: this.hero.y }, range,
      this.enemies.map(enemy => ({ x: enemy.sprite.x, y: enemy.sprite.y })), targetObjects);
    const target: Enemy | null = selection?.kind === 'enemy' ? this.enemies[selection.index] : null;
    const object: WorldObject | null = selection?.kind === 'object' ? targetObjects[selection.index] : null;
    if (!target && !object) { weapon.cooldown = 0.12; return; }
    weapon.cooldown = info.cooldown;
    soundFx.play(weapon.id === 'axe' ? 'swing' : weapon.id === 'thorns' ? 'dart' : weapon.id === 'bow' ? 'bow' : 'staff');
    this.attackPose = 0.16;
    const x = target?.sprite.x ?? object!.x; const y = target?.sprite.y ?? object!.y;
    const angle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, x, y);
    const critical = weapon.id === 'bow' && this.random.next() < bowCriticalChance(weapon.rank);
    const focusBonus = this.weapons.length < 2 ? 1 : this.focusedWeapon === weapon.id ? 1.25 : 0.9;
    const damage = Math.round(weaponDamage(this.stats.attack, weapon.id, weapon.rank) * focusBonus * (critical ? 1.7 : 1));
    const otherEnemies = target && weapon.id === 'thorns' ? this.enemies.filter(enemy => enemy !== target) : [];
    const pierced = target && weapon.id === 'thorns'
      ? pierceTargets({ x: this.hero.x, y: this.hero.y }, { x, y }, range,
        otherEnemies.map(enemy => ({ x: enemy.sprite.x, y: enemy.sprite.y })), thornPierceCount(weapon.rank))
        .map(index => otherEnemies[index]) : [];
    if (weapon.id === 'axe') {
      const slash = this.add.graphics().setDepth(8);
      const radius = 57 + this.splashBonus * 0.35 + (weapon.rank >= 2 ? 14 : 0);
      slash.lineStyle(24, 0xffe2ab, 0.14).beginPath()
        .arc(this.hero.x, this.hero.y, radius, angle - 0.8, angle + 0.8).strokePath();
      slash.lineStyle(7, 0xfff0c4, 0.9).beginPath()
        .arc(this.hero.x, this.hero.y, radius + 6, angle - 0.8, angle + 0.8).strokePath();
      this.tweens.add({ targets: slash, alpha: 0, duration: 190, onComplete: () => slash.destroy() });
    } else if (weapon.id === 'thorns') {
      const dart = this.add.rectangle(this.hero.x, this.hero.y, 28, 5, this.skin ? 0xffd37a : 0xb7ec9c)
        .setRotation(angle).setDepth(8);
      this.tweens.add({ targets: dart, x: pierced.at(-1)?.sprite.x ?? x, y: pierced.at(-1)?.sprite.y ?? y,
        alpha: 0, duration: 210, onComplete: () => dart.destroy() });
    } else if (weapon.id === 'bow') {
      const arrow = this.add.rectangle(this.hero.x, this.hero.y, 35, critical ? 7 : 4,
        critical ? 0xfff2b8 : this.skin ? 0xffd37a : 0xffd489).setRotation(angle).setDepth(8);
      this.tweens.add({ targets: arrow, x, y, alpha: 0, duration: 165, onComplete: () => arrow.destroy() });
    } else {
      const orb = this.add.circle(this.hero.x, this.hero.y, 12, this.skin ? 0xffd37a : 0xff9d65)
        .setStrokeStyle(3, 0xffe2a7, 0.9).setDepth(8);
      this.tweens.add({ targets: orb, x, y, alpha: 0, duration: 190, onComplete: () => orb.destroy() });
      if (!this.reducedEffects) {
        const flare = this.add.circle(x, y, 12, 0xffb376, 0.22).setStrokeStyle(3, 0xffc58c, 0.7).setDepth(7);
        this.tweens.add({ targets: flare, scale: 4, alpha: 0, duration: 310, onComplete: () => flare.destroy() });
      }
    }
    if (target) {
      const splash = weaponSplash(weapon.id, this.splashBonus, weapon.rank);
      const victims = splash > 0 ? this.enemies.filter(enemy => this.distance(enemy.sprite.x, enemy.sprite.y, x, y) < splash) : [target];
      for (const enemy of victims) {
        this.hitEnemy(enemy, damage, false, weapon.id);
        if (!this.running) return;
        if (weapon.id === 'staff') {
          const burn = staffBurn(weapon.rank, damage);
          this.ignite(enemy, burn.seconds, burn.tickDamage, weapon.id);
        }
        if (weapon.id === 'axe' && weapon.rank >= 3 && this.enemies.includes(enemy)
          && enemy.kind !== 'boss' && enemy.kind !== 'gatekeeper') {
          const pushAngle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.sprite.x, enemy.sprite.y);
          enemy.sprite.setPosition(Phaser.Math.Clamp(enemy.sprite.x + Math.cos(pushAngle) * 48, 36, WORLD - 36),
            Phaser.Math.Clamp(enemy.sprite.y + Math.sin(pushAngle) * 48, 36, WORLD - 36));
        }
      }
      for (const [index, enemy] of pierced.entries()) {
        this.hitEnemy(enemy, Math.round(damage * (weapon.rank >= 3 ? 0.8 : weapon.rank >= 2 ? 0.72 : 0.65) ** (index + 1)), false, weapon.id);
        if (!this.running) return;
      }
      if (pierced.length > 0 && weapon.rank >= 2 && !this.reducedEffects) {
        this.floatText(`PIERCE ×${pierced.length}`, x, y - 63, '#c9f3aa');
      }
      if (weapon.id === 'bow' && weapon.rank >= 3) {
        const others = this.enemies.filter(enemy => enemy !== target);
        const ricochet = ricochetTarget({ x, y }, others.map(enemy => ({ x: enemy.sprite.x, y: enemy.sprite.y })));
        if (ricochet !== null) {
          const bounce = others[ricochet];
          if (!this.reducedEffects) this.trail(x, y, bounce.sprite.x, bounce.sprite.y, 0xffe1a5);
          this.hitEnemy(bounce, Math.round(damage * 0.5), false, weapon.id);
          if (!this.running) return;
          if (!this.reducedEffects) this.floatText('RICOCHET', bounce.sprite.x, bounce.sprite.y - 52, '#ffe3a3');
        }
      }
      if (splash > 0) {
        for (const nearby of this.objects.filter(item => item.active && item.hp > 0 && this.distance(item.x, item.y, x, y) < splash)) {
          this.hitObject(nearby, damage);
        }
      }
    } else if (object) this.hitObject(object, damage);
    if (critical) this.floatText('CRITICAL!', x, y - 61, '#fff1a7');
    if (!this.reducedEffects) this.burst(x, y, info.color, 3);
  }

  private hitEnemy(enemy: Enemy, damage: number, quiet = false, source?: Weapon): void {
    if (!this.enemies.includes(enemy)) return;
    const damageTaken = enemyFieldModifiers(enemy.sprite.x, enemy.sprite.y, this.objects).damageTaken;
    const actual = Math.max(1, Math.round(damage * damageTaken));
    const credited = Math.min(actual, Math.max(0, enemy.hp));
    this.metrics.foeDamage += credited;
    if (source) {
      this.metrics.weaponDamage ??= emptyWeaponDamage();
      this.metrics.weaponDamage[source] += credited;
    }
    enemy.hp -= actual; enemy.pendingDamage += actual; enemy.damageClock = 0.16;
    if (!quiet) soundFx.play('hit');
    enemy.sprite.setTint(0xffd6a0);
    this.time.delayedCall(90, () => {
      if (enemy.sprite.active) enemy.sprite.setTint(enemy.burnRemaining > 0 ? 0xffae72
        : enemy.kind === 'gatekeeper' ? 0xf1bd8d
          : this.region === 2 && enemy.kind === 'wisp' ? 0xb2e4e6 : 0xffffff);
    });
    if (enemy.hp > 0) {
      if (enemy.kind === 'boss') this.updateBossPhase(enemy);
      return;
    }
    this.flushDamage(enemy);
    const x = enemy.sprite.x; const y = enemy.sprite.y;
    enemy.strike?.ring?.destroy(); enemy.sprite.destroy(); this.enemies.splice(this.enemies.indexOf(enemy), 1);
    this.kills++;
    this.burst(x, y, enemy.kind === 'wisp' ? '#f8be71' : '#b4d889', enemy.kind === 'boss' ? 17 : 7);
    if (enemy.kind === 'boss') { this.finish(true); return; }
    if (enemy.kind === 'gatekeeper') { this.openGate(); return; }
    this.spawnOrb(x, y, enemy.kind === 'brute' ? 3 : 1);
  }

  private ignite(enemy: Enemy, seconds: number, damage: number, source?: Weapon): void {
    if (!this.enemies.includes(enemy)) return;
    if (enemy.burnRemaining <= 0) {
      enemy.burnTickClock = 1; enemy.burnDamage = 0; enemy.burnSource = undefined;
    }
    enemy.burnRemaining = Math.max(enemy.burnRemaining, seconds);
    if (damage >= enemy.burnDamage) enemy.burnSource = source;
    enemy.burnDamage = Math.max(enemy.burnDamage, damage);
    enemy.sprite.setTint(0xffae72);
    if (!this.reducedEffects) this.burst(enemy.sprite.x, enemy.sprite.y, '#ff9a58', 2);
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
    const texture: Record<ObjectKind, string> = {
      ward: 'root-totem', pump: 'coolant-pump', forge: 'forge-core', altar: 'moon-altar',
      shrine: 'reliquary', relic: 'fox-relic', gate: 'grove-gate', vent: 'ember-vent', bloom: 'mist-bloom',
      bramble: 'bramble-field', ore: 'ember-ore', moonstone: 'moonstone',
    };
    const fieldStyles: Partial<Record<ObjectKind, { radius: number; color: number; fill: number; stroke: number }>> = {
      pump: { radius: 110, color: 0x8ddfe0, fill: 0.09, stroke: 0.75 },
      vent: { radius: 120, color: 0xff9a55, fill: 0.035, stroke: 0.28 },
      bloom: { radius: 116, color: 0x8dc9d1, fill: 0.075, stroke: 0.62 },
      bramble: { radius: 105, color: 0x8ec477, fill: 0.08, stroke: 0.55 },
      ore: { radius: 145, color: 0xffb16b, fill: 0.055, stroke: 0.55 },
      moonstone: { radius: 150, color: 0xb7adfa, fill: 0.065, stroke: 0.62 },
    };
    const field = fieldStyles[kind];
    const ring = field ? this.add.circle(0, 0, field.radius, field.color, field.fill)
      .setStrokeStyle(3, field.color, field.stroke).setVisible(active) : undefined;
    const base = this.add.ellipse(0, 21, kind === 'gate' ? 125 : 70, 27, 0x132f2c, 0.55);
    const size = kind === 'gate' ? 134 : kind === 'forge' || kind === 'altar' || kind === 'moonstone' ? 110
      : kind === 'bramble' ? 125 : kind === 'ore' ? 116 : kind === 'relic' ? 83 : 98;
    const image = this.add.image(0, kind === 'gate' ? -14 : -8, texture[kind]).setDisplaySize(size, size);
    const terrainLabel: Partial<Record<ObjectKind, string>> = {
      bramble: 'BRAMBLES · SLOW', ore: 'ORE · FOE ARMOR', moonstone: 'MOONSTONE · HASTE',
    };
    const label = this.add.text(0, kind === 'gate' ? 61 : 49,
      kind === 'pump' && active ? `DRAIN PUMP · ${Math.floor((1 - hp / maxHp) * 4)}/4s`
        : active ? terrainLabel[kind] ?? objectiveName(kind) : `${objectiveName(kind)} · SEALED`, {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#fff0cb', stroke: '#1b3c32', strokeThickness: 4,
    }).setOrigin(0.5);
    const view = this.add.container(x, y, ring ? [ring, base, image, label] : [base, image, label])
      .setDepth(2).setAlpha(active ? 1 : 0.35);
    this.objects.push({ view, label, kind, x, y, hp, maxHp, active, ring });
  }

  private hitObject(object: WorldObject, damage: number): void {
    if (!object.active || object.hp <= 0 || object.kind === 'pump') return;
    this.metrics.objectDamage += Math.min(damage, object.hp);
    object.hp = Math.max(0, object.hp - damage);
    soundFx.play(object.hp > 0 ? 'hit' : 'ward');
    this.floatText(String(damage), object.x, object.y - 54, '#ffe8a0');
    object.view.setScale(1.08);
    this.tweens.add({ targets: object.view, scale: 1, duration: 100 });
    if (object.hp > 0) return;
    this.completeObject(object);
  }

  private completeObject(object: WorldObject): void {
    object.hp = 0;
    if (object.kind === 'pump') {
      soundFx.play('ward');
      this.floatText('PUMP DRAINED', object.x, object.y - 57, '#b8f4ee');
    }
    object.active = false; object.view.setAlpha(0.15); object.ring?.setVisible(false);
    this.burst(object.x, object.y, object.kind === 'ward' ? '#c7e2a7' : '#f6d597', 16);
    if (object.kind === 'ward' || object.kind === 'pump' || object.kind === 'forge' || object.kind === 'altar') {
      this.metrics.wards++;
      if (object.kind === 'pump') {
        const forge = this.objects.find(item => item.kind === 'forge' && item.hp > 0);
        if (forge) { forge.active = true; forge.view.setAlpha(1); forge.label.setText(objectiveName('forge')); }
        this.callbacks.onEvent('PRESSURE RELEASED — FORGE CORE EXPOSED');
      } else this.callbacks.onEvent(this.requiredLeft() > 0
        ? `${this.requiredLeft()} OBJECTIVE${this.requiredLeft() === 1 ? '' : 'S'} REMAIN`
        : 'OBJECTIVES CLEARED — HOLD THE GATE');
    } else if (object.kind === 'shrine') {
      const relic = this.objects.find(item => item.kind === 'relic')!;
      relic.active = true; relic.view.setAlpha(1);
      this.callbacks.onEvent('THE RELIC WAKES');
    } else if (object.kind === 'relic') {
      if (!this.pet) { this.pet = true; this.petView.setVisible(true); this.callbacks.onEvent('GLOWFOX JOINS YOU'); }
      else if (this.weaponSlots < 3) { this.weaponSlots++; this.callbacks.onEvent('AN EXTRA WEAPON SLOT OPENS'); }
      else {
        const focused = this.weapons.find(weapon => weapon.id === this.focusedWeapon)!;
        if (focused.rank < 3) { focused.rank++; this.callbacks.onEvent(`${WEAPON_INFO[focused.id].name.toUpperCase()} RANKS UP`); }
        else { this.health = Math.min(this.stats.maxHealth, this.health + 30); this.callbacks.onEvent('THE RELIC RESTORES 30 HEALTH'); }
      }
    } else if (object.kind === 'vent' || object.kind === 'bloom') {
      this.metrics.hazards++;
      if (object.kind === 'bloom' && this.region === 2 && this.objects.some(item => item.kind === 'altar')) {
        this.metrics.wards++;
        if (!this.objects.some(item => item.kind === 'bloom' && item.hp > 0)) {
          const altar = this.objects.find(item => item.kind === 'altar' && item.hp > 0);
          if (altar) { altar.active = true; altar.view.setAlpha(1); altar.label.setText(objectiveName('altar')); }
          this.callbacks.onEvent('THE MOON ALTAR UNSEALS');
        } else this.callbacks.onEvent('ONE MIST BLOOM REMAINS');
      }
      this.spawnOrb(object.x - 14, object.y, 2);
      this.spawnOrb(object.x + 14, object.y, 2);
      if (object.kind === 'vent') this.callbacks.onEvent('EMBER VENT SEALED');
    } else if (object.kind === 'bramble' || object.kind === 'ore' || object.kind === 'moonstone') {
      const reward: Stat = object.kind === 'bramble' ? 'speed' : object.kind === 'ore' ? 'attack' : 'reach';
      this.metrics.terrain = (this.metrics.terrain ?? 0) + 1;
      this.spawnCache(reward, object.x, object.y);
      this.callbacks.onEvent(`${objectiveName(object.kind)} CLEARED · ${STAT_INFO[reward].name.toUpperCase()} CACHE`);
    }
    this.publishHud(); this.saveSnapshot();
  }

  private requiredLeft(): number { return objectivesLeft(this.region, this.objects); }
  private nextRequiredObjective(): WorldObject | undefined { return nextObjective(this.region, this.objects) as WorldObject | undefined; }
  private openGate(): void {
    const gate = this.objects.find(object => object.kind === 'gate');
    if (gate) { gate.active = true; gate.view.setAlpha(1); this.callbacks.onEvent('GATE OPEN — FOLLOW THE ARROW'); this.saveSnapshot(); }
  }
  private updateObjects(dt = 0): void {
    const pump = this.objects.find(object => object.kind === 'pump' && object.active && object.hp > 0);
    if (pump && dt > 0 && this.distance(this.hero.x, this.hero.y, pump.x, pump.y) < 110) {
      pump.hp = Math.max(0, pump.hp - dt * 60);
      const channelSeconds = Math.min(4, Math.floor((1 - pump.hp / pump.maxHp) * 4));
      const channelLabel = `DRAIN PUMP · ${channelSeconds}/4s`;
      if (pump.label.text !== channelLabel) pump.label.setText(channelLabel);
      if (pump.hp <= 0) this.completeObject(pump);
    }
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
    const target = this.nextRequiredObjective()
      ?? (!this.gatekeeperSpawned && !gate.active
        ? this.objects.find(object => (object.kind === 'shrine' || object.kind === 'relic') && object.active)
        : null)
      ?? gate;
    const dx = target.x - this.hero.x; const dy = target.y - this.hero.y;
    const angle = Math.atan2(dy, dx);
    const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
    const arrow = arrows[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
    const label = target.kind === 'gate' && !target.active ? 'HOLD' : objectiveName(target.kind);
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
      if (!this.reducedEffects) {
        const field = enemyFieldModifiers(enemy.sprite.x, enemy.sprite.y, this.objects);
        if (field.damageTaken < 1 || field.speed !== 1) {
          const color = field.damageTaken < 1 ? 0xa6e7ef : field.speed > 1 ? 0xc4adff : 0xb8e898;
          this.bars.lineStyle(2, color, 0.7).strokeCircle(enemy.sprite.x, enemy.sprite.y, enemy.radius + 7);
        }
      }
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
      this.bars.fillStyle(object.kind === 'pump' ? 0xa7f0ec : 0xf6d899)
        .fillRoundedRect(x, y, 76 * (object.kind === 'pump' ? 1 - object.hp / object.maxHp : object.hp / object.maxHp), 5, 2);
    }
  }

  private floatText(value: string, x: number, y: number, color: string): void {
    const label = this.add.text(x, y, value, { fontFamily: 'Arial, sans-serif', fontSize: '15px', fontStyle: 'bold', color, stroke: '#18372d', strokeThickness: 4 }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: label, y: y - 35, alpha: 0, duration: 780, ease: 'Cubic.Out', onComplete: () => label.destroy() });
  }
  private trail(x1: number, y1: number, x2: number, y2: number, color: number): void {
    const beam = this.add.graphics().setDepth(9);
    beam.lineStyle(9, color, 0.18).lineBetween(x1, y1, x2, y2);
    beam.lineStyle(3, color, 0.95).lineBetween(x1, y1, x2, y2);
    this.tweens.add({ targets: beam, alpha: 0, duration: 220, onComplete: () => beam.destroy() });
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
    for (const enemy of this.enemies) enemy.strike?.ring?.destroy();
    if (won) soundFx.play('victory');
    if (won) this.tweens.add({ targets: this.hero, scaleX: 0.44, scaleY: 0.44, yoyo: true, duration: 250 });
    else this.tweens.add({ targets: this.hero, angle: 80, alpha: 0.28, duration: 370, ease: 'Cubic.Out' });
    this.callbacks.onEnd({ won, kills: this.kills, seconds: this.seconds, level: this.level, hero: this.heroId,
      region: won ? 3 : this.region, weapons: this.weapons.map(weapon => weapon.id),
      metrics: { ...this.metrics, weaponDamage: { ...(this.metrics.weaponDamage ?? emptyWeaponDamage()) },
        regionSeconds: [...this.metrics.regionSeconds] as RunMetrics['regionSeconds'] } });
    this.publishHud();
  }
  private publishHud(): void {
    const boss = this.enemies.find(enemy => enemy.kind === 'boss' || enemy.kind === 'gatekeeper');
    const currentObjective = this.nextRequiredObjective();
    const nearbyTerrain = this.objects.find(object => object.active
      && (object.kind === 'bramble' || object.kind === 'ore' || object.kind === 'moonstone')
      && this.distance(this.hero.x, this.hero.y, object.x, object.y) < (object.kind === 'bramble' ? 155 : 195));
    this.callbacks.onHud({
      health: this.health, maxHealth: this.stats.maxHealth, level: this.level, xp: this.xp,
      xpNeeded: xpToNextLevel(this.level), kills: this.kills, seconds: this.seconds,
      stageSeconds: this.stageSeconds, region: this.region, stats: { ...this.stats },
      bossHp: boss?.hp ?? null, bossMaxHp: boss?.maxHp ?? null,
      weapons: this.weapons.map(weapon => ({ ...weapon })), weaponSlots: this.weaponSlots, focusedWeapon: this.focusedWeapon,
      weaponDamage: { ...(this.metrics.weaponDamage ?? emptyWeaponDamage()) },
      special: HERO_INFO[this.heroId].special, specialCooldown: this.specialCooldown,
      objectivesLeft: this.requiredLeft(), objectiveName: currentObjective?.kind ?? null,
      stepTargetsLeft: this.objects.filter(object => object.kind === currentObjective?.kind && object.hp > 0).length,
      stepProgress: currentObjective?.kind === 'pump'
        ? Math.min(4, Math.floor((1 - currentObjective.hp / currentObjective.maxHp) * 4)) : 0,
      terrainHint: nearbyTerrain?.kind === 'bramble' ? 'BRAMBLES SLOW BOTH SIDES'
        : nearbyTerrain?.kind === 'ore' ? 'ORE ARMORS FOES'
          : nearbyTerrain?.kind === 'moonstone' ? 'MOONSTONE HASTES FOES' : null,
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
      focusedWeapon: this.focusedWeapon,
      splashBonus: this.splashBonus, pet: this.pet, petClock: this.petClock,
      autoSpecial: this.autoSpecial, specialCooldown: this.specialCooldown, reducedEffects: this.reducedEffects,
      stats: { ...this.stats }, health: this.health, xp: this.xp, level: this.level, kills: this.kills,
      seconds: this.seconds, region: this.region, stageSeconds: this.stageSeconds,
      spawnClock: this.spawnClock, cacheClock: this.cacheClock,
      x: this.hero.x, y: this.hero.y, invulnerability: this.invulnerability,
      gatekeeperSpawned: this.gatekeeperSpawned, bossSpawned: this.bossSpawned,
      choosing: this.choosing, upgradeOptions: [...this.upgradeOptions],
      enemies: this.enemies.map(enemy => ({ kind: enemy.kind, x: enemy.sprite.x, y: enemy.sprite.y,
        hp: enemy.hp, maxHp: enemy.maxHp, phase: enemy.phase,
        burnRemaining: enemy.burnRemaining, burnTickClock: enemy.burnTickClock, burnDamage: enemy.burnDamage,
        burnSource: enemy.burnSource,
        bossStrike: enemy.strike ? { cooldown: enemy.strike.cooldown, windup: enemy.strike.windup,
          x: enemy.strike.x, y: enemy.strike.y, radius: enemy.strike.radius } : undefined })),
      objects: this.objects.map(object => ({ kind: object.kind, x: object.x, y: object.y, hp: object.hp, maxHp: object.maxHp, active: object.active })),
      orbs: this.orbs.map(orb => ({ x: orb.x, y: orb.y, value: orb.value })),
      caches: this.caches.map(cache => ({ x: cache.x, y: cache.y, stat: cache.stat })),
      metrics: { ...this.metrics, weaponDamage: { ...(this.metrics.weaponDamage ?? emptyWeaponDamage()) },
        regionSeconds: [...this.metrics.regionSeconds] as RunMetrics['regionSeconds'] },
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
