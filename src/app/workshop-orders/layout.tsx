import { notFound } from 'next/navigation';
import { getCurrentUserReadOnly } from '@/lib/auth/current-user';
import {
  canAccessWorkshopOrdersPage,
  isWorkshopOrdersFeatureEnabled,
} from '@/lib/workshop-orders/route-access';

export const dynamic = 'force-dynamic';

export default async function WorkshopOrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const featureValue = process.env.NEXT_PUBLIC_FEATURE_WORKSHOP_ORDERS;

  if (!isWorkshopOrdersFeatureEnabled(featureValue)) notFound();

  let user;
  try {
    user = await getCurrentUserReadOnly();
  } catch {
    notFound();
  }

  if (!canAccessWorkshopOrdersPage({
    featureValue,
    authenticated: Boolean(user?.id),
    role: user?.role,
  })) {
    notFound();
  }

  return children;
}
