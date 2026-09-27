import Phaser from 'phaser';
import { GroveScene, type HudState, type RunResult } from './game/GroveScene';
import {
  HERO_INFO, HERO_KEYS, REGIONS, STAT_INFO, THORNS_COST, WEAPON_COMMAND, WEAPON_FOCUS, WEAPON_INFO, WEAPON_PATH_INFO, WEAPON_RANKS,
  addRunToProgress, availableHero, availableWeapon, masteryRank, readProgress,
  saveProgress, seedsForRun, unlockThorns,
  type Hero, type Upgrade, type Weapon,
} from './game/logic';
import { emptyWeaponDamage, readRunSnapshot } from './game/runSave';
import { soundFx } from './game/audio';
import { RESONANCE_INFO, resonanceFor } from './game/resonance';
import { seedForVergeContract, type VergeContract } from './game/objectives';
import './style.css';

const treeArt = `${import.meta.env.BASE_URL}art/ancient-tree-v1.webp`;
const heroArt = (hero: Hero) => `${import.meta.env.BASE_URL}art/${hero}-v4.webp`;
const enemyArt = (name: string) => `${import.meta.env.BASE_URL}art/${name}-v2.webp`;
const weaponArt = (weapon: Weapon) => `${import.meta.env.BASE_URL}art/weapon-${weapon}-v2.webp`;
const weaponHudName: Record<Weapon, string> = { axe: 'Axe', thorns: 'Thorns', bow: 'Sunbow', staff: 'Ember' };
const contractOrder: VergeContract[] = ['waylight', 'seedheart', 'stag'];
const contractInfo: Record<VergeContract, { name: string; mode: string; art: string; hint: string }> = {
  waylight: { name: 'Waylight Moth', mode: 'ESCORT', art: 'waylight.webp', hint: 'Stay close; clear foes from its path.' },
  seedheart: { name: 'Seedheart', mode: 'DEFEND', art: 'seedheart.webp', hint: 'Hold the ring while it awakens.' },
  stag: { name: 'Briar Stag', mode: 'HUNT', art: 'briar-stag-v1.webp', hint: 'Strike it, then pursue each retreat.' },
};
let progress = readProgress();
let selectedHero: Hero = 'warden';
let selectedWeapon: Weapon = 'axe';
let selectedSupport: Weapon = 'bow';
let selectedSkin = false;
let selectedContract: VergeContract = contractOrder[progress.mastery.warden % contractOrder.length];
let scene: GroveScene;
let game: Phaser.Game;
let currentHud: HudState | null = null;
let activeModal: 'menu' | 'upgrade' | 'pause' | 'result' | null = 'menu';
let toastTimer = 0;
let debugPilot = false;
let weaponTraySignature = '';

const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
  <div id="game"></div><div class="vignette" aria-hidden="true"></div>
  <div id="ui">
    <div id="hud" class="hud hidden">
      <div class="top-line">
        <div class="crest"><span class="crest-leaf">❧</span><span>GROVEBOUND</span></div>
        <div class="clock-wrap"><span id="timer">0:00</span><small id="timer-heading">RUN TIME · REGION 1/3</small><small id="stage-timer">GUARDIAN IN 2:55</small></div>
        <button id="pause-button" class="icon-button" aria-label="Pause game">Ⅱ</button>
      </div>
      <div class="vitals">
        <div class="health-caption"><span>♥ <strong id="health-number">100</strong> / <strong id="health-max">100</strong></span><span>LV <strong id="level-number">1</strong></span></div>
        <div class="bar health-bar"><div id="health-fill"></div></div>
        <div class="bar xp-bar"><div id="xp-fill"></div></div>
      </div>
      <div id="mission-card" class="mission-card waylight"><img id="objective-art" src="${import.meta.env.BASE_URL}art/waylight.webp" alt=""/><div class="mission-copy"><small id="mission-type">ESCORT</small><strong id="objective" aria-live="polite">STAY NEAR THE MOTH</strong><span id="mission-hint">Stay close and clear its path.</span><div class="mission-track"><i id="mission-progress"></i></div></div></div>
      <div class="minimap-frame" aria-hidden="true"><canvas id="minimap" width="120" height="120"></canvas></div>
      <div id="boss-bar" class="boss-bar hidden"><span id="boss-name">GATE SENTINEL</span><div class="bar"><div id="boss-fill"></div></div></div>
      <button id="special-button" class="special-button" aria-label="Use special ability"><span class="special-icon">✹</span><strong id="special-label">WHIRLWIND</strong><small id="special-cooldown">READY</small></button>
      <div class="hud-bottom"><div id="resonance-cue" class="resonance-cue hidden" aria-live="polite"></div><div class="loadout-heading"><strong>COMMANDS</strong><span>2 EQUIPPED · TAP TO FIRE</span></div><div id="weapon-tray" class="weapon-tray" role="group" aria-label="Weapon commands"></div><div id="stats" class="stats-strip"></div><div class="bottom-line"><span id="kills">0 VANQUISHED</span><span id="ability-name">FOCUS YOUR WEAPON</span></div></div>
    </div>

    <div id="menu" class="screen menu-screen">
      <div class="menu-content">
        <div class="overline"><span class="overline-rule"></span> A POCKET FOREST ADVENTURE <span class="overline-rule"></span></div>
        <h1>GROVE<span>BOUND</span></h1>
        <p class="subtitle">Escort, defend, deliver, or pursue across three changing regions. Face the Briar King.</p>
        <div class="hero-stage" aria-hidden="true">
          <div class="hero-halo"></div>
          <img class="stage-tree left" src="${treeArt}" alt="" />
          <img class="stage-tree right" src="${treeArt}" alt="" />
          <img class="stage-enemy" src="${enemyArt('gnarl')}" alt="" />
          <img id="stage-hero" class="stage-hero" src="${heroArt('warden')}" alt="" />
          <div class="stage-ground"></div>
        </div>
        <div class="ability-panel">
          <div class="panel-heading"><span>CHOOSE YOUR HERO</span><span id="seed-count" class="seed-count">✦ 0 SEEDS</span></div>
          <div id="hero-options" class="hero-options"></div>
          <div id="hero-hint" class="hero-hint"></div>
          <div class="panel-heading sub-heading"><span>STARTING WEAPON</span><span id="mastery-label">MASTERY 0</span></div>
          <div id="weapon-options" class="weapon-options"></div>
          <div id="weapon-hint" class="weapon-hint"></div>
          <div class="panel-heading sub-heading"><span>SUPPORT WEAPON · FIRES AUTOMATICALLY</span><span>START WITH 2</span></div>
          <div id="support-options" class="weapon-options"></div>
          <div id="resonance-preview" class="resonance-preview"></div>
          <div id="mastery-next" class="mastery-next"></div>
          <button id="unlock-button" class="unlock-button hidden">UNLOCK THORN DART · 6 SEEDS</button>
          <button id="skin-button" class="skin-button hidden">USE GOLDEN SKIN</button>
        </div>
        <div class="contract-panel"><div class="panel-heading"><span>CHOOSE YOUR VERGE MISSION</span><span>REGION 1/3</span></div><div id="contract-options" class="contract-options"></div></div>
        <div class="setting-pair"><label class="setting-row"><input id="reduced-effects" type="checkbox" /> Reduced effects</label><label class="setting-row"><input id="muted" type="checkbox" /> Mute sound</label><label id="auto-special-row" class="setting-row hidden"><input id="auto-special" type="checkbox" /> Auto special</label></div>
        <button id="resume-run-button" class="secondary-button hidden">RESUME SAVED RUN <span>➜</span></button>
        <button id="start-button" class="primary-button" disabled>ENTER THE GROVE <span>➜</span></button>
        <p class="instruction">DRAG TO MOVE <span>✧</span> BOTH WEAPONS AUTO ATTACK <span>✧</span> TAP SPECIAL<br />TAP A WEAPON SLOT TO FIRE ITS COMMAND · CHAIN TWO FOR A RESONANCE<br />BREAK GLOWING TERRAIN FOR A STAT CACHE + COMMAND REFILL · KEYS 1–3 FIRE SLOTS</p>
        <div class="best-line" id="best-line"></div>
        <a class="hub-link" href="https://dsschiff.github.io/games/">ALL GAMES ↗</a>
      </div>
    </div>

    <div id="upgrade" class="screen modal-screen hidden" role="dialog" aria-modal="true" aria-labelledby="upgrade-title"><div class="modal-content">
      <div class="modal-icon">✺</div><div class="overline">THE GROVE ANSWERS</div>
      <h2 id="upgrade-title" tabindex="-1">Choose your growth</h2><p>Time pauses while you choose one blessing.</p>
      <div id="upgrade-cards" class="upgrade-cards"></div>
    </div></div>

    <div id="pause" class="screen modal-screen hidden" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="modal-content narrow">
      <div class="modal-icon">❧</div><div class="overline">A MOMENT'S REST</div><h2 id="pause-title" tabindex="-1">Paused</h2>
      <p>Your run is saved on this device.</p>
      <button id="resume-button" class="primary-button">RETURN TO THE WILD <span>➜</span></button>
      <button id="quit-button" class="text-button">End this run</button>
    </div></div>

    <div id="result" class="screen modal-screen hidden" role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="modal-content narrow">
      <div class="modal-icon" id="result-icon">✦</div><div class="overline" id="result-eyebrow">THE GROVE REMEMBERS</div>
      <h2 id="result-title" tabindex="-1">The wild endures</h2><p id="result-copy"></p><div id="result-build" class="result-build"></div>
      <div class="result-grid"><div><strong id="result-kills">0</strong><span>VANQUISHED</span></div><div><strong id="result-time">0:00</strong><span>SURVIVED</span></div><div><strong id="result-level">1</strong><span>LEVEL</span></div></div>
      <div class="run-breakdown"><div class="breakdown-title">YOUR JOURNEY</div>
        <div class="breakdown-row"><span>FOE DAMAGE</span><strong id="result-damage">0</strong><span>DAMAGE TAKEN</span><strong id="result-taken">0</strong></div>
        <div class="breakdown-row"><span>OBJECT DAMAGE</span><strong id="result-object-damage">0</strong><span>OBJECTIVES CLEARED</span><strong id="result-wards">0</strong></div>
        <div class="breakdown-row"><span>STAT CACHES</span><strong id="result-caches">0</strong><span>BLESSINGS</span><strong id="result-blessings">0</strong></div>
        <div class="breakdown-row"><span>LANCES EVADED</span><strong id="result-lances-evaded">0</strong><span>LANCE HITS</span><strong id="result-lance-hits">0</strong></div>
        <div class="breakdown-row"><span>CHARGES EVADED</span><strong id="result-charges-evaded">0</strong><span>CHARGE HITS</span><strong id="result-charge-hits">0</strong></div>
        <div class="hazard-tally"><span>HAZARDS CLEARED</span><strong id="result-hazards">0</strong></div>
        <div class="hazard-tally"><span>TERRAIN CLEARED</span><strong id="result-terrain">0</strong></div>
        <div class="hazard-tally"><span>WEAPON RESONANCES</span><strong id="result-resonances">0</strong></div>
        <div class="breakdown-title weapon-report-title">WEAPON DAMAGE</div><div id="result-weapons" class="weapon-report"></div>
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
function compactDamage(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K` : String(Math.round(value));
}
function notify(message: string): void {
  const toast = el('#toast'); toast.textContent = message; show('#toast', true);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => show('#toast', false), 2500);
}

function refreshMenu(): void {
  root.classList.toggle('reduced-effects', progress.reducedEffects);
  el('#seed-count').textContent = `✦ ${progress.seeds} SEEDS`;
  if (!availableHero(progress, selectedHero)) selectedHero = 'warden';
  if (!availableWeapon(progress, selectedWeapon)) selectedWeapon = HERO_INFO[selectedHero].weapon;
  if (selectedSupport === selectedWeapon || !availableWeapon(progress, selectedSupport))
    selectedSupport = (Object.keys(WEAPON_INFO) as Weapon[]).find(weapon => weapon !== selectedWeapon && availableWeapon(progress, weapon)) ?? selectedWeapon;
  const rank = masteryRank(progress.mastery[selectedHero]);
  el('#mastery-label').textContent = `MASTERY ${rank}/5`;
  el('#mastery-next').textContent = rank < 5
    ? `NEXT MASTERY: ${['GLOWFOX CHOICE', '+5 STARTING HP', 'GOLDEN HERO + WEAPON', 'THIRD WEAPON SLOT', 'AUTO SPECIAL'][rank]}`
    : 'MASTERY COMPLETE · AUTO SPECIAL AVAILABLE';
  el('#contract-options').innerHTML = contractOrder.map(contract => {
    const info = contractInfo[contract];
    return `<button class="contract-option ${selectedContract === contract ? 'selected' : ''}" data-contract="${contract}" aria-pressed="${selectedContract === contract}"><img src="${import.meta.env.BASE_URL}art/${info.art}" alt=""/><span><small>${info.mode}</small><strong>${info.name}</strong></span></button>`;
  }).join('');
  el('#contract-options').querySelectorAll<HTMLButtonElement>('[data-contract]').forEach(button => button.addEventListener('click', () => {
    selectedContract = button.dataset.contract as VergeContract;
    refreshMenu();
    el<HTMLButtonElement>(`[data-contract="${selectedContract}"]`).focus({ preventScroll: true });
  }));
  el<HTMLImageElement>('#stage-hero').src = heroArt(selectedHero);
  el<HTMLImageElement>('#stage-hero').classList.toggle('gold-skin', selectedSkin && rank >= 3);
  el('#hero-options').innerHTML = HERO_KEYS.map(hero => {
    const unlocked = availableHero(progress, hero);
    const hint = unlocked ? HERO_INFO[hero].title : hero === 'ranger' ? 'Clear the first region' : 'Win a full run';
    return `<button class="hero-option ${hero === selectedHero ? 'selected' : ''} ${unlocked ? '' : 'locked'}" data-hero="${hero}" ${unlocked ? '' : 'disabled'}><img src="${heroArt(hero)}" alt=""/><span><strong>${HERO_INFO[hero].name}</strong><small>${hint}</small></span></button>`;
  }).join('');
  el('#hero-options').querySelectorAll<HTMLButtonElement>('[data-hero]').forEach(button => button.addEventListener('click', () => {
    selectedHero = button.dataset.hero as Hero;
    selectedWeapon = HERO_INFO[selectedHero].weapon;
    selectedSkin = false; refreshMenu();
    el<HTMLButtonElement>(`#hero-options [data-hero="${selectedHero}"]`).focus({ preventScroll: true });
  }));
  el('#hero-hint').textContent = `${HERO_INFO[selectedHero].special.toUpperCase()} · ${HERO_INFO[selectedHero].specialDescription.toUpperCase()}`;
  el('#weapon-options').innerHTML = (Object.keys(WEAPON_INFO) as Weapon[]).map(weapon => {
    const unlocked = availableWeapon(progress, weapon);
    const info = WEAPON_INFO[weapon];
    return `<button class="weapon-option ${weapon === selectedWeapon ? 'selected' : ''} ${unlocked ? '' : 'locked'}" data-weapon="${weapon}" aria-label="${info.name}. Command: ${WEAPON_COMMAND[weapon].name}. ${WEAPON_COMMAND[weapon].description}" ${unlocked ? '' : 'disabled'}><img src="${weaponArt(weapon)}" alt=""/><small>${info.name}</small></button>`;
  }).join('');
  el('#weapon-options').querySelectorAll<HTMLButtonElement>('[data-weapon]').forEach(button => button.addEventListener('click', () => {
    selectedWeapon = button.dataset.weapon as Weapon; refreshMenu();
    el<HTMLButtonElement>(`#weapon-options [data-weapon="${selectedWeapon}"]`).focus({ preventScroll: true });
  }));
  el('#weapon-hint').textContent = `${WEAPON_INFO[selectedWeapon].description.toUpperCase()} · COMMAND: ${WEAPON_COMMAND[selectedWeapon].name.toUpperCase()}`;
  el('#support-options').innerHTML = (Object.keys(WEAPON_INFO) as Weapon[]).map(weapon => {
    const unlocked = weapon !== selectedWeapon && availableWeapon(progress, weapon);
    return `<button class="weapon-option ${weapon === selectedSupport ? 'selected' : ''} ${unlocked ? '' : 'locked'}" data-support="${weapon}" aria-label="${WEAPON_INFO[weapon].name}. Command: ${WEAPON_COMMAND[weapon].name}. ${WEAPON_COMMAND[weapon].description}" ${unlocked ? '' : 'disabled'}><img src="${weaponArt(weapon)}" alt=""/><small>${WEAPON_INFO[weapon].name}</small></button>`;
  }).join('');
  el('#support-options').querySelectorAll<HTMLButtonElement>('[data-support]').forEach(button => button.addEventListener('click', () => {
    selectedSupport = button.dataset.support as Weapon; refreshMenu();
    el<HTMLButtonElement>(`#support-options [data-support="${selectedSupport}"]`).focus({ preventScroll: true });
  }));
  const combo = resonanceFor(selectedWeapon, selectedSupport);
  el('#resonance-preview').textContent = combo
    ? `PAIR RESONANCE · ${RESONANCE_INFO[combo].name.toUpperCase()} — ${RESONANCE_INFO[combo].description.toUpperCase()}`
    : 'CHOOSE TWO DIFFERENT WEAPONS TO UNLOCK A RESONANCE';
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
  el('#game').inert = modal !== null;
  el('#hud').inert = modal !== null;
  if (modal === null) {
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    if (canvas) {
      canvas.tabIndex = 0;
      canvas.setAttribute('aria-label', 'Game field. Drag to move, or use W A S D or arrow keys. Press Space for your special ability, keys 1 through 3 for weapon commands, and F to mark nearby terrain.');
      canvas.focus({ preventScroll: true });
    }
    return;
  }
  const focusTarget = modal === 'menu' ? '#resume-run-button:not(.hidden), #start-button'
    : modal === 'upgrade' ? '#upgrade-title'
      : modal === 'pause' ? '#pause-title' : '#result-title';
  document.querySelector<HTMLElement>(focusTarget)?.focus({ preventScroll: true });
}

const minimap = el<HTMLCanvasElement>('#minimap');
const minimapContext = minimap.getContext('2d');
const mapArtFiles = {
  waylight: 'waylight.webp', seedheart: 'seedheart.webp', stag: 'briar-stag-v1.webp',
  pump: 'coolant-pump.webp', coolant: 'coolant-spring.webp', forge: 'forge-core.webp',
  moonflame: 'moonflame.webp', bloom: 'mist-bloom.webp', altar: 'moon-altar.webp',
  shrine: 'reliquary.webp', relic: 'fox-relic.webp', gate: 'grove-gate.webp',
  ward: 'root-totem.webp', vent: 'ember-vent.webp', bramble: 'bramble-field.webp',
  ore: 'ember-ore.webp', moonstone: 'moonstone.webp',
};
const mapArt = Object.fromEntries(Object.entries(mapArtFiles).map(([kind, file]) => {
  const image = new Image(); image.src = `${import.meta.env.BASE_URL}art/${file}`;
  return [kind, image];
})) as Record<string, HTMLImageElement>;
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
    ctx.save(); ctx.translate(p.x, p.y);
    const mission = object.active && object.kind === hud.objectiveName;
    const icon = mapArt[object.kind];
    if (icon?.complete && icon.naturalWidth > 0) {
      const size = mission ? 24 : object.kind === 'gate' ? 15 : object.kind === 'shrine' || object.kind === 'relic' ? 13 : 16;
      if (mission) {
        ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fillStyle = '#173a35'; ctx.fill(); ctx.strokeStyle = '#fff1bf'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.drawImage(icon, -size / 2, -size / 2, size, size);
      ctx.restore();
      continue;
    }
    ctx.fillStyle = { ward: '#ffe2a3', waylight: '#fff0b1', seedheart: '#b9f1a8', stag: '#ffce78', pump: '#9ae8ec', coolant: '#a3fff0',
      forge: '#ffae68', altar: '#d9c2ff', moonflame: '#d6b7ff',
      shrine: '#dca5f1', relic: '#ffca83', gate: object.active ? '#a5e8dc' : '#6b8782',
      vent: '#ff965d', bloom: '#a8d9ef', bramble: '#b8e898', ore: '#ffb16b', moonstone: '#c4adff' }[object.kind];
    ctx.strokeStyle = '#173a35'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (object.kind === 'ward') { ctx.moveTo(0, -5); ctx.lineTo(5, 0); ctx.lineTo(0, 5); ctx.lineTo(-5, 0); ctx.closePath(); }
    else if (object.kind === 'waylight') {
      ctx.ellipse(-3, -1, 3, 4, -.5, 0, Math.PI * 2); ctx.moveTo(6, -1); ctx.ellipse(3, -1, 3, 4, .5, 0, Math.PI * 2);
    }
    else if (object.kind === 'seedheart') {
      for (const [x, y] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { ctx.moveTo(x + 3, y); ctx.arc(x, y, 3, 0, Math.PI * 2); }
    }
    else if (object.kind === 'stag') {
      ctx.ellipse(0, 1, 3, 4, 0, 0, Math.PI * 2);
      ctx.moveTo(-2, -2); ctx.lineTo(-6, -6); ctx.lineTo(-7, -9);
      ctx.moveTo(-5, -5); ctx.lineTo(-2, -9);
      ctx.moveTo(2, -2); ctx.lineTo(6, -6); ctx.lineTo(7, -9);
      ctx.moveTo(5, -5); ctx.lineTo(2, -9);
    }
    else if (object.kind === 'coolant') ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2);
    else if (object.kind === 'moonflame') ctx.ellipse(0, 0, 3, 6, -.6, 0, Math.PI * 2);
    else if (object.kind === 'forge' || object.kind === 'ore') ctx.rect(-5, -5, 10, 10);
    else if (object.kind === 'moonstone') { ctx.moveTo(0, -6); ctx.lineTo(5, 3); ctx.lineTo(0, 6); ctx.lineTo(-5, 3); ctx.closePath(); }
    else if (object.kind === 'bloom') {
      for (const [x, y] of [[0, -3], [3, 0], [0, 3], [-3, 0]]) { ctx.moveTo(x + 2.5, y); ctx.arc(x, y, 2.5, 0, Math.PI * 2); }
    } else ctx.arc(0, 0, object.kind === 'gate' ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    if (object.kind === 'pump') { ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fillStyle = '#173a35'; ctx.fill(); }
    if (object.kind === 'altar') { ctx.beginPath(); ctx.arc(1, -1, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#173a35'; ctx.fill(); }
    if (object.active && object.kind === hud.objectiveName) {
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.strokeStyle = '#fff3c8'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }
  for (const enemy of hud.map.enemies) {
    const p = point(enemy.x, enemy.y);
    ctx.beginPath();
    if (enemy.kind === 'thornback') ctx.ellipse(p.x, p.y, 4.5, 3, 0, 0, Math.PI * 2);
    else ctx.arc(p.x, p.y, enemy.kind === 'boss' || enemy.kind === 'gatekeeper' ? 3.5 : 2, 0, Math.PI * 2);
    ctx.fillStyle = enemy.kind === 'thornback' ? '#ffcf7f'
      : enemy.kind === 'boss' || enemy.kind === 'gatekeeper' ? '#ff9b62' : '#ed7773'; ctx.fill();
    if (enemy.kind === 'thornback') {
      ctx.strokeStyle = '#ffecb5'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(p.x - 4, p.y - 2); ctx.lineTo(p.x - 6, p.y - 5);
      ctx.moveTo(p.x + 4, p.y - 2); ctx.lineTo(p.x + 6, p.y - 5); ctx.stroke();
    }
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
  el('#ability-name').textContent = hud.moonflowRemaining > 0
    ? `MOONFLOW · SPEED +28% · ${Math.ceil(hud.moonflowRemaining)}s`
    : hud.markedFieldName ? `TARGETING ${hud.markedFieldName.toUpperCase()} · BREAK FOR BURST`
    : hud.terrainHint
    ?? `FOCUS ${WEAPON_INFO[hud.focusedWeapon].name.toUpperCase()} · ${WEAPON_FOCUS[hud.focusedWeapon].toUpperCase()}`;
  el('#timer').textContent = formatTime(hud.seconds);
  const region = REGIONS[hud.region];
  el('#timer-heading').textContent = `${hud.surge ? 'WILD SURGE' : 'RUN TIME'} · REGION ${hud.region + 1}/3`;
  el('#timer-heading').classList.toggle('surge', hud.surge);
  const gateCountdown = Math.max(0, region.duration - hud.stageSeconds);
  el('#stage-timer').textContent = hud.gateOpen ? 'PORTAL OPEN' : hud.bossHp !== null ? 'GUARDIAN FIGHT'
    : gateCountdown > 0 ? `GUARDIAN IN ${formatTime(gateCountdown)}`
      : hud.objectivesLeft > 0 ? 'GUARDIAN WAITS FOR OBJECTIVES' : 'GUARDIAN ARRIVING';
  const task = { ward: 'BREAK ROOT TOTEMS', waylight: 'GUIDE THE WAYLIGHT', seedheart: 'DEFEND THE SEEDHEART', stag: 'INTERCEPT THE BRIAR STAG', pump: 'DRAIN COOLANT PUMP',
    coolant: 'FILL A COOLANT FLASK', forge: hud.coolantCarryRemaining > 0 ? 'DELIVER COOLANT TO FORGE' : 'BREAK FORGE CORE',
    moonflame: 'CHASE THE MOONFLAME', bloom: 'CLEAR MIST BLOOMS', altar: hud.ritualActive ? 'COMPLETE THE MOON RITE' : 'BREAK MOON ALTAR' }[hud.objectiveName ?? ''] ?? 'CLEAR OBJECTIVES';
  const objective = hud.objectivesLeft > 0 ? hud.objectiveName === 'stag'
    ? `CHASE & STRIKE · ${hud.stepProgress}/3 BREAKS` : hud.objectiveName === 'seedheart'
    ? `GUARD THE RING · ${hud.stepProgress}/15s` : hud.objectiveName === 'pump'
    ? `STAND IN PUMP RING · ${hud.stepProgress}/4s` : hud.objectiveName === 'waylight'
      ? `STAY NEAR THE MOTH · ${hud.stepProgress}% HOME` : hud.objectiveName === 'coolant'
        ? `FILL FLASK AT SPRING · ${hud.stepProgress}/2s` : hud.objectiveName === 'forge' && hud.coolantCarryRemaining > 0
          ? `REACH FORGE · ${Math.ceil(hud.coolantCarryRemaining)}s · ${hud.stepProgress}/3` : hud.objectiveName === 'moonflame'
            ? `CATCH THE MOVING FLAME · ${hud.stepProgress}/3` : hud.ritualActive
        ? `DEFEAT FOES BY ALTAR · ${hud.stepProgress}/6` : `${task} · ${hud.stepTargetsLeft} LEFT`
    : hud.gateOpen ? 'ENTER THE PORTAL' : hud.bossHp !== null ? 'DEFEAT THE GUARDIAN' : 'HOLD FOR THE GUARDIAN';
  if (el('#objective').textContent !== objective) el('#objective').textContent = objective;
  const missionKind = hud.objectiveName ?? (hud.bossHp !== null ? 'boss' : hud.gateOpen ? 'gate' : 'hold');
  const missionMode = { waylight: 'ESCORT', seedheart: 'DEFEND', stag: 'HUNT', pump: 'CHANNEL', coolant: 'CHARGE',
    forge: hud.coolantCarryRemaining > 0 ? 'DELIVER' : 'DESTROY', moonflame: 'PURSUIT', bloom: 'PURGE', altar: 'RITUAL',
    boss: 'BOSS', gate: 'ESCAPE', hold: 'SURVIVE', ward: 'DESTROY' }[missionKind] ?? 'MISSION';
  el('#mission-type').textContent = `${REGIONS[hud.region].short} · ${missionMode}`;
  const missionHint = {
    waylight: 'Stay close; clear its path.', seedheart: 'Hold the ring; defeat nearby foes.',
    stag: 'Strike, then pursue each retreat.', pump: 'Stand in the ring; expose the forge.',
    coolant: 'Fill the flask at the spring.', forge: hud.coolantCarryRemaining > 0 ? 'Race to the forge before it warms.' : 'Break the exposed core.',
    moonflame: 'Catch three sparks across the fen.', bloom: 'Destroy blooms to open the rite.',
    altar: hud.ritualActive ? 'Defeat foes beside the altar.' : 'Break the altar to begin the rite.',
    boss: 'Dodge its marks; use your commands.', gate: 'Cross the portal to continue.',
    hold: 'Survive until the guardian arrives.', ward: 'Destroy the marked totems.',
  }[missionKind] ?? 'Follow the marked objective.';
  if (el('#mission-hint').textContent !== missionHint) el('#mission-hint').textContent = missionHint;
  el('#mission-card').className = `mission-card ${missionKind}`;
  el<HTMLElement>('#mission-progress').style.width = `${Math.max(0, Math.min(100, hud.objectiveProgress))}%`;
  const objectiveArt = hud.objectiveName ? {
    ward: 'root-totem.webp', waylight: 'waylight.webp', seedheart: 'seedheart.webp', stag: 'briar-stag-v1.webp', pump: 'coolant-pump.webp',
    coolant: 'coolant-spring.webp', forge: 'forge-core.webp', moonflame: 'moonflame.webp',
    bloom: 'mist-bloom.webp', altar: 'moon-altar.webp',
  }[hud.objectiveName] : hud.bossHp !== null ? 'briar-king-v2.webp' : 'grove-gate.webp';
  const objectiveSrc = `${import.meta.env.BASE_URL}art/${objectiveArt ?? 'grove-gate.webp'}`;
  if (el<HTMLImageElement>('#objective-art').src !== new URL(objectiveSrc, location.href).href)
    el<HTMLImageElement>('#objective-art').src = objectiveSrc;
  const traySignature = `${hud.weaponSlots}|${hud.focusedWeapon}|${hud.weapons.map(weapon => `${weapon.id}:${weapon.rank}:${weapon.path ?? ''}`).join(',')}`;
  el('.loadout-heading span').textContent = `${hud.weapons.length} EQUIPPED · TAP TO FIRE`;
  const cue = el('#resonance-cue');
  show('#resonance-cue', !!hud.commandChain && hud.possibleResonances.length > 0);
  if (hud.commandChain && hud.possibleResonances.length) {
    const names = hud.possibleResonances.map(item => `${weaponHudName[item.weapon]} → ${RESONANCE_INFO[item.resonance].name}`);
    const label = `CHAIN ${Math.ceil(hud.commandChain.remaining)}s · ${names.join(' · ')}`;
    if (cue.textContent !== label) cue.textContent = label;
  }
  if (traySignature !== weaponTraySignature) {
    weaponTraySignature = traySignature;
    el('#weapon-tray').classList.toggle('full', hud.weapons.length >= 3);
    el('#weapon-tray').classList.toggle('two', hud.weapons.length === 2 && hud.weaponSlots === 2);
    el('#weapon-tray').innerHTML = Array.from({ length: hud.weaponSlots }, (_, index) => {
      const weapon = hud.weapons[index];
      if (!weapon) return `<div class="weapon-slot empty"><small>SLOT ${index + 1} · OPEN</small><span>FIND A WEAPON</span></div>`;
      const focused = weapon.id === hud.focusedWeapon;
      const pathName = weapon.path ? WEAPON_PATH_INFO[weapon.id][weapon.path].name : null;
      return `<button class="weapon-slot equipped ${focused ? 'focused' : ''}" data-focus="${weapon.id}" aria-pressed="${focused}" aria-label="${WEAPON_COMMAND[weapon.id].name}: ${WEAPON_COMMAND[weapon.id].description}. Tap to fire and focus slot ${index + 1}, rank ${weapon.rank}${pathName ? `, ${pathName} technique` : ''}"><small>SLOT ${index + 1} · ${focused ? 'FOCUSED' : 'AUTO'}</small><span class="weapon-identity"><img src="${weaponArt(weapon.id)}" alt=""/>${weaponHudName[weapon.id].toUpperCase()} · ${['I', 'II', 'III'][weapon.rank - 1]}</span><div class="slot-detail"><em>${pathName ?? WEAPON_RANKS[weapon.id][weapon.rank - 1]}</em><strong data-weapon-damage="${weapon.id}">0 DMG</strong></div><b class="command-status" data-command="${weapon.id}">${WEAPON_COMMAND[weapon.id].slotName} · READY</b><i class="weapon-charge" data-charge="${weapon.id}"></i></button>`;
    }).join('');
  }
  for (const weapon of hud.weapons) {
    const charge = el<HTMLElement>(`[data-charge="${weapon.id}"]`);
    const commandRemaining = weapon.commandCooldown ?? 0;
    charge.style.width = `${Math.max(0, Math.min(100, (1 - commandRemaining / 8) * 100))}%`;
    el(`[data-command="${weapon.id}"]`).textContent = commandRemaining <= 0
      ? `${WEAPON_COMMAND[weapon.id].slotName} · READY` : `${WEAPON_COMMAND[weapon.id].slotName} · ${Math.ceil(commandRemaining)}s`;
    const button = el<HTMLButtonElement>(`[data-focus="${weapon.id}"]`);
    const label = `${WEAPON_COMMAND[weapon.id].name}: ${WEAPON_COMMAND[weapon.id].description}. ${commandRemaining <= 0
      ? 'Ready to fire' : `Recharges in ${Math.ceil(commandRemaining)} seconds`}. Tap to focus slot ${hud.weapons.indexOf(weapon) + 1}, rank ${weapon.rank}`;
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
    el(`[data-focus="${weapon.id}"]`).classList.toggle('ready', commandRemaining <= 0);
    el(`[data-weapon-damage="${weapon.id}"]`).textContent = `${compactDamage(hud.weaponDamage[weapon.id])} DMG`;
  }
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
    const weaponChoice = choice.startsWith('weapon:') || choice.startsWith('path:');
    const type = weaponChoice ? 'weapon' : choice;
    const icon = weaponChoice ? `<img src="${weaponArt((choice.startsWith('path:') ? choice.split(':')[1] : choice.slice(7)) as Weapon)}" alt=""/>` : info.icon;
    return `<button class="upgrade-card ${type}" data-index="${index}"><span class="upgrade-icon">${icon}</span><span class="upgrade-text"><strong>${info.name}</strong><small>${info.description}</small></span><span class="upgrade-arrow">➜</span></button>`;
  }).join('');
  cards.querySelectorAll<HTMLButtonElement>('[data-index]').forEach(card => card.addEventListener('click', () => {
    scene.chooseUpgrade(options[Number(card.dataset.index)]); setModal(null);
  }));
  setModal('upgrade');
  if (debugPilot) {
    const preferred: Upgrade[] = ['path:axe:a', 'path:bow:b', 'path:staff:a', 'path:thorns:b',
      'weapon:axe', 'weapon:staff', 'weapon:bow', 'attack', 'regen',
      'maxHealth', 'defense', 'reach', 'splash', 'pet', 'speed', 'weapon:thorns', 'wildArsenal'];
    scene.chooseUpgrade(preferred.find(choice => options.includes(choice)) ?? options[0]);
    setModal(null);
  }
}

function onEnd(result: RunResult): void {
  const earned = seedsForRun(result.kills, result.won);
  progress = addRunToProgress(progress, result.kills, result.seconds, result.won, result.hero, result.region);
  selectedContract = contractOrder[progress.mastery[result.hero] % contractOrder.length];
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
  el('#result-lances-evaded').textContent = String(result.metrics.lancesEvaded ?? 0);
  el('#result-lance-hits').textContent = String(result.metrics.lanceHits ?? 0);
  el('#result-charges-evaded').textContent = String(result.metrics.chargesEvaded ?? 0);
  el('#result-charge-hits').textContent = String(result.metrics.chargeHits ?? 0);
  el('#result-hazards').textContent = String(result.metrics.hazards);
  el('#result-terrain').textContent = String(result.metrics.terrain ?? 0);
  el('#result-resonances').textContent = String(result.metrics.resonances ?? 0);
  const weaponDamage = result.metrics.weaponDamage ?? emptyWeaponDamage();
  const highestWeapon = Math.max(1, ...result.weapons.map(weapon => weaponDamage[weapon]));
  const rows = result.weapons.map(weapon => `<div class="weapon-report-row"><img src="${weaponArt(weapon)}" alt=""/><span>${WEAPON_INFO[weapon].name}</span><div class="weapon-report-track"><i style="width:${Math.max(2, weaponDamage[weapon] / highestWeapon * 100)}%;background:${WEAPON_INFO[weapon].color}"></i></div><strong>${Math.round(weaponDamage[weapon]).toLocaleString()}</strong></div>`);
  const otherDamage = Math.max(0, result.metrics.foeDamage - Object.values(weaponDamage).reduce((total, value) => total + value, 0));
  if (otherDamage > 0) rows.push(`<div class="weapon-report-row other"><span>SPECIAL + PET + FIELD</span><strong>${Math.round(otherDamage).toLocaleString()}</strong></div>`);
  el('#result-weapons').innerHTML = rows.join('');
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
  const localSeed = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? Number(new URLSearchParams(location.search).get('seed')) : undefined;
  const randomSeed = (Math.random() * 0xffffffff) >>> 0 || 1;
  const contractSeed = seedForVergeContract(randomSeed, selectedContract);
  scene.beginRun(selectedHero, selectedWeapon, rank, available, progress.reducedEffects, selectedSkin, progress.autoSpecialEnabled,
    selectedSupport, localSeed || contractSeed);
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
  root.classList.toggle('reduced-effects', progress.reducedEffects);
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
el('#weapon-tray').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-focus]');
  if (button) scene.focusWeapon(button.dataset.focus as Weapon);
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || !scene.isRunning()) return;
  scene.saveSnapshot();
  if (activeModal === null) { scene.setPaused(true); setModal('pause'); }
});
window.addEventListener('keydown', event => {
  if (activeModal === null && ['1', '2', '3'].includes(event.key)) {
    const weapon = currentHud?.weapons[Number(event.key) - 1];
    if (weapon) { event.preventDefault(); scene.focusWeapon(weapon.id); }
  }
  if (event.key === 'Tab' && activeModal !== null && activeModal !== 'menu') {
    const dialog = el(`#${activeModal}`);
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (focusable.length > 0) {
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
      else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0].focus(); }
    }
  }
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
    controls.innerHTML = '<button data-debug="pilot">PILOT OFF</button><button data-debug="growth">GROWTH CARD</button><button data-debug="build">MAX BUILD</button><button data-debug="approach">APPROACH OBJECT</button><button data-debug="hazard">APPROACH HAZARD</button><button data-debug="shatter">SHATTER HAZARD</button><button data-debug="terrain">INSPECT FIELD</button><button data-debug="mark-field">TARGET FIELD</button><button data-debug="clear-terrain">CLEAR FIELD</button><button data-debug="advance">ADVANCE REGION</button><button data-debug="boss">SUMMON BOSS</button><button data-debug="mark">MARK HERO</button><button data-debug="wisp">WISP LANCE</button><button data-debug="thornback">THORNBACK CHARGE</button><button data-debug="sidestep">SIDESTEP CHARGE</button><button data-debug="heal">HEAL</button>';
    el('#ui').append(controls);
    controls.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click', () => {
      if (button.dataset.debug === 'pilot') {
        debugPilot = !debugPilot;
        scene.setDebugPilot(debugPilot);
        button.textContent = debugPilot ? 'PILOT ON' : 'PILOT OFF';
      }
      if (button.dataset.debug === 'approach') scene.debugApproachObjective();
      if (button.dataset.debug === 'growth') scene.debugOfferUpgrade();
      if (button.dataset.debug === 'build') scene.debugMaxBuild();
      if (button.dataset.debug === 'hazard') scene.debugApproachHazard();
      if (button.dataset.debug === 'shatter') scene.debugShatterHazard();
      if (button.dataset.debug === 'terrain') scene.debugInspectTerrain();
      if (button.dataset.debug === 'mark-field') scene.debugMarkTerrain();
      if (button.dataset.debug === 'clear-terrain') scene.debugClearTerrain();
      if (button.dataset.debug === 'advance') scene.debugAdvanceRegion();
      if (button.dataset.debug === 'boss') scene.debugSummonBoss();
    if (button.dataset.debug === 'mark') scene.debugMarkBoss();
      if (button.dataset.debug === 'wisp') scene.debugMarkWisp();
      if (button.dataset.debug === 'thornback') scene.debugSummonThornback();
      if (button.dataset.debug === 'sidestep') scene.debugSidestepThornback();
      if (button.dataset.debug === 'heal') scene.debugHeal();
    }));
  }
}
refreshMenu();
