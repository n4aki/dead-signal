import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { ENEMIES,BESTIARY,createBrain,stepBrain,encounterRoster } from '../enemy-data.js';
import { createEnemyModel,animateEnemy,disposeEnemyModel } from '../enemy-models.js';
import { segmentSphereEntry } from '../combat-math.js';
import { wavePlan,GameState } from '../engine.js';
import { createEnemyVoices,voiceProfile,voicePlacement } from '../enemy-voices.js';
import { RescueEvent } from '../rescue-event.js';
import { createSurvivor,rescueMarker } from '../survivor-model.js';

test('every requested enemy is scheduled and encounter counts still match wave completion',()=>{
  const types=new Set();for(let wave=1;wave<=5;wave++){const roster=encounterRoster(wave);assert.equal(roster.length,wavePlan(wave).count);for(const t of roster){assert.ok(ENEMIES[t]);types.add(t);}}
  assert.equal(BESTIARY.length,8);for(const t of BESTIARY)assert.ok(t==='boss'?wavePlan(5).boss:types.has(t));
});
test('area identities have a dominant enemy group instead of a uniform mix',()=>{
  const primary=[['normal','skeleton'],['wolf','spider'],['silverfish','spider'],['bomber'],['bat']];
  for(let wave=1;wave<=5;wave++){
    const roster=encounterRoster(wave),majority=roster.filter(t=>primary[wave-1].includes(t)).length;
    assert.ok(majority>roster.length/2,`Area ${wave} must have its stated majority`);
  }
  assert.ok(encounterRoster(1).every(t=>['normal','skeleton'].includes(t)));
  assert.ok(!encounterRoster(2).includes('skeleton'));
  assert.ok(!encounterRoster(3).includes('bomber'));
  assert.ok(!encounterRoster(4).some((t,i,a)=>t==='bomber'&&a[i+1]==='bomber'));
});
test('archer moves out of cover, warns before firing, and respects shot cooldown',()=>{
  const e=createBrain('skeleton');assert.equal(stepBrain(e,10,{visible:false,distance:15}).move,true);assert.equal(e.chargeLeft,0);
  let r=stepBrain(e,2,{visible:true,distance:15});assert.equal(r.event,'aim');assert.equal(r.move,false);
  assert.equal(stepBrain(e,.5,{visible:true,distance:15}).event,undefined);
  assert.equal(stepBrain(e,.7,{visible:true,distance:15}).event,'projectile');
  assert.equal(stepBrain(e,.5,{visible:true,distance:15}).event,undefined);
  stepBrain(e,4,{visible:true,distance:15});assert.ok(e.chargeLeft>0);
  assert.equal(stepBrain(e,3,{visible:false,distance:15}).event,undefined);assert.equal(e.chargeLeft,0);
});
test('bomber has a complete fuse and cannot explode twice',()=>{
  const e=createBrain('bomber');assert.equal(stepBrain(e,.1,{distance:20}).move,true);
  assert.equal(stepBrain(e,.1,{distance:5}).event,'fuse');assert.equal(e.fuseLeft,1.65);
  assert.equal(stepBrain(e,1,{distance:5}).event,undefined);
  assert.equal(stepBrain(e,.7,{distance:5}).event,'explode');assert.equal(stepBrain(e,10,{distance:5}).event,undefined);
});
test('perched archers fire at extended distance without walking off their platform',()=>{
  const e=createBrain('skeleton');e.range=40;
  assert.equal(stepBrain(e,2,{arrived:true,visible:true,distance:30}).event,'aim');
  const shot=stepBrain(e,1.2,{arrived:true,visible:true,distance:30});assert.equal(shot.move,false);assert.equal(shot.event,'projectile');
  assert.equal(stepBrain(e,10,{arrived:true,visible:false,distance:30}).move,false);
});
test('death cancels a fuse, and pausing freezes both aim and fuse',()=>{
  for(const type of ['skeleton','bomber']){
    const e=createBrain(type);stepBrain(e,2,{visible:true,distance:5});const before=JSON.stringify(e);
    assert.equal(stepBrain(e,30,{active:false,visible:true,distance:5}).event,undefined);assert.equal(JSON.stringify(e),before);
    e.dead=true;assert.equal(stepBrain(e,30,{visible:true,distance:5}).event,undefined);
  }
});
test('small enemies only attack after arrival and use distinct health and speed',()=>{
  for(const type of ['wolf','bat','silverfish','spider']){const e=createBrain(type);assert.equal(stepBrain(e,10,{arrived:false}).event,undefined);assert.equal(stepBrain(e,1,{arrived:true}).event,'melee');assert.equal(stepBrain(e,.1,{arrived:true}).event,undefined);}
  assert.ok(ENEMIES.wolf.speed>ENEMIES.normal.speed*2);assert.equal(ENEMIES.bat.hp,1);assert.ok(ENEMIES.silverfish.center<.3);
});
test('projectile sweep catches fast hits without hitting near misses or retreating shots',()=>{
  assert.equal(segmentSphereEntry([0,0,-10],[0,0,10],[0,0,0],1),.45);
  assert.equal(segmentSphereEntry([2,0,-10],[2,0,10],[0,0,0],1),null);
  assert.equal(segmentSphereEntry([0,0,2],[0,0,4],[0,0,0],1),null);
  assert.equal(segmentSphereEntry([0,0,0],[0,0,0],[0,0,0],1),0);
});
test('all bestiary models have real head geometry and correct anatomy',()=>{
  for(const type of BESTIARY){const rig=createEnemyModel(type);assert.ok(rig.head?.userData.head);animateEnemy(rig,2,{armed:true,chargeLeft:1});rig.root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(rig.root);assert.ok(!bounds.isEmpty());assert.ok(Number.isFinite(bounds.max.y));
    if(type==='spider')assert.equal(rig.legs.length,8);if(type==='wolf'||type==='bomber')assert.equal(rig.legs.length,4);if(type==='bat')assert.equal(rig.wings.length,2);if(type==='silverfish')assert.equal(rig.segments.length,6);disposeEnemyModel(rig);}
});
test('enemy-specific points retain headshot and combo scoring',()=>{const s=new GameState();assert.equal(s.kill(false,false,180),180);assert.equal(s.kill(true,false,180),360);assert.equal(s.kills,2);assert.equal(s.headshots,1);});

test('detailed models share baked geometry but keep joints and warning effects independent',()=>{
  for(const type of Object.keys(ENEMIES)){
    const a=createEnemyModel(type),b=createEnemyModel(type),meshes=[];a.root.traverse(o=>{if(o.isMesh)meshes.push(o)});
    assert.ok(meshes.length<=24,`${type}: ${meshes.length} draw calls per model`);
    const triangles=meshes.reduce((n,m)=>n+(m.geometry.index?.count||m.geometry.attributes.position.count)/3,0);
    assert.ok(triangles<20000,`${type}: triangle budget`);
    const target=meshes.find(m=>!m.userData.dynamic),other=[];b.root.traverse(o=>{if(o.isMesh)other.push(o)});
    assert.ok(other.some(m=>m.geometry===target.geometry));assert.notEqual(a.head,b.head);
    const before=b.head.rotation.toArray();animateEnemy(a,3,{armed:true});assert.deepEqual(b.head.rotation.toArray(),before);
    if(type==='bomber'){assert.notEqual(a.warning.material,b.warning.material);assert.equal(b.warning.material.opacity,0);}
    if(type==='boss')a.heldRock.traverse(o=>{if(o.isMesh)assert.equal(o.userData.nonTarget,true)});
    const point=a.head.getWorldPosition(new THREE.Vector3());a.root.updateMatrixWorld(true);
    const hits=new THREE.Raycaster(point.clone().add(new THREE.Vector3(0,0,5)),new THREE.Vector3(0,0,-1)).intersectObject(a.head,true);
    assert.ok(hits.length>0,`${type}: sculpted head remains shootable`);
    disposeEnemyModel(a);disposeEnemyModel(b);
  }
});

test('creature voices vary by species and event, with distance attenuation and stereo limits',()=>{
  assert.ok(voiceProfile('boss').pitch<voiceProfile('normal').pitch);
  assert.ok(voiceProfile('bat').pitch>voiceProfile('normal').pitch*3);
  assert.ok(voiceProfile('normal','hurt').pitch>voiceProfile('normal').pitch);
  assert.ok(voiceProfile('normal','death').duration<voiceProfile('normal').duration);
  assert.deepEqual(voicePlacement(2,3),{gain:1,pan:.85});assert.deepEqual(voicePlacement(20,-2),{gain:.25,pan:-.85});
});

test('voice concurrency, cooldown, natural ending and muting release every audio node',()=>{
  const nodes=[],sources=[],param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  const node=()=>{const n={gain:param(),pan:param(),frequency:param(),Q:param(),connect(){},disconnect(){this.disconnected=true;},start(){},stop(){this.stopped=true;}};nodes.push(n);return n;};
  const ctx={currentTime:0,sampleRate:1000,destination:{},createGain:node,createStereoPanner:node,createBiquadFilter:node,createOscillator:node,createBuffer:()=>({getChannelData:()=>new Float32Array(2000)}),createBufferSource:()=>{const n=node();sources.push(n);return n;}};
  const voices=createEnemyVoices();assert.equal(voices.play(ctx,{type:'normal'}),true);assert.equal(voices.play(ctx,{type:'wolf'}),false);
  ctx.currentTime=1;voices.play(ctx,{type:'normal'});ctx.currentTime=2;voices.play(ctx,{type:'normal'});ctx.currentTime=3;assert.equal(voices.play(ctx,{type:'normal'}),false);assert.equal(voices.activeCount,3);
  sources[0].onended();assert.equal(voices.activeCount,2);assert.equal(voices.play(ctx,{type:'boss',kind:'roar'}),true);
  voices.stopAll();assert.equal(voices.activeCount,0);assert.ok(nodes.every(n=>n.disconnected));assert.ok(sources.every(s=>s.stopped));voices.stopAll();
});

test('rescue announces three staggered attackers and cannot finish before all are defeated',()=>{
  const r=new RescueEvent();assert.deepEqual(r.tick(3.9),[]);assert.equal(r.pending,true);
  const first=r.tick(.1);assert.deepEqual(first.map(e=>e.type),['start','spawn']);assert.equal(first[1].id,0);
  r.defeat(0);r.defeat(0);r.defeat(2);r.defeat(-1);r.defeat(.5);assert.equal(r.phase,'active');assert.equal(r.defeated.size,1);
  const second=r.tick(2);assert.equal(second[0].id,1);r.defeat(1);assert.equal(r.phase,'active');
  const third=r.tick(2);assert.equal(third[0].id,2);r.defeat(2);assert.equal(r.phase,'saved');assert.equal(r.pending,false);
  const rewards=r.tick(.01).filter(e=>e.type==='saved');assert.deepEqual(rewards,[{type:'saved',heal:20,score:500}]);
  r.defeat(2);assert.equal(r.tick(.1).filter(e=>e.type==='saved').length,0);assert.equal(r.hurt(),false);
});

test('rescue timers and support freeze during pause and support stops after eight seconds',()=>{
  const r=new RescueEvent();r.tick(8);r.defeat(0);r.defeat(1);r.defeat(2);
  const snapshot=JSON.stringify(r);assert.deepEqual(r.tick(100,false),[]);assert.equal(JSON.stringify(r),snapshot);
  let shots=0,rewards=0;for(let i=0;i<200;i++)for(const event of r.tick(.05)){shots+=event.type==='support';rewards+=event.type==='saved';}
  assert.equal(rewards,1);assert.ok(shots>=10&&shots<=12);assert.equal(r.supportLeft,0);assert.ok(!r.tick(100).some(e=>e.type==='support'));
});

test('three attacks fail the rescue once without rewards or further spawns',()=>{
  const r=new RescueEvent();r.tick(4);for(let i=0;i<3;i++)assert.equal(r.hurt(),true);
  assert.equal(r.hurt(),false);assert.equal(r.hearts,0);assert.equal(r.pending,false);r.defeat(0);
  const events=r.tick(20);assert.equal(events.filter(e=>e.type==='failed').length,1);assert.ok(!events.some(e=>['saved','spawn','support'].includes(e.type)));
  assert.deepEqual(r.tick(20),[]);assert.equal(new RescueEvent().phase,'waiting');
});

test('survivor can signal, assist and escape, and threat markers never intercept shots',()=>{
  const person=createSurvivor();for(const phase of ['active','saved','failed']){person.animate(2,phase,phase==='saved'?8:0);person.root.updateMatrixWorld(true);assert.ok(new THREE.Box3().setFromObject(person.root).max.y>2);assert.equal(person.rifle.visible,phase==='saved');}
  assert.equal(rescueMarker().userData.nonTarget,true);
});
