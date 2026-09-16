import test from 'node:test';
import assert from 'node:assert/strict';
import { createBossBrain,stepBoss,staggerBoss,rockPosition,strikeProjectile,BOSS_ACTIONS } from '../boss-ai.js';
import { createEnemyModel,animateEnemy } from '../enemy-models.js';
import { ENEMIES } from '../enemy-data.js';
import * as THREE from '../vendor/three.module.js';

test('boss uses all five telegraphed moves, dodges both ways and returns to the arena',()=>{
  const b=createBossBrain(),seen=new Set(),events=[],sides=new Set();let highest=0;
  for(let i=0;i<1600;i++){
    const r=stepBoss(b,.025);if(r.event)events.push({event:r.event,action:b.action,damage:r.damage});
    if(b.phase==='windup')seen.add(b.action);
    if(b.action==='dodge'&&b.phase==='action')sides.add(Math.sign(b.target[0]));
    highest=Math.max(highest,b.position[1]);
    assert.ok(Math.abs(b.position[0])<=2.3&&b.position[2]<=2&&b.position[2]>=-23);
    assert.ok(b.position[1]>=0&&b.position[1]<=3);
  }
  assert.deepEqual([...seen].sort(),Object.keys(BOSS_ACTIONS).sort());assert.equal(sides.size,2);assert.ok(highest>2.9);
  assert.ok(events.some(e=>e.event==='rock'));assert.ok(events.some(e=>e.event==='roar'));
  assert.ok(events.some(e=>e.event==='impact'&&e.action==='jump'&&e.damage===16));
  assert.ok(events.some(e=>e.event==='impact'&&e.action==='lunge'&&e.damage===24));
});
test('six damage interrupts jump and lunge before impact, including midair',()=>{
  for(const action of ['jump','lunge'])for(const phase of ['windup','action']){
    const b=createBossBrain();Object.assign(b,{action,phase,timer:0,position:[0,phase==='action'?1:0,-4]});
    assert.equal(staggerBoss(b,3),false);assert.equal(staggerBoss(b,3),true);assert.equal(b.phase,'stunned');
    for(let i=0;i<50;i++)assert.notEqual(stepBoss(b,.025).event,'impact');
    assert.ok(b.position[1]<.1);
  }
});
test('pause and death freeze every boss phase and suppress attack events',()=>{
  for(const phase of ['approach','windup','action','recovery','stunned']){
    const b=createBossBrain();b.phase=phase;b.action='jump';const snapshot=JSON.stringify(b);
    assert.deepEqual(stepBoss(b,30,{active:false}),{});assert.equal(JSON.stringify(b),snapshot);
    assert.deepEqual(stepBoss(b,30,{dead:true}),{});assert.equal(JSON.stringify(b),snapshot);
  }
});
test('rocks arc toward the launch target and need three pistol hits or one shotgun hit',()=>{
  const from=[0,3,-7],target=[2,2,8];assert.deepEqual(rockPosition(from,target,0),from);assert.deepEqual(rockPosition(from,target,1),target);
  assert.ok(rockPosition(from,target,.5)[1]>3);
  const pistol={hp:3};assert.equal(strikeProjectile(pistol,1),false);assert.equal(strikeProjectile(pistol,1),false);assert.equal(strikeProjectile(pistol,1),true);
  assert.equal(strikeProjectile({hp:3},3),true);
});
test('mutant model is wider than a walker, animates every attack and preserves head targeting',()=>{
  const rig=createEnemyModel('boss'),normal=createEnemyModel('normal');
  const size=r=>new THREE.Box3().setFromObject(r.root).getSize(new THREE.Vector3());
  assert.ok(size(rig).x>size(normal).x*2);assert.ok(size(rig).y>3.8);assert.ok(rig.head.userData.head);
  assert.equal(rig.arms.length,2);assert.equal(rig.legs.length,2);assert.ok(ENEMIES.boss.hp>38);
  for(const action of Object.keys(BOSS_ACTIONS))for(const phase of ['windup','action','recovery','stunned']){
    animateEnemy(rig,1,{bossBrain:{action,phase,side:1}});assert.ok(Number.isFinite(size(rig).y));
    assert.equal(rig.heldRock.visible,action==='rock'&&phase==='windup');
  }
});
