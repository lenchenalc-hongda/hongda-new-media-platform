import type { CommercialDocumentDraft } from '@/lib/commercial-documents/template';
import { documentAmount, formatMoney, itemAmountMinor, sectionAmount, FIXED_SELLER_NAME } from '@/lib/commercial-documents/template';
import { documentProductNotices, sectionNoticeType } from '@/lib/commercial-documents/product-notices';

const EN_SECTION_TITLES: Record<string, string> = {
  '版费': 'Plate-making Fees',
  '热转印花膜': 'Heat Transfer Film',
  '数码花膜': 'Digital Heat Transfer Film',
  '机器设备': 'Machinery and Equipment',
  '夹具与配件': 'Tooling and Accessories',
  '加工费用': 'Printing Service Fees',
  '其他费用': 'Other Charges',
};
function displaySectionTitle(title: string, en: boolean): string {
  if (!en) return title;
  return EN_SECTION_TITLES[title.trim()] ?? title;
}
function displayItemUnit(unit: string, en: boolean): string {
  if (!en) return unit;
  const units: Record<string, string> = { '项': 'item', '个': 'pc', '件': 'pc', '套': 'set', '台': 'unit', '张': 'sheet', '卷': 'roll', '米': 'm', '平方米': 'm²' };
  return units[unit.trim()] ?? unit;
}

function safeDisplay(value: string, fallback = '—'): string {
  return value.trim() || fallback;
}

const printStyles = [
  '@page { size: A4; margin: 13mm 12mm; }',
  '.commercial-print { font-family: Arial, "Microsoft YaHei", "PingFang SC", sans-serif; }',
  '.commercial-print thead { display: table-header-group; }',
  '.commercial-print tr { break-inside: avoid; page-break-inside: avoid; }',
  '.commercial-print .no-split { break-inside: avoid; page-break-inside: avoid; }',
  // Compact styling applies only to Chinese quotations. Avoid '>' CSS combinators:
  // SSR encodes them as entities inside <style>, causing print/PDF discrepancies.
  '.commercial-print.compact-quotation header .py-4 { padding-top: 9px; padding-bottom: 9px; }',
  '.commercial-print.compact-quotation header .py-4 h1 { font-size: 18px; line-height: 24px; }',
  '.commercial-print.compact-quotation header .py-4 p { margin-top: 2px; }',
  '.commercial-print.compact-quotation section.grid { row-gap: 5px; padding-bottom: 10px; }',
  '.commercial-print.compact-quotation .document-body { padding-top: 11px; }',
  '.commercial-print.compact-quotation .document-section + .document-section { margin-top: 8px; }',
  '.commercial-print.compact-quotation .document-section + .document-total { margin-top: 8px; }',
  '.commercial-print.compact-quotation .document-total + .document-terms { margin-top: 10px; }',
  '.commercial-print.compact-quotation table .document-section-title { padding: 5px 9px; line-height: 16px; }',
  '.commercial-print.compact-quotation table th { padding: 5px 8px; }',
  '.commercial-print.compact-quotation table td { padding: 5px 8px; line-height: 1.45; }',
  '.commercial-print.compact-quotation table tfoot td { padding-top: 4px; padding-bottom: 4px; }',
  '.commercial-print.compact-quotation table tbody tr:last-child { break-after: avoid-page; page-break-after: avoid; }',
  '.commercial-print.compact-quotation table tfoot { break-inside: avoid; page-break-inside: avoid; }',
  // The general print reset makes direct main children display:block!important;
  // restore flex explicitly so the total label stays left and its amount right in the PDF.
  '.commercial-print.compact-quotation .document-total { display: flex !important; flex-direction: row !important; justify-content: space-between !important; align-items: center !important; width: 100%; padding: 8px 12px !important; gap: 12px; }',
  '.commercial-print.compact-quotation .document-total-amount { font-size: 16px; line-height: 22px; margin-left: auto; text-align: right; flex: 0 0 auto; white-space: nowrap; }',
  '.commercial-print.compact-quotation .document-total-label { font-size: 12px; white-space: nowrap; }',
  '.commercial-print.compact-quotation .document-terms p { margin-top: 4px; }',
  '.commercial-print.compact-quotation .document-terms h2 { padding-bottom: 4px; }',
  // Plain, compact product notices; each paragraph stays together across A4 page breaks.
  '.commercial-print .document-product-notices { margin-top: 9px !important; font-size: 11px; line-height: 1.5; }',
  '.commercial-print .document-product-notices h2 { padding-bottom: 4px; margin-bottom: 3px; break-after: avoid-page; page-break-after: avoid; }',
  '.commercial-print .document-product-note { display: grid; grid-template-columns: 120px minmax(0, 1fr); column-gap: 9px; padding: 5px 0; margin-top: 0; border-bottom: 1px solid #e5e7eb; break-inside: avoid; page-break-inside: avoid; }',
  '.commercial-print .document-product-note:last-child { border-bottom: none; }',
  '.commercial-print .document-product-note-label { font-weight: 700; line-height: 1.5; }',
  '.commercial-print .document-product-note-body { min-width: 0; white-space: pre-wrap; line-height: 1.5; overflow-wrap: anywhere; }',
  '@media screen and (max-width: 560px) { .commercial-print .document-product-note { display: block; } .commercial-print .document-product-note-label { display: block; margin-bottom: 2px; } }',
  '@media print {',
  ' html, body { background: #fff !important; }',
  ' body * { visibility: hidden !important; }',
  ' body aside, .commercial-editor, .commercial-top-bar, .commercial-warning,',
  ' .commercial-errors, .commercial-tabs, .commercial-preview-controls, .commercial-preview-help { display: none !important; }',
  ' main, main > div, .commercial-root, .commercial-workspace, .commercial-preview-shell,',
  ' .commercial-preview-inner, .commercial-preview-scroll { position: static !important;',
  '   display: block !important; width: 100% !important; max-width: none !important;',
  '   max-height: none !important; overflow: visible !important; margin: 0 !important;',
  '   padding: 0 !important; border: 0 !important; box-shadow: none !important; }',
  ' .commercial-root > * { margin-top: 0 !important; }',
  ' .commercial-print tfoot { display: table-row-group; }',
  ' #commercial-print, #commercial-print * { visibility: visible !important; }',
  ' #commercial-print { position: static; display: block !important;',
  '  width: 100% !important; max-width: none !important; padding: 0 !important;',
  '  margin: 0 !important; border: 0 !important; box-shadow: none !important; overflow: visible !important; }',
  ' #commercial-print .document-section-title, #commercial-print .document-total {',
  '  print-color-adjust: exact; -webkit-print-color-adjust: exact; }',
  '}',
].join('\n');

export default function DocumentPreview({ draft }: { draft: CommercialDocumentDraft }) {
  const en = draft.language === 'en';
  const contract = draft.kind === 'machine_contract';
  const imageHeader = draft.kind === 'quotation' && draft.language === 'zh'
    ? { src: '/document-headers/hongda-quotation-header-zh.png', width: 2047, height: 515, alt: '宏达印业中文报价抬头（公司名称及联系方式）' }
    : null;
  const total = documentAmount(draft);
  const productNotices = documentProductNotices(draft);
  const label = (zh: string, english: string) => en ? english : zh;
  const amountText = (n: number) => formatMoney(n, draft.currency);
  const taxText = draft.market === 'export'
    ? label('外销发票及税务安排以双方最终确认为准。', 'Export invoice and tax arrangements are subject to final agreement.')
    : draft.taxStatement === 'vat13'
      ? label('含13%增值税专用发票。', 'Price includes a 13% VAT special invoice (China).')
      : label('报价未含税，发票及税务安排另行确认。', 'Tax not included; invoice and tax arrangements to be confirmed separately.');

  return (
    <article id="commercial-print" className={`commercial-print${imageHeader ? " compact-quotation" : ""} bg-white text-gray-900 w-full max-w-[810px] mx-auto border border-gray-200 shadow-sm p-7 sm:p-10`}>
      <style>{printStyles}</style>
      <header className="no-split">
        {imageHeader ? (
          <img
            src={imageHeader.src}
            alt={imageHeader.alt}
            width={imageHeader.width}
            height={imageHeader.height}
            loading="eager"
            style={{ display: 'block', width: '100%', height: 'auto' }}
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 pb-3">
              <div className="flex items-center gap-3">
                <img src="/hongda-os-original-emblem.png" alt="HONGDA" width="54" height="54" className="w-14 h-14 object-contain shrink-0" />
                <div>
                  <p className="font-extrabold text-xl tracking-wide text-gray-900">宏达印业</p>
                  <p className="text-[11px] tracking-[0.16em] font-semibold text-gray-600">HONGDA PRINTING</p>
                  <p className="text-xs text-gray-600 mt-1">{FIXED_SELLER_NAME}</p>
                </div>
              </div>
             </div>
            <div className="h-1 bg-red-700" />
          </>
        )}
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
        {!imageHeader && <p><strong>{label('卖方 / 报价方', 'Seller')}：</strong>{FIXED_SELLER_NAME}</p>}
        <p><strong>{label('客户 / 买方', 'Buyer')}：</strong>{safeDisplay(draft.buyerName)}</p>
        <p><strong>{label('业务员', 'Sales representative')}：</strong>{safeDisplay(draft.salespersonName)}</p>
        {draft.buyerContact && <p><strong>{label('客户联系人', 'Buyer contact')}：</strong>{draft.buyerContact}</p>}
        {draft.projectName && <p><strong>{label('项目', 'Project')}：</strong>{draft.projectName}</p>}
        <p><strong>{label('币种', 'Currency')}：</strong>{draft.currency}</p>
        <p><strong>{label('销售区域', 'Market')}：</strong>{draft.market === 'domestic' ? label('内销', 'Domestic') : label('外销', 'Export')}</p>
      </section>
      <main className="document-body pt-5 space-y-5">
        {draft.sections.map((section, index) => {
          const subtotal = sectionAmount(section);
          return (
            <section key={section.id} className="document-section">
              {!imageHeader && <div className="document-section-title bg-gray-700 text-white text-xs font-bold py-2 px-3">
                {index + 1}. {safeDisplay(displaySectionTitle(section.title, en), label('未命名大项', 'Untitled section'))}
              </div>}
              <table className="w-full table-fixed text-xs border-collapse">
                {imageHeader && <colgroup>
                  {[6, 36, 15, 18, 25].map(width => <col key={width} style={{ width: `${width}%` }} />)}
                </colgroup>}
                <thead className="bg-gray-100 text-gray-700">
                  {imageHeader && <tr><th colSpan={5} className="document-section-title bg-gray-700 text-white text-xs font-bold py-2 px-3 text-left">
                    {index + 1}. {safeDisplay(section.title, label('未命名大项', 'Untitled section'))}
                  </th></tr>}
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
                        <td className="p-2 text-right">{item.mode === 'catalog' ? '—' : (item.quantity + ' ' + displayItemUnit(item.unit, en))}</td>
                        <td className="p-2 text-right">{item.unitPrice && /^\d+(?:\.\d+)?$/.test(item.unitPrice) ? item.unitPrice + ' / ' + displayItemUnit(item.unit, en) : '—'}</td>
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
            <p className="document-total-label font-bold text-sm">{total.catalogLines
              ? label('已确定金额合计（不含单价目录）', 'Confirmed items total (catalog excluded)')
              : label('合同/报价总金额', 'TOTAL AMOUNT')}</p>
            {total.catalogLines > 0 && <p className="text-[10px] mt-1">{label('单价目录仅供选择，不计入合同/报价金额。', 'Catalog prices are not included in the total.')}</p>}
          </div>
          <p className="document-total-amount text-lg font-bold whitespace-nowrap">{total.amountLines ? amountText(total.amountMinor) : '—'}</p>
        </div>
        <section className="document-terms no-split text-xs space-y-2">
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
        </section>
        {productNotices.length > 0 && (
          <section className="document-product-notices">
            <h2 className="font-bold text-gray-800 border-b border-gray-300">
              {label('产品及工艺说明', 'PRODUCT / PROCESS NOTES')}
            </h2>
            {productNotices.map(note => (
              <div key={note.type} className="document-product-note text-gray-800">
                <strong className="document-product-note-label">{note.title}：</strong>
                <span className="document-product-note-body">{note.text}</span>
              </div>
            ))}
          </section>
        )}
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
      {contract && (
        <div className="document-draft-notice no-split mt-8 pt-2 border-t border-gray-200 text-[10px] text-gray-500 text-center">
          {label('模板草稿 · 需核对正式主体、价格、合同条款及收款账户后方可对外使用', 'DRAFT TEMPLATE · Verify legal entities, prices, terms and payment details before external use')}
        </div>
      )}
    </article>
  );
}
