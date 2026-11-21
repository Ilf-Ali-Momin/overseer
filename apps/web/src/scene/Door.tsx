'use client';

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import type { Mesh, Object3D } from 'three';
import { actorPositions } from './actorPositions';
import { dampDoor, doorTarget } from './doorSwing';
import { DOOR_TILE_Z } from './layout';
import { furnitureUrl } from './Model';

/** Where the Kenney doorway model sits in the x = 0 wall. */
const POSITION: [number, number, number] = [0, 0, DOOR_TILE_Z + 0.75];

/** The doorway with a door leaf that swings open while an agent walks through. */
export function Door() {
  const { scene } = useGLTF(furnitureUrl('doorway'));
  const { root, leaf } = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    // Kenney names the leaf node `door`; its origin is the hinge.
    const leaf: Object3D | undefined = root.getObjectByName('door');
    return { root, leaf };
  }, [scene]);

  useFrame((_, delta) => {
    if (!leaf) return;
    leaf.rotation.y = dampDoor(
      leaf.rotation.y,
      doorTarget(actorPositions.values()),
      Math.min(delta, 0.1),
    );
  });

  return (
    <group position={POSITION} rotation-y={Math.PI / 2}>
      <primitive object={root} />
    </group>
  );
}
