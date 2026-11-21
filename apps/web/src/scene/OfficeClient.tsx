'use client';

import dynamic from 'next/dynamic';

/** WebGL only runs in the browser: load the scene without SSR. */
export const OfficeClient = dynamic(() => import('./Office'), {
  ssr: false,
  loading: () => null,
});
