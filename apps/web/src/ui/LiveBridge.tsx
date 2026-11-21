'use client';

import { useEffect } from 'react';
import { actorPositions } from '@/scene/actorPositions';
import { useAgentsStore } from '@/state/agents';
import { useConnectionStore } from '@/state/connection';
import { isLocalHost, startModeController } from '@/state/mode';

declare global {
  interface Window {
    /** Dev hook for scripted checks (scripts/shot.mjs): read the live stores. */
    __overseerStores?: {
      agents: typeof useAgentsStore;
      connection: typeof useConnectionStore;
      positions: typeof actorPositions;
    };
  }
}

/**
 * Live bridge or recorded demo. Auto mode falls back to the demo when no bridge answers.
 * `?demo=<name>` forces a recording, `?live` forces live, `?demo` alone shows fake agents only.
 * Deployed (non-localhost) pages start in demo mode and connect to the bridge only on "Go live".
 */
export function LiveBridge() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      window.__overseerStores = {
        agents: useAgentsStore,
        connection: useConnectionStore,
        positions: actorPositions,
      };
    }
    const params = new URLSearchParams(window.location.search);
    // `?demo` alone: fake agents only (debug panel), no bridge and no recording.
    if (params.has('demo') && !params.get('demo')) return;
    // `?demo=<name>`: play that recording. Otherwise auto: live when the bridge answers, else demo.
    // A deployed page (not localhost) starts in demo mode; "Go live" still reaches a local bridge.
    const name = params.get('demo');
    if (name) return startModeController({ choice: 'demo', demoName: name });
    if (params.has('live')) return startModeController({ choice: 'live' });
    return startModeController({
      choice: isLocalHost(window.location.hostname) ? 'auto' : 'demo',
    });
  }, []);
  return null;
}
