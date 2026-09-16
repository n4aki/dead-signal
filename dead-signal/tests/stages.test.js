import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { AREAS, STAGES, toWorld, travelPose, worldPose, walkPath } from '../stage-data.js';
import { buildStages } from '../stages.js';
import { box, orb, mat } from '../primitives.js';
import { GameState } from '../engine.js';
import { ENEMIES, encounterRoster, enemyLocalPath } from '../enemy-data.js';
import { SPAWN_SITES, createSpawnSelector } from '../spawn-data.js';
import { createEnemyModel,animateEnemy,disposeEnemyModel } from '../enemy-models.js';
import { RESCUE_PATHS,SURVIVOR_POSITION } from '../rescue-event.js';
import {createLocomotion,stepLocomotion,createMotionClearance} from '../enemy-motion.js';
import {NavigationGrid} from '../free-roam.js';
const scene = new THREE.Scene();
const stages = buildStages(scene, { box,orb,mat, sign: () => new THREE.Group() });
scene.updateMatrixWorld(true);
test('free roam pursuit crosses the checkpoint while clearing actual scenery and barrels',()=>{
  const boxes=stages.covers[0].map(mesh=>{
    mesh.geometry.computeBoundingBox();
    const b=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix);
    return {min:b.min.toArray(),max:b.max.toArray()};
  });
  for(const [x,y,z] of AREAS[0].barrels)boxes.push({min:[x-.43,0,z-.43],max:[x+.43,1.1,z+.43]});
  const nav=new NavigationGrid(boxes,{radius:.78});
  for(const goal of [[0,0,-30],[0,0,-16],[3,0,-10],[-2,0,5]]){
    const route=nav.path([0,0,8.5],goal);
    assert.ok(route,`reachable checkpoint destination ${goal}`);
    for(let i=1;i<route.length;i++)assert.ok(nav.line(route[i-1],route[i]));
  }
});
function obstruction(index, from, to) {
  const a = new THREE.Vector3().fromArray(toWorld(STAGES[index],from)), b = new THREE.Vector3().fromArray(toWorld(STAGES[index],to));
  const d = b.clone().sub(a);
  return new THREE.Raycaster(a,d.clone().normalize(),.01,d.length()-.01).intersectObjects(stages.covers[index],false);
}
test('all cinematic rails begin and end at the exact combat poses and conceal their cut', () => {
  for(let i=0;i<4;i++) {
    const start = AREAS[i].shots[1], a = travelPose(i,0,start), b = travelPose(i,1,start);
    assert.deepEqual(a.position,worldPose(AREAS[i],start).position);
    assert.deepEqual(a.target,worldPose(AREAS[i],start).target);
    assert.deepEqual(b.position,worldPose(AREAS[i+1],AREAS[i+1].shots[0]).position);
    assert.deepEqual(b.target,worldPose(AREAS[i+1],AREAS[i+1].shots[0]).target);
    assert.equal(a.fade,0); assert.equal(b.fade,0); assert.equal(travelPose(i,.5,start).fade,1);
    assert.ok(travelPose(i,.499,start).fade>.99); assert.ok(travelPose(i,.501,start).fade>.99);
  }
});
test('enemy routes reach the player without walking through walls or cover', () => {
  for(let i=0;i<AREAS.length;i++) for(const path of [...AREAS[i].paths,...(AREAS[i].bossPath?[AREAS[i].bossPath]:[])]) {
    for(let p=1;p<path.length;p++) {
      const a=path[p-1].map((v,j)=>j===1?v+1.2:v), b=path[p].map((v,j)=>j===1?v+1.2:v);
      const hits=obstruction(i,a,b);
      assert.equal(hits.length,0,`${AREAS[i].name}: route ${JSON.stringify(path[p-1])} -> ${JSON.stringify(path[p])} intersects cover`);
    }
    assert.deepEqual(walkPath(path,1000), {position:path.at(-1),arrived:true});
  }
});
test('dumpster blocks the enemy before it rounds the corner and then exposes it', () => {
  const camera=AREAS[1].shots[0].position;
  assert.ok(obstruction(1,camera,[-3,1.9,-21]).length>0);
  assert.equal(obstruction(1,camera,[-.6,1.9,-18]).length,0);
});
test('combat camera movement stays outside solid objects, including the indoor ceilings', () => {
  for(let i=0;i<AREAS.length;i++) {
    const s=new GameState();s.wave=i+1;s.mode='playing';
    const a=s.battlePose.position; s.tick(20); const b=s.battlePose.position;
    assert.equal(obstruction(i,a,b).length,0,AREAS[i].name);
    s.pause();const frozen=s.battlePose;s.tick(20);assert.deepEqual(s.battlePose,frozen);
  }
});
test('changing a stage leaves only its geometry visible',()=>{
  for(let i=0;i<STAGES.length;i++){stages.show(i);assert.deepEqual(stages.groups.map(g=>g.visible),STAGES.map((_,j)=>j===i));}
});

test('detailed scenery is baked into bounded draw batches with valid GPU attributes',()=>{
  for(const group of stages.groups){
    const batches=group.children.filter(m=>m.name==='Baked environment detail');
    assert.ok(batches.length>0&&batches.length<=12,'thousands of details should share a few draw calls');
    let triangles=0;
    for(const mesh of batches){
      const attributes=mesh.geometry.attributes;
      for(const key of ['position','normal','uv','color']){
        assert.equal(attributes[key].count,attributes.position.count);
        assert.ok(attributes[key].array.every(Number.isFinite),`${key} must not send NaN to the renderer`);
      }
      assert.ok(mesh.geometry.boundingSphere.radius<150,'baked transforms stay local to their stage');
      triangles+=attributes.position.count/3;
    }
    assert.ok(triangles<350000,'environment detail must leave room for the enemy horde');
  }
});
test('flying and low enemies clear actual geometry on their scheduled routes',()=>{
  for(let i=0;i<AREAS.length;i++){
    const choose=createSpawnSelector(i,()=>.37);
    encounterRoster(i+1).forEach(type=>{
    const path=enemyLocalPath(type,choose(type).path);
    for(let p=1;p<path.length;p++){
      const a=path[p-1].map((v,j)=>j===1?v+ENEMIES[type].center:v),b=path[p].map((v,j)=>j===1?v+ENEMIES[type].center:v);
      assert.equal(obstruction(i,a,b).length,0,`${AREAS[i].name} / ${type}: ${JSON.stringify(path[p-1])} -> ${JSON.stringify(path[p])}`);
    }
    });
  }
});

test('every entrance has clear routes for every permitted enemy, including low bodies and aerial arrivals',()=>{
  for(let i=0;i<5;i++)for(const entry of SPAWN_SITES[i])for(const type of entry.types){
    const path=enemyLocalPath(type,entry.path).map(p=>[p[0],p[1]+ENEMIES[type].center,p[2]]);
    for(let p=1;p<path.length;p++)assert.equal(obstruction(i,path[p-1],path[p]).length,0,`${i+1}/${entry.id}/${type}: ${JSON.stringify(path[p-1])} -> ${JSON.stringify(path[p])}`);
    const world=new THREE.Vector3().fromArray(toWorld(AREAS[i],path[0]));
    for(const cover of stages.covers[i]){cover.geometry.computeBoundingBox();assert.ok(!cover.geometry.boundingBox.containsPoint(cover.worldToLocal(world.clone())),`${i+1}/${entry.id}/${type} starts inside a wall`);}
  }
});
test('all eight entrances are used and compatible choices rotate without repeats',()=>{
  for(let i=0;i<5;i++){
    assert.equal(SPAWN_SITES[i].length,8);assert.equal(new Set(SPAWN_SITES[i].map(s=>s.path[0].join(','))).size,8);
    const choose=createSpawnSelector(i,()=>.31),seen=new Set();let last;
    for(const type of encounterRoster(i+1)){
      const entry=choose(type);assert.ok(entry.types.includes(type));assert.notEqual(entry.id,last);seen.add(entry.id);last=entry.id;
    }
    assert.equal(seen.size,8,`Area ${i+1} should expose all eight entrances during its wave`);
  }
});
test('high-ground archers have a clear line of fire to both camera positions',()=>{
  for(let i=0;i<5;i++)for(const entry of SPAWN_SITES[i].filter(s=>s.kind==='perch')){
    const start=entry.path[0].map((v,j)=>j===1?v+ENEMIES.skeleton.center:v);
    for(const pose of AREAS[i].shots){assert.equal(obstruction(i,start,pose.position).length,0,entry.id);assert.ok(Math.hypot(...start.map((v,j)=>v-pose.position[j]))<40);}
  }
});
test('replacement scenery hides enemies at spawn and exposes them after they round the cover',()=>{
  for(let i=0;i<5;i++)for(const entry of SPAWN_SITES[i].filter(s=>s.kind==='concealed')){
    for(const pose of AREAS[i].shots){
      for(const height of [1.25,1.95]){
        const start=entry.path[0].map((v,j)=>j===1?v+height:v);
        assert.ok(obstruction(i,pose.position,start).length>0,`${i+1}/${entry.id} must conceal the initial silhouette`);
      }
      const exposed=entry.path.slice(2).some(point=>obstruction(i,pose.position,point.map((v,j)=>j===1?v+1.25:v)).length===0);
      assert.ok(exposed,`${i+1}/${entry.id} must become shootable after rounding cover`);
    }
  }
});
test('checkpoint and avenue routes clear cover and barrels with animated arms, legs and bows',()=>{
  for(const index of [0,5]){
  const area=STAGES[index],obstacles=stages.covers[index].map(o=>new THREE.Box3().setFromObject(o));
  for(const barrel of area.barrels){const [x,y,z]=toWorld(area,barrel);obstacles.push(new THREE.Box3(new THREE.Vector3(x-.42,y,z-.42),new THREE.Vector3(x+.42,y+1.1,z+.42)));}
  for(const entry of SPAWN_SITES[index])for(const type of ['normal','skeleton'].filter(t=>entry.types.includes(t))){
    const rig=createEnemyModel(type);
    for(const pose of area.shots)for(let distance=0;distance<100;distance+=.2){
      const sample=walkPath(entry.path,distance),[x,y,z]=toWorld(area,sample.position),camera=toWorld(area,pose.position);rig.root.position.set(x,y,z);
      rig.root.rotation.y=Math.atan2(camera[0]-x,camera[2]-z);animateEnemy(rig,distance);rig.root.updateMatrixWorld(true);
      rig.root.traverse(part=>{if(!part.isMesh||part.userData.nonTarget)return;const bounds=new THREE.Box3().setFromObject(part);
        for(const obstacle of obstacles)if(obstacle.max.y>y+.3)assert.ok(!bounds.intersectsBox(obstacle),`${entry.id}/${type} body overlaps obstacle at ${sample.position} (${obstacle.getCenter(new THREE.Vector3()).toArray()})`);
      });
      if(sample.arrived)break;
    }
    disposeEnemyModel(rig);
  }
  }
});

test('both branch rails and their rejoining rails reach the chosen camera without crossing cover',()=>{
  for(const [from,to] of [[0,1],[0,5],[1,2],[5,2]]){
    const area=STAGES[from],next=STAGES[to],start=area.shots[1],exit=area.branchExits?.[to]||area.exit;
    assert.deepEqual(travelPose(from,0,start,to).position,worldPose(area,start).position);
    const end=travelPose(from,1,start,to);assert.equal(end.stage,to);assert.deepEqual(end.position,worldPose(next,next.shots[0]).position);
    assert.equal(obstruction(from,start.position,exit.position).length,0);
    assert.equal(obstruction(to,next.entry.position,next.shots[0].position).length,0);
    assert.equal(travelPose(from,.5,start,to).fade,1);
  }
  assert.notDeepEqual(travelPose(0,.49,AREAS[0].shots[1],1).position,travelPose(0,.49,AREAS[0].shots[1],5).position);
});

test('hospital rescue, attacking routes and escape stay visible and clear of solid scenery',()=>{
  const area=AREAS[2];
  for(const pose of area.shots)assert.equal(obstruction(2,pose.position,SURVIVOR_POSITION.map((v,i)=>v+(i===1?1.3:0))).length,0);
  const rig=createEnemyModel('normal'),obstacles=stages.covers[2].map(o=>{o.geometry.computeBoundingBox();return {bounds:o.geometry.boundingBox,inverse:o.matrixWorld.clone().invert(),top:new THREE.Box3().setFromObject(o).max.y};}),target=toWorld(area,SURVIVOR_POSITION);
  for(const path of [...RESCUE_PATHS,[[0,0,-2],[0,0,5]]]){
    for(let d=0;d<30;d+=.15){
      const sample=walkPath(path,d),world=toWorld(area,sample.position);rig.root.position.fromArray(world);rig.root.rotation.y=Math.atan2(target[0]-world[0],target[2]-world[2]);animateEnemy(rig,d);rig.root.updateMatrixWorld(true);
      rig.root.traverse(part=>{if(part.isMesh){part.geometry.computeBoundingBox();for(const obstacle of obstacles){if(obstacle.top<=world[1]+.3)continue;const localBounds=part.geometry.boundingBox.clone().applyMatrix4(obstacle.inverse.clone().multiply(part.matrixWorld));assert.ok(!localBounds.intersectsBox(obstacle.bounds),`Rescue route blocked at ${sample.position}`);}}});
      if(sample.arrived)break;
    }
  }
  disposeEnemyModel(rig);
});

test('new turning paths clear the real stage geometry for every entrance and species',()=>{
  for(let index=0;index<STAGES.length;index++){
    const area=STAGES[index],boxes=stages.covers[index].map(o=>{const b=o.geometry.boundingBox.clone().applyMatrix4(o.matrix);return {min:b.min.toArray(),max:b.max.toArray()};});
    for(const [x,y,z] of area.barrels)boxes.push({min:[x-.43,y,z-.43],max:[x+.43,y+1.1,z+.43]});
    for(const entry of SPAWN_SITES[index])for(const type of entry.types){
      const m=createLocomotion(type,enemyLocalPath(type,entry.path).map(p=>toWorld(area,p)),{seed:.4,isClear:createMotionClearance(type,area,boxes)});
      const rig=[0,5].includes(index)&&['normal','skeleton'].includes(type)?createEnemyModel(type):null;
      const obstacles=rig?stages.covers[index].map(o=>new THREE.Box3().setFromObject(o)):[];
      let last=m.position;
      for(let i=0;i<3000&&!m.arrived;i++){
        stepLocomotion(m,.05,{baseSpeed:ENEMIES[type].speed,target:toWorld(area,area.shots[0].position)});
        const a=new THREE.Vector3(...last).add(new THREE.Vector3(0,ENEMIES[type].center,0)),b=new THREE.Vector3(...m.position).add(new THREE.Vector3(0,ENEMIES[type].center,0)),delta=b.clone().sub(a);
        if(delta.length()>.0001)assert.equal(new THREE.Raycaster(a,delta.clone().normalize(),.00001,delta.length()).intersectObjects(stages.covers[index],false).length,0,`${index}/${entry.id}/${type} crosses scenery`);
        if(rig&&i%4===0){
          rig.root.position.fromArray(m.position);rig.root.rotation.y=m.yaw;animateEnemy(rig,m.time,{locomotion:m});rig.root.updateMatrixWorld(true);
          rig.root.traverse(part=>{if(!part.isMesh||part.userData.nonTarget)return;const bounds=new THREE.Box3().setFromObject(part);
            for(const obstacle of obstacles)if(obstacle.max.y>m.position[1]+.3)assert.ok(!bounds.intersectsBox(obstacle),`${index}/${entry.id}/${type} turning body at ${m.position} overlaps ${obstacle.getCenter(new THREE.Vector3()).toArray()}`);
          });
        }
        last=m.position;
      }
      assert.ok(m.arrived,`${index}/${entry.id}/${type} must finish`);
      if(rig)disposeEnemyModel(rig);
    }
  }
});
