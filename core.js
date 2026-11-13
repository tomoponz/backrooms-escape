export class Navigation{
 constructor(data){Object.assign(this,data);this.buckets=new Map();for(const s of this.segments){let [ax,az,bx,bz]=s;for(let x=Math.floor(Math.min(ax,bx)/2);x<=Math.floor(Math.max(ax,bx)/2);x++)for(let z=Math.floor(Math.min(az,bz)/2);z<=Math.floor(Math.max(az,bz)/2);z++){let k=x+','+z;if(!this.buckets.has(k))this.buckets.set(k,[]);this.buckets.get(k).push(s)}}}
 point(i){return[this.minx+(i%this.width)*this.step,this.minz+Math.floor(i/this.width)*this.step]}
 index(x,z){let c=Math.round((x-this.minx)/this.step),r=Math.round((z-this.minz)/this.step);return c>=0&&r>=0&&c<this.width&&r<this.height?r*this.width+c:-1}
 open(i){return i>=0&&this.free[i]==='1'}
 neighbors(i){let c=i%this.width,r=Math.floor(i/this.width);return[i-this.width,i+this.width,c?i-1:-1,c<this.width-1?i+1:-1].filter(n=>n>=0&&n<this.free.length&&this.open(n))}
 canWalk(x,z){if(!this.open(this.index(x,z)))return false;let bx=Math.floor(x/2),bz=Math.floor(z/2);for(let a=bx-1;a<=bx+1;a++)for(let b=bz-1;b<=bz+1;b++)for(let [ax,az,cx,cz] of this.buckets.get(a+','+b)||[]){let dx=cx-ax,dz=cz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));if((x-ax-dx*t)**2+(z-az-dz*t)**2<.21**2)return false}return true}
 move(pos,dx,dz){let count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.07));for(let k=0;k<count;k++){if(this.canWalk(pos[0]+dx/count,pos[1]))pos[0]+=dx/count;if(this.canWalk(pos[0],pos[1]+dz/count))pos[1]+=dz/count}return pos}
 nearest(x,z){let i=this.index(x,z);if(this.open(i))return i;let best=-1,dist=Infinity;for(let k=0;k<this.free.length;k++)if(this.open(k)){let p=this.point(k),d=(p[0]-x)**2+(p[1]-z)**2;if(d<dist){best=k;dist=d}}return best}
 path(start,end){if(start===end)return[start];let prev=new Int32Array(this.free.length).fill(-1),q=new Int32Array(this.free.length),head=0,tail=0;q[tail++]=start;prev[start]=start;while(head<tail){let i=q[head++];for(let n of this.neighbors(i))if(prev[n]<0){prev[n]=i;q[tail++]=n;if(n===end){let out=[end];while(out.at(-1)!==start)out.push(prev[out.at(-1)]);return out.reverse()}}}return[]}
 visible(a,b){let dx=b[0]-a[0],dz=b[1]-a[1],n=Math.ceil(Math.hypot(dx,dz)/.18);for(let i=1;i<n;i++)if(!this.open(this.index(a[0]+dx*i/n,a[1]+dz*i/n)))return false;return true}
}
export const formatTime=s=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
