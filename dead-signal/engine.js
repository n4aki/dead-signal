export const WEAPONS = [
  { name: 'STORM MACHINE GUN', label: 'マシンガン', capacity: 60, reload: 1.1, cooldown: .085, damage: 1, automatic:true },
  { name: 'RIOT SHOTGUN', label: 'ショットガン', capacity: 6, reload: 1.8, cooldown: .75, damage: 3 }
];
import { AREAS, STAGES, mixPose, smooth } from './stage-data.js';
import { DEFAULT_ROUTE, routeChoices, routeEncounter } from './route-data.js';
export { AREAS } from './stage-data.js';
export const TRAVEL_HOLD = 1.2;
export const TRAVEL_DURATION = 5;
export class GameState {
  constructor() { this.reset(); }
  reset() { this.mode = 'ready'; this.health = 100; this.score = 0; this.kills = 0; this.shots = 0; this.hits = 0; this.headshots = 0; this.wave = 1; this.weapon = 0; this.ammo = WEAPONS.map(w=>w.capacity); this.reloadLeft = 0; this.cooldown = 0; this.combo = 0; this.comboLeft = 0; this.grenades = 3; this.travelTime = 0; this.resumeMode = 'playing'; this.combatTime = 0; this.itinerary=[...DEFAULT_ROUTE]; this.routeDescription=''; }
  get areaIndex() { return this.itinerary[this.wave-1]; }
  get nextAreaIndex() { return this.itinerary[this.wave]; }
  get area() { return STAGES[this.areaIndex]; }
  get encounter() { return routeEncounter(this.wave,this.areaIndex); }
  get choosing() { return this.mode==='choosing'||(this.mode==='paused'&&this.resumeMode==='choosing'); }
  completeArea() {
    if(this.mode!=='playing'||this.wave>=AREAS.length)return false;
    this.routeDescription='';
    if(routeChoices(this.wave).length){this.mode='choosing';this.reloadLeft=0;this.cooldown=0;this.combo=0;this.comboLeft=0;return 'choice';}
    this.beginTravel();return 'moving';
  }
  chooseRoute(id) {
    if(this.mode!=='choosing')return false;
    const choice=routeChoices(this.wave).find(c=>c.id===id);if(!choice)return false;
    this.itinerary[this.wave]=choice.stage;this.routeDescription=choice.travel;this.mode='playing';return this.beginTravel();
  }
  get travelling() { return this.mode === 'moving' || (this.mode === 'paused' && this.resumeMode === 'moving'); }
  get travelProgress() { return Math.max(0, Math.min(1, (this.travelTime - TRAVEL_HOLD) / TRAVEL_DURATION)); }
  get battlePose() { return mixPose(this.area.shots[0], this.area.shots[1], smooth((this.combatTime - 9) / 5)); }
  beginTravel() {
    if (this.mode !== 'playing' || this.wave >= AREAS.length) return false;
    this.mode = 'moving'; this.travelTime = 0; this.reloadLeft = 0; this.cooldown = 0; this.combo = 0; this.comboLeft = 0;
    return true;
  }
  pause() { if (!['playing', 'moving', 'choosing'].includes(this.mode)) return false; this.resumeMode = this.mode; this.mode = 'paused'; return true; }
  resume() { if (this.mode !== 'paused') return false; this.mode = this.resumeMode; return true; }
  tick(dt) {
    if (this.mode === 'moving') {
      this.travelTime += dt;
      if (this.travelTime >= TRAVEL_HOLD + TRAVEL_DURATION) { this.nextWave(); this.mode = 'playing'; return 'arrived'; }
      return;
    }
    if (this.mode !== 'playing') return;
    this.combatTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.comboLeft = Math.max(0, this.comboLeft - dt);
    if (!this.comboLeft) this.combo = 0;
    if (this.reloadLeft > 0) { this.reloadLeft = Math.max(0, this.reloadLeft - dt); if (!this.reloadLeft) this.ammo[this.weapon] = WEAPONS[this.weapon].capacity; }
  }
  shoot() { if (this.mode !== 'playing' || this.cooldown > 0 || this.reloadLeft > 0 || this.ammo[this.weapon] <= 0) return false; this.ammo[this.weapon]--; this.shots++; this.cooldown = WEAPONS[this.weapon].cooldown; return true; }
  reload() { if (this.mode !== 'playing' || this.reloadLeft || this.ammo[this.weapon] === WEAPONS[this.weapon].capacity) return false; this.reloadLeft = WEAPONS[this.weapon].reload; return true; }
  switchWeapon(index) { if (this.mode !== 'playing' || this.reloadLeft || index < 0 || index > 1) return false; this.weapon = index; return true; }
  kill(head = false, boss = false, basePoints = 100) { this.combo++; this.comboLeft = 3; this.kills++; if (head) this.headshots++; const points = (boss ? 2000 : basePoints * (head ? 2 : 1)) * Math.min(5, 1 + Math.floor((this.combo - 1) / 3)); this.score += points; return points; }
  hurt(amount) { if (this.mode !== 'playing') return; this.health = Math.max(0, this.health - amount); this.combo = 0; this.comboLeft = 0; if (!this.health) this.mode = 'over'; }
  nextWave() { this.wave++; this.combatTime = 0; this.health = Math.min(100, this.health + 20); this.ammo = WEAPONS.map(w=>w.capacity); this.reloadLeft = 0; }
}
export function wavePlan(wave,stage=wave-1) { return { count: routeEncounter(wave,stage).roster.length, interval: .65-wave*.07, maxActive:16, boss: wave === 5 }; }
