import { WEAPONS } from './engine.js';
// Pointer and keyboard can be held independently; all gameplay exits clear both.
export class FireControl {
  constructor(){this.sources=new Set();}
  hold(source){this.sources.add(source);}
  release(source){this.sources.delete(source);}
  clear(){this.sources.clear();}
  intent(state){
    if(!this.sources.size||state.mode!=='playing'||!WEAPONS[state.weapon].automatic||state.reloadLeft>0||state.cooldown>0)return null;
    return state.ammo[state.weapon]>0?'shoot':'reload';
  }
}
