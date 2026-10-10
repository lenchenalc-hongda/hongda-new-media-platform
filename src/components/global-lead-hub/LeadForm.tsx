'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GLH_CONVERSATION_MODES,
  GLH_LIFECYCLE_STATES,
  GLH_PRIORITY_GRADES,
} from '@/lib/global-lead-hub/domain';
import {
  GLH_REQUIREMENT_TYPES,
  GLH_SOURCE_PLATFORMS,
} from '@/lib/global-lead-hub/read-model';

function optionalValue(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export default function LeadForm({
  assignableProfiles,
}: {
  assignableProfiles: Array<{ id: string; name: string; role: string }>;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const form = new FormData(event.currentTarget);
    const score = Number(form.get('score') || 0);
    const completeness = Number(form.get('completeness') || 0);
    const grade = optionalValue(form, 'priorityGrade');
    const payload = {
      displayName: String(form.get('displayName') || '').trim(),
      companyName: optionalValue(form, 'companyName'),
      countryCode: optionalValue(form, 'countryCode'),
      whatsapp: optionalValue(form, 'whatsapp'),
      email: optionalValue(form, 'email'),
      sourcePlatform: String(form.get('sourcePlatform') || 'UNKNOWN'),
      requirementType: optionalValue(form, 'requirementType'),
      lifecycleState: String(form.get('lifecycleState') || 'NEW'),
      conversationMode: String(form.get('conversationMode') || 'AI_ACTIVE'),
      priorityGrade: grade,
      score,
      completeness,
      product: optionalValue(form, 'product'),
      material: optionalValue(form, 'material'),
      quantity: optionalValue(form, 'quantity'),
      notes: optionalValue(form, 'notes'),
      ownerProfileId: optionalValue(form, 'ownerProfileId'),
    };

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/global-lead-hub/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok === true && typeof body?.data?.leadId === 'string') {
        router.push(`/global-lead-hub/leads/${encodeURIComponent(body.data.leadId)}`);
        return;
      }
      if (response.status === 401) {
        setError('Your sign-in has expired. Sign in again.');
      } else if (response.status === 403) {
        setError('Manual test/dev lead creation is not enabled for this account or environment.');
      } else if (response.status === 400) {
        setError('Check the submitted values, including the score and grade band.');
      } else {
        setError('The lead could not be created. Try again after checking the environment guard.');
      }
    } catch {
      setError('The lead could not be created. Check the server connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Customer and source</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Field label="Display name" name="displayName" required />
          <Field label="Company" name="companyName" />
          <Field label="Country code" name="countryCode" placeholder="e.g. NG" />
          <Field label="WhatsApp" name="whatsapp" />
          <Field label="Email" name="email" type="email" />
          <Select
            label="Source"
            name="sourcePlatform"
            options={GLH_SOURCE_PLATFORMS.map(value => ({ value, label: value }))}
          />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Qualification</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <Select
            label="Requirement"
            name="requirementType"
            allowEmpty
            options={GLH_REQUIREMENT_TYPES.map(value => ({
              value,
              label: value.replaceAll('_', ' '),
            }))}
          />
          <Select
            label="Lifecycle"
            name="lifecycleState"
            options={GLH_LIFECYCLE_STATES.map(value => ({
              value,
              label: value.replaceAll('_', ' '),
            }))}
          />
          <Select
            label="Conversation mode"
            name="conversationMode"
            options={GLH_CONVERSATION_MODES.map(value => ({
              value,
              label: value.replaceAll('_', ' '),
            }))}
          />
          <Select
            label="Priority grade"
            name="priorityGrade"
            allowEmpty
            options={GLH_PRIORITY_GRADES.map(value => ({ value, label: value }))}
          />
          <Field label="Score" name="score" type="number" min={0} max={100} defaultValue="0" />
          <Field
            label="Completeness"
            name="completeness"
            type="number"
            min={0}
            max={100}
            defaultValue="0"
          />
          <Field label="Product" name="product" />
          <Field label="Material" name="material" />
          <Field label="Quantity" name="quantity" />
          {assignableProfiles.length > 0 && (
            <Select
              label="Owner"
              name="ownerProfileId"
              allowEmpty
              options={assignableProfiles.map(profile => ({
                value: profile.id,
                label: `${profile.name} (${profile.role})`,
              }))}
            />
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <label htmlFor="notes" className="text-xs font-medium text-gray-600">Structured notes</label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </section>

      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create test lead'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = 'text',
  required = false,
  placeholder,
  min,
  max,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  defaultValue?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-xs font-medium text-gray-600">
        {label}{required ? ' *' : ''}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        min={min}
        max={max}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

function Select({
  label,
  name,
  options,
  allowEmpty = false,
}: {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  allowEmpty?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-xs font-medium text-gray-600">{label}</label>
      <select
        id={name}
        name={name}
        defaultValue={allowEmpty ? '' : options[0]?.value}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      >
        {allowEmpty && <option value="">Not set</option>}
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}
