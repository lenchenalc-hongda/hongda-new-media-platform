import './workshop-order-foundation.test';
import './workshop-order-production-form.test';
import './workshop-order-sampling-form.test';
import './workshop-order-readiness.test';
import './workshop-order-scheduling.test';
import './workshop-order-sampling-execution.test';
import './workshop-order-nonproduction-persistence.test';
import './workshop-order-api.test';
import './workshop-order-p6-atomic-submission.test';
import './workshop-order-p6-private-image-contract.test';
import './workshop-order-p7-nonprod-contract.test';

// WOS project-owned test aggregator. Each new WOS test is imported here,
// so the existing shared CI invokes it without modifying shared workflows.
console.log('workshop-order-suite.test.ts: PASS');
