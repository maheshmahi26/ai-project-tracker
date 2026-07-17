import { describe, expect, it } from 'vitest';
import type { ChatSseEvent } from '@ai-projectos/shared';
import { initialTurn, mergeToolCalls, streamReducer } from './chat-stream';

function fold(events: ChatSseEvent[]) {
  return events.reduce(streamReducer, initialTurn());
}

describe('streamReducer', () => {
  it('accumulates token deltas into content', () => {
    const state = fold([
      { type: 'token', delta: 'Hello' },
      { type: 'token', delta: ', ' },
      { type: 'token', delta: 'world' },
    ]);
    expect(state.content).toBe('Hello, world');
    expect(state.status).toBe('streaming');
  });

  it('adds a running tool call then resolves it on result', () => {
    const state = fold([
      { type: 'tool_call', callId: 'c1', name: 'createTask', args: { title: 'x' } },
      { type: 'tool_result', callId: 'c1', name: 'createTask', ok: true, data: { key: 'AUTH-1' } },
    ]);
    expect(state.toolCalls).toHaveLength(1);
    expect(state.toolCalls[0]).toMatchObject({
      callId: 'c1',
      name: 'createTask',
      status: 'ok',
      data: { key: 'AUTH-1' },
    });
  });

  it('marks a tool call as error and keeps the error payload', () => {
    const state = fold([
      { type: 'tool_call', callId: 'c1', name: 'deleteTask', args: {} },
      {
        type: 'tool_result',
        callId: 'c1',
        name: 'deleteTask',
        ok: false,
        error: { code: 'PERMISSION_DENIED', message: 'nope' },
      },
    ]);
    expect(state.toolCalls[0]?.status).toBe('error');
    expect(state.toolCalls[0]?.error).toEqual({ code: 'PERMISSION_DENIED', message: 'nope' });
  });

  it('ignores duplicate tool_call ids', () => {
    const state = fold([
      { type: 'tool_call', callId: 'c1', name: 'a', args: {} },
      { type: 'tool_call', callId: 'c1', name: 'a', args: {} },
    ]);
    expect(state.toolCalls).toHaveLength(1);
  });

  it('captures done ids and final status', () => {
    const state = fold([
      { type: 'token', delta: 'done text' },
      { type: 'done', messageId: 'm1', executionId: 'e1', status: 'success' },
    ]);
    expect(state.status).toBe('done');
    expect(state.messageId).toBe('m1');
    expect(state.executionId).toBe('e1');
    expect(state.finalStatus).toBe('success');
  });

  it('transitions to error on an error event', () => {
    const state = fold([{ type: 'error', code: 'AGENT_FAILED', message: 'boom' }]);
    expect(state.status).toBe('error');
    expect(state.error).toEqual({ code: 'AGENT_FAILED', message: 'boom' });
  });
});

describe('mergeToolCalls', () => {
  it('joins persisted calls with their results by callId', () => {
    const merged = mergeToolCalls(
      [
        { callId: 'a', name: 'createTask', args: { t: 1 } },
        { callId: 'b', name: 'deleteTask', args: {} },
      ],
      [
        { callId: 'a', ok: true, data: { key: 'X-1' } },
        { callId: 'b', ok: false, error: { code: 'E', message: 'm' } },
      ],
    );
    expect(merged[0]).toMatchObject({ name: 'createTask', status: 'ok', data: { key: 'X-1' } });
    expect(merged[1]).toMatchObject({ name: 'deleteTask', status: 'error' });
  });

  it('defaults to ok when a result is missing', () => {
    const merged = mergeToolCalls([{ callId: 'a', name: 'x', args: {} }], []);
    expect(merged[0]?.status).toBe('ok');
  });
});
