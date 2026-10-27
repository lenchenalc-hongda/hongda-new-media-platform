import { redirect } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import ConfirmedQuoteLibrary from '@/components/commercial-documents/ConfirmedQuoteLibrary';
import { getCurrentUserReadOnly } from '@/lib/auth/current-user';
import { canRoleAccessPage } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
export const dynamic='force-dynamic';
export default async function ConfirmedQuotesPage(){
 const user=await getCurrentUserReadOnly();
 if(!user) redirect('/login');
 if(!canRoleAccessPage(user.role,'commercial_documents')) redirect('/workspace-home');
 const db=await createClient();if(!db) redirect('/commercial-documents');
 const {data:profile}=await db.from('profiles').select('id,is_active').eq('user_id',user.id).maybeSingle();
 if(!profile?.is_active) redirect('/workspace-home');
 return <AppLayout><ConfirmedQuoteLibrary profileId={profile.id}/></AppLayout>;
}
