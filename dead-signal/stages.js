import * as THREE from './vendor/three.module.js';
import { STAGES as AREAS } from './stage-data.js';
import { SPAWN_SITES } from './spawn-data.js';
import { detailStage } from './environment-art.js';

export function buildStages(scene, { box, orb, mat, sign }) {
  const groups = [], covers = [];
  for (let index = 0; index < AREAS.length; index++) {
    const area = AREAS[index], layout=area.layout??index, root = new THREE.Group(), blockers = [];
    root.position.fromArray(area.origin); root.rotation.y = area.yaw; root.visible = index === 0; scene.add(root); groups.push(root); covers.push(blockers);
    const block = (x,y,z,w,h,d,color,solid = true) => { const m = box(root,x,y,z,w,h,d,color); if (solid) { m.userData.cover = true; blockers.push(m); } return m; };
    const label = (text, color, x,y,z,w=4,h=.8) => { const s = sign(text,color,w,h); s.position.set(x,y,z); root.add(s); return s; };
    const glow = color => mat(color, { emissive: color, emissiveIntensity: 2 });
    const stripe = (x,z,width=3) => { for(let i=0;i<8;i++) block(x-width/2+i*width/8,.015,z,width/16,.015,.65,i%2?'#26312b':'#b8ad60',false); };
    const crate = (x,z,w=2,h=2) => {
      block(x,h/2,z,w,h,1.9,'#5c6250');
      for(const xx of [-.36,.36]) block(x+xx*w,h/2,z+ .97,.11,h,.04,'#879077',false);
      block(x,h*.55,z+ .99,w,.12,.04,'#929076',false);
    };
    const lamp = (x,z,color='#dce6b0') => { block(x,2.7,z,.1,5.4,.1,'#4e6256'); block(x,5.35,z,.8,.12,.5,glow(color),false); };
    const backCity = (roof=false) => {
      for(const side of [-1,1]) for(let i=0;i<7;i++) {
        const h=9+(i*7%5)*3, x=side*(roof?18+i%3*3:11), z=5-i*9;
        block(x,roof?h/2-15:h/2,z,6,h,8,i%2?'#2b403b':'#303d39');
        for(let row=0;row<4;row++) for(let col=0;col<3;col++) {
          if(roof) block(x-2+col*1.8,roof?h-17-row*2.3:4+row*2.3,z+4.02,.65,1.1,.025,(row+col+i)%5===0?glow('#858367'):'#182f2b',false);
          else block(side*7.98,4+row*2.5,z-2.5+col*2.4,.025,1.15,.7,(row+col+i)%6===0?glow('#8f956f'):'#122c28',false);
        }
      }
    };

    if(layout === 0) {
      block(0,-.16,-18,20,.3,75,'#283a33'); backCity();
      for(const s of [-1,1]) { block(s*7.2,.12,-16,1.2,.24,65,'#536455'); for(let z=0;z>-45;z-=14) lamp(s*6.7,z); }
      for(let z=8;z>-45;z-=6) block(0,.012,z,.14,.02,2.6,'#b5b473',false);
      label(index===5?'EVACUATION AVENUE':'QUARANTINE / 07','#d1e3a0',0,6,-31,10,1.6);
      for(const x of [-5.6,5.6]) block(x,3,-31,.2,6,.2,'#718470');
      label('EVACUATE','#f0a476',6,3.6,-11,3.5,.9);
      block(-5,.64,-13,2.3,.8,4.5,'#48645a'); block(-5,1.27,-13.4,2,.6,2.1,'#263f39');
      block(-5,1.29,-12.33,1.75,.42,.04,'#698e82',false);
      for(const x of [-6.05,-3.95]) for(const z of [-14.5,-11.5]) orb(root,x,.36,z,.24,.38,.38,'#15251e');
      for(const [x,z] of [[4.8,-22],[-4,1]]) { block(x,.65,z,2.7,1.3,.85,'#67735b'); stripe(x,z+.45,2.6); }
      crate(5,-30,2,2.7);
      if(index===5){
        label('HOSPITAL ←','#a9e2cf',-6,4.2,-18,3.1,.8);
        for(const side of[-1,1])for(let z=-6;z>-38;z-=10){
          block(side*7.5,3.3,z,.6,.12,4,side<0?'#946d48':'#556b67',false);
          label(side<0?'MARKET':'ARCADE',side<0?'#ffc483':'#a8d4c6',side*7,4.2,z,1.7,.6);
          for(let j=0;j<3;j++)block(side*7.97,2.1,z-1+j,.03,1.7,.7,glow('#8f8561'),false);
        }
        for(let z=-2;z>-35;z-=6)for(const x of[-1.2,1.2])block(x,.023,z,.085,.02,2.6,'#d4be7f',false);
      }
    }
    if(index === 1) {
      block(0,-.12,-12,10,.24,60,'#263740');
      for(const s of [-1,1]) {
        block(s*4.7,5,-13,.5,10,52,'#3a4650'); block(s*4.38,.8,-13,.08,.16,52,'#5c6e76',false);
        for(let z=2;z>-35;z-=7) { block(s*4.32,4,z,.35,1.4,1.8,'#26353b'); block(s*4.1,4,z,.08,.8,1.3,'#56696b',false); }
        block(s*4.35,3,-15,.12,.12,43,'#708284',false);
      }
      for(let z=-7;z>-33;z-=10) block(0,6.8,z,9,.08,.07,'#2b353d',false);
      block(-2.8,1.2,-15,2.6,2.4,4,'#3d605c'); block(-2.8,2.47,-15,2.8,.14,4.1,'#728877');
      crate(3,-18,2.4,2.6); crate(-3,4,2.5,.8);
      label('NO THROUGH ROAD','#e0ae77',0,3.3,-34,6,1.1);
      label('HOSPITAL →','#86d9d0',2.8,2.8,-9,2.2,.65);
      block(0,2,-36,9,4,.3,'#263338');
      lamp(-4,-4,'#a6d2e4'); lamp(4,-24,'#a6d2e4');
      for(let i=0;i<8;i++) block(-3.3+i*.12,.016,-3,.035,.02,3,'#728d91',false);
    }
    if(index === 2) {
      block(0,-.15,-10,17,.3,50,'#7a9390');
      for(let x=-8;x<=8;x+=2) block(x,.009,-10,.025,.02,49,'#3d6264',false);
      for(let z=14;z>=-34;z-=2) block(0,.01,z,16,.02,.025,'#3d6264',false);
      for(const s of [-1,1]) {
        block(s*8.2,2.5,-11,.35,5,50,'#58777a'); block(s*8.0,1.1,-11,.04,.16,50,'#9bb2a7',false);
        for(let z=-2;z>-24;z-=8) {
          block(s*7.9,2,z,.04,1.3,2.5,'#1e4855',false);
          block(s*6.8,.75,z,1.4,.16,2.3,'#456364');
          for(const dx of[-.55,.55])for(const dz of[-.95,.95])block(s*6.8+dx,.39,z+dz,.065,.62,.065,'#9eafaa');
        }
      }
      block(0,5.1,-11,17,.24,50,'#385054');
      for(let z=4;z>-30;z-=7) { block(0,4.95,z,3,.08,.4,glow('#b5eeec'),false); block(0,4.85,z+1,16,.18,.15,'#6a8680',false); }
      for(const [x,w] of [[-7,2],[-2.5,3],[2.5,3],[7,2]]) block(x,2.2,-26,w,4.4,.35,'#6b8681');
      block(0,4.65,-26,16,.7,.35,'#77948c'); block(0,2.5,-34,17,5,.35,'#243e44');
      for(const [x,text] of [[-5,'WARD A'],[0,'SURGERY'],[5,'WARD B']]) { label(text,'#a7e6dc',x,3.8,-25.79,1.9,.45); block(x,2,-31,1.9,4,.25,'#183239'); }
      block(0,.7,-12,5.5,1.4,2,'#668a86'); block(0,1.47,-12,5.8,.14,2.2,'#bbc4ab');
      block(.7,1.9,-12,.85,.75,.14,'#243f46'); block(.7,1.94,-11.92,.68,.48,.02,glow('#497d7d'),false);
      label('+ EMERGENCY','#baf6e0',0,3.7,-22,5,1);
      label('RECEPTION','#d6e9c7',0,.75,-10.98,3.6,.5);
      for(const x of [-4,4]) { block(x,1.6,-18,1.4,3.2,3,'#487175'); block(x,3.3,-18,1.5,.12,3.2,'#96aca0',false); }
      // Door frame at the camera entrance makes the move into the building legible.
      for(const x of [-5.7,5.7]) block(x,2.5,10,4.3,5,.3,'#455e62');
      block(0,4.6,10,7.1,.8,.3,'#567475');
    }
    if(index === 3) {
      block(0,-.15,-13,23,.3,56,'#514b3d');
      for(const s of [-1,1]) { block(s*11.3,4.7,-13,.4,9.4,56,'#464b43'); for(let z=8;z>-40;z-=8) block(s*10.9,4.5,z,.4,9,.4,'#8c7851'); }
      block(0,9.5,-13,23,.25,56,'#343c36');
      for(let z=5;z>-36;z-=8) { block(0,8.7,z,22,.35,.3,'#82734e'); block(0,8.35,z,2,.12,.6,glow('#ffe0a0'),false); }
      for(const s of [-1,1]) {
        block(s*6,2,-19,5,4,12,s<0?'#486d67':'#817048');
        for(let x=-1.9;x<=2;x+=.45) block(s*6+x,2,-12.97,.09,3.8,.04,'#a29972',false);
        label(s<0?'FREIGHT 04':'DANGER','#e1ce8b',s*6,2.8,-12.92,3,.7);
      }
      crate(0,-24,3,2.8); crate(-8,-32,3,4); crate(8,-32,3,3);
      // Loading dock and an actual stepped approach for the enemies.
      block(0,.7,8,20,1.4,8,'#766b51');
      for(let i=0;i<6;i++) block(0,(i+1)*.125,i*.65+.3,3.6,(i+1)*.25,.65,'#9b8b65');
      for(const s of [-1,1]) { block(s*6.7,2.1,4.1,6.5,.1,.1,'#c8ac6c'); for(let x=3.5;x<10;x+=2) block(s*x,1.7,4.1,.1,1.2,.1,'#b39c65'); }
      label('LOADING BAY / 04','#ffda8e',0,5,-34,9,1.4); block(0,3.7,-38,22,7.4,.4,'#3e4d44');
      for(const x of [-2.5,2.5]) stripe(x,-7,1.2);
    }
    if(index === 4) {
      block(0,-.22,-10,24,.44,49,'#4c5149'); backCity(true);
      for(const s of [-1,1]) block(s*11.8,.55,-10,.4,1.1,49,'#868773');
      block(0,.55,-34.3,24,1.1,.4,'#868773');
      // Raised helipad markings and an open sky distinguish this finale from the street.
      const ring = new THREE.Mesh(new THREE.RingGeometry(5.7,5.95,64),mat('#c9c39b'));
      ring.rotation.x=-Math.PI/2; ring.position.set(0,.015,-5); root.add(ring);
      for(const x of [-1.6,1.6]) block(x,.025,-5,.35,.025,5,'#d2c7a0',false); block(0,.025,-5,3.5,.025,.35,'#d2c7a0',false);
      for(const x of [-5.5,5.5]) {
        block(x,1.45,-13,3,2.9,5,'#768277');
        for(let j=0;j<7;j++) block(x, .4+j*.32,-10.46,2.5,.1,.04,'#354b45',false);
        orb(root,x,3,-13,1,.12,1,'#2c403a');
      }
      for(const x of [-4.9,4.9]) block(x,2.8,-27,5.8,5.6,4,'#5c655e');
      block(0,5,-27,4,1.2,4,'#656e63'); block(0,2.6,-31,4,5.2,.3,'#1e302d');
      label('ISOLATION / KEEP OUT','#ffb095',0,4.4,-24.96,6,1);
      for(const x of [-9.5,9.5]) for(let z=7;z>-33;z-=7) { block(x,.3,z,.3,.6,.3,'#6c6e5f'); block(x,.65,z,.22,.14,.22,glow('#ff8466'),false); }
      block(8,6,-28,.14,12,.14,'#9e9682'); block(8,10.5,-28,3.5,.1,.1,'#948974');
    }
    for(const entry of SPAWN_SITES[index]){
      const [x,y,z]=entry.path[0];
      if(entry.kind==='concealed'){
        const [cx,cy,cz]=entry.cover.position,theme=entry.cover.theme;
        if(theme==='van'){
          block(cx,cy+1.35,cz,1.9,2.3,1.8,'#4d645b');
          block(cx,cy+1.94,cz+.92,1.55,.55,.04,'#233b3a',false);
          block(cx,cy+.53,cz+.94,1.8,.16,.1,'#899087',false);
          for(const s of[-1,1]){block(cx+s*.63,cy+.95,cz+.94,.3,.18,.06,'#afb6a0',false);orb(root,cx+s*.92,cy+.38,cz,.17,.36,.36,'#1c2a26');}
        }else if(theme==='medical'){
          block(cx,cy+1.22,cz,1.8,2.44,1.5,'#6b8684');
          for(let row=0;row<4;row++){block(cx,cy+.35+row*.5,cz+.765,1.65,.025,.025,'#314e50',false);block(cx,cy+.5+row*.5,cz+.8,.35,.06,.06,'#c0c8b4',false);}
          block(cx,cy+2.5,cz-.15,1.2,.12,1.1,'#c2c8b0',false);
          for(const s of[-1,1])orb(root,cx+s*.65,cy+.1,cz+.5,.1,.1,.1,'#233b3a');
        }else if(theme==='aircon'||theme==='dumpster'){
          const c=theme==='aircon'?'#77857b':'#43635d';
          block(cx,cy+1.2,cz,1.8,2.4,1.6,c);block(cx,cy+2.45,cz,1.94,.1,1.72,'#92998a');
          for(let row=0;row<7;row++)block(cx,cy+.4+row*.23,cz+.815,1.4,.055,.025,'#2d4542',false);
          if(theme==='aircon')orb(root,cx,cy+2.55,cz,.58,.07,.58,'#344b46');
        }else{
          block(cx,cy+.08,cz,2,.16,1.8,'#887b59');
          block(cx,cy+.75,cz,1.8,1.35,1.6,'#66664e');
          block(cx-.08,cy+1.95,cz,1.65,1.05,1.45,'#8a8061');
          for(const s of[-1,1])block(cx+s*.53,cy+1.3,cz+.82,.085,2.45,.04,'#b1a382',false);
          block(cx,cy+1,cz+.83,1.75,.1,.04,'#a49572',false);
        }
      }
      if(entry.kind==='drain'){
        block(x,y+.015,z,1.15,.025,1.1,'#101b1c',false);
        for(const s of[-1,1]){block(x+s*.63,y+.04,z,.1,.08,1.4,'#859087',false);block(x,y+.04,z+s*.65,1.35,.08,.1,'#859087',false);}
        const lid=block(x+.95,y+.12,z,.8,.1,1.1,'#657a72',false);lid.rotation.z=.2;
      }
      if(entry.kind==='perch'){
        block(x,y-.12,z,2,.24,1.5,'#607468');
        for(const s of[-1,1])block(x+s*.95,y+.35,z,.08,.7,1.4,'#8c9c81',false);
        label('HIGH GROUND','#e8c691',x,y-.38,z+.8,1.8,.3);
      }
      if(entry.kind==='web'){
        block(x,y+.7,z-.3,.025,1.4,.025,'#b0bbb0',false);
        for(let i=0;i<4;i++){const thread=block(x,y+.6,z-.28,1.2,.018,.018,'#9caeaa',false);thread.rotation.z=i*Math.PI/4;}
      }
    }
    detailStage(root,index,{sign});
  }
  return { groups, covers, show(index) { groups.forEach((g,i)=>{g.visible=i===index;}); } };
}
