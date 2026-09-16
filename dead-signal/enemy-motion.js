// Locomotion runs on travelled distance, separately from the combat clock.
// Curves and lateral steps are accepted only inside the stage's clear space.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const length=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const unit=(a,b)=>{const d=length(a,b)||1;return a.map((v,i)=>(b[i]-v)/d);};
export const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const strideLength={normal:1.55,runner:2.1,skeleton:1.6,bomber:1.1,wolf:2.65,bat:2.8,silverfish:1.0,spider:1.65};
export function createMotionClearance(type,area,obstacles){
  const c=Math.cos(area.yaw),s=Math.sin(area.yaw),radius={normal:.72,runner:.72,skeleton:.82,wolf:.7,spider:.9,silverfish:.45,bat:1.15,bomber:.55}[type]||.8;
  const height={normal:2.25,runner:2.25,skeleton:2.3,wolf:1.3,spider:.9,silverfish:.5,bat:.6,bomber:2.25}[type]||2.3;
  return p=>{
    const dx=p[0]-area.origin[0],dz=p[2]-area.origin[2],x=dx*c-dz*s,z=dx*s+dz*c,y=p[1]-area.origin[1];
    return !obstacles.some(b=>b.max[1]>y+.14&&b.min[1]<y+height&&x>b.min[0]-radius&&x<b.max[0]+radius&&z>b.min[2]-radius&&z<b.max[2]+radius);
  };
}

export function prepareEnemyRoute(points,isClear=()=>true){
  const result=[points[0].slice()];
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1],incoming=unit(a,b),outgoing=unit(b,c);
    const dot=incoming.reduce((n,v,j)=>n+v*outgoing[j],0);
    // Keep stair risers, drops and vertical wall descents on their actual support.
    if(Math.abs(a[1]-b[1])>.03||Math.abs(c[1]-b[1])>.03||dot>.995||dot<-.6){result.push(b.slice());continue;}
    const cut=Math.min(.7,length(a,b)*.22,length(b,c)*.22);
    const start=b.map((v,j)=>v-incoming[j]*cut),end=b.map((v,j)=>v+outgoing[j]*cut);
    const curve=Array.from({length:13},(_,j)=>{const t=j/12;return mix(mix(start,b,t),mix(b,end,t),t);});
    if(curve.every(p=>isClear(p)))result.push(...curve);else result.push(b.slice());
  }
  if(points.length>1)result.push(points.at(-1).slice());
  const segments=[];let total=0;
  for(let i=1;i<result.length;i++){const distance=length(result[i-1],result[i]);if(distance<.00001)continue;segments.push({a:result[i-1],b:result[i],start:total,length:distance});total+=distance;}
  return {points:result,segments,total};
}
export function sampleEnemyRoute(route,distance){
  const s=route.segments.find(s=>distance<s.start+s.length)||route.segments.at(-1);
  if(!s)return {position:route.points[0].slice(),direction:[0,0,1],arrived:true};
  return {position:mix(s.a,s.b,clamp((distance-s.start)/s.length)),direction:unit(s.a,s.b),arrived:distance>=route.total};
}
export function createLocomotion(type,points,{seed=0,isClear=()=>true}={}){
  const route=prepareEnemyRoute(points,isClear),sample=sampleEnemyRoute(route,0);
  return {type,route,isClear,seed,time:0,distance:0,speed:0,gait:seed*Math.PI,weight:0,
    yaw:Math.atan2(sample.direction[0],sample.direction[2]),turn:0,position:sample.position,
    offset:0,phase:'idle',energy:0,arrived:route.total===0};
}
export function movementRhythm(type,time,seed=0){
  const t=time+seed*.71;
  if(type==='wolf'||type==='runner'){
    const p=t%3.15;
    return p<.62?{pace:.42,phase:'stalk',energy:p/.62}:p<1.5?{pace:1.68,phase:'burst',energy:Math.sin((p-.62)/.88*Math.PI)}:{pace:.86,phase:'run',energy:0};
  }
  if(type==='spider'){
    const p=t%2.8;
    return p<.48?{pace:.06,phase:'crouch',energy:p/.48}:p<1.08?{pace:1.9,phase:'burst',energy:Math.sin((p-.48)/.6*Math.PI)}:{pace:.82,phase:'crawl',energy:0};
  }
  if(type==='silverfish'){const p=t%1.23;return {pace:p<.22?.18:p<.75?1.55:.72,phase:p<.22?'hesitate':'scuttle',energy:0};}
  if(type==='bat'){const p=t%3.6;return {pace:p<1.9?.78:1.42,phase:p<1.9?'glide':'dive',energy:p<1.9?0:Math.sin((p-1.9)/1.7*Math.PI)};}
  if(type==='bomber')return {pace:.86+.18*Math.sin(t*2.7),phase:'creep',energy:0};
  if(type==='skeleton')return {pace:.9+.1*Math.sin(t*2.1),phase:'walk',energy:0};
  return {pace:.98+.32*Math.sin(t*2.2)+.12*Math.sin(t*4.4+.7),phase:'stagger',energy:0};
}
export function stepLocomotion(m,dt,{active=true,move=true,baseSpeed=1,target=null,hit=0,neighbors=[],pace=1}={}){
  if(!active)return m;
  dt=clamp(dt,0,.05);m.time+=dt;
  const rhythm=movementRhythm(m.type,m.time,m.seed),sample=sampleEnemyRoute(m.route,m.distance);
  const ahead=sampleEnemyRoute(m.route,m.distance+.75),after=sampleEnemyRoute(m.route,m.distance+1.35);
  const horizontal=Math.hypot(sample.direction[0],sample.direction[2]);
  const direction=horizontal>.1?sample.direction:[Math.sin(m.yaw),0,Math.cos(m.yaw)];
  const bend=horizontal>.1?Math.abs(angleDelta(Math.atan2(direction[0],direction[2]),Math.atan2(after.direction[0],after.direction[2]))):0;
  let traffic=1;
  if(move&&!m.arrived)for(const n of neighbors){
    if(n===m||n.arrived||Math.abs(n.position[1]-m.position[1])>.85)continue;
    const dx=n.position[0]-m.position[0],dz=n.position[2]-m.position[2],gap=dx*direction[0]+dz*direction[2];
    const lateral=Math.abs(dx*direction[2]-dz*direction[0]);
    // Slow the follower, never the leader; retain progress in crowded entrances.
    if(gap>.1&&gap<1.8&&lateral<.65)traffic=Math.min(traffic,.32+.68*clamp((gap-.3)/1.5));
  }
  const canMove=move&&!m.arrived;
  const desired=canMove?baseSpeed*(.93+Math.sin(m.seed*7)*.09)*rhythm.pace*pace*traffic*(1-clamp(bend/Math.PI)*.55)*(hit>0?.25:1):0;
  m.speed+=(desired-m.speed)*(1-Math.exp(-dt*(desired>m.speed?5.5:12)));
  const oldDistance=m.distance;
  // An archer's planted aim and a bomber's fuse stop actual displacement at once.
  if(canMove)m.distance=Math.min(m.route.total,m.distance+m.speed*dt);
  const travelled=m.distance-oldDistance,next=sampleEnemyRoute(m.route,m.distance);
  m.arrived=next.arrived;m.gait+=travelled/(strideLength[m.type]||1.6)*Math.PI*2;
  const moving=canMove&&travelled>0;
  m.weight+=((moving?clamp(m.speed/(baseSpeed||1),0,1.3):0)-m.weight)*(1-Math.exp(-dt*12));
  m.phase=moving?rhythm.phase:'idle';m.energy=moving?rhythm.energy:0;
  const maxOffset=m.type==='bat'?.62:m.type==='silverfish'?.15:m.type==='spider'?.18:.12;
  const lateral=canMove?Math.sin(m.time*(m.type==='bat'?1.6:1.1)+m.seed)*maxOffset*(1-clamp(bend/1.2))*clamp((m.route.total-m.distance)/2):0;
  const candidateOffset=(m.offset+(lateral-m.offset)*(1-Math.exp(-dt*5)))*clamp((m.route.total-m.distance)/.7);
  const candidate=next.position.map((v,i)=>v+(i===0?direction[2]*candidateOffset:i===2?-direction[0]*candidateOffset:0));
  // Validate the entire lateral sweep, not just the end of a sidestep.
  if(canMove){
    if(m.isClear(candidate)&&m.isClear(mix(m.position,candidate,.5))){m.position=candidate;m.offset=candidateOffset;}
    else {m.position=next.position;m.offset=0;}
  }
  const look=moving&&horizontal>.1?[ahead.position[0]-m.position[0],0,ahead.position[2]-m.position[2]]:
    target?[target[0]-m.position[0],0,target[2]-m.position[2]]:direction;
  const wanted=Math.atan2(look[0],look[2]),delta=angleDelta(m.yaw,wanted);
  const maxTurn=(m.type==='bat'?3.2:m.type==='wolf'?5:3.8)*dt;
  const turn=clamp(delta,-maxTurn,maxTurn);m.yaw+=turn;
  m.lookAngle=target?clamp(angleDelta(m.yaw,Math.atan2(target[0]-m.position[0],target[2]-m.position[2])),-.65,.65):0;
  m.turn+=(clamp(turn/(dt||1),-2,2)-m.turn)*(1-Math.exp(-dt*7));
  return m;
}
