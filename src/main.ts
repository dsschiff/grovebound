import Phaser from 'phaser';
import { GroveScene, type HudState, type RunResult } from './game/GroveScene';
import {
  HERO_INFO, HERO_KEYS, REGIONS, STAT_INFO, THORNS_COST, WEAPON_INFO,
  addRunToProgress, availableHero, availableWeapon, masteryRank, readProgress,
  saveProgress, seedsForRun, unlockThorns,
  type Hero, type Upgrade, type Weapon,
} from './game/logic';
import { readRunSnapshot } from './game/runSave';
import { soundFx } from './game/audio';
import './style.css';

const art = (name: string) => `${import.meta.env.BASE_URL}art/${name}.svg`;
let progress = readProgress();
let selectedHero: Hero = 'warden';
let selectedWeapon: Weapon = 'axe';
let selectedSkin = false;
let scene: GroveScene;
let game: Phaser.Game;
let currentHud: HudState | null = null;
let activeModal: 'menu' | 'upgrade' | 'pause' | 'result' | null = 'menu';
let toastTimer = 0;
let debugPilot = false;

const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
  <div id="game"></div><div class="vignette" aria-hidden="true"></div>
  <div id="ui">
    <div id="hud" class="hud hidden">
      <div class="top-line">
        <div class="crest"><span class="crest-leaf">❧</span><span>GROVEBOUND</span></div>
        <div class="clock-wrap"><span id="timer">0:00</span><small id="objective">VERDANT VERGE</small></div>
        <button id="pause-button" class="icon-button" aria-label="Pause game">Ⅱ</button>
      </div>
      <div class="vitals">
        <div class="health-caption"><span>♥ <strong id="health-number">100</strong> / <strong id="health-max">100</strong></span><span>LV <strong id="level-number">1</strong></span></div>
        <div class="bar health-bar"><div id="health-fill"></div></div>
        <div class="bar xp-bar"><div id="xp-fill"></div></div>
      </div>
      <div class="minimap-frame" aria-hidden="true"><canvas id="minimap" width="120" height="120"></canvas></div>
      <div id="boss-bar" class="boss-bar hidden"><span id="boss-name">GATE SENTINEL</span><div class="bar"><div id="boss-fill"></div></div></div>
      <button id="special-button" class="special-button" aria-label="Use special ability"><span class="special-icon">✹</span><strong id="special-label">WHIRLWIND</strong><small id="special-cooldown">READY</small></button>
      <div class="hud-bottom"><div id="stats" class="stats-strip"></div><div class="bottom-line"><span id="kills">0 VANQUISHED</span><span id="ability-name">AXE CLEAVE</span></div></div>
    </div>

    <div id="menu" class="screen menu-screen">
      <div class="menu-content">
        <div class="overline"><span class="overline-rule"></span> A POCKET FOREST ADVENTURE <span class="overline-rule"></span></div>
        <h1>GROVE<span>BOUND</span></h1>
        <p class="subtitle">Break the wards. Cross three wild regions. Face the Briar King.</p>
        <div class="hero-stage" aria-hidden="true">
          <div class="hero-halo"></div>
          <img class="stage-tree left" src="${art('tree')}" alt="" />
          <img class="stage-tree right" src="${art('tree')}" alt="" />
          <img class="stage-enemy" src="${art('gnarl')}" alt="" />
          <img id="stage-hero" class="stage-hero" src="${art('warden')}" alt="" />
          <img class="stage-axe" src="${art('axe')}" alt="" />
          <div class="stage-ground"></div>
        </div>
        <div class="ability-panel">
          <div class="panel-heading"><span>CHOOSE YOUR HERO</span><span id="seed-count" class="seed-count">✦ 0 SEEDS</span></div>
          <div id="hero-options" class="hero-options"></div>
          <div id="hero-hint" class="hero-hint"></div>
          <div class="panel-heading sub-heading"><span>STARTING WEAPON</span><span id="mastery-label">MASTERY 0</span></div>
          <div id="weapon-options" class="weapon-options"></div>
          <div id="weapon-hint" class="weapon-hint"></div>
          <div id="mastery-next" class="mastery-next"></div>
          <button id="unlock-button" class="unlock-button hidden">UNLOCK THORN DART · 6 SEEDS</button>
          <button id="skin-button" class="skin-button hidden">USE GOLDEN SKIN</button>
        </div>
        <div class="setting-pair"><label class="setting-row"><input id="reduced-effects" type="checkbox" /> Reduced effects</label><label class="setting-row"><input id="muted" type="checkbox" /> Mute sound</label><label id="auto-special-row" class="setting-row hidden"><input id="auto-special" type="checkbox" /> Auto special</label></div>
        <button id="resume-run-button" class="secondary-button hidden">RESUME SAVED RUN <span>➜</span></button>
        <button id="start-button" class="primary-button" disabled>ENTER THE GROVE <span>➜</span></button>
        <p class="instruction">DRAG TO MOVE <span>✧</span> AUTO ATTACK <span>✧</span> TAP SPECIAL</p>
        <div class="best-line" id="best-line"></div>
        <a class="hub-link" href="https://dsschiff.github.io/games/">ALL GAMES ↗</a>
      </div>
    </div>

    <div id="upgrade" class="screen modal-screen hidden"><div class="modal-content">
      <div class="modal-icon">✺</div><div class="overline">THE GROVE ANSWERS</div>
      <h2>Choose your growth</h2><p>Time pauses while you choose one blessing.</p>
      <div id="upgrade-cards" class="upgrade-cards"></div>
    </div></div>

    <div id="pause" class="screen modal-screen hidden"><div class="modal-content narrow">
      <div class="modal-icon">❧</div><div class="overline">A MOMENT'S REST</div><h2>Paused</h2>
      <p>Your run is saved on this device.</p>
      <button id="resume-button" class="primary-button">RETURN TO THE WILD <span>➜</span></button>
      <button id="quit-button" class="text-button">End this run</button>
    </div></div>

    <div id="result" class="screen modal-screen hidden"><div class="modal-content narrow">
      <div class="modal-icon" id="result-icon">✦</div><div class="overline" id="result-eyebrow">THE GROVE REMEMBERS</div>
      <h2 id="result-title">The wild endures</h2><p id="result-copy"></p><div id="result-build" class="result-build"></div>
      <div class="result-grid"><div><strong id="result-kills">0</strong><span>VANQUISHED</span></div><div><strong id="result-time">0:00</strong><span>SURVIVED</span></div><div><strong id="result-level">1</strong><span>LEVEL</span></div></div>
      <div class="run-breakdown"><div class="breakdown-title">YOUR JOURNEY</div>
        <div class="breakdown-row"><span>FOE DAMAGE</span><strong id="result-damage">0</strong><span>DAMAGE TAKEN</span><strong id="result-taken">0</strong></div>
        <div class="breakdown-row"><span>OBJECT DAMAGE</span><strong id="result-object-damage">0</strong><span>WARDS BROKEN</span><strong id="result-wards">0</strong></div>
        <div class="breakdown-row"><span>STAT CACHES</span><strong id="result-caches">0</strong><span>BLESSINGS</span><strong id="result-blessings">0</strong></div>
        <div id="result-regions" class="region-times"></div>
      </div>
      <div class="reward-line"><span>SEEDS EARNED</span><strong id="result-seeds">+2 ✦</strong></div>
      <button id="again-button" class="primary-button">VENTURE AGAIN <span>➜</span></button>
      <button id="menu-button" class="text-button">Return to camp</button>
    </div></div>
    <div id="toast" class="toast hidden" role="status"></div><div id="fps" class="fps hidden"></div>
  </div>
`;

function el<T extends HTMLElement = HTMLElement>(selector: string): T { return document.querySelector<T>(selector)!; }
function show(selector: string, visible: boolean): void { el(selector).classList.toggle('hidden', !visible); }
function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function notify(message: string): void {
  const toast = el('#toast'); toast.textContent = message; show('#toast', true);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => show('#toast', false), 2500);
}

function refreshMenu(): void {
  el('#seed-count').textContent = `✦ ${progress.seeds} SEEDS`;
  if (!availableHero(progress, selectedHero)) selectedHero = 'warden';
  if (!availableWeapon(progress, selectedWeapon)) selectedWeapon = HERO_INFO[selectedHero].weapon;
  const rank = masteryRank(progress.mastery[selectedHero]);
  el('#mastery-label').textContent = `MASTERY ${rank}/5`;
  el('#mastery-next').textContent = rank < 5
    ? `NEXT MASTERY: ${['GLOWFOX CHOICE', '+5 STARTING HP', 'GOLDEN HERO + WEAPON', 'SECOND WEAPON SLOT', 'AUTO SPECIAL'][rank]}`
    : 'MASTERY COMPLETE · AUTO SPECIAL AVAILABLE';
  el<HTMLImageElement>('#stage-hero').src = art(selectedHero);
  el<HTMLImageElement>('#stage-hero').classList.toggle('gold-skin', selectedSkin && rank >= 3);
  el('#hero-options').innerHTML = HERO_KEYS.map(hero => {
    const unlocked = availableHero(progress, hero);
    const hint = unlocked ? HERO_INFO[hero].title : hero === 'ranger' ? 'Clear the first region' : 'Win a full run';
    return `<button class="hero-option ${hero === selectedHero ? 'selected' : ''} ${unlocked ? '' : 'locked'}" data-hero="${hero}" ${unlocked ? '' : 'disabled'}><img src="${art(hero)}" alt=""/><span><strong>${HERO_INFO[hero].name}</strong><small>${hint}</small></span></button>`;
  }).join('');
  el('#hero-options').querySelectorAll<HTMLButtonElement>('[data-hero]').forEach(button => button.addEventListener('click', () => {
    selectedHero = button.dataset.hero as Hero;
    selectedWeapon = HERO_INFO[selectedHero].weapon;
    selectedSkin = false; refreshMenu();
  }));
  el('#hero-hint').textContent = `${HERO_INFO[selectedHero].special.toUpperCase()} · ${HERO_INFO[selectedHero].specialDescription.toUpperCase()}`;
  el('#weapon-options').innerHTML = (Object.keys(WEAPON_INFO) as Weapon[]).map(weapon => {
    const unlocked = availableWeapon(progress, weapon);
    const info = WEAPON_INFO[weapon];
    return `<button class="weapon-option ${weapon === selectedWeapon ? 'selected' : ''} ${unlocked ? '' : 'locked'}" data-weapon="${weapon}" ${unlocked ? '' : 'disabled'}><span>${info.icon}</span><small>${info.name}</small></button>`;
  }).join('');
  el('#weapon-options').querySelectorAll<HTMLButtonElement>('[data-weapon]').forEach(button => button.addEventListener('click', () => {
    selectedWeapon = button.dataset.weapon as Weapon; refreshMenu();
  }));
  el('#weapon-hint').textContent = WEAPON_INFO[selectedWeapon].description.toUpperCase();
  show('#unlock-button', !progress.thornsUnlocked && progress.seeds >= THORNS_COST && progress.bestRegion < 1);
  show('#skin-button', rank >= 3);
  el('#skin-button').textContent = selectedSkin ? 'USE CLASSIC HERO + WEAPON' : 'USE GOLDEN HERO + WEAPON';
  el<HTMLInputElement>('#reduced-effects').checked = progress.reducedEffects;
  el<HTMLInputElement>('#muted').checked = progress.muted;
  el<HTMLInputElement>('#auto-special').checked = progress.autoSpecialEnabled;
  show('#auto-special-row', rank >= 5);
  soundFx.enabled = !progress.muted;
  show('#resume-run-button', readRunSnapshot() !== null);
  el('#best-line').textContent = progress.bestKills > 0
    ? `BEST RUN · ${progress.bestKills} VANQUISHED · ${formatTime(progress.bestSeconds)} · REGION ${Math.max(1, progress.bestRegion)}`
    : 'YOUR STORY BEGINS HERE';
}

function setModal(modal: typeof activeModal): void {
  activeModal = modal;
  for (const name of ['menu', 'upgrade', 'pause', 'result']) show(`#${name}`, name === modal);
  show('#hud', modal !== 'menu' && modal !== 'result');
}

const minimap = el<HTMLCanvasElement>('#minimap');
const minimapContext = minimap.getContext('2d');
function drawMinimap(hud: HudState): void {
  if (!minimapContext) return;
  const ctx = minimapContext;
  const center = 60;
  const radius = 54;
  const point = (x: number, y: number) => ({ x: 7 + x * 106 / 1800, y: 7 + y * 106 / 1800 });
  ctx.clearRect(0, 0, 120, 120);
  ctx.save();
  ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = ['#315f4e', '#705747', '#315663'][hud.region];
  ctx.fillRect(0, 0, 120, 120);
  ctx.strokeStyle = 'rgba(242, 227, 175, .12)'; ctx.lineWidth = 1;
  for (const line of [30, 60, 90]) {
    ctx.beginPath(); ctx.moveTo(line, 0); ctx.lineTo(line, 120); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, line); ctx.lineTo(120, line); ctx.stroke();
  }
  for (const object of hud.map.objects) {
    if (!object.active && object.kind !== 'gate') continue;
    const p = point(object.x, object.y);
    ctx.beginPath(); ctx.arc(p.x, p.y, object.kind === 'gate' ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = object.kind === 'ward' ? '#ffe2a3' : object.kind === 'shrine' ? '#dca5f1' : object.kind === 'relic' ? '#ffca83' : object.active ? '#a5e8dc' : '#6b8782';
    ctx.fill();
    ctx.strokeStyle = '#173a35'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  for (const enemy of hud.map.enemies) {
    const p = point(enemy.x, enemy.y);
    ctx.beginPath(); ctx.arc(p.x, p.y, enemy.kind === 'boss' || enemy.kind === 'gatekeeper' ? 3.5 : 2, 0, Math.PI * 2);
    ctx.fillStyle = enemy.kind === 'boss' || enemy.kind === 'gatekeeper' ? '#ff9b62' : '#ed7773'; ctx.fill();
  }
  const hero = point(hud.map.x, hud.map.y);
  ctx.beginPath(); ctx.arc(hero.x, hero.y, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = '#fff0bd'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#193a36'; ctx.stroke();
  ctx.restore();
  ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#e9d49a'; ctx.lineWidth = 3; ctx.stroke();
}

function updateHud(hud: HudState): void {
  currentHud = hud;
  drawMinimap(hud);
  el('#health-number').textContent = String(Math.ceil(hud.health));
  el('#health-max').textContent = String(hud.maxHealth);
  el('#level-number').textContent = String(hud.level);
  el<HTMLElement>('#health-fill').style.width = `${Math.max(0, hud.health / hud.maxHealth * 100)}%`;
  el<HTMLElement>('#xp-fill').style.width = `${Math.max(0, hud.xp / hud.xpNeeded * 100)}%`;
  el('#kills').textContent = `${hud.kills} VANQUISHED`;
  el('#ability-name').textContent = hud.weapons.map(weapon => WEAPON_INFO[weapon.id].name.toUpperCase()).join(' + ');
  el('#timer').textContent = formatTime(hud.seconds);
  const region = REGIONS[hud.region];
  el('#objective').textContent = hud.wardsLeft > 0 ? `${region.short} · ${hud.wardsLeft} ${hud.wardsLeft === 1 ? 'WARD' : 'WARDS'}` : hud.gateOpen ? `${region.short} · ENTER GATE` : `${region.short} · HOLD GATE`;
  show('#boss-bar', hud.bossHp !== null);
  el('#boss-name').textContent = hud.region === 2 ? 'THE BRIAR KING' : 'GATE SENTINEL';
  if (hud.bossHp !== null && hud.bossMaxHp) el<HTMLElement>('#boss-fill').style.width = `${Math.max(0, hud.bossHp / hud.bossMaxHp * 100)}%`;
  el('#special-label').textContent = hud.special.toUpperCase();
  el('#special-cooldown').textContent = hud.specialCooldown <= 0 ? 'READY' : `${Math.ceil(hud.specialCooldown)}s`;
  el<HTMLButtonElement>('#special-button').disabled = hud.specialCooldown > 0;
  el('#stats').innerHTML = `
    <div class="stat-pill speed"><span>✦</span><small>SPD</small><strong>${Math.round(hud.stats.speed)}</strong></div>
    <div class="stat-pill regen"><span>♥</span><small>REG</small><strong>${hud.stats.regen.toFixed(1)}</strong></div>
    <div class="stat-pill attack"><span>⚔</span><small>ATK</small><strong>${hud.stats.attack}</strong></div>
    <div class="stat-pill defense"><span>◆</span><small>DEF</small><strong>${Math.round(hud.stats.defense * 100)}%</strong></div>
    <div class="stat-pill maxHealth"><span>✚</span><small>HP</small><strong>${hud.stats.maxHealth}</strong></div>
    <div class="stat-pill reach"><span>◎</span><small>RNG</small><strong>${Math.round(hud.stats.reach * 100)}%</strong></div>`;
}

function onUpgrade(options: Upgrade[]): void {
  const cards = el('#upgrade-cards');
  cards.innerHTML = options.map((choice, index) => {
    const info = scene.upgradeInfo(choice);
    const type = choice.startsWith('weapon:') ? 'weapon' : choice;
    return `<button class="upgrade-card ${type}" data-index="${index}"><span class="upgrade-icon">${info.icon}</span><span class="upgrade-text"><strong>${info.name}</strong><small>${info.description}</small></span><span class="upgrade-arrow">➜</span></button>`;
  }).join('');
  cards.querySelectorAll<HTMLButtonElement>('[data-index]').forEach(card => card.addEventListener('click', () => {
    scene.chooseUpgrade(options[Number(card.dataset.index)]); setModal(null);
  }));
  setModal('upgrade');
  if (debugPilot) {
    const preferred: Upgrade[] = ['weapon:axe', 'weapon:staff', 'weapon:bow', 'attack', 'regen',
      'maxHealth', 'defense', 'reach', 'splash', 'pet', 'speed', 'weapon:thorns', 'wildArsenal'];
    scene.chooseUpgrade(preferred.find(choice => options.includes(choice)) ?? options[0]);
    setModal(null);
  }
}

function onEnd(result: RunResult): void {
  const earned = seedsForRun(result.kills, result.won);
  progress = addRunToProgress(progress, result.kills, result.seconds, result.won, result.hero, result.region);
  saveProgress(progress);
  el('#result-icon').textContent = result.won ? '❧' : '✦';
  el('#result-eyebrow').textContent = result.won ? 'THE FOREST IS SAFE' : 'THE GROVE REMEMBERS';
  el('#result-title').textContent = result.won ? 'The wild endures' : 'Your story grows';
  el('#result-copy').textContent = result.won
    ? 'The Briar King falls. A quieter dawn returns to the grove.'
    : `You reached ${REGIONS[Math.min(2, result.region)].name}. Each venture opens a new path.`;
  el('#result-build').textContent = `${HERO_INFO[result.hero].name.toUpperCase()} · ${result.weapons.map(weapon => WEAPON_INFO[weapon].name.toUpperCase()).join(' + ')}`;
  el('#result-kills').textContent = String(result.kills);
  el('#result-time').textContent = formatTime(result.seconds);
  el('#result-level').textContent = String(result.level);
  el('#result-damage').textContent = Math.round(result.metrics.foeDamage).toLocaleString();
  el('#result-taken').textContent = Math.round(result.metrics.damageTaken).toLocaleString();
  el('#result-object-damage').textContent = Math.round(result.metrics.objectDamage).toLocaleString();
  el('#result-wards').textContent = String(result.metrics.wards);
  el('#result-caches').textContent = String(result.metrics.caches);
  el('#result-blessings').textContent = String(result.metrics.blessings);
  el('#result-regions').innerHTML = REGIONS.map((region, index) => `<div><span>${region.short}</span><strong>${result.metrics.regionSeconds[index] === null ? '—' : formatTime(result.metrics.regionSeconds[index]!)}</strong></div>`).join('');
  el('#result-seeds').textContent = `+${earned} ✦`;
  window.setTimeout(() => setModal('result'), 430);
}

scene = new GroveScene({
  onHud: hud => { updateHud(hud); el<HTMLButtonElement>('#start-button').disabled = false; },
  onUpgrade, onEnd, onEvent: notify,
});
game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', backgroundColor: '#183f32', antialias: true,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [scene],
});

function startRun(): void {
  const rank = masteryRank(progress.mastery[selectedHero]);
  const available = (Object.keys(WEAPON_INFO) as Weapon[]).filter(weapon => availableWeapon(progress, weapon));
  scene.beginRun(selectedHero, selectedWeapon, rank, available, progress.reducedEffects, selectedSkin, progress.autoSpecialEnabled);
  setModal(null);
}
el('#start-button').addEventListener('click', startRun);
el('#again-button').addEventListener('click', startRun);
el('#menu-button').addEventListener('click', () => { refreshMenu(); setModal('menu'); });
el('#unlock-button').addEventListener('click', () => {
  progress = unlockThorns(progress); saveProgress(progress); selectedWeapon = 'thorns';
  refreshMenu(); notify('THORN DART UNLOCKED');
});
el('#skin-button').addEventListener('click', () => { selectedSkin = !selectedSkin; refreshMenu(); });
el<HTMLInputElement>('#reduced-effects').addEventListener('change', event => {
  progress = { ...progress, reducedEffects: (event.target as HTMLInputElement).checked };
  saveProgress(progress);
});
el<HTMLInputElement>('#muted').addEventListener('change', event => {
  progress = { ...progress, muted: (event.target as HTMLInputElement).checked };
  soundFx.enabled = !progress.muted;
  saveProgress(progress);
});
el<HTMLInputElement>('#auto-special').addEventListener('change', event => {
  progress = { ...progress, autoSpecialEnabled: (event.target as HTMLInputElement).checked };
  saveProgress(progress);
});
el('#resume-run-button').addEventListener('click', () => {
  const snapshot = readRunSnapshot();
  if (!snapshot || !scene.restoreRun(snapshot)) { refreshMenu(); notify('SAVED RUN COULD NOT BE RESTORED'); return; }
  if (!scene.isChoosing()) setModal('pause');
});
el('#pause-button').addEventListener('click', () => {
  if (!scene.isRunning() || activeModal !== null) return;
  scene.setPaused(true); setModal('pause');
});
el('#resume-button').addEventListener('click', () => { scene.setPaused(false); setModal(null); });
el('#quit-button').addEventListener('click', () => { scene.endRunEarly(); refreshMenu(); setModal('menu'); });
el('#special-button').addEventListener('click', () => scene.castSpecial());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || !scene.isRunning()) return;
  scene.saveSnapshot();
  if (activeModal === null) { scene.setPaused(true); setModal('pause'); }
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && scene.isRunning()) {
    if (activeModal === null) { scene.setPaused(true); setModal('pause'); }
    else if (activeModal === 'pause') { scene.setPaused(false); setModal(null); }
  }
});
if (new URLSearchParams(location.search).has('debug')) {
  show('#fps', true);
  window.setInterval(() => { el('#fps').textContent = `${Math.round(game.loop.actualFps)} FPS · ${currentHud?.kills ?? 0} KILLS`; }, 500);
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    const controls = document.createElement('div');
    controls.className = 'debug-controls';
    controls.innerHTML = '<button data-debug="pilot">PILOT OFF</button><button data-debug="approach">APPROACH OBJECT</button><button data-debug="advance">ADVANCE REGION</button><button data-debug="heal">HEAL</button>';
    el('#ui').append(controls);
    controls.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click', () => {
      if (button.dataset.debug === 'pilot') {
        debugPilot = !debugPilot;
        scene.setDebugPilot(debugPilot);
        button.textContent = debugPilot ? 'PILOT ON' : 'PILOT OFF';
      }
      if (button.dataset.debug === 'approach') scene.debugApproachObjective();
      if (button.dataset.debug === 'advance') scene.debugAdvanceRegion();
      if (button.dataset.debug === 'heal') scene.debugHeal();
    }));
  }
}
refreshMenu();
