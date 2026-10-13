// main.js - Coast to Coast: open-world drive across the USA (three.js)
import * as THREE from 'three';
import { WorldData } from './data.js';
import { setupSky } from './world/sky.js';
import { Terrain } from './world/terrain.js';
import { buildRoad } from './world/road.js';
import { Water } from './world/water.js';
import { StaticWorld } from './world/static.js';
import { Vegetation } from './world/vegetation.js';
import { Traffic } from './world/traffic.js';
import { Car } from './actors/car.js';
import { Person } from './actors/person.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { EngineAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.25, 90000);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

let steps = 0; const TOTAL = 11;
const progress = (label) => {
  steps++; $('load-bar').style.width = Math.min(100, steps / TOTAL * 100) + '%'; $('load-text').textContent = `載入 ${label}…`;
};

async function main() {
  const world = new WorldData();
  await world.load(progress);
  const sky = setupSky(renderer, scene); progress('天空');
  const terrain = new Terrain(scene, world, renderer); await terrain.init(progress);
  buildRoad(scene, world, renderer); progress('公路');
  const water = new Water(scene); await water.init(); progress('水域');
  const statics = new StaticWorld(scene); await statics.init();
  const veg = new Vegetation(scene, world); await veg.init(); progress('植被');

  // ---- actors: start at the Golden Gate (stage 1), car parked in the right lane
  const car = new Car(scene, world);
  const person = new Person(scene, world);
  const spawnS = 380, r0 = world.routeAt(spawnS);
  car.place(r0.x - r0.ty * -5.25, r0.y + r0.tx * -5.25, Math.atan2(r0.ty, r0.tx));
  person.place(r0.x - r0.ty * -10.5 + r0.tx * 1, r0.y + r0.tx * -10.5 + r0.ty * 1, car.yaw + Math.PI / 2);
  await statics.update(r0.x); progress('城市');
  terrain.update(r0.x, r0.y, 0, 999);
  for (let k = 0; k < 40; k++) veg.update(r0.x, r0.y);
  const traffic = new Traffic(scene, world);
  const rig = new CameraRig(camera, world); rig.yaw = car.yaw + Math.PI * 0.8;
  const input = new Input(canvas);
  const hud = new HUD(world);
  const audio = new EngineAudio();
  let mode = 'foot';
  window.__game = { world, car, person, camera, terrain, statics, veg, traffic, scene, renderer, get mode() { return mode; } };
  progress('完成');

  $('loading').classList.add('done');
  $('start').onclick = () => { $('loading').style.display = 'none'; audio.start(); canvas.requestPointerLock?.(); };
  addEventListener('keydown', () => audio.ctx || audio.start(), { once: true });
  hud.toast('按 F 上車 · WASD 移動 · Shift 跑步 · H 說明', 6);

  const clock = new THREE.Clock();
  let tTerrain = 0, tStatic = 0, fps = 60, quality = 1;
  const qualities = [{ veg: 1500, shadow: 60, name: '低' }, { veg: 2600, shadow: 90, name: '中' }, { veg: 3800, shadow: 130, name: '高' }];
  const applyQuality = () => { veg.radius = qualities[quality].veg; sky.setShadowSize(qualities[quality].shadow); };
  applyQuality();

  function teleport(k) {
    const st = world.meta.stages[k]; if (!st) return;
    const s = world.nearestRouteS(st.start[0], st.start[1]), r = world.routeAt(s);
    if (mode === 'car') car.place(r.x - r.ty * -5.25, r.y + r.tx * -5.25, Math.atan2(r.ty, r.tx));
    else person.place(r.x - r.ty * -12, r.y + r.tx * -12, 0);
    rig.init = false; terrain.update(r.x, r.y, 0, 999);
    hud.toast(`傳送到 Stage ${st.stage}:${st.title}`);
  }

  let t = 0;
  function tick(dt, draw = true) {
    t += dt;
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
    const mv = input.move();

    // ---- global keys
    if (input.hit('KeyH')) $('help').classList.toggle('show');
    if (input.hit('KeyN')) { audio.muted = !audio.muted; hud.toast(audio.muted ? '音效關閉' : '音效開啟'); }
    if (input.hit('KeyG')) { quality = (quality + 1) % 3; applyQuality(); hud.toast(`畫質:${qualities[quality].name}`); }
    for (let k = 0; k < 10; k++) if (input.hit(k === 9 ? 'Digit0' : 'Digit' + (k + 1))) teleport(k);

    const carBX = car.pos.x, carBY = -car.pos.z;
    if (mode === 'foot') {
      person.update(dt, mv, rig.yaw);
      const dCar = Math.hypot(person.pos.x - car.pos.x, person.pos.z - car.pos.z);
      hud.prompt(dCar < 5.5 ? '按 F 上車' : '');
      if (input.hit('KeyF') && dCar < 5.5) {
        mode = 'car'; person.mesh.visible = false; rig.freeLook = 0; hud.prompt('');
        hud.toast('E/Q 升降檔 · M 手自排 · Space 手煞車 · C 視角 · R 回公路', 5);
      }
      if (input.hit('KeyR')) { const s = world.nearestRouteS(person.pos.x, -person.pos.z), r = world.routeAt(s); person.place(r.x - r.ty * -12, r.y + r.tx * -12, 0); }
      rig.updateFoot(dt, person, input);
    } else {
      if (input.hit('KeyE')) car.shift(1);
      if (input.hit('KeyQ')) car.shift(-1);
      if (input.hit('KeyM')) { car.auto = !car.auto; hud.toast(car.auto ? '自動排檔' : '手動排檔 (E 升檔 / Q 降檔)'); }
      if (input.hit('KeyC')) rig.mode = rig.mode === 'chase' ? 'hood' : 'chase';
      if (input.hit('KeyR')) { car.resetToRoad(); rig.init = false; }
      car.update(dt, mv);
      if (input.hit('KeyF')) {
        if (car.speedKmh < 10) {
          mode = 'foot';
          const lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw);   // car's left side
          person.place(car.pos.x + lx * 2.3, -(car.pos.z + lz * 2.3), car.yaw);
          person.mesh.visible = true; rig.yaw = car.yaw + Math.PI; rig.dist = 4.2;
        } else hud.toast('先停車再下車');
      }
      for (const e of car.events) {
        if (e.startsWith('crash')) hud.toast('碰撞!', 1);
      }
      car.events.length = 0;
      rig.updateCar(dt, car, input);
    }

    // ---- traffic (+ simple collisions with the player)
    const pBX = mode === 'car' ? car.pos.x : person.pos.x, pBY = mode === 'car' ? -car.pos.z : -person.pos.z;
    const routeS = world.nearestRouteS(pBX, pBY);
    traffic.update(dt, pBX, pBY, routeS, mode === 'car' ? { x: pBX, y: pBY } : null);
    for (const tc of traffic.cars) {
      const dx = pBX - tc.bx, dy = pBY - tc.by, d = Math.hypot(dx, dy);
      const r = mode === 'car' ? 2.6 : 1.5;
      if (d < r && d > 1e-3) {
        const push = (r - d);
        if (mode === 'car') { car.pos.x += dx / d * push; car.pos.z -= dy / d * push; car.vel.multiplyScalar(0.6); hud.toast('碰撞!', 1); }
        else { person.pos.x += dx / d * push; person.pos.z -= dy / d * push; }
      }
    }

    // ---- world streaming
    const p = mode === 'car' ? car.pos : person.pos;
    tTerrain -= dt; tStatic -= dt;
    if (tTerrain <= 0) { terrain.update(camera.position.x, -camera.position.z, Math.max(0, camera.position.y - world.H(camera.position.x, -camera.position.z))); tTerrain = 0.2; }
    if (tStatic <= 0) { statics.update(pBX); tStatic = 1.0; }
    veg.update(pBX, pBY);
    sky.follow(p);
    water.update(t);
    audio.update(car, mode === 'car');

    const heading = mode === 'car' ? Math.atan2(-Math.cos(car.yaw), Math.sin(car.yaw)) : Math.atan2(-Math.cos(person.yaw), Math.sin(person.yaw));
    hud.update(dt, { mode, car, person, bx: pBX, by: pBY, routeS, fps, run: mv.run, heading, carBX, carBY });
    input.endFrame();
    if (draw) renderer.render(scene, camera);
  }
  function frame() { requestAnimationFrame(frame); tick(Math.min(clock.getDelta(), 0.05)); }
  window.__game.tick = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) tick(dt, i === n - 1); };
  window.__game.input = input; window.__game.rig = rig;
  frame();
}

main().catch((e) => { console.error(e); $('load-text').textContent = '載入失敗:' + e.message; });
