import * as THREE from './vendor/three.module.js';
import { unitBox } from './primitives.js';
// Hundreds of fragments share a single draw call, even during a grenade multi-kill.
export function createCombatFx(scene){
  const capacity=320,fragments=[],dummy=new THREE.Object3D(),color=new THREE.Color();
  const mesh=new THREE.InstancedMesh(unitBox,new THREE.MeshStandardMaterial({roughness:.8,emissive:'#273519',emissiveIntensity:.35}),capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;scene.add(mesh);
  const beams=Array.from({length:10},()=>{
    const root=new THREE.Mesh(unitBox,new THREE.MeshBasicMaterial({color:'#ffe4a0',transparent:true,opacity:.65,depthWrite:false}));root.visible=false;scene.add(root);return {root,life:0};
  });let beamIndex=0;
  function burst(position,tint,count=12,force=3,size=.07){
    for(let i=0;i<count;i++){
      if(fragments.length>=capacity)fragments.shift();
      fragments.push({position:position.clone(),velocity:new THREE.Vector3((Math.random()-.5)*force,Math.random()*force*.7,(Math.random()-.5)*force),size:size*(.5+Math.random()),life:.45+Math.random()*.45,tint,spin:Math.random()*6});
    }
  }
  return {
    burst,
    tracer(from,to){const b=beams[beamIndex++%beams.length],d=from.distanceTo(to);b.root.position.copy(from).lerp(to,.5);b.root.lookAt(to);b.root.scale.set(.016,.016,d);b.root.visible=true;b.life=.055;},
    update(dt){
      for(let i=fragments.length-1;i>=0;i--){const p=fragments[i];p.life-=dt;if(p.life<=0){fragments.splice(i,1);continue;}p.velocity.y-=dt*9;p.position.addScaledVector(p.velocity,dt);p.spin+=dt*8;}
      fragments.forEach((p,i)=>{dummy.position.copy(p.position);dummy.rotation.set(p.spin,p.spin*.7,0);dummy.scale.setScalar(p.size*Math.min(1,p.life*6));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,color.set(p.tint));});
      mesh.count=fragments.length;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      for(const b of beams){b.life=Math.max(0,b.life-dt);b.root.visible=b.life>0;}
    },
    clear(){fragments.length=0;mesh.count=0;for(const b of beams){b.life=0;b.root.visible=false;}}
  };
}
