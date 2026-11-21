'use client';

import { useGLTF } from '@react-three/drei';
import { useLayoutEffect, useMemo } from 'react';
import { InstancedMesh, Matrix4, type Mesh, type Material, type BufferGeometry } from 'three';
import { furnitureUrl, type FurnitureName } from './Model';

interface Part {
  geometry: BufferGeometry;
  material: Material | Material[];
  /** Mesh transform relative to the model root. */
  local: Matrix4;
}

/**
 * Draws many copies of one Kenney model with one InstancedMesh per sub-mesh, so N placements
 * cost (sub-mesh count) draw calls instead of N times that.
 */
export function InstancedModel({
  name,
  matrices,
  castShadow = true,
  receiveShadow = true,
}: {
  name: FurnitureName;
  matrices: Matrix4[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const { scene } = useGLTF(furnitureUrl(name));

  const parts = useMemo<Part[]>(() => {
    scene.updateMatrixWorld(true);
    const out: Part[] = [];
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        out.push({
          geometry: mesh.geometry,
          material: mesh.material,
          local: mesh.matrixWorld.clone(),
        });
      }
    });
    return out;
  }, [scene]);

  const meshes = useMemo(
    () =>
      parts.map((p) => {
        const im = new InstancedMesh(p.geometry, p.material, matrices.length);
        im.castShadow = castShadow;
        im.receiveShadow = receiveShadow;
        return im;
      }),
    [parts, matrices.length, castShadow, receiveShadow],
  );

  useLayoutEffect(() => {
    const m = new Matrix4();
    meshes.forEach((im, pi) => {
      const local = parts[pi]?.local;
      if (!local) return;
      matrices.forEach((placement, i) => im.setMatrixAt(i, m.multiplyMatrices(placement, local)));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    });
  }, [meshes, parts, matrices]);

  useLayoutEffect(() => () => meshes.forEach((im) => im.dispose()), [meshes]);

  return (
    <>
      {meshes.map((im, i) => (
        <primitive key={i} object={im} />
      ))}
    </>
  );
}
