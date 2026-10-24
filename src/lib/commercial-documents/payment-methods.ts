/** Approved payment methods. Values originate ONLY from an authenticated database lookup.
 * Never add account numbers, recipient identifiers, PNG/base64 or sample real data here.
 */
export type CommercialPaymentMethodKind = 'bank' | 'qr' | 'qr_pair';

export interface CommercialQrCode {
  id: string;
  methodKey: 'wechat_qr' | 'alipay_qr';
  qrSha256: string;
  qrUrl: string;
}

export interface CommercialPaymentMethod {
  id: string;
  methodKey: string;
  kind: CommercialPaymentMethodKind;
  labelZh: string;
  labelEn: string;
  beneficiary: string;
  bankName: string;
  accountNo: string;
  notes: string;
  sourceCell: string;
  sourceNumeric: boolean;
  approved: boolean;
  qrSha256: string | null;
  qrUrl: string | null;
  qrCodes?: CommercialQrCode[];
}

/** Stable selection ID persisted in local JSON drafts. */
export const WECHAT_ALIPAY_METHOD_ID = 'wechat_alipay';
export const WECHAT_ALIPAY_METHOD_KEY = WECHAT_ALIPAY_METHOD_ID;
export const WECHAT_ALIPAY_LABEL = 'WeChat / Alipay';
export const WECHAT_QR_METHOD_KEY = 'wechat_qr';
export const ALIPAY_QR_METHOD_KEY = 'alipay_qr';
const QR_PAIR_METHOD_KEYS = [WECHAT_QR_METHOD_KEY, ALIPAY_QR_METHOD_KEY] as const;

/** Stable order for the sales drop-down. No account details are ever stored here. */
export const PAYMENT_METHOD_SORT_ORDER = [
  'abc_corporate',
  'ccb_personal',
  'abc_personal',
  'hsbc_hk',
  'jpmorgan_hk',
  'bocom_usd_cn',
  'bocom_hkd_cn',
  WECHAT_ALIPAY_METHOD_KEY,
] as const;

// Exact user-approved display names for Hongda's three international bank options.
// These are labels only; beneficiary/bank/account/SWIFT remain in the private catalog.
export const HONGDA_FOREIGN_ACCOUNT_LABELS: Readonly<Record<string, string>> = {
  jpmorgan_hk: 'Hongda USD Account HK',
  bocom_usd_cn: 'Hongda USD Account CN (Default)',
  bocom_hkd_cn: 'Hongda HKD Account CN',
};

export function methodLabel(method: CommercialPaymentMethod, language: 'zh' | 'en') {
  // Always English for these three options, including in Chinese quotations.
  return HONGDA_FOREIGN_ACCOUNT_LABELS[method.methodKey]
    ?? (language === 'en' ? method.labelEn : method.labelZh);
}

export function qrCodeLabel(code: CommercialQrCode, language: 'zh' | 'en'): string {
  return code.methodKey === WECHAT_QR_METHOD_KEY
    ? language === 'en' ? 'WeChat Pay' : '微信收款'
    : language === 'en' ? 'Alipay' : '支付宝收款';
}

/**
 * Group the two private QR rows into one selection. Any missing, invalid,
 * duplicated, or status-mismatched member makes the whole option unavailable.
 */
export function buildPaymentMethodChoices(methods: CommercialPaymentMethod[]): CommercialPaymentMethod[] {
  const banks = methods.filter(method => method.kind === 'bank');
  const pairMembers = methods.filter(method => method.kind === 'qr'
    && QR_PAIR_METHOD_KEYS.includes(method.methodKey as typeof QR_PAIR_METHOD_KEYS[number]));
  if (pairMembers.length !== QR_PAIR_METHOD_KEYS.length) return banks;

  const wechat = pairMembers.find(method => method.methodKey === WECHAT_QR_METHOD_KEY);
  const alipay = pairMembers.find(method => method.methodKey === ALIPAY_QR_METHOD_KEY);
  if (!wechat || !alipay || wechat.approved !== alipay.approved) return banks;
  if (!wechat.qrUrl || !alipay.qrUrl || !wechat.qrSha256 || !alipay.qrSha256) return banks;

  return [
    ...banks,
    {
      id: WECHAT_ALIPAY_METHOD_ID,
      methodKey: WECHAT_ALIPAY_METHOD_KEY,
      kind: 'qr_pair',
      labelZh: WECHAT_ALIPAY_LABEL,
      labelEn: WECHAT_ALIPAY_LABEL,
      beneficiary: '',
      bankName: '',
      accountNo: '',
      notes: '',
      sourceCell: 'private_database',
      sourceNumeric: false,
      approved: wechat.approved,
      qrSha256: null,
      qrUrl: null,
      qrCodes: [
        {
          id: wechat.id,
          methodKey: WECHAT_QR_METHOD_KEY,
          qrSha256: wechat.qrSha256,
          qrUrl: wechat.qrUrl,
        },
        {
          id: alipay.id,
          methodKey: ALIPAY_QR_METHOD_KEY,
          qrSha256: alipay.qrSha256,
          qrUrl: alipay.qrUrl,
        },
      ],
    },
  ];
}

export function isPaymentMethodSelectionId(value: string): boolean {
  return value === ''
    || value === WECHAT_ALIPAY_METHOD_ID
    || /^[0-9a-f-]{36}$/i.test(value);
}
