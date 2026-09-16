import * as THREE from './vendor/three.module.js';
import { SPAWN_SITES } from './spawn-data.js';

// Generated once, without DOM or downloads. UVs are measured in metres so a
// tall wall and a small crate retain the same surface grain.
const textures = new Map(), materials = new Map();
function surfaceTexture(kind) {
  if (textures.has(kind)) return textures.get(kind);
  const size=128, data=new Uint8Array(size*size*4);
  const noise=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const grain=noise(x,y), cloud=Math.sin(x*.12)*Math.sin(y*.09);
    let value=185+grain*48+cloud*10;
    if(kind==='brick'){
      const row=Math.floor(y/16),xx=(x+(row%2)*32)%64;
      value=y%16<2||xx<2?105:165+grain*35+noise(Math.floor(xx/64),row)*35;
    }else if(kind==='asphalt') value=115+grain*80+(grain>.95?35:0)+cloud*12;
    else if(kind==='metal') value=192+grain*25-((x%32<2)?25:0);
    else if(kind==='wood') value=162+Math.sin(x*.7+Math.sin(y*.05)*2)*24+grain*25-(x%32<2?45:0);
    else if(kind==='tile') value=x%64<2||y%64<2?115:215+grain*15;
    const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=Math.max(0,Math.min(255,value));data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;textures.set(kind,texture);return texture;
}
function surface(kind,color='#ffffff',vertexColors=false){
  const key=`${kind}/${color}/${vertexColors}`;
  if(!materials.has(key)){
    const map=surfaceTexture(kind);
    materials.set(key,new THREE.MeshStandardMaterial({color,vertexColors,map,bumpMap:map,
      bumpScale:kind==='brick'?.07:kind==='metal'?.012:.035,
      roughness:kind==='metal'?.48:kind==='tile'?.35:.91,metalness:kind==='metal'?.4:0}));
  }
  return materials.get(key);
}
function metricUV(geometry,scale=new THREE.Vector3(1,1,1)){
  const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i)*scale.x,y=p.getY(i)*scale.y,z=p.getZ(i)*scale.z;
    if(Math.abs(n.getY(i))>.5)uv.setXY(i,x*.5,z*.5);
    else if(Math.abs(n.getX(i))>.5)uv.setXY(i,z*.5,y*.5);
    else uv.setXY(i,x*.5,y*.5);
  }
  return geometry;
}

// Bake the many small bolts, frames and rails into a handful of meshes. Cover
// meshes stay separate so the existing shot occlusion and route checks work.
function sceneryBuilder(root,sign){
  const staging=new THREE.Group(), buckets=new Map();
  const flat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.65});
  const lit=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});
  const glass=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.13,metalness:.55});
  const palette={flat,lit,glass};
  const material=kind=>palette[kind]||surface(kind,'#ffffff',true);
  function mesh(parent,geometry,color,kind='flat'){
    const m=new THREE.Mesh(geometry,material(kind));m.userData.tint=new THREE.Color(color);parent.add(m);return m;
  }
  function b(parent,x,y,z,w,h,d,color,kind='flat'){
    const g=metricUV(new THREE.BoxGeometry(w,h,d));const m=mesh(parent,g,color,kind);m.position.set(x,y,z);return m;
  }
  function cylinder(parent,x,y,z,r,h,color,axis='y',kind='metal',segments=12){
    const m=mesh(parent,new THREE.CylinderGeometry(r,r,h,segments),color,kind);m.position.set(x,y,z);
    if(axis==='x')m.rotation.z=Math.PI/2;if(axis==='z')m.rotation.x=Math.PI/2;return m;
  }
  function rod(parent,a,bp,r,color,kind='metal'){
    const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...bp),delta=bv.sub(av);
    const m=cylinder(parent,...av.clone().addScaledVector(delta,.5).toArray(),r,delta.length(),color,'y',kind,6);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;
  }
  function group(x=0,y=0,z=0,angle=0){const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=angle;staging.add(g);return g;}
  function text(parent,word,x,y,z,w,h,color='#cbdad6'){
    const m=sign(word,color,w,h);m.position.set(x,y,z);parent.add(m);m.userData.keep=true;return m;
  }
  function finish(){
    staging.updateMatrixWorld(true);
    const retained=[];
    staging.traverse(m=>{
      if(m.userData.keep){retained.push(m);return;}if(!m.isMesh||!m.userData.tint)return;
      const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(m.matrixWorld);
      const list=buckets.get(m.material)||[];list.push({g,tint:m.userData.tint});buckets.set(m.material,list);
      m.geometry.dispose();
    });
    for(const m of retained){m.matrixWorld.decompose(m.position,m.quaternion,m.scale);root.add(m);}
    for(const [mat,parts] of buckets){
      const count=parts.reduce((n,p)=>n+p.g.attributes.position.count,0),geometry=new THREE.BufferGeometry();
      for(const [name,size] of [['position',3],['normal',3],['uv',2],['color',3]]){
        const array=new Float32Array(count*size);let offset=0;
        for(const {g,tint} of parts){
          if(name==='color'){for(let i=0;i<g.attributes.position.count;i++){array[offset++]=tint.r;array[offset++]=tint.g;array[offset++]=tint.b;}}
          else{array.set(g.attributes[name].array,offset);offset+=g.attributes[name].array.length;}
        }
        geometry.setAttribute(name,new THREE.BufferAttribute(array,size));
      }
      geometry.computeBoundingSphere();const m=new THREE.Mesh(geometry,mat);m.castShadow=mat!==lit;m.receiveShadow=true;
      m.name='Baked environment detail';root.add(m);for(const {g} of parts)g.dispose();
    }
  }
  return {staging,b,cylinder,rod,group,text,mesh,finish};
}

export function detailStage(root,index,{sign}){
  const layout=index===5?0:index;
  // Existing physical silhouettes and blocker transforms are retained.
  for(const m of root.children){
    if(!m.isMesh||!m.userData.cover||!m.geometry.attributes.normal)continue;
    const {x:w,y:h,z:d}=m.scale;
    const kind=m.position.y<0?(layout===2?'tile':layout===0?'asphalt':'concrete'):
      h>7?(layout===3?'metal':'brick'):w>10||d>30?'concrete':layout===2?'metal':'concrete';
    const color=m.position.y<0?['#505a62','#556772','#a4b5ac','#797b73','#7d8682'][layout]:
      h>7?(layout===3?'#747a71':layout===1?'#657581':index===5?'#918578':'#768287'):
      layout===2&&d>30?'#8ca8a6':`#${m.material.color.getHexString()}`;
    m.geometry=metricUV(m.geometry.clone(),m.scale);m.material=surface(kind,color);
  }
  const art=sceneryBuilder(root,sign),{b,cylinder,rod,group,text,mesh}=art;
  const g=art.staging;
  const bolt=(p,x,y,z)=>cylinder(p,x,y,z,.035,.025,'#b4b5a7','z','metal',6);
  const frame=(p,x,y,z,w,h,c='#5a686b')=>{
    for(const s of[-1,1]){b(p,x+s*w/2,y,z,.08,h,.1,c,'metal');b(p,x,y+s*h/2,z,w,.08,.1,c,'metal');}
  };
  const vent=(p,x,y,z,w,h)=>{
    b(p,x,y,z,w,h,.035,'#19282d');frame(p,x,y,z+.04,w,h);
    for(let yy=-h/2+.1;yy<h/2;yy+=.16)b(p,x,y+yy,z+.07,w-.1,.045,.08,'#7c8885','metal');
  };
  const fan=(p,x,y,z,r,axis='z')=>{
    const f=new THREE.Group();p.add(f);f.position.set(x,y,z);if(axis==='y')f.rotation.x=-Math.PI/2;
    cylinder(f,0,0,0,r,.08,'#172a30','z');
    for(let k=0;k<5;k++){const blade=b(f,0,0,.055,r*1.65,.16,.025,'#778a8a','metal');blade.rotation.z=k*Math.PI/5;}
    for(const radius of[r*.55,r*.93])mesh(f,new THREE.TorusGeometry(radius,.018,4,24),'#a4aeab','metal').position.z=.11;
    cylinder(f,0,0,.13,.1,.1,'#b9b8a1','z');
  };
  function crate(p,x,y,z,w,h,d){
    // Thin boards wrap the existing solid crate, with braces, corner hardware and labels.
    for(const side of[-1,1]){
      b(p,x+side*(w/2+.012),y+h/2,z,.025,h,d,'#8f7958','wood');
      b(p,x,y+h/2,z+side*(d/2+.018),w,h,.025,'#9d8760','wood');
      for(const xx of[-1,1])b(p,x+xx*w*.42,y+h/2,z+side*(d/2+.04),.1,h,.045,'#474c48','metal');
      for(const yy of[.1,h-.1])b(p,x,y+yy,z+side*(d/2+.07),w,.12,.06,'#b29b70','wood');
    }
    b(p,x,y+h+.012,z,w,.025,d,'#9b855b','wood');
    const brace=b(p,x,y+h/2,z+d/2+.06,w*.85,.085,.055,'#c0a274','wood');brace.rotation.z=Math.atan2(h*.6,w*.85);
    text(p,'SUPPLY / 07',x,y+h*.7,z+d/2+.1,w*.5,.23,'#e2d6ac');
  }
  function puddle(x,z,w,d){
    const geometry=new THREE.CircleGeometry(1,24),pos=geometry.attributes.position;
    for(let i=1;i<pos.count;i++){const r=.8+Math.sin(i*2.39)*.17;pos.setXYZ(i,pos.getX(i)*r,pos.getY(i)*r,0);}
    const m=mesh(g,geometry,layout===1?'#314c60':'#3e555c','glass');m.rotation.x=-Math.PI/2;m.position.set(x,.027,z);m.scale.set(w,d,1);
  }
  function facade(side,z,height,roof=false,innerFace=false){
    const buildingIndex=Math.round((5-z)/9),span=roof&&!innerFace?6:8;
    const f=roof?(innerFace?group(side*(18+buildingIndex%3*3-3.025),-15,z,-side*Math.PI/2):group(side*(18+buildingIndex%3*3),-15,z+4.025)):group(side*7.975,0,z,-side*Math.PI/2);
    const wallcolor=index===5?'#b6a28d':'#939b93';
    for(let y=3;y<height;y+=2.5){
      b(f,0,y,0,span,.14,.18,wallcolor,'concrete');
      for(const x of(roof?[-1.8,0,1.8]:[-2.5,0,2.5])){
        b(f,x,y+1.1,.035,1.4,1.75,.035,'#192d3b','glass');
        frame(f,x,y+1.1,.095,1.4,1.75,'#65797b');
        b(f,x,y+1.1,.17,.055,1.7,.055,'#929e9a','metal');
        b(f,x,y+.21,.13,1.65,.13,.33,'#a5aaa0','concrete');
        if((Math.round(z)+x+y)%3===0)b(f,x,y+1.15,.063,1.24,1.52,.02,'#9b8859','lit');
      }
    }
    for(const x of[-span/2+.15,span/2-.15])b(f,x,height/2,.07,.27,height,.3,'#7d8a86','concrete');
    b(f,0,height,.1,span+.3,.32,.5,'#a6aaa1','concrete');
    if(roof)return;
    b(f,0,1.5,.025,7.4,2.7,.035,'#1b2930','glass');
    for(const x of[-3.5,-1.2,1.2,3.5])b(f,x,1.4,.12,.12,2.8,.12,'#778783','metal');
    if(Math.abs(z)%2){
      for(let y=.4;y<2.5;y+=.16)b(f,0,y,.16,6.9,.08,.07,'#697773','metal');
    }else{
      for(const x of[-2.3,2.3]){b(f,x,1.05,.065,2.1,.05,.03,'#d29b68','lit');b(f,x,2.4,.065,2.1,.07,.03,'#82b3b8','lit');}
    }
    b(f,0,3.02,.18,7.5,.5,.32,index===5?'#634858':'#304d54','metal');
    text(f,index===5?(side<0?'NIGHT MARKET':'ORBIT ARCADE'):(side<0?'NORTH PHARMACY':'METRO / 07'),0,3.02,.36,5.8,.34,index===5?'#ffd09b':'#99d2d8');
    // A restrained striped awning stays above ground enemy silhouettes.
    if(index===5)for(let j=0;j<14;j++){const a=b(f,-3.2+j*.49,2.67,.53,.47,.09,.86,j%2?'#b49e7d':'#784d51','wood');a.rotation.x=.12;}
  }

  if(layout===0){
    for(const side of[-1,1]){
      for(let i=0;i<7;i++)facade(side,5-i*9,9+(i*7%5)*3);
      for(let z=12;z>-46;z-=2){
        b(g,side*6.62,.13,z,.14,.16,1.94,z%6===0?'#b9b5a1':'#637478','concrete');
        b(g,side*7.22,.247,z,1.08,.008,.023,'#354b50');
      }
      for(let z=0;z>-44;z-=14){
        cylinder(g,side*6.7,.16,z,.23,.3,'#57656a');
        rod(g,[side*6.7,5.1,z],[side*6.15,5.5,z],.06,'#8d9b99');
        b(g,side*6.35,5.4,z,.65,.22,.62,'#657976','metal');
      }
      for(let z=-4;z>-40;z-=9){
        b(g,side*6.45,.022,z,.35,.022,1.2,'#151f26');
        for(let j=0;j<7;j++)b(g,side*6.45,.038,z-.5+j*.16,.36,.025,.055,'#6e7e81','metal');
      }
    }
    // Front faces of concrete roadblocks, including diagonal hazard paint.
    for(const [x,z] of[[4.8,-22],[-4,1]]){
      b(g,x,.65,z+.431,2.64,.68,.02,'#232e31');
      for(let j=0;j<7;j++){const strip=b(g,x-1.13+j*.37,.65,z+.447,.15,.71,.018,'#d7af51');strip.rotation.z=-.36;}
      for(const s of[-1,1]){bolt(g,x+s*1.18,1.17,z+.45);b(g,x+s*.9,1.33,z,.18,.07,.24,'#d9b56d','lit');}
    }
    crate(g,5,0,-30,2,2.7,1.9);
    // Bodywork, wheels, lamp clusters and glazing turn the simple car silhouette into a vehicle.
    for(const s of[-1,1]){
      for(const z of[-14.5,-11.5]){cylinder(g,-5+s*1.12,.38,z,.4,.2,'#19242c','x','flat',16);cylinder(g,-5+s*1.235,.38,z,.22,.025,'#9ba8a5','x');}
      b(g,-5+s*1.01,1.3,-13.4,.035,.45,1.72,'#324e60','glass');
      b(g,-5+s*1.04,1.28,-13.35,.04,.53,.085,'#91a7a5','metal');
      b(g,-5+s*.76,.85,-10.73,.38,.22,.06,'#d1b779','lit');
      b(g,-5+s*.84,.78,-15.28,.22,.14,.04,'#a95645','lit');
      b(g,-5+s*1.17,.68,-13,.055,.035,3.2,'#aab4ad','metal');
    }
    b(g,-5,.49,-10.69,2.22,.16,.12,'#9da9a4','metal');b(g,-5,.83,-10.71,.9,.25,.035,'#14232a');
    for(let j=0;j<6;j++)b(g,-5.36+j*.14,.83,-10.68,.03,.22,.025,'#afb2a8','metal');
    b(g,-5,1.07,-11.6,2.1,.025,1.3,'#6c8687','metal');
    frame(g,-5,1.29,-12.30,1.8,.47);text(g,'DS-070',-5,.52,-10.615,.58,.13);
    for(const x of[-5.6,5.6]){b(g,x,5.04,-31,.55,.12,.7,'#6e8181','metal');for(let y=.6;y<5.4;y+=.5)b(g,x,y,-30.87,.32,.06,.07,'#a7b3ab','metal');}
    for(let x=-5.4;x<5.4;x+=1.1){rod(g,[x,5.5,-31],[x+1.1,6.6,-31],.04,'#8a9b95');rod(g,[x,6.6,-31],[x+1.1,5.5,-31],.04,'#8a9b95');}
    for(const [x,z,w,d] of[[-2,3,1.5,.45],[3,-8,1.1,2],[-4,-25,1.4,.7],[1,-17,1.6,.6]])puddle(x,z,w,d);
  }

  if(index===1){
    for(const side of[-1,1]){
      const wall=group(side*4.43,0,-13,-side*Math.PI/2);
      for(let u=-23;u<25;u+=5){
        b(wall,u,2.4,.015,.24,4.8,.13,'#68787e','concrete');
        b(wall,u+2.1,1.6,.025,1.65,2,.035,'#35474a','metal');
        vent(wall,u+2.1,1.9,.05,1.25,.75);
        for(const y of[4.8,7.4]){b(wall,u+1.8,y,.12,2,1.8,.1,'#142a38','glass');frame(wall,u+1.8,y,.22,2,1.8);}
        rod(wall,[u+.3,.2,.17],[u+.3,9,.17],.065,'#897867');
        for(let y=1;y<9;y+=2)b(wall,u+.3,y,.2,.3,.09,.16,'#9a9990','metal');
      }
      // Fire escape balconies and ladders, high above the playable passage.
      for(const z of[-5,-20]){
        b(g,side*3.9,5.8,z,.95,.13,4.2,'#637882','metal');
        for(let zz=z-2;zz<=z+2;zz+=.5)rod(g,[side*3.47,5.8,zz],[side*3.47,6.75,zz],.024,'#82969c');
        rod(g,[side*3.47,6.75,z-2],[side*3.47,6.75,z+2],.04,'#93a3a4');
        for(const zz of[z-.35,z+.35])rod(g,[side*4.16,5.8,zz],[side*4.16,9,zz],.035,'#90a0a0');
        for(let y=6;y<9;y+=.28)rod(g,[side*4.16,y,z-.35],[side*4.16,y,z+.35],.025,'#90a0a0');
      }
      text(wall,'RESTRICTED / SERVICE ACCESS',10,3.45,.14,3.5,.42,'#dcac73');
    }
    for(let z=-7;z>-34;z-=10)for(let j=0;j<12;j++)rod(g,[-4.4+j*.74,6.8-Math.sin(j/12*Math.PI)*.65,z],[-4.4+(j+1)*.74,6.8-Math.sin((j+1)/12*Math.PI)*.65,z],.016,'#101d29','flat');
    for(const s of[-1,1]){b(g,-2.8+s*1.24,1.25,-12.97,.12,2.2,.07,'#89a19b','metal');cylinder(g,-2.8+s*.9,.2,-13.5,.19,.16,'#1e2e35','x');}
    for(let x=-3.9;x<-1.6;x+=.3)b(g,x,1.2,-12.96,.045,1.8,.055,'#739287','metal');
    text(g,'CITY WASTE',-2.8,1.5,-12.88,1.65,.28,'#c3ceb3');
    crate(g,3,0,-18,2.4,2.6,1.9);crate(g,-3,0,4,2.5,.8,1.9);
    puddle(-.9,1,1.8,.8);puddle(1.5,-13,1.1,2);puddle(-2,-28,1,.7);
  }

  if(index===2){
    for(const side of[-1,1]){
      const wall=group(side*7.98,0,-11,-side*Math.PI/2);
      b(wall,0,.25,.015,49,.18,.06,'#29464e','metal');b(wall,0,1.5,.012,49,.5,.02,'#c2ccc0');
      for(let z=-2;z>-24;z-=8){
        const x=side*6.8;
        b(g,x,.94,z,1.31,.12,2.18,'#c2d7cf');b(g,x,1.02,z-.68,1.16,.17,.57,'#e5e3cb');
        b(g,x,1.04,z+.32,1.2,.06,1.15,'#6b969e');
        for(const s of[-1,1]){
          b(g,x+s*.58,1.23,z,.045,.055,1.9,'#b0c6c4','metal');
          for(const zz of[-.9,.9]){rod(g,[x+s*.58,.65,z+zz],[x+s*.58,1.26,z+zz],.025,'#b0c6c4');cylinder(g,x+s*.53,.12,z+zz,.12,.06,'#273c43','x');}
        }
        rod(g,[x+side*.5,.15,z-.88],[x+side*.5,2.35,z-.88],.025,'#b9ccc6');
        rod(g,[x+side*.5,2.33,z-.88],[x+side*.18,2.33,z-.88],.024,'#b9ccc6');
        b(g,x+side*.2,2.1,z-.88,.17,.28,.09,'#acc9ba','glass');
        rod(g,[x+side*.2,1.96,z-.88],[x,1.11,z-.4],.009,'#bdcec1','flat');
        b(g,x,.33,z,1.15,.07,1.7,'#516b72','metal');
        const w=group(side*7.95,0,z,-side*Math.PI/2);text(w,'OBSERVATION',0,2.9,.1,2.4,.28);frame(w,0,2,.06,2.5,1.3,'#abbab4');
        b(w,0,2,.085,.05,1.25,.06,'#adbfbb','metal');
      }
      for(let z=7;z>-25;z-=8){
        b(g,side*7.99,3.3,z,.035,.6,1.2,'#b1bda9');
        text(wall,'EMERGENCY  →',z+11,3.5,.08,2.5,.32,'#9cdbcb');
      }
    }
    // Suspended ceiling grid with recessed panels and ventilation diffusers.
    for(let x=-7;x<=7;x+=2)for(let z=10;z>-33;z-=3){
      b(g,x,4.973,z,1.96,.016,2.94,(Math.round(x+z)%3)?'#70898c':'#5b747b','concrete');
      if((x+z)%5===0)for(let j=0;j<6;j++)b(g,x-.55+j*.22,4.95,z,.07,.028,.7,'#263e47');
    }
    for(let z=4;z>-30;z-=7){b(g,0,4.87,z,3.3,.07,.6,'#293f47','metal');for(const x of[-.6,.6])b(g,x,4.82,z,1.13,.045,.35,'#aac9c5','lit');}
    // Front panel joints, skirting, keyboard, records and a second terminal.
    for(const x of[-2.6,-1.3,0,1.3,2.6])b(g,x,.7,-10.984,.04,1.3,.03,'#3d646d','metal');
    b(g,0,.14,-10.96,5.4,.2,.035,'#314c56','metal');
    b(g,-1.45,1.81,-12,.85,.58,.12,'#293d48','metal');b(g,-1.45,1.85,-11.93,.72,.42,.02,'#588c92','lit');
    for(const x of[-1.45,.7]){b(g,x,1.63,-12,.1,.25,.13,'#a1b5b1','metal');b(g,x,1.57,-11.68,.62,.045,.24,'#304d53','metal');}
    for(let i=0;i<5;i++){b(g,1.9,1.57+i*.05,-11.8,.48,.04,.62,i%2?'#92a5a5':'#d3d7bf');}
    for(const side of[-1,1]){
      const p=group(side*4,0,-16.48);vent(p,0,.7,0,1,.7);text(p,'O₂ / MEDICAL',0,2.5,.035,1.15,.25);
      for(let y=1.3;y<2.3;y+=.2)b(p,0,y,.03,1.25,.06,.025,'#99b6b2');
    }
    // Flush floor guidance stays out of the rescue and retreat collision space.
    for(const x of[-4.8,4.8])b(g,x,.026,-8,.1,.009,30,'#b4b985');
    text(g,'TRIAGE  /  24H',0,4.2,-25.76,4.1,.34,'#e0b088');
  }

  if(index===3){
    for(const side of[-1,1]){
      for(let z=12;z>-40;z-=.65)b(g,side*11.065,4.6,z,.055,9,.1,'#71817c','metal');
      const x=side*6;
      for(let z=-24.8;z<-13;z+=.42)for(const s of[-1,1])b(g,x+s*2.51,2,z,.04,3.8,.1,'#869083','metal');
      for(const xx of[-2.38,0,2.38])b(g,x+xx,2,-12.945,.1,3.85,.09,'#adb1a0','metal');
      for(const yy of[.12,3.88]){b(g,x,yy,-12.93,4.85,.12,.1,'#a2aa98','metal');b(g,x,yy,-19,5.04,.12,11.9,'#727f72','metal');}
      for(const xx of[-1.7,-.55,.55,1.7]){
        rod(g,[x+xx,.25,-12.82],[x+xx,3.7,-12.82],.04,'#c1bc9f');
        for(const y of[.6,2,3.4]){b(g,x+xx,y,-12.78,.2,.09,.08,'#a7ad98','metal');bolt(g,x+xx,y,-12.73);}
      }
      text(g,side<0?'07  /  483920':'MAX LOAD  30.4 T',x,1,-12.76,3.1,.34,'#d8d7b5');
      // Wall-side storage racks lie beyond the enemy lanes.
      for(let z=-2;z>-34;z-=12){
        for(const zz of[z-2,z+2])b(g,side*10.8,3.6,zz,.18,7.2,.18,'#c39958','metal');
        for(const y of[2.7,5.3,7.1]){b(g,side*10.6,y,z,.7,.16,4.1,'#9a8962','metal');for(let j=0;j<4;j++)b(g,side*10.65,y+.55,z-1.5+j,.55,1,.86,'#8e8064','wood');}
      }
    }
    for(let z=5;z>-36;z-=8){
      for(let x=-10;x<10;x+=2){rod(g,[x,8.8,z],[x+1,9.35,z],.045,'#a69c7e');rod(g,[x+1,9.35,z],[x+2,8.8,z],.045,'#a69c7e');}
      for(const x of[-6,6]){rod(g,[x,9.2,z],[x,7.8,z],.025,'#a09d87');cylinder(g,x,7.77,z,.42,.13,'#b6a578');b(g,x,7.68,z,.55,.025,.55,'#dfb566','lit');}
    }
    for(const x of[-2.5,2.5])b(g,x,.025,-18,.075,.012,24,'#c4a04b');
    for(let i=0;i<6;i++)b(g,0,(i+1)*.25+.011,i*.65+.035,3.55,.02,.09,'#dfbd68');
    for(let x=-9.6;x<10;x+=.7){const q=b(g,x,.9,3.992,.22,.65,.022,'#c1a455');q.rotation.z=-.35;}
    crate(g,0,0,-24,3,2.8,1.9);crate(g,-8,0,-32,3,4,1.9);crate(g,8,0,-32,3,3,1.9);
    const shutter=group(0,0,-37.77);for(let y=.3;y<7;y+=.24)b(shutter,0,y,0,14,.14,.045,'#728071','metal');
    text(shutter,'04',0,3.5,.07,3.3,2,'#c7b48a');
  }

  if(index===4){
    for(const side of[-1,1]){
      for(let i=0;i<7;i++){facade(side,5-i*9,9+(i*7%5)*3,true);facade(side,5-i*9,9+(i*7%5)*3,true,true);}
      b(g,side*11.8,1.14,-10,.5,.12,49,'#bec0b0','concrete');
      for(let z=10;z>-32;z-=3){rod(g,[side*11.78,1.2,z],[side*11.78,2.1,z],.028,'#a7ac9f');}
      rod(g,[side*11.78,2.1,12],[side*11.78,2.1,-34],.036,'#b5b8a8');
      const x=side*5.5;
      frame(g,x,1.45,-10.43,2.84,2.72,'#b5bab0');
      for(const z of[-14.3,-11.8])fan(g,x,2.94,z,.9,'y');
      for(const s of[-1,1]){b(g,x+s*1.51,1.4,-13,.025,2.5,4.7,'#667c7a','metal');for(let z=-14.7;z<-11;z+=.5)b(g,x+s*1.54,1.4,z,.025,2.35,.04,'#afbab1','metal');}
      for(const y of[.3,2.6])for(const xx of[-1.3,1.3])bolt(g,x+xx,y,-10.36);
      const house=group(side*4.9,0,-24.98);vent(house,0,2.9,.04,3.5,1.65);text(house,'MECHANICAL / 07',0,4.35,.08,4,.45);
      b(g,side*4.9,5.65,-27,5.9,.12,4.15,'#929e92','metal');
      for(let y=.4;y<5.5;y+=.32)rod(g,[side*7.25,y,-24.86],[side*7.75,y,-24.86],.026,'#b8b9a4');
      for(const x of[side*7.25,side*7.75])rod(g,[x,.2,-24.86],[x,6,-24.86],.035,'#b8b9a4');
    }
    for(let x=-10;x<=10;x+=4)b(g,x,.015,-10,.025,.02,48,'#253c42');
    for(let z=12;z>-34;z-=4)b(g,0,.018,z,23,.02,.025,'#263b40');
    for(let k=0;k<20;k++){const a=k/20*Math.PI*2;b(g,Math.cos(a)*6.25,.033,-5+Math.sin(a)*6.25,.16,.03,.16,k%2?'#80ccd0':'#b8b098','lit');}
    for(let y=2;y<11;y+=1.4){rod(g,[7.7,y,-28],[8.3,y+1.4,-28],.025,'#c2bba2');rod(g,[8.3,y,-28],[7.7,y+1.4,-28],.025,'#c2bba2');}
    for(const x of[7.7,8.3])rod(g,[x,.2,-28],[x,12,-28],.035,'#b6b4a2');
    cylinder(g,8,12.15,-28,.13,.24,'#e58461','y','lit');
    // Far skyline belongs to this isolated stage, below and beyond the roof.
    for(let i=0;i<9;i++){
      const x=-42+i*10.5,h=22+(i*13%23),z=-57-(i%3)*7;
      b(g,x,h/2-22,z,7,h,8,i%2?'#455a65':'#3d505d','concrete');
      b(g,x,h-21.85,z,7.3,.3,8.3,'#6e7b80','metal');
      for(let y=-15;y<h-23;y+=2.3)for(const dx of[-2,0,2]){
        b(g,x+dx,y,z+4.02,.8,1.2,.025,(i+Math.round(y)+dx)%4===0?'#b1a174':'#3e6479',(i+Math.round(y)+dx)%4===0?'lit':'glass');
      }
      b(g,x+1,h-20.5,z,1.7,2.5,2,'#566c75','metal');
    }
    const dish=group(-5.2,6.7,-27);
    rod(g,[-5.2,5.7,-27],[-5.2,6.7,-27],.07,'#a4b2ac');
    const dishGeo=new THREE.CircleGeometry(1.05,32),dishPos=dishGeo.attributes.position;
    for(let i=0;i<dishPos.count;i++)dishPos.setZ(i,-.35*(dishPos.getX(i)**2+dishPos.getY(i)**2));
    dishGeo.computeVertexNormals();mesh(dish,dishGeo,'#b1c0ba','metal');
    for(const x of[-.7,.7])rod(dish,[x,-.5,-.22],[0,0,.65],.02,'#b7c4bc');
    cylinder(dish,0,0,.64,.12,.2,'#617d86','z');
    puddle(-7,1,1.6,.8);puddle(7,-21,1.4,1.5);
  }

  // The same cover reads as cargo, machinery or medical supplies in its own area.
  for(const entry of SPAWN_SITES[index]){
    if(!entry.cover)continue;
    const [x,y,z]=entry.cover.position,theme=entry.cover.theme,p=group(x,y,z);
    if(theme==='cargo'){
      crate(p,0,.08,0,1.8,1.35,1.6);crate(p,-.08,1.425,0,1.65,1.05,1.45);
      for(let j=0;j<6;j++)b(p,-.83+j*.33,.18,0,.24,.08,1.7,'#b09a75','wood');
    }else if(theme==='medical'){
      for(const xx of[-.82,.82])b(p,xx,1.24,.777,.06,2.3,.06,'#c5cec4','metal');
      for(let row=0;row<4;row++){b(p,0,.34+row*.5,.78,1.57,.43,.025,row%2?'#8eafaa':'#789c9e','metal');b(p,0,.48+row*.5,.835,.38,.07,.035,'#d8d9c6','metal');}
      text(p,'MED / 07',0,2.28,.81,1.1,.2,'#c8e4d3');
      for(let j=0;j<4;j++){cylinder(p,-.46+j*.26,2.63,-.12,.075,.22,j%2?'#8fbbb0':'#e1d8b3');cylinder(p,-.46+j*.26,2.76,-.12,.06,.04,'#4b7a85');}
    }else if(theme==='aircon'){
      fan(p,0,1.5,.835,.59);vent(p,0,.47,.84,1.45,.45);
      for(const xx of[-.78,.78])b(p,xx,1.2,.83,.045,2.25,.045,'#c1c6b5','metal');
    }else if(theme==='dumpster'){
      for(const xx of[-.73,.73]){b(p,xx,1.2,.83,.085,2.1,.065,'#8eaa91','metal');b(p,xx,2.23,.91,.25,.09,.13,'#afb8a3','metal');}
      text(p,'SANITATION',0,1.7,.87,1.4,.22,'#d4d9b6');
    }else if(theme==='van'){
      frame(p,0,1.94,.952,1.58,.59);b(p,0,1.94,.968,.045,.56,.045,'#9eaea5','metal');
      for(const xx of[-.72,.72]){b(p,xx,.95,.976,.29,.16,.025,'#cab67d','lit');bolt(p,xx,.54,1.01);}
      vent(p,0,1.06,.965,.7,.4);text(p,'07 / RESPONSE',0,1.47,.938,1.3,.2,'#bcd2c3');
      for(const s of[-1,1]){b(p,s*.965,1.92,-.1,.028,.65,1.1,'#314a5a','glass');cylinder(p,s*.978,.38,0,.22,.035,'#a1b0a7','x');}
    }
  }
  // Fine fractures, paper litter and wear sit flush with the floor.
  for(let i=0;i<24;i++){
    const x=Math.sin(i*9.14)*(index===1?3.6:6),z=6-(i*7.31%37);
    if(index!==2){for(let k=0;k<3;k++)rod(g,[x+k*.18,.032,z-k*.27],[x+(k+1)*.18+(k%2)*.16,.032,z-(k+1)*.27],.012,'#17292d','flat');}
    if(i%3===0){const paper=b(g,x,.036,z,.18,.008,.28,'#b3b5a1');paper.rotation.y=i;for(let j=0;j<3;j++)b(paper,0,.006,-.07+j*.05,.12,.002,.01,'#677779');}
  }
  art.finish();
}
