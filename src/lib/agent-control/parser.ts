import {
  agentControlStateSchema,
  type AgentControlState,
} from './control-state';

export const AGENT_CONTROL_STATE_START = '<!-- AGENT_CONTROL_STATE_START -->';
export const AGENT_CONTROL_STATE_END = '<!-- AGENT_CONTROL_STATE_END -->';

export type AgentControlParseErrorCode =
  | 'MISSING_BLOCK'
  | 'DUPLICATE_BLOCK'
  | 'MALFORMED_MARKERS'
  | 'MISSING_JSON_FENCE'
  | 'DUPLICATE_JSON_FENCE'
  | 'UNEXPECTED_CONTENT'
  | 'MALFORMED_JSON'
  | 'INVALID_SCHEMA';

export class AgentControlParseError extends Error {
  readonly code: AgentControlParseErrorCode;
  readonly details?: unknown;

  constructor(
    code: AgentControlParseErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AgentControlParseError';
    this.code = code;
    this.details = details;
  }
}

function countOccurrences(input: string, needle: string): number {
  let count = 0;
  let index = 0;
  while (true) {
    const matchIndex = input.indexOf(needle, index);
    if (matchIndex === -1) return count;
    count++;
    index = matchIndex + needle.length;
  }
}

function findSingleFence(block: string): string {
  const matches = Array.from(block.matchAll(/```json[ \t]*\r?\n([\s\S]*?)```/g));
  if (matches.length === 0) {
    throw new AgentControlParseError(
      'MISSING_JSON_FENCE',
      'agent control block must contain one fenced JSON object',
    );
  }
  if (matches.length > 1) {
    throw new AgentControlParseError(
      'DUPLICATE_JSON_FENCE',
      'agent control block must contain exactly one fenced JSON object',
    );
  }

  const match = matches[0];
  const withoutFence = block.slice(0, match.index)
    + block.slice((match.index ?? 0) + match[0].length);
  if (withoutFence.trim() !== '') {
    throw new AgentControlParseError(
      'UNEXPECTED_CONTENT',
      'agent control block may only contain whitespace outside the JSON fence',
    );
  }

  return match[1];
}

export function parseAgentControlState(markdown: string): AgentControlState {
  const startCount = countOccurrences(markdown, AGENT_CONTROL_STATE_START);
  const endCount = countOccurrences(markdown, AGENT_CONTROL_STATE_END);

  if (startCount === 0 || endCount === 0) {
    throw new AgentControlParseError(
      'MISSING_BLOCK',
      'agent control state block is required',
    );
  }
  if (startCount !== 1 || endCount !== 1) {
    throw new AgentControlParseError(
      'DUPLICATE_BLOCK',
      'exactly one agent control state block is required',
    );
  }

  const startIndex = markdown.indexOf(AGENT_CONTROL_STATE_START);
  const endIndex = markdown.indexOf(AGENT_CONTROL_STATE_END);
  if (startIndex > endIndex) {
    throw new AgentControlParseError(
      'MALFORMED_MARKERS',
      'agent control START marker must appear before END marker',
    );
  }

  const block = markdown.slice(
    startIndex + AGENT_CONTROL_STATE_START.length,
    endIndex,
  );
  const jsonText = findSingleFence(block);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new AgentControlParseError(
      'MALFORMED_JSON',
      'agent control JSON is malformed',
      error,
    );
  }

  const result = agentControlStateSchema.safeParse(parsed);
  if (!result.success) {
    throw new AgentControlParseError(
      'INVALID_SCHEMA',
      'agent control state does not match schema v1',
      result.error.flatten(),
    );
  }

  return result.data;
}
