// Optional, local observations use no new model or sound. Positions must be
// supported by the actual navigation and remain in the intended region.
const DEFINITIONS = [
  {id:'far-west',region:'original-far-west',center:[-75.6,0],text:'壁の向こうにも同じ部屋が続いている。来た道を覚えておこう。'},
  {id:'southwest',region:'original-southwest',center:[-50.4,25.2],text:'曲がり角は身を隠せる。走る音が届くことも忘れない。'},
  {id:'far-southwest',region:'original-far-southwest',center:[-75.6,25.2],text:'さっきまでいた建物を思い出そうとしても、扉の先が曖昧だ。'},
  {id:'southeast',region:'original-southeast',center:[0,17.1],text:'さっきの部屋と同じ間取りのはずなのに、向きだけが逆になっている。'},
  {id:'far-southeast',region:'original-far-southeast',center:[0,42.3],text:'カーペットに新しい足跡がある。自分の靴より、ずっと細長い。'},
  {id:'south',region:'original-south',center:[-25.2,50.4],text:'蛍光灯の唸りが一瞬だけ止まった。誰かが息を止めたみたいに。'},
  {id:'south-southwest',region:'original-south-southwest',center:[-50.4,50.4],text:'壁紙の継ぎ目が、数えるたびに一本ずつ増えている気がする。'},
  {id:'far-south-southwest',region:'original-far-south-southwest',center:[-75.6,50.4],text:'ここが建物の端のはずだ。それでも壁の向こうで、何かが歩いている。'}
];
const OFFSETS=[[0,9],[9,0],[0,-9],[-9,0],[4,9],[-4,9],[9,4],[9,-4],[0,5],[5,0],[0,-5],[-5,0]];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

export function createEnvironmentObservations(nav, {supplies=[]}={}) {
  if(!nav?.regionIds||!nav.nearest||!nav.open||!nav.point||!nav.regionAt||!nav.visible||!nav.path) throw new TypeError('Observation navigation is unavailable');
  const observations=[];
  for(const def of DEFINITIONS){
    const region=nav.regionIds.indexOf(def.region);if(region<0)continue;
    for(const offset of OFFSETS){
      const guess=[def.center[0]+offset[0],def.center[1]+offset[1]],i=nav.nearest(...guess);
      if(!nav.open(i))continue;
      const point=nav.point(i);
      if(!point||nav.regionAt(...point)!==region||distance(point,guess)>3||supplies.some(s=>distance(point,s.position)<2.5))continue;
      if(i!==nav.start&&!nav.path(nav.start,i).length)continue;
      observations.push({id:def.id,region:def.region,position:[...point],text:def.text});break;
    }
  }
  let last=null;
  const visible=(player,radius=5)=>observations.filter(o=>distance(player,o.position)<radius&&nav.visible(player,o.position));
  const nearest=player=>visible(player,1.35).sort((a,b)=>distance(player,a.position)-distance(player,b.position))[0]??null;
  return Object.freeze({
    observations,
    visible,
    nearest,
    read(player){const item=nearest(player);if(!item)return null;last=item;return item.text;},
    reset(){last=null;},
    get last(){return last;}
  });
}
