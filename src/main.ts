import Phaser from 'phaser';
import { GroveScene, type HudState, type RunResult } from './game/GroveScene';
import { STAT_INFO, THORNS_COST, addRunToProgress, readProgress, saveProgress, seedsForRun, unlockThorns, type Ability, type Stat } from './game/logic';
import './style.css';

const art = (name: string) => `${import.meta.env.BASE_URL}art/${name}.svg`;
let progress = readProgress();
let selectedAbility: Ability = 'axe';
let scene: GroveScene;
let game: Phaser.Game;
let currentHud: HudState | null = null;
let activeModal: 'menu' | 'upgrade' | 'pause' | 'result' | null = 'menu';

const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
  <div id="game"></div>
  <div class="vignette" aria-hidden="true"></div>
  <div id="ui">
    <div id="hud" class="hud hidden">
      <div class="top-line">
        <div class="crest"><span class="crest-leaf">❧</span><span>GROVEBOUND</span></div>
        <div class="clock-wrap"><span id="timer">05:00</span><small id="objective">UNTIL THE BRIAR KING</small></div>
        <button id="pause-button" class="icon-button" aria-label="Pause game">Ⅱ</button>
      </div>
      <div class="vitals">
        <div class="health-caption"><span>♥ <strong id="health-number">100</strong> / 100</span><span>LV <strong id="level-number">1</strong></span></div>
        <div class="bar health-bar"><div id="health-fill"></div></div>
        <div class="bar xp-bar"><div id="xp-fill"></div></div>
      </div>
      <div id="boss-bar" class="boss-bar hidden"><span>THE BRIAR KING</span><div class="bar"><div id="boss-fill"></div></div></div>
      <div class="hud-bottom">
        <div id="stats" class="stats-strip"></div>
        <div class="bottom-line"><span id="kills">0 VANQUISHED</span><span id="ability-name">AXE CLEAVE</span></div>
      </div>
    </div>

    <div id="menu" class="screen menu-screen">
      <div class="menu-content">
        <div class="overline"><span class="overline-rule"></span> A POCKET FOREST ADVENTURE <span class="overline-rule"></span></div>
        <h1>GROVE<span>BOUND</span></h1>
        <p class="subtitle">Hold the wild. Grow stronger. Face what wakes beneath the trees.</p>
        <div class="hero-stage" aria-hidden="true">
          <div class="hero-halo"></div>
          <img class="stage-tree left" src="${art('tree')}" alt="" />
          <img class="stage-tree right" src="${art('tree')}" alt="" />
          <img class="stage-enemy" src="${art('gnarl')}" alt="" />
          <img class="stage-hero" src="${art('warden')}" alt="" />
          <img class="stage-axe" src="${art('axe')}" alt="" />
          <div class="stage-ground"></div>
        </div>
        <div class="ability-panel">
          <div class="panel-heading"><span>YOUR STARTING GIFT</span><span id="seed-count" class="seed-count">✦ 0 SEEDS</span></div>
          <div class="ability-options">
            <button id="axe-option" class="ability-option selected"><span class="ability-icon">⚔</span><span><strong>Axe Cleave</strong><small>Close-range sweeping strike</small></span></button>
            <button id="thorn-option" class="ability-option locked"><span class="ability-icon">✺</span><span><strong>Thorn Dart</strong><small id="thorn-description">Unlock with 6 seeds</small></span></button>
          </div>
          <button id="unlock-button" class="unlock-button hidden">UNLOCK THORN DART · 6 SEEDS</button>
        </div>
        <button id="start-button" class="primary-button" disabled>ENTER THE GROVE <span>➜</span></button>
        <p class="instruction">DRAG ANYWHERE TO MOVE <span>✧</span> ATTACKS FIRE AUTOMATICALLY</p>
        <div class="best-line" id="best-line"></div>
      </div>
    </div>

    <div id="upgrade" class="screen modal-screen hidden">
      <div class="modal-content">
        <div class="modal-icon">✺</div>
        <div class="overline">THE GROVE ANSWERS</div>
        <h2>Choose your growth</h2>
        <p>Time pauses while you choose one blessing.</p>
        <div id="upgrade-cards" class="upgrade-cards"></div>
      </div>
    </div>

    <div id="pause" class="screen modal-screen hidden">
      <div class="modal-content narrow">
        <div class="modal-icon">❧</div>
        <div class="overline">A MOMENT'S REST</div>
        <h2>Paused</h2>
        <p>The grove will wait for you.</p>
        <button id="resume-button" class="primary-button">RETURN TO THE GROVE <span>➜</span></button>
        <button id="quit-button" class="text-button">End this run</button>
      </div>
    </div>

    <div id="result" class="screen modal-screen hidden">
      <div class="modal-content narrow">
        <div class="modal-icon" id="result-icon">✦</div>
        <div class="overline" id="result-eyebrow">THE GROVE REMEMBERS</div>
        <h2 id="result-title">The wild endures</h2>
        <p id="result-copy"></p>
        <div class="result-grid"><div><strong id="result-kills">0</strong><span>VANQUISHED</span></div><div><strong id="result-time">0:00</strong><span>SURVIVED</span></div><div><strong id="result-level">1</strong><span>LEVEL</span></div></div>
        <div class="reward-line"><span>SEEDS EARNED</span><strong id="result-seeds">+2 ✦</strong></div>
        <button id="again-button" class="primary-button">VENTURE AGAIN <span>➜</span></button>
        <button id="menu-button" class="text-button">Return to camp</button>
      </div>
    </div>
    <div id="toast" class="toast hidden" role="status"></div>
    <div id="fps" class="fps hidden"></div>
  </div>
`;

function el<T extends HTMLElement = HTMLElement>(selector: string): T { return document.querySelector<T>(selector)!; }
function show(selector: string, visible: boolean): void { el(selector).classList.toggle('hidden', !visible); }
function formatTime(seconds: number): string { const s = Math.max(0, Math.floor(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function notify(message: string): void {
  const toast = el('#toast');
  toast.textContent = message;
  show('#toast', true);
  window.setTimeout(() => show('#toast', false), 2600);
}

function refreshMenu(): void {
  el('#seed-count').textContent = `✦ ${progress.seeds} SEEDS`;
  const thorn = el<HTMLButtonElement>('#thorn-option');
  thorn.classList.toggle('locked', !progress.thornsUnlocked);
  el('#thorn-description').textContent = progress.thornsUnlocked ? 'Ranged seeking strike' : `Unlock with ${THORNS_COST} seeds`;
  show('#unlock-button', !progress.thornsUnlocked && progress.seeds >= THORNS_COST);
  el('#axe-option').classList.toggle('selected', selectedAbility === 'axe');
  thorn.classList.toggle('selected', selectedAbility === 'thorns');
  el('#best-line').textContent = progress.bestKills > 0 ? `BEST RUN  ·  ${progress.bestKills} VANQUISHED  ·  ${formatTime(progress.bestSeconds)}` : 'YOUR STORY BEGINS HERE';
}

function setModal(modal: typeof activeModal): void {
  activeModal = modal;
  for (const name of ['menu', 'upgrade', 'pause', 'result']) show(`#${name}`, name === modal);
  show('#hud', modal !== 'menu' && modal !== 'result');
}

function updateHud(hud: HudState): void {
  currentHud = hud;
  el('#health-number').textContent = String(Math.ceil(hud.health));
  el('#level-number').textContent = String(hud.level);
  el<HTMLElement>('#health-fill').style.width = `${Math.max(0, hud.health / hud.maxHealth * 100)}%`;
  el<HTMLElement>('#xp-fill').style.width = `${Math.max(0, hud.xp / hud.xpNeeded * 100)}%`;
  el('#kills').textContent = `${hud.kills} VANQUISHED`;
  el('#ability-name').textContent = hud.ability === 'axe' ? 'AXE CLEAVE' : 'THORN DART';
  const untilBoss = 300 - hud.seconds;
  el('#timer').textContent = untilBoss > 0 ? formatTime(untilBoss) : formatTime(hud.seconds - 300);
  el('#objective').textContent = untilBoss > 0 ? 'UNTIL THE BRIAR KING' : 'DEFEAT THE BRIAR KING';
  show('#boss-bar', hud.bossHp !== null);
  if (hud.bossHp !== null && hud.bossMaxHp) el<HTMLElement>('#boss-fill').style.width = `${Math.max(0, hud.bossHp / hud.bossMaxHp * 100)}%`;
  el('#stats').innerHTML = `
    <div class="stat-pill speed"><span>✦</span><small>SPD</small><strong>${Math.round(hud.stats.speed)}</strong></div>
    <div class="stat-pill regen"><span>♥</span><small>REGEN</small><strong>${hud.stats.regen.toFixed(1)}</strong></div>
    <div class="stat-pill attack"><span>⚔</span><small>ATK</small><strong>${hud.stats.attack}</strong></div>
    <div class="stat-pill defense"><span>◆</span><small>DEF</small><strong>${Math.round(hud.stats.defense * 100)}%</strong></div>`;
}

function onUpgrade(options: Stat[]): void {
  const cards = el('#upgrade-cards');
  cards.innerHTML = options.map(stat => `<button class="upgrade-card ${stat}" data-stat="${stat}"><span class="upgrade-icon">${STAT_INFO[stat].icon}</span><span class="upgrade-text"><strong>${STAT_INFO[stat].name}</strong><small>${STAT_INFO[stat].description}</small></span><span class="upgrade-arrow">➜</span></button>`).join('');
  cards.querySelectorAll<HTMLButtonElement>('[data-stat]').forEach(card => card.addEventListener('click', () => {
    scene.chooseUpgrade(card.dataset.stat as Stat);
    setModal(null);
  }));
  setModal('upgrade');
}

function onEnd(result: RunResult): void {
  const earned = seedsForRun(result.kills, result.won);
  progress = addRunToProgress(progress, result.kills, result.seconds, result.won);
  saveProgress(progress);
  el('#result-icon').textContent = result.won ? '❧' : '✦';
  el('#result-eyebrow').textContent = result.won ? 'THE FOREST IS SAFE' : 'THE GROVE REMEMBERS';
  el('#result-title').textContent = result.won ? 'The wild endures' : 'Your story grows';
  el('#result-copy').textContent = result.won ? 'The Briar King falls. A quieter dawn returns to the grove.' : 'Every venture leaves its mark. Carry what you learned into the next.';
  el('#result-kills').textContent = String(result.kills);
  el('#result-time').textContent = formatTime(result.seconds);
  el('#result-level').textContent = String(result.level);
  el('#result-seeds').textContent = `+${earned} ✦`;
  setModal('result');
}

scene = new GroveScene({ onHud: hud => { updateHud(hud); el<HTMLButtonElement>('#start-button').disabled = false; }, onUpgrade, onEnd, onBoss: () => notify('THE BRIAR KING AWAKENS') });
game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#183f32',
  antialias: true,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [scene],
});

el('#axe-option').addEventListener('click', () => { selectedAbility = 'axe'; refreshMenu(); });
el('#thorn-option').addEventListener('click', () => {
  if (!progress.thornsUnlocked) { notify(`Collect ${THORNS_COST} seeds to unlock Thorn Dart`); return; }
  selectedAbility = 'thorns'; refreshMenu();
});
el('#unlock-button').addEventListener('click', () => {
  progress = unlockThorns(progress);
  saveProgress(progress);
  selectedAbility = 'thorns';
  refreshMenu();
  notify('THORN DART UNLOCKED');
});
function startRun(): void { scene.beginRun(selectedAbility); setModal(null); }
el('#start-button').addEventListener('click', startRun);
el('#again-button').addEventListener('click', startRun);
el('#menu-button').addEventListener('click', () => { refreshMenu(); setModal('menu'); });
el('#pause-button').addEventListener('click', () => { if (!scene.isRunning() || activeModal !== null) return; scene.setPaused(true); setModal('pause'); });
el('#resume-button').addEventListener('click', () => { scene.setPaused(false); setModal(null); });
el('#quit-button').addEventListener('click', () => { scene.endRunEarly(); refreshMenu(); setModal('menu'); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && scene.isRunning() && activeModal === null) { scene.setPaused(true); setModal('pause'); }
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
}
refreshMenu();
