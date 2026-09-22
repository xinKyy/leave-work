import { describe, expect, it } from 'vitest';
import { canSee, canStand, createGame, EXITS, findPath, GUARD_PATROL_ROUTES, isKeycardSpawnSafe, KEYCARD_SPAWN_CLEARANCE, KEYCARD_SPAWNS, segmentBlocked, stepGame, type Input, type Obstacle } from '../src/simulation';

const still: Input = { x: 0, z: 0, run: false, interact: false };
const wall: Obstacle = { x: 0, z: 2, width: 4, depth: 0.3, height: 2, kind: 'wall' };

describe('fair visibility', () => {
  it('blocks detection through a wall, but allows an unobstructed view', () => {
    const guard = { x: 0, z: 0, angle: 0 };
    expect(canSee(guard, { x: 0, z: 4 }, [])).toBe(true);
    expect(canSee(guard, { x: 0, z: 4 }, [wall])).toBe(false);
  });
  it('cannot see behind itself or beyond sight range', () => {
    const guard = { x: 0, z: 0, angle: 0 };
    expect(canSee(guard, { x: 0, z: -2 }, [])).toBe(false);
    expect(canSee(guard, { x: 0, z: 10 }, [])).toBe(false);
  });
  it('handles lines parallel to obstacles without blocking open paths', () => {
    expect(segmentBlocked({ x: 0, z: 0 }, { x: 0, z: 4 }, [wall])).toBe(true);
    expect(segmentBlocked({ x: 4, z: 0 }, { x: 4, z: 4 }, [wall])).toBe(false);
  });
});

describe('movement and routes', () => {
  it('starts outside obstacles with at least one free movement direction', () => {
    const state = createGame();
    expect(canStand(state.player)).toBe(true);
    state.phase = 'playing';
    state.guards = [];
    const startingZ = state.player.z;
    stepGame(state, { ...still, z: -1 }, 0.05);
    expect(state.player.z).toBeLessThan(startingZ);
  });

  it('keeps players out of obstacles and inside the office', () => {
    expect(canStand({ x: 0, z: 2 }, 0.35, [wall])).toBe(false);
    expect(canStand({ x: 0, z: 1.8 }, 0.35, [wall])).toBe(false);
    expect(canStand({ x: 0, z: 0 }, 0.35, [wall])).toBe(true);
    expect(canStand({ x: 14, z: 0 }, 0.35, [])).toBe(false);
  });
  it('keeps both exits and every card spawn reachable from spawn', () => {
    const state = createGame();
    for (const destination of [EXITS.front, EXITS.back, ...KEYCARD_SPAWNS]) {
      const path = findPath(state.player, destination);
      expect(path.length).toBeGreaterThan(0);
      expect(Math.hypot(path.at(-1)!.x - destination.x, path.at(-1)!.z - destination.z)).toBeLessThan(1);
      expect(path.every(point => canStand(point))).toBe(true);
    }
    expect(KEYCARD_SPAWNS.every(isKeycardSpawnSafe)).toBe(true);
  });
  it('keeps the card clear of walls with its full footprint', () => {
    expect(KEYCARD_SPAWNS.every(point => canStand(point, KEYCARD_SPAWN_CLEARANCE))).toBe(true);
  });
  it('keeps card spawns away from visual wall edges', () => {
    expect(isKeycardSpawnSafe({ x: 0, z: 6.3 })).toBe(false);
  });
  it('finds a route to a walkable target beside a cabinet', () => {
    const destination = { x: -9.75, z: 0 };
    expect(canStand(destination)).toBe(true);
    expect(findPath({ x: 5.5, z: 7 }, destination)).not.toHaveLength(0);
  });
  it('keeps chasing around a cabinet when the direct route is blocked', () => {
    const state = createGame(() => 0);
    state.phase = 'playing';
    state.guards = [state.guards[0]];
    const guard = state.guards[0];
    Object.assign(guard, { x: 5.5, z: 7, mode: 'chase', alert: 1, lastSeen: { x: -9.75, z: 0 }, path: [], repath: 0 });
    Object.assign(state.player, { x: -9.75, z: 0 });
    for (let tick = 0; tick < 80; tick++) stepGame(state, still, 0.05);
    expect(guard.moving).toBe(true);
    expect(Math.hypot(guard.x - 5.5, guard.z - 7)).toBeGreaterThan(2);
  });
  it('gives every manager route a reachable door waypoint', () => {
    for (const routes of GUARD_PATROL_ROUTES) {
      for (const route of routes) {
        const door = route.find(point => Object.values(EXITS).some(exit => exit.x === point.x && exit.z === point.z));
        expect(door).toBeDefined();
        expect(findPath(route[0], door!)).not.toHaveLength(0);
        for (let index = 0; index < route.length; index++) {
          expect(findPath(route[index], route[(index + 1) % route.length])).not.toHaveLength(0);
        }
      }
    }
  });
  it('randomizes card positions and manager routes at game start', () => {
    const first = createGame(() => 0);
    const last = createGame(() => 0.99999);
    expect(first.keycardPosition).toEqual(KEYCARD_SPAWNS[0]);
    expect(last.keycardPosition).toEqual(KEYCARD_SPAWNS.at(-1));
    expect(first.guards[0].route).not.toEqual(last.guards[0].route);
    expect(first.guards[1].route).not.toEqual(last.guards[1].route);
  });
  it('normalizes diagonal speed and freezes a paused game', () => {
    const straight = createGame();
    const diagonal = createGame();
    straight.phase = diagonal.phase = 'playing';
    straight.guards = diagonal.guards = [];
    const initial = { ...straight.player };
    stepGame(straight, { ...still, x: 1 }, 0.05);
    stepGame(diagonal, { ...still, x: 1, z: -1 }, 0.05);
    expect(Math.hypot(diagonal.player.x - initial.x, diagonal.player.z - initial.z)).toBeCloseTo(straight.player.x - initial.x);
    diagonal.phase = 'paused';
    const snapshot = JSON.stringify(diagonal);
    stepGame(diagonal, { ...still, x: 1 }, 1);
    expect(JSON.stringify(diagonal)).toBe(snapshot);
  });
});

describe('escape and detection', () => {
  it('requires a keycard at the back exit and a held interaction to escape', () => {
    const state = createGame();
    state.phase = 'playing';
    state.guards = [];
    Object.assign(state.player, EXITS.back);
    for (let tick = 0; tick < 100; tick++) stepGame(state, { ...still, interact: true }, 0.05);
    expect(state.phase).toBe('playing');
    expect(state.exitProgress).toBe(0);
    expect(state.doorOpening).toBe(false);
    state.keycard = true;
    for (let tick = 0; tick < 100; tick++) stepGame(state, { ...still, interact: true }, 0.05);
    expect(state.phase).toBe('won');
    expect(state.exit).toBe('back');
  });
  it('requires a keycard at the front exit too', () => {
    const state = createGame();
    state.phase = 'playing';
    state.guards = [];
    Object.assign(state.player, EXITS.front);
    for (let tick = 0; tick < 35; tick++) stepGame(state, { ...still, interact: true }, 0.05);
    expect(state.phase).toBe('playing');
    expect(state.exitProgress).toBe(0);
    expect(state.doorOpening).toBe(false);
    state.keycard = true;
    for (let tick = 0; tick < 100; tick++) stepGame(state, { ...still, interact: true }, 0.05);
    expect(state.phase).toBe('won');
    expect(state.exit).toBe('front');
  });
  it('picks up the card only when nearby and interacting', () => {
    const state = createGame();
    state.phase = 'playing';
    state.guards = [];
    stepGame(state, { ...still, interact: true }, 0.05);
    expect(state.keycard).toBe(false);
    Object.assign(state.player, state.keycardPosition);
    stepGame(state, { ...still, interact: true }, 0.05);
    expect(state.keycard).toBe(true);
  });
  it('starts chasing on the first visible frame', () => {
    const state = createGame();
    state.phase = 'playing';
    const guard = state.guards[0];
    Object.assign(guard, { x: 11.5, z: 6, angle: 0, route: [{ x: 11.5, z: 6 }], waypoint: 0 });
    state.guards = [guard];
    Object.assign(state.player, { x: 11.5, z: 8.5 });
    stepGame(state, still, 0.05);
    expect(guard.alert).toBeGreaterThan(0);
    expect(guard.mode).toBe('chase');
    expect(state.detections).toBe(1);
  });
  it('makes every manager chase when the opening noise starts', () => {
    const state = createGame(() => 0);
    state.phase = 'playing';
    state.keycard = true;
    Object.assign(state.player, EXITS.front);
    const positions = state.guards.map(guard => ({ x: guard.x, z: guard.z }));
    expect(state.guards.every(guard => !canSee(guard, state.player))).toBe(true);
    stepGame(state, { ...still, interact: true }, 0.05);
    expect(state.doorOpening).toBe(true);
    expect(state.guards.every(guard => guard.mode === 'chase')).toBe(true);
    state.guards.forEach((guard, index) => {
      expect(guard.lastSeen).toEqual(EXITS.front);
      expect(Math.hypot(guard.x - positions[index].x, guard.z - positions[index].z)).toBeGreaterThan(0);
    });
    expect(state.detections).toBe(2);
    stepGame(state, { ...still, interact: true }, 0.05);
    expect(state.detections).toBe(2);
    stepGame(state, still, 0.05);
    expect(state.doorOpening).toBe(false);
  });
  it.each(['front', 'back'] as const)('takes five seconds to open the %s door', exit => {
    const state = createGame();
    state.phase = 'playing';
    state.keycard = true;
    state.guards = [];
    Object.assign(state.player, EXITS[exit]);
    for (let tick = 0; tick < 49; tick++) stepGame(state, { ...still, interact: true }, 0.1);
    expect(state.phase).toBe('playing');
    expect(state.exitProgress).toBeCloseTo(.98);
    stepGame(state, { ...still, interact: true }, 0.1);
    expect(state.phase).toBe('won');
  });
  it('shows and completes sustained exit progress while interacting', () => {
    const state = createGame();
    state.phase = 'playing';
    state.guards = [];
    state.keycard = true;
    Object.assign(state.player, EXITS.front);
    for (let tick = 0; tick < 25; tick++) stepGame(state, { ...still, interact: true }, 0.1);
    expect(state.exit).toBe('front');
    expect(state.exitProgress).toBeCloseTo(0.5, 2);
    stepGame(state, { ...still, interact: false }, 0.1);
    expect(state.exitProgress).toBeLessThan(0.5);
    for (let tick = 0; tick < 55; tick++) stepGame(state, { ...still, interact: true }, 0.1);
    expect(state.phase).toBe('won');
  });
});
