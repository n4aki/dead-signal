import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocomotion,stepLocomotion,prepareEnemyRoute,sampleEnemyRoute,movementRhythm,angleDelta,createMotionClearance} from '../enemy-motion.js';
import {createEnemyModel,animateEnemy} from '../enemy-models.js';
import {createBrain,stepBrain} from '../enemy-data.js';
import * as THREE from '../vendor/three.module.js';

test('open corners curve while blocked corners and stair heights retain their safe waypoints',()=>{
  const path=[[0,0,0],[0,0,5],[5,0,5]],smooth=prepareEnemyRoute(path);
  assert.ok(smooth.points.length>path.length);assert.ok(smooth.total<10&&smooth.total>9);
  const blocked=prepareEnemyRoute(path,p=>p[0]<.01||p[2]>4.99);
  assert.deepEqual(blocked.points,path);
  const stairs=[[0,0,0],[0,.25,.65],[0,.5,1.3],[0,1,2]];
  assert.deepEqual(prepareEnemyRoute(stairs).points,stairs);
  assert.deepEqual(sampleEnemyRoute(smooth,100).position,path.at(-1));
});
test('gait follows distance, acceleration is gradual, facing follows travel, pause freezes all clocks',()=>{
  const m=createLocomotion('normal',[[0,0,0],[10,0,0]],{seed:.3});
  stepLocomotion(m,.05,{baseSpeed:2,target:[0,0,10]});assert.ok(m.speed>0&&m.speed<1);
  for(let i=0;i<40;i++)stepLocomotion(m,.05,{baseSpeed:2,target:[0,0,10]});
  assert.ok(Math.abs(angleDelta(m.yaw,Math.PI/2))<.3,'body faces the route instead of the player');
  const position=m.position.slice(),gait=m.gait;
  for(let i=0;i<40;i++)stepLocomotion(m,.05,{move:false,target:[0,0,10]});
  assert.equal(m.gait,gait);assert.deepEqual(m.position,position,'planted aiming must not drift');
  const snapshot=JSON.stringify(m);stepLocomotion(m,20,{active:false});assert.equal(JSON.stringify(m),snapshot);
});
test('every creature has pace variation and every ground path can still finish',()=>{
  for(const type of ['normal','runner','skeleton','wolf','bat','spider','silverfish','bomber']){
    const samples=Array.from({length:100},(_,i)=>movementRhythm(type,i*.06).pace);
    assert.ok(Math.max(...samples)-Math.min(...samples)>.15,type);
    const m=createLocomotion(type,[[0,0,0],[0,0,9]],{seed:.4});
    for(let i=0;i<1000&&!m.arrived;i++)stepLocomotion(m,.05,{baseSpeed:3,target:[0,0,12]});
    assert.ok(m.arrived,type);assert.deepEqual(m.position,[0,0,9]);
  }
});
test('hit reactions and following traffic slow movement without stopping progress',()=>{
  const route=[[0,0,0],[0,0,20]],free=createLocomotion('normal',route),hit=createLocomotion('normal',route),follower=createLocomotion('normal',route);
  const leader={position:[0,0,1],arrived:false};
  for(let i=0;i<8;i++){
    stepLocomotion(free,.05,{baseSpeed:2});stepLocomotion(hit,.05,{baseSpeed:2,hit:.1});stepLocomotion(follower,.05,{baseSpeed:2,neighbors:[leader]});
  }
  assert.ok(hit.distance<free.distance*.5);assert.ok(follower.distance<free.distance);assert.ok(follower.distance>0);
  for(let i=0;i<80;i++)stepLocomotion(hit,.05,{baseSpeed:2});assert.ok(hit.distance>free.distance);
});
test('clearance rotates with rooms and accepts upper platforms as support',()=>{
  const area={origin:[10,3,20],yaw:Math.PI/2},boxes=[{min:[-1,0,-1],max:[1,2,1]}];
  const clear=createMotionClearance('normal',area,boxes);
  assert.equal(clear([10,3,20]),false);assert.equal(clear([14,3,20]),true);assert.equal(clear([10,5,20]),true);
});
test('attack poses wind up before contact, recover afterwards and stay frozen on pause',()=>{
  const e=createBrain('wolf');let hit=false,sawWindup=false;
  for(let i=0;i<20;i++){const intent=stepBrain(e,.05,{arrived:true});if(e.attackPhase==='windup')sawWindup=true;if(intent.event==='melee'){assert.ok(sawWindup);hit=true;break;}}
  assert.ok(hit);assert.equal(e.attackPhase,'strike');stepBrain(e,.3,{arrived:true});assert.equal(e.attackPhase,'recover');
  const frozen=JSON.stringify(e);stepBrain(e,10,{active:false,arrived:true});assert.equal(JSON.stringify(e),frozen);
});
test('planted enemies stop stepping, while moving quadrupeds use opposite diagonal feet',()=>{
  for(const type of ['normal','skeleton','wolf','spider','bomber']){
    const rig=createEnemyModel(type),m=createLocomotion(type,[[0,0,0],[0,0,20]]);
    animateEnemy(rig,1,{locomotion:m,chargeLeft:type==='skeleton'?1:0,armed:type==='bomber'});
    const angles=rig.legs.map(l=>l.rotation.toArray());animateEnemy(rig,3,{locomotion:m,chargeLeft:type==='skeleton'?1:0,armed:type==='bomber'});
    assert.deepEqual(rig.legs.map(l=>l.rotation.toArray()),angles,type);
    if(type==='wolf'){m.weight=1;m.gait=.2;m.phase='run';animateEnemy(rig,4,{locomotion:m});assert.equal(rig.legs[0].rotation.x,rig.legs[3].rotation.x);assert.equal(rig.legs[1].rotation.x,rig.legs[2].rotation.x);assert.notEqual(rig.legs[0].rotation.x,rig.legs[1].rotation.x);}
  }
});

test('grounded walking poses keep a supporting foot on the floor',()=>{
  for(const type of ['normal','skeleton','bomber','wolf']){
    const rig=createEnemyModel(type),m=createLocomotion(type,[[0,0,0],[0,0,20]]);m.weight=1;m.phase='walk';
    for(let t=0;t<Math.PI*2;t+=.2){
      m.gait=t;animateEnemy(rig,t,{locomotion:m});rig.root.updateMatrixWorld(true);
      const floor=new THREE.Box3().setFromObject(rig.root).min.y;
      assert.ok(floor>=-.025&&floor<.06,`${type}: support foot at ${floor}`);
    }
  }
});
