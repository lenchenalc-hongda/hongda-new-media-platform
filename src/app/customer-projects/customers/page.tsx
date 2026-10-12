import CustomersClient from './CustomersClient';
import { readCustomerList } from '@/lib/customer-projects/server-reads';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const result = await readCustomerList();

  return (
    <CustomersClient
      initialCustomers={result.ok ? result.data : []}
      initialError={result.ok ? '' : result.message}
    />
  );
}
