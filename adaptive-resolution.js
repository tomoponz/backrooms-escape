// Presentation only: never change the simulation clock to adapt GPU workload.
export function createAdaptiveResolution() {
 let scale=1,average=1/60,clock=0,hold=0,wasActive=false;
 return {
  sample(seconds,active=true) {
   if(!active){wasActive=false;clock=0;return scale}
   // Loading, tab suspension and menus are not gameplay frame samples.
   if(!wasActive){wasActive=true;return scale}
   if(!Number.isFinite(seconds)||seconds<=0)return scale;
   // Very slow renderers also need to adapt. Bound their influence instead of
   // discarding every frame below 4 FPS (which prevented adaptation entirely).
   const sample=Math.min(seconds,.25);
   average=average*.94+sample*.06;clock+=sample;hold=Math.max(0,hold-sample);
   if(clock>1){
    if(average>1/48){scale=Math.max(.5,scale-(average>1/34?.15:.08));hold=8}
    else if(average<1/57&&hold===0)scale=Math.min(1,scale+.04);
    clock=0;
   }
   return scale;
  }
 };
}
