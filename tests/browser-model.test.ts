import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { LLMProvider } from '@browserbasehq/stagehand/lib/v3/llm/LLMProvider.js';
import { createPlanningModel } from '../src/planner/models.js';
import { extractionMiddleware } from '../src/browser/model.js';

afterEach(() => { vi.unstubAllGlobals(); });

function responder(captured: Record<string, unknown>[]) {
  return async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    captured.push(body);
    return new Response(JSON.stringify({ id: 'offline-response', type: 'message', role: 'assistant', model: body.model,
      content: [{ type: 'text', text: '{"summary":"Verified fixture fact"}' }], stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 12, output_tokens: 8 } }), { headers: { 'content-type': 'application/json' } });
  };
}

describe('Claude 5.5 integration request serialization (offline)', () => {
  for (const family of ['opus', 'sonnet', 'haiku']) {
    it(`Stagehand ${family} uses bounded native JSON without forced tools or sampling overrides`, async () => {
      const captured: Record<string, unknown>[] = [];
      vi.stubGlobal('fetch', responder(captured));
      const provider = new LLMProvider(() => {});
      const client = provider.getClient(`anthropic/claude-${family}-5-5`, { apiKey: 'offline-test-key' }, {
        middleware: extractionMiddleware(new AbortController().signal),
      });
      const result = await client.createChatCompletion<{ summary: string }>({ logger: () => {}, options: {
        messages: [{ role: 'user', content: 'Summarize the fixture.' }], temperature: 0,
        response_model: { name: 'summary', schema: z.object({ summary: z.string() }) },
      } });
      expect(result.data.summary).toBe('Verified fixture fact');
      expect(captured).toHaveLength(1);
      expect(captured[0]).toMatchObject({ model: `claude-${family}-5-5`, max_tokens: 2500,
        output_config: { effort: 'medium', format: { type: 'json_schema' } } });
      expect(captured[0]).not.toHaveProperty('temperature');
      expect(captured[0]).not.toHaveProperty('tool_choice');
      expect(captured[0]).not.toHaveProperty('tools');
    });

    it(`Mastra's direct ${family} provider serializes the configured model and native output`, async () => {
      const captured: Record<string, unknown>[] = [];
      const model = createPlanningModel(`anthropic/claude-${family}-5-5`, { apiKey: 'offline-test-key', fetch: responder(captured) });
      await model.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'Summarize.' }] }], maxOutputTokens: 2500,
        responseFormat: { type: 'json', schema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false } },
        providerOptions: { anthropic: { structuredOutputMode: 'outputFormat', effort: 'medium' } } });
      expect(captured).toHaveLength(1);
      expect(captured[0]).toMatchObject({ model: `claude-${family}-5-5`, max_tokens: 2500,
        output_config: { effort: 'medium', format: { type: 'json_schema' } } });
      expect(captured[0]).not.toHaveProperty('tool_choice');
    });
  }

  it('bounds inference attempts and honors cancellation before requests', async () => {
    const controller = new AbortController();
    const middleware = extractionMiddleware(controller.signal);
    const model = createPlanningModel('anthropic/claude-haiku-5-5', { apiKey: 'offline-test-key' });
    const input = { type: 'generate' as const, model, params: { prompt: [] } };
    for (let i = 0; i < 3; i++) await middleware.transformParams!(input);
    await expect(middleware.transformParams!(input)).rejects.toThrow('request limit');
    controller.abort(new Error('Cancelled by test.'));
    await expect(middleware.transformParams!(input)).rejects.toThrow('Cancelled by test');
  });
});
