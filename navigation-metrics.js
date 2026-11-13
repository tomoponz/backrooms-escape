// Route distances are measured in world metres. Different native room grids
// and doorway edges may have different spacing; node counts are not distances.
export function routeGeometry(nav, indices) {
  const points=indices.map(index=>nav.point(index));
  const distances=points.length?[0]:[];
  for(let i=1;i<points.length;i++)distances.push(distances[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  return {points,distances,length:distances.at(-1)??Infinity};
}

export function pathDistance(nav,from,to) {
  return routeGeometry(nav,nav.path(from,to)).length;
}
