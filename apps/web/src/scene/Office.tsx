'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { useAgentsStore } from '@/state/agents';
import { AgentPanel } from '@/ui/AgentPanel';
import { DebugPanel } from '@/ui/DebugPanel';
import { RiskFeed } from '@/ui/RiskFeed';
import { Timeline } from '@/ui/Timeline';
import { Hud } from '@/ui/Hud';
import { LiveBridge } from '@/ui/LiveBridge';
import { ViewControls } from '@/ui/ViewControls';
import { CameraRig } from './CameraRig';
import { Agents } from './Agents';
import { Desks } from './Desks';
import { Effects } from './Effects';
import { Lighting } from './Lighting';
import { Monitors } from './Monitors';
import { Perf } from './Perf';
import { ReactionFx } from './ReactionFx';
import { RiskLamps } from './RiskLamps';
import { SoundFx } from './SoundFx';
import { Room } from './Room';

export default function Office() {
  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        style={{ position: 'fixed', inset: 0 }}
        onPointerMissed={() => useAgentsStore.getState().select(null)}
      >
        <color attach="background" args={['#0b0d12']} />
        <CameraRig />
        <Lighting />
        <Suspense fallback={null}>
          <Room />
          <Desks />
          <Monitors />
          <RiskLamps />
          <ReactionFx />
          <SoundFx />
          <Agents />
        </Suspense>
        <Perf />
        <Effects />
      </Canvas>
      <Hud />
      <AgentPanel />
      <RiskFeed />
      <Timeline />
      <ViewControls />
      <DebugPanel />
      <LiveBridge />
    </>
  );
}
