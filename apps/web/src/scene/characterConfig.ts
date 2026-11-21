export const CHARACTER_URL = '/models/characters/human.glb';
/**
 * Raw model is ~4.9 units to the head top (69x armature scale); 0.18 gives ~0.94 next to a 0.38
 * desk. The model faces +Z (Walk clip); the Idle clip stands turned ~45 degrees toward -X.
 */
export const CHARACTER_SCALE = 0.18;
/** Crossfade time between clips and poses, in seconds. */
export const CROSSFADE = 0.25;
/** Clip names in the GLB are prefixed with the armature name. */
export const CLIP_PREFIX = 'Human Armature|';
