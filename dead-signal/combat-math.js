// First contact of a moving projectile with a sphere, as a fraction of the step.
export function segmentSphereEntry(a,b,center,radius) {
  const d=b.map((v,i)=>v-a[i]), m=a.map((v,i)=>v-center[i]);
  const dot=(u,v)=>u.reduce((sum,x,i)=>sum+x*v[i],0);
  const c=dot(m,m)-radius*radius;if(c<=0)return 0;
  const aa=dot(d,d);if(aa===0)return null;
  const bb=dot(m,d), discriminant=bb*bb-aa*c;if(discriminant<0)return null;
  const t=(-bb-Math.sqrt(discriminant))/aa;return t>=0&&t<=1?t:null;
}
