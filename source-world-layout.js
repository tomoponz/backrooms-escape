// Shared physical scene specification. Rendering and geometry-derived navigation
// consume these same transforms, ownership bounds, apertures and seam triangles.
// No source GLB, UV or authored room interior is rewritten by this description.
const FAR = 10000;
const bounds = (xmin=-FAR, xmax=FAR, zmin=-FAR, zmax=FAR) => ({min:[xmin,-FAR,zmin],max:[xmax,FAR,zmax]});
const aperture = (id, a, b, min, max) => ({id,a,b,min,max});
const joins = [
  aperture('vr-west','vr','original-west',[-62.2,.015,-13.1],[-59.8,2.35,-12.1]),
  aperture('vr-middle','vr','original-middle',[-21.3,.015,-13.1],[-18.9,2.35,-12.1]),
  aperture('vr-east','vr','original-east',[-5.2,.015,-21.0],[-2.8,2.35,-20.2]),
  aperture('west-middle','original-west','original-middle',[-38.05,.015,-1.2],[-37.35,2.35,1.2]),
  aperture('middle-east','original-middle','original-east',[-12.85,.015,-1.2],[-12.15,2.35,1.2]),
  aperture('baked-gallery','original-middle','baked',[-23.8,.015,12.05],[-21.4,2.4,13.05]),
  aperture('outdoor-threshold','original-east','dreamcore',[12.25,.015,-9.3],[13.15,2.35,-6.9]),
  aperture('west-far-west','original-west','original-far-west',[-63.35,.015,-1.2],[-62.65,2.35,1.2]),
  aperture('west-southwest','original-west','original-southwest',[-51.6,.015,12.15],[-49.2,2.35,13.05]),
  aperture('far-west-southwest','original-far-west','original-far-southwest',[-76.8,.015,12.15],[-74.4,2.35,13.05]),
  aperture('southwest-far-southwest','original-southwest','original-far-southwest',[-63.35,.015,24.0],[-62.65,2.35,26.4]),
  // 2026-11-13 south and south-east wing. Every aperture sits where both
  // authored interiors have open floor (checked against the generated grid).
  aperture('east-southeast','original-east','original-southeast',[8.4,.015,4.05],[10.8,2.35,4.95]),
  aperture('middle-southeast','original-middle','original-southeast',[-13.05,.015,7.3],[-12.15,2.35,9.7]),
  aperture('southeast-far-southeast','original-southeast','original-far-southeast',[-7.2,.015,29.25],[-4.8,2.35,30.15]),
  aperture('south-far-southeast','original-south','original-far-southeast',[-13.05,.015,49.2],[-12.15,2.35,51.6]),
  aperture('south-southwest-south','original-south-southwest','original-south',[-38.25,.015,49.2],[-37.35,2.35,51.6]),
  aperture('far-south-southwest-south-southwest','original-far-south-southwest','original-south-southwest',[-63.45,.015,49.2],[-62.55,2.35,51.6]),
  aperture('southwest-south-southwest','original-southwest','original-south-southwest',[-42.0,.015,37.35],[-39.6,2.35,38.25]),
  aperture('far-southwest-far-south-southwest','original-far-southwest','original-far-south-southwest',[-86.8,.015,37.35],[-84.4,2.35,38.25]),
];
const holesFor = id => joins.filter(j=>j.a===id||j.b===id).map(j=>({id:j.id,min:j.min,max:j.max}));

export const SOURCE_WORLD_LAYOUT = {
  version:1,
  title:'Original rooms — connected neighborhood',
  units:'metres after authored glTF node transforms and instance uniformScale',
  navigation:{step:.22,playerRadius:.20,maxStep:.26,eyeHeight:1.6},
  atmospheres:{
    level0:{ambient:.63,fog:[.035,.032,.018],fogNear:9,fogFar:36},
    baked:{ambient:.82,fog:[.075,.059,.024],fogNear:7,fogFar:20},
    original:{ambient:.64,fog:[.044,.041,.022],fogNear:8,fogFar:27},
    westDim:{ambient:.55,fog:[.038,.034,.020],fogNear:7,fogFar:24},
    southWarm:{ambient:.72,fog:[.061,.048,.024],fogNear:8,fogFar:30},
    southwestMuted:{ambient:.62,fog:[.038,.044,.027],fogNear:8,fogFar:27},
    dreamcore:{ambient:1.04,fog:[.55,.72,.74],fogNear:130,fogFar:300},
    eastPale:{ambient:.67,fog:[.050,.047,.030],fogNear:8,fogFar:28},
    southDeep:{ambient:.52,fog:[.030,.029,.019],fogNear:6,fogFar:22},
    southAmber:{ambient:.66,fog:[.066,.046,.020],fogNear:8,fogFar:28},
    southCold:{ambient:.58,fog:[.034,.042,.036],fogNear:7,fogFar:25},
    farSouthDim:{ambient:.54,fog:[.036,.031,.017],fogNear:6,fogFar:23},
  },
  instances:[
    {id:'vr',label:'Backrooms VR',model:'assets/models/level0.glb',translation:[0,.11756357598021501,-27.6],yaw:0,uniformScale:1,
      floorMaterials:['Moquette_1','Moquette_2','Moquette_3','Moquette_4'],localFloorY:-.11756357598021501,
      // The east corridor's own south wall lies at z=-20.614 and its carpet
      // ends at z=-20.610. The ownership plane sits between the two (2026-11-13):
      // the wall is drawn instead of the neighbour's dark outer face, and the
      // two carpets still meet without an unsupported strip in the doorway.
      clipRegions:[bounds(-FAR,-12.55,-FAR,-12.55),bounds(-12.55,FAR,-FAR,-20.612)],holes:holesFor('vr'),atmosphere:'level0'},
    {id:'original-west',label:'West rooms',model:'assets/models/original-backrooms.glb',translation:[-50.4,-.008085817098617554,0],yaw:0,uniformScale:1,
      floorMaterials:['NewCarpet'],localFloorY:.008085817098617554,
      clipRegions:[bounds(-63,-37.75,-12.55,12.6)],holes:holesFor('original-west'),atmosphere:'original'},
    {id:'original-middle',label:'Central rooms',model:'assets/models/original-backrooms.glb',translation:[-25.2,-.008085817098617554,0],yaw:0,uniformScale:1,
      floorMaterials:['NewCarpet'],localFloorY:.008085817098617554,
      clipRegions:[bounds(-37.75,-12.55,-12.55,13.7)],
      holes:[...holesFor('original-middle'),{id:'baked-floor-ownership',min:[-25,-.05,12.536713],max:[-13,.015,13.6],materials:['NewCarpet']}],atmosphere:'original'},
    {id:'original-east',label:'East rooms',model:'assets/models/original-backrooms.glb',translation:[0,-.008085817098617554,-8.1],yaw:0,uniformScale:1,
      floorMaterials:['NewCarpet'],localFloorY:.008085817098617554,
      clipRegions:[bounds(-12.55,FAR,-20.612,4.5)],holes:holesFor('original-east'),atmosphere:'original'},
    {id:'baked',label:'Baked gallery',model:'assets/models/baked-room-original.glb',translation:[-19,0,21],yaw:-Math.PI/2,uniformScale:3,
      floorMaterials:['Material'],floorLocalRange:[-.25,.085],localFloorY:0,
      // The original sill and pit walls remain; only deep pit-bottom faces are
      // cut at runtime so the player can fall into darkness. The source GLB is untouched.
      clipRegions:[bounds()],holes:[{id:'baked-pit-bottoms',min:[-24.80,-.716,15.20],max:[-13.20,-.708,26.80],materials:['Material']}],atmosphere:'baked'},
    {id:'dreamcore',label:'Open field',model:'assets/models/dreamcore.glb',translation:[-13.7,-7.2724,-8.35],yaw:Math.PI,uniformScale:1,
      floorMaterials:['grass'],localFloorY:7.2724,nonCollisionMaterials:['material','Material.001','Material.002'],
      clipRegions:[bounds(12.65,FAR,-FAR,FAR)],holes:[],atmosphere:'dreamcore',outdoor:true},
    // Reuse the original authored rooms in a broad western wing. Each room
    // owns its adjacent floor and walls; four local apertures form a loop.
    {id:'original-far-west',label:'西奥の部屋',model:'assets/models/original-backrooms.glb',translation:[-75.6,-.008085817098617554,0],yaw:0,uniformScale:1,
      floorMaterials:['NewCarpet'],localFloorY:.008085817098617554,
      clipRegions:[bounds(-FAR,-63,-12.55,12.6)],holes:holesFor('original-far-west'),atmosphere:'westDim'},
    {id:'original-southwest',label:'南西の部屋',model:'assets/models/original-backrooms.glb',translation:[-50.4,-.008085817098617554,25.2],yaw:0,uniformScale:1,
      floorMaterials:['NewCarpet'],localFloorY:.008085817098617554,
      clipRegions:[bounds(-63,-37.75,12.6,37.8)],holes:holesFor('original-southwest'),atmosphere:'southWarm'},
    {id:'original-far-southwest',label:'南西奥の部屋',model:'assets/models/original-backrooms.glb',translation:[-75.6,-.008085817098617554,25.2],yaw:0,uniformScale:1,
      floorMaterials:['NewCarpet'],localFloorY:.008085817098617554,
      clipRegions:[bounds(-FAR,-63,12.6,37.8)],holes:holesFor('original-far-southwest'),atmosphere:'southwestMuted'},
    // 2026-11-13: five further placements of the same approved Original room.
    // Two are turned 180 degrees so that the repeated interior is approached
    // from a different side. Ownership planes sit between the two inner faces
    // of every shared wall (inner faces lie within 12.30..12.56 m of a centre).
    {id:'original-southeast',label:'南東の部屋',model:'assets/models/original-backrooms.glb',translation:[0,-.008085817098617554,17.1],yaw:Math.PI,uniformScale:1,
      floorMaterials:['NewCarpet'],localFloorY:.008085817098617554,
      clipRegions:[bounds(-12.6,12.65,4.5,29.7)],holes:holesFor('original-southeast'),atmosphere:'eastPale'},
    {id:'original-far-southeast',label:'南東奥の部屋',model:'assets/models/original-backrooms.glb',translation:[0,-.008085817098617554,42.3],yaw:0,uniformScale:1,
      floorMaterials:['NewCarpet'],localFloorY:.008085817098617554,
      clipRegions:[bounds(-12.6,12.9,29.7,FAR)],holes:holesFor('original-far-southeast'),atmosphere:'southAmber'},
    {id:'original-south',label:'南の部屋',model:'assets/models/original-backrooms.glb',translation:[-25.2,-.008085817098617554,50.4],yaw:0,uniformScale:1,
      floorMaterials:['NewCarpet'],localFloorY:.008085817098617554,
      clipRegions:[bounds(-37.8,-12.6,37.8,FAR)],holes:holesFor('original-south'),atmosphere:'southDeep'},
    {id:'original-south-southwest',label:'南西の先の部屋',model:'assets/models/original-backrooms.glb',translation:[-50.4,-.008085817098617554,50.4],yaw:Math.PI,uniformScale:1,
      floorMaterials:['NewCarpet'],localFloorY:.008085817098617554,
      clipRegions:[bounds(-63,-37.8,37.8,FAR)],holes:holesFor('original-south-southwest'),atmosphere:'southCold'},
    {id:'original-far-south-southwest',label:'最南西の部屋',model:'assets/models/original-backrooms.glb',translation:[-75.6,-.008085817098617554,50.4],yaw:0,uniformScale:1,
      floorMaterials:['NewCarpet'],localFloorY:.008085817098617554,
      clipRegions:[bounds(-FAR,-63,37.8,FAR)],holes:holesFor('original-far-south-southwest'),atmosphere:'farSouthDim'},
  ],
  joins,
  // Reuse the author's complete, closed VR south double-door assembly. The
  // renderer isolates these two approved material primitives by this box;
  // opening hides only the leaf interior and leaves its original frame.
  gates:[{
    id:'outdoor-door',instanceId:'original-east',sourceModel:'assets/models/level0.glb',sourceMaterials:['Exit_Door'],
    sourceBounds:{min:[-50.2,-.2,-4.7],max:[-47.9,2.3,-4.2]},
    sourceAnchor:[-49.06167507,-.11756517,-4.454374],position:[12.66,0,-8.1],yaw:-Math.PI/2,uniformScale:1.03,
    barrier:{min:[12.48,-.1,-9.3],max:[12.9,2.4,-6.9]},
    opening:{min:[12.4,-.002,-9.102],max:[12.95,2.24,-7.098]},
    frameBarriers:[{min:[12.49,0,-9.3],max:[12.84,2.32,-9.102]},{min:[12.49,0,-7.098],max:[12.84,2.32,-6.9]}],
    initiallyOpen:false,
  }],
  // Existing perspective UI is mounted 15mm in front of the actual Baked
  // west wall (source triangles intersect x=-25 at this y/z). No wall or
  // control-box mesh is generated for the mount.
  maintenanceFixture:{position:[-24.985,1.2,14.1],yaw:Math.PI/2,width:.62,height:.8,instanceId:'baked',wallNormal:[1,0,0]},
  // Two further breakers feed the same exit release (2026-11-13). Each plate is
  // mounted 15mm in front of an existing inner wall face of an Original room:
  // west wall of the far south-south-west room, east wall of the far south-east
  // room. `stand` is the floor point from which it is operated.
  breakers:[
    {id:'breaker-west',label:'南西系統の配電盤',stand:[-87.05,56.4],fixture:{position:[-87.889,1.2,56.4],yaw:Math.PI/2,width:.62,height:.8,instanceId:'original-far-south-southwest',wallNormal:[1,0,0]}},
    {id:'breaker-east',label:'南東系統の配電盤',stand:[11.7,49.3],fixture:{position:[12.539,1.2,49.3],yaw:-Math.PI/2,width:.62,height:.8,instanceId:'original-far-southeast',wallNormal:[-1,0,0]}},
  ],
  // Owner-supplied props (2026-11-13). Chairs and boxes stand on the floor at
  // [x, z] with yaw 0 facing +Z; several chairs face a wall on purpose. Vents
  // hang on inner wall faces at [x, y, z]. One box holds the crowbar that the
  // jammed cover of the south-west breaker needs.
  props:[
    {id:'chair-east',type:'chair',position:[6.0,-19.5],yaw:Math.PI,region:'original-east'},
    {id:'chair-middle',type:'chair',position:[-36.7,9.4],yaw:-Math.PI/2,region:'original-middle'},
    {id:'chair-far-southeast',type:'chair',position:[8.6,53.7],yaw:0,region:'original-far-southeast'},
    {id:'chair-south',type:'chair',position:[-14.2,38.95],yaw:Math.PI,region:'original-south'},
    {id:'chair-southwest',type:'chair',position:[-46.4,17.7],yaw:Math.PI,region:'original-southwest'},
    {id:'chair-far-west',type:'chair',position:[-87.1,-9.5],yaw:-Math.PI/2,region:'original-far-west'},
    {id:'chair-south-southwest-a',type:'chair',position:[-52.0,61.9],yaw:0,region:'original-south-southwest'},
    {id:'chair-south-southwest-b',type:'chair',position:[-50.9,61.9],yaw:0,region:'original-south-southwest'},
    // Beside the far-west partition: searching for the tool crosses the
    // existing hazmat patrol, while the box stays clear of the passage.
    {id:'box-crowbar',type:'box',position:[-80.4,-7.4],yaw:.4,contains:'crowbar',region:'original-far-west'},
    {id:'box-middle',type:'box',position:[-15.0,-9.8],yaw:-.3,contains:'water',region:'original-middle'},
    {id:'box-east',type:'box',position:[10.6,1.6],yaw:1.1,contains:null,region:'original-east'},
    {id:'box-southeast',type:'box',position:[-9.6,25.6],yaw:.2,contains:'water',region:'original-southeast'},
    {id:'box-south',type:'box',position:[-20.4,61.0],yaw:-.9,contains:null,region:'original-south'},
    {id:'box-southwest',type:'box',position:[-60.6,35.4],yaw:.7,contains:null,region:'original-southwest'},
    {id:'box-far-west',type:'box',position:[-64.6,-10.4],yaw:.15,contains:'water',region:'original-far-west'},
    {id:'vent-east',type:'vent',position:[12.5,2.2,-14.0],yaw:-Math.PI/2,region:'original-east'},
    {id:'vent-middle',type:'vent',position:[-30.0,2.2,-12.25],yaw:0,region:'original-middle'},
    {id:'vent-southeast',type:'vent',position:[12.25,2.2,15.0],yaw:-Math.PI/2,region:'original-southeast'},
    {id:'vent-far-southeast',type:'vent',position:[5.0,2.2,54.47],yaw:Math.PI,region:'original-far-southeast'},
    {id:'vent-south',type:'vent',position:[-19.0,2.2,62.57],yaw:Math.PI,region:'original-south'},
    {id:'vent-far-south-southwest',type:'vent',position:[-87.85,2.2,44.0],yaw:Math.PI/2,region:'original-far-south-southwest'},
    {id:'vent-southwest',type:'vent',position:[-45.0,2.2,37.37],yaw:Math.PI,region:'original-southwest'},
    {id:'vent-west',type:'vent',position:[-55.0,2.2,-12.25],yaw:0,region:'original-west'},
  ],
  // The breaker whose cover has to be pried open with the crowbar.
  jammedBreaker:'breaker-west',
  // New surfaces are restricted to the 1.25m outdoor threshold. The source
  // grass slopes across the mouth; both renderer and collision use these exact
  // triangles, while all surrounding architecture remains approved geometry.
  seamSurfaces:[],
  anchors:{
    spawn:{position:[-28.5,0,-22],yaw:Math.PI/2,instanceId:'vr'},
    enemy:{position:[-58,0,7],yaw:0,instanceId:'original-west'},
    maintenance:{position:[-24.05,0,14.1],yaw:-Math.PI/2,instanceId:'baked'},
    exit:{position:[11.5,0,-8.1],yaw:Math.PI/2,instanceId:'original-east'},
    // Approach the existing dark Dreamcore plane from its walkable front.
    // The source plane is solid artwork, not a claimed passage or door.
    escape:{position:[65.34,3.717,37.53],yaw:Math.PI,instanceId:'dreamcore'},
    patrol:[{position:[-61,0,-20]},{position:[-47,0,7]},{position:[-29,0,7]},{position:[-4,0,-16]},
      {position:[3,0,20]},{position:[-3,0,45]},{position:[-22,0,56]},{position:[-47,0,56]},{position:[-45,0,30]}],
  },
};

// A compact ramp using the same cross-slope as the existing terrain entrance.
// Its final height is verified against the source grass by the nav builder.
const left=12.55,right=13.8,center=-8.1,half=1.2,steps=8;
for(let i=0;i<steps;i++){
  const a=left+(right-left)*i/steps,b=left+(right-left)*(i+1)/steps;
  const point=(x,z)=>[x,.136*(z-center)*(x-left)/(right-left)-.006,z];
  const p=point(a,center-half),q=point(a,center+half),r=point(b,center-half),s=point(b,center+half);
  SOURCE_WORLD_LAYOUT.seamSurfaces.push({id:'outdoor-threshold-'+i,regionId:'dreamcore',
    materialSource:{instanceId:'original-east',name:'NewCarpet'},triangles:[[p,q,r],[r,q,s]]});
}
