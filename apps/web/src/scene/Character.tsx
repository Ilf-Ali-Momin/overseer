'use client';

import type { ClipName, PoseName } from '@overseer/shared';
import { Outlines, useAnimations, useGLTF } from '@react-three/drei';
import { type ThreeElements, createPortal, useFrame } from '@react-three/fiber';
import { type RefObject, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { Group, Material, Mesh, MeshStandardMaterial, SkinnedMesh } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTER_SCALE, CHARACTER_URL, CLIP_PREFIX, CROSSFADE } from './characterConfig';
import { applyPose, createRig, type PoseRig } from './pose';
import { poseSpec } from './poses';

/** Imperative handle so actors can drive animation from useFrame without React renders. */
export interface CharacterControl {
  /** Crossfade to a clip (no-op when it is already playing); `speed` can change any time. */
  play: (clip: ClipName, speed?: number) => void;
  /** Crossfade to a procedural pose ('none' fades back to the plain clip). */
  pose: (name: PoseName) => void;
}

type CharacterProps = ThreeElements['group'] & {
  color?: string;
  /** Initial clip. */
  clip?: ClipName;
  control?: RefObject<CharacterControl | null>;
  /** Outline color (hover / selection highlight); none when unset. */
  outline?: string | null;
};

interface PoseLayer {
  name: PoseName;
  weight: number;
}

/**
 * One animated character. The skinned mesh is cloned per instance with SkeletonUtils so every
 * character has its own skeleton; geometry is shared, the single material is cloned so it can be
 * tinted per agent. Procedural poses are layered on top of the clip after the mixer update.
 */
export function Character({
  color = '#cccccc',
  clip = 'Idle',
  control,
  outline = null,
  ...props
}: CharacterProps) {
  const { scene, animations } = useGLTF(CHARACTER_URL);
  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);

  const { model, material, skinned } = useMemo(() => {
    const model = cloneSkinned(scene);
    let material: MeshStandardMaterial | null = null;
    let skinned: SkinnedMesh | null = null;
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      // Skinned bounds follow the bind pose, not the animation; skip culling for these small meshes.
      mesh.frustumCulled = false;
      material = (mesh.material as Material).clone() as MeshStandardMaterial;
      mesh.material = material;
      if ((mesh as SkinnedMesh).isSkinnedMesh) skinned = mesh as SkinnedMesh;
    });
    return {
      model,
      material: material as MeshStandardMaterial | null,
      skinned: skinned as SkinnedMesh | null,
    };
  }, [scene]);

  useEffect(() => () => material?.dispose(), [material]);
  useEffect(() => {
    material?.color.set(color);
  }, [material, color]);

  // Registered before the pose useFrame below, so the mixer updates first each frame.
  const { actions } = useAnimations(animations, inner);

  const anim = useRef({
    clip: null as ClipName | null,
    speed: 1,
    cur: { name: 'none', weight: 1 } as PoseLayer,
    prev: null as PoseLayer | null,
    rig: null as PoseRig | null,
    // Desynchronise poses between characters.
    phase: Math.random() * 10,
  });

  const api = useMemo<CharacterControl>(
    () => ({
      play: (next, speed = 1) => {
        const a = anim.current;
        const action = actions[CLIP_PREFIX + next];
        if (!action) return;
        action.timeScale = speed;
        a.speed = speed;
        if (a.clip === next) return;
        const prev = a.clip ? actions[CLIP_PREFIX + a.clip] : null;
        action
          .reset()
          .setEffectiveWeight(1)
          .fadeIn(prev ? CROSSFADE : 0)
          .play();
        prev?.fadeOut(CROSSFADE);
        a.clip = next;
      },
      pose: (name) => {
        const a = anim.current;
        if (a.cur.name === name) return;
        // The layer being replaced keeps its weight and is blended out underneath the new one.
        a.prev = a.cur.name === 'none' ? null : a.cur;
        a.cur = { name, weight: 0 };
      },
    }),
    [actions],
  );

  useImperativeHandle(control, () => api, [api]);

  useEffect(() => {
    api.play(clip);
  }, [api, clip]);

  useFrame((state, delta) => {
    const a = anim.current;
    if (!outer.current) return;
    a.rig ??= createRig(outer.current);
    const step = Math.min(delta, 0.1) / CROSSFADE;
    const t = state.clock.elapsedTime + a.phase;
    const { cur } = a;

    if (cur.name === 'none') {
      // Fading back to the plain clip.
      if (a.prev) {
        a.prev.weight -= step;
        if (a.prev.weight <= 0) a.prev = null;
      }
    } else {
      cur.weight = Math.min(1, cur.weight + step);
      if (cur.weight >= 1) a.prev = null;
    }

    if (a.prev) {
      const spec = poseSpec(a.prev.name, t);
      if (spec) applyPose(a.rig, spec, a.prev.weight);
    }
    const spec = poseSpec(cur.name, t);
    if (spec) applyPose(a.rig, spec, cur.weight);
  });

  return (
    <group ref={outer} {...props}>
      <group ref={inner} scale={CHARACTER_SCALE}>
        <primitive object={model} />
      </group>
      {outline && skinned
        ? createPortal(<Outlines color={outline} thickness={3} />, skinned)
        : null}
    </group>
  );
}

useGLTF.preload(CHARACTER_URL);
