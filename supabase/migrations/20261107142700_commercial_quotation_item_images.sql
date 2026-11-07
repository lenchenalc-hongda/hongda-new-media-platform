-- Private, optional single-image attachments to commercial quotation line items.
-- Apply to isolated review database first. Production rollout requires owner approval.
-- Legacy quotations have no photoPath; existing JSON, amounts, RLS, finance remain untouched.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
 'commercial-quotation-item-images','commercial-quotation-item-images',false,
 3145728,array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do nothing;

DO $check$
BEGIN
 IF NOT EXISTS(
   select 1 from storage.buckets where id='commercial-quotation-item-images'
     and public=false and file_size_limit=3145728
     and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]
 ) THEN
   raise exception 'QUOTATION_IMAGE_BUCKET_CONFIGURATION_MISMATCH';
 END IF;
END $check$;

-- Object names: <org_uuid>/<owner_profile_uuid>/<random_uuid>.(jpg|png|webp).
-- Authenticated clients can only create new objects under their own profile.
create policy quotation_item_image_insert
on storage.objects for insert to authenticated
with check(
 bucket_id='commercial-quotation-item-images'
 and name ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}/[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}/[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}[.](jpg|png|webp)$'
 and exists(
   select 1 from public.profiles p
   where p.user_id=(select auth.uid()) and p.is_active
     and p.role in ('admin','manager','operator','sales')
     and p.org_id::text=(storage.foldername(name))[1]
     and p.id::text=(storage.foldername(name))[2]
 )
);

-- Owners can re-open their images; admins/managers may view archived quote images
-- for the same organization. No public SELECT permission.
create policy quotation_item_image_select
on storage.objects for select to authenticated
using(
 bucket_id='commercial-quotation-item-images'
 and exists(
   select 1 from public.profiles p
   where p.user_id=(select auth.uid()) and p.is_active
     and p.role in ('admin','manager','operator','sales')
     and p.org_id::text=(storage.foldername(name))[1]
     and (p.id::text=(storage.foldername(name))[2]
          or p.role in ('admin','manager'))
 )
);
-- No UPDATE/DELETE policies: uploaded photos are immutable so historical
-- confirmed quotations continue to resolve even after a photo is replaced or
-- detached in a newer draft/version.
