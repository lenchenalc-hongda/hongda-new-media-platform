import { z } from 'zod';
import { isValidDateOnly } from './actions';

export const actionExpectedVersionSchema = z.number().int().min(1);

export const actionTitleSchema = z.string().trim().min(1).max(200);

export const actionTypeSchema = z.enum([
  'IMMEDIATE',
  'CORRECTIVE',
  'PREVENTIVE',
]);

export const actionDueDateSchema = z.string().refine(isValidDateOnly, {
  message: 'dueDate must be a valid calendar date',
});

function nullableTrimmedText(maxLength: number) {
  return z.preprocess(
    (value) => (
      typeof value === 'string' && value.trim() === '' ? null : value
    ),
    z.string().trim().max(maxLength).nullable(),
  );
}

export const createActionCommandSchema = z.object({
  title: actionTitleSchema,
  description: nullableTrimmedText(5000).optional(),
  actionType: actionTypeSchema,
  ownerProfileId: z.string().uuid(),
  dueDate: actionDueDateSchema,
}).strict();

export const updateActionCommandSchema = z.object({
  expectedVersion: actionExpectedVersionSchema,
  title: actionTitleSchema,
  description: z.string().trim().min(1).max(5000).nullable(),
  actionType: actionTypeSchema,
  ownerProfileId: z.string().uuid(),
  dueDate: actionDueDateSchema,
}).strict();

export const startActionCommandSchema = z.object({
  expectedVersion: actionExpectedVersionSchema,
}).strict();

export const submitActionCommandSchema = z.object({
  expectedVersion: actionExpectedVersionSchema,
  completionNote: z.string().trim().min(1).max(5000),
}).strict();

export const verifyActionCommandSchema = z.object({
  expectedVersion: actionExpectedVersionSchema,
  verificationNote: nullableTrimmedText(5000).optional(),
}).strict();

export const returnActionCommandSchema = z.object({
  expectedVersion: actionExpectedVersionSchema,
  reason: z.string().trim().min(1).max(5000),
}).strict();

export const cancelActionCommandSchema = z.object({
  expectedVersion: actionExpectedVersionSchema,
  reason: z.string().trim().min(1).max(1000),
}).strict();

export const actionRouteParamsSchema = z.object({
  id: z.string().uuid(),
  actionId: z.string().uuid(),
}).strict();
