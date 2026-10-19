import type { CommercialDocumentDraft } from '@/lib/commercial-documents/template';
import { documentAmount, formatMoney, itemAmountMinor, sectionAmount } from '@/lib/commercial-documents/template';

function safeDisplay(value: string, fallback = '—'): string {
  return value.trim() || fallback;
}

const printStyles = [
  '@page { size: A4; margin: 13mm 12mm; }',
  '.commercial-print { font-family: Arial, "Microsoft YaHei", "PingFang SC", sans-serif; }',
  '.commercial-print thead { display: table-header-group; }',
  '.commercial-print tr { break-inside: avoid; page-break-inside: avoid; }',
  '.commercial-print .no-split { break-inside: avoid; page-break-inside: avoid; }',
  '@media print {',
  ' html, body { background: #fff !important; }',
  ' body * { visibility: hidden !important; }',
  ' #commercial-print, #commercial-print * { visibility: visible !important; }',
  ' #commercial-print { position: absolute; top: 0; left: 0; display: block !important;',
  '  width: 100% !important; max-width: none !important; padding: 0 !important;',
  '  margin: 0 !important; border: 0 !important; box-shadow: none !important; overflow: visible !important; }',
  ' #commercial-print .document-section-title, #commercial-print .document-total {',
  '  print-color-adjust: exact; -webkit-print-color-adjust: exact; }',
  '}',
].join('\n');

export default function DocumentPreview({ draft }: { draft: CommercialDocumentDraft }) {
  const en = draft.language === 'en';
  const contract = draft.kind === 'machine_contract';
  const total = documentAmount(draft);
  const label = (zh: string, english: string) => en ? english : zh;
  const amountText = (n: number) => formatMoney(n, draft.currency);
  const taxText = draft.market === 'export'
    ? label('外销发票及税务安排以双方最终确认为准。', 'Export invoice and tax arrangements are subject to final agreement.')
    : draft.taxStatement === 'vat13'
      ? label('含13%增值税专用发票。', 'Price includes a 13% VAT special invoice (China).')
      : label('报价未含税，发票及税务安排另行确认。', 'Tax not included; invoice and tax arrangements to be confirmed separately.');

  return (
    <article id="commercial-print" className="commercial-print bg-white text-gray-900 w-full max-w-[810px] mx-auto border border-gray-200 shadow-sm p-7 sm:p-10">
      <style>{printStyles}</style>
      <header className="no-split">
        <div className="flex items-center justify-between gap-3 pb-3">
          <div className="flex items-center gap-3">
            <img src="/hongda-os-original-emblem.png" alt="HONGDA" width="54" height="54" className="w-14 h-14 object-contain shrink-0" />
            <div>
              <p className="font-extrabold text-xl tracking-wide text-gray-900">宏达印业</p>
              <p className="text-[11px] tracking-[0.16em] font-semibold text-gray-600">HONGDA PRINTING</p>
              <p className="text-xs text-gray-600 mt-1">{safeDisplay(draft.sellerName, label('（待填写正式公司主体）', '(Legal entity to be completed)'))}</p>
            </div>
          </div>
          <div className="text-right text-[11px] text-gray-600">
            {draft.sellerAddress && <p className="whitespace-pre-wrap">{draft.sellerAddress}</p>}
            {draft.sellerContact && <p className="whitespace-pre-wrap">{draft.sellerContact}</p>}
          </div>
        </div>
        <div className="h-1 bg-red-700" />
        <div className="py-4 text-center">
          <h1 className="font-bold text-xl text-gray-900">
            {contract ? label('机器销售合同', 'MACHINE SALES CONTRACT') : label('产品报价单', 'QUOTATION')}
          </h1>
          <p className="text-[11px] mt-1 text-gray-500">HONGDA PRINTING · {contract ? 'CONTRACT' : 'QUOTATION'}</p>
        </div>
      </header>
      <section className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs pb-4 border-b border-gray-200">
        <p><strong>{label('编号', 'No.')}：</strong>{safeDisplay(draft.documentNo)}</p>
        <p><strong>{label('日期', 'Date')}：</strong>{safeDisplay(draft.date)}</p>
        <p><strong>{label('卖方 / 报价方', 'Seller')}：</strong>{safeDisplay(draft.sellerName)}</p>
        <p><strong>{label('客户 / 买方', 'Buyer')}：</strong>{safeDisplay(draft.buyerName)}</p>
        {draft.buyerAddress && <p className="col-span-2"><strong>{label('客户地址', 'Buyer address')}：</strong>{draft.buyerAddress}</p>}
        {draft.buyerContact && <p><strong>{label('联系人', 'Contact')}：</strong>{draft.buyerContact}</p>}
        {draft.projectName && <p><strong>{label('项目', 'Project')}：</strong>{draft.projectName}</p>}
        <p><strong>{label('币种', 'Currency')}：</strong>{draft.currency}</p>
        <p><strong>{label('销售区域', 'Market')}：</strong>{draft.market === 'domestic' ? label('内销', 'Domestic') : label('外销', 'Export')}</p>
      </section>
      <main className="pt-5 space-y-5">
        {draft.sections.map((section, index) => {
          const subtotal = sectionAmount(section);
          return (
            <section key={section.id}>
              <div className="document-section-title bg-gray-700 text-white text-xs font-bold py-2 px-3">
                {index + 1}. {safeDisplay(section.title, label('未命名大项', 'Untitled section'))}
              </div>
              <table className="w-full table-fixed text-xs border-collapse">
                <thead className="bg-gray-100 text-gray-700">
                  <tr>
                    <th className="w-[6%] p-2 text-left">{label('序', '#')}</th>
                    <th className="w-[36%] p-2 text-left">{label('名称 / 规格', 'Item / Specification')}</th>
                    <th className="w-[15%] p-2 text-right">{label('数量', 'Qty')}</th>
                    <th className="w-[18%] p-2 text-right">{label('单价', 'Unit price')}</th>
                    <th className="w-[25%] p-2 text-right">{label('金额', 'Amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item, lineIndex) => {
                    const amount = itemAmountMinor(item);
                    return (
                      <tr key={item.id} className="border-b border-gray-200 align-top">
                        <td className="p-2">{lineIndex + 1}</td>
                        <td className="p-2 break-words">
                          <p className="font-medium whitespace-pre-wrap">{safeDisplay(item.name)}</p>
                          {item.specification && <p className="text-[11px] text-gray-600 whitespace-pre-wrap">{item.specification}</p>}
                          {item.note && <p className="text-[11px] text-gray-500 whitespace-pre-wrap">{item.note}</p>}
                        </td>
                        <td className="p-2 text-right">{item.mode === 'catalog' ? '—' : (item.quantity + ' ' + item.unit)}</td>
                        <td className="p-2 text-right">{item.unitPrice && /^\d+(?:\.\d+)?$/.test(item.unitPrice) ? item.unitPrice + ' / ' + item.unit : '—'}</td>
                        <td className="p-2 text-right">{amount === null ? '—' : amountText(amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-bold">
                    <td colSpan={4} className="p-2 text-right">
                      {subtotal.catalogLines > 0
                        ? label('本大项已确定金额小计（单价目录未计入）', 'Section subtotal (catalog excluded)')
                        : label('本大项小计', 'Section subtotal')}
                    </td>
                    <td className="p-2 text-right">
                      {subtotal.amountLines ? amountText(subtotal.amountMinor) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>
          );
        })}
        <div className="document-total no-split bg-red-700 text-white px-4 py-3 flex justify-between items-center gap-4">
          <div>
            <p className="font-bold text-sm">{total.catalogLines
              ? label('已确定金额合计（不含单价目录）', 'Confirmed items total (catalog excluded)')
              : label('合同/报价总金额', 'TOTAL AMOUNT')}</p>
            {total.catalogLines > 0 && <p className="text-[10px] mt-1">{label('单价目录仅供选择，不计入合同/报价金额。', 'Catalog prices are not included in the total.')}</p>}
          </div>
          <p className="text-lg font-bold whitespace-nowrap">{total.amountLines ? amountText(total.amountMinor) : '—'}</p>
        </div>
        <section className="no-split text-xs space-y-2">
          <h2 className="font-bold text-gray-800 border-b border-gray-300 pb-2">
            {label('商务及税务说明', 'TERMS & CONDITIONS')}
          </h2>
          <p><strong>{label('税务说明', 'Tax / Invoice')}：</strong>{taxText}</p>
          {draft.validity && !contract && <p><strong>{label('报价有效期', 'Validity')}：</strong>{draft.validity}</p>}
          {draft.paymentTerms && <p className="whitespace-pre-wrap"><strong>{label('付款方式', 'Payment terms')}：</strong>{draft.paymentTerms}</p>}
          {draft.deliveryTerms && <p className="whitespace-pre-wrap"><strong>{label('交付期限', 'Lead time')}：</strong>{draft.deliveryTerms}</p>}
          {draft.shippingTerms && <p className="whitespace-pre-wrap"><strong>{label('运输 / 贸易术语', 'Shipping / Incoterms')}：</strong>{draft.shippingTerms}</p>}
          {contract && draft.acceptanceTerms && <p className="whitespace-pre-wrap"><strong>{label('验收条件', 'Acceptance terms')}：</strong>{draft.acceptanceTerms}</p>}
          {contract && draft.warrantyTerms && <p className="whitespace-pre-wrap"><strong>{label('售后与保修', 'Warranty / After-sales')}：</strong>{draft.warrantyTerms}</p>}
          {draft.additionalTerms && <p className="whitespace-pre-wrap"><strong>{label('其他约定', 'Additional terms')}：</strong>{draft.additionalTerms}</p>}
          {draft.accountLabel && draft.accountDetails &&
            <p className="whitespace-pre-wrap"><strong>{label('经财务确认的收款账户', 'Verified payment account')}：</strong>{draft.accountLabel}{'\n'}{draft.accountDetails}</p>}
        </section>
      </main>
      {contract && (
        <footer className="no-split mt-10 grid grid-cols-2 gap-10 text-xs">
          <div className="border-t border-gray-400 pt-3">
            <p className="font-semibold">{label('卖方（盖章 / 签字）', 'Seller (Signature / Seal)')}</p>
            <p className="mt-10">{label('日期', 'Date')}：______________</p>
          </div>
          <div className="border-t border-gray-400 pt-3">
            <p className="font-semibold">{label('买方（盖章 / 签字）', 'Buyer (Signature / Seal)')}</p>
            <p className="mt-10">{label('日期', 'Date')}：______________</p>
          </div>
        </footer>
      )}
      <div className="no-split mt-8 pt-2 border-t border-gray-200 text-[10px] text-gray-500 text-center">
        {label('模板草稿 · 需核对正式主体、价格、合同条款及收款账户后方可对外使用', 'DRAFT TEMPLATE · Verify legal entities, prices, terms and payment details before external use')}
      </div>
    </article>
  );
}
