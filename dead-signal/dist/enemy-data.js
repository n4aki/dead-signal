export const ENEMIES = {
  normal: { name:'感染者', code:'WALKER', hp:3, speed:1.35, damage:12, role:'melee', center:1.2, points:100, color:'#819b78', description:'群れで接近する基本の敵。頭を狙えばマシンガン1発。' },
  runner: { name:'疾走する感染者', code:'RUNNER', hp:2, speed:2.5, damage:10, role:'melee', center:1.2, points:120, color:'#bbaa76', description:'通常の感染者より素早く接近する。' },
  skeleton: { name:'骨の射手', code:'BONE ARCHER', hp:2, speed:1.3, damage:8, role:'ranged', center:1.25, points:180, color:'#efdfaa', range:19, windup:1.15, cooldown:3.8, projectileSpeed:9, description:'細い骨の体と角ばった弓を持つ射手。射線が通る場所で停止して狙いを定める。飛んでくる矢は撃ち落とせる。' },
  bomber: { name:'苔の爆裂体', code:'MOSS BOMBER', hp:3, speed:1.85, damage:30, role:'bomb', center:1.1, points:160, color:'#b5e774', fuse:1.65, description:'腕を持たない緑の四足型。接近すると点滅し、約1.7秒後に自爆する。光り始めたら最優先で撃破しよう。' },
  wolf: { name:'灰牙の猟犬', code:'ASH HOUND', hp:2, speed:3.7, damage:8, role:'melee', center:.6, points:120, color:'#c6cfd0', description:'四足で駆け寄る小型の高速獣。低い位置へ照準を下げ、接近前に止めよう。' },
  bat: { name:'夜羽コウモリ', code:'NIGHTWING', hp:1, speed:2.8, damage:7, role:'melee', center:.12, points:130, color:'#bea4e4', flight:2.9, description:'羽ばたきながら空中を接近し、最後に低く急降下する。体力は低いが、小さく狙いづらい。' },
  silverfish: { name:'銀殻の這虫', code:'SILVER CRAWLER', hp:1, speed:2.7, damage:5, role:'melee', center:.24, points:90, color:'#b2cbc8', description:'節のある小さな体で地面を這う。足元を見落とさないこと。ショットガンの広い射線が有効。' },
  spider: { name:'八脚の潜伏者', code:'DUSK SPIDER', hp:2, speed:2.5, damage:10, role:'melee', center:.45, points:140, color:'#dd9a9b', description:'八本脚で物陰を抜けてくる低い姿勢の敵。赤い目と横に広い脚が目印。' },
  boss: { name:'変異巨人・番人', code:'MUTANT WARDEN', hp:110, speed:4.6, damage:24, role:'boss', center:2.1, points:2000, color:'#b2d38a', description:'巨大な拳と盛り上がった肩を持つ変異ゾンビ。遠吠え、岩投げ、左右回避、ジャンプ、飛びかかりを使う。岩はマシンガン3発か散弾1発で破壊。跳躍と飛びかかりは構えから着地までに6ダメージを与えると阻止できる。' }
};
export const BESTIARY = ['normal','skeleton','bomber','wolf','bat','silverfish','spider','boss'];
for(const [type,def] of Object.entries(ENEMIES))if(type!=='boss')def.speed=Number((def.speed*1.2).toFixed(2));
const ENCOUNTERS = [
  { label:'感染者と射手の防衛線', tip:'頭を狙って感染者を排除。射手の矢は撃ち落とせる。',
    roster:['normal','normal','skeleton','normal','skeleton','normal','skeleton'] },
  { label:'小型獣の高速襲撃', tip:'猟犬と蜘蛛が物陰から接近。低い位置を素早く狙おう。',
    roster:['wolf','spider','wolf','silverfish','wolf','spider','wolf','spider','wolf'] },
  { label:'這虫・蜘蛛の大量発生', tip:'診察室から這虫と蜘蛛が流入。足元を警戒し、散弾でまとめて倒そう。',
    roster:['silverfish','spider','silverfish','skeleton','spider','silverfish','spider','silverfish','skeleton','spider','silverfish'] },
  { label:'爆裂体と射手の包囲', tip:'爆裂体を優先して排除。合間に現れる射手の矢にも注意。',
    roster:['bomber','skeleton','bomber','normal','bomber','skeleton','bomber','normal','bomber','skeleton','bomber','skeleton','bomber'] },
  { label:'コウモリの空中襲撃', tip:'空中のコウモリが主力。地上の射手を挟み、最後に番人が出現。',
    roster:['bat','bat','skeleton','bat','wolf','bat','skeleton','bat','spider','bat','skeleton','bat','bat','skeleton','bat'] }
];
// Triple the horde while retaining each area's identity and keeping bombers separated.
for(const [index,profile] of ENCOUNTERS.entries())profile.roster=index===3
  ? Array.from({length:39},(_,i)=>i%2===0?'bomber':i%3===0?'normal':'skeleton')
  : Array.from({length:3},()=>profile.roster).flat();
export function encounterProfile(wave) { return ENCOUNTERS[wave-1]; }
export function encounterRoster(wave) { return encounterProfile(wave).roster; }
export function enemyLocalPath(type,path) { const def=ENEMIES[type]; return path.map((p,i)=>[p[0],p[1]+(def.flight?(i===path.length-1&&path.length>1?1.4:def.flight):0),p[2]]); }
export function createBrain(type) { return { type, hp:ENEMIES[type].hp, dead:false, attackLeft:.6, attackPhase:'idle', attackProgress:0, relocateLeft:0, releaseLeft:0, chargeLeft:0, shotCooldown:1.6, armed:false, fuseLeft:ENEMIES[type].fuse || 0, detonated:false }; }
// Returns intentions; rendering, line of sight and projectiles are handled by the game.
export function stepBrain(enemy, dt, { active=true, arrived=false, distance=100, visible=false } = {}) {
  const def=ENEMIES[enemy.type];
  if(!active || enemy.dead) return {move:false};
  enemy.attackPhase='idle';enemy.attackProgress=0;
  if(def.role==='bomb') {
    if(!enemy.armed && (arrived || distance < 6)) { enemy.armed=true; return {move:false,event:'fuse'}; }
    if(enemy.armed) {
      enemy.fuseLeft=Math.max(0,enemy.fuseLeft-dt);
      if(!enemy.fuseLeft && !enemy.detonated) { enemy.detonated=true; return {move:false,event:'explode',damage:def.damage}; }
      return {move:false};
    }
  }
  if(def.role==='ranged') {
    if(!visible || distance>(enemy.range||def.range)) { enemy.chargeLeft=0; return {move:!arrived}; }
    if(enemy.chargeLeft>0) {
      enemy.chargeLeft=Math.max(0,enemy.chargeLeft-dt);
      enemy.attackPhase='aim';enemy.attackProgress=1-enemy.chargeLeft/def.windup;
      if(!enemy.chargeLeft) { enemy.shotCooldown=def.cooldown;enemy.releaseLeft=.28;enemy.relocateLeft=.85; return {move:false,event:'projectile',damage:def.damage}; }
    } else {
      enemy.shotCooldown-=dt;
      enemy.releaseLeft=Math.max(0,enemy.releaseLeft-dt);
      if(enemy.releaseLeft>0){enemy.attackPhase='release';enemy.attackProgress=1-enemy.releaseLeft/.28;return {move:false};}
      enemy.relocateLeft=Math.max(0,enemy.relocateLeft-dt);
      if(enemy.relocateLeft>0&&!arrived&&distance>9)return {move:true,pace:.65};
      if(enemy.shotCooldown<=0) { enemy.chargeLeft=def.windup; return {move:false,event:'aim'}; }
    }
    return {move:false};
  }
  if(arrived) {
    const cycle=enemy.attackCycle||1.35;
    enemy.attackLeft-=dt;
    if(enemy.attackLeft<=0) { enemy.attackLeft=cycle;enemy.attackPhase='strike'; return {move:false,event:'melee',damage:def.damage}; }
    if(enemy.attackLeft>cycle-.23){enemy.attackPhase='strike';enemy.attackProgress=(cycle-enemy.attackLeft)/.23;}
    else if(enemy.attackLeft<=.58){enemy.attackPhase='windup';enemy.attackProgress=1-enemy.attackLeft/.58;}
    else {enemy.attackPhase='recover';enemy.attackProgress=(cycle-.23-enemy.attackLeft)/(cycle-.81);}
    return {move:false};
  }
  return {move:true};
}
