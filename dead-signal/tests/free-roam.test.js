import test from 'node:test';
import assert from 'node:assert/strict';
import {NavigationGrid,FreePlayer} from '../free-roam.js';
const bounds={minX:-5,maxX:5,minZ:-10,maxZ:10};
const cover={min:[-1,0,-2],max:[1,3,2]};

test('destroyed cover releases player collision and cached pursuit routes',()=>{
  const nav=new NavigationGrid([cover],{bounds,cell:.5,radius:.5});
  assert.ok(nav.path([0,0,8],[0,0,-8]).length>2);
  assert.equal(nav.clear([0,0,0],.32),false);
  nav.setBoxes([]);
  assert.ok(nav.clear([0,0,0],.32));
  assert.equal(nav.path([0,0,8],[0,0,-8]).length,2);
});

test('pursuit routes go around cover and update when the target moves',()=>{
  const nav=new NavigationGrid([cover],{bounds,cell:.5,radius:.5});
  const a=nav.path([0,0,8],[0,0,-8]);assert.ok(a&&a.length>2);
  assert.ok(a.some(p=>Math.abs(p[0])>=1.5));
  for(let i=1;i<a.length;i++)assert.ok(nav.line(a[i-1],a[i]));
  const b=nav.path([0,0,8],[4,0,7]);assert.ok(b);assert.deepEqual(b.at(-1),[4,0,7]);assert.notDeepEqual(a,b);
  assert.equal(nav.path([0,0,0],[0,0,-8]),null,'never teleport a trapped start through a solid object');
});
test('player movement is view relative, diagonal speed is normalized and sprint is faster',()=>{
  const nav=new NavigationGrid([],{bounds}),a=new FreePlayer(nav),b=new FreePlayer(nav),c=new FreePlayer(nav);
  for(let i=0;i<10;i++){a.step(.05,new Set(['w']));b.step(.05,new Set(['w','d']));c.step(.05,new Set(['w','shift']));}
  assert.ok(Math.abs(a.travel-b.travel)<1e-8);assert.ok(c.travel>a.travel*1.4);
  a.reset();a.yaw=-Math.PI/2;a.step(.05,new Set(['w']));assert.ok(a.position[0]>0);assert.ok(Math.abs(a.position[2]-8.5)<1e-8);
});
test('movement cannot tunnel through cover or arena edges and can slide along walls',()=>{
  const nav=new NavigationGrid([cover],{bounds}),p=new FreePlayer(nav);p.position=[0,0,4];
  for(let i=0;i<50;i++)p.step(.05,new Set(['w','shift']));assert.ok(p.position[2]>=2.32);
  for(let i=0;i<60;i++)p.step(.05,new Set(['w','d']));assert.ok(p.position[0]>1.32&&p.position[2]<2);
  for(let i=0;i<200;i++)p.step(.05,new Set(['w','d','shift']));assert.ok(p.position[0]<=5&&p.position[2]>=-10);
  assert.ok(nav.clear(p.position,.32));
});
test('player respects nearby enemy bodies, reset and looking limits',()=>{
  const p=new FreePlayer(new NavigationGrid([],{bounds}));
  for(let i=0;i<50;i++)p.step(.05,new Set(['w']),[[0,0,6]]);
  assert.ok(p.position[2]>=6.7);p.look(500,10000);assert.equal(p.pitch,-1.2);assert.notEqual(p.yaw,0);
  p.reset();assert.deepEqual(p.position,[0,0,8.5]);assert.equal(p.pitch,0);assert.equal(p.yaw,0);
});
test('overhead beams do not block ground navigation and small gaps reject large bodies',()=>{
  const nav=new NavigationGrid([{min:[-2,4,-4],max:[2,5,4]}],{bounds});assert.ok(nav.path([0,0,8],[0,0,-8]));
  const n=new NavigationGrid([cover],{bounds,radius:.78});assert.ok(n.clear([1.5,0,0],.32));assert.equal(n.clear([1.5,0,0]),false);
  const target=n.targetNear([1.5,0,0]);assert.ok(target&&n.clear(target));
});
