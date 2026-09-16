import * as THREE from './vendor/three.module.js';
import { box,mat } from './primitives.js';
const ringGeometry=new THREE.RingGeometry(.58,.67,32),markerGeometry=new THREE.ConeGeometry(.16,.28,4);
const cyan=mat('#7fe9e2',{emissive:'#38beb4',emissiveIntensity:1.4,side:THREE.DoubleSide});
const warning=mat('#ffab66',{emissive:'#ff813d',emissiveIntensity:1.8});
export function rescueMarker(){const m=new THREE.Mesh(markerGeometry,warning);m.rotation.z=Math.PI;m.position.y=2.65;m.userData.nonTarget=true;return m;}
export function createSurvivor(){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);const arms=[],legs=[];
  box(body,0,1.12,0,.6,.7,.36,'#347e87');box(body,0,1.45,0,.57,.18,.39,'#6db1ab');
  for(const s of[-1,1]){box(body,s*.2,1.17,.2,.13,.61,.045,'#bed2bd');box(body,s*.2,1.12,.24,.16,.19,.055,'#85a99b');}
  box(body,0,.78,.02,.52,.14,.4,'#293f42');box(body,0,.79,.25,.1,.09,.025,'#b3bfa6');
  const head=new THREE.Group();head.position.set(0,1.79,0);body.add(head);
  box(head,0,0,0,.43,.44,.39,'#c7a282');box(head,0,.21,-.025,.45,.09,.37,'#403b34');box(head,0,.12,-.17,.43,.17,.1,'#403b34');
  for(const s of[-1,1]){box(head,s*.095,.025,.205,.04,.055,.025,'#303d3b');box(head,s*.1,.082,.2,.09,.025,.025,'#5a4c3d');}
  box(head,0,-.06,.224,.06,.08,.05,'#e0b693');box(head,0,-.137,.205,.12,.025,.018,'#7b5c4d');
  for(const s of[-1,1]){
    const arm=new THREE.Group();arm.position.set(s*.39,1.43,0);body.add(arm);arms.push(arm);
    box(arm,0,-.17,0,.21,.35,.24,'#347e87');box(arm,0,-.43,.03,.17,.26,.19,'#c7a282');box(arm,0,-.58,.04,.19,.13,.2,'#d8b391');
    const leg=new THREE.Group();leg.position.set(s*.17,.75,0);body.add(leg);legs.push(leg);
    box(leg,0,-.28,0,.23,.6,.28,'#35474d');box(leg,0,-.64,.075,.27,.16,.4,'#253435');
  }
  // A medical satchel and a cyan cross identify the survivor independently of skin color.
  box(body,.33,.89,-.12,.3,.32,.35,'#c4c9aa');box(body,.34,.9,.064,.18,.065,.03,'#3d898b');box(body,.34,.9,.067,.06,.18,.03,'#3d898b');
  const rifle=new THREE.Group();rifle.position.set(0,-.57,.09);rifle.rotation.x=1.45;arms[1].add(rifle);box(rifle,0,0,.12,.12,.14,.5,'#293f42');box(rifle,0,.015,.46,.065,.075,.23,'#a6bdb3');rifle.visible=false;
  const marker=new THREE.Group();marker.position.y=2.25;root.add(marker);box(marker,0,0,0,.33,.09,.035,cyan,false);box(marker,0,0,0,.09,.33,.035,cyan,false);
  const ring=new THREE.Mesh(ringGeometry,cyan);ring.rotation.x=-Math.PI/2;ring.position.y=.02;root.add(ring);
  return {root,body,arms,legs,rifle,marker,animate(time,phase,supportLeft){
    body.position.y=Math.sin(time*3)*.015;body.rotation.x=phase==='active'?.12:0;
    arms[0].rotation.x=phase==='active'?-2.7+Math.sin(time*7)*.18:-.35;arms[0].rotation.z=phase==='active'?-.25:0;
    arms[1].rotation.x=phase==='saved'&&supportLeft>0?-1.45:-.3;rifle.visible=phase==='saved'&&supportLeft>0;
    const escaping=phase==='failed'||phase==='saved'&&supportLeft===0;legs.forEach((l,i)=>l.rotation.x=escaping?Math.sin(time*8+i*Math.PI)*.35:0);
    marker.position.y=2.25+Math.sin(time*3)*.065;
  }};
}
