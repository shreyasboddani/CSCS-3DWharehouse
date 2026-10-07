import * as T from "three";

/** Reuse vertex buffers instead of copying every rack post into expanded merged geometry. */
export function instanceStatic(root: T.Group, exclude: Set<T.Object3D> = new Set(), shells: T.Group[] = []) {
  root.updateMatrixWorld(true);
  const batches = new Map<string, { parent: T.Group; meshes: T.Mesh[]; ids: string[] }>();
  const point = new T.Vector3();
  root.traverse((object) => {
    if (!(object instanceof T.Mesh) || object instanceof T.InstancedMesh ||
      Array.isArray(object.material) || exclude.has(object) || !object.visible) return;
    let ancestor: T.Object3D | null = object, parent = root, id = "", skip = false;
    while (ancestor) {
      if (ancestor.userData.animated || !ancestor.visible) skip = true;
      if (!id) id = ancestor.userData.locationId ||
        (ancestor.userData.moduleId ? "module:" + ancestor.userData.moduleId : "");
      if (shells.includes(ancestor as T.Group)) parent = ancestor as T.Group;
      if (ancestor === root) break;
      ancestor = ancestor.parent;
    }
    if (skip) return;
    object.getWorldPosition(point);
    const key = [parent.uuid, object.geometry.uuid, object.material.uuid,
      Math.floor(point.x / 32), Math.floor(point.z / 32), object.castShadow].join(":");
    const batch = batches.get(key) || { parent, meshes: [], ids: [] };
    batch.meshes.push(object); batch.ids.push(id); batches.set(key, batch);
  });
  for (const { parent, meshes, ids } of batches.values()) {
    if (meshes.length < 2) continue;
    const instance = new T.InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length);
    const inverse = new T.Matrix4().copy(parent.matrixWorld).invert();
    const matrix = new T.Matrix4();
    meshes.forEach((mesh, i) => {
      matrix.multiplyMatrices(inverse, mesh.matrixWorld);
      instance.setMatrixAt(i, matrix);
    });
    instance.name = "Shared industrial parts";
    instance.userData.instanceIds = ids;
    instance.castShadow = meshes[0].castShadow;
    instance.receiveShadow = true;
    instance.computeBoundingBox(); instance.computeBoundingSphere();
    parent.add(instance);
    meshes.forEach((mesh) => mesh.removeFromParent());
  }
}
