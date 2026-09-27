import Phaser from 'phaser';
import {
  HERO_INFO, REGIONS, STAT_INFO, STAT_KEYS, WEAPON_COMMAND, WEAPON_INFO, WEAPON_PATH_INFO, WEAPON_RANKS, WEAPON_RANK_UPGRADES, Rng, baseStatsFor, damageAfterDefense,
  generateRegionLayout, upgradeStat, xpToNextLevel,
  type Hero, type Stat, type Stats, type Upgrade, type Weapon, type WeaponPath,
} from './logic';
import { clearRunSnapshot, emptyRunMetrics, emptyWeaponDamage, saveRunSnapshot, type EnemySave, type ObjectSave, type RunMetrics, type RunSnapshot } from './runSave';
import { soundFx } from './audio';
import { advanceEmberField, bossPhaseFor, bowCriticalChance, chooseAutoTarget, pickUpgradeChoices, pierceTargets, ricochetTarget, targetsInArc,
  shouldSpawnGuardian, staffBurn, thornPierceCount, weaponDamage, weaponPathEffects, weaponSplash } from './combat';
import { pilotDirection } from './pilot';
import { hazardSites, ventPhase, type VentPhase } from './hazards';
import { enemyFieldModifiers, terrainRupture, terrainSites, type TerrainKind } from './terrain';
import { BOSS_STRIKE_WINDUP, bossStrikeCooldown, bossStrikeRadius, bossStrikeTarget, insideBossStrike, type BossStrikeState } from './bossStrike';
import { WISP_LANCE_WIDTH, WISP_LANCE_WINDUP, insideWispLance, waveInterval, wildSurge,
  wispLanceCooldown, wispLanceDamage, wispLanceTarget, type WispLanceState } from './wispLance';
import { advanceSeedheart, moonMission, nextObjective, objectiveName, objectivesLeft, quarryMission, vergeMission } from './objectives';
import { advanceWaylight, waylightProgress } from './waylight';
import { advanceBriarStag, stagLeg, strikeBriarStag } from './briarStag';
import { RESONANCE_INFO, advanceCommandChain, commandChainResult, resonanceFor, type CommandChain, type Resonance } from './resonance';

const WORLD = 1800;
type EnemyKind = EnemySave['kind'];
type ObjectKind = ObjectSave['kind'];
const OBJECT_MOTION: Partial<Record<ObjectKind, { speed: number; lift: number; tilt: number }>> = {
  waylight: { speed: 3.6, lift: 5, tilt: 0.07 },
  moonflame: { speed: 5.3, lift: 7, tilt: 0.11 },
  stag: { speed: 7, lift: 3, tilt: 0.035 },
  seedheart: { speed: 2.1, lift: 2, tilt: 0.025 },
  bloom: { speed: 2.5, lift: 3, tilt: 0.045 },
};
interface Enemy {
  sprite: Phaser.GameObjects.Image; kind: EnemyKind; hp: number; maxHp: number;
  speed: number; damage: number; radius: number; phase: number; pendingDamage: number; damageClock: number;
  burnRemaining: number; burnTickClock: number; burnDamage: number; burnSource?: Weapon;
  tangleRemaining: number;
  strike?: BossStrikeState & { ring?: Phaser.GameObjects.Arc };
  lance?: WispLanceState & { marker?: Phaser.GameObjects.Graphics };
}
interface WorldObject { view: Phaser.GameObjects.Container; image: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; kind: ObjectKind; x: number; y: number; hp: number; maxHp: number; active: boolean; ring?: Phaser.GameObjects.Arc; hazardPhase?: VentPhase }
interface Orb { view: Phaser.GameObjects.Container; x: number; y: number; value: number }
interface Cache { view: Phaser.GameObjects.Container; x: number; y: number; stat: Stat }
interface EquippedWeapon { id: Weapon; rank: number; cooldown: number; path?: WeaponPath; commandCooldown?: number }
interface EmberField { x: number; y: number; remaining: number; tickClock: number; damage: number; view: Phaser.GameObjects.Arc }

export interface HudState {
  health: number; maxHealth: number; level: number; xp: number; xpNeeded: number;
  kills: number; seconds: number; stageSeconds: number; region: number;
  stats: Stats; bossHp: number | null; bossMaxHp: number | null;
  weapons: EquippedWeapon[]; weaponSlots: number; focusedWeapon: Weapon; weaponDamage: Record<Weapon, number>;
  commandChain: CommandChain | null; possibleResonances: { weapon: Weapon; resonance: Resonance }[];
  special: string; specialCooldown: number;
  objectivesLeft: number; stepTargetsLeft: number; stepProgress: number; objectiveProgress: number; objectiveName: string | null;
  ritualActive: boolean;
  coolantCarryRemaining: number;
  surge: boolean;
  moonflowRemaining: number;
  terrainHint: string | null; markedFieldName: string | null; gateOpen: boolean; hero: Hero;
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
  private heroShadow!: Phaser.GameObjects.Ellipse;
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
  private emberFields: EmberField[] = [];
  private running = false;
  private choosing = false;
  private pausedByUser = false;
  private heroId: Hero = 'warden';
  private skin = false;
  private masteryRank = 0;
  private unlockedWeapons: Weapon[] = ['axe'];
  private weapons: EquippedWeapon[] = [{ id: 'axe', rank: 1, cooldown: 0 }];
  private focusedWeapon: Weapon = 'axe';
  private commandChain: CommandChain | null = null;
  private lastCommandAim = { x: 900, y: 900 };
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
  private attackPoseDuration = 0.16;
  private actionPose = 0;
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
  private waylightAmbush = false;
  private ritualClock = 0;
  private coolantCarryRemaining = 0;
  private moonflowRemaining = 0;
  private markedField: WorldObject | null = null;
  private fieldMarker: Phaser.GameObjects.Arc | null = null;
  private tapStart: { id: number; x: number; y: number; at: number } | null = null;
  private surgeAnnounced = false;
  private lanceIntroduced = false;
  private waylightRoute: { start: { x: number; y: number }; goal: { x: number; y: number } } | null = null;
  private stagAnchors: { x: number; y: number }[] = [];

  constructor(callbacks: GameCallbacks) { super('Grove'); this.callbacks = callbacks; }

  preload(): void {
    const base = import.meta.env.BASE_URL;
    this.load.image('tree', `${base}art/tree.png`);
    for (const key of ['warden-v4', 'ranger-v4', 'ember-v4', 'warden-attack-v1', 'ranger-attack-v1', 'ember-attack-v1',
      'waylight', 'seedheart', 'briar-stag-v1', 'root-totem', 'coolant-pump', 'coolant-spring', 'forge-core', 'moonflame',
      'moon-altar', 'mist-bloom', 'ember-vent', 'grove-gate', 'reliquary', 'fox-relic',
      'gnarl-v2', 'wisp-v2', 'brute-v2', 'briar-king-v2', 'bramble-field', 'ember-ore', 'moonstone']) {
      this.load.image(key, `${base}art/${key}.webp`);
    }
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, WORLD, WORLD);
    this.heroShadow = this.add.ellipse(900, 943, 63, 21, 0x071f1c, 0.34).setDepth(3.5);
    this.hero = this.add.image(900, 900, 'warden-v4').setDisplaySize(104, 104).setDepth(5);
    this.nav = this.add.text(900, 820, '', { fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#fff0bc', stroke: '#18372d', strokeThickness: 4 }).setOrigin(0.5).setDepth(12);
    this.petView = this.add.circle(900, 900, 9, 0xffe4a3).setStrokeStyle(3, 0x446c60).setDepth(7).setVisible(false);
    this.bars = this.add.graphics().setDepth(9);
    this.cameras.main.startFollow(this.hero, true, 0.14, 0.14);
    this.joystickBase = this.add.circle(0, 0, 53, 0xe9e6c6, 0.13).setStrokeStyle(2, 0xf9f0cf, 0.55).setScrollFactor(0).setDepth(100).setVisible(false);
    this.joystickNub = this.add.circle(0, 0, 23, 0xf8e8b0, 0.45).setStrokeStyle(2, 0xffffff, 0.7).setScrollFactor(0).setDepth(101).setVisible(false);
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,F,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    this.cursors = this.input.keyboard?.createCursorKeys() as Phaser.Types.Input.Keyboard.CursorKeys;
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUp, this);
    this.publishHud();
  }

  beginRun(hero: Hero, startingWeapon: Weapon, masteryRank: number, unlockedWeapons: Weapon[], reducedEffects: boolean, skin = false, autoSpecialEnabled = true, supportWeapon?: Weapon, seedOverride?: number): void {
    if (!this.hero) return;
    clearRunSnapshot();
    this.clearRunObjects();
    this.seed = seedOverride !== undefined && Number.isInteger(seedOverride) && seedOverride > 0 && seedOverride <= 0xffffffff
      ? seedOverride : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0 || 1;
    this.random = new Rng(this.seed);
    this.heroId = hero; this.skin = skin; this.masteryRank = masteryRank;
    this.unlockedWeapons = unlockedWeapons;
    this.weapons = [{ id: startingWeapon, rank: 1, cooldown: 0 }];
    if (supportWeapon && supportWeapon !== startingWeapon && unlockedWeapons.includes(supportWeapon))
      this.weapons.push({ id: supportWeapon, rank: 1, cooldown: WEAPON_INFO[supportWeapon].cooldown * 0.4 });
    this.focusedWeapon = startingWeapon;
    this.commandChain = null;
    this.weaponSlots = masteryRank >= 4 ? 3 : 2;
    this.splashBonus = 0; this.pet = false; this.petClock = 0;
    this.autoSpecial = masteryRank >= 5 && autoSpecialEnabled; this.specialCooldown = 0; this.reducedEffects = reducedEffects;
    this.stats = baseStatsFor(hero, masteryRank);
    this.metrics = emptyRunMetrics();
    this.health = this.stats.maxHealth;
    this.xp = 0; this.level = 1; this.kills = 0; this.seconds = 0; this.region = 0;
    this.attackPose = 0; this.actionPose = 0; this.slowed = false;
    this.choosing = false; this.pausedByUser = false; this.upgradeOptions = [];
    this.hero.setTexture(`${hero}-v4`).setTint(skin ? 0xf3d28a : 0xffffff).setPosition(900, 900).setAlpha(1).setDisplaySize(104, 104);
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
    this.commandChain = snapshot.commandChain ?? null;
    this.weaponSlots = snapshot.weaponSlots; this.splashBonus = snapshot.splashBonus;
    this.pet = snapshot.pet; this.petClock = snapshot.petClock; this.autoSpecial = snapshot.autoSpecial;
    this.specialCooldown = snapshot.specialCooldown; this.reducedEffects = snapshot.reducedEffects;
    this.stats = { ...snapshot.stats }; this.health = snapshot.health; this.xp = snapshot.xp;
    this.metrics = { ...snapshot.metrics, regionSeconds: [...snapshot.metrics.regionSeconds] as RunMetrics['regionSeconds'] };
    this.level = snapshot.level; this.kills = snapshot.kills; this.seconds = snapshot.seconds;
    this.region = snapshot.region; this.stageSeconds = snapshot.stageSeconds;
    this.surgeAnnounced = wildSurge(this.region, this.stageSeconds, REGIONS[this.region].duration);
    this.lanceIntroduced = this.region > 0 && (snapshot.metrics.lancesEvaded ?? 0) + (snapshot.metrics.lanceHits ?? 0) > 0;
    this.spawnClock = snapshot.spawnClock; this.cacheClock = snapshot.cacheClock;
    this.invulnerability = snapshot.invulnerability;
    this.attackPose = 0; this.actionPose = 0; this.slowed = false;
    this.gatekeeperSpawned = snapshot.gatekeeperSpawned; this.bossSpawned = snapshot.bossSpawned;
    this.choosing = snapshot.choosing; this.upgradeOptions = [...snapshot.upgradeOptions];
    this.hero.setTexture(`${this.heroId}-v4`).setTint(this.skin ? 0xf3d28a : 0xffffff)
      .setPosition(snapshot.x, snapshot.y).setAlpha(1).setDisplaySize(104, 104);
    this.waylightAmbush = snapshot.waylightAmbush ?? false;
    this.ritualClock = snapshot.ritualClock ?? 0;
    this.coolantCarryRemaining = snapshot.coolantCarryRemaining ?? 0;
    this.moonflowRemaining = snapshot.moonflowRemaining ?? 0;
    this.drawRegion(snapshot.objects.some(object => object.kind === 'waylight'));
    snapshot.objects.forEach(object => this.spawnObject(object.kind, object.x, object.y, object.hp, object.maxHp, object.active));
    const spring = this.objects.find(object => object.kind === 'coolant');
    const deliveryForge = this.objects.find(object => object.kind === 'forge' && object.maxHp <= 3 && object.hp > 0);
    if (spring && deliveryForge && !spring.active && !deliveryForge.active) {
      spring.hp = 2; spring.active = true; spring.view.setAlpha(1); spring.ring?.setVisible(true);
      spring.label.setText('FILL FLASK · 0/2s'); this.coolantCarryRemaining = 0;
    }
    if (snapshot.markedFieldIndex !== undefined) {
      const field = this.objects[snapshot.markedFieldIndex];
      if (field?.active && this.isTerrainField(field)) this.markField(field, false);
    }
    snapshot.enemies.forEach(enemy => this.spawnEnemy(enemy.kind, { x: enemy.x, y: enemy.y }, enemy));
    snapshot.emberFields?.forEach(field => this.spawnEmberField(field.x, field.y, field.damage, field.remaining, field.tickClock));
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
    } else if (choice.startsWith('path:')) {
      const [, id, path] = choice.split(':') as ['path', Weapon, WeaponPath];
      const equipped = this.weapons.find(item => item.id === id);
      if (equipped && equipped.rank >= 2 && !equipped.path) equipped.path = path;
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
    if (!this.running || this.choosing || this.pausedByUser) return;
    const equipped = this.weapons.find(item => item.id === weapon);
    if (!equipped) return;
    this.focusedWeapon = weapon;
    if ((equipped.commandCooldown ?? 0) <= 0 && this.autoAttack(equipped, true)) {
      equipped.commandCooldown = 8;
      if (this.running) {
        const outcome = commandChainResult(this.commandChain, weapon);
        this.commandChain = outcome.chain;
        if (outcome.resonance) this.fireResonance(outcome.resonance, weapon);
        else this.callbacks.onEvent(`${WEAPON_COMMAND[weapon].name.toUpperCase()} · CHAIN ANOTHER SLOT`);
      }
    } else this.callbacks.onEvent((equipped.commandCooldown ?? 0) > 0
      ? `${WEAPON_INFO[weapon].name.toUpperCase()} FOCUSED · ${Math.ceil(equipped.commandCooldown ?? 0)}s TO CHARGE`
      : `${WEAPON_INFO[weapon].name.toUpperCase()} FOCUSED · MOVE INTO RANGE TO FIRE`);
    this.publishHud(); this.saveSnapshot();
  }

  upgradeInfo(choice: Upgrade): { name: string; icon: string; color: string; description: string } {
    if (STAT_KEYS.includes(choice as Stat)) return STAT_INFO[choice as Stat];
    if (choice.startsWith('path:')) {
      const [, id, path] = choice.split(':') as ['path', Weapon, WeaponPath];
      const info = WEAPON_PATH_INFO[id][path];
      return { name: info.name, icon: WEAPON_INFO[id].icon, color: WEAPON_INFO[id].color,
        description: `${WEAPON_INFO[id].name} technique · ${info.description}` };
    }
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
    for (const enemy of this.enemies) { enemy.strike?.ring?.destroy(); enemy.lance?.marker?.destroy(); }
    this.clearFieldMark();
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
    this.stats.maxHealth = 500; this.health = 500;
    for (const weapon of this.weapons) weapon.cooldown = 20;
    this.publishHud(); this.saveSnapshot();
  }

  debugClearTerrain(): void {
    if (!this.running || this.choosing) return;
    const target = this.objects.find(object => (object.kind === 'bramble' || object.kind === 'ore' || object.kind === 'moonstone') && object.active);
    if (target) this.hitObject(target, target.hp);
  }
  debugMarkTerrain(): void {
    if (!this.running || this.choosing) return;
    const target = this.objects.find(object => this.isTerrainField(object) && object.active);
    if (target) this.markField(target, true);
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
      if (target.kind === 'pump' || target.kind === 'waylight' || target.kind === 'seedheart' || target.kind === 'coolant'
        || target.kind === 'moonflame' || target.kind === 'forge' && target.maxHp <= 3 || target.kind === 'altar' && target.maxHp <= 6) {
        if (target.kind === 'coolant') this.coolantCarryRemaining = 12;
        target.hp = 0; this.completeObject(target);
      }
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
  debugMarkWisp(): void {
    if (!this.running || this.choosing) return;
    if (this.region !== 1) { this.region = 1; this.startRegion(); }
    this.clearEnemies();
    this.hero.setPosition(900, 900);
    this.spawnEnemy('wisp', { x: 750, y: 900 });
    const wisp = this.enemies[0];
    wisp.hp = 5000; wisp.maxHp = 5000; wisp.speed = 0; wisp.damage = 0;
    const lance = wisp.lance!;
    lance.cooldown = 0; lance.windup = 7;
    lance.fromX = wisp.sprite.x; lance.fromY = wisp.sprite.y;
    lance.toX = this.hero.x; lance.toY = this.hero.y;
    lance.marker = this.createWispLanceMarker(lance);
    this.callbacks.onEvent('WISP LANCE — SIDESTEP THE LINE');
    this.publishHud(); this.saveSnapshot();
  }
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
      desiredDistance: enteringGate || gathering || (target === objective && (objective.kind === 'pump'
        || objective.kind === 'coolant' || objective.kind === 'moonflame' || objective.kind === 'forge' && objective.maxHp <= 3
        || objective.kind === 'waylight' || objective.kind === 'seedheart' || objective.kind === 'stag' || objective.kind === 'altar' && objective.maxHp <= 6))
        ? 0 : Math.min(210, reach * 0.7),
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
    this.actionPose = Math.max(this.actionPose, 0.46);
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
    this.moonflowRemaining = Math.max(0, this.moonflowRemaining - dt);
    this.attackPose = Math.max(0, this.attackPose - dt);
    this.actionPose = Math.max(0, this.actionPose - dt);
    this.commandChain = advanceCommandChain(this.commandChain, dt);
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
    if (this.keys?.F && Phaser.Input.Keyboard.JustDown(this.keys.F)) {
      const field = this.objects.filter(object => this.isTerrainField(object) && object.active && object.hp > 0
        && this.distance(this.hero.x, this.hero.y, object.x, object.y) < 300)
        .sort((a, b) => this.distance(this.hero.x, this.hero.y, a.x, a.y)
          - this.distance(this.hero.x, this.hero.y, b.x, b.y))[0];
      if (field) this.toggleFieldMark(field);
    }
    for (const weapon of this.weapons) {
      weapon.commandCooldown = Math.max(0, (weapon.commandCooldown ?? 0) - dt);
      weapon.cooldown -= dt;
      if (weapon.cooldown <= 0) this.autoAttack(weapon);
    }
    this.updateEmberFields(dt);
    if (!this.running) return;
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
    this.moonflowRemaining = 0;
    this.gatekeeperSpawned = false; this.bossSpawned = false;
    this.waylightAmbush = false;
    this.ritualClock = 0;
    this.coolantCarryRemaining = 0;
    this.surgeAnnounced = false; this.lanceIntroduced = false;
    this.slowed = false;
    this.hero.setPosition(900, 900);
    this.drawRegion();
    const layout = generateRegionLayout(this.seed, this.region);
    let wardIndex = 0;
    for (const clearing of layout.clearings) {
      if (clearing.kind === 'ward') {
        if (this.region === 0 && wardIndex === 0) {
          const mission = vergeMission(this.seed);
          if (mission === 'seedheart') this.spawnObject('seedheart', clearing.x, clearing.y, 15, 15, true);
          else if (mission === 'stag') this.spawnObject('stag', clearing.x, clearing.y, 330, 330, true);
          else this.spawnObject('waylight', clearing.x, clearing.y, 1, 1, true);
        }
        else if (this.region === 1) {
          const delivery = quarryMission(this.seed) === 'coolantRun';
          this.spawnObject(wardIndex === 0 ? delivery ? 'coolant' : 'pump' : 'forge', clearing.x, clearing.y,
            wardIndex === 0 ? delivery ? 2 : 240 : delivery ? 3 : 320,
            wardIndex === 0 ? delivery ? 2 : 240 : delivery ? 3 : 320, wardIndex === 0);
        }
        else if (wardIndex === 0) this.spawnObject(moonMission(this.seed) === 'moonflame' ? 'moonflame' : 'altar',
          clearing.x, clearing.y, moonMission(this.seed) === 'moonflame' ? 3 : 6,
          moonMission(this.seed) === 'moonflame' ? 3 : 6, moonMission(this.seed) === 'moonflame');
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

  private drawRegion(escort = vergeMission(this.seed) === 'waylight'): void {
    for (const decoration of this.decorations) decoration.destroy();
    this.decorations = [];
    const theme = REGIONS[this.region];
    this.cameras.main.setBackgroundColor(theme.floor);
    const rng = new Rng((this.seed ^ Math.imul(this.region + 1, 7919)) >>> 0);
    const layout = generateRegionLayout(this.seed, this.region);
    this.stagAnchors = this.region === 0 ? layout.clearings.filter(clearing => clearing.kind === 'ward' || clearing.kind === 'shrine').map(clearing => ({ x: clearing.x, y: clearing.y })) : [];
    const waypoints = layout.clearings.filter(clearing => clearing.kind === 'ward');
    this.waylightRoute = this.region === 0 && escort && waypoints.length > 1
      ? { start: { x: waypoints[0].x, y: waypoints[0].y }, goal: { x: waypoints[1].x, y: waypoints[1].y } } : null;
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
    if (this.region === 0) {
      const goal = this.waylightRoute?.goal;
      if (goal) {
        const destination = this.add.circle(goal.x, goal.y, 64, 0xfbe5a4, 0.12)
          .setStrokeStyle(6, 0xffe3a0, 0.8).setDepth(-2);
        const center = this.add.circle(goal.x, goal.y, 18, 0xfff3be, 0.6).setDepth(-1);
        this.decorations.push(destination, center);
      }
    }
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
    this.clearFieldMark();
    this.clearEnemies();
    for (const object of this.objects) object.view.destroy();
    for (const orb of this.orbs) orb.view.destroy();
    for (const cache of this.caches) { this.tweens.killTweensOf(cache.view); cache.view.destroy(); }
    for (const field of this.emberFields) { this.tweens.killTweensOf(field.view); field.view.destroy(); }
    this.objects = []; this.orbs = []; this.caches = []; this.emberFields = [];
    this.bars?.clear(); this.nav?.setText(''); this.releaseJoystick();
  }

  private clearEnemies(): void {
    for (const enemy of this.enemies) { enemy.strike?.ring?.destroy(); enemy.lance?.marker?.destroy(); enemy.sprite.destroy(); }
    this.enemies = [];
  }

  private isTerrainField(object: WorldObject): boolean {
    return object.kind === 'bramble' || object.kind === 'ore' || object.kind === 'moonstone';
  }

  private clearFieldMark(): void {
    if (this.fieldMarker) { this.tweens.killTweensOf(this.fieldMarker); this.fieldMarker.destroy(); }
    this.fieldMarker = null; this.markedField = null;
  }

  private markField(field: WorldObject, announce: boolean): void {
    this.clearFieldMark();
    this.markedField = field;
    this.fieldMarker = this.add.circle(field.x, field.y, 70, 0xffe6a5, 0.055)
      .setStrokeStyle(5, 0xffe6a5, 0.98).setDepth(6);
    if (!this.reducedEffects) this.tweens.add({ targets: this.fieldMarker, scale: 1.12,
      alpha: 0.64, yoyo: true, repeat: -1, duration: 580 });
    if (announce) {
      const burst = terrainRupture(field.kind as TerrainKind);
      this.callbacks.onEvent(`TARGET ${objectiveName(field.kind).toUpperCase()} — ${burst.name} ON BREAK`);
      this.floatText('TARGET LOCK', field.x, field.y - 78, '#ffe6a5');
      this.saveSnapshot();
    }
  }

  private toggleFieldMark(field: WorldObject): void {
    if (this.markedField === field) {
      this.clearFieldMark(); this.callbacks.onEvent('FIELD TARGET CLEARED'); this.saveSnapshot();
    } else this.markField(field, true);
  }

  private moveHero(dt: number): void {
    let dx = this.joyVector.x; let dy = this.joyVector.y;
    if (this.keys?.A?.isDown || this.cursors?.left?.isDown) dx -= 1;
    if (this.keys?.D?.isDown || this.cursors?.right?.isDown) dx += 1;
    if (this.keys?.W?.isDown || this.cursors?.up?.isDown) dy -= 1;
    if (this.keys?.S?.isDown || this.cursors?.down?.isDown) dy += 1;
    const length = Math.hypot(dx, dy);
    this.moveDirection.set(length > 0.03 ? dx / length : 0, length > 0.03 ? dy / length : 0);
    const poseTexture = `${this.heroId}-${this.actionPose > 0 ? 'attack-v1' : 'v4'}`;
    if (this.hero.texture.key !== poseTexture) this.hero.setTexture(poseTexture);
    const attackKick = this.attackPose > 0 ? Math.sin(this.attackPose / this.attackPoseDuration * Math.PI) : 0;
    if (length > 0.03) {
      const speed = this.stats.speed * (this.slowed ? 0.68 : 1) * (this.moonflowRemaining > 0 ? 1.28 : 1);
      this.hero.x = Phaser.Math.Clamp(this.hero.x + dx / Math.max(1, length) * speed * dt, 42, WORLD - 42);
      this.hero.y = Phaser.Math.Clamp(this.hero.y + dy / Math.max(1, length) * speed * dt, 42, WORLD - 42);
      if (dx !== 0) this.hero.setFlipX(dx < 0);
      this.hero.setRotation(Math.sin(this.seconds * 12) * 0.045 + attackKick * (this.hero.flipX ? -0.12 : 0.12))
        .setScale(0.36 * (1 + Math.sin(this.seconds * 12) * 0.025 + attackKick * 0.09), 0.36 * (1 - Math.sin(this.seconds * 12) * 0.025 - attackKick * 0.06));
    } else this.hero.setRotation(attackKick * (this.hero.flipX ? -0.12 : 0.12))
      .setScale(0.36 * (1 + Math.sin(this.seconds * 3) * 0.012 + attackKick * 0.09), 0.36 * (1 - attackKick * 0.06));
    this.hero.setAlpha(this.invulnerability > 0 && Math.floor(this.seconds * 18) % 2 === 0 ? 0.57 : 1);
    this.heroShadow.setPosition(this.hero.x, this.hero.y + 40).setScale(length > 0.03 ? 1.08 : 1, 1);
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
    const surge = wildSurge(this.region, this.stageSeconds, REGIONS[this.region].duration);
    if (surge && !this.surgeAnnounced) {
      this.surgeAnnounced = true;
      this.callbacks.onEvent('WILD SURGE — WISPS GATHER');
      this.floatText('WILD SURGE', this.hero.x, this.hero.y - 100, '#f7c47a');
      this.saveSnapshot();
    }
    const wavePause = !surge && this.stageSeconds % 45 > 38;
    const interval = waveInterval(this.region, this.stageSeconds, surge);
    if (!this.gatekeeperSpawned && !wavePause && this.spawnClock >= interval && this.enemies.length < 70) {
      this.spawnClock = 0;
      this.spawnEnemy(this.chooseEnemyKind());
      if (this.region > 0 && this.random.next() < (surge ? 0.55 : 0.25)) this.spawnEnemy(this.chooseEnemyKind());
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
    const surge = wildSurge(this.region, this.stageSeconds, REGIONS[this.region].duration);
    if (this.stageSeconds > 55 && roll < 0.16 + this.region * 0.05) return 'brute';
    if (this.stageSeconds > 25 && roll < 0.43 + this.region * 0.05 + (surge ? 0.16 : 0)) return 'wisp';
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
    const lance: Enemy['lance'] = kind === 'wisp' && this.region > 0 ? {
      cooldown: saved?.wispLance?.cooldown ?? 0.45 + phase * 0.18,
      windup: saved?.wispLance?.windup ?? 0,
      fromX: saved?.wispLance?.fromX ?? point.x, fromY: saved?.wispLance?.fromY ?? point.y,
      toX: saved?.wispLance?.toX ?? point.x, toY: saved?.wispLance?.toY ?? point.y,
    } : undefined;
    if (lance && lance.windup > 0) lance.marker = this.createWispLanceMarker(lance);
    this.enemies.push({ sprite, kind, hp: saved?.hp ?? hp, maxHp: hp,
      speed: values.speed + (kind === 'boss' ? phase * 10 : 0),
      damage: values.damage + (kind === 'boss' ? phase * 3 : 0),
      radius: values.radius, phase, pendingDamage: 0, damageClock: 0,
      burnRemaining: saved?.burnRemaining ?? 0, burnTickClock: saved?.burnTickClock ?? 0,
      burnDamage: saved?.burnDamage ?? 0, burnSource: saved?.burnSource,
      tangleRemaining: saved?.tangleRemaining ?? 0, strike, lance });
  }

  private updateEnemies(dt: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      const wasTangled = enemy.tangleRemaining > 0;
      enemy.tangleRemaining = Math.max(0, enemy.tangleRemaining - dt);
      if (wasTangled && enemy.tangleRemaining === 0) enemy.sprite.setTint(enemy.burnRemaining > 0 ? 0xffae72
        : enemy.kind === 'gatekeeper' ? 0xf1bd8d : this.region === 2 && enemy.kind === 'wisp' ? 0xb2e4e6 : 0xffffff);
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
      if (distance > enemy.radius + 16 && !(enemy.lance && enemy.lance.windup > 0)) {
        const weave = enemy.kind === 'wisp' ? Math.sin(this.seconds * 7 + enemy.phase) * 0.32 : 0;
        const fieldSpeed = enemyFieldModifiers(enemy.sprite.x, enemy.sprite.y, this.objects).speed
          * (enemy.tangleRemaining > 0 ? enemy.kind === 'boss' || enemy.kind === 'gatekeeper' ? 0.55 : 0.22 : 1);
        enemy.sprite.x += (dx / distance - dy / distance * weave) * enemy.speed * fieldSpeed * dt;
        enemy.sprite.y += (dy / distance + dx / distance * weave) * enemy.speed * fieldSpeed * dt;
      } else if (distance <= enemy.radius + 16 && this.invulnerability <= 0) this.takeDamage(enemy.damage);
      if (!this.running) break;
      enemy.sprite.setFlipX(dx < 0);
      enemy.sprite.setRotation(Math.sin(this.seconds * (enemy.kind === 'wisp' ? 8 : 3) + enemy.phase) * 0.055);
      if (enemy.pendingDamage > 0) {
        enemy.damageClock -= dt;
        if (enemy.damageClock <= 0) this.flushDamage(enemy);
      }
      if (enemy.strike) this.updateBossStrike(enemy, dt);
      if (enemy.lance) this.updateWispLance(enemy, dt);
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

  private createWispLanceMarker(lance: WispLanceState): Phaser.GameObjects.Graphics {
    const marker = this.add.graphics().setDepth(3);
    marker.lineStyle(WISP_LANCE_WIDTH * 2, 0x681e3a, 0.38);
    marker.lineBetween(lance.fromX, lance.fromY, lance.toX, lance.toY);
    marker.lineStyle(11, 0xf06573, 0.84);
    marker.lineBetween(lance.fromX, lance.fromY, lance.toX, lance.toY);
    marker.lineStyle(3, 0xffdfaa, 0.96);
    marker.lineBetween(lance.fromX, lance.fromY, lance.toX, lance.toY);
    marker.fillStyle(0xff6277, 0.9);
    marker.fillCircle(lance.toX, lance.toY, 7);
    return marker;
  }

  private updateWispLance(wisp: Enemy, dt: number): void {
    const lance = wisp.lance!;
    if (lance.windup > 0) {
      lance.windup = Math.max(0, lance.windup - dt);
      if (!this.reducedEffects) lance.marker?.setAlpha(0.72 + Math.sin(this.seconds * 20) * 0.24);
      if (lance.windup > 0) return;
      lance.marker?.destroy(); lance.marker = undefined;
      const beam = this.add.graphics().setDepth(8);
      beam.lineStyle(WISP_LANCE_WIDTH * 2, 0xffad5e, 0.42)
        .lineBetween(lance.fromX, lance.fromY, lance.toX, lance.toY);
      beam.lineStyle(10, 0xfff1c3, 0.95)
        .lineBetween(lance.fromX, lance.fromY, lance.toX, lance.toY);
      this.tweens.add({ targets: beam, alpha: 0, duration: this.reducedEffects ? 90 : 220,
        onComplete: () => beam.destroy() });
      if (insideWispLance({ x: this.hero.x, y: this.hero.y }, lance)) {
        if (this.invulnerability <= 0) {
          this.metrics.lanceHits = (this.metrics.lanceHits ?? 0) + 1;
          this.takeDamage(wispLanceDamage(this.region, this.stageSeconds));
        }
      } else {
        this.metrics.lancesEvaded = (this.metrics.lancesEvaded ?? 0) + 1;
        this.floatText('SIDESTEP', this.hero.x, this.hero.y - 55, '#bdf3cf');
      }
      lance.cooldown = wispLanceCooldown(this.region, this.stageSeconds);
      this.saveSnapshot();
      return;
    }
    lance.cooldown = Math.max(0, lance.cooldown - dt);
    if (lance.cooldown > 0 || this.gatekeeperSpawned || this.enemies.filter(enemy => (enemy.lance?.windup ?? 0) > 0).length >= 2) return;
    const distance = this.distance(wisp.sprite.x, wisp.sprite.y, this.hero.x, this.hero.y);
    if (distance < 125 || distance > 510) return;
    const target = wispLanceTarget({ x: this.hero.x, y: this.hero.y }, this.moveDirection, this.stats.speed);
    lance.fromX = wisp.sprite.x; lance.fromY = wisp.sprite.y;
    lance.toX = target.x; lance.toY = target.y;
    lance.windup = WISP_LANCE_WINDUP;
    lance.marker = this.createWispLanceMarker(lance);
    if (!this.lanceIntroduced) {
      this.lanceIntroduced = true;
      this.callbacks.onEvent('WISP LANCE — SIDESTEP THE LINE');
    }
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

  private autoAttack(weapon: EquippedWeapon, commanded = false): boolean {
    const info = WEAPON_INFO[weapon.id];
    const path = weaponPathEffects(weapon.id, weapon.path);
    const focused = this.focusedWeapon === weapon.id;
    const range = info.range * this.stats.reach * (commanded ? weapon.id === 'bow' ? 2.05 : 1.38 : 1);
    const targetObjects = this.objects.filter(candidate => candidate.active && candidate.hp > 0
      && candidate.kind !== 'pump' && candidate.kind !== 'waylight' && candidate.kind !== 'seedheart'
      && candidate.kind !== 'coolant' && candidate.kind !== 'moonflame' && !(candidate.kind === 'forge' && candidate.maxHp <= 3)
      && !(candidate.kind === 'altar' && candidate.maxHp <= 6));
    const markedIndex = this.markedField?.active && this.markedField.hp > 0
      && this.distance(this.hero.x, this.hero.y, this.markedField.x, this.markedField.y) < range
      ? targetObjects.indexOf(this.markedField) : -1;
    const stagIndex = targetObjects.findIndex(candidate => candidate.kind === 'stag'
      && this.distance(this.hero.x, this.hero.y, candidate.x, candidate.y) < range);
    const selection = markedIndex >= 0 ? { kind: 'object' as const, index: markedIndex }
      : stagIndex >= 0 ? { kind: 'object' as const, index: stagIndex }
      : chooseAutoTarget({ x: this.hero.x, y: this.hero.y }, range,
        this.enemies.map(enemy => ({ x: enemy.sprite.x, y: enemy.sprite.y })), targetObjects);
    const target: Enemy | null = selection?.kind === 'enemy' ? this.enemies[selection.index] : null;
    const object: WorldObject | null = selection?.kind === 'object' ? targetObjects[selection.index] : null;
    if (!target && !object) { if (!commanded) weapon.cooldown = 0.12; return false; }
    weapon.cooldown = info.cooldown * (focused && weapon.id === 'bow' ? 0.78 : 1);
    soundFx.play(weapon.id === 'axe' ? 'swing' : weapon.id === 'thorns' ? 'dart' : weapon.id === 'bow' ? 'bow' : 'staff');
    this.attackPose = 0.16; this.attackPoseDuration = 0.16;
    if (weapon.id === HERO_INFO[this.heroId].weapon) this.actionPose = Math.max(this.actionPose, commanded ? 0.42 : 0.24);
    const x = target?.sprite.x ?? object!.x; const y = target?.sprite.y ?? object!.y;
    if (commanded) this.lastCommandAim = { x, y };
    this.hero.setFlipX(x < this.hero.x);
    const angle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, x, y);
    const critical = weapon.id === 'bow' && (commanded || this.random.next() < bowCriticalChance(weapon.rank) + (focused ? 0.12 : 0));
    const focusBonus = this.weapons.length < 2 ? 1 : this.focusedWeapon === weapon.id ? 1.25 : 0.9;
    const damage = Math.round(weaponDamage(this.stats.attack, weapon.id, weapon.rank) * focusBonus * (critical ? 1.7 : 1)
      * (commanded ? weapon.id === 'bow' ? 2.35 : 2 : 1));
    if (commanded) {
      const pulse = this.add.circle(this.hero.x, this.hero.y, 23, Phaser.Display.Color.HexStringToColor(info.color).color, 0.18)
        .setStrokeStyle(5, Phaser.Display.Color.HexStringToColor(info.color).color, 0.9).setDepth(7);
      this.tweens.add({ targets: pulse, scale: 3.8, alpha: 0, duration: this.reducedEffects ? 150 : 330,
        onComplete: () => pulse.destroy() });
      this.floatText(`${WEAPON_COMMAND[weapon.id].name.toUpperCase()}!`, this.hero.x, this.hero.y - 72, info.color);
      this.attackPose = 0.3; this.attackPoseDuration = 0.3;
    }
    const otherEnemies = target && (weapon.id === 'thorns' || path.pierce > 0)
      ? this.enemies.filter(enemy => enemy !== target) : [];
    const pierced = target && (weapon.id === 'thorns' || path.pierce > 0)
      ? pierceTargets({ x: this.hero.x, y: this.hero.y }, { x, y }, range,
        otherEnemies.map(enemy => ({ x: enemy.sprite.x, y: enemy.sprite.y })),
        weapon.id === 'thorns' ? thornPierceCount(weapon.rank) + (focused ? 1 : 0) + (commanded ? 2 : 0) : path.pierce + (commanded ? 2 : 0))
        .map(index => otherEnemies[index]) : [];
    if (weapon.id === 'axe') {
      const slash = this.add.graphics().setDepth(8);
      const radius = 57 + this.splashBonus * 0.35 + (weapon.rank >= 2 ? 14 : 0) + (focused ? 22 : 0) + path.splash * 0.5 + (commanded ? 30 : 0);
      slash.lineStyle(24, weapon.path === 'a' ? 0xcdf7dc : 0xffe2ab, 0.14).beginPath()
        .arc(this.hero.x, this.hero.y, radius, angle - 0.8, angle + 0.8).strokePath();
      slash.lineStyle(7, weapon.path === 'a' ? 0xe2ffeb : weapon.path === 'b' ? 0xffbd9a : 0xfff0c4, 0.9).beginPath()
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
      this.tweens.add({ targets: arrow, x: pierced.at(-1)?.sprite.x ?? x, y: pierced.at(-1)?.sprite.y ?? y,
        alpha: 0, duration: 165, onComplete: () => arrow.destroy() });
    } else {
      const orb = this.add.circle(this.hero.x, this.hero.y, 12, this.skin ? 0xffd37a : 0xff9d65)
        .setStrokeStyle(3, 0xffe2a7, 0.9).setDepth(8);
      this.tweens.add({ targets: orb, x, y, alpha: 0, duration: 190, onComplete: () => orb.destroy() });
      if (!this.reducedEffects) {
        const flare = this.add.circle(x, y, 12, 0xffb376, 0.22).setStrokeStyle(3, 0xffc58c, 0.7).setDepth(7);
        this.tweens.add({ targets: flare, scale: weapon.path === 'a' ? 5 : 4, alpha: 0,
          duration: 310, onComplete: () => flare.destroy() });
      }
    }
    if (target) {
      const splash = weaponSplash(weapon.id, this.splashBonus, weapon.rank)
        + (focused && (weapon.id === 'axe' || weapon.id === 'staff') ? weapon.id === 'axe' ? 22 : 25 : 0)
        + path.splash + (commanded && (weapon.id === 'axe' || weapon.id === 'staff') ? 45 : 0);
      const victims = splash > 0 ? this.enemies.filter(enemy => this.distance(enemy.sprite.x, enemy.sprite.y, x, y) < splash) : [target];
      for (const enemy of victims) {
        const elite = enemy.kind === 'brute' || enemy.kind === 'gatekeeper' || enemy.kind === 'boss';
        this.hitEnemy(enemy, Math.round(damage * (elite ? path.eliteMultiplier : 1)
          * (commanded && weapon.id === 'bow' && elite && enemy === target ? 1.35 : 1)), false, weapon.id);
        if (!this.running) return true;
        if (elite && path.eliteMultiplier > 1 && enemy === target) this.floatText('BREAKER', x, y - 58, '#ffc49b');
        if (path.rootSeconds > 0) this.entangleEnemy(enemy, path.rootSeconds);
        if (weapon.id === 'staff') {
          const burn = staffBurn(weapon.rank, damage);
          this.ignite(enemy, burn.seconds + (focused ? 1 : 0) + path.burnSeconds, burn.tickDamage, weapon.id);
        }
        if (weapon.id === 'axe' && weapon.rank >= 3 && this.enemies.includes(enemy)
          && enemy.kind !== 'boss' && enemy.kind !== 'gatekeeper') {
          const pushAngle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.sprite.x, enemy.sprite.y);
          enemy.sprite.setPosition(Phaser.Math.Clamp(enemy.sprite.x + Math.cos(pushAngle) * 48, 36, WORLD - 36),
            Phaser.Math.Clamp(enemy.sprite.y + Math.sin(pushAngle) * 48, 36, WORLD - 36));
        }
      }
      for (const [index, enemy] of pierced.entries()) {
        const falloff = weapon.id === 'bow' ? 0.7 : weapon.rank >= 3 ? 0.8 : weapon.rank >= 2 ? 0.72 : 0.65;
        this.hitEnemy(enemy, Math.round(damage * falloff ** (index + 1)), false, weapon.id);
        if (!this.running) return true;
        if (path.rootSeconds > 0) this.entangleEnemy(enemy, path.rootSeconds);
      }
      if (pierced.length > 0 && weapon.rank >= 2 && !this.reducedEffects) {
        this.floatText(`${weapon.id === 'bow' ? 'SUNLANCE' : 'PIERCE'} ×${pierced.length}`,
          x, y - 63, weapon.id === 'bow' ? '#fff0ae' : '#c9f3aa');
      }
      if (weapon.id === 'bow' && path.pierce > 0 && pierced.length > 0 && !this.reducedEffects)
        this.trail(x, y, pierced.at(-1)!.sprite.x, pierced.at(-1)!.sprite.y, 0xffefad);
      if (weapon.id === 'thorns' && path.split > 0) {
        const candidates = this.enemies.filter(enemy => enemy !== target && !pierced.includes(enemy));
        const splitIndex = ricochetTarget({ x, y }, candidates.map(enemy => ({ x: enemy.sprite.x, y: enemy.sprite.y })), 175);
        if (splitIndex !== null) {
          const split = candidates[splitIndex];
          if (!this.reducedEffects) this.trail(x, y, split.sprite.x, split.sprite.y, 0xbaf19b);
          this.hitEnemy(split, Math.round(damage * path.split), false, weapon.id);
          if (!this.running) return true;
          this.floatText('SPLIT', split.sprite.x, split.sprite.y - 50, '#c9f3aa');
        }
      }
      if (weapon.id === 'bow' && weapon.rank >= 3) {
        const others = this.enemies.filter(enemy => enemy !== target);
        const ricochet = ricochetTarget({ x, y }, others.map(enemy => ({ x: enemy.sprite.x, y: enemy.sprite.y })));
        if (ricochet !== null) {
          const bounce = others[ricochet];
          if (!this.reducedEffects) this.trail(x, y, bounce.sprite.x, bounce.sprite.y, 0xffe1a5);
          this.hitEnemy(bounce, Math.round(damage * 0.5), false, weapon.id);
          if (!this.running) return true;
          if (!this.reducedEffects) this.floatText('RICOCHET', bounce.sprite.x, bounce.sprite.y - 52, '#ffe3a3');
        }
      }
      if (weapon.id === 'bow' && path.flareRadius > 0 && critical) {
        const flare = this.add.circle(x, y, 18, 0xffd280, 0.24)
          .setStrokeStyle(5, 0xfff0b4, 0.95).setDepth(7);
        this.tweens.add({ targets: flare, scale: path.flareRadius / 18, alpha: 0,
          duration: this.reducedEffects ? 150 : 300, onComplete: () => flare.destroy() });
        for (const enemy of [...this.enemies]) {
          if (enemy !== target && this.distance(enemy.sprite.x, enemy.sprite.y, x, y) < path.flareRadius) {
            this.hitEnemy(enemy, Math.round(damage * 0.55), false, weapon.id);
            if (!this.running) return true;
          }
        }
        this.floatText('FLARE', x, y - 68, '#fff0af');
      }
      if (splash > 0) {
        for (const nearby of this.objects.filter(item => item.active && item.hp > 0 && item.kind !== 'waylight' && item.kind !== 'seedheart'
          && item.kind !== 'coolant' && item.kind !== 'moonflame' && !(item.kind === 'forge' && item.maxHp <= 3)
          && !(item.kind === 'altar' && item.maxHp <= 6)
          && this.distance(item.x, item.y, x, y) < splash)) {
          this.hitObject(nearby, damage);
        }
      }
    } else if (object) this.hitObject(object, damage);
    if (commanded && this.running) this.applyWeaponCommand(weapon.id, { x, y }, damage);
    if (critical) this.floatText(commanded ? 'DAWNSHOT!' : 'CRITICAL!', x, y - 61, '#fff1a7');
    if (!this.reducedEffects) this.burst(x, y, info.color, 3);
    return true;
  }

  private applyWeaponCommand(weapon: Weapon, aim: { x: number; y: number }, damage: number): void {
    const origin = { x: this.hero.x, y: this.hero.y };
    if (weapon === 'bow') {
      this.trail(origin.x, origin.y, aim.x, aim.y, 0xffed9c);
      return;
    }
    if (weapon === 'staff') {
      this.spawnEmberField(aim.x, aim.y, Math.max(4, Math.round(damage * 0.23)));
      this.floatText('BURNING GROUND · 4s', aim.x, aim.y - 66, '#ffca93');
      return;
    }
    const candidates = [...this.enemies];
    const range = (weapon === 'axe' ? 185 : 325) * this.stats.reach;
    const arc = weapon === 'axe' ? 1.25 : 0.67;
    const picked = targetsInArc(origin, aim, candidates.map(enemy => ({ x: enemy.sprite.x, y: enemy.sprite.y })),
      range, arc, weapon === 'axe' ? candidates.length : 6);
    const angle = Phaser.Math.Angle.Between(origin.x, origin.y, aim.x, aim.y);
    if (weapon === 'axe') {
      const sweep = this.add.graphics().setDepth(9);
      sweep.lineStyle(25, 0xffe2a0, 0.18).beginPath().arc(origin.x, origin.y, range, angle - arc, angle + arc).strokePath();
      sweep.lineStyle(7, 0xfff3c7, 0.94).beginPath().arc(origin.x, origin.y, range, angle - arc, angle + arc).strokePath();
      this.tweens.add({ targets: sweep, alpha: 0, duration: this.reducedEffects ? 130 : 300, onComplete: () => sweep.destroy() });
    }
    for (const index of picked) {
      const enemy = candidates[index];
      if (!this.enemies.includes(enemy)) continue;
      const x = enemy.sprite.x; const y = enemy.sprite.y;
      if (weapon === 'thorns' && !this.reducedEffects) this.trail(origin.x, origin.y, x, y, 0xb8f3a7);
      this.hitEnemy(enemy, Math.max(1, Math.round(damage * (weapon === 'axe' ? 0.48 : 0.42))), true, weapon);
      if (!this.running) return;
      if (!this.enemies.includes(enemy)) continue;
      if (weapon === 'thorns') this.entangleEnemy(enemy, 1.8);
      else {
        const push = enemy.kind === 'boss' || enemy.kind === 'gatekeeper' ? 24 : 75;
        enemy.sprite.setPosition(Phaser.Math.Clamp(x + Math.cos(angle) * push, 45, WORLD - 45),
          Phaser.Math.Clamp(y + Math.sin(angle) * push, 45, WORLD - 45));
      }
    }
    if (picked.length > 0) this.floatText(weapon === 'axe' ? `SWEEP ×${picked.length}` : `ROOTED ×${picked.length}`,
      aim.x, aim.y - 68, weapon === 'axe' ? '#ffe6ae' : '#c2f4ad');
  }

  private fireResonance(resonance: Resonance, source: Weapon): void {
    const info = RESONANCE_INFO[resonance];
    const center = info.center === 'hero' ? { x: this.hero.x, y: this.hero.y } : this.lastCommandAim;
    const victims = [...this.enemies].filter(enemy => this.distance(enemy.sprite.x, enemy.sprite.y, center.x, center.y) < info.radius)
      .sort((a, b) => this.distance(a.sprite.x, a.sprite.y, center.x, center.y)
        - this.distance(b.sprite.x, b.sprite.y, center.x, center.y))
      .slice(0, info.maxTargets);
    const tint = Phaser.Display.Color.HexStringToColor(info.color).color;
    const ring = this.add.circle(center.x, center.y, Math.min(80, info.radius * 0.5), tint, this.reducedEffects ? 0.06 : 0.13)
      .setStrokeStyle(6, tint, 0.9).setDepth(8);
    this.tweens.add({ targets: ring, scale: info.radius / Math.min(80, info.radius * 0.5), alpha: 0,
      duration: this.reducedEffects ? 180 : 430, onComplete: () => ring.destroy() });
    this.burst(center.x, center.y, info.color, resonance === 'needleRain' ? 5 : 13);
    this.floatText(`${info.name.toUpperCase()} ×${victims.length}`, center.x, center.y - 94, info.color);
    this.callbacks.onEvent(`${info.name.toUpperCase()} · ${info.description.toUpperCase()}`);
    this.metrics.resonances = (this.metrics.resonances ?? 0) + 1;
    for (const enemy of victims) {
      if (!this.enemies.includes(enemy)) continue;
      if (resonance === 'needleRain' && !this.reducedEffects)
        this.trail(center.x, center.y - 70, enemy.sprite.x, enemy.sprite.y, tint);
      const elite = enemy.kind === 'brute' || enemy.kind === 'gatekeeper' || enemy.kind === 'boss';
      this.hitEnemy(enemy, Math.round(this.stats.attack * info.damageScale * (elite ? info.eliteScale : 1)), false, source);
      if (!this.running) return;
      if (!this.enemies.includes(enemy)) continue;
      if (info.rootSeconds > 0) this.entangleEnemy(enemy, info.rootSeconds);
      if (info.burnSeconds > 0)
        this.ignite(enemy, info.burnSeconds, Math.max(3, Math.round(this.stats.attack * 0.35)), source);
      if (info.push > 0) {
        const angle = Phaser.Math.Angle.Between(center.x, center.y, enemy.sprite.x, enemy.sprite.y);
        enemy.sprite.setPosition(Phaser.Math.Clamp(enemy.sprite.x + Math.cos(angle) * info.push, 45, WORLD - 45),
          Phaser.Math.Clamp(enemy.sprite.y + Math.sin(angle) * info.push, 45, WORLD - 45));
      }
    }
  }

  private spawnEmberField(x: number, y: number, damage: number, remaining = 4, tickClock = 0.5): void {
    if (this.emberFields.length >= 3) {
      const expired = this.emberFields.shift()!;
      this.tweens.killTweensOf(expired.view); expired.view.destroy();
    }
    const view = this.add.circle(x, y, 112, 0xff9d5e, this.reducedEffects ? 0.08 : 0.15)
      .setStrokeStyle(5, 0xffc487, 0.8).setDepth(1);
    if (!this.reducedEffects) this.tweens.add({ targets: view, scale: 1.07, yoyo: true, repeat: -1, duration: 580 });
    this.emberFields.push({ x, y, remaining, tickClock, damage, view });
    soundFx.play('staff');
  }

  private updateEmberFields(dt: number): void {
    for (let i = this.emberFields.length - 1; i >= 0; i--) {
      const field = this.emberFields[i];
      const step = advanceEmberField(field.remaining, field.tickClock, dt);
      field.remaining = step.remaining; field.tickClock = step.tickClock;
      if (step.ticks > 0) {
        for (const enemy of [...this.enemies]) {
          if (this.distance(enemy.sprite.x, enemy.sprite.y, field.x, field.y) < 112) {
            this.hitEnemy(enemy, field.damage, true, 'staff');
            if (!this.running) return;
          }
        }
        if (!this.reducedEffects) this.burst(field.x, field.y, '#ffad70', 2);
      }
      field.view.setAlpha(Math.min(1, field.remaining));
      if (field.remaining <= 0) {
        this.tweens.killTweensOf(field.view); field.view.destroy(); this.emberFields.splice(i, 1);
      }
    }
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
        : enemy.tangleRemaining > 0 ? 0xb9ed9f
        : enemy.kind === 'gatekeeper' ? 0xf1bd8d
          : this.region === 2 && enemy.kind === 'wisp' ? 0xb2e4e6 : 0xffffff);
    });
    if (enemy.hp > 0) {
      if (enemy.kind === 'boss') this.updateBossPhase(enemy);
      return;
    }
    this.flushDamage(enemy);
    const x = enemy.sprite.x; const y = enemy.sprite.y;
    const ashHeal = weaponPathEffects('staff', this.weapons.find(item => item.id === 'staff')?.path).healOnBurnKill;
    if (ashHeal > 0 && enemy.burnRemaining > 0 && this.health < this.stats.maxHealth) {
      const restored = Math.min(ashHeal, this.stats.maxHealth - this.health);
      this.health += restored;
      this.floatText(`+${Math.ceil(restored)} ASH`, this.hero.x, this.hero.y - 67, '#f9c8a5');
    }
    enemy.strike?.ring?.destroy(); enemy.lance?.marker?.destroy(); enemy.sprite.destroy(); this.enemies.splice(this.enemies.indexOf(enemy), 1);
    this.kills++;
    const rite = this.objects.find(object => object.kind === 'altar' && object.active && object.hp > 0 && object.maxHp <= 6);
    if (rite && this.distance(x, y, rite.x, rite.y) < 250) {
      rite.hp = Math.max(0, rite.hp - 1);
      this.floatText('MOON SPARK', x, y - 55, '#d9ccff');
      rite.label.setText(`MOON RITE · ${rite.maxHp - rite.hp}/${rite.maxHp}`);
      if (rite.hp <= 0) this.completeObject(rite);
    }
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

  private entangleEnemy(enemy: Enemy, seconds: number): void {
    if (!this.enemies.includes(enemy)) return;
    const fresh = enemy.tangleRemaining <= 0;
    enemy.tangleRemaining = Math.max(enemy.tangleRemaining, seconds);
    if (enemy.lance) {
      enemy.lance.marker?.destroy(); enemy.lance.marker = undefined;
      enemy.lance.windup = 0;
      enemy.lance.cooldown = Math.max(enemy.lance.cooldown, seconds);
    }
    enemy.sprite.setTint(0xb9ed9f);
    if (fresh && !this.reducedEffects) {
      const ring = this.add.circle(enemy.sprite.x, enemy.sprite.y, enemy.radius + 11, 0xb9ed9f, 0.1)
        .setStrokeStyle(3, 0xc9f5ac, 0.86).setDepth(7);
      this.tweens.add({ targets: ring, scale: 1.35, alpha: 0, duration: 350, onComplete: () => ring.destroy() });
    }
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
      ward: 'root-totem', waylight: 'waylight', seedheart: 'seedheart', stag: 'briar-stag-v1', pump: 'coolant-pump', coolant: 'coolant-spring',
      forge: 'forge-core', altar: 'moon-altar', moonflame: 'moonflame',
      shrine: 'reliquary', relic: 'fox-relic', gate: 'grove-gate', vent: 'ember-vent', bloom: 'mist-bloom',
      bramble: 'bramble-field', ore: 'ember-ore', moonstone: 'moonstone',
    };
    const fieldStyles: Partial<Record<ObjectKind, { radius: number; color: number; fill: number; stroke: number }>> = {
      pump: { radius: 110, color: 0x8ddfe0, fill: 0.09, stroke: 0.75 },
      coolant: { radius: 96, color: 0x96f4ed, fill: 0.11, stroke: 0.85 },
      moonflame: { radius: 84, color: 0xc8a8ff, fill: 0.09, stroke: 0.8 },
      seedheart: { radius: 150, color: 0xb8f3a0, fill: 0.08, stroke: 0.8 },
      stag: { radius: 94, color: 0xffd080, fill: 0.045, stroke: 0.5 },
      vent: { radius: 120, color: 0xff9a55, fill: 0.035, stroke: 0.28 },
      bloom: { radius: 116, color: 0x8dc9d1, fill: 0.075, stroke: 0.62 },
      bramble: { radius: 105, color: 0x8ec477, fill: 0.08, stroke: 0.55 },
      ore: { radius: 145, color: 0xffb16b, fill: 0.055, stroke: 0.55 },
      moonstone: { radius: 150, color: 0xb7adfa, fill: 0.065, stroke: 0.62 },
    };
    if (kind === 'altar' && maxHp <= 6)
      fieldStyles.altar = { radius: 250, color: 0xd7c6ff, fill: 0.055, stroke: 0.58 };
    if (kind === 'forge' && maxHp <= 3)
      fieldStyles.forge = { radius: 105, color: 0x9df2ec, fill: 0.08, stroke: 0.74 };
    const field = fieldStyles[kind];
    const ring = field ? this.add.circle(0, 0, field.radius, field.color, field.fill)
      .setStrokeStyle(3, field.color, field.stroke).setVisible(active) : undefined;
    const base = this.add.ellipse(0, 21, kind === 'gate' || kind === 'stag' ? 125 : 70, 27, 0x132f2c, kind === 'waylight' ? 0.2 : 0.55);
    const size = kind === 'gate' ? 134 : kind === 'forge' || kind === 'altar' || kind === 'moonstone' ? 110
      : kind === 'coolant' ? 124 : kind === 'stag' ? 134 : kind === 'moonflame' ? 106
      : kind === 'bramble' ? 125 : kind === 'ore' ? 116 : kind === 'seedheart' ? 122 : kind === 'relic' ? 83 : kind === 'waylight' ? 104 : 98;
    const image = this.add.image(0, kind === 'gate' ? -14 : -8, texture[kind]).setDisplaySize(size, size);
    const terrainLabel: Partial<Record<ObjectKind, string>> = {
      bramble: 'BRAMBLES · SLOW', ore: 'ORE · FOE ARMOR', moonstone: 'MOONSTONE · HASTE',
    };
    const label = this.add.text(0, kind === 'gate' || kind === 'stag' ? 65 : 49,
      kind === 'waylight' && active ? 'STAY CLOSE · GUIDE ME'
        : kind === 'seedheart' && active ? `DEFEND · ${Math.ceil(maxHp - hp)}/${maxHp}s`
        : kind === 'stag' && active ? `HUNT THE STAG · ${stagLeg(hp, maxHp)}/3`
        : kind === 'altar' && active && maxHp <= 6 ? `MOON RITE · ${maxHp - hp}/${maxHp}`
        : kind === 'pump' && active ? `DRAIN PUMP · ${Math.floor((1 - hp / maxHp) * 4)}/4s`
        : kind === 'coolant' && active ? `FILL FLASK · ${Math.floor(maxHp - hp)}/2s`
        : kind === 'moonflame' && active ? `CATCH SPARK · ${maxHp - hp}/3`
        : kind === 'forge' && active && maxHp <= 3 ? `DELIVER COOLANT · ${maxHp - hp}/3`
        : active ? terrainLabel[kind] ?? objectiveName(kind) : `${objectiveName(kind)} · SEALED`, {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#fff0cb', stroke: '#1b3c32', strokeThickness: 4,
    }).setOrigin(0.5);
    const view = this.add.container(x, y, ring ? [ring, base, image, label] : [base, image, label])
      .setDepth(2).setAlpha(active ? 1 : 0.35);
    this.objects.push({ view, image, label, kind, x, y, hp, maxHp, active, ring });
  }

  private hitObject(object: WorldObject, damage: number): void {
    if (!object.active || object.hp <= 0 || object.kind === 'pump' || object.kind === 'waylight' || object.kind === 'seedheart'
      || object.kind === 'coolant' || object.kind === 'moonflame' || object.kind === 'forge' && object.maxHp <= 3
      || object.kind === 'altar' && object.maxHp <= 6) return;
    if (object.kind === 'stag') {
      const strike = strikeBriarStag(object.hp, object.maxHp, damage);
      this.metrics.objectDamage += strike.dealt;
      object.hp = strike.hp;
      soundFx.play(object.hp > 0 ? 'hit' : 'ward');
      if (strike.dealt > 0) this.floatText(String(Math.ceil(strike.dealt)), object.x, object.y - 82, '#ffdc89');
      object.view.setScale(1.13);
      this.tweens.add({ targets: object.view, scale: 1, duration: 125 });
      if (strike.leap !== null) {
        const old = { x: object.x, y: object.y };
        const anchor = this.stagAnchors[strike.leap];
        if (anchor) { object.x = anchor.x; object.y = anchor.y; object.view.setPosition(anchor.x, anchor.y); }
        this.burst(old.x, old.y, '#ffd088', 20);
        this.burst(object.x, object.y, '#ffd088', 12);
        this.floatText(`STAG FLEES · ${strike.leap}/3 BREAKS`, old.x, old.y - 108, '#fff1c8');
        object.label.setText(`HUNT THE STAG · ${strike.leap}/3`);
        for (let i = 0; i < 2; i++) this.spawnEnemy(i === 0 ? 'gnarl' : 'wisp',
          { x: Phaser.Math.Clamp(old.x + (i ? 55 : -55), 50, WORLD - 50), y: Phaser.Math.Clamp(old.y + 55, 50, WORLD - 50) });
        this.callbacks.onEvent(`BRIAR STAG FLEES TO CLEARING ${strike.leap + 1} — FOLLOW IT`);
        this.publishHud(); this.saveSnapshot();
      }
      if (object.hp <= 0) this.completeObject(object);
      return;
    }
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
    if (object.kind === 'coolant') {
      object.active = false; object.view.setAlpha(0.35); object.ring?.setVisible(false);
      const forge = this.objects.find(item => item.kind === 'forge' && item.maxHp <= 3 && item.hp > 0);
      if (forge) { forge.active = true; forge.view.setAlpha(1); forge.ring?.setVisible(true); }
      this.coolantCarryRemaining = 12;
      soundFx.play('ward'); this.burst(object.x, object.y, '#9cf5ec', 10);
      this.floatText('FLASK FULL · RUN!', object.x, object.y - 62, '#b8fff2');
      this.callbacks.onEvent('COOLANT FULL — REACH THE FORGE IN 12s');
      this.publishHud(); this.saveSnapshot();
      return;
    }
    if (this.markedField === object) this.clearFieldMark();
    if (object.kind === 'pump') {
      soundFx.play('ward');
      this.floatText('PUMP DRAINED', object.x, object.y - 57, '#b8f4ee');
    }
    object.active = false; object.view.setAlpha(0.15); object.ring?.setVisible(false);
    this.burst(object.x, object.y, object.kind === 'ward' ? '#c7e2a7' : '#f6d597', 16);
    if (object.kind === 'ward' || object.kind === 'waylight' || object.kind === 'seedheart' || object.kind === 'stag' || object.kind === 'pump' || object.kind === 'forge' || object.kind === 'altar' || object.kind === 'moonflame') {
      this.metrics.wards++;
      if (object.kind === 'waylight') this.callbacks.onEvent('WAYLIGHT HOME — THE GROVE IS SAFE');
      else if (object.kind === 'seedheart') this.callbacks.onEvent('SEEDHEART AWAKENED — THE GROVE IS SAFE');
      else if (object.kind === 'stag') {
        this.floatText('BRIAR STAG VANQUISHED', object.x, object.y - 106, '#ffe3a1');
        this.spawnCache('attack', object.x, object.y);
        this.callbacks.onEvent('BRIAR STAG VANQUISHED — ATTACK CACHE DROPPED');
      }
      else if (object.kind === 'moonflame') this.callbacks.onEvent('MOONFLAME CAUGHT — THE MOONFEN CALMS');
      else if (object.kind === 'pump') {
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
          if (altar) { altar.active = true; altar.view.setAlpha(1); altar.ring?.setVisible(true); altar.label.setText(altar.maxHp <= 6 ? 'MOON RITE · 0/6' : objectiveName('altar')); }
          this.callbacks.onEvent('MOON RITE OPEN — DEFEAT FOES NEAR THE ALTAR');
        } else this.callbacks.onEvent('ONE MIST BLOOM REMAINS');
      }
      this.spawnOrb(object.x - 14, object.y, 2);
      this.spawnOrb(object.x + 14, object.y, 2);
      if (object.kind === 'vent') this.callbacks.onEvent('EMBER VENT SEALED');
    } else if (object.kind === 'bramble' || object.kind === 'ore' || object.kind === 'moonstone') {
      const reward: Stat = object.kind === 'bramble' ? 'speed' : object.kind === 'ore' ? 'attack' : 'reach';
      this.metrics.terrain = (this.metrics.terrain ?? 0) + 1;
      this.triggerTerrainRupture(object, object.kind);
      this.spawnCache(reward, object.x, object.y);
      this.callbacks.onEvent(`${terrainRupture(object.kind).name} · ${STAT_INFO[reward].name.toUpperCase()} CACHE`);
    }
    this.publishHud(); this.saveSnapshot();
  }

  private triggerTerrainRupture(object: WorldObject, kind: TerrainKind): void {
    const effect = terrainRupture(kind);
    const color = kind === 'bramble' ? 0xc1eb9b : kind === 'ore' ? 0xffb068 : 0xc9b7ff;
    const pulse = this.add.circle(object.x, object.y, 30, color, 0.18)
      .setStrokeStyle(8, color, 0.96).setDepth(7);
    this.tweens.add({ targets: pulse, scale: effect.radius / 30, alpha: 0,
      duration: this.reducedEffects ? 180 : 420, onComplete: () => pulse.destroy() });
    this.floatText(effect.name, object.x, object.y - 76, Phaser.Display.Color.IntegerToColor(color).rgba);
    if (effect.moonflowSeconds > 0) {
      this.moonflowRemaining = Math.max(this.moonflowRemaining, effect.moonflowSeconds);
      this.floatText('SPEED +28% · 6s', this.hero.x, this.hero.y - 69, '#d9cbff');
    }
    for (const weapon of this.weapons) weapon.commandCooldown = 0;
    this.floatText('COMMANDS READY', this.hero.x, this.hero.y - 86, '#fff1b8');
    for (const enemy of [...this.enemies]) {
      if (!this.enemies.includes(enemy) || this.distance(enemy.sprite.x, enemy.sprite.y, object.x, object.y) > effect.radius) continue;
      if (effect.tangleSeconds > 0) this.entangleEnemy(enemy, effect.tangleSeconds);
      this.hitEnemy(enemy, effect.damage, true);
      if (!this.running) break;
    }
  }

  private requiredLeft(): number { return objectivesLeft(this.region, this.objects); }
  private nextRequiredObjective(): WorldObject | undefined { return nextObjective(this.region, this.objects) as WorldObject | undefined; }
  private openGate(): void {
    const gate = this.objects.find(object => object.kind === 'gate');
    if (gate) { gate.active = true; gate.view.setAlpha(1); this.callbacks.onEvent('GATE OPEN — FOLLOW THE ARROW'); this.saveSnapshot(); }
  }
  private updateObjects(dt = 0): void {
    const stag = this.objects.find(object => object.kind === 'stag' && object.active && object.hp > 0);
    if (stag && dt > 0) {
      const anchor = this.stagAnchors[stagLeg(stag.hp, stag.maxHp)];
      if (anchor) {
        const next = advanceBriarStag(stag, anchor, this.hero, this.seconds, dt);
        stag.image.setFlipX(next.x < stag.x);
        stag.x = next.x; stag.y = next.y;
        stag.view.setPosition(next.x, next.y);
      }
    }
    if (!this.reducedEffects && dt > 0) for (const object of this.objects) {
      if (!object.active) continue;
      const motion = OBJECT_MOTION[object.kind];
      if (!motion) continue;
      object.image.y = -8 + Math.sin(this.seconds * motion.speed + object.x * 0.01) * motion.lift;
      object.image.rotation = Math.sin(this.seconds * motion.speed * 0.6 + object.y * 0.01) * motion.tilt;
    }
    const waylight = this.objects.find(object => object.kind === 'waylight' && object.active && object.hp > 0);
    if (waylight && dt > 0 && this.waylightRoute) {
      const { start, goal } = this.waylightRoute;
      const result = advanceWaylight(waylight, goal, this.hero,
        this.enemies.map(enemy => ({ x: enemy.sprite.x, y: enemy.sprite.y })), dt);
      waylight.x = result.point.x; waylight.y = result.point.y;
      waylight.view.setPosition(waylight.x, waylight.y);
      const progress = waylightProgress(start, goal, waylight);
      const waylightLabel = result.threatened ? 'CLEAR NEARBY FOES' : result.moving
        ? `WAYLIGHT · ${Math.round(progress * 100)}%` : 'STAY CLOSE · GUIDE ME';
      if (waylight.label.text !== waylightLabel) waylight.label.setText(waylightLabel);
      if (!this.waylightAmbush && progress >= 0.5) {
        this.waylightAmbush = true;
        for (let i = 0; i < 3; i++) {
          const angle = i * Math.PI * 2 / 3;
          this.spawnEnemy(i === 2 ? 'wisp' : 'gnarl', {
            x: Phaser.Math.Clamp(waylight.x + Math.cos(angle) * 175, 45, WORLD - 45),
            y: Phaser.Math.Clamp(waylight.y + Math.sin(angle) * 175, 45, WORLD - 45),
          });
        }
        this.callbacks.onEvent('AMBUSH — DEFEND THE WAYLIGHT'); this.saveSnapshot();
      }
      if (result.arrived) this.completeObject(waylight);
    }
    const seedheart = this.objects.find(object => object.kind === 'seedheart' && object.active && object.hp > 0);
    if (seedheart && dt > 0) {
      const close = this.distance(this.hero.x, this.hero.y, seedheart.x, seedheart.y) < 150;
      const threatened = this.enemies.some(enemy => this.distance(enemy.sprite.x, enemy.sprite.y, seedheart.x, seedheart.y) < 150);
      seedheart.hp = advanceSeedheart(seedheart.hp, dt, close, threatened);
      const progress = Math.min(15, Math.floor(seedheart.maxHp - seedheart.hp));
      const label = threatened ? 'CLEAR FOES · CHARGE PAUSED' : close ? `SEEDHEART · ${progress}/15s` : 'STAND IN RING · DEFEND';
      if (seedheart.label.text !== label) seedheart.label.setText(label);
      if (!this.waylightAmbush && seedheart.hp <= 7.5) {
        this.waylightAmbush = true;
        for (let i = 0; i < 4; i++) {
          const angle = i * Math.PI / 2;
          this.spawnEnemy(i === 3 ? 'wisp' : 'gnarl', {
            x: Phaser.Math.Clamp(seedheart.x + Math.cos(angle) * 205, 45, WORLD - 45),
            y: Phaser.Math.Clamp(seedheart.y + Math.sin(angle) * 205, 45, WORLD - 45),
          });
        }
        this.callbacks.onEvent('SEEDHEART AMBUSH — CLEAR FOES TO KEEP CHARGING'); this.saveSnapshot();
      }
      if (seedheart.hp <= 0) this.completeObject(seedheart);
    }
    const pump = this.objects.find(object => object.kind === 'pump' && object.active && object.hp > 0);
    const rite = this.objects.find(object => object.kind === 'altar' && object.active && object.hp > 0 && object.maxHp <= 6);
    if (rite && dt > 0) {
      this.ritualClock += dt;
      if (this.ritualClock >= 4.5 && this.enemies.length < 68) {
        this.ritualClock = 0;
        for (let i = 0; i < 2; i++) {
          const angle = this.random.range(0, Math.PI * 2);
          this.spawnEnemy(i ? 'wisp' : 'gnarl', {
            x: Phaser.Math.Clamp(rite.x + Math.cos(angle) * 210, 45, WORLD - 45),
            y: Phaser.Math.Clamp(rite.y + Math.sin(angle) * 210, 45, WORLD - 45),
          });
        }
      }
    } else this.ritualClock = 0;
    if (pump && dt > 0 && this.distance(this.hero.x, this.hero.y, pump.x, pump.y) < 110) {
      pump.hp = Math.max(0, pump.hp - dt * 60);
      const channelSeconds = Math.min(4, Math.floor((1 - pump.hp / pump.maxHp) * 4));
      const channelLabel = `DRAIN PUMP · ${channelSeconds}/4s`;
      if (pump.label.text !== channelLabel) pump.label.setText(channelLabel);
      if (pump.hp <= 0) this.completeObject(pump);
    }
    const spring = this.objects.find(object => object.kind === 'coolant');
    const coolant = spring?.active && spring.hp > 0 ? spring : undefined;
    const deliveryForge = this.objects.find(object => object.kind === 'forge' && object.maxHp <= 3 && object.hp > 0);
    if (coolant && dt > 0 && this.distance(this.hero.x, this.hero.y, coolant.x, coolant.y) < 96) {
      coolant.hp = Math.max(0, coolant.hp - dt);
      coolant.label.setText(`FILL FLASK · ${Math.min(2, Math.floor(2 - coolant.hp))}/2s`);
      if (coolant.hp <= 0) this.completeObject(coolant);
    }
    if (deliveryForge?.active && spring && dt > 0) {
      this.coolantCarryRemaining = Math.max(0, this.coolantCarryRemaining - dt);
      if (this.distance(this.hero.x, this.hero.y, deliveryForge.x, deliveryForge.y) < 105 && this.coolantCarryRemaining > 0) {
        this.coolantCarryRemaining = 0;
        deliveryForge.hp--;
        soundFx.play('ward'); this.burst(deliveryForge.x, deliveryForge.y, '#9ef3ea', 12);
        this.floatText(`COOLED · ${3 - deliveryForge.hp}/3`, deliveryForge.x, deliveryForge.y - 68, '#bafff1');
        if (deliveryForge.hp <= 0) this.completeObject(deliveryForge);
        else {
          deliveryForge.active = false; deliveryForge.view.setAlpha(0.45); deliveryForge.ring?.setVisible(false);
          spring.hp = 2; spring.active = true; spring.view.setAlpha(1); spring.ring?.setVisible(true);
          spring.label.setText('FILL FLASK · 0/2s');
          deliveryForge.label.setText(`FORGE · ${3 - deliveryForge.hp}/3 DELIVERED`);
          this.callbacks.onEvent(`${3 - deliveryForge.hp}/3 FLASKS DELIVERED — RETURN TO SPRING`);
          this.saveSnapshot();
        }
      } else if (this.coolantCarryRemaining <= 0) {
        deliveryForge.active = false; deliveryForge.view.setAlpha(0.45); deliveryForge.ring?.setVisible(false);
        spring.hp = 2; spring.active = true; spring.view.setAlpha(1); spring.ring?.setVisible(true);
        spring.label.setText('FILL FLASK · 0/2s');
        this.callbacks.onEvent('FLASK WARMED — RETURN TO SPRING');
        this.saveSnapshot();
      } else deliveryForge.label.setText(`DELIVER FLASK · ${Math.ceil(this.coolantCarryRemaining)}s`);
    }
    const moonflame = this.objects.find(object => object.kind === 'moonflame' && object.active && object.hp > 0);
    if (moonflame && dt > 0) {
      moonflame.view.y = moonflame.y + Math.sin(this.time.now / 230) * 6;
      if (this.distance(this.hero.x, this.hero.y, moonflame.x, moonflame.y) < 78) {
        const caughtX = moonflame.x; const caughtY = moonflame.y;
        moonflame.hp--;
        soundFx.play('ward'); this.burst(caughtX, caughtY, '#d2bbff', 14);
        this.floatText(`SPARK CAUGHT · ${3 - moonflame.hp}/3`, caughtX, caughtY - 68, '#e8d4ff');
        if (moonflame.hp <= 0) this.completeObject(moonflame);
        else {
          const route = generateRegionLayout(this.seed, 2).clearings.filter(clearing => clearing.kind === 'ward' || clearing.kind === 'shrine');
          const next = route[3 - moonflame.hp];
          moonflame.x = next.x; moonflame.y = next.y; moonflame.view.setPosition(next.x, next.y);
          moonflame.label.setText(`CATCH SPARK · ${3 - moonflame.hp}/3`);
          for (let i = 0; i < 2; i++) this.spawnEnemy(i ? 'wisp' : 'gnarl', {
            x: Phaser.Math.Clamp(caughtX + (i ? 180 : -180), 45, WORLD - 45),
            y: Phaser.Math.Clamp(caughtY + (i ? 90 : -90), 45, WORLD - 45),
          });
          this.callbacks.onEvent(`MOONFLAME LEAPS — ${3 - moonflame.hp}/3 SPARKS CAUGHT`);
          this.saveSnapshot();
        }
      }
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
      if (object.kind === 'waylight') continue;
      const x = object.x - 38; const y = object.y - (object.kind === 'stag' ? 88 : 68);
      this.bars.fillStyle(0x18312d, 0.9).fillRoundedRect(x - 2, y - 2, 80, 9, 3);
      const progressBar = object.kind === 'pump' || object.kind === 'coolant' || object.kind === 'moonflame'
        || object.kind === 'forge' && object.maxHp <= 3;
      this.bars.fillStyle(object.kind === 'pump' || object.kind === 'coolant' || object.kind === 'forge' && object.maxHp <= 3
        ? 0xa7f0ec : object.kind === 'moonflame' ? 0xd7bbff : object.kind === 'stag' ? 0xffc879 : 0xf6d899)
        .fillRoundedRect(x, y, 76 * (progressBar ? 1 - object.hp / object.maxHp : object.hp / object.maxHp), 5, 2);
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
    for (const enemy of this.enemies) { enemy.strike?.ring?.destroy(); enemy.lance?.marker?.destroy(); }
    this.clearFieldMark();
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
      commandChain: this.commandChain ? { ...this.commandChain } : null,
      possibleResonances: this.commandChain ? this.weapons.filter(weapon => weapon.id !== this.commandChain?.weapon)
        .map(weapon => ({ weapon: weapon.id, resonance: resonanceFor(this.commandChain!.weapon, weapon.id)! })) : [],
      special: HERO_INFO[this.heroId].special, specialCooldown: this.specialCooldown,
      objectivesLeft: this.requiredLeft(), objectiveName: currentObjective?.kind ?? null,
      ritualActive: currentObjective?.kind === 'altar' && currentObjective.maxHp <= 6,
      coolantCarryRemaining: this.coolantCarryRemaining,
      surge: wildSurge(this.region, this.stageSeconds, REGIONS[this.region].duration),
      moonflowRemaining: this.moonflowRemaining,
      stepTargetsLeft: this.objects.filter(object => object.kind === currentObjective?.kind && object.hp > 0).length,
      stepProgress: currentObjective?.kind === 'seedheart'
        ? Math.min(15, Math.floor(currentObjective.maxHp - currentObjective.hp))
        : currentObjective?.kind === 'stag' ? stagLeg(currentObjective.hp, currentObjective.maxHp)
        : currentObjective?.kind === 'pump'
        ? Math.min(4, Math.floor((1 - currentObjective.hp / currentObjective.maxHp) * 4))
        : currentObjective?.kind === 'coolant'
        ? Math.min(2, Math.floor(2 - currentObjective.hp))
        : currentObjective?.kind === 'moonflame' || currentObjective?.kind === 'forge' && currentObjective.maxHp <= 3
        ? currentObjective.maxHp - currentObjective.hp
        : currentObjective?.kind === 'waylight' && this.waylightRoute
          ? Math.round(waylightProgress(this.waylightRoute.start, this.waylightRoute.goal, currentObjective) * 100)
          : currentObjective?.kind === 'altar' && currentObjective.maxHp <= 6
            ? currentObjective.maxHp - currentObjective.hp : 0,
      objectiveProgress: currentObjective?.kind === 'waylight' && this.waylightRoute
        ? waylightProgress(this.waylightRoute.start, this.waylightRoute.goal, currentObjective) * 100
        : currentObjective?.kind === 'bloom' ? (2 - this.objects.filter(object => object.kind === 'bloom' && object.hp > 0).length) * 50
          : currentObjective ? Math.max(0, 100 * (1 - currentObjective.hp / Math.max(1, currentObjective.maxHp)))
            : boss?.maxHp ? 100 * (1 - boss.hp / boss.maxHp)
              : Math.min(100, this.stageSeconds / REGIONS[this.region].duration * 100),
      terrainHint: nearbyTerrain ? terrainRupture(nearbyTerrain.kind as TerrainKind).hint : null,
      markedFieldName: this.markedField?.active ? objectiveName(this.markedField.kind) : null,
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
      commandChain: this.commandChain ? { ...this.commandChain } : null,
      splashBonus: this.splashBonus, pet: this.pet, petClock: this.petClock,
      autoSpecial: this.autoSpecial, specialCooldown: this.specialCooldown, reducedEffects: this.reducedEffects,
      stats: { ...this.stats }, health: this.health, xp: this.xp, level: this.level, kills: this.kills,
      seconds: this.seconds, region: this.region, stageSeconds: this.stageSeconds,
      spawnClock: this.spawnClock, cacheClock: this.cacheClock,
      x: this.hero.x, y: this.hero.y, invulnerability: this.invulnerability,
      gatekeeperSpawned: this.gatekeeperSpawned, bossSpawned: this.bossSpawned,
      waylightAmbush: this.waylightAmbush,
      ritualClock: this.ritualClock,
      coolantCarryRemaining: this.coolantCarryRemaining,
      moonflowRemaining: this.moonflowRemaining,
      emberFields: this.emberFields.map(field => ({ x: field.x, y: field.y, remaining: field.remaining,
        tickClock: field.tickClock, damage: field.damage })),
      markedFieldIndex: this.markedField ? this.objects.indexOf(this.markedField) : undefined,
      choosing: this.choosing, upgradeOptions: [...this.upgradeOptions],
      enemies: this.enemies.map(enemy => ({ kind: enemy.kind, x: enemy.sprite.x, y: enemy.sprite.y,
        hp: enemy.hp, maxHp: enemy.maxHp, phase: enemy.phase,
        burnRemaining: enemy.burnRemaining, burnTickClock: enemy.burnTickClock, burnDamage: enemy.burnDamage,
        tangleRemaining: enemy.tangleRemaining,
        burnSource: enemy.burnSource,
        bossStrike: enemy.strike ? { cooldown: enemy.strike.cooldown, windup: enemy.strike.windup,
          x: enemy.strike.x, y: enemy.strike.y, radius: enemy.strike.radius } : undefined,
        wispLance: enemy.lance ? { cooldown: enemy.lance.cooldown, windup: enemy.lance.windup,
          fromX: enemy.lance.fromX, fromY: enemy.lance.fromY,
          toX: enemy.lance.toX, toY: enemy.lance.toY } : undefined })),
      objects: this.objects.map(object => ({ kind: object.kind, x: object.x, y: object.y, hp: object.hp, maxHp: object.maxHp, active: object.active })),
      orbs: this.orbs.map(orb => ({ x: orb.x, y: orb.y, value: orb.value })),
      caches: this.caches.map(cache => ({ x: cache.x, y: cache.y, stat: cache.stat })),
      metrics: { ...this.metrics, weaponDamage: { ...(this.metrics.weaponDamage ?? emptyWeaponDamage()) },
        regionSeconds: [...this.metrics.regionSeconds] as RunMetrics['regionSeconds'] },
    });
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.running || this.choosing || this.pausedByUser || this.joyPointer !== null) return;
    this.tapStart = { id: pointer.id, x: pointer.x, y: pointer.y, at: this.time.now };
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
  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.joyPointer) return;
    const tap = this.tapStart;
    const wasTap = tap?.id === pointer.id && Math.hypot(pointer.x - tap.x, pointer.y - tap.y) < 20
      && this.time.now - tap.at < 360;
    this.releaseJoystick();
    if (!wasTap || !this.running || this.choosing || this.pausedByUser) return;
    const field = this.objects.find(object => this.isTerrainField(object) && object.active && object.hp > 0
      && this.distance(pointer.worldX, pointer.worldY, object.x, object.y) < 76);
    if (!field) return;
    this.toggleFieldMark(field);
  }
  private releaseJoystick(): void {
    this.joyPointer = null; this.tapStart = null; this.joyVector.set(0, 0);
    this.joystickBase?.setVisible(false); this.joystickNub?.setVisible(false);
  }
}
