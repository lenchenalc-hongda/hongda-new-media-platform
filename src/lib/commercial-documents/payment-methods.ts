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

export const PAYMENT_METHOD_SOURCE_ROWS = [
  { row: 3, key: 'abc_corporate', labelZh: '农业银行（对公）', labelEn: 'Agricultural Bank of China (Corporate)', kind: 'bank' },
  { row: 4, key: 'ccb_personal', labelZh: '建设银行（个人）', labelEn: 'China Construction Bank (Personal)', kind: 'bank' },
  { row: 5, key: 'wechat_qr', labelZh: '微信收款码', labelEn: 'WeChat Pay QR', kind: 'qr' },
  { row: 9, key: 'alipay_qr', labelZh: '支付宝收款码', labelEn: 'Alipay QR', kind: 'qr' },
  { row: 14, key: 'abc_personal', labelZh: '农业银行（个人）', labelEn: 'Agricultural Bank of China (Personal)', kind: 'bank' },
  { row: 15, key: 'hsbc_hk', labelZh: '汇丰香港账户', labelEn: 'HSBC Hong Kong Account', kind: 'bank' },
  { row: 16, key: 'jpmorgan_hk', labelZh: '摩根大通香港账户', labelEn: 'JPMorgan Hong Kong Account', kind: 'bank' },
  { row: 17, key: 'bocom_foreign', labelZh: '交通银行外币对公账户', labelEn: 'Bank of Communications Foreign Currency Account', kind: 'bank' },
] as const;

export function methodLabel(method: CommercialPaymentMethod, language: 'zh' | 'en') {
  return language === 'en' ? method.labelEn : method.labelZh;
}
