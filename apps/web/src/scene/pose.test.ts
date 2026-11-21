import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { AnimationMixer, Group, type Object3D, Vector3 } from 'three';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { PoseName } from '@overseer/shared';
import { CHARACTER_SCALE } from './characterConfig';
import { applyPose, createRig, type PoseRig } from './pose';
import { SEAT_HIPS_Y, poseSpec } from './poses';

const GLB = fileURLToPath(new URL('../../public/models/characters/human.glb', import.meta.url));

let gltf: GLTF;

beforeAll(async () => {
  const buf = readFileSync(GLB);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  gltf = await new Promise<GLTF>((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
});

/** A posed character at the origin facing +Z, the Idle clip applied underneath like in the app. */
function posed(name: PoseName, t = 0.5, yaw = 0): { rig: PoseRig; p: (bone: string) => Vector3 } {
  const root = new Group();
  root.rotation.y = yaw;
  const inner = new Group();
  inner.scale.setScalar(CHARACTER_SCALE);
  const model = cloneSkinned(gltf.scene);
  inner.add(model);
  root.add(inner);
  const mixer = new AnimationMixer(inner);
  const idle = gltf.animations.find((c) => c.name.endsWith('|Idle'))!;
  mixer.clipAction(idle).play();
  mixer.update(t);
  root.updateMatrixWorld(true);
  const rig = createRig(root);
  const spec = poseSpec(name, t);
  if (spec) applyPose(rig, spec, 1);
  root.updateMatrixWorld(true);
  const p = (bone: string) => {
    const o: Object3D = rig.bones[bone]!;
    // Back to character space so assertions do not depend on yaw.
    return root.worldToLocal(o.getWorldPosition(new Vector3()));
  };
  return { rig, p };
}

const SEATED: PoseName[] = [
  'sitType',
  'sitRead',
  'sitLeanBack',
  'sitChin',
  'sitRaiseHand',
  'sitSlump',
  'sitReceive',
];

describe('applyPose', () => {
  it.each(SEATED)('%s: hips on the seat, knees forward, feet on the floor', (name) => {
    const { p } = posed(name);
    expect(p('Hips').y).toBeCloseTo(SEAT_HIPS_Y, 1);
    for (const side of ['Left', 'Right']) {
      const knee = p(`${side}Leg`);
      const foot = p(`${side}Foot`);
      expect(knee.z).toBeGreaterThan(p('Hips').z + 0.15);
      expect(Math.abs(knee.y - p('Hips').y)).toBeLessThan(0.05);
      expect(foot.y).toBeGreaterThan(-0.02);
      expect(foot.y).toBeLessThan(0.09);
    }
    // Left limbs stay on the +X side.
    expect(p('LeftLeg').x).toBeGreaterThan(p('RightLeg').x);
    expect(p('LeftArm').x).toBeGreaterThan(p('RightArm').x);
    expect(p('Head').y).toBeGreaterThan(p('Hips').y + 0.2);
  });

  it('typing puts both hands forward at desk height', () => {
    const { p } = posed('sitType');
    for (const side of ['Left', 'Right']) {
      const hand = p(`${side}Hand`);
      expect(hand.z).toBeGreaterThan(0.15);
      expect(hand.y).toBeGreaterThan(0.3);
      expect(hand.y).toBeLessThan(0.48);
    }
  });

  it('raise hand lifts the right hand above the head', () => {
    const { p } = posed('sitRaiseHand');
    expect(p('RightHand').y).toBeGreaterThan(p('HeadTop_End').y);
    expect(p('LeftHand').y).toBeLessThan(p('Head').y);
  });

  it('chin pose brings the right hand near the head', () => {
    const { p } = posed('sitChin');
    expect(p('RightHand').distanceTo(p('Head'))).toBeLessThan(0.14);
  });

  it('cheer lifts both hands, point extends the right arm forward', () => {
    const cheer = posed('cheer');
    expect(cheer.p('LeftHand').y).toBeGreaterThan(cheer.p('HeadTop_End').y);
    expect(cheer.p('RightHand').y).toBeGreaterThan(cheer.p('HeadTop_End').y);
    const point = posed('point');
    expect(point.p('RightHand').z).toBeGreaterThan(point.p('RightArm').z + 0.2);
  });

  it('is independent of the character yaw', () => {
    const a = posed('sitType', 0.5, 0).p('LeftHand');
    const b = posed('sitType', 0.5, Math.PI * 0.7).p('LeftHand');
    expect(a.distanceTo(b)).toBeLessThan(1e-3);
  });

  it('weight 0 leaves the clip pose untouched', () => {
    const { rig } = posed('none');
    const before = rig.bones.LeftForeArm!.quaternion.clone();
    applyPose(rig, poseSpec('sitType', 0.5)!, 0);
    expect(rig.bones.LeftForeArm!.quaternion.equals(before)).toBe(true);
  });
});
