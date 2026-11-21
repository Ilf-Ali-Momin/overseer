'use client';

import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import type { MeshStandardMaterial } from 'three';
import {
  Color,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type Mesh,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { furnitureUrl, type FurnitureName } from './Model';

export interface Placement {
  name: FurnitureName;
  position: [number, number, number];
  rotationY?: number;
  castShadow?: boolean;
}

export function placementMatrix(p: Placement): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...p.position),
    new Quaternion().setFromEuler(new Euler(0, p.rotationY ?? 0, 0)),
    new Vector3(1, 1, 1),
  );
}

/** Kenney materials are flat colors; group by color so the whole set merges into a few meshes. */
function materialKey(material: Material): string {
  const m = material as MeshStandardMaterial;
  const color = m.color instanceof Color ? m.color.getHexString() : 'none';
  return `${color}|${m.emissive?.getHexString() ?? ''}|${m.transparent ? 't' : 'o'}`;
}

/** Keep only position + normal so geometries from different files can merge. */
function normalize(geometry: BufferGeometry, matrix: Matrix4): BufferGeometry {
  const g = (geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(matrix);
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  g.clearGroups();
  return g;
}

interface MergedPart {
  geometry: BufferGeometry;
  material: Material;
  castShadow: boolean;
}

/**
 * Static furniture merged at load time: one mesh per (material color, shadow flag) instead of one
 * per model part. Use for anything that never moves.
 */
export function MergedFurniture({ placements }: { placements: Placement[] }) {
  const names = useMemo(() => [...new Set(placements.map((p) => p.name))], [placements]);
  const gltfs = useGLTF(names.map(furnitureUrl));

  const parts = useMemo<MergedPart[]>(() => {
    const byName = new Map(names.map((n, i) => [n, gltfs[i]]));
    const buckets = new Map<
      string,
      { geos: BufferGeometry[]; material: Material; cast: boolean }
    >();
    for (const p of placements) {
      const gltf = byName.get(p.name);
      if (!gltf) continue;
      const placement = placementMatrix(p);
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh || Array.isArray(mesh.material)) return;
        const cast = p.castShadow ?? true;
        const key = `${materialKey(mesh.material)}|${cast}`;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { geos: [], material: mesh.material, cast };
          buckets.set(key, bucket);
        }
        bucket.geos.push(
          normalize(mesh.geometry, new Matrix4().multiplyMatrices(placement, mesh.matrixWorld)),
        );
      });
    }
    const out: MergedPart[] = [];
    for (const b of buckets.values()) {
      const geometry = mergeGeometries(b.geos, false);
      b.geos.forEach((g) => g.dispose());
      if (geometry) out.push({ geometry, material: b.material, castShadow: b.cast });
    }
    return out;
  }, [names, gltfs, placements]);

  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts]);

  return (
    <group>
      {parts.map((p, i) => (
        <mesh
          key={i}
          geometry={p.geometry}
          material={p.material}
          castShadow={p.castShadow}
          receiveShadow
        />
      ))}
    </group>
  );
}
