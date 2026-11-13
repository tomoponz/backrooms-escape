import {M} from './engine.js';
// Fixed room trims are mirrored by the renderer; locations outside a clipped
// room are not walkable unless they are inside an actual shared doorway.
export const ROOM_CLIP_X=Object.freeze({level0:[-67.82,Infinity],baked:[-8.32,5.78],original:[-12.5,37.68],dreamcore:[-Infinity,-27.4]});

// Each approved environment retains its native collision grid. Translations
// place all four in one physical coordinate system; the links are walkable
// corridors, not scene transitions or teleports.
export const PLACEMENTS = Object.freeze([
  {id:'level0',offset:[0,0.11756357598021501,0],anchors:[8425]},
  {id:'baked',offset:[-73.6,0,7.222090167437622],anchors:[1142,1093]},
  {id:'original',offset:[-119.6,-0.008085817098617554,7.140230402384825],anchors:[8915,8739]},
  {id:'dreamcore',offset:[-104.7,-7.2724,7.402090167437615],anchors:[14962]}
]);
const CENTER_Z=7.152090167437622, HALF_WALK=.92, OVERLAP=.38;
const LINKS=Object.freeze([[0,0,1,0],[1,1,2,0],[2,1,3,0]]);

export class ContinuousNavigation {
  constructor(stages){
    this.regions=stages.map((s,i)=>({stage:s,nav:s.nav,offset:PLACEMENTS[i].offset,base:0}));
    let base=0;
    for(const r of this.regions){r.base=base;base+=r.nav.free.length;}
    this.links=[];this.anchorEdges=new Map();
    for(const [ar,aa,br,ba] of LINKS){
      const A=this.regions[ar],B=this.regions[br],ai=A.base+PLACEMENTS[ar].anchors[aa],bi=B.base+PLACEMENTS[br].anchors[ba];
      const ap=this.point(ai),bp=this.point(bi),n=Math.max(1,Math.ceil(Math.hypot(ap[0]-bp[0],ap[1]-bp[1])/.28));
      const link={a:ai,b:bi,ap,bp,base,count:n-1,regions:[ar,br]};base+=link.count;this.links.push(link);
      const edge=(id,other)=>{if(!this.anchorEdges.has(id))this.anchorEdges.set(id,[]);this.anchorEdges.get(id).push(other)};
      edge(ai,link.count?link.base:bi);edge(bi,link.count?link.base+link.count-1:ai);
    }
    this.length=base;this.start=this.regions[0].base+this.regions[0].nav.start;
    // The goal is a walkable cell immediately in front of the solid door.
    // Keeping it separate from the door lets E work without walking through it.
    const last=this.regions.at(-1),doorIndex=25995;
    this.exit=last.base+25821;
    this.exitYaw=0;
    // The exit surround is rendered as two solid panels. Inflate their
    // rectangles by the player's collision radius, leaving the central door
    // open and making the graph and physical movement agree with the image.
    const ep=this.point(last.base+doorIndex),lp=last.nav.point(doorIndex),radius=.20;
    this.exitDoorPosition=[ep[0],last.nav.floorAt(...lp)+last.offset[1],ep[1]];
    this.exitOrigin=ep;
    // Adjacent frame pieces and the center leaf form one solid span once
    // inflated by the player's radius. The goal remains outside this box.
    this.exitBarriers=[{xmin:-1.66-radius,xmax:1.66+radius,zmin:-.09-radius,zmax:.18+radius}];
    this.enemy=this.regions[0].base+this.regions[0].nav.enemy;
    // Legacy reference points are not gameplay pickups. Project any point that
    // is now inside a sealed join onto the nearest walkable cell.
    this.fuses=this.regions.flatMap(r=>r.nav.fuses.map(i=>r.base+i)).map(i=>this.open(i)?i:this.nearest(...this.point(i)));
    this.minx=Math.min(...this.regions.map(r=>r.nav.minx+r.offset[0]));
    this.minz=Math.min(...this.regions.map(r=>r.nav.minz+r.offset[2]));
    this.maxx=Math.max(...this.regions.map(r=>r.nav.minx+(r.nav.width-1)*r.nav.step+r.offset[0]));
    this.maxz=Math.max(...this.regions.map(r=>r.nav.minz+(r.nav.height-1)*r.nav.step+r.offset[2]));
  }
  _region(i){return this.regions.find(r=>i>=r.base&&i<r.base+r.nav.free.length)}
  _link(i){return this.links.find(l=>i>=l.base&&i<l.base+l.count)}
  point(i){
    const r=this._region(i);if(r){const p=r.nav.point(i-r.base);return [p[0]+r.offset[0],p[1]+r.offset[2]];}
    const l=this._link(i);if(!l)return [NaN,NaN];const t=(i-l.base+1)/(l.count+1);
    return [l.ap[0]+(l.bp[0]-l.ap[0])*t,l.ap[1]+(l.bp[1]-l.ap[1])*t];
  }
  _doorLocal(x,z){const dx=x-this.exitOrigin[0],dz=z-this.exitOrigin[1],c=Math.cos(this.exitYaw),s=Math.sin(this.exitYaw);return [c*dx-s*dz,s*dx+c*dz]}
  _blocked(x,z){if(!this.exitBarriers)return false;const p=this._doorLocal(x,z);return this.exitBarriers.some(b=>p[0]>=b.xmin&&p[0]<=b.xmax&&p[1]>=b.zmin&&p[1]<=b.zmax)}
  _edgeBlocked(a,b){
    if(!this.exitBarriers)return false;
    a=this._doorLocal(...a);b=this._doorLocal(...b);
    for(const rect of this.exitBarriers??[]){
      let lo=0,hi=1;
      for(const [origin,delta,min,max] of [[a[0],b[0]-a[0],rect.xmin,rect.xmax],[a[1],b[1]-a[1],rect.zmin,rect.zmax]]){
        if(Math.abs(delta)<1e-12){if(origin<min||origin>max){lo=2;break}continue}
        let x=(min-origin)/delta,y=(max-origin)/delta;if(x>y)[x,y]=[y,x];lo=Math.max(lo,x);hi=Math.min(hi,y);if(lo>hi)break;
      }
      if(lo<=hi&&hi>=0&&lo<=1)return true;
    }
    return false;
  }
  _outsideOpening(x,z){return this.links.some(l=>x>=Math.min(l.ap[0],l.bp[0])-.3&&x<=Math.max(l.ap[0],l.bp[0])+.3)&&Math.abs(z-CENTER_Z)>HALF_WALK}
  open(i){const r=this._region(i);if(!r)return !!this._link(i);const p=this.point(i),range=ROOM_CLIP_X[r.stage.id],x=p[0]-r.offset[0];return r.nav.open(i-r.base)&&!this._blocked(...p)&&!this._outsideOpening(...p)&&(this._onLink(...p)||!range||(x>=range[0]&&x<=range[1]));}
  neighbors(i){
    const r=this._region(i);if(r){if(!this.open(i))return [];const a=this.point(i);return [...r.nav.neighbors(i-r.base).map(n=>r.base+n),...(this.anchorEdges.get(i)||[])].filter(n=>this.open(n)&&!this._edgeBlocked(a,this.point(n)));}
    const l=this._link(i);if(!l)return [];return [i===l.base?l.a:i-1,i===l.base+l.count-1?l.b:i+1];
  }
  _onLink(x,z){return this.links.find(l=>x>=Math.min(l.ap[0],l.bp[0])-OVERLAP&&x<=Math.max(l.ap[0],l.bp[0])+OVERLAP&&Math.abs(z-CENTER_Z)<=HALF_WALK)}
  canWalk(x,z){
    if(!Number.isFinite(x)||!Number.isFinite(z))return false;
    if(this._blocked(x,z)||this._outsideOpening(x,z))return false;
    if(this._onLink(x,z))return true;
    return this.regions.some(r=>{const localX=x-r.offset[0],range=ROOM_CLIP_X[r.stage.id];return (!range||(localX>=range[0]&&localX<=range[1]))&&r.nav.canWalk(localX,z-r.offset[2])});
  }
  nearest(x,z){
    if(!Number.isFinite(x)||!Number.isFinite(z))return -1;
    let best=-1,dist=Infinity;
    for(const l of this.links){
      if(x<Math.min(l.ap[0],l.bp[0])-1||x>Math.max(l.ap[0],l.bp[0])+1||Math.abs(z-CENTER_Z)>2)continue;
      const dx=l.bp[0]-l.ap[0],dz=l.bp[1]-l.ap[1],den=dx*dx+dz*dz;
      const t=Math.max(0,Math.min(1,((x-l.ap[0])*dx+(z-l.ap[1])*dz)/den));
      const n=Math.round(t*(l.count+1)),i=n===0?l.a:n===l.count+1?l.b:l.base+n-1,p=this.point(i),d=(p[0]-x)**2+(p[1]-z)**2;
      if(d<dist){best=i;dist=d;}
    }
    for(const r of this.regions){
      const lx=x-r.offset[0],lz=z-r.offset[2],n=r.nav;
      if(lx<n.minx-1||lx>n.minx+(n.width-1)*n.step+1||lz<n.minz-1||lz>n.minz+(n.height-1)*n.step+1)continue;
      // Avoid scanning every cell in a region when the player is in the
      // adjoining corridor just outside its original eroded grid.
      let i=n.index(lx,lz);
      if(!n.open(i)||!this.open(r.base+i)||!n.canWalk(...n.point(i))){
        let nearest=-1,nearestDist=Infinity,c=Math.round((lx-n.minx)/n.step),row=Math.round((lz-n.minz)/n.step);
        for(let dz=-5;dz<=5;dz++)for(let dx=-5;dx<=5;dx++){
          const col=c+dx,rr=row+dz;if(col<0||col>=n.width||rr<0||rr>=n.height)continue;
          const candidate=rr*n.width+col;if(!n.open(candidate)||!this.open(r.base+candidate))continue;const p=n.point(candidate),d=(p[0]-lx)**2+(p[1]-lz)**2;
          if(d<nearestDist&&n.canWalk(...p)){nearest=candidate;nearestDist=d}
        }
        i=nearest;
      }
      if(i<0)continue;const p=n.point(i),d=(p[0]-lx)**2+(p[1]-lz)**2;
      if(d<dist){best=r.base+i;dist=d;}
    }
    return best;
  }
  nearestSafe(x,z){return this.nearest(x,z)}
  index(x,z){return this.nearest(x,z)}
  floorAt(x,z){
    const link=this._onLink(x,z);
    if(link){
      // The outdoor terrain slopes across the final opening. Match the edge,
      // then ease that cross-slope to a flat corridor over two metres.
      if(link===this.links[2]){
        // West of the join the visible surface is already Dreamcore terrain,
        // even though collision deliberately overlaps the corridor by .38m.
        // Following that terrain here avoids a camera-height step at the end
        // of the overlap; the two surfaces agree at the join within 1mm.
        if(x<link.bp[0]){const r=this.regions[3];return r.nav.floorAt(x-r.offset[0],z-r.offset[2])+r.offset[1]}
        return -.136*(z-CENTER_Z)*Math.max(0,Math.min(1,(link.ap[0]-x)/(link.ap[0]-link.bp[0])));
      }
      return 0;
    }
    const i=this.nearest(x,z),r=this._region(i);return r?r.nav.floorAt(x-r.offset[0],z-r.offset[2])+r.offset[1]:0;
  }
  visible(a,b){if(!a||!b)return false;const d=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(d/.12));for(let k=0;k<=n;k++)if(!this.canWalk(a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n))return false;return true}
  move(pos,dx,dz){if(!Number.isFinite(dx)||!Number.isFinite(dz))return pos;const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.065));for(let k=0;k<n;k++){const x=pos[0]+dx/n,z=pos[1]+dz/n;if(this.canWalk(x,pos[1]))pos[0]=x;if(this.canWalk(pos[0],z))pos[1]=z;}return pos}
  path(start,end){
    if(!this.open(start)||!this.open(end))return [];
    if(start===end)return [start];
    if(end===this.exit){
      if(!this.exitTree){
        const tree=new Int32Array(this.length).fill(-1),q=new Int32Array(this.length);let h=0,t=0;q[t++]=end;tree[end]=end;
        while(h<t){const i=q[h++];for(const n of this.neighbors(i))if(tree[n]<0){tree[n]=i;q[t++]=n}}
        this.exitTree=tree;
      }
      if(this.exitTree[start]<0)return [];
      const path=[start];while(path.at(-1)!==end)path.push(this.exitTree[path.at(-1)]);return path;
    }
    // Regions are joined in a chain with one corridor between each pair. For
    // region-to-region pursuit, solve each small native grid separately rather
    // than searching unrelated regions of the entire world.
    const source=this._region(start),target=this._region(end);
    if(source&&target){
      let a=this.regions.indexOf(source),b=this.regions.indexOf(target),step=Math.sign(b-a),current=start,out=[start];
      if(!step)return this._localPath(source,start-source.base,end-source.base).map(i=>i+source.base);
      while(a!==b){
        const r=this.regions[a],link=this.links[step>0?a:a-1],own=step>0?link.a:link.b,other=step>0?link.b:link.a;
        const local=this._localPath(r,current-r.base,own-r.base);if(!local.length)return [];
        out.push(...local.slice(1).map(i=>i+r.base));
        if(step>0)for(let i=0;i<link.count;i++)out.push(link.base+i);
        else for(let i=link.count-1;i>=0;i--)out.push(link.base+i);
        out.push(other);current=other;a+=step;
      }
      const last=this._localPath(target,current-target.base,end-target.base);if(!last.length)return [];
      out.push(...last.slice(1).map(i=>i+target.base));return out;
    }
    // Bidirectional BFS keeps enemy pursuit responsive when the player's
    // target cell changes, while preserving collision graph shortest paths.
    const left=new Int32Array(this.length).fill(-1),right=new Int32Array(this.length).fill(-1);
    let a=[start],b=[end];left[start]=start;right[end]=end;let meet=-1;
    while(a.length&&b.length&&meet<0){
      const forward=a.length<=b.length,front=forward?a:b,own=forward?left:right,other=forward?right:left,next=[];
      for(const i of front){for(const n of this.neighbors(i)){if(own[n]>=0)continue;own[n]=i;next.push(n);if(other[n]>=0){meet=n;break}}if(meet>=0)break}
      if(forward)a=next;else b=next;
    }
    if(meet<0)return [];
    const path=[meet];while(path[0]!==start)path.unshift(left[path[0]]);
    let i=meet;while(i!==end){i=right[i];path.push(i)}return path;
  }
  regionAt(x,z){
    const l=this._onLink(x,z);if(l){const t=Math.abs(x-l.ap[0])<=Math.abs(x-l.bp[0]);return l.regions[t?0:1];}
    const i=this.nearest(x,z),r=this._region(i);return r?this.regions.indexOf(r):0;
  }
  forEachOpen(fn){for(const r of this.regions){for(let i=0;i<r.nav.free.length;i++)if(this.open(r.base+i)){let p=r.nav.point(i);fn(p[0]+r.offset[0],p[1]+r.offset[2],r.nav.step)}}for(const l of this.links)for(let i=0;i<l.count;i++){let p=this.point(l.base+i);fn(p[0],p[1],.28)}}
  _localPath(r,start,end){
    const path=r.nav.path(start,end);
    if(!path.length)return [];
    if(path.every((i,k)=>this.open(r.base+i)&&(k===0||!this._edgeBlocked(this.point(r.base+path[k-1]),this.point(r.base+i)))))return path;
    const prev=new Int32Array(r.nav.free.length).fill(-1),q=new Int32Array(r.nav.free.length);let h=0,t=0;q[t++]=start;prev[start]=start;
    while(h<t){const i=q[h++];if(i===end){const result=[i];while(result.at(-1)!==start)result.push(prev[result.at(-1)]);return result.reverse()}
      for(const n of r.nav.neighbors(i)){if(prev[n]>=0||!this.open(r.base+n)||this._edgeBlocked(this.point(r.base+i),this.point(r.base+n)))continue;prev[n]=i;q[t++]=n}
    }
    return [];
  }
}

export function makeContinuousWorld(world){
  const nav=new ContinuousNavigation(world.stages);
  const stages=world.stages.map((s,i)=>{
    const r=nav.regions[i],o=r.offset;
    const matrix=M.mul(M.pose(o[0],o[1],o[2]),M.pose(0,0,0,0,s.scale));
    return {...s,localNav:s.nav,nav,matrix,model:{url:s.modelUrl,matrix},spawn:nav.point(r.base+s.nav.start),
      objectives:s.objectives.map(item=>({...item,index:r.base+item.index,position:nav.point(r.base+item.index)})),exit:nav.point(i===world.stages.length-1?nav.exit:r.base+s.nav.exit),
      hiding:s.nav.hiding.map(i=>nav.point(r.base+i)),patrol:s.nav.patrol.map(i=>nav.point(r.base+i))};
  });
  const byId=Object.fromEntries(stages.map(s=>[s.id,s]));
  return {...world,stages,nav,start:stages[0],byId,get:id=>byId[id]??null,next:stage=>byId[typeof stage==='string'?byId[stage]?.next:stage?.next]??null};
}
