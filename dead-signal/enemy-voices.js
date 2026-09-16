// Voiced pulses and moving formants create raspy creature sounds without downloaded samples.
export function voiceProfile(type,kind='idle',variation=.5){
  const base={normal:79,runner:106,bomber:63,skeleton:145,wolf:122,bat:440,silverfish:260,spider:195,boss:43}[type]||79;
  const duration=kind==='death'?.55:kind==='hurt'?.26:kind==='attack'?.42:type==='boss'?1.7:1.05+variation*.45;
  return {pitch:base*(.88+variation*.24)*(kind==='hurt'?1.35:1),duration,volume:kind==='idle'?.13:.17,roughness:['skeleton','spider','silverfish'].includes(type)?.7:.25};
}
export function voicePlacement(distance,pan){return {gain:Math.min(1,5/Math.max(5,distance)),pan:Math.max(-.85,Math.min(.85,pan))};}
export function createEnemyVoices(){
  const active=new Set();let last=-10,noiseBuffer=null,noiseContext=null;
  function stopAll(){for(const voice of [...active])voice.stop();}
  return {
    stopAll,
    get activeCount(){return active.size;},
    play(ctx,{type,kind='idle',distance=12,pan=0}){
      const t=ctx.currentTime;
      if(active.size>=3||t-last<(kind==='idle'?.8:.12))return false;
      last=t;const p=voiceProfile(type,kind,Math.random()),placement=voicePlacement(distance,pan),nodes=[],sources=[];
      const track=node=>{nodes.push(node);return node;};
      const envelope=track(ctx.createGain()),stereo=track(ctx.createStereoPanner());stereo.pan.value=placement.pan;
      envelope.gain.setValueAtTime(.0001,t);envelope.gain.exponentialRampToValueAtTime(p.volume*placement.gain,t+.055);envelope.gain.setValueAtTime(p.volume*placement.gain*.7,t+p.duration*.5);envelope.gain.exponentialRampToValueAtTime(.0001,t+p.duration);
      envelope.connect(stereo);stereo.connect(ctx.destination);
      const pulse=track(ctx.createGain());pulse.gain.value=.75;
      const tremolo=track(ctx.createOscillator()),depth=track(ctx.createGain());tremolo.frequency.value=18+Math.random()*9;depth.gain.value=.2;tremolo.connect(depth);depth.connect(pulse.gain);sources.push(tremolo);
      const throat=track(ctx.createBiquadFilter());throat.type='lowpass';throat.frequency.value=1800;throat.Q.value=.6;pulse.connect(throat);throat.connect(envelope);
      for(const [ratio,level] of [[1,.42],[.51,.18]]){
        const osc=track(ctx.createOscillator()),gain=track(ctx.createGain()),formant=track(ctx.createBiquadFilter());osc.type='sawtooth';gain.gain.value=level;
        osc.frequency.setValueAtTime(p.pitch*ratio,t);osc.frequency.linearRampToValueAtTime(p.pitch*ratio*1.18,t+p.duration*.3);osc.frequency.exponentialRampToValueAtTime(p.pitch*ratio*(kind==='death'?.42:.73),t+p.duration);
        formant.type='bandpass';formant.Q.value=1.2;formant.frequency.setValueAtTime(ratio===1?480:920,t);formant.frequency.linearRampToValueAtTime(ratio===1?270:620,t+p.duration);
        osc.connect(formant);formant.connect(gain);gain.connect(pulse);sources.push(osc);
      }
      if(noiseContext!==ctx){noiseContext=ctx;noiseBuffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}
      const breath=track(ctx.createBufferSource()),filter=track(ctx.createBiquadFilter()),gain=track(ctx.createGain());breath.buffer=noiseBuffer;filter.type='bandpass';filter.frequency.value=type==='bat'?2500:740;filter.Q.value=.8;gain.gain.value=p.roughness;breath.connect(filter);filter.connect(gain);gain.connect(pulse);sources.push(breath);
      let stopped=false;const voice={stop(){if(stopped)return;stopped=true;for(const s of sources){try{s.stop();}catch{}}for(const n of nodes)n.disconnect();active.delete(voice);}};
      active.add(voice);breath.onended=voice.stop;
      for(const s of sources){s.start(t);s.stop(t+p.duration+.02);}
      return true;
    }
  };
}
