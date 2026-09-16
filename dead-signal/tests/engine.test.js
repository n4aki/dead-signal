import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState, wavePlan, AREAS, TRAVEL_HOLD, TRAVEL_DURATION } from '../engine.js';
import { travelPose, worldPose } from '../stage-data.js';
import { FireControl } from '../combat-input.js';
import { WEAPONS } from '../engine.js';
import { routeChoices } from '../route-data.js';
import { createSpawnSelector } from '../spawn-data.js';
function playing() { const s = new GameState(); s.mode = 'playing'; return s; }
test('held machine gun sustains fire, reloads empty magazine and resumes without another press',()=>{
  const s=playing(),trigger=new FireControl();trigger.hold('pointer');let reloads=0;
  for(let i=0;i<800;i++){
    s.tick(.01);const intent=trigger.intent(s);
    if(intent==='shoot')assert.equal(s.shoot(),true);
    if(intent==='reload'){assert.equal(s.ammo[0],0);assert.equal(s.reload(),true);reloads++;}
  }
  assert.equal(reloads,1);assert.ok(s.shots>65&&s.shots<85);assert.ok(s.ammo[0]>0);
  trigger.release('pointer');const shots=s.shots;s.tick(1);assert.equal(trigger.intent(s),null);assert.equal(s.shots,shots);
});
test('automatic fire stops on lifecycle exits and cannot turn the shotgun automatic',()=>{
  const s=playing(),trigger=new FireControl();trigger.hold('pointer');trigger.hold('keyboard');trigger.release('pointer');assert.equal(trigger.intent(s),'shoot');
  for(const mode of ['ready','paused','moving','choosing','over','won']){s.mode=mode;assert.equal(trigger.intent(s),null);}
  s.mode='playing';s.weapon=1;assert.equal(trigger.intent(s),null);s.weapon=0;
  trigger.clear();assert.equal(trigger.intent(s),null);
  trigger.hold('keyboard');s.shoot();assert.equal(trigger.intent(s),null);s.tick(WEAPONS[0].cooldown);assert.equal(trigger.intent(s),'shoot');
});
test('horde counts and cadence grow while limiting simultaneous active enemies',()=>{
  assert.deepEqual([1,2,3,4,5].map(w=>wavePlan(w).count),[21,27,33,39,45]);
  for(let w=1;w<=5;w++){assert.ok(wavePlan(w).interval<.6);assert.equal(wavePlan(w).maxActive,16);}
});
test('ammo, cooldown and reload prevent unlimited fire', () => {
  const s = playing(); assert.equal(s.shoot(), true); assert.equal(s.shoot(), false); assert.equal(s.ammo[0], 59);
  for (let i = 0; i < 59; i++) { s.tick(.2); assert.equal(s.shoot(), true); }
  s.tick(.2); assert.equal(s.shoot(), false); assert.equal(s.shots, 60);
  assert.equal(s.reload(), true); assert.equal(s.switchWeapon(1), false); s.tick(1); assert.equal(s.ammo[0], 0); s.tick(.2); assert.equal(s.ammo[0], 60);
});
test('pause freezes reload, cooldown and combo', () => { const s = playing(); s.shoot(); s.reload(); s.kill(); s.mode = 'paused'; const before = JSON.stringify(s); s.tick(10); assert.equal(JSON.stringify(s), before); assert.equal(s.shoot(), false); });
test('weapons retain separate magazines', () => { const s = playing(); s.shoot(); s.switchWeapon(1); s.tick(1); s.shoot(); assert.deepEqual(s.ammo, [59, 5]); s.switchWeapon(0); assert.equal(s.ammo[s.weapon], 59); });
test('combos award points, expire, and reset on damage', () => { const s = playing(); assert.equal(s.kill(true), 200); s.kill(); s.kill(); assert.equal(s.kill(), 200); s.tick(3.1); assert.equal(s.combo, 0); s.kill(); s.hurt(12); assert.equal(s.combo, 0); assert.equal(s.health, 88); });
test('death, reset and wave supplies', () => { const s = playing(); s.hurt(80); s.nextWave(); assert.equal(s.health, 40); assert.equal(s.wave, 2); s.hurt(100); assert.equal(s.mode, 'over'); assert.equal(s.health, 0); assert.equal(s.shoot(), false); s.reset(); assert.equal(s.health, 100); assert.equal(s.score, 0); assert.equal(s.grenades, 3); });
test('five waves grow and final wave includes a boss', () => { assert.equal(wavePlan(1).count, 21); assert.equal(wavePlan(5).count, 45); assert.equal(wavePlan(4).boss, false); assert.equal(wavePlan(5).boss, true); });
test('clear holds the camera, then travels continuously and supplies only on arrival', () => {
  const s = playing(); s.hurt(40); s.shoot();
  assert.equal(s.beginTravel(), true); assert.equal(s.beginTravel(), false);
  assert.equal(s.shoot(), false); assert.equal(s.reload(), false); assert.equal(s.switchWeapon(1), false);
  s.hurt(50); assert.equal(s.health, 60);
  s.tick(TRAVEL_HOLD); assert.deepEqual(s.battlePose, AREAS[0].shots[0]); assert.equal(s.wave, 1);
  s.tick(TRAVEL_DURATION / 2); assert.equal(s.travelProgress, .5); assert.equal(s.health, 60); assert.equal(s.ammo[0], 59);
  assert.equal(s.tick(TRAVEL_DURATION / 2), 'arrived'); assert.deepEqual(s.battlePose, AREAS[1].shots[0]); assert.equal(s.wave, 2); assert.equal(s.mode, 'playing'); assert.equal(s.health, 80); assert.deepEqual(s.ammo, [60, 6]);
  s.tick(10); assert.equal(s.wave, 2); assert.equal(s.health, 80);
});
test('pausing movement preserves camera position and resumes remaining travel', () => {
  const s = playing(); s.beginTravel(); s.tick(3); const before = travelPose(0, s.travelProgress);
  assert.equal(s.pause(), true); s.tick(30); assert.deepEqual(travelPose(0, s.travelProgress), before); assert.equal(s.wave, 1);
  assert.equal(s.resume(), true); assert.equal(s.mode, 'moving'); s.tick(1); assert.notDeepEqual(travelPose(0, s.travelProgress).position, before.position);
  s.tick(3); assert.equal(s.wave, 2); assert.equal(s.mode, 'playing');
});
test('all four routes arrive exactly at their destination; final area cannot travel', () => {
  const s = playing();
  for (let i = 1; i < AREAS.length; i++) { assert.equal(s.beginTravel(), true); s.tick(20); assert.equal(s.wave, i + 1); assert.deepEqual(s.battlePose, AREAS[i].shots[0]); }
  assert.equal(s.beginTravel(), false); assert.equal(s.mode, 'playing'); assert.equal(s.wave, 5);
});
test('retry clears a partially completed route and starts at the checkpoint', () => {
  const s = playing(); s.beginTravel(); s.tick(4); s.pause(); s.reset();
  assert.equal(s.travelling, false); assert.deepEqual(s.battlePose, AREAS[0].shots[0]); assert.equal(s.travelTime, 0); assert.equal(s.wave, 1);
});

test('the checkpoint choice waits indefinitely and rejects combat input, invalid and duplicate selections',()=>{
  const s=playing();s.hurt(40);s.shoot();assert.equal(s.completeArea(),'choice');assert.equal(s.choosing,true);
  const frozen=JSON.stringify(s);s.tick(999);assert.equal(JSON.stringify(s),frozen);
  assert.equal(s.shoot(),false);assert.equal(s.reload(),false);assert.equal(s.switchWeapon(1),false);s.hurt(50);assert.equal(s.health,60);
  assert.equal(s.completeArea(),false);assert.equal(s.chooseRoute('invalid'),false);assert.equal(s.pause(),true);assert.equal(s.chooseRoute('avenue'),false);s.tick(999);assert.equal(s.wave,1);assert.equal(s.resume(),true);assert.equal(s.mode,'choosing');
  assert.equal(s.chooseRoute('avenue'),true);assert.equal(s.chooseRoute('alley'),false);assert.equal(s.health,60);assert.equal(s.areaIndex,0);assert.equal(s.nextAreaIndex,5);
  s.tick(TRAVEL_HOLD+TRAVEL_DURATION);assert.equal(s.areaIndex,5);assert.equal(s.wave,2);assert.equal(s.health,80);assert.deepEqual(s.ammo,[60,6]);s.tick(20);assert.equal(s.health,80);
});

test('both routes retain five encounters, distinct enemies, and rejoin the hospital before the same boss',()=>{
  for(const choice of routeChoices(1)){
    const s=playing(),locations=[s.areaIndex];s.completeArea();assert.equal(s.chooseRoute(choice.id),true);s.tick(10);locations.push(s.areaIndex);
    assert.equal(s.areaIndex,choice.stage);assert.equal(s.encounter.roster.length,27);assert.equal(wavePlan(s.wave,s.areaIndex).count,27);
    const choose=createSpawnSelector(s.areaIndex,()=>.3),used=new Set();for(const type of s.encounter.roster){const entry=choose(type);assert.ok(entry.types.includes(type));used.add(entry.id);}assert.equal(used.size,8);
    assert.ok(s.encounter.roster.includes(choice.id==='avenue'?'skeleton':'wolf'));
    assert.ok(!s.encounter.roster.includes(choice.id==='avenue'?'wolf':'skeleton'));
    while(s.wave<5){assert.equal(routeChoices(s.wave).length,0);assert.equal(s.completeArea(),'moving');s.tick(10);locations.push(s.areaIndex);}
    assert.deepEqual(locations,[0,choice.stage,2,3,4]);assert.equal(wavePlan(s.wave,s.areaIndex).boss,true);assert.equal(s.completeArea(),false);
    s.reset();assert.deepEqual(s.itinerary,[0,1,2,3,4]);assert.equal(s.choosing,false);assert.equal(s.routeDescription,'');
  }
});
