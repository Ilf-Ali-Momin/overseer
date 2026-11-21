import type { AgentEvent } from '@overseer/shared';
import { useAgentsStore } from './agents';
import { useConnectionStore } from './connection';
import { type BridgeEventSource, createEventSource } from './eventSource';
import { type FrameBatcher, createFrameBatcher } from './frameBatch';

/**
 * Wire the bridge WebSocket into the stores: snapshots load directly, live events are batched per
 * animation frame, status goes to the connection store. Returns a cleanup function.
 */
export function connectBridge(
  source: BridgeEventSource = createEventSource(),
  batcher: FrameBatcher<AgentEvent> = createFrameBatcher((evs) =>
    useAgentsStore.getState().applyMany(evs),
  ),
  /** When false, data is dropped (status still updates): used while a demo plays. */
  enabled: () => boolean = () => true,
): () => void {
  const setStatus = useConnectionStore.getState().setStatus;
  const offs = [
    source.onStatus(setStatus),
    source.onSnapshot((agents) => {
      if (!enabled()) return;
      // Events queued before the snapshot belong before it.
      batcher.flush();
      useAgentsStore.getState().loadSnapshot(agents);
    }),
    source.onEvent((ev) => {
      if (enabled()) batcher.push(ev);
    }),
  ];
  setStatus(source.status());
  source.start();
  return () => {
    for (const off of offs) off();
    source.close();
    batcher.dispose();
    setStatus('off');
  };
}
