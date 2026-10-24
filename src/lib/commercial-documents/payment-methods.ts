/** Approved payment methods. Values originate ONLY from an authenticated database lookup.
 * Never add account numbers, recipient identifiers, PNG/base64 or sample real data here.
 */
export interface CommercialPaymentMethod {
  id: string;
  methodKey: string;
  kind: 'bank' | 'qr';
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
}

/** Stable order for the sales drop-down. No account details are ever stored here. */
export const PAYMENT_METHOD_SORT_ORDER = [
  'abc_corporate',
  'ccb_personal',
  'abc_personal',
  'hsbc_hk',
  'jpmorgan_hk',
  'bocom_foreign',
  // Enable existing image path once independently approved QR records are provisioned.
  'wechat_qr',
  'alipay_qr',
] as const;

export function methodLabel(method: CommercialPaymentMethod, language: 'zh' | 'en') {
  return language === 'en' ? method.labelEn : method.labelZh;
}
