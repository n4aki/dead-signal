import { encounterProfile } from './enemy-data.js';

export const DEFAULT_ROUTE=[0,1,2,3,4];
const CHECKPOINT_ROUTES=[
  {id:'alley',stage:1,code:'ROUTE A',name:'裏路地を抜ける',place:'裏路地・死角',tag:'近距離 / 小型の群れ',description:'狭い路地を低い視点で進む。物陰から飛び出す猟犬と蜘蛛を迎え撃とう。',enemies:'猟犬・蜘蛛・這虫',travel:'右へ曲がり、裏路地から病院を目指す',theme:'alley'},
  {id:'avenue',stage:5,code:'ROUTE B',name:'大通りを進む',place:'大通り・包囲線',tag:'中〜遠距離 / 射手の包囲',description:'開けた道路を正面突破。車両の陰の感染者と、高所から狙う射手に注意。',enemies:'感染者・骨の射手',travel:'左へ曲がり、大通りから病院を目指す',theme:'avenue'},
];
const avenueProfile={label:'大通りの感染者と射手',tip:'開けた射線で感染者を排除。高所の射手と飛来する矢を優先しよう。',roster:Array.from({length:27},(_,i)=>i%9<5?'normal':'skeleton')};
export function routeChoices(wave){return wave===1?CHECKPOINT_ROUTES:[];}
export function routeEncounter(wave,stage=wave-1){return stage===5?avenueProfile:encounterProfile(wave);}
