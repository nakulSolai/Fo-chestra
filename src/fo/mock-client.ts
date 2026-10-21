import { randomUUID } from 'node:crypto';
import type { FoClient, FoReply } from '../shared/types.js';

interface SimulatedConversation { polls: number; answered: boolean; initialMessage: string }
/** Deterministic simulated protocol states; never contacts Fo or performs any external action. */
export class MockFoClient implements FoClient {
  private conversations = new Map<string, SimulatedConversation>();
  private closed = false;
  constructor(private readonly options: { delayMs?: number; scenario?: 'success' | 'question' | 'failure' } = {}) {}
  private async delay(): Promise<void> {
    if (this.closed) throw new Error('Simulated Fo client is closed.');
    await new Promise(resolve => setTimeout(resolve, this.options.delayMs ?? 80));
    if (this.closed) throw new Error('Simulated Fo client is closed.');
  }
  async discover() { return { connected: true, tools: ['ask_fo', 'get_fo_reply', 'list_fo_conversations', 'get_fo_conversation'], message: 'Deterministic simulated Fo service. No messages, calls, bookings, or purchases are sent.' }; }
  async submit(message: string): Promise<FoReply> {
    if (!message.trim()) throw new Error('A simulated request needs a message.');
    await this.delay();
    const conversationId = `sim-${randomUUID()}`;
    this.conversations.set(conversationId, { polls: 0, answered: false, initialMessage: message });
    return { status: 'working', conversationId, progress: 'Simulated service accepted the approved request.', elapsedSeconds: 0 };
  }
  async poll(conversationId: string, waitSeconds = 0): Promise<FoReply> {
    if (!Number.isInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 40) throw new Error('Invalid simulated wait duration.');
    await this.delay();
    const conversation = this.conversations.get(conversationId);
    if (!conversation) throw new Error('Unknown simulated conversation.');
    conversation.polls++;
    if (this.options.scenario === 'failure' && conversation.polls >= 2) return { status: 'failed', conversationId, response: 'Simulated provider failure. No external action occurred.', elapsedSeconds: conversation.polls };
    if (conversation.polls === 1) return { status: 'working', conversationId, response: '', progress: 'Simulated service is gathering a response while browser workers continue.', elapsedSeconds: 1 };
    if (this.options.scenario === 'question' && !conversation.answered) return { status: 'complete', conversationId, response: 'Simulated question: should I continue with the prepared request? Please confirm.', elapsedSeconds: conversation.polls };
    return { status: 'complete', conversationId, response: 'Simulated provider reports that the approved inquiry is complete. This is simulated evidence; no external action occurred.', elapsedSeconds: conversation.polls };
  }
  async answer(conversationId: string, message: string): Promise<FoReply> {
    await this.delay();
    const conversation = this.conversations.get(conversationId);
    if (!conversation || !message.trim()) throw new Error('Invalid simulated answer.');
    conversation.answered = true; conversation.polls = 0;
    return { status: 'working', conversationId, progress: 'Simulated service received the reviewed answer.', elapsedSeconds: 0 };
  }
  async close(): Promise<void> { this.closed = true; this.conversations.clear(); }
}
