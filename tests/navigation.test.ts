import test from 'node:test'
import assert from 'node:assert/strict'
import {defaultConfig,generateLayout,templates} from '../src/domain/warehouse.ts'
import {findWalkPath,isWalkable,nearestWalkable} from '../src/domain/navigation.ts'
test('walking routes connect areas without crossing rack footprints',()=>{
 for(const template of templates){
  const config={...defaultConfig,template:template.id},layout=generateLayout(config)
  const entrance=nearestWalkable({x:layout.centers.inbound[0],z:-config.depth/2+3},config,layout)
  for(const zone of ['storage','packing','outbound'] as const){
   const center=layout.centers[zone],destination=nearestWalkable({x:center[0],z:center[1]},config,layout)
   const path=findWalkPath(entrance,destination,config,layout)
   assert.ok(path.length>1,template.id+' '+zone)
   for(let i=1;i<path.length;i++){
    const from=path[i-1],to=path[i],distance=Math.hypot(to.x-from.x,to.z-from.z)
    for(let t=0;t<=distance;t+=.1){const k=distance?t/distance:0;assert.ok(isWalkable({x:from.x+(to.x-from.x)*k,z:from.z+(to.z-from.z)*k},config,layout),template.id+' route entered a fixture')}
   }
  }
 }
})
