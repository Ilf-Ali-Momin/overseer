import { type Object3D, Quaternion, Vector3 } from 'three';

/**
 * Procedural bone posing for the Quaternius "Animated Human" (Mixamo-style bone names).
 *
 * A pose says which way each bone should point, in character model space (+Z forward, +X the
 * character's left, +Y up), instead of raw local rotations. That keeps poses readable and
 * independent of the rig's bone axis conventions. The solver rotates each bone, parent first,
 * so the segment from the bone to its child points along the target direction, optionally fixing
 * twist with a second reference segment. The result is blended with whatever the animation mixer
 * produced, so poses crossfade in and out.
 */

export type V3 = readonly [number, number, number];

export const POSE_BONES = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',
  'LeftArm',
  'LeftForeArm',
  'RightArm',
  'RightForeArm',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
] as const;
export type PoseBone = (typeof POSE_BONES)[number];

/** Child used to measure each bone's direction. */
const AIM_CHILD: Record<PoseBone, string> = {
  Hips: 'Spine',
  Spine: 'Spine1',
  Spine1: 'Spine2',
  Spine2: 'Neck',
  Neck: 'Head',
  Head: 'HeadTop_End',
  LeftArm: 'LeftForeArm',
  LeftForeArm: 'LeftHand',
  RightArm: 'RightForeArm',
  RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg',
  LeftLeg: 'LeftFoot',
  LeftFoot: 'LeftToeBase',
  RightUpLeg: 'RightLeg',
  RightLeg: 'RightFoot',
  RightFoot: 'RightToeBase',
};

/** Twist references: the segment `from -> to` should point along the given direction. */
const TWIST_REF: Partial<Record<PoseBone, readonly [string, string]>> = {
  Hips: ['RightUpLeg', 'LeftUpLeg'],
  Spine2: ['RightArm', 'LeftArm'],
};

export interface BoneAim {
  dir: V3;
  /** Direction for the bone's twist reference (see TWIST_REF); only Hips and Spine2 have one. */
  side?: V3;
}

export interface PoseSpec {
  /** Hips position in character space (world units, relative to the character origin). */
  hips?: V3;
  bones: Partial<Record<PoseBone, BoneAim>>;
}

export interface PoseRig {
  /** The character's unscaled root group: its local space is the pose space. */
  root: Object3D;
  bones: Record<string, Object3D>;
}

export function createRig(root: Object3D): PoseRig {
  const bones: Record<string, Object3D> = {};
  root.traverse((o) => {
    if (o.name) bones[o.name] ??= o;
  });
  return { root, bones };
}

// Scratch objects, reused every call (the solver runs per agent per frame).
const _a = new Vector3();
const _b = new Vector3();
const _cur = new Vector3();
const _tgt = new Vector3();
const _side = new Vector3();
const _sideTgt = new Vector3();
const _rootQ = new Quaternion();
const _boneQ = new Quaternion();
const _parentQ = new Quaternion();
const _delta = new Quaternion();
const _twist = new Quaternion();
const _local = new Quaternion();
const _pos = new Vector3();

function worldPos(o: Object3D, out: Vector3): Vector3 {
  return out.setFromMatrixPosition(o.matrixWorld);
}

function toWorldDir(v: V3, out: Vector3): Vector3 {
  return out.set(v[0], v[1], v[2]).normalize().applyQuaternion(_rootQ);
}

/**
 * Apply `pose` on top of the current bone transforms with blend weight `w` (0..1).
 * World matrices must be current when called (call after the mixer update).
 */
export function applyPose(rig: PoseRig, pose: PoseSpec, w: number): void {
  if (w <= 0) return;
  const { root, bones } = rig;
  root.updateWorldMatrix(true, true);
  root.getWorldQuaternion(_rootQ);

  const hips = bones.Hips;
  if (pose.hips && hips?.parent) {
    _pos.set(pose.hips[0], pose.hips[1], pose.hips[2]);
    root.localToWorld(_pos);
    hips.parent.worldToLocal(_pos);
    hips.position.lerp(_pos, w);
    hips.updateMatrixWorld(true);
  }

  for (const name of POSE_BONES) {
    const aim = pose.bones[name];
    const bone = bones[name];
    const child = bones[AIM_CHILD[name]];
    if (!aim || !bone || !child || !bone.parent) continue;

    _cur.subVectors(worldPos(child, _b), worldPos(bone, _a)).normalize();
    toWorldDir(aim.dir, _tgt);
    _delta.setFromUnitVectors(_cur, _tgt);

    const ref = TWIST_REF[name];
    if (aim.side && ref) {
      const from = bones[ref[0]];
      const to = bones[ref[1]];
      if (from && to) {
        _side.subVectors(worldPos(to, _b), worldPos(from, _a)).applyQuaternion(_delta);
        toWorldDir(aim.side, _sideTgt);
        // Compare both side vectors in the plane perpendicular to the aim direction.
        _side.projectOnPlane(_tgt);
        _sideTgt.projectOnPlane(_tgt);
        if (_side.lengthSq() > 1e-10 && _sideTgt.lengthSq() > 1e-10) {
          _twist.setFromUnitVectors(_side.normalize(), _sideTgt.normalize());
          _delta.premultiply(_twist);
        }
      }
    }

    bone.getWorldQuaternion(_boneQ).premultiply(_delta);
    bone.parent.getWorldQuaternion(_parentQ).invert();
    _local.multiplyQuaternions(_parentQ, _boneQ);
    bone.quaternion.slerp(_local, w);
    bone.updateMatrixWorld(true);
  }
}
