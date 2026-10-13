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
import { GodMode, PLACES } from './god.js';
import { Residents } from './life/residents.js';
import { Wildlife } from './life/wildlife.js';

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
  const god = new GodMode(camera, world);
  const residents = new Residents(scene, world);
  const wildlife = new Wildlife(scene, world);
  const lifeOrigin = new THREE.Vector3();
  let mode = 'foot';
  window.__game = { world, car, person, camera, terrain, statics, veg, traffic, scene, renderer, god, residents, wildlife, get mode() { return mode; } };

  // ---- god view (free flight)
  const enterGod = () => {
    if (mode === 'god') return;
    god.enter(mode === 'car' ? car.pos : person.pos);
    mode = 'god'; input.lockEnabled = false; document.exitPointerLock?.();
    $('god').classList.add('show'); hud.prompt('');
    hud.toast('上帝視角:WASD 飛行 · E 上升 · Q 下降 · Shift 加速 · 點左側地點飛過去 · V 降落', 5);
  };
  const exitGod = () => {
    const p = camera.position; let bx = p.x, by = -p.z;
    if (world.waterLevel(bx, by) !== null) { const s = world.nearestRouteS(bx, by), r = world.routeAt(s); bx = r.x - r.ty * -12; by = r.y + r.tx * -12; }
    const b = world.inBounds(bx, by);
    person.place(b.x, b.y, god.yaw + Math.PI); person.mesh.visible = true;
    mode = 'foot'; input.lockEnabled = true; god.fly = null;
    rig.yaw = god.yaw; rig.pitch = 0.25; rig.init = false;
    $('god').classList.remove('show');
    hud.toast('已降落 · 按 K 把車叫過來', 3);
  };
  for (const pl of PLACES) {
    const b = document.createElement('button');
    b.innerHTML = `${pl.name}<small>${pl.sub}</small>`;
    b.onclick = () => { if (mode !== 'god') enterGod(); god.flyTo(pl); hud.toast('飛往 ' + pl.name); };
    $('places').appendChild(b);
  }
  progress('完成');

  $('loading').classList.add('done');
  $('start').onclick = () => { $('loading').style.display = 'none'; audio.start(); canvas.requestPointerLock?.()?.catch?.(() => {}); };
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
    if (mode === 'god') {
      god.flyTo({ bx: r.x, by: r.y, h: 40, dist: 700, az: Math.atan2(r.ty, r.tx) * 180 / Math.PI + 200, elev: 0.3 });
      hud.toast(`飛往 Stage ${st.stage}:${st.title}`); return;
    }
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
    if (input.hit('KeyV')) { if (mode === 'god') exitGod(); else if (mode === 'car' && car.speedKmh > 10) hud.toast('先停車再進入上帝視角'); else enterGod(); }
    if (input.hit('KeyL')) { residents.enabled = wildlife.enabled = !residents.enabled; hud.toast(residents.enabled ? '居民 / 動物:開' : '居民 / 動物:關'); }
    if (mode === 'god') {
      const anyKey = input.down('KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'Space');
      god.update(dt, input, anyKey);
      $('god-alt').textContent = `高度 ${Math.round(god.altitude())} m · 速度 ${Math.round(god.vel.length() * 3.6)} km/h`;
    } else if (mode === 'foot') {
      if (input.hit('KeyK')) {   // call the car: park it beside the player
        const fx = Math.sin(person.yaw), fz = Math.cos(person.yaw);
        const bx = person.pos.x + fz * 4 + fx * 3, by = -(person.pos.z - fx * 4 + fz * 3);
        car.place(bx, by, Math.atan2(-fz, fx)); hud.toast('車子已經到了');
      }
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
    const focus = mode === 'god' ? camera.position : mode === 'car' ? car.pos : person.pos;
    const pBX = focus.x, pBY = -focus.z;
    const routeS = world.nearestRouteS(pBX, pBY);
    traffic.update(dt, pBX, pBY, routeS, mode === 'car' ? { x: pBX, y: pBY } : null);
    for (const tc of traffic.cars) {
      if (mode === 'god') break;
      const dx = pBX - tc.bx, dy = pBY - tc.by, d = Math.hypot(dx, dy);
      const r = mode === 'car' ? 2.6 : 1.5;
      if (d < r && d > 1e-3) {
        const push = (r - d);
        if (mode === 'car') { car.pos.x += dx / d * push; car.pos.z -= dy / d * push; car.vel.multiplyScalar(0.6); hud.toast('碰撞!', 1); }
        else { person.pos.x += dx / d * push; person.pos.z -= dy / d * push; }
      }
    }

    // ---- residents & wildlife around the focus point
    const camAlt = Math.max(0, camera.position.y - Math.max(0, world.H(camera.position.x, -camera.position.z)));
    lifeOrigin.set(Math.round(pBX / 500) * 500, 0, -Math.round(pBY / 500) * 500);
    const threat = mode === 'god' ? null : { bx: pBX, by: pBY, car: mode === 'car', speed: mode === 'car' ? car.speed : person.speed };
    const lifeAlt = mode === 'god' ? camAlt : 0;
    const ev = [...residents.update(dt, pBX, pBY, lifeAlt, lifeOrigin, threat), ...wildlife.update(dt, pBX, pBY, lifeAlt, lifeOrigin, threat)];
    for (const e of ev) {
      if (e.type === 'hit-person') { car.vel.multiplyScalar(0.85); hud.toast('小心行人!', 1.5); }
      if (e.type === 'hit-animal') { car.vel.multiplyScalar(e.big ? 0.45 : 0.85); hud.toast(`撞到${{ cow: '牛', bison: '野牛', elk: '麋鹿', bear: '熊', horse: '馬', deer: '鹿', pig: '豬', sheep: '羊', chicken: '雞', llama: '羊駝', fox: '狐狸', wolf: '狼', goat: '山羊' }[e.kind] || '動物'}了!`, 1.5); }
    }
    if (mode === 'god') {
      const c = wildlife.count();
      $('life-count').textContent = `附近:居民 ${residents.list.length} · 動物 ${c.animals} · 鳥 ${c.birds}`;
      scene.fog.near = 2500 + camAlt * 2; scene.fog.far = 42000 + camAlt * 12;
    } else if (scene.fog.near !== 2500) { scene.fog.near = 2500; scene.fog.far = 42000; }

    // ---- world streaming
    const p = focus;
    tTerrain -= dt; tStatic -= dt;
    if (tTerrain <= 0) { terrain.update(camera.position.x, -camera.position.z, Math.max(0, camera.position.y - world.H(camera.position.x, -camera.position.z))); tTerrain = 0.2; }
    if (tStatic <= 0) { statics.update(pBX); tStatic = 1.0; }
    veg.update(pBX, pBY);
    sky.follow(mode === 'god' ? new THREE.Vector3(p.x, Math.max(0, world.H(p.x, -p.z)), p.z) : p);
    water.update(t);
    audio.update(car, mode === 'car');

    const heading = mode === 'god' ? Math.atan2(Math.cos(god.yaw), -Math.sin(god.yaw))
      : mode === 'car' ? Math.atan2(-Math.cos(car.yaw), Math.sin(car.yaw)) : Math.atan2(-Math.cos(person.yaw), Math.sin(person.yaw));
    hud.update(dt, { mode, car, person, bx: pBX, by: pBY, routeS, fps, run: mv.run, heading, carBX, carBY,
                     span: mode === 'god' ? Math.min(30000, 1500 + camAlt * 6) : null });
    input.endFrame();
    if (draw) renderer.render(scene, camera);
  }
  function frame() { requestAnimationFrame(frame); const dt = Math.min(clock.getDelta(), 0.05); if (!window.__game.paused) tick(dt); }
  window.__game.tick = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) tick(dt, i === n - 1); };
  window.__game.input = input; window.__game.rig = rig;
  frame();
}

main().catch((e) => { console.error(e); $('load-text').textContent = '載入失敗:' + e.message; });
