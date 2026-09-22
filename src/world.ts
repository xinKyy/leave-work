import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { EXITS, KEYCARD, OBSTACLES, ROOM, canSee } from './simulation';
import type { GameState, Guard, Point } from './simulation';

type Character = { root: THREE.Object3D; mixer?: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; lastAction: string; fallback: boolean };

const COLORS = { floor: 0xd9d5c8, trim: 0xbbb5a7, wall: 0xb9b8af, desk: 0xa6a092, dark: 0x454640, coral: 0xe26748, teal: 0x367f83, amber: 0xd99239, green: 0x5b9d7b };

function makeLabel(text: string, color: string, fontSize = 24) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const context = canvas.getContext('2d')!; context.clearRect(0, 0, canvas.width, canvas.height); context.fillStyle = color; context.font = `700 ${fontSize}px Manrope, sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 256, 64);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })); sprite.scale.set(3.2, .8, 1); return sprite;
}

function box(width: number, height: number, depth: number, color: number, y = height / 2) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color, roughness: .78 })); mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}

function fallbackCharacter(color: number, manager = false) {
  const root = new THREE.Group();
  const body = box(.62, .78, .34, color, 1.02); root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.25, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf0bd91, roughness: .8 })); head.position.y = 1.62; head.castShadow = true; root.add(head);
  for (const side of [-1, 1]) { const leg = box(.18, .65, .18, manager ? 0x343b44 : 0x2b5254, .35); leg.position.x = side * .17; root.add(leg); const arm = box(.14, .6, .14, 0xf0bd91, 1.04); arm.position.x = side * .42; arm.rotation.z = side * .12; root.add(arm); }
  if (manager) { const badge = box(.18, .22, .02, COLORS.coral, 1.08); badge.position.z = -.18; root.add(badge); }
  return root;
}

function normalizeCharacter(root: THREE.Object3D) {
  const bounds = new THREE.Box3().setFromObject(root); const height = Math.max(.01, bounds.max.y - bounds.min.y); root.scale.multiplyScalar(1.82 / height); const scaledBounds = new THREE.Box3().setFromObject(root); root.position.y -= scaledBounds.min.y;
}

function pathPoint(point: Point, y = 0) { return new THREE.Vector3(point.x, y, point.z); }

export class OfficeWorld {
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private player!: Character;
  private managers: Character[] = [];
  private guardCones: THREE.Mesh[] = [];
  private guardRings: THREE.Mesh[] = [];
  private playerMarker!: THREE.Mesh;
  private playerLabel!: THREE.Sprite;
  private cardMesh!: THREE.Mesh;
  private cardLabel!: THREE.Sprite;
  private cardBeacon!: THREE.Mesh;
  private yaw = 0;
  private loader = new GLTFLoader();
  private loaded = false;
  private office = new THREE.Group();

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false }); this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7)); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.camera = new THREE.OrthographicCamera(-16, 16, 12, -12, .1, 100); this.camera.position.set(0, 25, 23); this.camera.lookAt(0, 0, 0);
    this.scene.background = new THREE.Color(0xe9e7de); this.scene.fog = new THREE.Fog(0xe9e7de, 32, 52);
    this.scene.add(new THREE.HemisphereLight(0xfff8e7, 0x777a85, 2.2));
    const sun = new THREE.DirectionalLight(0xfff0d6, 3.3); sun.position.set(-8, 20, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -18; sun.shadow.camera.right = 18; sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16; this.scene.add(sun);
    this.scene.add(this.office); this.buildOffice(); this.resize();
  }

  private buildOffice() {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM.width, .22, ROOM.depth), new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 1 })); floor.position.y = -.14; floor.receiveShadow = true; this.office.add(floor);
    const tile = new THREE.GridHelper(ROOM.width, 28, 0xc4c0b5, 0xd4d0c5); tile.position.y = .01; (tile.material as THREE.Material).opacity = .22; (tile.material as THREE.Material).transparent = true; this.office.add(tile);
    const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: .9 });
    for (const wall of [{ x: -14, z: 0, w: .28, d: 20, h: 2.4 }, { x: 14, z: 0, w: .28, d: 20, h: 2.4 }, { x: 0, z: -10, w: 28, d: .28, h: 2.4 }, { x: 0, z: 10, w: 28, d: .28, h: .34 }]) { const edge = new THREE.Mesh(new THREE.BoxGeometry(wall.w, wall.h, wall.d), wallMat); edge.position.set(wall.x, wall.h / 2, wall.z); edge.castShadow = true; edge.receiveShadow = true; this.office.add(edge); }
    for (const obstacle of OBSTACLES) {
      const object = new THREE.Group(); object.position.set(obstacle.x, 0, obstacle.z);
      if (obstacle.kind === 'desk') { object.add(box(obstacle.width, .85, obstacle.depth, COLORS.desk, .85)); for (const side of [-1, 1]) for (const depth of [-1, 1]) { const leg = box(.1, .8, .1, COLORS.dark, .4); leg.position.set(side * (obstacle.width / 2 - .22), 0, depth * (obstacle.depth / 2 - .18)); object.add(leg); } const monitor = box(.72, .42, .06, 0x59656a, 1.5); monitor.position.z = -.12; object.add(monitor); }
      else { object.add(box(obstacle.width, obstacle.height, obstacle.depth, obstacle.kind === 'wall' ? 0xc2bbb0 : 0x81766d)); }
      this.office.add(object);
    }
    for (const [exit, point] of Object.entries(EXITS)) { const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, .035, 32), new THREE.MeshStandardMaterial({ color: exit === 'front' ? COLORS.green : COLORS.amber, transparent: true, opacity: .8 })); pad.position.set(point.x, .04, point.z); this.office.add(pad); const label = makeLabel(exit === 'front' ? '正 门' : '后 门', exit === 'front' ? '#4f9674' : '#c17e3c', 25); label.position.set(point.x, .5, point.z); label.rotation.x = -Math.PI / 2; label.scale.set(1.8, .45, 1); this.office.add(label); }
    this.cardMesh = new THREE.Mesh(new THREE.BoxGeometry(.45, .055, .3), new THREE.MeshStandardMaterial({ color: 0xe2ad45, emissive: 0x4a2d08, emissiveIntensity: .3 })); this.cardMesh.position.set(KEYCARD.x, .16, KEYCARD.z); this.cardMesh.rotation.y = -.3; this.cardMesh.castShadow = true; this.office.add(this.cardMesh); this.cardLabel = makeLabel('门禁卡', '#b78335', 20); this.cardLabel.position.set(KEYCARD.x, .62, KEYCARD.z); this.cardLabel.rotation.x = -Math.PI / 2; this.cardLabel.scale.set(1.25, .32, 1); this.cardLabel.renderOrder = 12; (this.cardLabel.material as THREE.SpriteMaterial).depthTest = false; this.office.add(this.cardLabel); this.cardBeacon = new THREE.Mesh(new THREE.RingGeometry(.62, .74, 32), new THREE.MeshBasicMaterial({ color: COLORS.amber, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false, depthTest: false })); this.cardBeacon.rotation.x = -Math.PI / 2; this.cardBeacon.position.set(KEYCARD.x, .07, KEYCARD.z); this.cardBeacon.renderOrder = 10; this.office.add(this.cardBeacon);
    const lounge = box(3.8, .35, 1.4, 0x809b96, .38); lounge.position.set(3.5, 0, -7.7); this.office.add(lounge); lounge.add(box(.12, .4, 1.2, 0xa28b6b, .25));
    const sign = makeLabel('EXIT PLAN · 18:00', '#9c8c78', 18); sign.position.set(0, .15, 9.72); sign.rotation.x = -Math.PI / 2; sign.scale.set(3, .35, 1); this.office.add(sign);
  }

  private createCharacter(gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }, manager: boolean): Character {
    const root = clone(gltf.scene); normalizeCharacter(root); if (!manager) root.scale.multiplyScalar(1.12); root.traverse((object: THREE.Object3D) => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } }); const mixer = new THREE.AnimationMixer(root); const actions = new Map<string, THREE.AnimationAction>(); for (const clip of gltf.animations) actions.set(clip.name.toLowerCase(), mixer.clipAction(clip)); const character = { root, mixer, actions, lastAction: '', fallback: false }; this.play(character, 'idle'); return character;
  }

  private play(character: Character, wanted: string) {
    const name = [...character.actions.keys()].find(action => action === wanted || action.includes(wanted)) ?? [...character.actions.keys()][0]; if (!name || character.lastAction === name) return; const next = character.actions.get(name)!; next.reset().fadeIn(.18).play(); if (character.lastAction) character.actions.get(character.lastAction)?.fadeOut(.18); character.lastAction = name;
  }

  async loadAssets(): Promise<{ player: boolean; manager: boolean }> {
    const load = (url: string) => new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((resolve, reject) => this.loader.load(url, result => resolve({ scene: result.scene, animations: result.animations }), undefined, reject));
    let playerLoaded = false; let managerLoaded = false;
    try { const gltf = await load('/assets/player.gltf'); this.player = this.createCharacter(gltf, false); this.office.add(this.player.root); playerLoaded = true; } catch { this.player = { root: fallbackCharacter(COLORS.teal), actions: new Map(), lastAction: '', fallback: true }; this.office.add(this.player.root); }
    try { const gltf = await load('/assets/manager.gltf'); for (let i = 0; i < 2; i++) { const character = this.createCharacter(gltf, true); this.managers.push(character); this.office.add(character.root); } managerLoaded = true; } catch { for (let i = 0; i < 2; i++) { const character = { root: fallbackCharacter(COLORS.amber, true), actions: new Map(), lastAction: '', fallback: true }; this.managers.push(character); this.office.add(character.root); } }
    this.guardCones = [0, 1].map(() => { const vertices = [0, 0, 0]; const half = Math.PI * .28; for (let i = 0; i <= 18; i++) { const angle = -half + (i / 18) * half * 2; vertices.push(Math.sin(angle) * 7.2, 0, Math.cos(angle) * 7.2); } const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); const indices = []; for (let i = 1; i < 19; i++) indices.push(0, i, i + 1); geometry.setIndex(indices); const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: COLORS.amber, transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false })); this.office.add(mesh); return mesh; });
    this.guardRings = [0, 1].map(() => { const ring = new THREE.Mesh(new THREE.RingGeometry(.56, .66, 32), new THREE.MeshBasicMaterial({ color: COLORS.amber, transparent: true, opacity: .9, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .035; this.office.add(ring); return ring; });
    this.playerMarker = new THREE.Mesh(new THREE.RingGeometry(.62, .78, 40), new THREE.MeshBasicMaterial({ color: COLORS.teal, transparent: true, opacity: .95, side: THREE.DoubleSide, depthTest: false, depthWrite: false })); this.playerMarker.rotation.x = -Math.PI / 2; this.playerMarker.renderOrder = 20; this.office.add(this.playerMarker);
    this.playerLabel = makeLabel('你', '#2f7f83', 22); this.playerLabel.scale.set(.92, .38, 1); this.playerLabel.renderOrder = 21; (this.playerLabel.material as THREE.SpriteMaterial).depthTest = false; this.office.add(this.playerLabel);
    this.loaded = true; return { player: playerLoaded, manager: managerLoaded };
  }

  update(state: GameState, delta: number) {
    if (!this.loaded) return; this.player.root.position.copy(pathPoint(state.player, 0)); this.player.root.rotation.y = state.player.angle; this.playerMarker.position.set(state.player.x, .08, state.player.z); this.playerLabel.position.set(state.player.x, 2.35, state.player.z); this.cardMesh.position.set(state.keycardPosition.x, .16, state.keycardPosition.z); this.cardLabel.position.set(state.keycardPosition.x, .62, state.keycardPosition.z); this.cardBeacon.position.set(state.keycardPosition.x, .07, state.keycardPosition.z); this.cardMesh.visible = !state.keycard; this.cardLabel.visible = !state.keycard; this.cardBeacon.visible = !state.keycard; if (!state.keycard) { const pulse = 1 + Math.sin(performance.now() * .004) * .08; this.cardBeacon.scale.setScalar(pulse); (this.cardBeacon.material as THREE.MeshBasicMaterial).opacity = .56 + Math.sin(performance.now() * .004) * .2; } if (this.player.mixer) { this.play(this.player, state.player.running ? 'run' : state.player.moving ? 'walk' : 'idle'); this.player.mixer.update(delta); }
    state.guards.forEach((guard, index) => { const character = this.managers[index]; character.root.position.copy(pathPoint(guard, 0)); character.root.rotation.y = guard.angle; if (character.mixer) { this.play(character, guard.mode === 'chase' ? 'run' : guard.moving ? 'walk' : 'idle'); character.mixer.update(delta); } const cone = this.guardCones[index]; cone.position.set(guard.x, .055, guard.z); cone.rotation.y = guard.angle; const visible = canSee(guard, state.player); (cone.material as THREE.MeshBasicMaterial).color.set(guard.mode === 'chase' ? 0xdb614b : guard.alert > .2 ? 0xe4a447 : COLORS.amber); (cone.material as THREE.MeshBasicMaterial).opacity = guard.mode === 'chase' ? .24 : visible ? .22 : .13; const ring = this.guardRings[index]; ring.position.set(guard.x, .04, guard.z); (ring.material as THREE.MeshBasicMaterial).color.set(guard.mode === 'chase' ? 0xdb614b : COLORS.amber); });
    this.renderer.render(this.scene, this.camera);
  }

  setView(angle: number) { this.yaw = angle; const base = new THREE.Vector3(0, 25, 23); base.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw); this.camera.position.copy(base); this.camera.lookAt(0, 0, 0); }
  resize() { const width = this.canvas.clientWidth || window.innerWidth; const height = this.canvas.clientHeight || window.innerHeight; const aspect = width / height; const size = 14; this.camera.left = -size * aspect; this.camera.right = size * aspect; this.camera.top = size; this.camera.bottom = -size; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false); }
  dispose() { this.renderer.dispose(); }
}
