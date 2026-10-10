import "server-only";

/**
 * Phase 3 entry point for the repository-only WhatsApp inbound task.
 *
 * The bounded implementation must remain test-account-only, verify webhook
 * challenges and signatures, persist original inbound facts idempotently, and
 * never send provider messages or perform a Production cutover.
 */
export const GLH_WHATSAPP_INBOUND_TASK_ID =
  "GLH-P3-WHATSAPP-INBOUND-001" as const;

export const GLH_WHATSAPP_INBOUND_PRODUCTION_ENABLED = false as const;
