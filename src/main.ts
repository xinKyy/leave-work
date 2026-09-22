import { createGame, EXITS, stepGame } from './simulation';
import type { GameState } from './simulation';
import { OfficeWorld } from './world';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main class="game-shell">
    <canvas id="scene" tabindex="0" aria-label="准点下班 3D 游戏场景"></canvas>
    <section class="topbar">
      <div class="brand"><span class="brand-mark">→</span><div><b>OFF DUTY</b><small>准点下班</small></div></div>
      <div class="clock"><span>距离下班</span><strong id="time">01:35</strong></div>
      <button id="pause" class="icon-button" type="button" aria-label="暂停游戏">Ⅱ</button>
    </section>
    <aside class="status-card">
      <div class="status-label"><span id="phase-dot" class="phase-dot"></span><span id="status">准备出发</span></div>
      <div class="status-row"><span>门禁卡</span><b id="card-state" class="card-state">未取得</b></div>
      <div class="status-row"><span>体力</span><div class="meter"><i id="stamina"></i></div></div>
      <p id="hint" class="hint">经理都在忙自己的事。现在，离开工位。</p>
    </aside>
    <div id="exit-progress" class="exit-progress hidden" aria-live="polite">
      <div class="exit-progress-head"><span id="exit-progress-label">正在开门</span><b id="exit-progress-value">0%</b></div>
      <div class="exit-progress-track"><i id="exit-progress-fill"></i></div>
    </div>
    <div class="exit-badges"><div><span class="badge-dot front"></span><b>正门</b><small>需要门卡 · 声音会引来经理</small></div><div><span class="badge-dot back"></span><b>后门</b><small>需要门卡 · 声音会引来经理</small></div></div>
    <div class="controls"><kbd>W A S D</kbd><span>移动</span><kbd>Shift</kbd><span>快跑</span><kbd>E</kbd><span>互动</span><kbd>Q / R</kbd><span>旋转镜头</span></div>
    <section id="intro" class="modal-layer">
      <div class="intro-card">
        <div class="eyebrow">18:00 · OFFICE FLOOR 04</div>
        <h1>今天，<em>准点下班。</em></h1>
        <p>经理的视线会变红。利用工位和隔断藏好自己，<br/>从正门或后门溜出去。</p>
        <div class="brief-grid"><div><b>01</b><span>观察</span><small>看清黄色视野</small></div><div><b>02</b><span>潜行</span><small>躲在遮挡物后</small></div><div><b>03</b><span>撤离</span><small>按住 E 开门</small></div></div>
        <button id="start" class="primary-button" type="button">开始下班 <span>↗</span></button>
        <p class="microcopy">单机 · 键盘操作 · 约 3 分钟</p>
      </div>
    </section>
    <section id="result" class="modal-layer hidden"><div class="result-card"><div id="result-kicker" class="eyebrow">SHIFT COMPLETE</div><h2 id="result-title">准点下班！</h2><p id="result-copy"></p><button id="restart" class="primary-button" type="button">再来一局 <span>↻</span></button></div></section>
    <div id="loading" class="loading"><span class="loader"></span><span>正在准备办公室…</span></div>
  </main>`;

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const world = new OfficeWorld(canvas);
let state: GameState = createGame();
const keys = new Set<string>();
let cameraYaw = 0;
let previous = performance.now();
let lastUi = 0;
let doorSoundCooldown = 0;
let doorAudioContext: AudioContext | null = null;
const debugEnabled = new URLSearchParams(window.location.search).has('debug');
const debugLines: string[] = [];

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const intro = $('#intro');
const result = $('#result');
const loading = $('#loading');

if (debugEnabled) {
  const panel = document.createElement('aside');
  panel.className = 'debug-panel';
  panel.innerHTML = '<div class="debug-head"><b>移动调试日志</b><button id="copy-debug" type="button">复制</button></div><pre id="debug-output">等待操作…</pre>';
  document.body.append(panel);
  panel.querySelector('#copy-debug')?.addEventListener('click', async () => { await navigator.clipboard?.writeText(debugLines.join('\n')); });
}

function attachDebugLogger(nextState: GameState) {
  if (!debugEnabled) return;
  nextState.debugLog = (event, payload) => {
    const line = `${new Date().toISOString()} ${event} ${JSON.stringify(payload)}`;
    debugLines.push(line);
    if (debugLines.length > 160) debugLines.shift();
    (window as Window & { __OFF_DUTY_LOGS__?: string[] }).__OFF_DUTY_LOGS__ = debugLines;
    const output = document.querySelector<HTMLElement>('#debug-output');
    if (output) { output.textContent = debugLines.slice(-35).join('\n'); output.scrollTop = output.scrollHeight; }
    console.info(`[off-duty] ${line}`);
  };
}
attachDebugLogger(state);

function reset() {
  state = createGame();
  doorSoundCooldown = 0;
  attachDebugLogger(state);
  intro.classList.remove('hidden');
  result.classList.add('hidden');
  $('#status').textContent = '准备出发';
  $('#hint').textContent = '经理都在忙自己的事。现在，离开工位。';
}

function playDoorSound() {
  if (!doorAudioContext || doorAudioContext.state !== 'running') return;
  const now = doorAudioContext.currentTime;
  const oscillator = doorAudioContext.createOscillator();
  const gain = doorAudioContext.createGain();
  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(185, now);
  oscillator.frequency.exponentialRampToValueAtTime(92, now + .22);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(.055, now + .015);
  gain.gain.exponentialRampToValueAtTime(.0001, now + .24);
  oscillator.connect(gain).connect(doorAudioContext.destination);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  oscillator.start(now);
  oscillator.stop(now + .25);
}

function updateDoorSound(delta: number) {
  if (state.phase !== 'playing' || !state.doorOpening) { doorSoundCooldown = 0; return; }
  doorSoundCooldown -= delta;
  if (doorSoundCooldown <= 0) { playDoorSound(); doorSoundCooldown = .75; }
}

function begin() {
  if (window.AudioContext) {
    doorAudioContext ??= new AudioContext();
    void doorAudioContext.resume().catch(error => console.warn('无法启用开门音效', error));
  }
  state.phase = 'playing';
  intro.classList.add('hidden');
  canvas.focus();
}

function togglePause() {
  if (state.phase === 'playing') state.phase = 'paused';
  else if (state.phase === 'paused') state.phase = 'playing';
  $('#pause').textContent = state.phase === 'paused' ? '▶' : 'Ⅱ';
}

function updateUi(now: number) {
  if (now - lastUi < 80) return;
  lastUi = now;
  const seconds = Math.max(0, Math.ceil(state.time));
  $('#time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('#stamina').setAttribute('style', `width:${state.stamina * 100}%`);
  $('#card-state').textContent = state.keycard ? '已取得' : '未取得';
  $('#card-state').classList.toggle('active', state.keycard);
  const alerting = state.guards.some(guard => guard.alert > 0.15);
  const chasing = state.guards.some(guard => guard.mode === 'chase');
  $('#phase-dot').className = `phase-dot ${chasing ? 'danger' : alerting ? 'warn' : ''}`;
  $('#status').textContent = state.phase === 'paused' ? '已暂停' : chasing ? '经理发现你了' : alerting ? '有人正在看' : state.phase === 'playing' ? '潜行中' : '准备出发';
  const progress = document.querySelector<HTMLElement>('#exit-progress')!;
  const progressFill = document.querySelector<HTMLElement>('#exit-progress-fill')!;
  const progressValue = document.querySelector<HTMLElement>('#exit-progress-value')!;
  const progressLabel = document.querySelector<HTMLElement>('#exit-progress-label')!;
  const hasExitProgress = state.doorOpening && state.exitProgress > 0 && state.exit !== null && state.phase === 'playing';
  progress.classList.toggle('hidden', !hasExitProgress);
  if (hasExitProgress) {
    const percent = Math.round(state.exitProgress * 100);
    progressFill.style.width = `${percent}%`;
    progressValue.textContent = `${percent}%`;
    progressLabel.textContent = state.exit === 'front' ? '正在开启正门' : '正在开启后门';
  }
  if (state.phase === 'playing') {
    const nearCard = Math.hypot(state.player.x - state.keycardPosition.x, state.player.z - state.keycardPosition.z) < 1.6;
    const nearFront = Math.hypot(state.player.x - EXITS.front.x, state.player.z - EXITS.front.z) < 1.8;
    const nearBack = Math.hypot(state.player.x - EXITS.back.x, state.player.z - EXITS.back.z) < 1.8;
    $('#hint').textContent = nearCard && !state.keycard ? '按住 E 拿走门禁卡' : (nearFront || nearBack) && !state.keycard ? '这个出口需要门禁卡，先去找一张' : nearFront ? '按住 E，持续 5 秒开启正门；声音会引来经理' : nearBack ? '按住 E，持续 5 秒开启后门；声音会引来经理' : chasing ? '快躲起来！经理听到动静，正在赶来！' : '利用隔断遮住视线，安静地走。';
  }
  if (state.phase === 'won' || state.phase === 'lost') {
    $('#result-kicker').textContent = state.phase === 'won' ? 'SHIFT COMPLETE' : 'MEETING INVITATION';
    $('#result-title').textContent = state.phase === 'won' ? '准点下班！' : '被抓去开会了';
    $('#result-copy').textContent = `${state.reason} · 用时 ${Math.round(95 - state.time)} 秒`;
    result.classList.remove('hidden');
  }
}

window.addEventListener('keydown', event => {
  if (['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName)) return;
  const key = event.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'shift', 'e', 'q', 'r', 'escape', ' '].includes(key)) event.preventDefault();
  if (key === 'escape' || key === ' ') { if (state.phase === 'playing' || state.phase === 'paused') togglePause(); return; }
  if (key === 'q') { cameraYaw = Math.max(-0.55, cameraYaw - 0.12); world.setView(cameraYaw); return; }
  if (key === 'r') { cameraYaw = Math.min(0.55, cameraYaw + 0.12); world.setView(cameraYaw); return; }
  if (key === 'e' && event.repeat === false) keys.add('e');
  keys.add(key);
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));

$('#start').addEventListener('click', begin);
$('#restart').addEventListener('click', () => { reset(); begin(); });
$('#pause').addEventListener('click', togglePause);

async function boot() {
  await world.loadAssets();
  loading.classList.add('hidden');
  canvas.focus();
  requestAnimationFrame(loop);
}

function loop(now: number) {
  const delta = Math.min(0.05, Math.max(0, (now - previous) / 1000));
  previous = now;
  let x = 0;
  let z = 0;
  if (keys.has('a')) x -= 1;
  if (keys.has('d')) x += 1;
  if (keys.has('w')) z -= 1;
  if (keys.has('s')) z += 1;
  stepGame(state, { x, z, run: keys.has('shift'), interact: keys.has('e') }, delta);
  updateDoorSound(delta);
  world.update(state, delta);
  updateUi(now);
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => world.resize());
boot().catch(error => { console.error(error); loading.textContent = '模型加载失败，已切换为低多边形预览'; loading.classList.add('hidden'); requestAnimationFrame(loop); });
