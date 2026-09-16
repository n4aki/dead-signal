const dockApproach = x => [...Array.from({length:6},(_,i)=>[x,(i+1)*.25,-.1+i*.65]),[x,1.5,4],[x,1.5,5]];
// Stage coordinates are local: +Z faces the player. Transform both actors and camera rails.
export const AREAS = [
  {
    name: '封鎖検問所', sign: 'CHECKPOINT', origin: [0, 0, 0], yaw: 0,
    hint: '車両とバリケードの脇を警戒', travel: '検問を抜け、右の裏路地へ',
    color: '#243746', light: '#ffd599', indoor: false,
    shots: [ { position: [0, 2.4, 9], target: [0, 1.6, -18] }, { position: [1.6, 2.1, 8], target: [-1, 1.5, -16] } ],
    entry: { position: [-2, 2.7, 14], target: [2, 1.6, -10] },
    exit: { position: [3, 2.1, -1], target: [9, 1.8, -8] },
    branchExits: {5:{position:[-3,2.1,-1],target:[-9,1.8,-8]}},
    barrels: [[-2.8, 0, -12], [3.5, 0, -21]],
    paths: [ [[-5,0,-20],[-5,0,-16.8],[-1.5,0,-16.8],[-1.5,0,-9],[0,0,3.8]], [[4.8,0,-28.2],[4.8,0,-24],[2.3,0,-24],[2.3,0,-12],[.4,0,3.8]], [[.5,0,-34],[.5,0,-17],[-.7,0,3.8]] ]
  },
  {
    name: '裏路地・死角', sign: 'BLIND ALLEY', origin: [40, 0, -45], yaw: -Math.PI / 2,
    hint: '低い視点から、物陰の飛び出しを狙え', travel: '路地の非常口から病院へ侵入',
    color: '#202e40', light: '#9ccde7', indoor: false,
    shots: [ { position: [-1.8, 1.6, 8], target: [.3, 1.25, -16] }, { position: [.9, 1.9, 7.5], target: [-.5, 1.35, -16] } ],
    entry: { position: [3.2, 1.8, 12], target: [-1.8, 1.4, -5] },
    exit: { position: [1.2, 1.75, -2], target: [4, 1.8, -10] },
    barrels: [[2.8,0,-9],[-1,0,-22]],
    paths: [ [[-3,0,-21],[-3,0,-18],[-.6,0,-18],[-.6,0,-10],[-.5,0,3.5]], [[3,0,-28],[3,0,-21],[.3,0,-21],[.3,0,-10],[.3,0,3.5]], [[.4,0,-33],[.4,0,-24],[1.1,0,-16],[.5,0,3.5]] ]
  },
  {
    name: '病院・救急ロビー', sign: 'EMERGENCY WARD', origin: [60, 0, -100], yaw: Math.PI / 3,
    hint: '診察室の扉と受付カウンターを警戒', travel: '病院を抜け、倉庫の搬入口へ',
    color: '#293c47', light: '#b4e9ed', indoor: true,
    shots: [ { position: [3, 2.1, 8], target: [-1.5, 1.5, -15] }, { position: [-2.4, 2.05, 8], target: [1.3, 1.5, -17] } ],
    entry: { position: [0, 2, 13], target: [-5, 1.7, -10] },
    exit: { position: [-4, 2, 0], target: [-6, 1.6, -11] },
    barrels: [[-6.3,0,-11],[5.8,0,-19]],
    paths: [ [[-5,0,-28],[-5,0,-23],[-6,0,-18],[-6,0,-9],[-2.8,0,-5],[0,0,3.8]], [[5,0,-28],[5,0,-23],[6,0,-18],[6,0,-9],[2.8,0,-5],[.5,0,3.8]], [[0,0,-29],[0,0,-22],[-2.5,0,-18],[-3.5,0,-12],[-3.5,0,-8],[-.4,0,3.8]] ]
  },
  {
    name: '倉庫・搬入デッキ', sign: 'FREIGHT DEPOT', origin: [0, 0, -150], yaw: -Math.PI / 4,
    hint: '高所からコンテナの間を見下ろせ', travel: '避難階段を上り、屋上へ',
    color: '#382f23', light: '#ffc57a', indoor: true,
    shots: [ { position: [3.8, 3.8, 8.5], target: [-1.3, 1.3, -17] }, { position: [-3.4, 3.5, 8], target: [1, 1.3, -18] } ],
    entry: { position: [-3.8, 2.6, 12], target: [3, 1.2, -8] },
    exit: { position: [-4, 5.8, 10], target: [-6, 7.3, 5] },
    barrels: [[-3,0,-16],[3,0,-22]],
    paths: [ [[-6,0,-31],[-6,0,-27],[-2.5,0,-27],[-2.5,0,-15],[-2.5,0,-3],...dockApproach(0)], [[6,0,-31],[6,0,-27],[2.5,0,-27],[2.5,0,-15],[2.5,0,-3],...dockApproach(.7)], [[0,0,-34],[0,0,-28],[2.5,0,-28],[2.5,0,-20],[0,0,-4],...dockApproach(-.7)] ]
  },
  {
    name: '屋上・最終退避地点', sign: 'ROOFTOP EXTRACTION', origin: [-55, 18, -195], yaw: Math.PI / 5,
    hint: '空調設備の陰と中央の隔離扉を警戒', travel: '',
    color: '#4a302d', light: '#ffac8c', indoor: false,
    shots: [ { position: [-3.5, 2.5, 8], target: [.7, 1.6, -16] }, { position: [2.5, 2.4, 8], target: [-.7, 1.7, -17] } ],
    entry: { position: [-6, 1.7, 12], target: [4, 2.8, -10] },
    exit: { position: [0, 3, 0], target: [0, 2, -20] },
    barrels: [[-3,0,-9],[3.3,0,-17]],
    paths: [ [[-5.5,0,-21],[-5.5,0,-17],[-2.8,0,-17],[-2.8,0,-9],[-.6,0,3.8]], [[5.5,0,-24],[5.5,0,-18],[2.8,0,-18],[2.8,0,-8],[.6,0,3.8]], [[0,0,-27],[0,0,-16],[0,0,3.4]] ],
    bossPath: [[0,0,-27],[0,0,-15],[0,0,2.2]]
  }
];
// Encounter number and physical location are separate: both branches rejoin at the hospital.
export const STAGES=[...AREAS,{
  ...AREAS[0],layout:0,name:'大通り・包囲線',sign:'EVACUATION AVENUE',
  origin:[-48,0,-55],yaw:Math.PI/2,color:'#383326',light:'#ffd5a0',
  hint:'開けた道路と高所の射手を警戒',travel:'大通りを抜け、病院の正面玄関へ',
  shots:[{position:[-1.5,2.6,9],target:[.6,1.6,-18]},{position:[1.6,2.1,8],target:[-1,1.5,-16]}],
  entry:{position:[-2,2.7,14],target:[2,1.6,-10]},
}];
export const smooth = t => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export function toWorld(area, p) { const c = Math.cos(area.yaw), s = Math.sin(area.yaw); return [area.origin[0] + p[0] * c + p[2] * s, area.origin[1] + p[1], area.origin[2] - p[0] * s + p[2] * c]; }
export function mixPose(a, b, t) { return { position: mix(a.position, b.position, t), target: mix(a.target, b.target, t) }; }
export function worldPose(area, pose) { return { position: toWorld(area, pose.position), target: toWorld(area, pose.target) }; }
// A short fade covers the cut between connected scenes; approach and exit rails stay inside open space.
export function travelPose(index, progress, start = STAGES[index].shots[0], destination = index + 1) {
  const p = Math.max(0, Math.min(1, progress)), departing = p < .5;
  const stage = departing ? index : destination, area = STAGES[stage];
  const local = departing ? mixPose(start, area.branchExits?.[destination]||area.exit, smooth(p * 2)) : mixPose(area.entry, area.shots[0], smooth((p - .5) * 2));
  return { ...worldPose(area, local), stage, fade: smooth(1 - Math.abs(p - .5) / .1) };
}
export function walkPath(points, distance) {
  let left = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) { const len = Math.hypot(...points[i].map((v, j) => v - points[i - 1][j])); if (left < len) return { position: mix(points[i - 1], points[i], left / len), arrived: false }; left -= len; }
  return { position: [...points.at(-1)], arrived: true };
}
