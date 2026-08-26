// ===== Review Center Action Command Schema Tests =====
import {
  cancelActionCommandSchema,
  createActionCommandSchema,
  returnActionCommandSchema,
  startActionCommandSchema,
  submitActionCommandSchema,
  updateActionCommandSchema,
  verifyActionCommandSchema,
} from '../../src/lib/review-center/action-command-schemas';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + msg);
  }
}

const OWNER_ID = '00000000-0000-0000-0000-000000000001';

function validCreate() {
  return {
    title: 'QA ACTION',
    description: 'description',
    actionType: 'CORRECTIVE',
    ownerProfileId: OWNER_ID,
    dueDate: '2026-08-26',
  };
}

function validUpdate() {
  return {
    expectedVersion: 1,
    title: 'QA ACTION',
    description: 'description',
    actionType: 'CORRECTIVE',
    ownerProfileId: OWNER_ID,
    dueDate: '2026-08-26',
  };
}

console.log('\n=== Review Center Action Command Schemas ===');

assert(createActionCommandSchema.safeParse(validCreate()).success, 'create valid');
assert(createActionCommandSchema.safeParse({ ...validCreate(), description: undefined }).success, 'create missing description valid');
assert(createActionCommandSchema.safeParse({ ...validCreate(), description: null }).success, 'create null description valid');
assert(createActionCommandSchema.safeParse({ ...validCreate(), description: '   ' }).success, 'create blank description normalized');
assert(!createActionCommandSchema.safeParse({ ...validCreate(), description: 'x'.repeat(5001) }).success, 'create description over max rejected');
assert(!createActionCommandSchema.safeParse({ ...validCreate(), ownerProfileId: 'bad' }).success, 'create bad owner uuid');
assert(!createActionCommandSchema.safeParse({ ...validCreate(), dueDate: '2026-02-31' }).success, 'create invalid calendar date');
assert(!createActionCommandSchema.safeParse({ ...validCreate(), status: 'VERIFIED' }).success, 'create unknown status rejected');
assert(!createActionCommandSchema.safeParse({ ...validCreate(), sequence: 1 }).success, 'create sequence rejected');

assert(updateActionCommandSchema.safeParse(validUpdate()).success, 'update valid');
assert(updateActionCommandSchema.safeParse({ ...validUpdate(), description: null }).success, 'update null description valid');
assert(!updateActionCommandSchema.safeParse({ ...validUpdate(), description: '   ' }).success, 'update blank description rejected');
assert(!updateActionCommandSchema.safeParse({ ...validUpdate(), expectedVersion: 0 }).success, 'update expectedVersion 0 rejected');
assert(!updateActionCommandSchema.safeParse({ ...validUpdate(), expectedVersion: 1.5 }).success, 'update expectedVersion float rejected');
assert(!updateActionCommandSchema.safeParse({ ...validUpdate(), expectedVersion: '1' }).success, 'update expectedVersion string rejected');

assert(startActionCommandSchema.safeParse({ expectedVersion: 1 }).success, 'start valid');
assert(!startActionCommandSchema.safeParse({}).success, 'start missing expectedVersion');
assert(!startActionCommandSchema.safeParse({ expectedVersion: 1, status: 'OPEN' }).success, 'start unknown field rejected');

assert(submitActionCommandSchema.safeParse({ expectedVersion: 1, completionNote: 'done' }).success, 'submit valid');
assert(!submitActionCommandSchema.safeParse({ expectedVersion: 1, completionNote: '   ' }).success, 'submit blank note rejected');
assert(!submitActionCommandSchema.safeParse({ expectedVersion: 1, completionNote: 'x'.repeat(5001) }).success, 'submit note over max rejected');

assert(verifyActionCommandSchema.safeParse({ expectedVersion: 1 }).success, 'verify missing note valid');
assert(verifyActionCommandSchema.safeParse({ expectedVersion: 1, verificationNote: null }).success, 'verify null note valid');
assert(verifyActionCommandSchema.safeParse({ expectedVersion: 1, verificationNote: '   ' }).success, 'verify whitespace note normalized');
assert(!verifyActionCommandSchema.safeParse({ expectedVersion: 1, verificationNote: 'x'.repeat(5001) }).success, 'verify note over max rejected');

assert(returnActionCommandSchema.safeParse({ expectedVersion: 1, reason: 'why' }).success, 'return valid');
assert(!returnActionCommandSchema.safeParse({ expectedVersion: 1, reason: '   ' }).success, 'return blank reason rejected');
assert(!returnActionCommandSchema.safeParse({ expectedVersion: 1, reason: 'x'.repeat(5001) }).success, 'return reason over max rejected');

assert(cancelActionCommandSchema.safeParse({ expectedVersion: 1, reason: 'why' }).success, 'cancel valid');
assert(!cancelActionCommandSchema.safeParse({ expectedVersion: 1, reason: '   ' }).success, 'cancel blank reason rejected');
assert(!cancelActionCommandSchema.safeParse({ expectedVersion: 1, reason: 'x'.repeat(1001) }).success, 'cancel reason over max rejected');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
