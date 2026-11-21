export const WOS_QA_IMAGE_CATEGORIES = [
  'PRODUCT',
  'FILM_PATTERN',
  'CUSTOMER_APPROVED_SAMPLE',
  'SIGNED_SAMPLE',
] as const;

export type WosQaImageCategory = (typeof WOS_QA_IMAGE_CATEGORIES)[number];

export const WOS_QA_IMAGE_CATEGORY_LABELS: Record<WosQaImageCategory, string> = {
  PRODUCT: '产品基准图',
  FILM_PATTERN: '花膜图案',
  CUSTOMER_APPROVED_SAMPLE: '客户批准样',
  SIGNED_SAMPLE: '实物签样',
};

const categorySlugs: Record<WosQaImageCategory, string> = {
  PRODUCT: 'product',
  FILM_PATTERN: 'film-pattern',
  CUSTOMER_APPROVED_SAMPLE: 'customer-approved-sample',
  SIGNED_SAMPLE: 'signed-sample',
};

export const WOS_QA_IMAGE_FILE_NAME = 'qa-preview-proof.png';

export function isWosQaImageCategory(value: unknown): value is WosQaImageCategory {
  return typeof value === 'string'
    && (WOS_QA_IMAGE_CATEGORIES as readonly string[]).includes(value);
}

export function wosQaImageCategorySlug(category: WosQaImageCategory): string {
  return categorySlugs[category];
}

export function buildWosQaImageObjectPath(input: {
  readonly organizationId: string;
  readonly orderId: string;
  readonly versionLabel: string;
  readonly imageId: string;
  readonly category: WosQaImageCategory;
}): string {
  return [
    'organizations',
    input.organizationId,
    'wos',
    'production-order',
    input.orderId,
    'images',
    wosQaImageCategorySlug(input.category),
    'versions',
    input.versionLabel,
    input.imageId,
    WOS_QA_IMAGE_FILE_NAME,
  ].join('/');
}
