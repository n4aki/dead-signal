import * as THREE from './vendor/three.module.js';
import { GameState, WEAPONS, wavePlan, TRAVEL_HOLD } from './engine.js';
import { box, orb, mat } from './primitives.js';
import { buildStages } from './stages.js';
import { STAGES as AREAS, toWorld, worldPose, travelPose } from './stage-data.js';
import { ENEMIES, encounterProfile, createBrain, stepBrain, enemyLocalPath } from './enemy-data.js';
import { createEnemyModel, animateEnemy, disposeEnemyModel } from './enemy-models.js';
import { segmentSphereEntry } from './combat-math.js';
import { createBestiary } from './bestiary.js';
import { createBossBrain, stepBoss, staggerBoss, bossWarning, rockPosition, strikeProjectile } from './boss-ai.js';
import { FireControl } from './combat-input.js';
import { createCombatFx } from './combat-fx.js';
import { SPAWN_SITES, createSpawnSelector } from './spawn-data.js';
import { createEnemyVoices } from './enemy-voices.js';
import { routeChoices } from './route-data.js';
import { createRouteChoice } from './route-choice.js';
import { RescueEvent,RESCUE_STAGE,SURVIVOR_POSITION } from './rescue-event.js';
import { createSurvivor,rescueMarker } from './survivor-model.js';
import { createLocomotion,stepLocomotion,createMotionClearance } from './enemy-motion.js';
import { NavigationGrid,FreePlayer } from './free-roam.js';

const $ = id => document.getElementById(id);
const state = new GameState();
const touchDevice=matchMedia('(pointer: coarse)').matches;
let freeMode=false,wasLocked=false,lastMouse=null,previousArea='1';
let freeInputFrame=0;const freeTaps=new Map();
const arcadeControls=$('menu-controls').innerHTML,arcadePause=$('control-info').innerHTML;
const routePanel=createRouteChoice(id=>{if(state.chooseRoute(id))enterTravel();});
const heartShape='M1 3H3V1H6V3H8V1H11V3H13V7H11V9H9V11H8V13H6V11H5V9H3V7H1Z';
$('health-hearts').innerHTML=Array.from({length:10},()=>`<svg class="life-heart" viewBox="0 0 14 14" aria-hidden="true"><path class="heart-empty" d="${heartShape}"/><g class="heart-fill"><path d="${heartShape}"/><path class="heart-shine" d="M3 3H5V5H3Z"/></g></svg>`).join('');
const heartFills=[...$('health-hearts').querySelectorAll('.heart-fill')];
let shownHealth=-1;
let best = 0;
try { best = Number(localStorage.getItem('dead-signal-best')) || 0; } catch {}
$('menu-best').textContent = String(best).padStart(6, '0');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, powerPreference: 'high-performance' }); }
catch { $('error').hidden = false; $('start').disabled = true; throw new Error('WebGL initialization failed'); }
renderer.setPixelRatio(Math.min(devicePixelRatio, touchDevice?1.25:1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#122825');
scene.fog = new THREE.FogExp2('#18352f', .029);
const camera = new THREE.PerspectiveCamera(59, 1, .1, 130);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);
const clock = new THREE.Clock();
const enemies = [], barrels = [], projectiles = [];
const trigger=new FireControl(),effects=createCombatFx(scene);
const voices=createEnemyVoices();
let chooseSpawn=createSpawnSelector(0),contactEntrance='';
const bestiary = createBestiary();
const ambient = new THREE.HemisphereLight('#cadbe9', '#292b30', 2.0); scene.add(ambient);
const moon = new THREE.DirectionalLight('#bfd6ec', 2.1); moon.position.set(-12, 22, -12); scene.add(moon);
scene.add(moon.target);
moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048); Object.assign(moon.shadow.camera, { left: -18, right: 18, top: 25, bottom: -25, far: 80 }); moon.shadow.bias = -.001;
const warm = new THREE.PointLight('#ff8c45', 28, 24, 1.7); warm.position.set(5, 4, -8); scene.add(warm);
const rim = new THREE.PointLight('#85c8df', 22, 28, 1.6); rim.position.set(-4, 4, -23); scene.add(rim);
const muzzle = new THREE.PointLight('#ffd494', 0, 17, 1.4); scene.add(muzzle);

function sign(text, color, width, height) {
  const c = document.createElement('canvas'); c.width = 768; c.height = 160;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#101a17'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.strokeRect(8, 8, 752, 144);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
  let fontSize=64;ctx.font=`bold ${fontSize}px Arial`;
  while(ctx.measureText(text).width>704&&fontSize>20){fontSize-=2;ctx.font=`bold ${fontSize}px Arial`;}
  ctx.fillText(text, 384, 85,704);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex }));
}
const stages = buildStages(scene, { box, orb, mat, sign });
// Test motion in each stage's local coordinates; rotated rooms retain oriented cover.
const motionObstacles=stages.covers.map((covers,index)=>{
  const list=covers.map(m=>{m.updateMatrix();m.geometry.computeBoundingBox();return m.geometry.boundingBox.clone().applyMatrix4(m.matrix);});
  for(const [x,y,z] of AREAS[index].barrels)list.push(new THREE.Box3(new THREE.Vector3(x-.43,y,z-.43),new THREE.Vector3(x+.43,y+1.1,z+.43)));
  return list.map(b=>({min:b.min.toArray(),max:b.max.toArray()}));
});
const freeNav=new NavigationGrid(motionObstacles[0],{radius:.78}),freePlayer=new FreePlayer(freeNav);
const freeStaticBoxes=motionObstacles[0].slice(0,-AREAS[0].barrels.length);
function refreshFreeNavigation(){
  freeNav.setBoxes([...freeStaticBoxes,...barrels.filter(b=>b.alive).map(b=>({min:[b.root.position.x-.43,0,b.root.position.z-.43],max:[b.root.position.x+.43,1.1,b.root.position.z+.43]}))]);
}
const freeBoundary=new THREE.Group();stages.groups[0].add(freeBoundary);freeBoundary.visible=false;
for(const z of[-36,11.5])for(let x=-6;x<=6;x+=2){
  box(freeBoundary,x,.6,z,1.9,1.2,.5,'#5d6864');
  for(let i=0;i<4;i++){const stripe=box(freeBoundary,x-.65+i*.42,.6,z+(z>0?-.26:.26),.18,.65,.02,'#d4b459',false);stripe.rotation.z=-.4;}
}
function requestFreeLook(){
  if(touchDevice||!freeMode||document.pointerLockElement===$('scene'))return;
  try{const result=$('scene').requestPointerLock?.();result?.catch(()=>{$('free-pointer-hint').textContent='マウスを動かして視点操作 / 矢印キーにも対応';});}catch{$('free-pointer-hint').textContent='マウスを動かして視点操作 / 矢印キーにも対応';}
}
function releaseFreeLook(){lastMouse=null;if(document.pointerLockElement=== $('scene'))document.exitPointerLock();}
function updateFreeCamera(){
  camera.position.set(freePlayer.position[0],1.72+(freePlayer.moving?Math.sin(freePlayer.travel*7)*.022:0),freePlayer.position[2]);
  camera.rotation.set(freePlayer.pitch,freePlayer.yaw,0,'YXZ');camera.updateMatrixWorld(true);
}
function pursueFreePlayer(e,dt){
  if(e.freeStationary||e.root.position.y>.3)return;
  e.huntLeft=(e.huntLeft??0)-dt;if(e.huntLeft>0||!freeNav.clear(e.root.position.toArray()))return;
  e.huntLeft=.65+(e.seed%1)*.3;
  const goal=freeNav.targetNear(freePlayer.position);if(!goal)return;
  if(e.huntGoal&&Math.hypot(goal[0]-e.huntGoal[0],goal[2]-e.huntGoal[2])<.65&&!e.locomotion.arrived)return;
  const path=freeNav.path(e.root.position.toArray(),goal);if(!path)return;
  const old=e.locomotion;e.route=path;e.arrived=false;resetLocomotion(e);
  for(const key of['time','gait','speed','weight','yaw','turn'])e.locomotion[key]=old[key];
  e.huntGoal=goal;
}
function motionClearance(type,index=state.areaIndex){
  return createMotionClearance(type,AREAS[index],motionObstacles[index]);
}
function resetLocomotion(e){e.locomotion=createLocomotion(e.type,e.route,{seed:e.seed,isClear:motionClearance(e.type)});if(e.arrived)e.locomotion.arrived=true;}
function moveEnemy(e,dt,move,target,pace=1){
  const m=stepLocomotion(e.locomotion,dt,{move,baseSpeed:e.speed*(1+state.wave*.05),target:target.toArray(),hit:e.hit,pace,
    neighbors:enemies.filter(n=>n!==e&&!n.dead&&n.locomotion&&!n.demo).map(n=>n.locomotion)});
  e.root.position.fromArray(m.position);e.root.rotation.y=m.yaw;e.distance=m.distance;e.arrived=m.arrived;
}
let visibleStage = 0;
let cameraLocalPose = AREAS[0].shots[0], travelStartPose = cameraLocalPose;
function showStage(index) { visibleStage = index; stages.show(index); scene.background.set(AREAS[index].color); scene.fog.color.set(AREAS[index].color); scene.fog.density = AREAS[index].indoor ? .014 : .019; ambient.intensity = AREAS[index].indoor ? 1.8 : 2; warm.color.set(AREAS[index].light); }
const dustCount = 260, dustArray = new Float32Array(dustCount * 3);
for (let i = 0; i < dustCount; i++) { dustArray[i * 3] = (Math.random() - .5) * 24; dustArray[i * 3 + 1] = Math.random() * 10; dustArray[i * 3 + 2] = 8 - Math.random() * 65; }
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustArray, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#b2c9a2', size: .025, transparent: true, opacity: .5 })); scene.add(dust);

function enemyPoint(enemy) { return enemy.root.position.clone().add(new THREE.Vector3(0, enemy.def.center, 0)); }
function makeEnemy(type, path, demo = false, entrance=null) {
  const def = ENEMIES[type], rig = createEnemyModel(type);
  const route = enemyLocalPath(type,path).map(p=>toWorld(state.area,p));
  rig.root.position.fromArray(route[0]); scene.add(rig.root);
  const enemy = { ...rig, ...createBrain(type), def, maxHp:def.hp, speed:def.speed, seed:Math.random()*10, route, distance:0, arrived:false, death:0, hit:0, demo };
  enemy.spawnGrace=entrance ? .65 : 0;
  enemy.voiceLeft=1+Math.random()*4;enemy.growled=false;
  if(entrance?.kind==='perch'){enemy.arrived=true;enemy.range=40;enemy.freeStationary=true;}
  if(type==='boss'){enemy.bossBrain=createBossBrain();enemy.bossMotion={gait:0,weight:0};enemy.root.position.fromArray(toWorld(state.area,enemy.bossBrain.position));}
  else {resetLocomotion(enemy);enemy.root.rotation.y=enemy.locomotion.yaw;}
  rig.root.traverse(o => { if(o.isMesh && !o.userData.nonTarget) o.userData.enemy=enemy; });
  enemies.push(enemy); return enemy;
}
const barrelGeo = new THREE.CylinderGeometry(.39, .4, 1.08, 12);
function makeBarrels() {
  for (const b of barrels) scene.remove(b.root); barrels.length = 0;
  for (const [x, y, z] of state.area.barrels) {
    const root = new THREE.Group(); root.position.fromArray(toWorld(state.area,[x,y+.55,z])); root.rotation.y = state.area.yaw; scene.add(root);
    const body = new THREE.Mesh(barrelGeo, mat('#88452c')); body.castShadow = true; root.add(body);
    for (const y of [-.33, .33]) box(root, 0, y, .4, .58, .055, .035, '#c2a271');
    const warning = sign('!', '#f4ce72', .37, .37); warning.position.set(0, .02, .411); root.add(warning);
    const b = { root, alive: true }; root.traverse(o => { if (o.isMesh) o.userData.barrel = b; }); barrels.push(b);
  }
  if(freeMode)refreshFreeNavigation();
}
makeBarrels();
makeEnemy('skeleton', [[1.5,0,-3.7]], true); makeEnemy('bomber', [[4,0,-6]], true); makeEnemy('wolf', [[-.7,0,-4]], true);

// A view-model remains attached to the camera, like an arcade light gun.
const gun = new THREE.Group(); camera.add(gun); scene.add(camera);
gun.scale.setScalar(.62);
const gunBody = box(gun, 0, 0, 0, .16, .19, .6, '#25332f');
box(gun, 0, .12, -.06, .17, .09, .62, '#6a7770'); box(gun, 0, .2, -.27, .025, .07, .055, '#d0df9f');
box(gun, 0, -.2, .17, .13, .36, .16, '#192923'); box(gun, .06, -.24, .3, .18, .21, .27, '#555e46');
const machineParts=new THREE.Group();gun.add(machineParts);
box(machineParts,0,.015,-.38,.2,.18,.58,'#30443f');box(machineParts,0,-.22,-.03,.29,.32,.29,'#657451');
box(machineParts,0,.06,-.77,.11,.11,.29,'#182823');box(machineParts,0,.16,-.46,.025,.12,.035,'#d8f36a');
for(let i=0;i<4;i++)box(machineParts,.11,.04,-.24-i*.1,.025,.1,.04,'#172621');
const flare = new THREE.Mesh(new THREE.ConeGeometry(.23, .6, 5), new THREE.MeshBasicMaterial({ color: '#ffe3a0', transparent: true, opacity: .85 })); flare.rotation.x = -Math.PI / 2; flare.position.z = -.55; gun.add(flare); flare.visible = false; gun.visible = false;

let audioCtx, muted = false, elapsed = 0, shake = 0, recoil = 0, fireFlash = 0,killSoundAt=-1;
let spawnLeft = 0, spawned = 0, waveKills = 0, announceLeft = 0, hitLeft = 0, damageLeft = 0;
let endShown = false, grenadeFlash = 0, practice = false, bossPractice = false, contactType = 'normal',killPulse=0;
let rescue=null,rescuer=null;
const selectedWave=()=>$('start-area').value==='boss'?5:Number($('start-area').value);
const keys = new Set();
function sound(kind) {
  if (muted) return;
  if(kind==='kill'){if(elapsed-killSoundAt<.045)return;killSoundAt=elapsed;}
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime, osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    const values = { shot: [150, 35, .12, .15], shotgun: [100, 22, .25, .22], hit: [450, 110, .07, .07], head: [1100, 500, .12, .08], reload: [300, 650, .13, .05], empty: [95, 60, .07, .08], hurt: [85, 35, .3, .18], explosion: [80, 15, .7, .25], wave: [320, 900, .5, .07], alert:[720,900,.18,.07], arrow:[900,250,.14,.06] };
    values.roar=[64,24,1.4,.19];values.stomp=[65,18,.5,.19];
    values.shot=[175,45,.065,.07];values.kill=[520+Math.min(state.combo,12)*45,190,.14,.1];
    const [start, end, duration, volume] = values[kind] || values.hit;
    osc.type = ['shot', 'shotgun', 'explosion', 'hurt','roar','stomp'].includes(kind) ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(start, t); osc.frequency.exponentialRampToValueAtTime(end, t + duration);
    gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(.001, t + duration);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(t); osc.stop(t + duration);
    if (['shot', 'shotgun', 'explosion'].includes(kind)) {
      const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * duration, audioCtx.sampleRate);
      const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const noise = audioCtx.createBufferSource(), g = audioCtx.createGain(); noise.buffer = buffer; g.gain.value = volume * .8; noise.connect(g); g.connect(audioCtx.destination); noise.start();
    }
  } catch {}
}
function vocal(enemy,kind='idle'){
  if(muted||state.mode!=='playing'||enemy.demo)return;
  try{
    audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended')audioCtx.resume();
    const point=enemyPoint(enemy),distance=point.distanceTo(camera.position),view=point.clone().applyMatrix4(camera.matrixWorldInverse);
    voices.play(audioCtx,{type:enemy.type,kind,distance,pan:view.x/Math.max(6,distance*.6)});
  }catch{}
}
function burst(position,color,count=12,force=3,size=.07){effects.burst(position,color,count,force,size);}
function popup(text, label, position) {
  const p = position.clone().project(camera), el = document.createElement('div'); el.className = 'popup';
  el.style.left = `${(p.x * .5 + .5) * innerWidth}px`; el.style.top = `${(-p.y * .5 + .5) * innerHeight}px`;
  el.textContent = text; const small = document.createElement('small'); small.textContent = label; el.append(small); $('popups').append(el); el.addEventListener('animationend', () => el.remove());
}
function announce(small, main, duration = 2.3) { $('announce-small').textContent = small; $('announce-main').textContent = main; announceLeft = duration; $('announcement').style.opacity = 1; }
function kill(enemy, head = false, credited = true) {
  if (enemy.dead) return;
  enemy.dead = true; enemy.death = .32;
  if(enemy.rescueId!==undefined)rescue?.defeat(enemy.rescueId);else waveKills++;
  vocal(enemy,'death');
  enemy.deathVelocity=enemy.root.position.clone().sub(camera.position).normalize().multiplyScalar(5);enemy.deathVelocity.y=2;
  const points = credited ? state.kill(head, enemy.type === 'boss', enemy.def.points) : 0;
  burst(enemyPoint(enemy),enemy.def.color,head?24:18,6,.18);
  if(credited){
    sound('kill');killPulse=1.05;
    $('kill-callout').textContent=state.combo>=5?`${state.combo} CHAIN!`:state.combo===4?'QUAD KILL':state.combo===3?'TRIPLE KILL':state.combo===2?'DOUBLE KILL':head?'HEADSHOT!':'撃破！';
    $('kill-callout').classList.toggle('headshot',head);$('hitmarker').classList.add('kill-confirm');
    $('score').animate([{transform:'scale(1.12)',color:'#ffffff'},{transform:'scale(1)',color:'#e6e9df'}],{duration:220});
  }
  popup(credited ? `+${points}` : 'DETONATED', enemy.type === 'boss' ? 'WARDEN DOWN' : head ? 'HEADSHOT' : enemy.def.name, enemyPoint(enemy).add(new THREE.Vector3(0,.35,0)));
  if (enemy.type === 'boss') { $('boss-bar').hidden = true; clearProjectiles(); }
}
function hurtPlayer(amount) { if(state.mode !== 'playing') return; state.hurt(amount); damageLeft=.38; shake=.22; sound('hurt'); updateHud(); }
function detonateEnemy(enemy) {
  if(enemy.dead) return;
  const center=enemyPoint(enemy); kill(enemy,false,false); burst(center,'#d7ed7a',40,8); sound('explosion');shake=.4;grenadeFlash=.18;
  if(center.distanceTo(camera.position)<9) hurtPlayer(enemy.def.damage);
}
function removeProjectile(p) { scene.remove(p.root); const i=projectiles.indexOf(p); if(i>=0)projectiles.splice(i,1); }
function clearProjectiles() { for(const p of [...projectiles])removeProjectile(p); }
function launchProjectile(enemy) {
  if(projectiles.length>=24 || state.mode!=='playing')return;
  const root=new THREE.Group();root.position.copy(enemyPoint(enemy));
  const direction=camera.position.clone().sub(root.position).normalize();root.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);
  box(root,0,0,0,.055,.055,.8,mat('#dfc997',{emissive:'#d3aa51',emissiveIntensity:1}));
  orb(root,0,0,.34,.2,.2,.22,mat('#ffe29b',{emissive:'#ffd775',emissiveIntensity:3}));
  box(root,0,0,-.3,.5,.035,.16,'#f8e4ac');box(root,0,0,-.3,.035,.5,.16,'#f8e4ac');
  const p={root,direction,speed:enemy.def.projectileSpeed,damage:enemy.def.damage,life:7,hp:1,kind:'arrow'};
  root.traverse(o=>{if(o.isMesh)o.userData.projectile=p;});scene.add(root);projectiles.push(p);sound('arrow');
}
function launchRock(enemy){
  const root=new THREE.Group();root.position.copy(enemyPoint(enemy)).add(new THREE.Vector3(0,1.1,0));
  box(root,0,0,0,1.08,.95,1, '#8c8878');box(root,.3,.28,.04,.66,.55,.76,'#b8ac8f');
  box(root,0,.05,.51,.07,.76,.035,mat('#ffe0a0',{emissive:'#ffbc72',emissiveIntensity:1.4}));
  const p={root,kind:'rock',hp:3,damage:22,life:4,age:0,duration:2.5,from:root.position.toArray(),target:camera.position.toArray()};
  root.traverse(o=>{if(o.isMesh)o.userData.projectile=p;});scene.add(root);projectiles.push(p);sound('stomp');
}
function hitProjectile(p,amount,point){
  const destroyed=strikeProjectile(p,amount);burst(point,p.kind==='rock'?'#c5b599':'#f7dfa1',destroyed?16:6,destroyed?5:2);
  if(destroyed){removeProjectile(p);const score=p.kind==='rock'?100:25;state.score+=score;popup(`+${score}`,p.kind==='rock'?'ROCK BREAK':'INTERCEPT',point);sound('head');}
  else {p.root.scale.multiplyScalar(.88);popup(`${p.hp} HIT`,'岩の残り耐久',point);sound('hit');}
}
function updateProjectiles(dt) {
  if(state.mode!=='playing')return;
  scene.updateMatrixWorld(true);
  for(const p of [...projectiles]) {
    p.age=(p.age||0)+dt;
    const from=p.root.position.clone(),to=p.kind==='rock'?new THREE.Vector3().fromArray(rockPosition(p.from,p.target,p.age/p.duration)):from.clone().addScaledVector(p.direction,p.speed*dt),length=from.distanceTo(to);
    const direction=to.clone().sub(from).normalize();
    const wall=new THREE.Raycaster(from,direction,0,length).intersectObjects(stages.covers[visibleStage],false)[0];
    const contact=segmentSphereEntry(from.toArray(),to.toArray(),camera.position.toArray(),p.kind==='rock'?1.05:.65);
    if(wall && (contact===null || wall.distance<contact*length)){burst(wall.point,'#d2c28d',4,1);removeProjectile(p);continue;}
    if(contact!==null){removeProjectile(p);hurtPlayer(p.damage);continue;}
    p.root.position.copy(to);if(p.kind==='rock'){p.root.rotation.x+=dt*2;p.root.rotation.z+=dt*1.7;}p.life-=dt;if(p.life<=0||(p.kind==='rock'&&p.age>=p.duration))removeProjectile(p);
  }
}
function damageEnemy(enemy, amount, head, hitPoint) {
  if (enemy.dead) return;
  if(enemy.hit<=0&&enemy.hp>amount)vocal(enemy,'hurt');
  enemy.hp -= amount; enemy.hit = .18;
  if(enemy.bossBrain&&enemy.hp>0&&staggerBoss(enemy.bossBrain,amount)){popup('BREAK','攻撃阻止',hitPoint);sound('stomp');}
  burst(hitPoint, head ? '#cfda82' : '#7eab87', head ? 13 : 7);
  if (enemy.hp <= 0) kill(enemy, head);
  if (enemy.type === 'boss') $('boss-health').style.width = `${Math.max(0, enemy.hp / enemy.maxHp * 100)}%`;
}
function explode(barrel) {
  if (!barrel.alive) return;
  barrel.alive = false; barrel.root.visible = false; sound('explosion'); shake = .38; grenadeFlash = .16;
  if(freeMode)refreshFreeNavigation();
  const center = barrel.root.position.clone(); burst(center, '#e8aa56', 45, 9);
  for (const enemy of enemies) { if (!enemy.dead && enemy.root.position.distanceTo(center) < 7) damageEnemy(enemy, 14, false, enemyPoint(enemy)); }
  for (const other of barrels) if (other.alive && other !== barrel && other.root.position.distanceTo(center) < 5) explode(other);
}
function fire() {
  if (state.mode !== 'playing') return;
  if (!state.ammo[state.weapon] && !state.reloadLeft) { sound('empty'); reload(); return; }
  if (!state.shoot()) return;
  sound(state.weapon ? 'shotgun' : 'shot'); recoil = state.weapon ? .2 : .045; fireFlash = state.weapon?.065:.035; shake = Math.max(shake,state.weapon ? .1 : .018);
  scene.updateMatrixWorld(true); raycaster.setFromCamera(pointer, camera);
  const targets = [...enemies.filter(e => !e.dead).map(e => e.root), ...barrels.filter(b => b.alive).map(b => b.root), ...projectiles.map(p=>p.root), ...stages.covers[visibleStage]];
  const hits = raycaster.intersectObjects(targets, true).filter(hit=>!hit.object.userData.nonTarget);
  const muzzlePoint=gun.localToWorld(new THREE.Vector3(0,.04,state.weapon?-.55:-.89));
  effects.tracer(muzzlePoint,hits[0]?.point||raycaster.ray.at(65,new THREE.Vector3()));
  if(!state.weapon)burst(gun.localToWorld(new THREE.Vector3(.15,0,-.1)),'#e5bd70',1,1.8,.035);
  let connected = false;
  if (hits.length) {
    const hit = hits[0], enemy = hit.object.userData.enemy;
    if(hit.object.userData.projectile){hitProjectile(hit.object.userData.projectile,WEAPONS[state.weapon].damage,hit.point);connected=true;}
    else if (hit.object.userData.barrel) { explode(hit.object.userData.barrel); connected = true; }
    else if (hit.object.userData.cover) burst(hit.point, '#a9b69a', 5, 2);
    else if (enemy) {
      let o = hit.object, head = false; while (o && o !== enemy.root) { if (o.userData.head) head = true; o = o.parent; }
      damageEnemy(enemy, head ? (state.weapon ? 8 : 3) : WEAPONS[state.weapon].damage, head, hit.point); connected = true; sound(head ? 'head' : 'hit');
    }
  }
  if (state.weapon) {
    for (const enemy of enemies) {
      if (enemy.dead || (hits[0] && hits[0].object.userData.enemy === enemy)) continue;
      const p = enemyPoint(enemy).project(camera);
      if (p.z < 1 && Math.hypot((p.x - pointer.x) * camera.aspect, p.y - pointer.y) < .16 && hasClearShot(enemy)) { damageEnemy(enemy, 2, false, enemyPoint(enemy)); connected = true; }
    }
  }
  if (connected) { state.hits++; hitLeft = .14; $('hitmarker').style.left = `${(pointer.x * .5 + .5) * innerWidth}px`; $('hitmarker').style.top = `${(-pointer.y * .5 + .5) * innerHeight}px`; }
  updateHud();
}
function hasClearShot(enemy) {
  const target = enemyPoint(enemy), direction = target.clone().sub(camera.position);
  const sight = new THREE.Raycaster(camera.position, direction.clone().normalize(), 0, direction.length());
  return sight.intersectObjects(stages.covers[visibleStage], false).length === 0;
}
function reload() { if (state.reload()) { sound('reload'); updateHud(); } }
function grenade() {
  if (state.mode !== 'playing' || state.grenades <= 0) return;
  state.grenades--; sound('explosion'); shake = .45; grenadeFlash = .25;
  for (const enemy of enemies) if (!enemy.dead) { burst(enemyPoint(enemy), '#ebb867', 10, 5); damageEnemy(enemy, 12, false, enemyPoint(enemy)); }
  for(const p of [...projectiles])hitProjectile(p,12,p.root.position.clone());
  announce('FRAG GRENADE', 'AREA SUPPRESSED', 1); updateHud();
}
function switchWeapon(index) { if (state.switchWeapon(index)) { trigger.clear();sound('reload'); gunBody.scale.z = index ? .92 : .6;machineParts.visible=index===0;flare.position.z=index?-.55:-.9; updateHud(); } }
function updateHud() {
  updateRescueHud();
  $('wave').textContent = String(state.wave).padStart(2, '0'); $('score').textContent = String(state.score).padStart(6, '0');
  if(shownHealth!==state.health){
    shownHealth=state.health;
    const halves=Math.ceil(Math.max(0,Math.min(100,state.health))/5);
    heartFills.forEach((heart,i)=>heart.style.clipPath=`inset(0 ${100-Math.min(2,Math.max(0,halves-i*2))*50}% 0 0)`);
    $('health-hearts').setAttribute('aria-label',`体力${state.health} / 100、ハート${halves/2}個`);
    $('health-hearts').classList.toggle('low-health',state.health>0&&state.health<=30);
  }
  $('ammo').textContent = String(state.ammo[state.weapon]).padStart(2, '0'); $('capacity').textContent = WEAPONS[state.weapon].capacity;
  $('weapon').textContent = `0${state.weapon + 1} / ${WEAPONS[state.weapon].name}`;
  const segments=state.weapon?6:20,filled=Math.ceil(state.ammo[state.weapon]/WEAPONS[state.weapon].capacity*segments);
  $('ammo-dots').innerHTML = Array.from({ length:segments}, (_, i) => `<i class="bullet${i >= filled ? ' empty' : ''}"></i>`).join('');
  $('combo').textContent = state.combo > 1 ? `${state.combo} KILL COMBO / ×${Math.min(5, 1 + Math.floor((state.combo - 1) / 3))}` : '';
  $('grenades').textContent = state.grenades;
  const armed=enemies.filter(e=>!e.dead&&e.armed).sort((a,b)=>a.fuseLeft-b.fuseLeft)[0], aiming=enemies.find(e=>!e.dead&&e.chargeLeft>0);
  const boss=enemies.find(e=>!e.dead&&e.bossBrain),rock=projectiles.find(p=>p.kind==='rock');
  $('threat-warning').textContent=rock?`岩を撃ち壊せ / 残り ${rock.hp} 発（散弾なら1発）`:armed?`自爆まで ${armed.fuseLeft.toFixed(1)} 秒 / 爆裂体を撃て`:boss?bossWarning(boss.bossBrain):projectiles.length?'飛来する矢を撃ち落とせ':aiming?'骨の射手が照準中':'';
  $('contact').textContent=`${ENEMIES[contactType].name}${contactEntrance?` / ${contactEntrance}`:''}`;
  $('area-tendency').textContent = bossPractice?'変異巨人との一騎打ち':state.encounter.label;
  if(freeMode){
    $('area-tendency').textContent='自由移動 / 感染者21体を排除せよ';
    $('free-position').textContent=`位置 ${freePlayer.position[0].toFixed(1)}, ${freePlayer.position[2].toFixed(1)}`;
    const close=enemies.filter(e=>!e.dead&&Math.hypot(e.root.position.x-freePlayer.position[0],e.root.position.z-freePlayer.position[2])<6).sort((a,b)=>a.root.position.distanceToSquared(camera.position)-b.root.position.distanceToSquared(camera.position))[0];
    if(close){const dx=close.root.position.x-freePlayer.position[0],dz=close.root.position.z-freePlayer.position[2],front=-Math.sin(freePlayer.yaw)*dx-Math.cos(freePlayer.yaw)*dz,right=Math.cos(freePlayer.yaw)*dx-Math.sin(freePlayer.yaw)*dz;
      $('free-threat').textContent=front<0?'▼ 背後に敵！':Math.abs(right)>Math.abs(front)*.8?(right>0?'右から接近 ▶':'◀ 左から接近'):'';
    }else $('free-threat').textContent='';
  }
  const plan = wavePlan(state.wave,state.areaIndex); $('remaining').textContent = state.choosing ? 'エリア確保 / 進路を選択' : state.travelling ? 'エリア確保 / 次の地点へ移動中' : `${state.area.name} / 残り ${Math.max(0, plan.count + (plan.boss ? 1 : 0) - waveKills)} 体`;
  $('route').hidden = !state.travelling;
  $('crosshair').hidden = state.travelling||state.choosing;
  for (const id of ['grenade', 'weapon', 'reload']) $(id).disabled = state.travelling||state.choosing;
  if (state.travelling) {
    $('route-name').textContent = `NEXT 0${state.wave + 1} / ${AREAS[state.nextAreaIndex].name}`;
    $('route-progress').style.width = `${state.travelProgress * 100}%`;
    $('route-distance').textContent = state.routeDescription||state.area.travel;
  }
}
function updateAreaIntel() {
  const wave=selectedWave(),bossOnly=$('start-area').value==='boss',profile=bossOnly?{label:'変異巨人との一騎打ち',tip:'岩は撃って破壊。跳躍と飛びかかりには集中射撃。遠吠えと着地後が反撃のチャンス。',roster:['boss']}:encounterProfile(wave),counts={};
  for(const type of profile.roster)counts[type]=(counts[type]||0)+1;
  $('intel-title').textContent=profile.label;$('intel-tip').textContent=profile.tip+(wave===1?' 突破後は裏路地と大通りから進路を選択。':wave===3?' 生存者反応あり。目印の感染者を倒して救出しよう。':'');
  $('intel-enemies').replaceChildren();
  for(const [type,count] of Object.entries(counts).sort((a,b)=>b[1]-a[1])){
    const row=document.createElement('div'),name=document.createElement('span'),number=document.createElement('b');
    name.textContent=ENEMIES[type].name;number.textContent=`${count} 体`;row.append(name,number);$('intel-enemies').append(row);
  }
  $('intel-footer').textContent=bossOnly?'BOSS PRACTICE / 記録保存なし':`AREA 0${wave} / ${profile.roster.length} 体${wave===5?' ＋ ボス':wave===3?' ＋ 救出の敵3体':''} / ${SPAWN_SITES[wave-1].length} 侵入経路`;
  if($('play-mode').value==='free'){
    $('intel-title').textContent='検問所を自由に探索';
    $('intel-tip').textContent='WASDで移動、マウスで周囲を見渡す。車両を盾にしながら追ってくる感染者と射手を排除。21体を倒せばクリア。スマホは左スティックで移動、画面をスワイプして視点操作。';
    $('intel-footer').textContent='FREE ROAM / 検問所1エリア / 記録保存なし';
  }
}
updateAreaIntel();
function clearRescue(){
  if(rescuer)scene.remove(rescuer.root);rescue=null;rescuer=null;
  $('rescue-status').hidden=true;$('rescue-pin').hidden=true;
}
function updateRescueHud(){
  const phase=rescue?.phase,visible=phase&&phase!=='waiting'&&rescue.resultTime<5;
  $('rescue-status').hidden=!visible;if(!visible)return;
  $('rescue-status').dataset.phase=phase;
  $('rescue-title').textContent=phase==='active'?'救出：目印の感染者を倒せ':phase==='saved'?'救出成功！':'救出失敗 / 作戦を続行';
  $('survivor-hearts').textContent='♥'.repeat(rescue.hearts)+'♡'.repeat(3-rescue.hearts);
  $('survivor-hearts').setAttribute('aria-label',`生存者の体力：ハート${rescue.hearts}個`);
  $('rescue-detail').textContent=phase==='active'?`生存者を狙う敵：残り ${3-rescue.defeated.size} 体 / オレンジの▼が目印`:phase==='saved'&&rescue.supportLeft>0?`♥ 2個分回復 ＋ 500点 / 援護射撃 ${Math.ceil(rescue.supportLeft)}秒`:phase==='saved'?'生存者が安全な場所へ避難した':'生存者が負傷して撤退。残った感染者を排除しよう';
}
function updateRescue(dt){
  if(!rescue||state.mode!=='playing')return;
  for(const event of rescue.tick(dt)){
    if(event.type==='start'){
      rescuer=createSurvivor();rescuer.root.position.fromArray(toWorld(state.area,SURVIVOR_POSITION));scene.add(rescuer.root);
      announce('生存者を狙うオレンジの▼の敵を倒せ','RESCUE',2.2);sound('alert');
    }
    if(event.type==='spawn'){
      const e=makeEnemy('normal',event.path);e.rescueId=event.id;e.rescueReleased=false;e.attackCycle=1.5;e.attackLeft=1.5;e.speed=.9;e.spawnGrace=.65;
      e.rescueMarker=rescueMarker();e.root.add(e.rescueMarker);burst(enemyPoint(e),'#ffba7b',10,1.5,.09);
    }
    if(event.type==='hurt'){sound('alert');$('rescue-pin').animate([{color:'#ff8466',transform:'translate(-50%,-100%) scale(1.2)'},{color:'#91ece5',transform:'translate(-50%,-100%) scale(1)'}],{duration:300});}
    if(event.type==='saved'){
      state.health=Math.min(100,state.health+event.heal);state.score+=event.score;
      announce('♥ 2個分回復 ＋ 500点 / 8秒間の援護射撃','RESCUED!',2.2);sound('wave');burst(rescuer.root.position.clone().add(new THREE.Vector3(0,1,0)),'#83ece0',22,2,.1);updateHud();
    }
    if(event.type==='failed'){
      for(const e of enemies.filter(e=>!e.dead&&e.rescueId!==undefined)){
        e.rescueReleased=true;e.rescueMarker.visible=false;e.speed=e.def.speed;e.arrived=false;e.distance=0;
        e.route=[e.root.position.toArray(),toWorld(state.area,[e.rescueId===1?.5:-.5,0,3.8])];e.attackCycle=1.35;e.attackLeft=.7;resetLocomotion(e);
      }
      announce('救出失敗 / 残った感染者を排除せよ','KEEP FIGHTING',1.8);
    }
    if(event.type==='support'){
      scene.updateMatrixWorld(true);const from=rescuer.root.position.clone().add(new THREE.Vector3(0,1.45,.1));
      const target=enemies.filter(e=>!e.dead&&!e.demo).sort((a,b)=>a.root.position.distanceToSquared(camera.position)-b.root.position.distanceToSquared(camera.position)).find(e=>{
        const d=enemyPoint(e).sub(from);return !new THREE.Raycaster(from,d.clone().normalize(),0,d.length()).intersectObjects(stages.covers[visibleStage],false).length;
      });
      if(target){const to=enemyPoint(target);rescuer.root.rotation.y=Math.atan2(to.x-from.x,to.z-from.z);effects.tracer(from,to);burst(from,'#a2eee4',3,.5,.06);damageEnemy(target,1,false,to);sound('hit');}
    }
  }
  if(rescuer){
    if(rescue.phase==='active')rescuer.root.rotation.y=Math.atan2(camera.position.x-rescuer.root.position.x,camera.position.z-rescuer.root.position.z);
    rescuer.animate(rescue.time,rescue.phase,rescue.supportLeft);
    if(rescue.resultTime>0){const p=[0,0,-2+Math.min(1,rescue.resultTime/2)*7];rescuer.root.position.fromArray(toWorld(state.area,p));rescuer.root.rotation.y=state.area.yaw;rescuer.root.visible=rescue.resultTime<2;}
  }
}
function positionRescuePin(){
  const show=rescuer?.root.visible&&rescue?.phase==='active';$('rescue-pin').hidden=!show;if(!show)return;
  const p=rescuer.root.position.clone().add(new THREE.Vector3(0,2.65,0)).project(camera);
  $('rescue-pin').hidden=p.z>1||p.z< -1;
  $('rescue-pin').style.left=`${(p.x*.5+.5)*innerWidth}px`;$('rescue-pin').style.top=`${(-p.y*.5+.5)*innerHeight}px`;
}
function enterTravel(){
  routePanel.close();trigger.clear();keys.clear();voices.stopAll();gun.visible=false;
  $('app').classList.add('playing');$('status').textContent='MOVING / ROUTE SECURED';
  announce(state.routeDescription||state.area.travel,'AREA CLEAR',TRAVEL_HOLD);updateHud();$('scene').focus();clock.getDelta();
}
function clearedArea(){
  clearRescue();
  travelStartPose=state.battlePose;
  const transition=state.completeArea();if(!transition)return;
  trigger.clear();clearProjectiles();voices.stopAll();keys.clear();gun.visible=false;
  if(transition==='choice'){
    announceLeft=0;$('announcement').style.opacity=0;$('app').classList.remove('playing');
    $('status').textContent='ROUTE SELECT / AREA CLEAR';updateHud();routePanel.open(routeChoices(state.wave));
  }else enterTravel();
}
function startWave() {
  clearRescue();if(state.areaIndex===RESCUE_STAGE&&!bossPractice)rescue=new RescueEvent();
  trigger.clear();
  voices.stopAll();
  routePanel.close();gun.visible=true;$('app').classList.add('playing');
  chooseSpawn=createSpawnSelector(state.areaIndex);contactEntrance='';
  spawned = 0; waveKills = 0; spawnLeft = 1; clearProjectiles(); contactType=state.encounter.roster[0]; makeBarrels();
  if(bossPractice){spawned=wavePlan(5).count;waveKills=spawned;contactType='boss';}
  showStage(state.areaIndex);
  $('status').textContent = `LIVE / AREA 0${state.wave}`;
  announce(`${state.area.name} / ${bossPractice?'変異巨人との一騎打ち':state.encounter.label}`, `AREA 0${state.wave}`, 3);
  sound('wave'); updateHud();
}
function start() {
  routePanel.close();
  for (const e of enemies) {scene.remove(e.root);disposeEnemyModel(e);} enemies.length = 0;
  effects.clear();trigger.clear();killPulse=0;$('kill-callout').textContent='';$('popups').replaceChildren();
  freeMode=$('play-mode').value==='free';freePlayer.reset();freeTaps.clear();clearTouch();freeBoundary.visible=freeMode;
  state.reset(); state.wave = freeMode?1:selectedWave(); bossPractice=!freeMode&&$('start-area').value==='boss'; practice = freeMode||state.wave > 1; state.mode = 'playing'; endShown = false; gun.visible = true; gunBody.scale.z = .6; keys.clear();
  $('area-total').textContent=freeMode?'/ 01':'/ 05';$('free-help').hidden=!freeMode;$('free-pointer-hint').textContent='マウス移動で視点操作 / クリックでマウス固定';
  $('app').classList.toggle('free-mode',freeMode);
  $('control-info').innerHTML=touchDevice?'左スティック：移動 / 画面スワイプ：視点・照準<br>射撃ボタン長押し：連射 / HUDのボタン：リロード・手榴弾・武器切替':freeMode?'WASD：移動 / Shift：ダッシュ / マウス・矢印：視点<br>左ボタン・Space：連射 / R・右ボタン：リロード<br>G：手榴弾 / 1・2：武器切替 / Esc・P：一時停止':arcadePause;
  machineParts.visible=true;flare.position.z=-.9;
  $('menu').hidden = true; $('result').hidden = true; $('pause-screen').hidden = true; $('hud').hidden = false; $('boss-bar').hidden = true; $('app').classList.add('playing'); $('status').textContent = 'LIVE / SECTOR 07';
  pointer.set(0, 0); moveCrosshair(); startWave(); updateHud(); $('scene').focus();
  if(freeMode){updateFreeCamera();requestFreeLook();announce('WASD 移動 / マウス視点 / 21体を排除','FREE ROAM',3);}
}
function pause() { clearTouch();trigger.clear();voices.stopAll();if (!state.pause()) return; releaseFreeLook();keys.clear(); $('pause-screen').hidden = false; $('app').classList.remove('playing'); $('resume').focus(); }
function resume() { if (!state.resume()) return; $('pause-screen').hidden = true; $('app').classList.toggle('playing',!state.choosing); if(state.choosing)routePanel.focus();else $('scene').focus(); clock.getDelta();if(freeMode)requestFreeLook(); }
function finish(won) {
  clearRescue();
  trigger.clear();
  voices.stopAll();
  if (endShown) return; endShown = true; state.mode = won ? 'won' : 'over'; gun.visible = false; $('app').classList.remove('playing'); $('result').hidden = false;
  releaseFreeLook();keys.clear();
  $('result-label').textContent = won ? 'CONTAINMENT SUCCESSFUL' : 'LIFE SIGNAL LOST';
  $('result-title').innerHTML = won ? 'DAYBREAK<span>.</span>' : 'SIGNAL LOST<span>.</span>';
  $('result-message').textContent = won ? '夜明けが来た。最終防衛線は、守り抜かれた。' : `WAVE ${state.wave} で通信が途絶えた。もう一度、戦線へ。`;
  if(freeMode)$('result-message').textContent=won?'検問所の感染者21体を排除。自由移動作戦、完了。':'検問所で戦線離脱。車両を盾にして、背後の敵にも注意しよう。';
  $('result-score').textContent = String(state.score).padStart(6, '0'); $('result-kills').textContent = state.kills;
  $('result-accuracy').textContent = `${state.shots ? Math.round(state.hits / state.shots * 100) : 0}%`;
  const record = !practice && state.score > best; if (!practice) { best = Math.max(best, state.score); try { localStorage.setItem('dead-signal-best', String(best)); } catch {} }
  $('result-best').textContent = `${practice ? 'PRACTICE / 記録保存なし' : `${record ? 'NEW BEST / ' : 'BEST / '}${String(best).padStart(6, '0')}`}　 ·　HEADSHOTS ${state.headshots}`;
}
function moveCrosshair() { $('crosshair').style.left = `${(pointer.x * .5 + .5) * innerWidth}px`; $('crosshair').style.top = `${(-pointer.y * .5 + .5) * innerHeight}px`; }
// Touch pointers are tracked independently so movement, aiming and firing can overlap.
let touchAim=null,touchStick=null,touchShot=null;
const touchKeys=new Set();
function clearTouch(){touchAim=null;touchStick=null;touchShot=null;touchKeys.clear();trigger.release('touch');$('move-stick').style.transform='';}
function setTouchAim(e){pointer.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);moveCrosshair();}
$('scene').addEventListener('pointerdown',e=>{
  if(e.pointerType!=='touch')return;e.stopImmediatePropagation();e.preventDefault();
  if(state.mode!=='playing'||touchAim)return;
  touchAim={id:e.pointerId,x:e.clientX,y:e.clientY};$('scene').setPointerCapture(e.pointerId);
  if(!freeMode)setTouchAim(e);
});
$('scene').addEventListener('pointermove',e=>{
  if(e.pointerType!=='touch')return;e.stopImmediatePropagation();
  if(state.mode!=='playing'||touchAim?.id!==e.pointerId)return;
  if(freeMode)freePlayer.look(e.clientX-touchAim.x,e.clientY-touchAim.y);else setTouchAim(e);
  touchAim.x=e.clientX;touchAim.y=e.clientY;
});
function stickMove(e){
  const r=$('move-pad').getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;
  const scale=Math.min(1,40/Math.max(1,Math.hypot(x,y)));touchKeys.clear();
  if(x<-10)touchKeys.add('a');if(x>10)touchKeys.add('d');if(y<-10)touchKeys.add('w');if(y>10)touchKeys.add('s');
  if(Math.hypot(x,y)>45)touchKeys.add('shift');
  $('move-stick').style.transform='translate('+x*scale+'px,'+y*scale+'px)';
}
$('move-pad').addEventListener('pointerdown',e=>{if(state.mode!=='playing'||!freeMode||touchStick!==null)return;e.preventDefault();touchStick=e.pointerId;$('move-pad').setPointerCapture(e.pointerId);stickMove(e);});
$('move-pad').addEventListener('pointermove',e=>{if(e.pointerId===touchStick)stickMove(e);});
$('touch-fire').addEventListener('pointerdown',e=>{if(state.mode!=='playing'||touchShot!==null)return;e.preventDefault();touchShot=e.pointerId;$('touch-fire').setPointerCapture(e.pointerId);trigger.hold('touch');fire();});
function endTouch(e){
  if(touchAim?.id===e.pointerId)touchAim=null;
  if(touchStick===e.pointerId){touchStick=null;touchKeys.clear();$('move-stick').style.transform='';}
  if(touchShot===e.pointerId){touchShot=null;trigger.release('touch');}
}
for(const event of ['pointerup','pointercancel','lostpointercapture'])window.addEventListener(event,endTouch);
$('scene').addEventListener('pointermove', e => {
  if(freeMode){if(state.mode!=='playing'){lastMouse=null;return;}if(document.pointerLockElement!==$('scene')&&lastMouse)freePlayer.look(e.clientX-lastMouse[0],e.clientY-lastMouse[1]);lastMouse=[e.clientX,e.clientY];return;}
  pointer.set(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2); moveCrosshair();
});
$('scene').addEventListener('pointerleave',()=>{lastMouse=null;});
document.addEventListener('mousemove',e=>{if(freeMode&&state.mode==='playing'&&document.pointerLockElement===$('scene'))freePlayer.look(e.movementX,e.movementY);});
document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===$('scene');if(wasLocked&&!locked&&freeMode&&state.mode==='playing')pause();wasLocked=locked;if(locked)$('free-pointer-hint').textContent='マウス視点操作中 / Escで一時停止';});
$('scene').addEventListener('pointerdown', e => { e.preventDefault(); if (e.button === 2) { reload(); return; } if (e.button !== 0||!e.isPrimary||state.mode!=='playing') return;
  if(freeMode){pointer.set(0,0);lastMouse=[e.clientX,e.clientY];requestFreeLook();}else pointer.set(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2);
  moveCrosshair(); $('scene').focus();if(!freeMode)$('scene').setPointerCapture(e.pointerId);trigger.hold('pointer'); fire();
});
window.addEventListener('pointerup',e=>{if(e.button===0){trigger.release('pointer');}});
window.addEventListener('pointercancel',()=>trigger.release('pointer'));
$('scene').addEventListener('lostpointercapture',()=>trigger.release('pointer'));
$('scene').addEventListener('contextmenu', e => e.preventDefault());
$('start').onclick = start; $('retry').onclick = start; $('pause').onclick = pause; $('resume').onclick = resume; $('reload').onclick = reload; $('grenade').onclick = grenade; $('weapon').onclick = () => switchWeapon(1 - state.weapon);
$('quit-pause').onclick=$('quit-result').onclick=()=>{releaseFreeLook();location.reload();};
$('play-mode').onchange=()=>{
  const selected=$('play-mode').value==='free';if(selected){previousArea=$('start-area').value;$('start-area').value='1';}else $('start-area').value=previousArea;
  $('start-area').disabled=selected;
  $('menu-controls').innerHTML=selected?'<span><kbd>WASD</kbd> 移動</span><span><kbd>SHIFT</kbd> ダッシュ</span><span><kbd>MOUSE</kbd> 視点・射撃</span>':arcadeControls;
  $('start-area').onchange();
};
$('start-area').onchange = () => {
  if (state.mode !== 'ready') return;
  updateAreaIntel();
  state.wave = selectedWave(); showStage(state.areaIndex); makeBarrels();
  for (const e of enemies) {scene.remove(e.root);disposeEnemyModel(e);} enemies.length = 0;
  const roster=state.encounter.roster;
  if($('start-area').value==='boss'){const e=makeEnemy('boss',[[0,0,-7]],true);e.root.position.fromArray(toWorld(state.area,[0,0,-7]));}
  else {makeEnemy(roster[0], [[1,0,-5]], true); makeEnemy(roster[1], [[-2,0,-8]], true);}
};
$('sound').onclick = () => { muted = !muted; $('sound').textContent = muted ? 'SOUND OFF' : 'SOUND ON'; if(muted)voices.stopAll();else sound('hit'); };
$('fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('app').requestFullscreen(); } catch { $('fullscreen').textContent = '—'; } };
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if(bestiary.isOpen){if(k==='escape')bestiary.close();return;}
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) && (state.mode === 'playing' || e.target === $('scene'))) e.preventDefault();
  if (e.repeat) return;
  keys.add(k);
  if(freeMode&&k==='escape'){if(state.mode==='playing')pause();return;}
  if (k === 'escape' || k === 'p') { state.mode === 'paused' ? resume() : pause(); return; }
  if (state.mode !== 'playing') return;
  if(freeMode&&['w','a','s','d'].includes(k))freeTaps.set(k,freeInputFrame);
  if (k === 'r') reload(); if (k === 'g') grenade(); if (k === '1' || k === '2') switchWeapon(Number(k) - 1); if (k === ' ') {trigger.hold('keyboard');fire();}
});
window.addEventListener('keyup', e => {
  const k=e.key.toLowerCase();
  // Preserve a tap shorter than one rendered frame instead of dropping it.
  if(freeMode&&state.mode==='playing'&&freeTaps.get(k)===freeInputFrame){freePlayer.step(1/60,keys,enemies.filter(n=>!n.dead&&!n.demo).map(n=>n.root.position.toArray()));updateFreeCamera();updateHud();}
  freeTaps.delete(k);keys.delete(k);if(e.key===' ')trigger.release('keyboard');
});
window.addEventListener('blur', pause); document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
window.addEventListener('resize', resize); resize();
let hudTimer = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .05); if (state.mode !== 'paused') elapsed += dt;
  const tickEvent = state.tick(dt);
  if (tickEvent === 'arrived') startWave();
  const playing = state.mode === 'playing';
  updateRescue(dt);
  if (playing) {
    if(freeMode){
      const dx=(Number(keys.has('arrowright'))-Number(keys.has('arrowleft')))*dt*650,dy=(Number(keys.has('arrowdown'))-Number(keys.has('arrowup')))*dt*650;
      freePlayer.look(dx,dy);freePlayer.step(dt,new Set([...keys,...touchKeys]),enemies.filter(e=>!e.dead&&!e.demo).map(e=>e.root.position.toArray()));freeInputFrame++;updateFreeCamera();
    }
    spawnLeft -= dt;
    const plan = wavePlan(state.wave,state.areaIndex);
    if (spawned < plan.count && spawnLeft <= 0 && enemies.filter(e=>!e.dead).length<plan.maxActive) {
      contactType=state.encounter.roster[spawned];let entrance=chooseSpawn(contactType);
      if(freeMode&&Math.hypot(entrance.path[0][0]-freePlayer.position[0],entrance.path[0][2]-freePlayer.position[2])<8){
        entrance=SPAWN_SITES[0].filter(s=>s.types.includes(contactType)).sort((a,b)=>Math.hypot(b.path[0][0]-freePlayer.position[0],b.path[0][2]-freePlayer.position[2])-Math.hypot(a.path[0][0]-freePlayer.position[0],a.path[0][2]-freePlayer.position[2]))[0];
      }
      contactEntrance=entrance.name;
      const enemy=makeEnemy(contactType,entrance.path,false,entrance);burst(enemyPoint(enemy),'#abcbb4',7,1.4,.09);
      spawned++; spawnLeft = plan.interval;
    } else if (plan.boss && spawned === plan.count && spawnLeft <= 0) {
      makeEnemy('boss', state.area.bossPath); spawned++; contactType='boss';contactEntrance='中央の隔離扉'; $('boss-bar').hidden = false; $('boss-health').style.width = '100%'; announce('変異巨人 / 岩を撃ち壊し、跳躍を阻止せよ', 'MUTANT WARDEN', 2);
    }
    if (spawned >= plan.count + (plan.boss ? 1 : 0) && !enemies.some(e => !e.dead) && !rescue?.pending) {
      if (freeMode||state.wave === 5) finish(true);
      else clearedArea();
    }
    if(!freeMode){if (keys.has('arrowleft')) pointer.x -= dt * 1.1; if (keys.has('arrowright')) pointer.x += dt * 1.1; if (keys.has('arrowup')) pointer.y += dt * 1.1; if (keys.has('arrowdown')) pointer.y -= dt * 1.1;}
    pointer.clampScalar(-.98, .98); moveCrosshair();
    const firing=trigger.intent(state);if(firing==='shoot')fire();else if(firing==='reload')reload();
    $('reload-notice').textContent = state.reloadLeft > 0 ? `RELOADING  ${state.reloadLeft.toFixed(1)}s` : state.ammo[state.weapon] === 0 ? 'R / 右クリックでリロード' : '';
    hudTimer += dt; if (hudTimer > .09) { updateHud(); hudTimer = 0; }
  }
  if (state.mode === 'moving') {
    $('reload-notice').textContent = state.travelTime < TRAVEL_HOLD ? '周辺の安全を確認' : '次のエリアへ移動中';
    updateHud();
  }
  if (state.mode !== 'paused' && announceLeft > 0) { announceLeft -= dt; if (announceLeft <= 0) $('announcement').style.opacity = 0; }
  if (state.mode !== 'paused') {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) { e.death -= dt;e.root.position.addScaledVector(e.deathVelocity,dt);e.root.rotation.x-=dt*3;e.body.scale.setScalar(Math.max(.01,e.death/.32)); if (e.death <= 0) { scene.remove(e.root); disposeEnemyModel(e); enemies.splice(i, 1); } continue; }
      if(e.bossBrain||e.demo)e.root.rotation.y=Math.atan2(camera.position.x-e.root.position.x,camera.position.z-e.root.position.z);
      if(playing && !e.demo && e.bossBrain){
        const previous=e.bossBrain.position;
        const intent=stepBoss(e.bossBrain,dt,{active:state.mode==='playing',dead:e.dead});
        const travel=Math.hypot(e.bossBrain.position[0]-previous[0],e.bossBrain.position[2]-previous[2]);
        e.bossMotion.gait+=travel/2.6*Math.PI*2;e.bossMotion.weight+=(Math.min(1,travel/(dt*4.6||1))-e.bossMotion.weight)*(1-Math.exp(-dt*10));
        e.root.position.fromArray(toWorld(state.area,e.bossBrain.position));
        if(intent.event==='warning')sound('alert');
        if(intent.event==='rock')launchRock(e);
        if(intent.event==='roar'){vocal(e,'roar');shake=.22;burst(enemyPoint(e),'#c8dc93',18,4);}
        if(intent.event==='impact'){sound('stomp');shake=.4;burst(e.root.position,'#d3c4a3',35,8);hurtPlayer(intent.damage);}
      } else if(playing && !e.demo && e.spawnGrace>0){e.spawnGrace=Math.max(0,e.spawnGrace-dt);moveEnemy(e,dt,false,camera.position);
      } else if(playing && e.rescueId!==undefined && !e.rescueReleased){
        if(rescue?.phase==='active'){
          const intent=stepBrain(e,dt,{arrived:e.arrived});moveEnemy(e,dt,intent.move,rescuer.root.position);
          if(intent.event==='melee'){rescue.hurt();vocal(e,'attack');}
        }else {moveEnemy(e,dt,false,camera.position);e.attackPhase='idle';}
      } else if(playing && !e.demo) {
        if(freeMode)pursueFreePlayer(e,dt);
        const meleeClose=freeMode?Math.hypot(e.root.position.x-freePlayer.position[0],e.root.position.z-freePlayer.position[2])<1.65&&e.root.position.y<.5&&hasClearShot(e):e.arrived;
        const intent=stepBrain(e,dt,{active:state.mode==='playing',arrived:freeMode?(e.freeStationary||meleeClose):e.arrived,distance:enemyPoint(e).distanceTo(camera.position),visible:e.def.role==='ranged' && hasClearShot(e)});
        moveEnemy(e,dt,intent.move,camera.position,intent.pace??1);
        if(intent.event==='projectile') launchProjectile(e);
        if(intent.event==='melee') {vocal(e,'attack');hurtPlayer(intent.damage);}
        if(intent.event==='aim' || intent.event==='fuse') sound('alert');
        if(intent.event==='explode') detonateEnemy(e);
      }
      animateEnemy(e,elapsed+e.seed,{...e,locomotion:e.demo?null:e.locomotion});
      if(playing&&!e.demo&&!e.bossBrain&&e.spawnGrace<=0){
        e.voiceLeft-=dt;
        if(!e.growled&&enemyPoint(e).distanceTo(camera.position)<9){vocal(e,'attack');e.growled=true;e.voiceLeft=3;}
        else if(e.voiceLeft<=0){vocal(e);e.voiceLeft=3.5+Math.random()*4;}
      }
      if (e.hit > 0) e.hit -= dt;
    }
    effects.update(dt);killPulse=Math.max(0,killPulse-dt);$('kill-callout').style.opacity=Math.min(1,killPulse*4);$('hitmarker').classList.toggle('kill-confirm',killPulse>.75);
    for (let i = 0; i < dustCount; i++) { dustArray[i * 3] += dt * .13; dustArray[i * 3 + 1] -= dt * .09; if (dustArray[i * 3 + 1] < 0) dustArray[i * 3 + 1] = 10; } dustGeo.attributes.position.needsUpdate = true;
    warm.intensity = 28 + Math.sin(elapsed * 3.1) * 3 + Math.sin(elapsed * 13) * 1.5;
  }
  updateProjectiles(dt);
  if (state.mode === 'over' && !endShown) finish(false);
  shake = Math.max(0, shake - dt * 1.4); recoil = Math.max(0, recoil - dt * .65); fireFlash = Math.max(0, fireFlash - dt); grenadeFlash = Math.max(0, grenadeFlash - dt); hitLeft = Math.max(0, hitLeft - dt); damageLeft = Math.max(0, damageLeft - dt);
  const stride = state.travelling ? Math.sin(state.travelProgress * Math.PI) : 0;
  cameraLocalPose = state.battlePose;
  const pose = state.travelling ? travelPose(state.areaIndex, state.travelProgress, travelStartPose, state.nextAreaIndex) : { ...worldPose(state.area, cameraLocalPose), stage: state.areaIndex, fade: 0 };
  if (pose.stage !== visibleStage) showStage(pose.stage);
  $('travel-fade').style.opacity = pose.fade;
  if(freeMode)updateFreeCamera();else{
    camera.position.fromArray(pose.position); camera.position.y += Math.sin(elapsed * (stride ? 9 : 1.1)) * (.012 + stride * .025);
    camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake;
    camera.lookAt(new THREE.Vector3().fromArray(pose.target));
  }
  camera.updateMatrixWorld(true);positionRescuePin();
  const viewArea = AREAS[visibleStage];
  moon.position.fromArray(toWorld(viewArea,[-12,22,-12])); moon.target.position.fromArray(viewArea.origin);
  moon.intensity = viewArea.indoor ? .25 : 2.1;
  warm.position.fromArray(toWorld(viewArea,[0,viewArea.indoor ? 4 : 5,-7])); rim.position.fromArray(toWorld(viewArea,[-3,3,-21]));
  dust.position.fromArray(viewArea.origin); dust.rotation.y = viewArea.yaw;
  gun.position.set(.3 + pointer.x * .12, -.32 + pointer.y * .07 - (state.reloadLeft > 0 ? .3 : 0) - stride * .23, -.7 + recoil);
  gun.rotation.set(recoil * 1.8 - (state.reloadLeft > 0 ? .55 : 0), -pointer.x * .14, state.reloadLeft > 0 ? -.6 : -.025);
  flare.visible = fireFlash > 0; flare.rotation.z = elapsed * 70;
  muzzle.position.copy(camera.position); muzzle.position.z -= 1; muzzle.intensity = fireFlash > 0 ? 30 : grenadeFlash > 0 ? 40 : 0;
  $('hitmarker').style.opacity = hitLeft > 0 ? 1 : 0; $('damage').style.opacity = damageLeft > 0 ? Math.min(.75, damageLeft * 2) : 0; $('flash').style.opacity = grenadeFlash > 0 ? grenadeFlash * 1.2 : fireFlash * .6;
  if(bestiary.isOpen)bestiary.render(renderer,elapsed,innerWidth,innerHeight);else renderer.render(scene, camera);
}
frame();
