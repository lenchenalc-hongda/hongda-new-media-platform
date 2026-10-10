'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  summarizeGlhAuditTimeline,
  type GlhLeadDetailView,
} from '@/lib/global-lead-hub/read-model';

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not supplied';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function dateTime(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function LeadDetail({
  detail,
  canAssign,
  assignableProfiles,
}: {
  detail: GlhLeadDetailView;
  canAssign: boolean;
  assignableProfiles: Array<{ id: string; name: string; role: string }>;
}) {
  const router = useRouter();
  const [actionError, setActionError] = useState('');
  const [working, setWorking] = useState('');
  const lead = detail.listItem;
  const audit = summarizeGlhAuditTimeline(detail);

  async function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working) return;
    const form = new FormData(event.currentTarget);
    setWorking('assign');
    setActionError('');
    try {
      const response = await fetch(
        `/api/global-lead-hub/leads/${encodeURIComponent(lead.id)}/assign`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            assigneeProfileId: String(form.get('assigneeProfileId') || ''),
            expectedVersion: lead.version ?? 1,
            reason: String(form.get('reason') || '').trim() || null,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok === true) {
        router.refresh();
        return;
      }
      setActionError(
        response.status === 409
          ? 'This lead changed before the assignment completed. Refresh and retry.'
          : response.status === 403
            ? 'Only a Manager or Admin in this organization can assign this lead.'
            : 'The assignment could not be completed.',
      );
    } catch {
      setActionError('The assignment could not be completed.');
    } finally {
      setWorking('');
    }
  }

  async function submitWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working) return;
    const form = new FormData(event.currentTarget);
    const kind = String(form.get('kind') || 'TASK');
    setWorking('work');
    setActionError('');
    try {
      const response = await fetch('/api/global-lead-hub/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          kind,
          type: String(form.get('type') || ''),
          title: String(form.get('title') || '').trim(),
          dueAt: String(form.get('dueAt') || '').trim() || null,
          assigneeProfileId: String(form.get('assigneeProfileId') || '').trim() || null,
        }),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok === true) {
        event.currentTarget.reset();
        router.refresh();
        return;
      }
      setActionError(
        response.status === 403
          ? 'You can create work only for leads you can access.'
          : response.status === 400
            ? 'Check the work type and due date.'
            : 'The task or follow-up could not be created.',
      );
    } catch {
      setActionError('The task or follow-up could not be created.');
    } finally {
      setWorking('');
    }
  }

  return (
    <div className="space-y-5">
      {actionError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Overview</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-sm xl:grid-cols-3">
            <Info label="Company" value={lead.companyName} />
            <Info label="Country" value={lead.country} />
            <Info label="Source" value={lead.source} />
            <Info label="Lifecycle" value={lead.lifecycle} />
            <Info label="Conversation mode" value={lead.conversationMode} />
            <Info label="Owner" value={lead.ownerName || lead.ownerProfileId} />
            <Info label="Grade" value={lead.grade} />
            <Info label="Score" value={`${lead.score}/100`} />
            <Info label="Completeness" value={`${lead.completeness}%`} />
            <Info label="Next follow-up" value={dateTime(lead.nextFollowupAt)} />
            <Info label="Ad creative" value={lead.adCreativeReference} />
            <Info label="Last message" value={dateTime(detail.messages[0]?.provider_timestamp ?? detail.messages[0]?.created_at)} />
          </dl>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Contact</h2>
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Info label="Name" value={detail.contact.display_name} />
            <Info label="Country code" value={detail.contact.country_code} />
            <Info label="WhatsApp" value={detail.contact.normalized_whatsapp} />
            <Info label="Email" value={detail.contact.normalized_email} />
            <Info label="Website" value={detail.profile?.website} />
            <Info label="Social" value={detail.profile?.social_identifier} />
          </dl>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Structured requirement profile</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-sm lg:grid-cols-4">
          <Info label="Requirement" value={detail.profile?.requirement_type} />
          <Info label="Product" value={detail.profile?.product} />
          <Info label="Material" value={detail.profile?.material} />
          <Info label="Quantity" value={detail.profile?.quantity} />
          <Info label="Dimensions" value={detail.profile?.dimensions} />
          <Info label="Artwork" value={detail.profile?.artwork_reference} />
          <Info label="Printing area" value={detail.profile?.printing_area} />
          <Info label="Current process" value={detail.profile?.current_printing_process} />
          <Info label="Pain points" value={detail.profile?.pain_points} />
          <Info label="Test requirements" value={detail.profile?.test_requirements} />
          <Info label="Sample availability" value={detail.profile?.sample_availability} />
          <Info label="Purchase timeline" value={detail.profile?.purchase_timeline} />
          <Info label="Machine capacity" value={detail.profile?.machine_capacity_requirements} />
          <Info label="Automation" value={detail.profile?.automation_requirements} />
          <Info label="Machine + process" value={detail.profile?.machine_plus_process_solution_required} />
          <Info label="AI summary" value={detail.profile?.ai_summary} />
        </dl>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Conversation</h2>
          {detail.conversations.length === 0 ? (
            <Empty text="No provider conversation is linked yet." />
          ) : (
            <div className="mt-3 space-y-3">
              {detail.conversations.map(conversation => (
                <div key={conversation.id} className="rounded border border-gray-100 bg-gray-50 p-3 text-sm">
                  <p className="font-medium text-gray-800">
                    {conversation.external_conversation_id} · {conversation.conversation_mode}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {conversation.conversation_status} · {dateTime(conversation.last_message_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 space-y-2">
            {detail.messages.slice(0, 8).map(message => (
              <div key={message.id} className="rounded border border-gray-100 p-3 text-sm">
                <p className="text-xs font-medium text-gray-500">
                  {message.actor_type} · {message.direction} · {dateTime(message.provider_timestamp ?? message.created_at)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-gray-800">
                  {message.message_text || 'Media or system message'}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Tasks and follow-ups</h2>
          <div className="mt-3 space-y-2">
            {[...detail.tasks, ...detail.followups].length === 0 && (
              <Empty text="No human work is recorded for this lead." />
            )}
            {detail.tasks.map(task => (
              <WorkRow
                key={task.id}
                kind="TASK"
                title={task.title}
                type={task.task_type}
                dueAt={task.due_at}
                status={task.status}
              />
            ))}
            {detail.followups.map(followup => (
              <WorkRow
                key={followup.id}
                kind="FOLLOW-UP"
                title={followup.next_action}
                type={followup.followup_type}
                dueAt={followup.due_at}
                status={followup.status}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Assignment history</h2>
          {detail.assignments.length === 0 ? (
            <Empty text="No assignment history is visible." />
          ) : (
            <div className="mt-3 divide-y divide-gray-100">
              {detail.assignments.map(assignment => (
                <div key={assignment.id} className="py-3 text-sm">
                  <p className="font-medium text-gray-800">
                    {assignment.assigneeName || assignment.assignee_profile_id}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {assignment.status} · {assignment.assignment_type} · assigned by{' '}
                    {assignment.assignedByName || assignment.assigned_by_profile_id} ·{' '}
                    {dateTime(assignment.started_at)}
                  </p>
                  {assignment.reason && <p className="mt-1 text-xs text-gray-600">{assignment.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Score history</h2>
          {detail.scores.length === 0 ? (
            <Empty text="No score snapshots are available." />
          ) : (
            <div className="mt-3 divide-y divide-gray-100">
              {detail.scores.map(score => (
                <div key={score.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{score.grade} · {score.score}/100</p>
                    <p className="text-xs text-gray-500">
                      {score.score_source} · {dateTime(score.created_at)}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">{score.prompt_version || 'No prompt version'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Assignment action</h2>
          {!canAssign ? (
            <p className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">
              Assignment is restricted to Manager and Admin roles.
            </p>
          ) : assignableProfiles.length === 0 ? (
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              No eligible active profiles are available for assignment.
            </p>
          ) : (
            <form onSubmit={submitAssignment} className="mt-3 space-y-3">
              <div>
                <label htmlFor="assigneeProfileId" className="text-xs font-medium text-gray-600">
                  Assignee
                </label>
                <select
                  id="assigneeProfileId"
                  name="assigneeProfileId"
                  required
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  {assignableProfiles.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} ({profile.role})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="reason" className="text-xs font-medium text-gray-600">Reason</label>
                <input
                  id="reason"
                  name="reason"
                  maxLength={500}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={working === 'assign'}
                className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {working === 'assign' ? 'Assigning...' : 'Assign lead'}
              </button>
            </form>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Create task or follow-up</h2>
          <form onSubmit={submitWork} className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="kind" className="text-xs font-medium text-gray-600">Kind</label>
              <select
                id="kind"
                name="kind"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="TASK">Task</option>
                <option value="FOLLOWUP">Follow-up</option>
              </select>
            </div>
            <div>
              <label htmlFor="workType" className="text-xs font-medium text-gray-600">Type</label>
              <select
                id="workType"
                name="type"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {['QUALIFICATION', 'FOLLOW_UP', 'QUOTATION', 'SAMPLE', 'NEGOTIATION', 'HANDOFF', 'DORMANT_REVIVAL', 'OTHER']
                  .map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="workTitle" className="text-xs font-medium text-gray-600">Title</label>
              <input
                id="workTitle"
                name="title"
                required
                maxLength={300}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="dueAt" className="text-xs font-medium text-gray-600">Due at</label>
              <input
                id="dueAt"
                name="dueAt"
                type="datetime-local"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            {canAssign && (
              <div>
                <label htmlFor="workAssignee" className="text-xs font-medium text-gray-600">Assignee</label>
                <select
                  id="workAssignee"
                  name="assigneeProfileId"
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Me</option>
                  {assignableProfiles.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} ({profile.role})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={working === 'work'}
                className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {working === 'work' ? 'Creating...' : 'Create work'}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Audit timeline</h2>
        {audit.length === 0 ? (
          <Empty text="No audit events are visible for this role or lead." />
        ) : (
          <div className="mt-3 divide-y divide-gray-100">
            {audit.map(event => (
              <div key={`${event.kind}-${event.id}`} className="py-3 text-sm">
                <p className="font-medium text-gray-800">{event.eventType.replaceAll('_', ' ')}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {event.summary} · {event.actorProfileId || 'system'} · {dateTime(event.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 break-words text-gray-800">{display(value)}</dd>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="mt-3 rounded border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-500">
      {text}
    </p>
  );
}

function WorkRow({
  kind,
  title,
  type,
  dueAt,
  status,
}: {
  kind: string;
  title: string;
  type: string;
  dueAt: string | null;
  status: string;
}) {
  return (
    <div className="rounded border border-gray-100 bg-gray-50 p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-gray-800">{title}</p>
        <span className="shrink-0 rounded bg-white px-2 py-1 text-[11px] text-gray-600 ring-1 ring-gray-200">
          {kind}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {type.replaceAll('_', ' ')} · {status.replaceAll('_', ' ')} · {dateTime(dueAt)}
      </p>
    </div>
  );
}
