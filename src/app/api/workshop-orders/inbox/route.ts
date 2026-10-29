import { readWosWorkshopInbox } from '@/lib/workshop-orders/api-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Nonproduction, explicitly flagged, verified-session real DB read only.
export async function GET() {
  return readWosWorkshopInbox();
}
