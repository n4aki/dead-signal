export function createRouteChoice(onChoose){
  const panel=document.getElementById('route-choice'),cards=document.getElementById('route-options');
  panel.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const buttons=[...cards.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
  const diagram=theme=>theme==='alley'
    ? '<path class="route-blocks" d="M12 9h62v22H12zM113 9h109v22H113zM12 51h105v22H12zM157 51h65v22h-65z"/><path class="route-line" d="M94 78V41h43V0"/>'
    : '<path class="route-blocks" d="M12 9h62v23H12zM166 9h56v23h-56zM12 49h62v24H12zM166 49h56v24h-56z"/><path class="route-line" d="M120 78V0"/><path class="route-edge" d="M94 78V0M146 78V0"/>';
  return {
    open(options){
      cards.replaceChildren();
      for(const option of options){
        const button=document.createElement('button');button.type='button';button.className=`route-card ${option.theme}`;
        button.innerHTML=`<span class="route-card-top"><b>${option.code}</b><span>${option.tag}</span></span><svg viewBox="0 0 240 80" aria-hidden="true">${diagram(option.theme)}</svg><strong>${option.name}</strong><span class="route-place">${option.place}</span><span class="route-description">${option.description}</span><span class="route-enemies">出現傾向 / ${option.enemies}</span><span class="route-select-label">このルートへ <b>↗</b></span>`;
        button.onclick=()=>onChoose(option.id);cards.append(button);
      }
      panel.hidden=false;cards.querySelector('button')?.focus();
    },
    close(){panel.hidden=true;},
    focus(){cards.querySelector('button')?.focus();}
  };
}
