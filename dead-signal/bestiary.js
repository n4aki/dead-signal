import * as THREE from './vendor/three.module.js';
import { createEnemyModel,animateEnemy,disposeEnemyModel } from './enemy-models.js';
import { ENEMIES,BESTIARY,createBrain,stepBrain } from './enemy-data.js';
import { createLocomotion,stepLocomotion } from './enemy-motion.js';
export function createBestiary() {
  const $=id=>document.getElementById(id), scene=new THREE.Scene();scene.background=new THREE.Color('#102220');
  scene.add(new THREE.HemisphereLight('#e5f4dc','#2d4448',2.8));
  const lamp=new THREE.DirectionalLight('#deecbc',3);lamp.position.set(3,6,4);scene.add(lamp);
  const rim=new THREE.DirectionalLight('#9bdddc',2);rim.position.set(-3,2,-3);scene.add(rim);
  const camera=new THREE.PerspectiveCamera(40,1,.1,40);camera.position.set(0,1.5,7);camera.lookAt(0,1.2,0);
  const display=new THREE.Group();display.position.x=1.25;scene.add(display);
  const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.6,.16,8),new THREE.MeshStandardMaterial({color:'#304a43',roughness:.7}));pedestal.position.set(1.25,-.15,0);scene.add(pedestal);
  let rig=null,open=false,current='normal',motion=null,brain=null,lastTime=null;
  function select(type){
    current=type;if(rig){display.remove(rig.root);disposeEnemyModel(rig);}rig=createEnemyModel(type);display.add(rig.root);
    motion=createLocomotion(type,[[0,0,0],[0,0,10000]]);brain=createBrain(type);lastTime=null;
    const bounds=new THREE.Box3().setFromObject(rig.root),size=bounds.getSize(new THREE.Vector3()),scale=2.45/Math.max(size.x,size.y,size.z);
    rig.root.scale.multiplyScalar(scale);rig.root.position.y=-bounds.min.y*scale+(type==='bat'?.35:0);
    const def=ENEMIES[type];$('enemy-code').textContent=def.code;$('enemy-name').textContent=def.name;$('enemy-description').textContent=def.description;
    $('enemy-stats').textContent=`耐久 ${def.hp}　 /　 移動 ${def.speed.toFixed(1)}　 /　 ${def.role==='boss'?'変異ボス':def.role==='ranged'?'遠距離':def.role==='bomb'?'自爆':def.flight?'飛行':'近接'}`;
    for(const b of $('enemy-select').children)b.setAttribute('aria-pressed',String(b.dataset.type===type));
  }
  for(const type of BESTIARY){const b=document.createElement('button');b.textContent=ENEMIES[type].name;b.dataset.type=type;b.onclick=()=>select(type);$('enemy-select').append(b);}
  const api={
    get isOpen(){return open;},
    open(){open=true;$('menu').hidden=true;$('bestiary').hidden=false;select(current);},
    close(){open=false;$('bestiary').hidden=true;$('menu').hidden=false;},
    render(renderer,time,width,height){
      const dt=lastTime===null?0:Math.min(.05,time-lastTime);lastTime=time;
      const intent=current==='skeleton'?stepBrain(brain,dt,{arrived:true,visible:true,distance:12}):{move:current!=='bomber'};
      stepLocomotion(motion,dt,{move:intent.move,baseSpeed:ENEMIES[current].speed});
      camera.aspect=width/height;camera.updateProjectionMatrix();display.position.x=width<600?0:1.25;pedestal.position.x=display.position.x;camera.position.z=width<600?9:7;
      rig.root.rotation.y=(['wolf','silverfish','spider'].includes(current)?-.85:-.45)+Math.sin(time*.35)*.25;
      animateEnemy(rig,time,{...brain,locomotion:current==='boss'?null:motion,armed:current==='bomber',fuseLeft:1});renderer.render(scene,camera);
    }
  };
  $('open-bestiary').onclick=api.open;$('close-bestiary').onclick=api.close;
  return api;
}
