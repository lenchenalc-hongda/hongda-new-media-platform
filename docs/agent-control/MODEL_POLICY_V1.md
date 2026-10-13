# MODEL_POLICY_V1

Hongda Agent Control uses a fail-closed model escalation policy for project-lane coding tasks.

## Scope

This policy applies to both:
- Customer Project Center (CPC), control Issue #10.
- Global Lead Hub (GLH), control Issue #72.

## Execution tiers

### L1 — default execution
- Trigger: new executable task, `READY_FOR_CODEX`, `fix_round = 0`.
- Model: `AGENT_CONTROL_DEFAULT_MODEL`, default `deepseek-v4-flash`.
- Reasoning effort: `high`.
- Purpose: ordinary bounded implementation, UI, tests, docs, straightforward bug fixes and normal refactors.

### L2 — first repair
- Trigger: `FIX_REQUIRED` with `fix_round = 1`.
- Model: default model.
- Reasoning effort: `xhigh`.
- Purpose: deeper root-cause analysis and one bounded repair attempt.

### L3 — second repair / strong-model escalation
- Trigger: `FIX_REQUIRED` with `fix_round = 2`.
- Model: `AGENT_CONTROL_STRONG_MODEL`, default `deepseek-v4-pro`.
- Reasoning effort: `xhigh`.
- Purpose: difficult cross-file or architectural repair after the normal model has already failed.

### STOP — PM diagnosis required
- Trigger: `fix_round >= max_fix_rounds`.
- No Codex execution is allowed.
- Validator returns `NOT_EXECUTABLE`.
- `PM_DIAGNOSIS_REQUIRED = YES`.
- A new task or explicit PM decision is required before further execution.

Every new task resets to L1. Escalation is per task, not sticky across tasks.

## Human Gate

Model escalation never overrides authority boundaries. The project lane must not autonomously execute:
- Production SQL, RLS, schema, data, environment or secret changes;
- destructive Production actions;
- authentication/authorization boundary weakening;
- finance or customer-ownership source-of-truth changes;
- real Meta/WhatsApp or other external Production cutover;
- external publishing that requires explicit approval.

Repository-only preparation, tests, runbooks and migration files may be drafted inside the exact allowed paths, but actual Production execution remains a Human Gate.

## Configuration

Repository variables may override model names without editing workflow code:
- `AGENT_CONTROL_DEFAULT_MODEL`
- `AGENT_CONTROL_STRONG_MODEL`

If unset, the wrapper defaults to:
- default: `deepseek-v4-flash`
- strong: `deepseek-v4-pro`

The wrapper prints only model tier/name/reasoning metadata. It never prints the DeepSeek API key.

## State mapping

```text
READY_FOR_CODEX / fix_round 0
  -> L1 / default model / high

FIX_REQUIRED / fix_round 1
  -> L2 / default model / xhigh

FIX_REQUIRED / fix_round 2
  -> L3 / strong model / xhigh

FIX_REQUIRED / fix_round >= max_fix_rounds
  -> STOP / PM diagnosis
```

`AUTO_MERGE=false` and `AUTO_PRODUCTION=false` remain unchanged.
