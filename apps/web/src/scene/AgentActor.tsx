'use client';

import { resolveState } from '@overseer/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Group } from 'three';
import { useAgentsStore } from '@/state/agents';
import { HoverCard } from '@/ui/HoverCard';
import { showsBubble } from '@/ui/bubbleModel';
import { receivedResult } from '@/ui/resultModel';
import { ThoughtBubble } from '@/ui/ThoughtBubble';
import {
  type DeskPoints,
  animationFor,
  createMotion,
  createWander,
  idleWant,
  stepMotion,
  wantFor,
} from './agentMotion';
import { Character, type CharacterControl } from './Character';
import { deskApproach, deskSlots } from './layout';
import { officeNav } from './officeNav';
import { actorPositions, setActorPosition } from './actorPositions';
import { nudgeCamera } from './cameraNudge';

const SLOTS = deskSlots();

/** Wander spot each idle agent is using, so two agents rarely pick the same one. */
const spotClaims = new Map<string, string>();

function takenSpots(self: string): Set<string> {
  const taken = new Set<string>();
  for (const [id, spot] of spotClaims) if (id !== self) taken.add(spot);
  return taken;
}

interface AgentActorProps {
  id: string;
  deskIndex: number;
  color: string;
}

/**
 * Moves one agent around the office and picks its clip and pose every frame from its visual state.
 * Reads the agent from the store with getState() so state changes never re-render React.
 */
export function AgentActor({ id, deskIndex, color }: AgentActorProps) {
  const group = useRef<Group>(null);
  const control = useRef<CharacterControl>(null);
  const motion = useRef(createMotion());
  const removed = useRef(false);
  const wander = useRef(createWander());
  const desk = useMemo<DeskPoints>(() => {
    const s = SLOTS[deskIndex]!;
    return { seat: [s.seat[0], s.seat[2]], approach: deskApproach(s) };
  }, [deskIndex]);

  // A new subagent: nudge the overview camera toward its desk.
  useEffect(() => {
    if (useAgentsStore.getState().agents[id]?.parentAgentId)
      nudgeCamera(desk.seat[0], desk.seat[1]);
  }, [id, desk]);

  useEffect(
    () => () => {
      spotClaims.delete(id);
      actorPositions.delete(id);
    },
    [id],
  );

  // Set only when the value flips, so useFrame does not cause React renders.
  const [bubble, setBubble] = useState(false);
  const bubbleRef = useRef(false);
  const [result, setResult] = useState<string | null>(null);
  const resultRef = useRef<string | null>(null);
  const hovered = useAgentsStore((s) => s.hoveredId === id);
  const selected = useAgentsStore((s) => s.selectedId === id);
  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    useAgentsStore.getState().hover(id);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    useAgentsStore.getState().select(id);
  };
  const onOut = () => {
    if (useAgentsStore.getState().hoveredId === id) useAgentsStore.getState().hover(null);
  };

  useFrame(({ clock }, delta) => {
    const agent = useAgentsStore.getState().agents[id];
    const g = group.current;
    if (!agent || !g) return;
    const m = motion.current;
    const state = resolveState(agent.machine, Date.now());
    let want = wantFor(state);
    if (state === 'idle') {
      want = idleWant(wander.current, m, clock.elapsedTime, Math.random, takenSpots(id));
      if (wander.current.spot && wander.current.spot !== 'desk')
        spotClaims.set(id, wander.current.spot);
      else spotClaims.delete(id);
    } else if (wander.current.spot !== null) {
      wander.current = createWander();
      spotClaims.delete(id);
    }
    stepMotion(m, want, desk, officeNav(), Math.min(delta, 0.1));
    g.position.set(m.x, 0, m.z);
    setActorPosition(id, m.x, m.z);
    g.rotation.y = m.yaw;
    const atDesk = m.phase === 'seated' || (m.phase === 'stand' && m.target === 'desk');
    const wantBubble = showsBubble(state) && atDesk;
    if (wantBubble !== bubbleRef.current) {
      bubbleRef.current = wantBubble;
      setBubble(wantBubble);
    }
    // Parent reaction when a subagent's result comes back.
    const got = atDesk ? receivedResult(agent, Date.now()) : null;
    if (got !== resultRef.current) {
      resultRef.current = got;
      setResult(got);
    }
    const anim = animationFor(m, state);
    control.current?.play(anim.clip, anim.speed);
    control.current?.pose(got && m.phase === 'seated' ? 'sitReceive' : anim.pose);
    if (m.phase === 'gone' && !removed.current) {
      removed.current = true;
      useAgentsStore.getState().remove(id);
    }
  });

  return (
    <group ref={group} position={[motion.current.x, 0, motion.current.z]}>
      <Character
        control={control}
        color={color}
        outline={selected ? '#ffffff' : hovered ? color : null}
      />
      {/* Invisible hit target: cheaper and steadier than raycasting the skinned mesh. */}
      <mesh
        position={[0, 0.48, 0]}
        visible={false}
        onPointerOver={onOver}
        onPointerOut={onOut}
        onClick={onClick}
      >
        <cylinderGeometry args={[0.2, 0.2, 0.96, 8]} />
      </mesh>
      {hovered ? (
        <HoverCard id={id} color={color} />
      ) : bubble || result ? (
        <ThoughtBubble id={id} result={result} />
      ) : null}
    </group>
  );
}
