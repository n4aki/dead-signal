export const RESCUE_STAGE=2;
export const SURVIVOR_POSITION=[0,0,-2];
export const RESCUE_PATHS=[
  [[-3.2,0,-8],[-2,0,-5],[-1,0,-2]],
  [[3.2,0,-8],[2,0,-5],[1,0,-2]],
  [[.4,0,-8],[.2,0,-5],[0,0,-3.1]],
];
export class RescueEvent{
  constructor(){this.phase='waiting';this.time=0;this.hearts=3;this.spawned=0;this.defeated=new Set();this.events=[];this.supportLeft=0;this.supportCooldown=0;this.resultTime=0;}
  get pending(){return this.phase==='waiting'||this.phase==='active';}
  defeat(id){
    if(this.phase!=='active'||!Number.isInteger(id)||id<0||id>=this.spawned||this.defeated.has(id))return;
    this.defeated.add(id);
    if(this.defeated.size===RESCUE_PATHS.length){this.phase='saved';this.supportLeft=8;this.events.push({type:'saved',heal:20,score:500});}
  }
  hurt(){
    if(this.phase!=='active')return false;
    this.hearts=Math.max(0,this.hearts-1);this.events.push({type:'hurt'});
    if(!this.hearts){this.phase='failed';this.events.push({type:'failed'});}
    return true;
  }
  tick(dt,active=true){
    if(!active)return [];
    this.time+=dt;
    if(this.phase==='waiting'&&this.time>=4){this.phase='active';this.events.push({type:'start'});}
    if(this.phase==='active')while(this.spawned<RESCUE_PATHS.length&&this.time>=4+this.spawned*2){this.events.push({type:'spawn',id:this.spawned,path:RESCUE_PATHS[this.spawned]});this.spawned++;}
    if(this.phase==='saved'){
      const firingTime=Math.min(dt,this.supportLeft);this.supportLeft=Math.max(0,this.supportLeft-dt);
      if(firingTime>0){this.supportCooldown-=firingTime;if(this.supportCooldown<=0){this.events.push({type:'support'});this.supportCooldown=.7;}}
      if(this.supportLeft===0)this.resultTime+=dt;
    }
    if(this.phase==='failed')this.resultTime+=dt;
    return this.events.splice(0);
  }
}
