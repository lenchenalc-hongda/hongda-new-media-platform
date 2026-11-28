import assert from 'node:assert/strict';
import {
  inspectWosOfficeCorrectionImages,
} from '../../src/lib/workshop-orders/production-office-correction';

const completeV2 = [
  { category: 'PRODUCT', image_status: 'READY', version_label: 'V2' },
  { category: 'FILM_PATTERN', image_status: 'READY', version_label: 'V2' },
  {
    category: 'CUSTOMER_APPROVED_SAMPLE',
    image_status: 'READY',
    version_label: 'V2',
  },
  { category: 'SIGNED_SAMPLE', image_status: 'READY', version_label: 'V2' },
] as const;

assert.deepEqual(
  inspectWosOfficeCorrectionImages(completeV2, 'V2'),
  {
    ready: true,
    currentImageCount: 4,
    distinctCategoryCount: 4,
    missingCategories: [],
  },
);

assert.equal(
  inspectWosOfficeCorrectionImages([
    ...completeV2.map(image => ({ ...image, version_label: 'V1' })),
  ], 'V2').ready,
  false,
  'old-version READY images must not authorize a new revision',
);

assert.deepEqual(
  inspectWosOfficeCorrectionImages([
    ...completeV2.slice(0, 3),
    { category: 'PRODUCT', image_status: 'READY', version_label: 'V2' },
  ], 'V2').missingCategories,
  ['SIGNED_SAMPLE'],
  'duplicate categories cannot substitute for a missing required category',
);

assert.equal(
  inspectWosOfficeCorrectionImages([
    ...completeV2.slice(0, 3),
    {
      category: 'SIGNED_SAMPLE',
      image_status: 'SUPERSEDED',
      version_label: 'V2',
    },
  ], 'V2').ready,
  false,
  'superseded current-version images cannot authorize resubmission',
);

assert.deepEqual(
  inspectWosOfficeCorrectionImages([], 'V2').missingCategories,
  [
    'PRODUCT',
    'FILM_PATTERN',
    'CUSTOMER_APPROVED_SAMPLE',
    'SIGNED_SAMPLE',
  ],
);

console.log('WOS_PRODUCTION_OFFICE_CORRECTION_UI_LOGIC=PASS');
