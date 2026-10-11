'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  GlhInboxQueueId,
  GlhInboxView,
} from '@/lib/global-lead-hub/inbox-read-model';
import { buildGlhAiDraftCopilotState } from '@/lib/global-lead-hub/ai-draft-copilot';

function when(value: string | null): string {
  if (!value) return 'No timestamp';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No timestamp' : date.toLocaleString();
}

export default function UnifiedInbox({
  inbox,
  canTransfer,
  assignableProfiles,
}: {
  inbox: GlhInboxView;
  canTransfer: boolean;
  assignableProfiles: Array<{ id: string; name: string; role: string }>;
}) {
  const router = useRouter();
  const [queue, setQueue] = useState<GlhInboxQueueId>('ALL');
  const [selectedId, setSelectedId] = useState(inbox.conversations[0]?.id ?? '');
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');

  const visible = useMemo(() => inbox.conversations.filter(conversation => {
    if (queue === 'WAITING_HUMAN') return conversation.conversationMode === 'HANDOFF_PENDING';
    if (queue === 'MINE') return conversation.isMine;
    if (queue === 'UNASSIGNED') return conversation.ownerProfileId === null;
    return true;
  }), [inbox.conversations, queue]);
  const selected = inbox.conversations.find(row => row.id === selectedId)
    ?? visible[0]
    ?? inbox.conversations[0]
    ?? null;
  const copilot = selected
    ? buildGlhAiDraftCopilotState({
      conversationMode: selected.conversationMode,
      aiAvailable: inbox.aiAvailable,
      summary: selected.aiSummary,
      nextAction: selected.nextAction,
    })
    : null;

  async function postInboxAction(payload: Record<string, unknown>) {
    const response = await fetch('/api/global-lead-hub/inbox/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok !== true) {
      const message = response.status === 409
        ? 'The conversation changed. Refresh and retry.'
        : response.status === 403
          ? 'This action is outside your current access.'
          : response.status === 503
            ? 'The reviewed persistence migration is not installed in this environment.'
            : 'The action failed closed. No provider call was made.';
      throw new Error(message);
    }
    return body.data as Record<string, unknown>;
  }

  async function takeOver() {
    if (!selected || working) return;
    setWorking(true);
    setActionError('');
    setActionNotice('');
    try {
      await postInboxAction({
        action: 'TAKE_OVER',
        conversationId: selected.id,
        leadId: selected.leadId,
        expectedMode: selected.conversationMode,
        expectedLeadVersion: selected.leadVersion,
        reason: 'Human takeover from unified inbox',
      });
      setActionNotice('Human takeover recorded. Customer-facing AI auto-send is off.');
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Take Over failed closed.');
    } finally {
      setWorking(false);
    }
  }

  async function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || working) return;
    const form = new FormData(event.currentTarget);
    setWorking(true);
    setActionError('');
    setActionNotice('');
    try {
      await postInboxAction({
        action: 'TRANSFER',
        leadId: selected.leadId,
        assigneeProfileId: String(form.get('assigneeProfileId') || ''),
        expectedVersion: selected.leadVersion,
        reason: String(form.get('reason') || '').trim(),
      });
      setActionNotice('Transfer recorded with assignment and audit history.');
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Transfer failed closed.');
    } finally {
      setWorking(false);
    }
  }

  async function submitHumanMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || selected.conversationMode !== 'HUMAN_ACTIVE' || working) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setWorking(true);
    setActionError('');
    setActionNotice('');
    try {
      await postInboxAction({
        action: 'QUEUE_HUMAN_MESSAGE',
        conversationId: selected.id,
        leadId: selected.leadId,
        conversationMode: 'HUMAN_ACTIVE',
        text: String(form.get('message') || '').trim(),
        idempotencyKey: crypto.randomUUID(),
      });
      formElement.reset();
      setActionNotice('Human message intent queued. Provider delivery remains a separate server action.');
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Message queueing failed closed.');
    } finally {
      setWorking(false);
    }
  }

  if (!selected) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <h2 className="text-sm font-semibold text-gray-900">No accessible conversations</h2>
        <p className="mt-2 text-sm text-gray-500">New authorized conversations will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
        Human takeover and message intents use controlled server RPCs. Queueing never calls a provider;
        delivery remains a separate server-side action.
      </div>
      {actionError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>}
      {actionNotice && <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{actionNotice}</div>}

      <div className="grid min-h-[620px] overflow-hidden rounded-xl border border-gray-200 bg-white xl:grid-cols-[300px_minmax(420px,1fr)_340px]">
        <aside className="border-b border-gray-200 xl:border-b-0 xl:border-r">
          <div className="border-b border-gray-100 p-3">
            <h2 className="text-sm font-semibold text-gray-900">Queues</h2>
            <div className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-1">
              {inbox.queues.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setQueue(item.id)}
                  className={`flex justify-between rounded-md px-3 py-2 text-left text-xs ${queue === item.id ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-700'}`}
                >
                  <span>{item.label}</span><span>{item.count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[480px] overflow-y-auto">
            {visible.map(conversation => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setSelectedId(conversation.id)}
                className={`w-full border-b border-gray-100 p-3 text-left ${conversation.id === selected.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-gray-900">{conversation.contactName}</span>
                  <span className="text-[11px] text-gray-500">{conversation.grade ?? '—'}</span>
                </div>
                <p className="mt-1 truncate text-xs text-gray-600">{conversation.lastMessagePreview}</p>
                <p className="mt-1 text-[11px] text-gray-400">{conversation.conversationMode.replaceAll('_', ' ')}</p>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex min-h-[620px] flex-col border-b border-gray-200 xl:border-b-0 xl:border-r">
          <header className="border-b border-gray-100 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900">{selected.contactName}</h2>
                <p className="text-xs text-gray-500">{selected.source} · {selected.lifecycle.replaceAll('_', ' ')}</p>
              </div>
              <button
                type="button"
                onClick={takeOver}
                disabled={working || !['AI_ACTIVE', 'HANDOFF_PENDING'].includes(selected.conversationMode)}
                title="Atomically enter HUMAN_ACTIVE and stop customer-facing AI auto-send"
                className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
              >
                {selected.conversationMode === 'HUMAN_ACTIVE' ? 'Human Active' : 'Take Over'}
              </button>
            </div>
          </header>
          <section aria-label="Original conversation" className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4">
            {selected.originalMessages.length === 0 ? (
              <p className="text-center text-sm text-gray-500">No original messages are available.</p>
            ) : selected.originalMessages.map(message => (
              <article
                key={message.id}
                className={`max-w-[85%] rounded-lg border p-3 ${message.direction === 'OUTBOUND' ? 'ml-auto border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}
              >
                <p className="text-[11px] font-medium text-gray-500">{message.actor_type} · {when(message.provider_timestamp ?? message.created_at)}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{message.message_text || 'Media or system message'}</p>
                <p className="mt-1 text-[10px] text-gray-400">{message.delivery_status}</p>
              </article>
            ))}
          </section>
          <footer className="border-t border-gray-100 p-3">
            <form onSubmit={submitHumanMessage} className="space-y-2">
              <textarea
                name="message"
                required
                maxLength={4000}
                disabled={working || selected.conversationMode !== 'HUMAN_ACTIVE'}
                rows={2}
                placeholder={selected.conversationMode === 'HUMAN_ACTIVE' ? 'Queue a human reply intent' : 'Take Over before writing as human'}
                className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
              />
              <button
                disabled={working || selected.conversationMode !== 'HUMAN_ACTIVE'}
                className="rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
              >
                Queue human reply
              </button>
            </form>
            <p className="mt-1 text-[11px] text-gray-500">Automatic customer-facing AI sends are off in HUMAN_ACTIVE. This action persists QUEUED intent only; it does not call Meta/WhatsApp.</p>
          </footer>
        </main>

        <aside className="space-y-4 overflow-y-auto p-4">
          <section>
            <h2 className="text-sm font-semibold text-gray-900">Customer card</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <Metric label="Company" value={selected.companyName} />
              <Metric label="Country" value={selected.country} />
              <Metric label="Owner" value={selected.ownerName} />
              <Metric label="Grade" value={selected.grade} />
              <Metric label="Score" value={`${selected.score}/100`} />
              <Metric label="Complete" value={`${selected.completeness}%`} />
            </dl>
          </section>
          <section className="rounded-lg border border-violet-100 bg-violet-50 p-3">
            <h3 className="text-xs font-semibold text-violet-900">AI copilot</h3>
            {!copilot?.available ? (
              <p className="mt-2 text-xs text-violet-700">AI unavailable. Original messages and human actions remain usable.</p>
            ) : (
              <>
                <p className="mt-2 text-xs text-violet-800">{copilot.summary || 'No AI summary yet.'}</p>
                <p className="mt-2 text-xs font-medium text-violet-900">Next: {copilot.nextAction || 'Review the original thread.'}</p>
              </>
            )}
            <p className="mt-2 text-[11px] text-violet-600">Copilot only · auto-send disabled</p>
          </section>
          <section>
            <h3 className="text-xs font-semibold text-gray-900">Missing qualification</h3>
            <p className="mt-2 text-xs text-gray-600">{selected.missingFields.length ? selected.missingFields.join(', ') : 'Core fields complete'}</p>
          </section>
          {canTransfer && (
            <form onSubmit={submitTransfer} className="space-y-2 border-t border-gray-100 pt-4">
              <h3 className="text-xs font-semibold text-gray-900">Transfer / Assign</h3>
              <select name="assigneeProfileId" required className="w-full rounded-md border border-gray-200 px-2 py-2 text-xs">
                <option value="">Select teammate</option>
                {assignableProfiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.role}</option>)}
              </select>
              <input name="reason" required maxLength={500} placeholder="Reason (required)" className="w-full rounded-md border border-gray-200 px-2 py-2 text-xs" />
              <button disabled={working} className="w-full rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{working ? 'Saving…' : 'Transfer with audit history'}</button>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return <div><dt className="text-gray-400">{label}</dt><dd className="mt-1 font-medium text-gray-800">{value === null || value === undefined || value === '' ? '—' : String(value)}</dd></div>;
}
