import type {
  GlhConversationRow,
  GlhFollowupRow,
  GlhLeadListItem,
  GlhLeadProfileRow,
  GlhMessageRow,
  GlhTaskRow,
} from './read-model';

export type GlhInboxQueueId = 'ALL' | 'WAITING_HUMAN' | 'MINE' | 'UNASSIGNED';

export interface GlhInboxConversation {
  id: string;
  leadId: string;
  contactName: string;
  companyName: string | null;
  country: string | null;
  ownerProfileId: string | null;
  ownerName: string | null;
  isMine: boolean;
  leadVersion: number;
  lifecycle: GlhLeadListItem['lifecycle'];
  conversationMode: GlhLeadListItem['conversationMode'];
  grade: GlhLeadListItem['grade'];
  score: number;
  completeness: number;
  source: GlhLeadListItem['source'];
  lastMessageAt: string | null;
  lastMessagePreview: string;
  originalMessages: GlhMessageRow[];
  aiSummary: string | null;
  missingFields: string[];
  nextAction: string | null;
}

export interface GlhInboxView {
  queues: Array<{ id: GlhInboxQueueId; label: string; count: number }>;
  conversations: GlhInboxConversation[];
  originalMessagesAuthoritative: true;
  aiAvailable: boolean;
}

const PROFILE_FIELDS: Array<[keyof GlhLeadProfileRow, string]> = [
  ['product', 'Product'],
  ['product_media_references', 'Product image'],
  ['material', 'Material'],
  ['quantity', 'Quantity'],
  ['country_code', 'Country'],
  ['requirement_type', 'Requirement type'],
];

function hasValue(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== '';
}

function messageTime(message: GlhMessageRow): number {
  const value = message.provider_timestamp ?? message.created_at;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function nextHumanAction(
  leadId: string,
  tasks: GlhTaskRow[],
  followups: GlhFollowupRow[],
): string | null {
  const candidates = [
    ...tasks
      .filter(row => row.lead_id === leadId && ['OPEN', 'IN_PROGRESS'].includes(row.status))
      .map(row => ({ title: row.title, dueAt: row.due_at })),
    ...followups
      .filter(row => row.lead_id === leadId && ['OPEN', 'OVERDUE'].includes(row.status))
      .map(row => ({ title: row.next_action, dueAt: row.due_at })),
  ].sort((left, right) => {
    const leftTime = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightTime = right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime;
  });
  return candidates[0]?.title ?? null;
}

export function buildGlhInboxView(input: {
  organizationId: string;
  actorProfileId: string;
  leads: GlhLeadListItem[];
  profiles: GlhLeadProfileRow[];
  conversations: GlhConversationRow[];
  messages: GlhMessageRow[];
  tasks: GlhTaskRow[];
  followups: GlhFollowupRow[];
  aiAvailable?: boolean;
}): GlhInboxView {
  const leadById = new Map(input.leads
    .filter(lead => lead.organizationId === input.organizationId)
    .map(lead => [lead.id, lead]));
  const profileByLead = new Map(input.profiles
    .filter(row => row.org_id === input.organizationId && leadById.has(row.lead_id))
    .map(row => [row.lead_id, row]));
  const messagesByConversation = new Map<string, GlhMessageRow[]>();

  for (const message of input.messages) {
    if (message.org_id !== input.organizationId || !leadById.has(message.lead_id)) continue;
    const current = messagesByConversation.get(message.conversation_id) ?? [];
    current.push(message);
    messagesByConversation.set(message.conversation_id, current);
  }

  const conversations = input.conversations
    .filter(row => row.org_id === input.organizationId && leadById.has(row.lead_id))
    .map(row => {
      const lead = leadById.get(row.lead_id)!;
      const profile = profileByLead.get(row.lead_id) ?? null;
      const originalMessages = (messagesByConversation.get(row.id) ?? [])
        .slice()
        .sort((left, right) => messageTime(left) - messageTime(right));
      const last = originalMessages.at(-1) ?? null;
      return {
        id: row.id,
        leadId: row.lead_id,
        contactName: lead.contactName,
        companyName: lead.companyName,
        country: lead.country,
        ownerProfileId: lead.ownerProfileId,
        ownerName: lead.ownerName,
        isMine: lead.ownerProfileId === input.actorProfileId,
        leadVersion: lead.version,
        lifecycle: lead.lifecycle,
        conversationMode: row.conversation_mode,
        grade: lead.grade,
        score: lead.score,
        completeness: lead.completeness,
        source: lead.source,
        lastMessageAt: row.last_message_at ?? last?.provider_timestamp ?? last?.created_at ?? null,
        lastMessagePreview: last?.message_text?.trim() || (last ? 'Media or system message' : 'No messages'),
        originalMessages,
        aiSummary: profile?.ai_summary ?? null,
        missingFields: profile
          ? PROFILE_FIELDS.filter(([field]) => !hasValue(profile[field])).map(([, label]) => label)
          : PROFILE_FIELDS.map(([, label]) => label),
        nextAction: nextHumanAction(row.lead_id, input.tasks, input.followups),
      } satisfies GlhInboxConversation;
    })
    .sort((left, right) => {
      const leftTime = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0;
      const rightTime = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0;
      return rightTime - leftTime;
    });

  return {
    queues: [
      { id: 'ALL', label: 'All conversations', count: conversations.length },
      {
        id: 'WAITING_HUMAN',
        label: 'Waiting for human',
        count: conversations.filter(row => row.conversationMode === 'HANDOFF_PENDING').length,
      },
      {
        id: 'MINE',
        label: 'My conversations',
        count: conversations.filter(row => row.ownerProfileId === input.actorProfileId).length,
      },
      {
        id: 'UNASSIGNED',
        label: 'Unassigned',
        count: conversations.filter(row => row.ownerProfileId === null).length,
      },
    ],
    conversations,
    originalMessagesAuthoritative: true,
    aiAvailable: input.aiAvailable !== false,
  };
}
