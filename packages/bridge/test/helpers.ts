import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { AgentEvent } from '@overseer/shared';
import { parseLines } from '../src/parser';
import { SessionNormalizer, type NormalizerOptions } from '../src/normalizer';

export const FIXTURES = fileURLToPath(new URL('../fixtures/projects', import.meta.url));
export const PROJECT_DIR = join(FIXTURES, '-Users-dev-demo-app');
export const NORMAL = '11111111-1111-4111-8111-111111111111';
export const WITH_SUBAGENT = '22222222-2222-4222-8222-222222222222';
export const ERRORS = '33333333-3333-4333-8333-333333333333';
export const SUBAGENT_ID = 'a0c0ffee00000000b';

export function fixtureText(relPath: string): string {
  return readFileSync(join(PROJECT_DIR, relPath), 'utf8');
}

export function normalizeFixture(
  relPath: string,
  opts: NormalizerOptions,
): { events: AgentEvent[]; normalizer: SessionNormalizer } {
  const normalizer = new SessionNormalizer(opts);
  const events = parseLines(fixtureText(relPath)).flatMap((l) => normalizer.push(l));
  return { events, normalizer };
}
