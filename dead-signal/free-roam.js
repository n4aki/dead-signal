// The first free-roam arena is the checkpoint. Geometry and navigation share
// the same expanded cover rectangles, so routes cannot cut across vehicles.
export const FREE_BOUNDS={minX:-6.35,maxX:6.35,minZ:-34.5,maxZ:10};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class NavigationGrid{
  constructor(boxes,{bounds=FREE_BOUNDS,radius=.56,cell=.55}={}){
    this.bounds=bounds;this.radius=radius;this.cell=cell;
    this.width=Math.floor((bounds.maxX-bounds.minX)/cell)+1;
    this.depth=Math.floor((bounds.maxZ-bounds.minZ)/cell)+1;
    this.points=Array.from({length:this.width*this.depth},(_,i)=>[bounds.minX+(i%this.width)*cell,0,bounds.minZ+Math.floor(i/this.width)*cell]);
    this.setBoxes(boxes);
  }
  setBoxes(boxes){this.boxes=boxes.filter(b=>b.max[1]>.3&&b.min[1]<2.2);this.open=this.points.map(p=>this.clear(p));this.links=new Map();}
  clear(p,radius=this.radius){
    const b=this.bounds;
    return p[0]>=b.minX&&p[0]<=b.maxX&&p[2]>=b.minZ&&p[2]<=b.maxZ&&!this.boxes.some(o=>p[0]>o.min[0]-radius&&p[0]<o.max[0]+radius&&p[2]>o.min[2]-radius&&p[2]<o.max[2]+radius);
  }
  line(a,b,radius=this.radius){
    const steps=Math.max(1,Math.ceil(Math.hypot(a[0]-b[0],a[2]-b[2])/.14));
    for(let i=0;i<=steps;i++){const t=i/steps;if(!this.clear([a[0]+(b[0]-a[0])*t,0,a[2]+(b[2]-a[2])*t],radius))return false;}return true;
  }
  nearest(p){
    const x=Math.round((p[0]-this.bounds.minX)/this.cell),z=Math.round((p[2]-this.bounds.minZ)/this.cell);
    for(let r=0;r<5;r++){
      let best=-1,distance=Infinity;
      for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){
        if(Math.max(Math.abs(dx),Math.abs(dz))!==r||x+dx<0||x+dx>=this.width||z+dz<0||z+dz>=this.depth)continue;
        const i=(z+dz)*this.width+x+dx;if(!this.open[i])continue;
        const q=this.points[i],d=(p[0]-q[0])**2+(p[2]-q[2])**2;
        if(d<distance&&this.line(p,q)){best=i;distance=d;}
      }
      if(best>=0)return best;
    }
    return -1;
  }
  neighbors(current){
    if(this.links.has(current))return this.links.get(current);
    const links=[],x=current%this.width,z=Math.floor(current/this.width);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const xx=x+dx,zz=z+dz;if(xx<0||zz<0||xx>=this.width||zz>=this.depth)continue;
      const next=zz*this.width+xx;if(this.open[next]&&this.line(this.points[current],this.points[next]))links.push([next,Math.hypot(dx,dz)*this.cell]);
    }
    this.links.set(current,links);return links;
  }
  path(from,to){
    if(!this.clear(from)||!this.clear(to))return null;
    if(this.line(from,to))return [from.slice(),[to[0],0,to[2]]];
    const start=this.nearest(from),goal=this.nearest(to);if(start<0||goal<0)return null;
    const g=new Float64Array(this.points.length).fill(Infinity),parent=new Int32Array(this.points.length).fill(-1),closed=new Uint8Array(this.points.length),queue=[start];g[start]=0;
    const heuristic=i=>Math.hypot(this.points[i][0]-to[0],this.points[i][2]-to[2]);
    while(queue.length){
      let at=0;for(let i=1;i<queue.length;i++)if(g[queue[i]]+heuristic(queue[i])<g[queue[at]]+heuristic(queue[at]))at=i;
      const current=queue.splice(at,1)[0];if(closed[current])continue;closed[current]=1;
      if(current===goal){
        const route=[];for(let i=goal;i!==-1;i=parent[i])route.push(this.points[i]);route.reverse();route.unshift(from);route.push([to[0],0,to[2]]);
        const smooth=[route[0].slice()];let anchor=0;
        while(anchor<route.length-1){let next=route.length-1;while(next>anchor+1&&!this.line(route[anchor],route[next]))next--;smooth.push(route[next].slice());anchor=next;}
        return smooth;
      }
      for(const [next,length] of this.neighbors(current)){
        if(closed[next])continue;
        const cost=g[current]+length;
        if(cost<g[next]){g[next]=cost;parent[next]=current;queue.push(next);}
      }
    }
    return null;
  }
  targetNear(p){
    if(this.clear(p))return [p[0],0,p[2]];
    // The player has a smaller collision radius. Choose a reachable nearby cell
    // when they stand too close to a wall for a wide enemy to occupy that spot.
    let best=null,d=Infinity;for(let i=0;i<this.points.length;i++)if(this.open[i]){const q=this.points[i],n=(p[0]-q[0])**2+(p[2]-q[2])**2;if(n<d){d=n;best=q;}}
    return best?.slice()||null;
  }
}
export class FreePlayer{
  constructor(nav){this.nav=nav;this.reset();}
  reset(){this.position=[0,0,8.5];this.yaw=0;this.pitch=0;this.travel=0;this.moving=false;}
  look(dx,dy){this.yaw-=dx*.0025;this.pitch=clamp(this.pitch-dy*.0025,-1.2,1.15);}
  step(dt,keys,actors=[]){
    dt=clamp(dt,0,.05);let forward=Number(keys.has('w'))-Number(keys.has('s')),right=Number(keys.has('d'))-Number(keys.has('a'));
    const magnitude=Math.hypot(forward,right);this.moving=false;if(!magnitude)return;
    forward/=magnitude;right/=magnitude;const speed=keys.has('shift')?5.4:3.5;
    const dx=(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*right)*speed*dt,dz=(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*right)*speed*dt;
    const clear=p=>this.nav.clear(p,.32)&&!actors.some(a=>Math.abs(a[1])<.8&&Math.hypot(p[0]-a[0],p[2]-a[2])<.7);
    const old=this.position.slice(),steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));
    for(let i=0;i<steps;i++){
      const x=[this.position[0]+dx/steps,0,this.position[2]];if(clear(x))this.position=x;
      const z=[this.position[0],0,this.position[2]+dz/steps];if(clear(z))this.position=z;
    }
    const distance=Math.hypot(this.position[0]-old[0],this.position[2]-old[2]);this.travel+=distance;this.moving=distance>.0001;
  }
}
