// Local rooftop coordinates keep every dodge and landing inside the open helipad.
export const BOSS_ACTIONS = {
  roar: { windup:.7, duration:1.4, recovery:.9, warning:'遠吠え / 頭を狙うチャンス', damage:0 },
  rock: { windup:1.25, duration:.45, recovery:1.1, warning:'岩投げ / 飛んでくる岩を撃ち壊せ', damage:22 },
  dodge: { windup:.35, duration:.28, recovery:.7, warning:'高速回避 / 移動先を狙え', damage:0 },
  jump: { windup:1.3, duration:1.35, recovery:1.3, warning:'ジャンプ攻撃 / 集中射撃で阻止', damage:16 },
  lunge: { windup:1.2, duration:.65, recovery:1.6, warning:'飛びかかり / 集中射撃で阻止', damage:24 }
};
const sequence=['roar','rock','dodge','jump','rock','dodge','lunge'];
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const smooth=t=>t*t*(3-2*t);
export function createBossBrain(){return {phase:'approach',action:'roar',timer:0,index:0,side:1,position:[0,0,-23],from:[0,0,-23],home:[0,0,-7],target:[0,0,-7],stagger:0};}
function prepare(b){
  b.action=sequence[b.index++%sequence.length];b.phase='windup';b.timer=0;b.stagger=0;b.from=[...b.position];
  if(b.action==='dodge'){b.side*=-1;b.target=[b.side*2.3,0,-7];}
  else if(b.action==='jump')b.target=[b.side*1.8,0,-2];
  else if(b.action==='lunge')b.target=[b.side*.9,0,2];
  else b.target=[...b.position];
  return {event:'warning'};
}
export function stepBoss(b,dt,{active=true,dead=false}={}){
  if(!active||dead)return {};
  b.timer+=dt;
  if(b.phase==='approach'){
    b.position=mix(b.from,b.home,smooth(Math.min(1,b.timer/3.5)));
    return b.timer>=3.5?prepare(b):{};
  }
  const def=BOSS_ACTIONS[b.action];
  if(b.phase==='windup'&&b.timer>=def.windup){
    b.phase='action';b.timer=0;
    return {event:b.action==='rock'?'rock':b.action==='roar'?'roar':'launch'};
  }
  if(b.phase==='action'){
    const p=Math.min(1,b.timer/def.duration);
    const travel=b.action==='jump'?p:b.action==='lunge'?1-(1-p)**2:b.action==='dodge'?1-(1-p)**3:smooth(p);
    b.position=mix(b.from,b.target,travel);
    if(b.action==='jump'||b.action==='lunge')b.position[1]=4*p*(1-p)*(b.action==='jump'?3:1.15);
    if(p>=1){
      b.phase='recovery';b.timer=0;b.from=[...b.position];
      if(b.action==='dodge')b.home=[...b.position];
      return def.damage&&b.action!=='rock'?{event:'impact',damage:def.damage}:{};
    }
  }
  if((b.phase==='recovery'||b.phase==='stunned')){
    const duration=b.phase==='stunned'?1.5:def.recovery;
    const settle=['jump','lunge'].includes(b.action)?.22:0;
    b.position=mix(b.from,b.home,smooth(Math.max(0,Math.min(1,(b.timer-settle)/(duration-settle)))));
    if(b.phase==='stunned')b.position[1]=Math.max(0,b.from[1]-4.9*b.timer*b.timer);
    if(b.timer>=duration)return prepare(b);
  }
  return {};
}
export function staggerBoss(b,damage){
  if(!['jump','lunge'].includes(b.action)||!['windup','action'].includes(b.phase))return false;
  b.stagger+=damage;
  if(b.stagger<6)return false;
  b.phase='stunned';b.timer=0;b.from=[...b.position];return true;
}
export function bossWarning(b){
  if(b.phase==='stunned')return '攻撃阻止！ / 体勢を崩している';
  if(b.phase==='recovery')return '攻撃後の隙 / 頭を狙え';
  if(b.phase==='approach')return '変異巨人が接近';
  return BOSS_ACTIONS[b.action].warning+(['jump','lunge'].includes(b.action)?`　阻止 ${Math.min(6,b.stagger)} / 6`:'');
}
export function rockPosition(from,target,progress){const p=Math.max(0,Math.min(1,progress)),v=mix(from,target,p);v[1]+=Math.sin(p*Math.PI)*1.4;return v;}
export function strikeProjectile(p,damage){p.hp=Math.max(0,p.hp-damage);return p.hp===0;}
