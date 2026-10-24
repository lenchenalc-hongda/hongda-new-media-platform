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
  'bocom_usd_cn',
  'bocom_hkd_cn',
  // Enable existing image path once independently approved QR records are provisioned.
  'wechat_qr',
  'alipay_qr',
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
