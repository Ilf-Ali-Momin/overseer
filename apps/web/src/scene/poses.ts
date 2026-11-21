import type { PoseName } from '@overseer/shared';
import type { BoneAim, PoseBone, PoseSpec, V3 } from './pose';

/**
 * Pose library. Directions are in character space: +Z forward, +X the character's left, +Y up.
 * `Right*` bones sit on the -X side. Each pose is a function of time (seconds) so it can move.
 */

/** Hips height when seated; a Kenney desk chair seat is about this high. */
export const SEAT_HIPS_Y = 0.27;

type Bones = Partial<Record<PoseBone, BoneAim>>;

const mirror = (v: V3): V3 => [-v[0], v[1], v[2]];

const UPRIGHT: Bones = {
  Hips: { dir: [0, 1, 0], side: [1, 0, 0] },
  Spine: { dir: [0, 1, 0.03] },
  Spine1: { dir: [0, 1, 0.03] },
  Spine2: { dir: [0, 1, 0.03], side: [1, 0, 0] },
  Neck: { dir: [0, 1, 0.12] },
  Head: { dir: [0, 1, 0.08] },
};

const THIGH: V3 = [0.12, -0.04, 1];
const SHIN: V3 = [0.02, -1, 0.06];
const FOOT: V3 = [0.05, -0.35, 1];

const LEGS_SEATED: Bones = {
  LeftUpLeg: { dir: THIGH },
  LeftLeg: { dir: SHIN },
  LeftFoot: { dir: FOOT },
  RightUpLeg: { dir: mirror(THIGH) },
  RightLeg: { dir: mirror(SHIN) },
  RightFoot: { dir: mirror(FOOT) },
};

/** Upper arms down and a bit forward, forearms forward onto the desk. */
const UPPER_DESK: V3 = [0.12, -1, 0.35];
const FORE_DESK: V3 = [-0.12, -0.05, 1];

const ARMS_DESK: Bones = {
  LeftArm: { dir: UPPER_DESK },
  LeftForeArm: { dir: FORE_DESK },
  RightArm: { dir: mirror(UPPER_DESK) },
  RightForeArm: { dir: mirror(FORE_DESK) },
};

function seated(t: number, bones: Bones): PoseSpec {
  const breathe = Math.sin(t * 1.6) * 0.004;
  return {
    hips: [0, SEAT_HIPS_Y + breathe, 0],
    bones: { ...UPRIGHT, ...LEGS_SEATED, ...ARMS_DESK, ...bones },
  };
}

const POSES: Record<Exclude<PoseName, 'none'>, (t: number) => PoseSpec> = {
  sitType: (t) => {
    const l = Math.sin(t * 14) * 0.18;
    const r = Math.sin(t * 14 + 2.1) * 0.18;
    return seated(t, {
      LeftForeArm: { dir: [-0.12, -0.05 + l, 1] },
      RightForeArm: { dir: [0.12, -0.05 + r, 1] },
      Head: { dir: [0, 1, 0.22] },
    });
  },
  sitRead: (t) =>
    seated(t, {
      // Right hand on the mouse, left hand resting on the lap.
      RightForeArm: { dir: [-0.05, -0.05, 1] },
      LeftArm: { dir: [0.08, -1, 0.15] },
      LeftForeArm: { dir: [-0.25, -0.45, 1] },
      Neck: { dir: [0, 1, 0.2] },
      Head: { dir: [Math.sin(t * 0.7) * 0.06, 1, 0.3] },
    }),
  sitLeanBack: (t) =>
    seated(t, {
      Spine: { dir: [0, 1, -0.3] },
      Spine1: { dir: [0, 1, -0.3] },
      Spine2: { dir: [0, 1, -0.25], side: [1, 0, 0] },
      Neck: { dir: [0, 1, 0.05] },
      Head: { dir: [0, 1, 0.12 + Math.sin(t * 0.9) * 0.04] },
      // Hands behind the head.
      LeftArm: { dir: [1, 0.75, -0.15] },
      LeftForeArm: { dir: [-0.9, 0.55, -0.35] },
      RightArm: { dir: [-1, 0.75, -0.15] },
      RightForeArm: { dir: [0.9, 0.55, -0.35] },
    }),
  sitChin: (t) =>
    seated(t, {
      // Right elbow forward, hand up to the chin.
      RightArm: { dir: [-0.12, -0.55, 1] },
      RightForeArm: { dir: [0.45, 1, -0.35] },
      Spine2: { dir: [0, 1, 0.12], side: [1, 0, 0] },
      Head: { dir: [0.12 + Math.sin(t * 0.8) * 0.05, 1, 0.1] },
    }),
  sitRaiseHand: (t) =>
    seated(t, {
      RightArm: { dir: [-0.3, 1, 0.12] },
      RightForeArm: { dir: [-0.05 + Math.sin(t * 7) * 0.4, 1, 0.05] },
      Head: { dir: [0, 1, 0.02] },
    }),
  sitSlump: (t) =>
    seated(t, {
      Spine: { dir: [0, 1, 0.35] },
      Spine1: { dir: [0, 1, 0.5] },
      Spine2: { dir: [0, 1, 0.6], side: [1, 0, 0] },
      Neck: { dir: [0, 0.8, 1] },
      Head: { dir: [Math.sin(t * 1.2) * 0.15, 0.4, 1] },
      LeftArm: { dir: [0.1, -1, 0.6] },
      RightArm: { dir: [-0.1, -1, 0.6] },
    }),
  sitReceive: (t) => {
    // Lean in, right hand forward palm up, quick nods.
    const nod = Math.max(0, Math.sin(t * 9)) * 0.25;
    return seated(t, {
      Spine2: { dir: [0, 1, 0.15], side: [1, 0, 0] },
      RightArm: { dir: [-0.15, -0.6, 1] },
      RightForeArm: { dir: [0.05, 0.25, 1] },
      Neck: { dir: [0, 1, 0.15 + nod] },
      Head: { dir: [0, 1, 0.1 + nod] },
    });
  },
  point: (t) => ({
    bones: {
      Spine2: { dir: [0, 1, 0.05], side: [1, 0.0, -0.15] },
      RightArm: { dir: [-0.25, 0.12 + Math.sin(t * 3) * 0.05, 1] },
      RightForeArm: { dir: [-0.2, 0.18, 1] },
      LeftArm: { dir: [0.18, -1, 0.05] },
      LeftForeArm: { dir: [0.05, -1, 0.3] },
    },
  }),
  cheer: (t) => {
    const s = Math.sin(t * 8) * 0.25;
    return {
      bones: {
        LeftArm: { dir: [0.45, 1, 0.1] },
        LeftForeArm: { dir: [0.2 + s, 1, 0] },
        RightArm: { dir: [-0.45, 1, 0.1] },
        RightForeArm: { dir: [-0.2 - s, 1, 0] },
        Head: { dir: [0, 1, -0.1] },
      },
    };
  },
};

export function poseSpec(name: PoseName, t: number): PoseSpec | null {
  return name === 'none' ? null : POSES[name](t);
}

export function isSeatedPose(name: PoseName): boolean {
  return name.startsWith('sit');
}
