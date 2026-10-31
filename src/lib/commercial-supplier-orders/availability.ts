/**
 * Code-only integration safety gate. Supplier orders must remain inaccessible in
 * Production until the isolated SQL, Auth/RLS and order workflow are approved.
 *
 * NEXT_PUBLIC_FEATURE_SUPPLIER_ORDERS controls client navigation only.
 * The server setting below is independently enforced on every page/API.
 */
export function supplierOrdersEnabled(): boolean {
  if (process.env.FEATURE_SUPPLIER_ORDERS !== 'true') return false;
  if (process.env.VERCEL_ENV === 'production' &&
      process.env.SUPPLIER_ORDERS_PRODUCTION_APPROVED !== 'true') return false;
  return true;
}
