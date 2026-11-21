'use client';

import { useGLTF } from '@react-three/drei';
import type { ThreeElements } from '@react-three/fiber';
import { useMemo } from 'react';
import type { Mesh, Object3D } from 'three';

export type FurnitureName =
  | 'desk'
  | 'deskCorner'
  | 'chairDesk'
  | 'computerScreen'
  | 'computerKeyboard'
  | 'computerMouse'
  | 'laptop'
  | 'lampSquareTable'
  | 'lampRoundTable'
  | 'lampSquareCeiling'
  | 'lampRoundFloor'
  | 'floorFull'
  | 'wall'
  | 'wallCorner'
  | 'wallHalf'
  | 'wallWindow'
  | 'wallWindowSlide'
  | 'wallDoorway'
  | 'wallDoorwayWide'
  | 'doorway'
  | 'doorwayFront'
  | 'paneling'
  | 'pottedPlant'
  | 'plantSmall1'
  | 'plantSmall2'
  | 'plantSmall3'
  | 'kitchenCoffeeMachine'
  | 'kitchenBar'
  | 'kitchenBarEnd'
  | 'kitchenCabinet'
  | 'kitchenFridgeSmall'
  | 'kitchenMicrowave'
  | 'stoolBar'
  | 'bookcaseOpen'
  | 'bookcaseClosedWide'
  | 'books'
  | 'loungeSofa'
  | 'loungeChair'
  | 'loungeDesignSofa'
  | 'tableCoffee'
  | 'sideTable'
  | 'rugRectangle'
  | 'rugRound'
  | 'trashcan'
  | 'speaker'
  | 'cardboardBoxClosed'
  | 'coatRackStanding'
  | 'radio';

export const furnitureUrl = (name: FurnitureName): string => `/models/furniture/${name}.glb`;

function enableShadows(root: Object3D, cast: boolean, receive: boolean): void {
  root.traverse((o) => {
    if ((o as Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}

type ModelProps = ThreeElements['group'] & {
  name: FurnitureName;
  castShadow?: boolean;
  receiveShadow?: boolean;
};

/** One placed copy of a Kenney furniture model. Geometry and materials are shared. */
export function Model({ name, castShadow = true, receiveShadow = true, ...props }: ModelProps) {
  const { scene } = useGLTF(furnitureUrl(name));
  const clone = useMemo(() => {
    const c = scene.clone(true);
    enableShadows(c, castShadow, receiveShadow);
    return c;
  }, [scene, castShadow, receiveShadow]);
  return (
    <group {...props}>
      <primitive object={clone} />
    </group>
  );
}
