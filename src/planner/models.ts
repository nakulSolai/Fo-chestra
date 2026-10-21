import { createAnthropic } from '@ai-sdk/anthropic';

export const DEFAULT_PLANNER_MODEL = 'anthropic/claude-sonnet-5-5';
export const DEFAULT_BROWSER_MODEL = 'anthropic/claude-haiku-5-5';

/** Reuse the installed AI SDK v2 provider used by Stagehand. Its current
 * capability table supports the 5.5 family, unlike Mastra's bundled snapshot.
 * Mastra accepts LanguageModelV2 directly; it still owns planning and workflows. */
export function createPlanningModel(name: string, settings: Parameters<typeof createAnthropic>[0] = {}) {
  if (!name.startsWith('anthropic/claude-')) throw new Error('Planning requires an explicit anthropic/claude-* model ID.');
  return createAnthropic(settings)(name.slice('anthropic/'.length));
}
