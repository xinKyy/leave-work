export type Point = { x: number; z: number };
export type ExitName = 'front' | 'back';
export type Obstacle = { x: number; z: number; width: number; depth: number; height: number; kind: 'wall' | 'desk' | 'cabinet' | 'table' | 'planter' };
export type Guard = Point & {
  angle: number;
  alert: number;
  mode: 'patrol' | 'chase' | 'search';
  route: Point[];
  waypoint: number;
  lastSeen: Point;
  searchTime: number;
  path: Point[];
  repath: number;
  moving: boolean;
  visible: boolean;
  debugPathElapsed: number;
  debugBlockedElapsed: number;
};
export type GameState = {
  phase: 'ready' | 'playing' | 'paused' | 'won' | 'lost';
  player: Point & { angle: number; moving: boolean; running: boolean };
  guards: Guard[];
  time: number;
  stamina: number;
  keycard: boolean;
  keycardPosition: Point;
  doorOpening: boolean;
  exitProgress: number;
  exit: ExitName | null;
  bossExit: ExitName;
  revealedBossExit: ExitName | null;
  reason: string;
  detections: number;
  debugElapsed: number;
  debugLog?: (event: string, payload: Record<string, unknown>) => void;
};
export type Input = { x: number; z: number; run: boolean; interact: boolean };
export const ROOM = { width: 28, depth: 20 };
export const EXITS = { front: { x: 12.0, z: 8.2 }, back: { x: -12.0, z: -8.2 } };
export const KEYCARD_SPAWNS: Point[] = [
  { x: 9.5, z: -7.4 },
  { x: -8.7, z: -7.6 },
  { x: 8.9, z: 6.1 },
  { x: -8.8, z: 6.1 },
  { x: 0, z: 5.8 },
  { x: 0, z: -5.2 },
];
export const KEYCARD: Point = KEYCARD_SPAWNS[0];
export const KEYCARD_SPAWN_CLEARANCE = 0.9;
export const OBSTACLES: Obstacle[] = [
  { x: -8, z: 3.8, width: 4.8, depth: 1.5, height: 1.05, kind: 'desk' },
  { x: -1.5, z: 3.8, width: 4.8, depth: 1.5, height: 1.05, kind: 'desk' },
  { x: 6.3, z: 3.8, width: 4.8, depth: 1.5, height: 1.05, kind: 'desk' },
  { x: -8, z: -2.7, width: 4.8, depth: 1.5, height: 1.05, kind: 'desk' },
  { x: -1.5, z: -2.7, width: 4.8, depth: 1.5, height: 1.05, kind: 'desk' },
  { x: 6.3, z: -2.7, width: 4.8, depth: 1.5, height: 1.05, kind: 'desk' },
  { x: -10.8, z: -0.2, width: 1.1, depth: 5.4, height: 2.1, kind: 'cabinet' },
  { x: 10.8, z: -0.2, width: 1.1, depth: 5.4, height: 2.1, kind: 'cabinet' },
  { x: 0, z: -7.1, width: 8.6, depth: 0.35, height: 2.4, kind: 'wall' },
  { x: 0, z: 7.2, width: 7.2, depth: 0.35, height: 2.4, kind: 'wall' },
];

const TAU = Math.PI * 2;
const sightRange = 7.2;
const sightHalfAngle = Math.PI * 0.28;
const playerRadius = 0.34;
const guardRadius = 0.38;
const sprintStartStamina = 0.2;
const sprintStopStamina = 0.02;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const normalizeAngle = (value: number) => ((value % TAU) + TAU) % TAU;

export const GUARD_PATROL_ROUTES: Point[][][] = [
  [
    [{ x: 5.5, z: 7 }, { x: 11.8, z: 7 }, EXITS.front, { x: 11.8, z: 1.5 }, { x: 5.5, z: 1.5 }],
    [{ x: 5.5, z: 7 }, { x: 8.9, z: 7 }, { x: 9.4, z: -8.4 }, EXITS.back, { x: 9.4, z: -8.4 }, { x: 5.5, z: 7 }],
    [{ x: 5.5, z: 7 }, { x: 5.5, z: 5.5 }, { x: -5, z: 5.5 }, { x: -5, z: -8.4 }, EXITS.back, { x: -5, z: -8.4 }],
  ],
  [
    [{ x: -6.5, z: -5 }, { x: -6.5, z: -8.4 }, EXITS.back, { x: -6.5, z: -8.4 }, { x: -1.5, z: -5 }, { x: -1.5, z: 0.2 }],
    [{ x: -6.5, z: -5 }, { x: -6.5, z: 0.2 }, { x: -5, z: 5.5 }, { x: 12, z: 5.5 }, EXITS.front, { x: 12, z: 5.5 }],
    [{ x: -6.5, z: -5 }, { x: -1.5, z: -5 }, { x: 5, z: -5 }, { x: 9.4, z: -8.4 }, EXITS.back, { x: 9.4, z: -8.4 }],
  ],
];

function choose<T>(items: T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(Math.max(0, random()) * items.length))];
}

export function isKeycardSpawnSafe(point: Point): boolean {
  return canStand(point, KEYCARD_SPAWN_CLEARANCE);
}

export function createGame(random: () => number = Math.random): GameState {
  const guardRoutes = GUARD_PATROL_ROUTES.map(routes => [...choose(routes, random)]);
  const safeCardSpawns = KEYCARD_SPAWNS.filter(isKeycardSpawnSafe);
  return {
    phase: 'ready',
    player: { x: -5.5, z: 8.5, angle: Math.PI, moving: false, running: false },
    guards: [
      { x: 5.5, z: 7, angle: Math.PI, alert: 0, mode: 'patrol', route: guardRoutes[0], waypoint: 1, lastSeen: { x: 0, z: 7 }, searchTime: 0, path: [], repath: 0, moving: false, visible: false, debugPathElapsed: 0, debugBlockedElapsed: 0 },
      { x: -6.5, z: -5, angle: 0, alert: 0, mode: 'patrol', route: guardRoutes[1], waypoint: 1, lastSeen: { x: 0, z: 7 }, searchTime: 0, path: [], repath: 0, moving: false, visible: false, debugPathElapsed: 0, debugBlockedElapsed: 0 },
    ],
    time: 95,
    stamina: 1,
    keycard: false,
    keycardPosition: { ...choose(safeCardSpawns.length ? safeCardSpawns : KEYCARD_SPAWNS, random) },
    doorOpening: false,
    exitProgress: 0,
    exit: null,
    bossExit: choose(['front', 'back'] as const, random),
    revealedBossExit: null,
    reason: '',
    detections: 0,
    debugElapsed: 0,
  };
}

function pointInObstacle(point: Point, obstacle: Obstacle, padding = 0): boolean {
  return Math.abs(point.x - obstacle.x) <= obstacle.width / 2 + padding && Math.abs(point.z - obstacle.z) <= obstacle.depth / 2 + padding;
}

function segmentIntersectsRect(from: Point, to: Point, obstacle: Obstacle, padding = 0): boolean {
  const minX = obstacle.x - obstacle.width / 2 - padding;
  const maxX = obstacle.x + obstacle.width / 2 + padding;
  const minZ = obstacle.z - obstacle.depth / 2 - padding;
  const maxZ = obstacle.z + obstacle.depth / 2 + padding;
  let tMin = 0;
  let tMax = 1;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  for (const [origin, direction, min, max] of [[from.x, dx, minX, maxX], [from.z, dz, minZ, maxZ]] as const) {
    if (Math.abs(direction) < 1e-8) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const entry = (min - origin) / direction;
    const exit = (max - origin) / direction;
    tMin = Math.max(tMin, Math.min(entry, exit));
    tMax = Math.min(tMax, Math.max(entry, exit));
    if (tMin > tMax) return false;
  }
  return tMax >= 0 && tMin <= 1;
}

export function segmentBlocked(from: Point, to: Point, obstacles: Obstacle[] = OBSTACLES, padding = 0): boolean {
  return obstacles.some(obstacle => segmentIntersectsRect(from, to, obstacle, padding));
}

export function canSee(guard: Point & { angle: number }, target: Point, obstacles: Obstacle[] = OBSTACLES): boolean {
  const dx = target.x - guard.x;
  const dz = target.z - guard.z;
  const range = Math.hypot(dx, dz);
  if (range > sightRange || range < 0.05) return false;
  const targetAngle = normalizeAngle(Math.atan2(dx, dz));
  const difference = Math.abs(normalizeAngle(targetAngle - normalizeAngle(guard.angle)));
  if (Math.min(difference, TAU - difference) > sightHalfAngle) return false;
  return !segmentBlocked(guard, target, obstacles);
}

export function canStand(point: Point, radius = playerRadius, obstacles: Obstacle[] = OBSTACLES): boolean {
  if (Math.abs(point.x) > ROOM.width / 2 - radius || Math.abs(point.z) > ROOM.depth / 2 - radius) return false;
  return !obstacles.some(obstacle => pointInObstacle(point, obstacle, radius));
}

function nearestNavigable(point: Point, radius: number, connectFrom?: Point): Point | null {
  const minX = -13;
  const minZ = -9;
  const maxX = minX + 27 - 1;
  const maxZ = minZ + 18 - 1;
  const candidates: Point[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) candidates.push({ x, z });
  }
  candidates.sort((first, second) => distance(first, point) - distance(second, point));
  return candidates.find(candidate => canStand(candidate, radius) && (!connectFrom || !segmentBlocked(connectFrom, candidate, OBSTACLES, radius))) ?? null;
}

export function findPath(from: Point, to: Point, radius = playerRadius): Point[] {
  const step = 1;
  const key = (x: number, z: number) => `${x},${z}`;
  const start = nearestNavigable(from, radius, from);
  if (!start) return [];
  const queue = [start];
  const parent = new Map<string, Point>();
  const seen = new Set([key(start.x, start.z)]);
  let closest = start;
  let closestDistance = distance(start, to);
  let directGoal: Point | null = null;
  let directDistance = Infinity;
  while (queue.length) {
    const current = queue.shift()!;
    const currentDistance = distance(current, to);
    if (currentDistance < closestDistance) { closest = current; closestDistance = currentDistance; }
    if (canStand(to, radius) && !segmentBlocked(current, to, OBSTACLES, radius) && currentDistance < directDistance) {
      directGoal = current;
      directDistance = currentDistance;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next = { x: current.x + dx * step, z: current.z + dz * step };
      const nextKey = key(next.x, next.z);
      if (seen.has(nextKey) || !canStand(next, radius) || segmentBlocked(current, next, OBSTACLES, radius)) continue;
      seen.add(nextKey); parent.set(nextKey, current); queue.push(next);
    }
  }
  const goal = directGoal ?? closest;
  const goalKey = key(goal.x, goal.z);
  if (!seen.has(goalKey)) return [];
  const path: Point[] = [];
  let cursor = goal;
  while (key(cursor.x, cursor.z) !== key(start.x, start.z)) { path.unshift({ ...cursor }); cursor = parent.get(key(cursor.x, cursor.z))!; }
  if (path.length && segmentBlocked(from, path[0], OBSTACLES, radius)) path.unshift({ ...start });
  const last = path.at(-1) ?? start;
  if (directGoal && canStand(to, radius) && !segmentBlocked(last, to, OBSTACLES, radius)) path.push({ ...to });
  return path;
}

function moveToward(actor: Point & { angle: number; moving: boolean }, target: Point, speed: number, delta: number, radius: number) {
  const dx = target.x - actor.x;
  const dz = target.z - actor.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.08) { actor.moving = false; return true; }
  actor.angle = Math.atan2(dx, dz);
  const travel = Math.min(length, speed * delta);
  const next = { x: actor.x + dx / length * travel, z: actor.z + dz / length * travel };
  actor.moving = canStand(next, radius) && !segmentBlocked(actor, next, OBSTACLES, radius);
  if (actor.moving) { actor.x = next.x; actor.z = next.z; }
  return length < 0.22;
}

function updateGuard(guard: Guard, state: GameState, delta: number, index: number) {
  const spotted = canSee(guard, state.player);
  const heard = state.doorOpening;
  guard.visible = spotted;
  if (spotted || heard) {
    guard.alert = 1;
    guard.lastSeen = { x: state.player.x, z: state.player.z };
    if (guard.mode !== 'chase') { guard.mode = 'chase'; state.detections += 1; }
  }
  else guard.alert = clamp(guard.alert - delta * (guard.mode === 'patrol' ? 0.65 : 0.2), 0, 1);
  if (guard.mode === 'chase' && !spotted && guard.alert < 0.3) { guard.mode = 'search'; guard.searchTime = 3; }
  if (guard.mode === 'search') { guard.searchTime -= delta; if (guard.searchTime <= 0) { guard.mode = 'patrol'; guard.alert = 0; } }
  let target: Point;
  let speed = 1.45;
  if (guard.mode === 'chase') { target = guard.lastSeen; speed = 2.6; }
  else if (guard.mode === 'search') { target = guard.lastSeen; speed = 1.8; }
  else { target = guard.route[guard.waypoint]; if (distance(guard, target) < 0.35) guard.waypoint = (guard.waypoint + 1) % guard.route.length; target = guard.route[guard.waypoint]; }
  guard.debugPathElapsed += delta;
  const needsPath = !guard.path.length || guard.repath <= 0 || guard.mode !== 'patrol';
  if (needsPath) {
    const hadPath = guard.path.length > 0;
    guard.path = findPath(guard, target, guardRadius);
    guard.repath = 0.4;
    if (state.debugLog && (!hadPath || guard.debugPathElapsed >= 0.4)) {
      state.debugLog('guard-path', {
        index,
        mode: guard.mode,
        position: { x: Number(guard.x.toFixed(3)), z: Number(guard.z.toFixed(3)) },
        target: { x: Number(target.x.toFixed(3)), z: Number(target.z.toFixed(3)) },
        pathLength: guard.path.length,
        next: guard.path[0] ?? null,
        lastSeen: guard.lastSeen,
      });
      guard.debugPathElapsed = 0;
    }
  }
  guard.repath -= delta;
  const next = guard.path[0] ?? target;
  const reached = moveToward(guard, next, speed, delta, guardRadius);
  if (!reached && !guard.moving) {
    guard.debugBlockedElapsed += delta;
    if (state.debugLog && guard.debugBlockedElapsed >= 0.25) {
      const blockers = OBSTACLES.filter(obstacle => pointInObstacle(next, obstacle, guardRadius) || segmentIntersectsRect(guard, next, obstacle, guardRadius)).map(obstacle => ({ kind: obstacle.kind, x: obstacle.x, z: obstacle.z, width: obstacle.width, depth: obstacle.depth }));
      state.debugLog('guard-blocked', {
        index,
        mode: guard.mode,
        position: { x: Number(guard.x.toFixed(3)), z: Number(guard.z.toFixed(3)) },
        target: { x: Number(target.x.toFixed(3)), z: Number(target.z.toFixed(3)) },
        next: { x: Number(next.x.toFixed(3)), z: Number(next.z.toFixed(3)) },
        pathLength: guard.path.length,
        canStand: canStand(next, guardRadius),
        segmentBlocked: segmentBlocked(guard, next, OBSTACLES, guardRadius),
        blockers,
      });
      guard.debugBlockedElapsed = 0;
    }
  } else guard.debugBlockedElapsed = 0;
  if (reached) guard.path.shift();
}

export function stepGame(state: GameState, input: Input, delta: number): void {
  if (state.phase !== 'playing') return;
  const elapsed = Math.min(delta, 0.1);
  state.time = Math.max(0, state.time - elapsed);
  if (state.time <= 0) { state.phase = 'lost'; state.reason = '加班警报：时间到了'; return; }
  const length = Math.hypot(input.x, input.z);
  const running = input.run && length > 0.01 && (state.player.running ? state.stamina > sprintStopStamina : state.stamina >= sprintStartStamina);
  const speed = running ? 5.1 : 3.1;
  if (running) state.stamina = clamp(state.stamina - elapsed * 0.34, 0, 1);
  else state.stamina = clamp(state.stamina + elapsed * 0.22, 0, 1);
  state.player.running = running;
  state.player.moving = length > 0.01;
  if (length > 0.01) {
    const normalized = { x: input.x / length, z: input.z / length };
    state.player.angle = Math.atan2(normalized.x, normalized.z);
    const next = { x: state.player.x + normalized.x * speed * elapsed, z: state.player.z + normalized.z * speed * elapsed };
    const blockers = OBSTACLES.filter(obstacle => pointInObstacle(next, obstacle, playerRadius) || segmentIntersectsRect(state.player, next, obstacle, playerRadius)).map(obstacle => ({ kind: obstacle.kind, x: obstacle.x, z: obstacle.z, width: obstacle.width, depth: obstacle.depth }));
    const insideRoom = Math.abs(next.x) <= ROOM.width / 2 - playerRadius && Math.abs(next.z) <= ROOM.depth / 2 - playerRadius;
    const allowed = canStand(next);
    state.debugElapsed += elapsed;
    if ((!allowed || state.debugElapsed >= .25) && state.debugLog) { state.debugElapsed = 0; state.debugLog('player-move', { from: { x: Number(state.player.x.toFixed(2)), z: Number(state.player.z.toFixed(2)) }, requested: { x: Number(input.x.toFixed(2)), z: Number(input.z.toFixed(2)) }, candidate: { x: Number(next.x.toFixed(2)), z: Number(next.z.toFixed(2)) }, allowed, insideRoom, blockers, speed: Number(speed.toFixed(2)), running }); }
    if (allowed) { state.player.x = next.x; state.player.z = next.z; }
  }
  if (input.interact && !state.keycard && distance(state.player, state.keycardPosition) < 1.1) state.keycard = true;
  const nearFront = distance(state.player, EXITS.front) < 1.2;
  const nearBack = distance(state.player, EXITS.back) < 1.2;
  const exit = nearFront ? 'front' : nearBack ? 'back' : null;
  const allowed = exit !== null && state.keycard && state.revealedBossExit !== exit;
  state.doorOpening = Boolean(exit && input.interact && allowed);
  for (const [index, guard] of state.guards.entries()) { const previousMode = guard.mode; updateGuard(guard, state, elapsed, index); if (state.debugLog && previousMode !== guard.mode) state.debugLog('guard-state', { index, position: { x: Number(guard.x.toFixed(2)), z: Number(guard.z.toFixed(2)) }, angle: Number(guard.angle.toFixed(2)), mode: guard.mode, visible: guard.visible, alert: Number(guard.alert.toFixed(2)), lastSeen: guard.lastSeen }); if (distance(guard, state.player) < 0.7 && guard.mode === 'chase') { state.phase = 'lost'; state.reason = '被经理抓住了：临时会议开始'; return; } }
  if (state.doorOpening) {
    state.exit = exit;
    state.exitProgress = clamp(state.exitProgress + elapsed / 5, 0, 1);
    if (state.exitProgress >= 1) {
      if (exit === state.bossExit) {
        state.revealedBossExit = exit;
        state.doorOpening = false;
        state.exitProgress = 0;
        state.exit = null;
        state.reason = '门外有老板，请从另一扇门出去';
      } else {
        state.phase = 'won';
        state.reason = exit === 'front' ? '正门刷卡成功，准点下班！' : '后门溜出成功，完美潜行！';
      }
    }
  }
  else state.exitProgress = clamp(state.exitProgress - elapsed * 3.5, 0, 1);
}
