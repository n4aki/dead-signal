import { STAGES } from './stage-data.js';
const ground=['normal','runner','skeleton','bomber','wolf','silverfish','spider'];
const small=['silverfish','spider'];
const dock=x=>[...Array.from({length:6},(_,i)=>[x,(i+1)*.25,-.1+i*.65]),[x,1.5,4],[x,1.5,5]];
const site=(id,name,kind,path,types=ground)=>({id,name,kind,path,types});
const extra=[
  [
    site('left-street','左の脇道','door',[[-7,.24,-7],[-6.55,.24,-6],[-6,0,-5],[-2,0,-2],[0,0,3.8]]),
    site('right-shop','右の店舗入口','door',[[7,.24,-15],[7,.24,-12],[6.5,0,-11],[1.5,0,-7],[.8,0,3.8]]),
    site('road-opening','道路の陥没口','drain',[[-1.7,0,-19],[-1.7,0,-9],[-.7,0,3.8]]),
    site('right-passage','右手前の通路','door',[[4,0,-5],[2,0,-1],[.7,0,3.8]]),
    site('left-balcony','左のバルコニー','perch',[[-5,2.8,-7]],['skeleton'])
  ],
  [
    site('left-vent','左の通風口','drain',[[-3.6,0,-9],[-2,0,-6],[-.7,0,3.5]],small),
    site('right-door','右の非常口','door',[[3.6,0,-10],[2,0,-6],[.6,0,3.5]]),
    site('alley-drain','路地奥の排水口','drain',[[0,0,-23],[.5,0,-16],[0,0,3.5]],small),
    site('left-door','左奥の扉','door',[[-3.5,0,-25],[-1,0,-22],[-.5,0,-18],[-.5,0,3.5]]),
    site('wall-window','右壁の窓','web',[[3.7,2.8,-12],[3.7,0,-12],[1.8,0,-12],[1,0,-8],[.5,0,3.5]],['spider'])
  ],
  [
    site('left-room','左の処置室','door',[[-6.4,0,-6],[-3.4,0,-5],[-.5,0,3.8]]),
    site('right-room','右の処置室','door',[[6.4,0,-6],[3.4,0,-5],[.5,0,3.8]]),
    site('reception-vent','受付裏の床下','drain',[[-2,0,-16],[-2,0,-15],[-3.5,0,-14],[-3.5,0,-8],[-.4,0,3.8]],small),
    site('ward-vent','診察室の通風口','drain',[[2,0,-21],[2.4,0,-19],[2.6,0,-16],[3.5,0,-14],[3.5,0,-8],[.4,0,3.8]],small),
    site('ceiling-web','天井の蜘蛛の巣','web',[[-5.5,3.8,-8],[-5.5,0,-8],[-2.8,0,-5],[0,0,3.8]],['spider'])
  ],
  [
    site('left-loading','左の搬入口','door',[[-9.5,0,-8],[-7,0,-5],[-2.5,0,-3],...dock(-.7)]),
    site('right-loading','右の搬入口','door',[[9.5,0,-10],[9.5,0,-6],[2.5,0,-3],...dock(.7)]),
    site('left-container','左コンテナの扉','door',[[-6,0,-11.9],[-6,0,-9],[-2,0,-4],...dock(0)]),
    site('right-container','右コンテナの扉','door',[[6,0,-11.9],[6,0,-8],[2,0,-4],...dock(.7)]),
    site('container-top','コンテナの上','perch',[[5.6,4,-17]],['skeleton'])
  ],
  [
    site('roof-stairs','左の避難階段口','door',[[-8,0,-9],[-8,0,-5],[-3,0,0],[-.6,0,3.8]]),
    site('aircon-top','右空調設備の上','perch',[[5.5,3,-13]],['skeleton']),
    site('left-sky','左上空','air',[[-10,2,-19],[-6,2,-9],[-2,1,-3],[-.8,0,3.8]],['bat']),
    site('right-sky','右上空','air',[[10,2,-20],[7,2,-8],[2,1,-2],[.8,0,3.8]],['bat']),
    site('roof-sky','隔離棟の上空','air',[[0,3,-23],[1.5,2,-14],[-1,1,-4],[0,0,3.4]],['bat'])
  ]
];
const concealmentNames=[
  {'left-street':'左の放置車両の陰','right-shop':'右の資材置場の陰','right-passage':'右の工事資材の陰'},
  {'right-door':'右のごみ収集箱の陰','left-door':'左奥の積み荷の陰'},
  {'left-room':'左の医療物資の陰','right-room':'右の医療機材の陰'},
  {'left-loading':'左の搬入荷物の陰','right-loading':'右の搬入荷物の陰','left-container':'左コンテナ前の積み荷','right-container':'右コンテナ前の積み荷'},
  {'roof-stairs':'左の空調設備の陰'}
];
function conceal(entry,index){
  if(entry.kind!=='door')return entry;
  const [x,y,z]=entry.path[0],inward=x<0?1:-1,cx=x+inward*.35,bendX=cx+inward*1.65;
  const theme=index===2?'medical':index===4?'aircon':index===1&&entry.id==='right-door'?'dumpster':index===0&&entry.id==='left-street'?'van':'cargo';
  return {...entry,kind:'concealed',name:concealmentNames[index][entry.id],cover:{position:[cx,y,z+1.5],theme},
    path:[[x,y,z-(index===0 ? .8 : 0)],[bendX,y,z-(index===0 ? .8 : 0)],[bendX,0,z+3],...entry.path.slice(1).filter(p=>p[2]>z+3)]};
}
export const SPAWN_SITES=STAGES.map((area,i)=>[
  ...area.paths.map((path,n)=>site(`main-${n}`,['左奥の通路','右奥の通路','中央の通路'][n],'route',path)),...extra[area.layout??i].map(entry=>conceal(entry,area.layout??i))
]);
// Balance use across compatible entrances instead of tying one enemy type to a lane.
export function createSpawnSelector(index,random=Math.random){
  const usage=new Map();let last=null;
  return type=>{
    const compatible=SPAWN_SITES[index].filter(s=>s.types.includes(type));
    if(!compatible.length)throw new Error(`No entrance for ${type} in area ${index+1}`);
    const candidates=compatible.length>1?compatible.filter(s=>s.id!==last):compatible;
    const min=Math.min(...candidates.map(s=>usage.get(s.id)||0));
    const least=candidates.filter(s=>(usage.get(s.id)||0)===min);
    const chosen=least[Math.floor(random()*least.length)];
    usage.set(chosen.id,(usage.get(chosen.id)||0)+1);last=chosen.id;return chosen;
  };
}
