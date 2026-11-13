/* A single connected Level 0. The same wall segments drive rendering and collision. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const key=(a,b)=>a<b?a+','+b:b+','+a;
function random(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296}}
function pointSegmentDistance2(px,pz,ax,az,bx,bz){
 const dx=bx-ax,dz=bz-az,length2=dx*dx+dz*dz;
 const t=length2?clamp(((px-ax)*dx+(pz-az)*dz)/length2,0,1):0;
 return (px-ax-t*dx)**2+(pz-az-t*dz)**2;
}
function segmentDistance2(ax,az,bx,bz,cx,cz,dx,dz){
 const rx=bx-ax,rz=bz-az,sx=dx-cx,sz=dz-cz,den=rx*sz-rz*sx;
 if(den!==0){
  const qx=cx-ax,qz=cz-az,t=(qx*sz-qz*sx)/den,u=(qx*rz-qz*rx)/den;
  if(t>=0&&t<=1&&u>=0&&u<=1)return 0;
 }
 return Math.min(pointSegmentDistance2(ax,az,cx,cz,dx,dz),pointSegmentDistance2(bx,bz,cx,cz,dx,dz),
  pointSegmentDistance2(cx,cz,ax,az,bx,bz),pointSegmentDistance2(dx,dz,ax,az,bx,bz));
}
export function createLevel0Navigation(){
 const columns=12,rows=12,cellSize=6,size=columns*cellSize,low=-size/2,random01=random(456789),n=columns*rows;
 const all=[];
 for(let z=0;z<rows;z++)for(let x=0;x<columns;x++){let i=z*columns+x;if(x+1<columns)all.push([i,i+1]);if(z+1<rows)all.push([i,i+columns]);}
 const adjacent=Array.from({length:n},()=>[]);
 for(const [a,b] of all){adjacent[a].push(b);adjacent[b].push(a)}
 // A randomized spanning tree guarantees connectivity. Extra links create loops.
 const seen=new Uint8Array(n),stack=[Math.floor(rows/2)*columns+Math.floor(columns/2)],tree=new Set();seen[stack[0]]=1;
 while(stack.length){let a=stack.at(-1),choices=adjacent[a].filter(b=>!seen[b]);if(!choices.length){stack.pop();continue}let b=choices[Math.floor(random01()*choices.length)];tree.add(key(a,b));seen[b]=1;stack.push(b)}
 const edges=[],walls=[];
 function wall(x1,z1,x2,z2){if(Math.hypot(x2-x1,z2-z1)>.01)walls.push([x1,z1,x2,z2])}
 // Shared edges of the conceptual rooms are not hallways: some walls are
 // entirely absent to join cells into rooms of differing sizes.
 for(const [a,b] of all){
  let join=tree.has(key(a,b))||random01()<.40,open=join&&random01()<.35,shift=(random01()-.5)*1.4;
  const doorWidth=2.2+random01()*.65,axis=b===a+1?'x':'z';
  let ax=a%columns,az=Math.floor(a/columns),fixed=axis==='x'?low+(ax+1)*cellSize:low+(az+1)*cellSize;
  let first=axis==='x'?low+az*cellSize:low+ax*cellSize,last=first+cellSize;
  let middle=(first+last)/2+shift;
  const add=(p,q)=>axis==='x'?wall(fixed,p,fixed,q):wall(p,fixed,q,fixed);
  if(!join)add(first,last);else if(!open){add(first,middle-doorWidth/2);add(middle+doorWidth/2,last)}
  edges.push({a,b,kind:!join?'wall':open?'open':'door',width:open?cellSize:join?doorWidth:0});
 }
 wall(low,low,-low,low);wall(low,-low,-low,-low);wall(low,low,low,-low);wall(-low,low,-low,-low);
 // Internal exit and its surround sit within one room away from the outside.
 const door=[-15,0,-21],exitBarrier=[-16.66,-21,-13.34,-21];wall(...exitBarrier);
 const nav={columns,rows,cellSize,maze:{columns,rows,edges},walls,step:.5,minx:low,minz:low,maxx:-low,maxz:-low,
  width:Math.round(size/.5)+1,height:Math.round(size/.5)+1,clearance:.25,links:[],exitYaw:0,exitDoorPosition:door,exitOrigin:[door[0],door[2]]};
 nav.length=nav.width*nav.height;
 const buckets=new Map();
 for(const s of walls){let [x,z,X,Z]=s;for(let a=Math.floor(Math.min(x,X)/2);a<=Math.floor(Math.max(x,X)/2);a++)for(let b=Math.floor(Math.min(z,Z)/2);b<=Math.floor(Math.max(z,Z)/2);b++){let k=a+','+b;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(s)}}
 nav.point=i=>[low+(i%nav.width)*nav.step,low+Math.floor(i/nav.width)*nav.step];
 nav.index=(x,z)=>{let c=Math.round((x-low)/nav.step),r=Math.round((z-low)/nav.step);return c>=0&&r>=0&&c<nav.width&&r<nav.height?r*nav.width+c:-1};
 nav.canWalk=(x,z)=>{
  if(!Number.isFinite(x)||!Number.isFinite(z)||x<=low||x>=-low||z<=low||z>=-low)return false;
  let a=Math.floor(x/2),b=Math.floor(z/2),rr=nav.clearance*nav.clearance;
  for(let i=a-1;i<=a+1;i++)for(let j=b-1;j<=b+1;j++)for(const [x1,z1,x2,z2] of buckets.get(i+','+j)||[]){
   let dx=x2-x1,dz=z2-z1,t=clamp(((x-x1)*dx+(z-z1)*dz)/(dx*dx+dz*dz),0,1);
   if((x-x1-t*dx)**2+(z-z1-t*dz)**2<rr)return false;
  }
  return true;
 };
 const cells=new Uint8Array(nav.length);for(let i=0;i<nav.length;i++)cells[i]=nav.canWalk(...nav.point(i))?1:0;
 nav.free=Array.from(cells,x=>x?'1':'0').join('');
 nav.open=i=>Number.isInteger(i)&&i>=0&&i<nav.length&&cells[i]===1;
 // Precompute valid graph edges once. Pursuit and guidance then avoid repeated
 // collision checks while retaining the same physical walls.
 const links=new Uint8Array(nav.length),offsets=[-1,1,-nav.width,nav.width];
 for(let i=0;i<nav.length;i++)if(nav.open(i)){
  let c=i%nav.width,r=Math.floor(i/nav.width),p=nav.point(i);
  for(let d=0;d<4;d++){
   if((d===0&&c===0)||(d===1&&c===nav.width-1)||(d===2&&r===0)||(d===3&&r===nav.height-1))continue;
   let j=i+offsets[d];if(!nav.open(j))continue;let q=nav.point(j);
   if(nav.canWalk((p[0]+q[0])/2,(p[1]+q[1])/2))links[i]|=1<<d;
  }
 }
 nav.neighbors=i=>{if(!nav.open(i))return [];let out=[];for(let d=0;d<4;d++)if(links[i]&(1<<d))out.push(i+offsets[d]);return out};
 nav.nearest=(x,z)=>{if(!Number.isFinite(x)||!Number.isFinite(z))return -1;let i=nav.index(x,z);if(nav.open(i))return i;let c=Math.round((x-low)/nav.step),r=Math.round((z-low)/nav.step),best=-1,dist=Infinity;for(let radius=1;radius<=8&&best<0;radius++)for(let zz=-radius;zz<=radius;zz++)for(let xx=-radius;xx<=radius;xx++){let cx=c+xx,rz=r+zz;if(cx<0||cx>=nav.width||rz<0||rz>=nav.height)continue;let j=rz*nav.width+cx;if(!nav.open(j))continue;let p=nav.point(j),d=(p[0]-x)**2+(p[1]-z)**2;if(d<dist){dist=d;best=j}}return best};
 nav.nearestSafe=nav.nearest;nav.floorAt=()=>0;
 // A visible route must fit the same clearance capsule as movement. Sampling
 // missed short intersections near rounded wall ends, even with valid endpoints.
 nav.visible=(a,b)=>{
  if(!a||!b||![a[0],a[1],b[0],b[1]].every(Number.isFinite))return false;
  if(a[0]<=low||a[0]>=-low||a[1]<=low||a[1]>=-low||b[0]<=low||b[0]>=-low||b[1]<=low||b[1]>=-low)return false;
  const r=nav.clearance,rr=r*r,checked=new Set();
  const x0=Math.floor((Math.min(a[0],b[0])-r)/2),x1=Math.floor((Math.max(a[0],b[0])+r)/2);
  const z0=Math.floor((Math.min(a[1],b[1])-r)/2),z1=Math.floor((Math.max(a[1],b[1])+r)/2);
  for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)for(const wall of buckets.get(x+','+z)||[]){
   if(checked.has(wall))continue;checked.add(wall);
   if(segmentDistance2(a[0],a[1],b[0],b[1],...wall)<rr)return false;
  }
  return true;
 };
 nav.move=(p,dx,dz)=>{if(!Number.isFinite(dx)||!Number.isFinite(dz))return p;let n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.06));for(let i=0;i<n;i++){let x=p[0]+dx/n,z=p[1]+dz/n;if(nav.canWalk(x,p[1]))p[0]=x;if(nav.canWalk(p[0],z))p[1]=z}return p};
 nav.start=nav.nearest(1.5,1.5);nav.enemy=nav.nearest(-21,-21);nav.exit=nav.nearest(-15,-22.5);
 nav.fuses=[];nav.patrol=[nav.nearest(-27,-21),nav.nearest(27,-21),nav.nearest(-21,27),nav.nearest(21,21)].filter(i=>i>=0);
 nav.regions=[{base:0,nav:{start:nav.start}}];nav.regionAt=()=>0;
 nav.forEachOpen=fn=>{for(let i=0;i<nav.length;i++)if(nav.open(i)){let p=nav.point(i);fn(...p,nav.step)}};
 nav.path=(start,end)=>{
  if(!nav.open(start)||!nav.open(end))return [];
  // The exit is static, so one reverse tree services every HUD update.
  if(end===nav.exit){
   if(!nav.exitTree){
    let prev=new Int32Array(nav.length).fill(-1),q=new Int32Array(nav.length),head=0,tail=0;q[tail++]=end;prev[end]=end;
    while(head<tail){let i=q[head++],mask=links[i];for(let d=0;d<4;d++)if(mask&(1<<d)){let j=i+offsets[d];if(prev[j]<0){prev[j]=i;q[tail++]=j}}}
    nav.exitTree=prev;
   }
   if(nav.exitTree[start]<0)return [];
   let path=[start],i=start;while(i!==end){i=nav.exitTree[i];path.push(i)}return path;
  }
  // Bidirectional search limits the work for moving pursuit targets.
  if(start===end)return [start];
  let left=new Int32Array(nav.length).fill(-1),right=new Int32Array(nav.length).fill(-1),a=[start],b=[end],meet=-1;left[start]=start;right[end]=end;
  while(a.length&&b.length&&meet<0){
   let forward=a.length<=b.length,front=forward?a:b,own=forward?left:right,other=forward?right:left,next=[];
   for(const i of front){let mask=links[i];for(let d=0;d<4;d++)if(mask&(1<<d)){let j=i+offsets[d];if(own[j]>=0)continue;own[j]=i;next.push(j);if(other[j]>=0){meet=j;break}}if(meet>=0)break}
   if(forward)a=next;else b=next;
  }
  if(meet<0)return [];
  let before=[meet],i=meet;while(i!==start){i=left[i];before.push(i)}before.reverse();i=meet;while(i!==end){i=right[i];before.push(i)}return before;
 };
 return nav;
}
