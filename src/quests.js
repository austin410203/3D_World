// quests.js - town quest givers ("!"), quests (lost pet / catch the thief / delivery / tame / wolf hunt),
// and random highway accidents the player can stop at to give first aid.
import * as THREE from 'three';
import { labelSprite } from './pixel.js';
import { PartRig } from './life/rig.js';
import { SPECIES, quadParts, NAMES } from './life/wildlife.js';
import { buildCar } from './actors/carModel.js';

const PET_NAMES = ['小黑', '麥克斯', '露露', '布丁', '可可', '旺財', '咪咪', '奶茶'];
const OWNER = ['艾蜜莉', '老王', '傑克', '林太太', '小美', '比爾', '陳先生', '安娜'];
const TOWN_QUESTS = {
  'Pacific Bay': ['pet', 'thief'], 'Dustwater': ['delivery', 'tame:llama'], 'Silver Pass': ['hunt:wolf', 'pet'],
  'Maple Falls': ['tame:horse', 'pet'], 'Gateway City': ['thief', 'pet'], "Harper's Ridge": ['pet', 'delivery'],
  'Atlantic Harbor': ['thief', 'delivery'],
};
const TOWN_ZH = { 'Pacific Bay': '太平洋灣', 'Dustwater': '塵水鎮', 'Silver Pass': '銀峰鎮', 'Maple Falls': '楓瀑鎮',
  'Gateway City': '拱門城', "Harper's Ridge": '哈珀嶺', 'Atlantic Harbor': '大西洋港' };
const pick = (a) => a[(Math.random() * a.length) | 0];
const yawTo = (fromX, fromY, toX, toY) => Math.atan2(toX - fromX, -(toY - fromY));

export class Quests {
  constructor(scene, world, residents, wildlife, traffic, particles) {
    Object.assign(this, { scene, w: world, res: residents, wl: wildlife, traffic, fx: particles });
    this.events = []; this.prompt = '';
    this.emeralds = 0; this.active = null; this.dialog = null; this.givers = {}; this.cool = {}; this.t = 0;
    this.msgs = []; this.accident = null; this.accT = 70 + Math.random() * 60; this.completed = 0;
    this.towns = Object.entries(world.meta.towns).map(([name, t]) => ({ name, cx: t.center[0], cy: t.center[1], rx: t.radius[0], ry: t.radius[1] }));
    this.petRigs = { dog: new PartRig(scene, quadParts(SPECIES.dog), 4), cat: new PartRig(scene, quadParts(SPECIES.cat), 4) };
    this.pet = null;
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 160, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.visible = false; scene.add(this.beam);
  }

  say(msg, t = 3) { this.msgs.push([msg, t]); }

  // ------------------------------------------------------------ helpers
  freeSpot(cx, cy, rmin, rmax, tries = 40) {
    for (let k = 0; k < tries; k++) {
      const a = Math.random() * Math.PI * 2, d = rmin + Math.random() * (rmax - rmin);
      const bx = cx + Math.cos(a) * d, by = cy + Math.sin(a) * d;
      if (this.res.free(bx, by, this.w.H(bx, by))) return [bx, by];
    }
    return null;
  }
  townNear(bx, by) {
    for (const t of this.towns) {
      const q = ((bx - t.cx) / Math.max(t.rx, 300)) ** 2 + ((by - t.cy) / Math.max(t.ry, 300)) ** 2;
      if (q < 1.3) return t;
    }
    return null;
  }
  marker(text, bg) { const s = labelSprite(text, { bg }); this.scene.add(s); return s; }

  // ------------------------------------------------------------ givers
  spawnGiver(town, bx, by) {
    const spot = this.freeSpot(bx, by, 25, 80); if (!spot) return;
    const npc = this.res.make(spot[0], spot[1], 'wait', { home: { cx: spot[0], cy: spot[1], r: 2 } });
    Object.assign(npc.colors, { torso: 0x7b1fa2, armL: 0x7b1fa2, armR: 0x7b1fa2 });
    npc.giver = town.name; npc.questType = pick(TOWN_QUESTS[town.name] || ['pet']); npc.owner = pick(OWNER);
    npc.sprite = this.marker('!', '#ffd60a');
    this.res.addPersistent(npc);
    this.givers[town.name] = npc;
  }
  removeGiver(name) {
    const g = this.givers[name]; if (!g) return;
    this.scene.remove(g.sprite); this.res.remove(g); delete this.givers[name];
  }

  questText(npc) {
    const [type, arg] = npc.questType.split(':');
    const who = `${npc.owner}:`;
    if (type === 'pet') { npc.petKind = Math.random() < 0.6 ? 'dog' : 'cat'; npc.petName = pick(PET_NAMES); return `${who}我的${NAMES[npc.petKind]}「${npc.petName}」走失了!最後在這附近看到牠,可以幫我找回來嗎?`; }
    if (type === 'thief') return `${who}有小偷搶走我的錢包!他穿黑色帽T,往那邊跑掉了,快幫我抓住他!`;
    if (type === 'delivery') { npc.dest = this.nextTown(npc.giver); return `${who}幫我把這箱貨送到「${TOWN_ZH[npc.dest.name]}」,要在時限內送到喔!(開車最快)`; }
    if (type === 'tame') return `${who}牧場需要一隻馴服的${NAMES[arg]}。附近就有,騎上去(F)直到牠信任你為止!`;
    if (type === 'hunt') return `${who}狼群一直攻擊鎮上的牲畜,幫我消滅 3 隻狼!(Q 換武器,左鍵攻擊)`;
    return '';
  }
  nextTown(name) {
    const order = this.towns.slice().sort((a, b) => a.cx - b.cx), i = order.findIndex((t) => t.name === name);
    return order[i + 1] || order[i - 1];
  }

  accept(npc) {
    const [type, arg] = npc.questType.split(':');
    const q = { type, arg, npc, town: npc.giver, t: 0, stage: 'go' };
    npc.sprite.material.map.dispose(); this.scene.remove(npc.sprite); npc.sprite = this.marker('…', '#9e9e9e');
    if (type === 'pet') {
      const spot = this.freeSpot(npc.bx, npc.by, 120, 300) || [npc.bx + 150, npc.by];
      this.pet = { kind: npc.petKind, bx: spot[0], by: spot[1], z: this.w.H(spot[0], spot[1]), yaw: 0, phase: 0, speed: 0, state: 'lost',
                   home: spot.slice(), color: npc.petKind === 'dog' ? pick([0xffffff, 0x8a6a4a, 0x3a3a3a, 0xd8b890]) : pick([0xffffff, 0xff9933, 0x666666]) };
      const a = Math.random() * Math.PI * 2, r = Math.random() * 45;
      q.area = { bx: spot[0] + Math.cos(a) * r, by: spot[1] + Math.sin(a) * r, r: 70 };
      q.title = `尋找${NAMES[npc.petKind]}「${npc.petName}」`;
    }
    if (type === 'thief') {
      const spot = this.freeSpot(npc.bx, npc.by, 20, 40) || [npc.bx + 25, npc.by];
      const th = this.res.make(spot[0], spot[1], 'walk', { home: null });
      Object.assign(th.colors, { torso: 0x1c1c1c, armL: 0x1c1c1c, armR: 0x1c1c1c, legL: 0x111111, legR: 0x111111, hair: 0x111111 });
      th.hp = 8; th.thief = true;
      th.ai = (p, dt, threat) => this.thiefAI(p, dt, threat);
      th.onHit = (dmg, src) => { if (src === 'car' || th.hp <= 0) this.caught(); };
      th.sprite = this.marker('!', '#ff3b30');
      this.res.addPersistent(th); q.thief = th; q.limit = 150;
      q.title = '抓住小偷';
    }
    if (type === 'delivery') {
      const d = npc.dest, s = this.w.nearestRouteS(d.cx, d.cy), r = this.w.routeAt(s);
      q.drop = { bx: r.x - r.ty * -16, by: r.y + r.tx * -16, name: d.name };
      const dist = Math.abs(s - this.w.nearestRouteS(npc.bx, npc.by));
      q.limit = Math.round(dist / 24 + 90);
      q.title = `送貨到${TOWN_ZH[d.name]}`;
    }
    if (type === 'tame') { this.wl.spawnHerd(npc.bx, npc.by, arg, 90, 220); q.title = `馴服一隻${NAMES[arg]}`; }
    if (type === 'hunt') { this.wl.spawnHerd(npc.bx, npc.by, 'wolf', 140, 300); q.kills = 0; q.title = '消滅 3 隻狼'; }
    this.active = q; this.dialog = null;
    this.say(`接受任務:${q.title}`);
  }

  complete(reward) {
    const q = this.active; if (!q) return;
    this.emeralds += reward; this.completed++;
    this.say(`任務完成!獲得 ${reward} 顆綠寶石 💎`, 4);
    this.events.push({ type: 'quest-done', reward });
    if (this.pet) this.pet = null;
    if (q.thief) { const th = q.thief; setTimeout(() => { this.scene.remove(th.sprite); this.res.remove(th); }, 20000); th.sprite.visible = false; }
    if (q.npc) { this.scene.remove(q.npc.sprite); q.npc.sprite = this.marker('✔', '#34c759'); q.npc.wave = true; this.cool[q.town] = this.t + 90;
      const n = q.npc; setTimeout(() => { if (this.givers[n.giver] === n) this.removeGiver(n.giver); }, 12000); }
    this.beam.visible = false; this.active = null;
  }
  fail(msg) {
    const q = this.active; if (!q) return;
    this.say(`任務失敗:${msg}`, 4);
    if (q.thief) { this.scene.remove(q.thief.sprite); this.res.remove(q.thief); }
    this.pet = null; this.beam.visible = false;
    if (q.npc) { this.scene.remove(q.npc.sprite); q.npc.sprite = this.marker('!', '#ffd60a'); }
    this.active = null;
  }

  // ------------------------------------------------------------ thief
  thiefAI(p, dt, threat) {
    const q = this.active;
    if (!q || q.thief !== p || q.stage !== 'go') return 0;
    if (!threat) return 0;
    const dx = p.bx - threat.bx, dy = p.by - threat.by, d = Math.hypot(dx, dy);
    const want = Math.atan2(dx, -dy) + Math.sin(this.t * 0.9 + p.phase) * 0.5;
    let dyaw = Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw));
    p.yaw += dyaw * Math.min(1, dt * 4);
    const sp = d < 60 ? 6.3 : 4;
    for (let k = 0; k < 6; k++) {
      const nx = p.bx + Math.sin(p.yaw) * sp * dt, ny = p.by - Math.cos(p.yaw) * sp * dt, nz = this.w.H(nx, ny);
      if (this.res.free(nx, ny, nz)) { p.bx = nx; p.by = ny; p.z = nz; return sp; }
      p.yaw += (k % 2 ? 1 : -1) * 0.6 * (k + 1);
    }
    return 0;
  }
  caught() {
    const q = this.active; if (!q || q.type !== 'thief' || q.stage !== 'go') return;
    q.stage = 'return'; q.thief.down = 1e9; q.thief.ai = null; q.thief.sprite.visible = false;
    this.say('抓到小偷了!把錢包拿回去給失主');
  }

  // ------------------------------------------------------------ accidents
  spawnAccident(routeS, dir) {
    const s0 = routeS + dir * (800 + Math.random() * 500);
    if (s0 < 300 || s0 > this.w.routeLen - 300) return;
    const r = this.w.routeAt(s0), nx = -r.ty, ny = r.tx, lane = (l) => [r.x + nx * l, r.y + ny * l];
    const head = Math.atan2(r.ty * dir, r.tx * dir);
    const yawB = (a) => Math.atan2(Math.cos(a), -Math.sin(a));
    const acc = { s: s0, dir, meshes: [], wrecks: [], t: 0, helped: false, progress: 0 };
    const mk = (l, dyaw, roll, color) => {
      const [bx, by] = lane(l); const z = this.w.ground(bx, by).z;
      const c = buildCar(color); c.position.set(bx, z + (roll ? 0.9 : 0), -by); c.rotation.set(0, yawB(head) + dyaw, roll, 'YXZ');
      c.userData.body.children.forEach((m) => { if (m.material?.color) m.material = m.material.clone(); });
      this.scene.add(c); acc.meshes.push(c); acc.wrecks.push({ bx, by, z, r: 2.4, mesh: c });
    };
    mk(-1.9 * dir, 0.6, 0, pick([0x1565c0, 0xf9a825, 0x2e7d32]));
    mk(-5.4 * dir, -2.1, Math.PI / 2 * 0.95, pick([0x8e24aa, 0x9e9e9e, 0xef6c00]));
    for (let k = 0; k < 4; k++) {      // traffic cones upstream
      const ss = s0 - dir * (18 + k * 4), rr = this.w.routeAt(ss), l = -dir * (1 + k * 1.6);
      const bx = rr.x - rr.ty * l, by = rr.y + rr.tx * l;
      const cone = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.35), new THREE.MeshStandardMaterial({ color: 0xff6d00 }));
      cone.position.set(bx, this.w.ground(bx, by).z + 0.35, -by); this.scene.add(cone); acc.meshes.push(cone);
    }
    const [ix, iy] = lane(-10.5 * dir);
    const inj = this.res.make(ix, iy, 'wait', { home: { cx: ix, cy: iy, r: 1 } }); inj.down = 1e9; inj.injured = true;
    const [bx2, by2] = lane(-11.8 * dir);
    const by_ = this.res.make(bx2 + r.tx * 1.5, by2 + r.ty * 1.5, 'wait', { home: { cx: bx2, cy: by2, r: 1 } }); by_.wave = true;
    by_.yaw = yawTo(by_.bx, by_.by, r.x - r.tx * dir * 50, r.y - r.ty * dir * 50);
    this.res.addPersistent(inj); this.res.addPersistent(by_);
    acc.injured = inj; acc.bystander = by_;
    acc.sprite = this.marker('⚠', '#ff9500'); acc.sprite.position.set(r.x, r.z + 7, -r.y);
    this.traffic.blockers.push(acc.block = { s: s0, dir });
    this.accident = acc;
    this.say('⚠ 前方發生車禍!停車下來幫忙(靠近傷者按住 E)', 5);
  }
  clearAccident() {
    const a = this.accident; if (!a) return;
    for (const m of a.meshes) this.scene.remove(m);
    this.scene.remove(a.sprite); this.res.remove(a.injured); this.res.remove(a.bystander);
    this.traffic.blockers.splice(this.traffic.blockers.indexOf(a.block), 1);
    this.accident = null; this.accT = 120 + Math.random() * 120;
  }

  // ------------------------------------------------------------ per frame
  // ctx: { mode, bx, by, z, routeS, carSpeed, travelDir, interact (E pressed), interactHeld (E down), origin }
  update(dt, ctx) {
    this.t += dt; this.events = [];
    const { bx, by } = ctx;
    // givers in the town you're in
    const town = ctx.mode !== 'god' ? this.townNear(bx, by) : null;
    if (town && !this.givers[town.name] && (!this.active || this.active.town !== town.name) && (this.cool[town.name] || 0) < this.t) this.spawnGiver(town, bx, by);
    for (const [name, g] of Object.entries(this.givers)) {
      if (Math.hypot(g.bx - bx, g.by - by) > 900 && (!this.active || this.active.npc !== g)) this.removeGiver(name);
      else if (g.sprite) { g.sprite.position.set(g.bx, g.z + 2.6 + Math.sin(this.t * 3) * 0.15, -g.by); }
      if (!g.wave && !this.dialog) g.yaw += Math.atan2(Math.sin(yawTo(g.bx, g.by, bx, by) - g.yaw), Math.cos(yawTo(g.bx, g.by, bx, by) - g.yaw)) * Math.min(1, dt * 2) * (Math.hypot(g.bx - bx, g.by - by) < 15 ? 1 : 0);
    }
    // talk to a giver
    const foot = ctx.mode === 'foot' || ctx.mode === 'ride';
    let nearGiver = null;
    for (const g of Object.values(this.givers)) if (foot && Math.hypot(g.bx - bx, g.by - by) < 3.5) nearGiver = g;
    if (this.dialog && (!nearGiver || nearGiver !== this.dialog.npc)) this.dialog = null;
    if (nearGiver && ctx.interact) {
      if (this.active && this.active.npc === nearGiver) this.turnIn(nearGiver);
      else if (this.dialog) { if (this.active) this.say('先完成目前的任務!'); else this.accept(nearGiver); }
      else if (!this.active || this.active.npc !== nearGiver) this.dialog = { npc: nearGiver, text: this.questText(nearGiver) };
    }
    this.prompt = nearGiver && !this.dialog ? (this.active && this.active.npc === nearGiver ? '按 E 回報任務' : `按 E 和 ${nearGiver.owner} 說話`) : '';

    // active quest logic
    const q = this.active;
    if (q) {
      q.t += dt;
      if (q.type === 'pet' && this.pet) this.updatePet(dt, ctx, q);
      if (q.type === 'thief') {
        const th = q.thief, d = Math.hypot(th.bx - bx, th.by - by);
        th.sprite.position.set(th.bx, th.z + 2.6, -th.by);
        if (q.stage === 'go') {
          if (th.hp <= 0) this.caught();
          if (foot && d < 1.9 && ctx.interact) this.caught();
          if (d > 450 || q.t > q.limit) this.fail('小偷逃走了…');
        }
      }
      if (q.type === 'delivery') {
        const dr = q.drop, d = Math.hypot(dr.bx - bx, dr.by - by);
        this.beam.visible = true; this.beam.position.set(dr.bx, this.w.H(dr.bx, dr.by) + 80, -dr.by);
        if (d < 14) this.complete(25);
        else if (q.t > q.limit) this.fail('超過時限了');
      }
    }
    // pet quest prompt
    if (q && q.type === 'pet' && this.pet && this.pet.state === 'lost' && foot && Math.hypot(this.pet.bx - bx, this.pet.by - by) < 3) this.prompt = `按 E 帶走「${q.npc.petName}」`;
    if (q && q.type === 'thief' && q.stage === 'go' && foot && Math.hypot(q.thief.bx - bx, q.thief.by - by) < 2.2) this.prompt = '按 E 制伏小偷!';

    // highway accidents
    if (!this.accident) {
      if (ctx.mode === 'car' && ctx.carSpeed > 15 && ctx.onRoad) { this.accT -= dt; if (this.accT <= 0) this.spawnAccident(ctx.routeS, ctx.travelDir); }
    } else {
      const a = this.accident; a.t += dt;
      for (const wk of a.wrecks) { if (Math.random() < dt * 8) this.fx.emit('smoke', new THREE.Vector3(wk.bx, wk.z + 1.4, -wk.by)); if (!a.helped && Math.random() < dt * 14) this.fx.emit('fire', new THREE.Vector3(wk.bx, wk.z + 1.0, -wk.by)); }
      const inj = a.injured, d = Math.hypot(inj.bx - bx, inj.by - by);
      if (!a.helped && ctx.mode === 'foot' && d < 3) {
        this.prompt = '按住 E 急救傷者';
        if (ctx.interactHeld) { a.progress += dt / 3; if (a.progress >= 1) {
          a.helped = true; inj.down = 0; inj.wave = true; inj.injured = false; a.helpedT = a.t;
          this.emeralds += 15; this.say('你救了傷者!獲得 15 顆綠寶石 💎 救護車馬上就到', 4); this.events.push({ type: 'quest-done', reward: 15 });
        } } else a.progress = Math.max(0, a.progress - dt * 0.5);
      }
      const far = Math.abs(this.w.nearestRouteS(bx, by) - a.s) > 2500 || (ctx.mode === 'god');
      if ((a.helped && a.t - a.helpedT > 25) || far) this.clearAccident();
    }
    // messages out
    const out = this.msgs; this.msgs = []; return out;
  }

  updatePet(dt, ctx, q) {
    const p = this.pet, { bx, by } = ctx, d = Math.hypot(p.bx - bx, p.by - by);
    const foot = ctx.mode === 'foot' || ctx.mode === 'ride';
    if (p.state === 'lost') {
      if (foot && d < 3 && ctx.interact) { p.state = 'follow'; this.say(`找到「${q.npc.petName}」了!帶牠回去給 ${q.npc.owner}`); }
      // wander near its spot
      p.timer = (p.timer || 0) - dt;
      if (p.timer <= 0) { p.timer = 2 + Math.random() * 4; p.speed = Math.random() < 0.5 ? 0 : 1; p.yaw += (Math.random() - 0.5) * 2; }
      if (Math.hypot(p.bx - p.home[0], p.by - p.home[1]) > 14) p.yaw = yawTo(p.bx, p.by, p.home[0], p.home[1]);
    } else {
      if (ctx.mode === 'car') { p.bx = bx; p.by = by; p.hidden = true; p.speed = 0; }
      else {
        if (p.hidden) { p.hidden = false; p.bx = bx + 1.5; p.by = by + 1.5; }
        p.yaw = yawTo(p.bx, p.by, bx, by);
        p.speed = d > 2.5 ? Math.min(8, d * 1.2) : 0;
        if (d > 60) { p.bx = bx + 2; p.by = by; }
      }
      const g = q.npc;
      if (Math.hypot(p.bx - g.bx, p.by - g.by) < 6 && ctx.mode !== 'car') { this.say(`${g.owner}:「${g.petName}」!謝謝你!!`); this.complete(20); return; }
    }
    if (p.speed > 0) {
      const nx = p.bx + Math.sin(p.yaw) * p.speed * dt, ny = p.by - Math.cos(p.yaw) * p.speed * dt;
      if (this.w.waterLevel(nx, ny) === null) { p.bx = nx; p.by = ny; } else p.yaw += Math.PI / 2;
    }
    p.z = this.w.H(p.bx, p.by);
    p.phase += p.speed * dt * 6;
  }

  turnIn(npc) {
    const q = this.active;
    if (q.type === 'thief' && q.stage === 'return') { this.say(`${npc.owner}:我的錢包!太感謝你了!`); this.complete(30); }
    else if (q.type === 'pet') this.say('還沒找到寵物喔,注意小地圖上的搜尋範圍');
    else this.say(`任務進行中:${q.title}`);
  }

  onEvent(e) {
    const q = this.active; if (!q) return;
    if (q.type === 'tame' && e.type === 'tamed' && e.kind === q.arg) { this.say(`成功馴服${NAMES[e.kind]}!`); this.complete(25); }
    if (q.type === 'hunt' && e.type === 'kill' && e.kind === 'wolf') { q.kills++; this.say(`消滅狼 ${q.kills}/3`); if (q.kills >= 3) this.complete(30); }
  }

  render(origin) {
    for (const r of Object.values(this.petRigs)) r.begin(origin);
    const p = this.pet;
    if (p && !p.hidden) {
      const s = Math.sin(p.phase) * Math.min(0.6, p.speed * 0.3);
      this.petRigs[p.kind].push(new THREE.Vector3(p.bx, p.z, -p.by), p.yaw, 1, { fl: [s, 0, 0], br: [s, 0, 0], fr: [-s, 0, 0], bl: [-s, 0, 0],
        tail: [0.6 + Math.sin(this.t * 10) * 0.3, 0, Math.sin(this.t * 12) * 0.4], head: [p.state === 'lost' ? 0.3 : 0, 0, 0] },
        { body: p.color, head: p.color, tail: p.color, fl: p.color, fr: p.color, bl: p.color, br: p.color });
    }
    for (const r of Object.values(this.petRigs)) r.end();
  }

  // minimap markers + tracker for the HUD
  markers() {
    const out = [];
    for (const g of Object.values(this.givers)) if (!this.active || this.active.npc !== g || this.active.stage === 'return' || this.active.type === 'pet' && this.pet?.state === 'follow') out.push({ bx: g.bx, by: g.by, type: 'giver' });
    const q = this.active;
    if (q?.type === 'pet' && this.pet?.state === 'lost') out.push({ bx: q.area.bx, by: q.area.by, r: q.area.r, type: 'area' });
    if (q?.type === 'thief' && q.stage === 'go') out.push({ bx: q.thief.bx, by: q.thief.by, type: 'target' });
    if (q?.type === 'delivery') out.push({ bx: q.drop.bx, by: q.drop.by, type: 'target' });
    if (this.accident) out.push({ bx: this.accident.injured.bx, by: this.accident.injured.by, type: 'accident' });
    return out;
  }
  tracker(bx, by) {
    const q = this.active; const lines = [];
    if (q) {
      if (q.type === 'pet') lines.push(this.pet?.state === 'follow' ? `帶「${q.npc.petName}」回去給 ${q.npc.owner}` : '在小地圖黃色圓圈範圍內尋找');
      if (q.type === 'thief') lines.push(q.stage === 'go' ? `追上並制伏小偷(${Math.round(Math.hypot(q.thief.bx - bx, q.thief.by - by))} m)· 剩 ${Math.max(0, Math.ceil(q.limit - q.t))} 秒` : `回去找 ${q.npc.owner}`);
      if (q.type === 'delivery') lines.push(`目的地 ${Math.round(Math.hypot(q.drop.bx - bx, q.drop.by - by))} m · 剩 ${Math.max(0, Math.ceil(q.limit - q.t))} 秒(黃色光柱)`);
      if (q.type === 'tame') lines.push(`找到${NAMES[q.arg]},按 F 騎上去,反覆嘗試直到馴服`);
      if (q.type === 'hunt') lines.push(`狼 ${q.kills}/3 · 牠們會主動攻擊,小心!`);
    }
    if (this.accident && !this.accident.helped) lines.push(`⚠ 車禍現場 ${Math.round(Math.hypot(this.accident.injured.bx - bx, this.accident.injured.by - by))} m`);
    return { title: q ? q.title : (this.accident ? '突發事件' : ''), lines };
  }
}
