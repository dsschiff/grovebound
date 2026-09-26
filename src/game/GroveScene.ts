import Phaser from 'phaser';
import { BASE_STATS, STAT_INFO, damageAfterDefense, upgradeStat, xpToNextLevel, type Ability, type Stat, type Stats } from './logic';

const WORLD = 1800;
const MAX_HEALTH = 100;
const STAT_KEYS: Stat[] = ['speed', 'regen', 'attack', 'defense'];

type EnemyKind = 'gnarl' | 'wisp' | 'brute' | 'boss';
interface Enemy {
  sprite: Phaser.GameObjects.Image;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  radius: number;
  phase: number;
}
interface Orb { view: Phaser.GameObjects.Container; x: number; y: number; value: number }
interface Cache { view: Phaser.GameObjects.Container; x: number; y: number; stat: Stat }

export interface HudState {
  health: number;
  maxHealth: number;
  level: number;
  xp: number;
  xpNeeded: number;
  kills: number;
  seconds: number;
  stats: Stats;
  bossHp: number | null;
  bossMaxHp: number | null;
  ability: Ability;
}
export interface RunResult { won: boolean; kills: number; seconds: number; level: number }
export interface GameCallbacks {
  onHud: (hud: HudState) => void;
  onUpgrade: (options: Stat[]) => void;
  onEnd: (result: RunResult) => void;
  onBoss: () => void;
}

export class GroveScene extends Phaser.Scene {
  private callbacks: GameCallbacks;
  private hero!: Phaser.GameObjects.Image;
  private axe!: Phaser.GameObjects.Image;
  private joystickBase!: Phaser.GameObjects.Arc;
  private joystickNub!: Phaser.GameObjects.Arc;
  private bars!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private decorations: Phaser.GameObjects.GameObject[] = [];
  private enemies: Enemy[] = [];
  private orbs: Orb[] = [];
  private caches: Cache[] = [];
  private running = false;
  private choosing = false;
  private pausedByUser = false;
  private ability: Ability = 'axe';
  private stats: Stats = { ...BASE_STATS };
  private health = MAX_HEALTH;
  private xp = 0;
  private level = 1;
  private kills = 0;
  private seconds = 0;
  private spawnClock = 0;
  private cacheClock = 0;
  private attackClock = 0;
  private hudClock = 0;
  private invulnerability = 0;
  private boss: Enemy | null = null;
  private bossSpawned = false;
  private joyPointer: number | null = null;
  private joyOrigin = new Phaser.Math.Vector2();
  private joyVector = new Phaser.Math.Vector2();
  private random = new Phaser.Math.RandomDataGenerator();

  constructor(callbacks: GameCallbacks) {
    super('Grove');
    this.callbacks = callbacks;
  }

  preload(): void {
    const base = import.meta.env.BASE_URL;
    for (const key of ['warden', 'axe', 'gnarl', 'wisp', 'brute', 'briar-king', 'tree']) {
      this.load.image(key, `${base}art/${key}.png`);
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#183f32');
    this.cameras.main.setBounds(0, 0, WORLD, WORLD);
    this.drawForest();

    this.hero = this.add.image(WORLD / 2, WORLD / 2, 'warden').setDisplaySize(70, 78).setDepth(5);
    this.axe = this.add.image(WORLD / 2 + 23, WORLD / 2 + 12, 'axe').setDisplaySize(43, 43).setDepth(6);
    this.bars = this.add.graphics().setDepth(9);
    this.cameras.main.startFollow(this.hero, true, 0.14, 0.14);

    this.joystickBase = this.add.circle(0, 0, 53, 0xe9e6c6, 0.13).setStrokeStyle(2, 0xf9f0cf, 0.55).setScrollFactor(0).setDepth(100).setVisible(false);
    this.joystickNub = this.add.circle(0, 0, 23, 0xf8e8b0, 0.45).setStrokeStyle(2, 0xffffff, 0.7).setScrollFactor(0).setDepth(101).setVisible(false);

    this.keys = this.input.keyboard?.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    this.cursors = this.input.keyboard?.createCursorKeys() as Phaser.Types.Input.Keyboard.CursorKeys;
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUp, this);
    this.publishHud();
  }

  beginRun(ability: Ability): void {
    if (!this.hero) return;
    this.clearRunObjects();
    this.drawForest();
    this.ability = ability;
    this.stats = { ...BASE_STATS };
    this.health = MAX_HEALTH;
    this.xp = 0;
    this.level = 1;
    this.kills = 0;
    this.seconds = 0;
    this.spawnClock = 0;
    this.cacheClock = 0;
    this.attackClock = 0;
    this.hudClock = 0;
    this.invulnerability = 0;
    this.boss = null;
    this.bossSpawned = false;
    this.choosing = false;
    this.pausedByUser = false;
    this.running = true;
    this.hero.setPosition(WORLD / 2, WORLD / 2).setAlpha(1).setDisplaySize(70, 78);
    this.axe.setVisible(ability === 'axe');
    this.spawnCache('attack', WORLD / 2 + 155, WORLD / 2 - 65);
    this.publishHud();
  }

  chooseUpgrade(stat: Stat): void {
    if (!this.running || !this.choosing) return;
    this.stats = upgradeStat(this.stats, stat);
    this.choosing = false;
    this.floatText(`+ ${STAT_INFO[stat].name.toUpperCase()}`, this.hero.x, this.hero.y - 60, STAT_INFO[stat].color);
    this.burst(this.hero.x, this.hero.y, STAT_INFO[stat].color, 11);
    this.publishHud();
  }

  setPaused(value: boolean): void {
    this.pausedByUser = value;
    if (value) this.releaseJoystick();
  }

  isRunning(): boolean { return this.running; }

  endRunEarly(): void {
    this.pausedByUser = false;
    this.running = false;
    this.releaseJoystick();
  }

  update(_time: number, deltaMs: number): void {
    if (!this.running || this.choosing || this.pausedByUser) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.seconds += dt;
    this.attackClock -= dt;
    this.invulnerability = Math.max(0, this.invulnerability - dt);
    this.health = Math.min(MAX_HEALTH, this.health + this.stats.regen * dt);
    this.moveHero(dt);
    this.updateEnemies(dt);
    this.updateOrbs(dt);
    this.updateCaches();
    this.updateSpawns(dt);
    if (this.attackClock <= 0) this.autoAttack();
    this.drawEnemyBars();
    this.hudClock += dt;
    if (this.hudClock >= 0.12) { this.hudClock = 0; this.publishHud(); }
  }

  private drawForest(): void {
    for (const decoration of this.decorations) decoration.destroy();
    this.decorations = [];
    this.random = new Phaser.Math.RandomDataGenerator([`${Date.now()}`, `${Math.random()}`]);

    const grass = this.add.graphics().setDepth(-10);
    grass.fillStyle(0x376f55).fillRect(0, 0, WORLD, WORLD);
    for (let i = 0; i < 110; i++) {
      grass.fillStyle(i % 3 ? 0x467b58 : 0x315f4d, this.random.realInRange(0.13, 0.35));
      grass.fillEllipse(this.random.between(0, WORLD), this.random.between(0, WORLD), this.random.between(90, 320), this.random.between(60, 190));
    }
    grass.fillStyle(0x91a66a, 0.22);
    grass.fillEllipse(900, 900, 660, 510);
    grass.lineStyle(18, 0x214b3f, 0.8).strokeRect(9, 9, WORLD - 18, WORLD - 18);
    this.decorations.push(grass);

    const flecks = this.add.graphics().setDepth(-9);
    for (let i = 0; i < 900; i++) {
      const x = this.random.between(30, WORLD - 30);
      const y = this.random.between(30, WORLD - 30);
      const color = i % 13 === 0 ? 0xf1d78a : i % 5 === 0 ? 0x9cbe78 : 0x76a979;
      flecks.fillStyle(color, this.random.realInRange(0.18, 0.45)).fillCircle(x, y, this.random.realInRange(1, 3));
    }
    this.decorations.push(flecks);

    for (let i = 0; i < 95; i++) {
      const x = this.random.between(65, WORLD - 65);
      const y = this.random.between(60, WORLD - 60);
      if (Phaser.Math.Distance.Between(x, y, 900, 900) < 270) continue;
      const tree = this.add.image(x, y, 'tree').setDisplaySize(this.random.between(75, 120), this.random.between(88, 140)).setDepth(-3);
      tree.setAlpha(this.random.realInRange(0.74, 1));
      this.decorations.push(tree);
    }
    for (let i = 0; i < 70; i++) {
      const x = this.random.between(30, WORLD - 30);
      const y = this.random.between(30, WORLD - 30);
      if (Phaser.Math.Distance.Between(x, y, 900, 900) < 175) continue;
      const rock = this.add.ellipse(x, y, this.random.between(9, 24), this.random.between(7, 15), 0x8c9e8a, 0.65).setStrokeStyle(1, 0xc5c4a0, 0.35).setDepth(-2);
      this.decorations.push(rock);
    }
  }

  private clearRunObjects(): void {
    for (const enemy of this.enemies) enemy.sprite.destroy();
    for (const orb of this.orbs) orb.view.destroy();
    for (const cache of this.caches) { this.tweens.killTweensOf(cache.view); cache.view.destroy(); }
    this.enemies = [];
    this.orbs = [];
    this.caches = [];
    this.bars?.clear();
    this.releaseJoystick();
  }

  private moveHero(dt: number): void {
    let dx = this.joyVector.x;
    let dy = this.joyVector.y;
    if (this.keys?.A?.isDown || this.cursors?.left?.isDown) dx -= 1;
    if (this.keys?.D?.isDown || this.cursors?.right?.isDown) dx += 1;
    if (this.keys?.W?.isDown || this.cursors?.up?.isDown) dy -= 1;
    if (this.keys?.S?.isDown || this.cursors?.down?.isDown) dy += 1;
    const length = Math.hypot(dx, dy);
    if (length > 0.03) {
      this.hero.x = Phaser.Math.Clamp(this.hero.x + dx / Math.max(1, length) * this.stats.speed * dt, 42, WORLD - 42);
      this.hero.y = Phaser.Math.Clamp(this.hero.y + dy / Math.max(1, length) * this.stats.speed * dt, 42, WORLD - 42);
      if (dx !== 0) this.hero.setFlipX(dx < 0);
      this.hero.setRotation(Math.sin(this.seconds * 13) * 0.026);
    } else this.hero.setRotation(0);
    this.axe.setPosition(this.hero.x + (this.hero.flipX ? -24 : 24), this.hero.y + 11).setFlipX(this.hero.flipX);
    this.hero.setAlpha(this.invulnerability > 0 && Math.floor(this.seconds * 18) % 2 === 0 ? 0.55 : 1);
  }

  private updateSpawns(dt: number): void {
    this.spawnClock += dt;
    const interval = Math.max(0.43, 1.5 - this.seconds / 280);
    if (this.spawnClock >= interval && this.enemies.length < 75) {
      this.spawnClock = 0;
      this.spawnEnemy(this.chooseEnemyKind());
      if (this.seconds > 150 && this.random.frac() < 0.32) this.spawnEnemy(this.chooseEnemyKind());
    }
    this.cacheClock += dt;
    if (this.cacheClock >= 38 && this.caches.length < 4) {
      this.cacheClock = 0;
      this.spawnCache(STAT_KEYS[this.random.between(0, 3)]);
    }
    if (!this.bossSpawned && this.seconds >= 300) {
      this.bossSpawned = true;
      this.spawnEnemy('boss');
      this.callbacks.onBoss();
    }
  }

  private chooseEnemyKind(): EnemyKind {
    const roll = this.random.frac();
    if (this.seconds > 95 && roll < 0.16) return 'brute';
    if (this.seconds > 35 && roll < 0.44) return 'wisp';
    return 'gnarl';
  }

  private spawnPoint(distance = 475): { x: number; y: number } {
    const angle = this.random.realInRange(0, Math.PI * 2);
    return {
      x: Phaser.Math.Clamp(this.hero.x + Math.cos(angle) * distance, 45, WORLD - 45),
      y: Phaser.Math.Clamp(this.hero.y + Math.sin(angle) * distance, 45, WORLD - 45),
    };
  }

  private spawnEnemy(kind: EnemyKind): void {
    const values = {
      gnarl: { hp: 27, speed: 77, damage: 8, radius: 23, size: 48, texture: 'gnarl' },
      wisp: { hp: 17, speed: 126, damage: 6, radius: 17, size: 43, texture: 'wisp' },
      brute: { hp: 82, speed: 53, damage: 15, radius: 31, size: 67, texture: 'brute' },
      boss: { hp: 850, speed: 60, damage: 22, radius: 54, size: 125, texture: 'briar-king' },
    }[kind];
    const point = this.spawnPoint(kind === 'boss' ? 370 : 485);
    const scale = kind === 'boss' ? 1 : 1 + this.seconds / 490;
    const hp = Math.round(values.hp * scale);
    const sprite = this.add.image(point.x, point.y, values.texture).setDisplaySize(values.size, values.size).setDepth(4);
    const enemy: Enemy = { sprite, kind, hp, maxHp: hp, speed: values.speed, damage: values.damage, radius: values.radius, phase: this.random.realInRange(0, 6) };
    this.enemies.push(enemy);
    if (kind === 'boss') this.boss = enemy;
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      const dx = this.hero.x - enemy.sprite.x;
      const dy = this.hero.y - enemy.sprite.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      if (distance > enemy.radius + 16) {
        const weave = enemy.kind === 'wisp' ? Math.sin(this.seconds * 7 + enemy.phase) * 0.32 : 0;
        enemy.sprite.x += (dx / distance - dy / distance * weave) * enemy.speed * dt;
        enemy.sprite.y += (dy / distance + dx / distance * weave) * enemy.speed * dt;
      } else if (this.invulnerability <= 0) {
        this.takeDamage(enemy.damage);
      }
      enemy.sprite.setFlipX(dx < 0);
      enemy.sprite.setRotation(Math.sin(this.seconds * (enemy.kind === 'wisp' ? 8 : 3) + enemy.phase) * 0.04);
    }
  }

  private takeDamage(raw: number): void {
    const actual = damageAfterDefense(raw, this.stats.defense);
    this.health = Math.max(0, this.health - actual);
    this.invulnerability = 0.55;
    this.floatText(`−${actual}`, this.hero.x, this.hero.y - 43, '#ffc3b4');
    this.cameras.main.shake(90, 0.003);
    this.publishHud();
    if (this.health <= 0) this.finish(false);
  }

  private autoAttack(): void {
    let target: Enemy | null = null;
    let best = this.ability === 'axe' ? 115 : 230;
    for (const enemy of this.enemies) {
      const distance = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, enemy.sprite.x, enemy.sprite.y);
      if (distance < best) { best = distance; target = enemy; }
    }
    if (!target) { this.attackClock = 0.12; return; }
    this.attackClock = this.ability === 'axe' ? 0.77 : 1.1;
    const angle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, target.sprite.x, target.sprite.y);
    if (this.ability === 'axe') {
      this.axe.setRotation(angle - 0.8);
      this.tweens.add({ targets: this.axe, rotation: angle + 1.1, duration: 130, ease: 'Cubic.Out' });
      const slash = this.add.ellipse(this.hero.x + Math.cos(angle) * 55, this.hero.y + Math.sin(angle) * 55, 92, 25, 0xffe2ab, 0.72).setRotation(angle).setDepth(8);
      this.tweens.add({ targets: slash, alpha: 0, scaleX: 1.3, duration: 190, onComplete: () => slash.destroy() });
      const victims = this.enemies.filter(enemy => Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, target!.sprite.x, target!.sprite.y) < 38);
      for (const enemy of victims) this.hitEnemy(enemy, this.stats.attack);
    } else {
      const dart = this.add.circle(this.hero.x, this.hero.y, 9, 0xc4e893).setStrokeStyle(3, 0x5f9e65).setDepth(8);
      const victim = target;
      this.tweens.add({ targets: dart, x: victim.sprite.x, y: victim.sprite.y, duration: 170, onComplete: () => { dart.destroy(); if (this.enemies.includes(victim)) this.hitEnemy(victim, Math.round(this.stats.attack * 1.4)); } });
    }
  }

  private hitEnemy(enemy: Enemy, damage: number): void {
    if (!this.enemies.includes(enemy)) return;
    enemy.hp -= damage;
    enemy.sprite.setTint(0xffd6a0);
    this.time.delayedCall(100, () => { if (enemy.sprite.active) enemy.sprite.clearTint(); });
    this.burst(enemy.sprite.x, enemy.sprite.y, enemy.kind === 'boss' ? '#e7ae75' : '#d6e99a', 4);
    if (enemy.hp > 0) return;
    const x = enemy.sprite.x;
    const y = enemy.sprite.y;
    enemy.sprite.destroy();
    this.enemies.splice(this.enemies.indexOf(enemy), 1);
    this.kills++;
    this.burst(x, y, enemy.kind === 'wisp' ? '#f8be71' : '#b4d889', enemy.kind === 'boss' ? 18 : 7);
    if (enemy.kind === 'boss') {
      this.boss = null;
      this.finish(true);
    } else this.spawnOrb(x, y, enemy.kind === 'brute' ? 3 : 1);
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
      const orb = this.orbs[i];
      const dx = this.hero.x - orb.x;
      const dy = this.hero.y - orb.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 145 && distance > 1) {
        const speed = Math.max(175, 650 - distance * 2);
        orb.x += dx / distance * speed * dt;
        orb.y += dy / distance * speed * dt;
        orb.view.setPosition(orb.x, orb.y);
      }
      if (distance < 25) {
        orb.view.destroy();
        this.orbs.splice(i, 1);
        this.gainXp(orb.value);
        if (this.choosing) break;
      }
    }
  }

  private gainXp(value: number): void {
    this.xp += value;
    if (this.xp < xpToNextLevel(this.level)) return;
    this.xp -= xpToNextLevel(this.level);
    this.level++;
    this.choosing = true;
    this.releaseJoystick();
    const options = Phaser.Utils.Array.Shuffle([...STAT_KEYS]).slice(0, 3);
    this.callbacks.onUpgrade(options);
    this.publishHud();
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
      if (Phaser.Math.Distance.Between(this.hero.x, this.hero.y, cache.x, cache.y) < 33) {
        this.stats = upgradeStat(this.stats, cache.stat);
        this.floatText(`+ ${STAT_INFO[cache.stat].name.toUpperCase()}`, cache.x, cache.y - 47, STAT_INFO[cache.stat].color);
        this.burst(cache.x, cache.y, STAT_INFO[cache.stat].color, 14);
        this.tweens.killTweensOf(cache.view);
        cache.view.destroy();
        this.caches.splice(i, 1);
        this.publishHud();
      }
    }
  }

  private drawEnemyBars(): void {
    this.bars.clear();
    for (const enemy of this.enemies) {
      if (enemy.hp >= enemy.maxHp && enemy.kind !== 'boss') continue;
      const width = enemy.kind === 'boss' ? 86 : 36;
      const x = enemy.sprite.x - width / 2;
      const y = enemy.sprite.y - (enemy.kind === 'boss' ? 67 : 31);
      this.bars.fillStyle(0x18312d, 0.9).fillRoundedRect(x - 2, y - 2, width + 4, 8, 3);
      this.bars.fillStyle(enemy.kind === 'boss' ? 0xeea673 : 0xeeb08e).fillRoundedRect(x, y, width * Math.max(0, enemy.hp / enemy.maxHp), 4, 2);
    }
  }

  private floatText(value: string, x: number, y: number, color: string): void {
    const label = this.add.text(x, y, value, { fontFamily: 'Arial, sans-serif', fontSize: '15px', fontStyle: 'bold', color, stroke: '#18372d', strokeThickness: 4 }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: label, y: y - 35, alpha: 0, duration: 780, ease: 'Cubic.Out', onComplete: () => label.destroy() });
  }

  private burst(x: number, y: number, color: string, count: number): void {
    const tint = Phaser.Display.Color.HexStringToColor(color).color;
    for (let i = 0; i < count; i++) {
      const angle = this.random.realInRange(0, Math.PI * 2);
      const distance = this.random.between(16, 49);
      const fleck = this.add.circle(x, y, this.random.between(2, 4), tint, 0.9).setDepth(12);
      this.tweens.add({ targets: fleck, x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance, alpha: 0, scale: 0.2, duration: this.random.between(280, 540), onComplete: () => fleck.destroy() });
    }
  }

  private finish(won: boolean): void {
    if (!this.running) return;
    this.running = false;
    this.releaseJoystick();
    this.callbacks.onEnd({ won, kills: this.kills, seconds: this.seconds, level: this.level });
    this.publishHud();
  }

  private publishHud(): void {
    this.callbacks.onHud({
      health: this.health, maxHealth: MAX_HEALTH, level: this.level, xp: this.xp,
      xpNeeded: xpToNextLevel(this.level), kills: this.kills, seconds: this.seconds,
      stats: { ...this.stats }, bossHp: this.boss?.hp ?? null, bossMaxHp: this.boss?.maxHp ?? null,
      ability: this.ability,
    });
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.running || this.choosing || this.pausedByUser || this.joyPointer !== null) return;
    this.joyPointer = pointer.id;
    this.joyOrigin.set(pointer.x, pointer.y);
    this.joystickBase.setPosition(pointer.x, pointer.y).setVisible(true);
    this.joystickNub.setPosition(pointer.x, pointer.y).setVisible(true);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.joyPointer) return;
    const dx = pointer.x - this.joyOrigin.x;
    const dy = pointer.y - this.joyOrigin.y;
    const length = Math.hypot(dx, dy);
    const fraction = Math.min(1, length / 53);
    this.joyVector.set(length > 0 ? dx / length * fraction : 0, length > 0 ? dy / length * fraction : 0);
    this.joystickNub.setPosition(this.joyOrigin.x + this.joyVector.x * 47, this.joyOrigin.y + this.joyVector.y * 47);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.joyPointer) this.releaseJoystick();
  }

  private releaseJoystick(): void {
    this.joyPointer = null;
    this.joyVector.set(0, 0);
    this.joystickBase?.setVisible(false);
    this.joystickNub?.setVisible(false);
  }
}
