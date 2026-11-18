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
import './workshop-order-p1-qa-workflow-security.test';

import './workshop-order-prod-cpc-eligibility.test';

import './workshop-order-prod-p1-candidate-contract.test';

import './workshop-order-prod-private-image-edge.test';

import './workshop-order-prod-office-form-candidate.test';

// WOS project-owned test aggregator. Each new WOS test is imported here,
// so the existing shared CI invokes it without modifying shared workflows.
console.log('workshop-order-suite.test.ts: PASS');
