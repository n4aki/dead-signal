import * as THREE from './vendor/three.module.js';
import { mat, unitBox } from './primitives.js';
import { BOSS_ACTIONS } from './boss-ai.js';

// Sculpted, chamfered blocks preserve the voxel silhouettes. Static pieces are
// baked per joint, then shared by every instance instead of drawing each detail.
const outline=new THREE.Shape();outline.moveTo(-.43,-.43);outline.lineTo(.43,-.43);outline.lineTo(.43,.43);outline.lineTo(-.43,.43);outline.closePath();
const bevel=new THREE.ExtrudeGeometry(outline,{depth:.86,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.07,bevelThickness:.07});bevel.translate(0,0,-.43);
const facet=new THREE.IcosahedronGeometry(.5,0);
const surface=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86,flatShading:true});
const templates=new Map(),dark='#202a29';
const glow=color=>mat(color,{emissive:color,emissiveIntensity:1.7});

function bake(group){
  for(const child of [...group.children])if(child.isGroup)bake(child);
  const buckets=new Map();
  for(const mesh of group.children.filter(o=>o.isMesh&&!o.userData.dynamic)){
    const material=mesh.material.emissiveIntensity>1?mesh.material:surface;
    if(!buckets.has(material))buckets.set(material,[]);buckets.get(material).push(mesh);
  }
  for(const [material,meshes] of buckets){
    const positions=[],normals=[],colors=[];
    for(const mesh of meshes){
      mesh.updateMatrix();const source=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();source.applyMatrix4(mesh.matrix);
      const p=source.getAttribute('position'),n=source.getAttribute('normal'),color=mesh.material.color;
      for(let i=0;i<p.count;i++){
        positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));
        const shade=1+(Math.floor(i/3)%5-2)*.014;colors.push(color.r*shade,color.g*shade,color.b*shade);
      }
      source.dispose();group.remove(mesh);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    if(material===surface)geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geo.computeBoundingBox();geo.computeBoundingSphere();
    const mesh=new THREE.Mesh(geo,material);mesh.castShadow=true;mesh.receiveShadow=true;
    if(meshes.every(m=>m.userData.nonTarget))mesh.userData.nonTarget=true;
    group.add(mesh);
  }
}

function buildModel(type){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  const rig={root,body,head:null,jaw:null,legs:[],arms:[],forearms:[],knees:[],wings:[],segments:[],type,ownedMaterials:[]};
  const group=(parent,x,y,z)=>{const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;};
  const part=(parent,x,y,z,w,h,d,c,shape=bevel)=>{const m=new THREE.Mesh(shape,typeof c==='string'?mat(c):c);m.position.set(x,y,z);m.scale.set(w,h,d);parent.add(m);return m;};
  const cube=(...args)=>part(body,...args);
  const joint=(list,x,y,z,parent=body)=>{const g=group(parent,x,y,z);list.push(g);return g;};
  const bar=(parent,a,b,width,color,depth=width)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),mid=start.clone().add(end).multiplyScalar(.5);const m=part(parent,...mid.toArray(),width,delta.length(),depth,color);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;};
  const eyes=(head,x,y,z,c,size)=>{for(const s of[-1,1]){part(head,s*x,y,z,size*1.65,size*1.4,.045,dark);part(head,s*x,y,z+.026,size,size*.63,.035,glow(c));}};
  const head=(x,y,z)=>rig.head=group(body,x,y,z);
  const tooth=(parent,x,y,z,w=.045,h=.065)=>part(parent,x,y,z,w,h,.045,'#d7d0a7');

  if(type==='normal'||type==='runner'){
    const skin='#839374',pale='#a4ad88',cloth=type==='runner'?'#735d49':'#395950',seam='#203b36';
    cube(0,1.25,-.015,.62,.72,.37,cloth);cube(0,1.57,-.055,.55,.22,.41,cloth);cube(0,.86,0,.51,.2,.32,'#293b34');
    // Torn collar, chest folds, exposed ribs, belt and a hanging equipment pouch.
    for(const s of[-1,1]){const lapel=cube(s*.105,1.55,.19,.16,.23,.065,'#627063');lapel.rotation.z=s*.3;}
    cube(0,1.65,0,.2,.2,.23,skin);cube(-.135,1.33,.196,.2,.31,.045,seam);
    for(let i=0;i<3;i++)cube(-.13,1.42-i*.075,.225,.16,.032,.036,pale);
    cube(.15,1.35,.21,.17,.18,.05,'#506960');cube(.15,1.45,.24,.19,.035,.035,'#829180');
    for(let i=0;i<4;i++){cube(.032,1.5-i*.13,.209,.022,.025,.018,'#a4a48b');cube(-.25+i*.15,.94-(i%2)*.065,.08,.12,.15,.35,cloth);}
    cube(0,.91,.02,.54,.08,.36,'#514937');cube(.045,.91,.212,.11,.095,.035,'#9e9d76');cube(.27,.84,.08,.16,.2,.21,'#555747');
    const h=head(0,1.94,.025);part(h,0,0,0,.44,.45,.39,skin);part(h,-.13,-.085,.165,.17,.13,.095,pale);part(h,.155,-.06,.17,.1,.12,.06,'#526349');
    eyes(h,.104,.04,.202,'#d3e692',.067);
    for(const s of[-1,1]){const brow=part(h,s*.105,.103,.22,.175,.055,.07,'#637356');brow.rotation.z=s*.13;part(h,s*.236,-.015,-.005,.045,.13,.085,skin);}
    part(h,0,-.028,.235,.07,.105,.075,pale);part(h,.025,-.126,.205,.28,.075,.045,dark);
    rig.jaw=group(h,0,-.16,.015);part(rig.jaw,0,-.025,.11,.34,.11,.24,skin);for(let i=0;i<4;i++)tooth(h,-.1+i*.065,-.103,.236,.036,.038);
    part(h,.13,.155,.205,.045,.09,.018,'#48553f');part(h,.156,.15,.214,.06,.015,.014,pale);
    for(const [x,y,z,w]of[[-.13,.237,-.06,.2],[.075,.245,-.09,.28],[.175,.18,-.12,.08],[-.18,.14,-.12,.07]])part(h,x,y,z,w,.1,.27,'#304235');
    for(const s of[-1,1]){
      const arm=joint(rig.arms,s*.405,1.54,0);part(arm,0,-.15,0,.235,.35,.26,cloth);part(arm,0,-.33,0,.24,.1,.25,'#5d7060');
      const fore=joint(rig.forearms,0,-.36,0,arm);part(fore,0,-.16,.015,.19,.31,.21,skin);part(fore,0,-.33,.03,.21,.13,.21,pale);
      for(let i=0;i<3;i++)part(fore,(i-1)*.066,-.425,.045,.047,.12,.12,skin);part(fore,s*.125,-.33,.085,.065,.13,.07,pale);
      const leg=joint(rig.legs,s*.17,.79,0);part(leg,0,-.16,0,.245,.34,.29,'#35463d');
      const knee=joint(rig.knees,0,-.34,0,leg);part(knee,0,-.1,0,.215,.25,.26,'#293c35');part(knee,0,-.005,.137,.18,.1,.04,s<0?skin:'#506050');
      part(knee,0,-.285,.05,.27,.18,.39,'#293330');part(knee,0,-.37,.065,.29,.035,.42,'#161f1e');
      for(let i=0;i<3;i++)part(knee,0,-.23-i*.035,.224,.14,.015,.025,'#798170');
    }
  }else if(type==='skeleton'){
    const bone='#c6c8b0',ivory='#e2dbc0',aged='#7f8976';
    for(let i=0;i<6;i++)cube(0,.98+i*.115,-.065,.125,.095,.16,i%2?bone:aged);
    cube(0,1.36,.125,.085,.48,.07,ivory);
    for(const s of[-1,1]){
      bar(body,[s*.04,1.61,.04],[s*.28,1.57,-.02],.08,bone);
      for(let i=0;i<4;i++){
        const y=1.5-i*.125,w=.23-i*.021;bar(body,[s*.035,y,-.055],[s*w,y-.035,.02],.047,bone);
        bar(body,[s*w,y-.035,.02],[s*(w-.04),y-.075,.155],.045,ivory);bar(body,[s*(w-.04),y-.075,.155],[s*.03,y-.045,.17],.039,bone);
      }
      const hip=cube(s*.135,.84,.005,.23,.17,.24,bone);hip.rotation.z=-s*.22;cube(s*.13,.85,.135,.09,.055,.035,aged);
      const leg=joint(rig.legs,s*.165,.77,0);part(leg,0,-.17,0,.1,.36,.12,bone);part(leg,0,-.345,.025,.14,.12,.15,ivory);
      const knee=joint(rig.knees,0,-.37,0,leg);for(const x of[-.036,.036])part(knee,x,-.14,0,.044,.29,.075,bone);
      part(knee,0,-.32,.07,.16,.1,.26,bone);for(let i=0;i<3;i++)part(knee,(i-1)*.047,-.34,.19,.034,.07,.12,ivory);
      const arm=joint(rig.arms,s*.32,1.59,0);part(arm,0,-.025,0,.17,.17,.19,bone);part(arm,0,-.21,0,.09,.35,.11,bone);
      const fore=joint(rig.forearms,0,-.39,0,arm);for(const x of[-.032,.032])part(fore,x,-.12,0,.04,.26,.07,bone);part(fore,0,-.28,.015,.12,.11,.11,ivory);
      for(let i=0;i<3;i++)part(fore,(i-1)*.039,-.36,.04,.027,.1,.07,bone);
    }
    cube(0,1.72,-.005,.11,.18,.12,aged);const h=head(0,1.99,.025);
    part(h,0,.045,-.02,.49,.38,.4,bone);part(h,0,.19,-.035,.36,.1,.34,ivory);
    for(const s of[-1,1]){
      part(h,s*.113,.045,.187,.169,.155,.06,'#364039');part(h,s*.116,.06,.221,.052,.05,.024,glow('#f4c878'));
      part(h,s*.192,-.045,.16,.09,.1,.105,ivory);const brow=part(h,s*.115,.137,.214,.2,.055,.045,aged);brow.rotation.z=s*.15;
    }
    part(h,0,-.053,.217,.058,.095,.035,dark);part(h,0,-.126,.125,.31,.07,.22,bone);
    for(let i=0;i<6;i++)tooth(h,-.125+i*.05,-.174,.225,.035,.055);
    rig.jaw=group(h,0,-.195,.02);part(rig.jaw,0,-.025,.11,.34,.075,.22,aged);
    for(const s of[-1,1])part(rig.jaw,s*.166,.03,.025,.053,.13,.08,bone);
    for(let i=0;i<5;i++)tooth(rig.jaw,-.1+i*.05,.019,.208,.033,.037);
    bar(h,[-.04,.21,.185],[.01,.135,.206],.012,aged);bar(h,[.01,.135,.206],[.035,.09,.214],.009,aged);
    const shoulder=cube(.29,1.57,-.025,.3,.19,.31,'#626b59');shoulder.rotation.z=-.18;
    bar(body,[-.24,1.55,.18],[.2,.9,.19],.078,'#6b5740',.035);
    cube(.12,1.28,-.25,.23,.53,.22,'#65513b');cube(.12,1.52,-.25,.25,.08,.24,'#9b8458');
    for(let i=0;i<3;i++){cube(.05+i*.067,1.71,-.25,.023,.35,.023,'#b8ac83');cube(.05+i*.067,1.84,-.25,.065,.12,.035,'#cad0ba');}
    rig.bow=group(rig.forearms[0],0,-.31,.02);
    const points=[[0,-.49,0],[-.12,-.34,0],[-.18,0,0],[-.12,.34,0],[0,.49,0]];
    for(let i=1;i<points.length;i++)bar(rig.bow,points[i-1],points[i],.055,'#a38553',.075);
    bar(rig.bow,[0,-.49,0],[0,.49,0],.012,'#ded2ab');part(rig.bow,-.175,0,0,.077,.16,.09,'#4c4234');
    bar(rig.bow,[-.08,0,-.25],[-.08,0,.42],.021,'#c7b27a');part(rig.bow,-.08,0,.45,.065,.038,.1,'#a6b8af',facet);
  }else if(type==='bomber'){
    const moss='#6e913b',lime='#a5b855',shade='#3b602f';
    cube(0,1.13,0,.49,.87,.42,moss);cube(0,1.4,-.04,.56,.36,.46,shade);
    for(let i=0;i<12;i++){const x=(i%3-1)*.15,y=.78+Math.floor(i/3)*.19;cube(x,y,.229,.12,.135,.035,i%3===0?shade:lime);}
    for(const s of[-1,1]){cube(s*.253,1.16,-.03,.08,.56,.3,'#879d42');for(let i=0;i<4;i++)cube(s*.26,.87+i*.16,.13,.07,.1,.08,i%2?lime:shade);}
    cube(0,1.1,-.239,.17,.72,.07,shade);for(let i=0;i<4;i++)cube(0,.87+i*.16,-.29,.1,.095,.055,lime);
    const h=head(0,1.83,0);part(h,0,0,0,.65,.59,.56,moss);part(h,0,.265,-.03,.62,.08,.5,lime);
    for(const s of[-1,1]){part(h,s*.154,.028,.283,.18,.165,.055,dark);part(h,s*.153,.045,.317,.075,.055,.025,glow('#e5eda1'));part(h,s*.2,.158,.28,.23,.075,.07,shade);}
    part(h,0,-.16,.285,.2,.2,.045,dark);for(const s of[-1,1])part(h,s*.13,-.218,.29,.075,.105,.04,dark);
    for(let i=0;i<7;i++)part(h,(i%3-1)*.21,.22-Math.floor(i/3)*.18,.295,.074,.054,.023,i%2?lime:shade);
    for(let i=0;i<3;i++){const growth=part(h,-.2+i*.19,.33,-.07+i%2*.1,.11,.15,.12,shade);growth.rotation.z=(i-1)*.3;}
    for(const s of[-1,1])for(const z of[-.21,.21]){const foot=joint(rig.legs,s*.23,.68,z);part(foot,0,-.16,0,.24,.35,.26,moss);part(foot,0,-.43,.06,.28,.3,.34,shade);part(foot,0,-.565,.08,.27,.055,.35,lime);for(let i=0;i<2;i++)part(foot,(i-.5)*.13,-.45,.242,.075,.1,.024,'#afbb6c');}
    const fuse=new THREE.MeshBasicMaterial({color:'#fff5b5',transparent:true,opacity:0,depthWrite:false});rig.warning=cube(0,1.16,.256,.11,.66,.025,fuse,unitBox);rig.warning.userData={nonTarget:true,dynamic:true};
  }else if(type==='wolf'){
    const fur='#8e9b9b',light='#c2c9bd',shade='#526771';
    cube(0,.62,-.08,.46,.43,.86,fur);cube(0,.69,.2,.56,.5,.41,shade);cube(0,.49,.21,.4,.35,.34,light);
    for(const s of[-1,1]){cube(s*.195,.56,-.35,.24,.34,.3,shade);for(let i=0;i<3;i++){const r=cube(s*(.23+i*.025),.78-i*.11,.25-i*.025,.16,.2,.24,i%2?light:fur);r.rotation.z=s*.27;}}
    for(let i=0;i<4;i++)cube(0,.867-i*.02,.08-i*.18,.24,.07,.16,shade);
    const h=head(0,.83,.49);part(h,0,0,0,.43,.36,.36,fur);part(h,0,-.075,.236,.27,.2,.29,light);part(h,0,-.023,.39,.2,.115,.075,dark);
    for(const s of[-1,1]){part(h,s*.17,-.04,.08,.16,.17,.23,light);const b=part(h,s*.128,.11,.155,.17,.065,.09,shade);b.rotation.z=s*.25;const ear=part(h,s*.15,.26,-.06,.16,.3,.19,shade);ear.rotation.z=s*.13;part(h,s*.15,.27,.038,.08,.17,.032,'#a99591');}
    eyes(h,.124,.035,.185,'#f9bc72',.052);
    rig.jaw=group(h,0,-.15,.045);part(rig.jaw,0,0,.19,.25,.085,.31,shade);part(rig.jaw,0,.045,.22,.2,.025,.23,'#745b59');
    for(const s of[-1,1]){tooth(h,s*.093,-.159,.23,.043,.105);tooth(rig.jaw,s*.085,.065,.3,.033,.065);}
    for(const s of[-1,1])for(const z of[-.32,.3]){
      const leg=joint(rig.legs,s*.21,.55,z);part(leg,0,-.09,0,.17,.27,.2,fur);
      const knee=joint(rig.knees,0,-.22,-.035,leg);part(knee,0,-.09,.03,.11,.23,.13,light);part(knee,0,-.235,.09,.2,.11,.27,fur);
      for(let i=0;i<3;i++)part(knee,(i-1)*.055,-.24,.223,.032,.045,.065,'#d6d0b9');
    }
    rig.tail=group(body,0,.7,-.47);bar(rig.tail,[0,0,0],[0,.19,-.37],.19,fur);bar(rig.tail,[0,.19,-.37],[0,.17,-.6],.14,light);
    cube(0,.62,.36,.53,.12,.17,'#4d483b');cube(0,.57,.46,.11,.12,.03,'#9a9476');
  }else if(type==='bat'){
    cube(0,0,0,.27,.37,.28,'#55435e');cube(0,-.04,.14,.18,.26,.065,'#9a7b89');
    const h=head(0,.24,.04);part(h,0,0,0,.35,.29,.28,'#756075');eyes(h,.095,.035,.15,'#ffbe84',.052);
    part(h,0,-.045,.18,.095,.08,.085,'#ab8590');part(h,0,-.09,.146,.18,.06,.036,dark);
    for(const s of[-1,1]){
      const ear=part(h,s*.12,.24,-.025,.13,.35,.14,'#816981');ear.rotation.z=-s*.15;part(h,s*.12,.24,.05,.065,.21,.025,'#b17d8c');tooth(h,s*.052,-.136,.17,.032,.08);
      const wing=joint(rig.wings,s*.12,.09,0);const shape=new THREE.Shape();
      const points=[[0,0],[.3,.15],[.67,.09],[1,-.13],[.78,-.38],[.63,-.15],[.48,-.48],[.34,-.2],[.19,-.38],[0,-.13]];
      points.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();
      const membrane=new THREE.ShapeGeometry(shape);membrane.rotateX(-Math.PI/2);membrane.scale(s,1,1);
      // Double-sided wing membrane remains visible throughout the wing stroke.
      const m=new THREE.Mesh(membrane,mat('#725366',{side:THREE.DoubleSide}));wing.add(m);
      for(const [x,z]of[[.98,.13],[.48,.48],[.19,.38]])bar(wing,[0,.012,0],[s*x,.012,z],.024,'#bd8e91');
      bar(wing,[0,.018,0],[s*.3,.018,-.15],.055,'#8c707d');bar(wing,[s*.3,.018,-.15],[s*.67,.018,-.09],.035,'#b18b94');bar(wing,[s*.67,.018,-.09],[s*1,.018,.13],.025,'#b18b94');
      part(wing,s*.3,.035,-.2,.045,.065,.15,'#d1b8a7');
      const leg=joint(rig.legs,s*.085,-.18,0);part(leg,0,-.085,0,.05,.16,.065,'#967b86');for(let i=0;i<2;i++)part(leg,(i-.5)*.04,-.15,.05,.023,.045,.105,'#c7b29e');
    }
  }else if(type==='silverfish'){
    for(let i=0;i<6;i++){
      const seg=joint(rig.segments,0,.2,.34-i*.18),w=.34-i*.038;
      part(seg,0,0,0,w,.25-i*.023,.23,i%2?'#8fa5a3':'#b7c5b9');part(seg,0,.113-i*.01,-.025,w*.62,.05,.17,'#dde0c5');
      part(seg,0,-.015,.11,w*.9,.025,.02,'#4e7073');
      for(const s of[-1,1]){bar(seg,[s*w*.4,-.04,0],[s*(w*.5+.095),-.095,.035],.03,'#8da8a2');bar(seg,[s*(w*.5+.095),-.095,.035],[s*(w*.5+.14),-.17,.08],.022,'#c3cfc0');}
    }
    const h=head(0,.235,.54);part(h,0,0,0,.31,.24,.25,'#bfcbbb');eyes(h,.094,.019,.133,'#dff0b1',.04);
    for(const s of[-1,1]){bar(h,[s*.12,.065,.12],[s*.25,.15,.39],.02,'#c5d7be');bar(h,[s*.25,.15,.39],[s*.33,.13,.48],.012,'#e1e5c9');bar(h,[s*.075,-.07,.12],[s*.12,-.08,.23],.034,'#596e68');}
    for(const x of[-.14,0,.14])bar(body,[0,.18,-.66],[x,.22,-1.01+Math.abs(x)],.024,'#b1c7ba');
  }else if(type==='spider'){
    const shell='#403c49',ridge='#74606c';
    cube(0,.5,-.29,.63,.48,.7,shell);cube(0,.67,-.34,.49,.2,.48,ridge);cube(0,.45,.13,.43,.31,.38,'#53434f');
    for(const s of[-1,1])for(let i=0;i<3;i++){const stripe=cube(s*(.13+i*.025),.734-i*.015,-.13-i*.16,.085,.035,.13,'#b08080');stripe.rotation.y=s*.4;}
    const h=head(0,.435,.4);part(h,0,0,0,.43,.31,.34,'#66505c');
    for(const s of[-1,1])for(let i=0;i<3;i++){const x=s*(.055+i*.065),y=i===1?.094:.03;part(h,x,y,.174,.072,.077,.04,dark);part(h,x,y,.198,.046,.048,.029,glow('#fa907f'));}
    for(const s of[-1,1]){
      const fang=group(h,s*.115,-.1,.13);part(fang,0,-.015,.06,.12,.13,.15,'#a68a86');bar(fang,[0,-.03,.11],[-s*.025,-.19,.16],.052,'#ddd0b3');
      for(let i=0;i<4;i++){
        const leg=joint(rig.legs,s*.22,.44,.27-i*.185);leg.userData.restYaw=s*(i-1.5)*.36;leg.rotation.y=leg.userData.restYaw;
        bar(leg,[0,0,0],[s*.31,.13,0],.095,ridge);part(leg,s*.31,.13,0,.135,.13,.13,'#957581',facet);
        bar(leg,[s*.31,.13,0],[s*.51,-.045,-.025],.075,shell);bar(leg,[s*.51,-.045,-.025],[s*.59,-.4,.04],.046,'#a18084');
        for(let j=0;j<2;j++)bar(leg,[s*(.21+j*.075),.1,0],[s*(.2+j*.075),.2,-.025],.018,'#ad8d8c');
      }
    }
  }else if(type==='boss'){
    const skin='#738451',light='#99a369',shade='#4c623f',cloth='#344554';
    cube(0,2.31,-.08,1.58,1.38,.87,skin);cube(0,2.97,-.22,1.85,.6,.95,shade);cube(0,1.39,0,1.12,.62,.69,cloth);
    for(const s of[-1,1]){
      const pec=cube(s*.395,2.65,.39,.7,.55,.28,light);pec.rotation.z=s*.12;
      for(let i=0;i<3;i++)cube(s*.225,2.26-i*.2,.43,.38,.17,.16,i%2?skin:light);
      bar(body,[s*.66,2.7,.53],[s*.42,2.29,.54],.045,shade,.03);
      cube(s*.49,1.64,.38,.42,.32,.13,cloth);for(let i=0;i<3;i++)cube(s*(.38+i*.15),1.85+(i%2)*.12,.4,.13,.33,.13,'#496373');
      const arm=joint(rig.arms,s*1.02,2.98,-.025);part(arm,0,-.19,0,.76,.68,.8,skin);part(arm,s*.07,-.1,-.055,.79,.42,.84,shade);
      part(arm,0,-.48,.09,.65,.63,.7,light);part(arm,s*.1,-.54,.37,.34,.3,.17,skin);
      const fore=joint(rig.forearms,0,-.78,.06,arm);part(fore,0,-.26,.055,.61,.59,.65,skin);part(fore,s*.075,-.16,.12,.66,.34,.72,light);
      part(fore,0,-.66,.16,.8,.54,.79,shade);part(fore,0,-.56,.45,.77,.31,.3,skin);
      for(let i=0;i<4;i++){part(fore,(i-1.5)*.178,-.8,.48,.15,.31,.32,skin);part(fore,(i-1.5)*.178,-.69,.637,.14,.12,.065,'#b4b589');}
      part(fore,-s*.43,-.56,.28,.25,.35,.32,light);bar(fore,[-.18,-.13,.42],[.16,-.44,.44],.04,shade,.026);
      const leg=joint(rig.legs,s*.4,1.2,0);part(leg,0,-.25,0,.57,.57,.66,cloth);part(leg,0,-.49,.27,.49,.25,.21,'#526775');
      const knee=joint(rig.knees,0,-.58,0,leg);part(knee,0,-.16,.015,.44,.38,.54,skin);part(knee,0,-.4,.19,.67,.28,.89,shade);
      for(let i=0;i<3;i++)part(knee,(i-1)*.18,-.42,.64,.145,.12,.105,'#b5b58a');
      for(let i=0;i<3;i++)part(arm,s*(.22+i*.1),.17-(i%2)*.025,-.05-i*.13,.23,.33,.24,i%2?light:shade,facet);
    }
    cube(0,1.54,.05,1.15,.115,.76,'#414233');cube(0,1.54,.47,.24,.15,.06,'#939174');
    for(let i=0;i<5;i++)cube(0,2.11+i*.22,-.57,.19,.17,.15,'#a4a879');
    cube(0,3.2,.12,.54,.43,.48,shade);
    const h=head(0,3.53,.3);part(h,0,.02,0,.77,.66,.69,skin);part(h,0,.305,-.1,.79,.19,.65,shade);
    for(const s of[-1,1]){part(h,s*.29,-.105,.26,.22,.21,.22,light);part(h,s*.385,-.005,-.03,.105,.23,.16,shade);const brow=part(h,s*.195,.18,.37,.36,.13,.16,shade);brow.rotation.z=s*.14;}
    eyes(h,.186,.075,.358,'#eef5a0',.105);part(h,0,-.04,.414,.17,.19,.15,light);part(h,0,-.235,.325,.55,.2,.095,dark);
    rig.jaw=group(h,0,-.29,.04);part(rig.jaw,0,-.065,.2,.65,.2,.44,skin);
    for(let i=0;i<6;i++)tooth(h,-.235+i*.094,-.195,.388,.065,.095);
    for(const s of[-1,1]){tooth(rig.jaw,s*.23,.045,.415,.09,.18);part(h,s*.2,.35,-.15,.27,.12,.46,'#334733');}
    bar(h,[-.3,.235,.346],[-.2,-.035,.39],.027,'#bdbea0',.015);
    // Broken restraint cuff and embedded bolts on one arm distinguish the giant.
    for(const y of[-.18,-.37])part(rig.forearms[1],0,y,.04,.7,.09,.74,'#555d5a');
    for(const x of[-.22,.22])part(rig.forearms[1],x,-.28,.43,.08,.12,.06,'#b1ab87');
    rig.heldRock=group(rig.forearms[1],0,-.97,.3);part(rig.heldRock,0,0,0,1.45,1.2,1.2,'#8c8777',facet);part(rig.heldRock,.3,.22,.1,.8,.65,.8,'#b1a58b',facet);rig.heldRock.visible=false;rig.heldRock.traverse(o=>o.userData.nonTarget=true);
  }
  if(rig.head)rig.head.userData.head=true;
  bake(root);
  for(const joint of(rig.knees.length?rig.knees:rig.legs)){
    const bounds=new THREE.Box3();for(const mesh of joint.children.filter(o=>o.isMesh)){mesh.geometry.computeBoundingBox();bounds.union(mesh.geometry.boundingBox);}
    if(!bounds.isEmpty())joint.userData.sole=[bounds.min.x,bounds.max.x,bounds.min.y,bounds.min.z,bounds.max.z];
  }
  // The membrane requires both faces even after baking it into the wing joint.
  if(type==='bat')for(const wing of rig.wings)for(const mesh of wing.children)if(mesh.isMesh)mesh.material=surfaceDouble;
  return rig;
}
const surfaceDouble=surface.clone();surfaceDouble.side=THREE.DoubleSide;

export function createEnemyModel(type){
  if(!templates.has(type))templates.set(type,buildModel(type));
  const template=templates.get(type),root=template.root.clone(true),original=[],copies=[];
  template.root.traverse(o=>original.push(o));root.traverse(o=>copies.push(o));const map=new Map(original.map((o,i)=>[o,copies[i]]));
  const rig={...template,root,ownedMaterials:[]};
  for(const [key,value]of Object.entries(template)){
    if(value?.isObject3D)rig[key]=map.get(value);
    else if(Array.isArray(value)&&key!=='ownedMaterials')rig[key]=value.map(o=>map.get(o));
  }
  if(rig.warning){rig.warning.material=rig.warning.material.clone();rig.ownedMaterials.push(rig.warning.material);}
  return rig;
}

const solePoint=new THREE.Vector3();
function plantFeet(rig,lift=0){
  rig.body.updateMatrix();let floor=Infinity;
  rig.legs.forEach((leg,i)=>{
    const joint=rig.knees[i]||leg,sole=joint.userData.sole;if(!sole)return;
    leg.updateMatrix();if(joint!==leg)joint.updateMatrix();
    for(const x of[sole[0],sole[1]])for(const z of[sole[3],sole[4]]){
      solePoint.set(x,sole[2],z);if(joint!==leg)solePoint.applyMatrix4(joint.matrix);
      solePoint.applyMatrix4(leg.matrix).applyMatrix4(rig.body.matrix);floor=Math.min(floor,solePoint.y);
    }
  });
  if(Number.isFinite(floor))rig.body.position.y+=lift-floor;
}

function animateLocomotion(rig,time,options){
  const {locomotion:m,armed=false,fuseLeft=1.65,chargeLeft=0,hit=0,attackPhase='idle',attackProgress=0}=options;
  const type=rig.type,w=Math.min(1.25,m.weight),gait=m.gait,breath=Math.sin(time*2.1),turn=m.turn;
  const crouch=['stalk','crouch'].includes(m.phase)?m.energy:0;
  const burst=m.phase==='burst'?m.energy:0;
  const windup=attackPhase==='windup'?attackProgress:0;
  const strike=attackPhase==='strike'?Math.sin((.2+attackProgress*.8)*Math.PI):0;
  const recovery=attackPhase==='recover'?(1-attackProgress)*.12:0;
  rig.body.position.set(0,.008*breath+Math.abs(Math.sin(gait))*.024*w,0);
  rig.body.rotation.set(.025*w-hit*1.3,0,-turn*.025+Math.sin(gait)*.022*w);
  rig.body.scale.set(1,1,1);
  if(rig.head){rig.head.rotation.set(-windup*.15+strike*.15+hit*.7,(m.lookAngle||0)*.5+Math.sin(time*1.5)*.018,0);}
  if(rig.jaw)rig.jaw.rotation.x=.035+.035*(breath+1)+windup*.16+strike*.36;
  // Longer planted stance, shorter lifted return. No distance means no foot cycling.
  const foot=(phase)=>{const t=((phase/(Math.PI*2))%1+1)%1;return t<.62?{swing:1-t/.62*2,lift:0}:{swing:-Math.cos((t-.62)/.38*Math.PI),lift:Math.sin((t-.62)/.38*Math.PI)};};
  rig.legs.forEach((leg,i)=>{
    const step=foot(gait+i*Math.PI);leg.rotation.set(step.swing*.32*w,0,0);
    if(rig.knees[i])rig.knees[i].rotation.x=step.lift*.48*w;
  });
  rig.arms.forEach((arm,i)=>{
    arm.rotation.set(-.74+Math.sin(gait+i*Math.PI)*.12*w+windup*.5-strike*.68,(i?1:-1)*windup*.12,(i?1:-1)*(.04+windup*.2));
  });
  rig.forearms.forEach((f,i)=>f.rotation.x=-.18-Math.max(0,Math.sin(gait+i*Math.PI))*.1*w-windup*.2+strike*.12);
  if(type==='normal'||type==='runner'){
    rig.body.rotation.x+=(type==='runner'?.14:.06)*w+windup*.12-strike*.13;
    rig.body.rotation.z+=Math.sin(gait*.5+m.seed)*.035*w;
    rig.body.position.z=-windup*.09+strike*.28+recovery;
    rig.head.rotation.z=Math.sin(gait*.5+.8)*.07*w;
    rig.head.rotation.x+=Math.sin(gait-.5)*.045*w;
    if(type==='runner'){rig.body.position.y-=crouch*.08;rig.legs.forEach(l=>l.rotation.x*=1.4);}
  }
  if(type==='skeleton'){
    const aim=chargeLeft>0,draw=aim?Math.min(1,(1-chargeLeft/1.15)*1.5):0;
    rig.arms[0].rotation.x=aim?-1.28:-.45+Math.sin(gait)*.12*w;
    rig.arms[1].rotation.x=aim?-1.1:-.3-Math.sin(gait)*.12*w;
    rig.arms[1].rotation.z=aim?-.15-draw*.23:0;rig.forearms[0].rotation.x=-.18;
    rig.forearms[1].rotation.x=aim?-.55-draw*.6:-.55;
    rig.bow.rotation.set(aim?1.45:.6,0,0);
    rig.body.rotation.y=aim?-.1:0;
    if(attackPhase==='release'){rig.arms[1].rotation.x=-1.12+attackProgress*.45;rig.forearms[1].rotation.x=-1.1+attackProgress*.7;}
  }
  if(type==='wolf'){
    rig.body.position.y=.012*breath-crouch*.07+burst*.13+strike*.12;
    rig.body.position.z=-windup*.16+strike*.48+recovery;
    rig.body.rotation.x=crouch*.14-burst*.09+windup*.2-strike*.16-hit;
    const phases=m.phase==='burst'?[0,.85,.25,1.1]:[0,Math.PI,Math.PI,0];
    rig.legs.forEach((leg,i)=>{const step=foot(gait+phases[i]);leg.rotation.x=step.swing*(m.phase==='burst'?.68:.44)*w;rig.knees[i].rotation.x=step.lift*.65*w+crouch*.18+windup*.18;});
    if(rig.tail){rig.tail.rotation.y=Math.sin(gait*.45)*.18*w;rig.tail.rotation.x=crouch*.25-burst*.2;}
    rig.head.rotation.x+=crouch*.14-strike*.1;
  }
  if(type==='spider'){
    rig.body.position.y=.01*breath-crouch*.06+burst*.085-windup*.045+strike*.065;
    rig.body.position.z=strike*.35;rig.body.rotation.x=windup*.15-strike*.18-hit;
    rig.legs.forEach((leg,i)=>{const side=i<4?-1:1,phase=gait+(i%2+(i>=4?1:0))*Math.PI;
      leg.rotation.set(Math.sin(phase)*.15*w,leg.userData.restYaw+Math.cos(phase)*.15*w,-side*Math.max(0,Math.sin(phase))*.15*w+side*crouch*.07);
    });
  }
  if(type==='silverfish'){
    rig.body.position.y=0;rig.body.position.z=strike*.2;
    rig.segments.forEach((s,i)=>{s.rotation.y=Math.sin(gait-i*.8)*.13*w;s.position.y=.2+Math.sin(gait-i*.8)*.01*w;});
    rig.head.rotation.y=Math.sin(gait+.7)*.09*w;
  }
  if(type==='bat'){
    const glide=m.phase==='glide',flap=time*(glide?7:20);
    rig.wings.forEach((wing,i)=>{wing.rotation.z=(i?1:-1)*(.12+Math.sin(flap)*(glide?.17:.82));wing.rotation.x=-.54+Math.sin(flap)*.1;});
    rig.body.rotation.z=-turn*.24;
    rig.body.rotation.x=m.phase==='dive'?.2:-.06;
    rig.body.position.y=Math.sin(m.time*2.2+m.seed)*.09+windup*.12-strike*.12;
    rig.body.position.z=strike*.5;
  }
  if(type==='bomber'){
    rig.legs.forEach((leg,i)=>leg.rotation.x=Math.sin(gait+[0,Math.PI,Math.PI,0][i])*.29*w);
    rig.body.rotation.x=armed?.09:.035*w;
    if(armed){rig.body.position.y=-.045;rig.legs.forEach(l=>l.rotation.x=0);}
  }
  if(rig.warning){rig.warning.material.opacity=armed?(.35+.65*Math.abs(Math.sin(time*(fuseLeft<.7?24:12)))):0;rig.body.scale.setScalar(armed?1+.055*Math.sin(time*16):1);}
  if(['normal','runner','skeleton','wolf','bomber'].includes(type))plantFeet(rig,type==='wolf'?burst*.13+strike*.12:0);
}

export function animateEnemy(rig,time,{armed=false,fuseLeft=1.65,chargeLeft=0,hit=0,bossBrain=null,bossMotion=null,locomotion=null,attackPhase='idle',attackProgress=0}={}){
  if(locomotion&&rig.type!=='boss'){animateLocomotion(rig,time,{locomotion,armed,fuseLeft,chargeLeft,hit,attackPhase,attackProgress});return;}
  const type=rig.type,run=time*(type==='wolf'?13:type==='silverfish'?16:type==='spider'?10:5),stride=Math.sin(run);
  rig.body.position.y=Math.abs(stride)*(type==='wolf'?.045:type==='silverfish'?.008:.025);
  rig.body.rotation.set(hit>0?-.12:0,0,0);
  if(rig.head){rig.head.rotation.y=Math.sin(time*1.6)*.035;rig.head.rotation.z=type==='normal'?Math.sin(time*2)*.065:0;}
  if(rig.jaw)rig.jaw.rotation.x=.05+Math.max(0,Math.sin(time*2.8))*.14;
  if(type==='bat'){rig.wings.forEach((w,i)=>{w.rotation.z=(i?1:-1)*(.15+Math.sin(time*19)*.82);w.rotation.x=-.65+Math.sin(time*19)*.12;});rig.body.rotation.z=Math.sin(time*3)*.07;}
  else if(type==='silverfish')rig.segments.forEach((s,i)=>{s.rotation.y=Math.sin(run-i*.7)*.14;s.position.y=.2+Math.sin(run-i*.7)*.012;});
  else rig.legs.forEach((leg,i)=>{leg.rotation.x=Math.sin(run+i*Math.PI*.75)*(type==='spider'?.23:.4);if(type==='spider')leg.rotation.y=leg.userData.restYaw+Math.sin(run+i*Math.PI)*.11;});
  rig.knees.forEach((k,i)=>k.rotation.x=Math.max(0,Math.sin(run+i*Math.PI*.75))*.4);
  rig.arms.forEach((arm,i)=>{arm.rotation.x=-.88+Math.sin(run+i*Math.PI)*.19;arm.rotation.z=(i?1:-1)*.06;});
  rig.forearms.forEach((f,i)=>f.rotation.x=-.16-Math.max(0,Math.sin(run+i*Math.PI))*.14);
  if(type==='skeleton'){
    const aiming=chargeLeft>0;rig.arms[0].rotation.x=aiming?-1.3:-.5;rig.arms[1].rotation.x=aiming?-1.15:-.35;
    rig.arms[1].rotation.z=aiming?-.38:0;rig.forearms[0].rotation.x=-.18;rig.forearms[1].rotation.x=aiming?-1.1:-.65;
    rig.bow.rotation.x=aiming?1.45:.6;rig.bow.rotation.y=0;
  }
  if(type==='boss'){
    const b=bossBrain||{action:'roar',phase:'action',timer:time%1.4},active=['windup','action'].includes(b.phase);
    rig.arms.forEach((a,i)=>{a.rotation.x=-.15+Math.sin(run+i*Math.PI)*.12;a.rotation.z=(i?1:-1)*.12;});rig.forearms.forEach(f=>f.rotation.x=-.13);
    rig.head.rotation.x=0;rig.heldRock.visible=b.action==='rock'&&b.phase==='windup';
    if(b.phase!=='approach'){rig.legs.forEach(l=>l.rotation.x=0);rig.knees.forEach(k=>k.rotation.x=0);}
    if(active&&b.action==='roar'){rig.arms.forEach((a,i)=>{a.rotation.x=-.55;a.rotation.z=(i?1:-1)*.65;});rig.head.rotation.x=-.28;rig.jaw.rotation.x=.48;rig.body.position.y+=Math.sin(time*22)*.035;}
    if(active&&b.action==='rock'){rig.arms[1].rotation.x=b.phase==='windup'?-2.7:-1.1;rig.body.rotation.z=.12;}
    if(active&&['jump','lunge'].includes(b.action)){
      rig.body.rotation.x=b.phase==='windup'?.28:-.17;rig.body.position.y+=b.phase==='windup'?-.25:0;
      rig.arms.forEach(a=>a.rotation.x=b.phase==='windup'?.45:-2.2);rig.forearms.forEach(f=>f.rotation.x=b.phase==='windup'?-.5:0);
      rig.legs.forEach((l,i)=>l.rotation.x=b.phase==='action'?(i?.65:-.5):-.18);rig.knees.forEach(k=>k.rotation.x=b.phase==='windup'?.5:0);
    }
    if(active&&b.action==='dodge')rig.body.rotation.z=-b.side*.22;
    if(b.phase==='stunned'){rig.body.rotation.x=.28;rig.head.rotation.x=.3;}
    if(b.phase==='windup'){
      const progress=Math.min(1,(b.timer??0)/BOSS_ACTIONS[b.action].windup),ease=progress*progress*(3-2*progress);
      rig.body.position.y*=ease;rig.body.rotation.x*=ease;rig.body.rotation.z*=ease;
      rig.arms.forEach((a,i)=>{a.rotation.x=-.15+(a.rotation.x+.15)*ease;a.rotation.z=(i?1:-1)*.12+(a.rotation.z-(i?1:-1)*.12)*ease;});
      rig.knees.forEach(k=>k.rotation.x*=ease);rig.head.rotation.x*=ease;
    }
    if(bossMotion&&['approach','recovery','stunned'].includes(b.phase)){
      const landing=b.phase==='recovery'&&['jump','lunge'].includes(b.action)?Math.exp(-(b.timer??0)*8):0;
      rig.body.position.y=-.25*landing+Math.abs(Math.sin(bossMotion.gait))*.065*bossMotion.weight;
      rig.legs.forEach((leg,i)=>{const step=Math.sin(bossMotion.gait+i*Math.PI);leg.rotation.x=step*.33*bossMotion.weight*(b.phase==='approach'?1:-1);rig.knees[i].rotation.x=Math.max(0,-step)*.3*bossMotion.weight+landing*.48;});
      rig.body.rotation.x+=landing*.22;rig.arms.forEach(a=>a.rotation.x-=landing*.3);
    }
    if(bossMotion&&!(b.phase==='action'&&['jump','lunge'].includes(b.action)))plantFeet(rig);
  }
  if(rig.tail)rig.tail.rotation.y=Math.sin(run*.6)*.25;
  if(rig.warning){rig.warning.material.opacity=armed?(.35+.65*Math.abs(Math.sin(time*(fuseLeft<.7?24:12)))):0;rig.body.scale.setScalar(armed?1+.055*Math.sin(time*16):1);}
}
export function disposeEnemyModel(rig){for(const m of rig.ownedMaterials)m.dispose();}
