'use client';

import { useShallow } from 'zustand/react/shallow';
import { useAgentsStore } from '@/state/agents';
import { AgentActor } from './AgentActor';
import { agentColor } from './agentColor';

/** Every agent in the office. Re-renders only when agents join or leave. */
export function Agents() {
  const list = useAgentsStore(
    useShallow((s) => Object.values(s.agents).map((a) => `${a.id}|${a.deskIndex}`)),
  );
  return (
    <>
      {list.map((key) => {
        const [id, desk] = key.split('|') as [string, string];
        return <AgentActor key={id} id={id} deskIndex={Number(desk)} color={agentColor(id)} />;
      })}
    </>
  );
}
