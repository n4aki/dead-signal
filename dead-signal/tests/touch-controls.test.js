import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {FireControl} from '../combat-input.js';
function setup(freeMode){
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{events:{},style:{},classList:{add(){},remove(){}},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:100,height:100}},addEventListener(k,f){(this.events[k]??=[]).push(f)}});return elements.get(id)};
 const ctx={$:element,window:element('window'),state:{mode:'playing'},freeMode,innerWidth:1000,innerHeight:500,trigger:new FireControl(),freePlayer:{look(x,y){ctx.looks.push([x,y])}},looks:[],shots:0,fire(){ctx.shots++},moveCrosshair(){},pointer:{x:0,y:0,set(x,y){this.x=x;this.y=y},clampScalar(){}}};
 const s=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
 vm.runInNewContext(s.slice(s.indexOf('// Touch pointers'),s.indexOf("$('scene').addEventListener('pointermove', e => {")),ctx);
 const send=(id,type,pointerId,x=200,y=200)=>{for(const f of element(id).events[type]||[])f({pointerType:'touch',pointerId,clientX:x,clientY:y,preventDefault(){},stopImmediatePropagation(){}})};
 return {ctx,send};
}
test('fire thumb can aim while movement thumb stays down, and cancellation stops firing',()=>{
 const {ctx,send}=setup(true);send('move-pad','pointerdown',1,50,10);send('touch-fire','pointerdown',2);send('touch-fire','pointermove',2,230,180);
 assert.equal(ctx.shots,1);assert.deepEqual(ctx.looks,[[30,-20]]);assert.ok(ctx.trigger.sources.has('touch'));
 send('window','pointerup',1);assert.ok(ctx.trigger.sources.has('touch'));
 send('window','pointercancel',2);assert.equal(ctx.trigger.sources.size,0);
 send('touch-fire','pointermove',2,300,200);assert.equal(ctx.looks.length,1);
});
test('arcade direct touch fires on target; fire-pad drag keeps aim relative without jumping',()=>{
 const {ctx,send}=setup(false);send('scene','pointerdown',1,750,250);assert.equal(ctx.pointer.x,.5);assert.equal(ctx.shots,1);
 send('touch-fire','pointerdown',2,900,400);assert.equal(ctx.pointer.x,.5);
 send('touch-fire','pointermove',2,850,350);assert.equal(ctx.pointer.x,.4);assert.equal(ctx.pointer.y,.2);
 send('window','pointerup',1);assert.ok(ctx.trigger.sources.has('touch'));
 send('window','lostpointercapture',2);assert.equal(ctx.trigger.sources.size,0);
});
