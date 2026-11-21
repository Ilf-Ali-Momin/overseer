import { OfficeClient } from '@/scene/OfficeClient';

export default function Home() {
  return (
    <main>
      <OfficeClient />
      <h1
        style={{
          position: 'fixed',
          top: 16,
          left: 20,
          margin: 0,
          fontSize: '1.1rem',
          letterSpacing: '0.08em',
          pointerEvents: 'none',
        }}
      >
        Overseer
      </h1>
    </main>
  );
}
