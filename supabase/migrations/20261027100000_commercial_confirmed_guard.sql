-- Database-side confirmation invariants: protect the RPC even when called directly.
-- Historical versions cannot be replaced or deleted.
create or replace function commercial_private.guard_confirmed_quote_version()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $guard$
declare v_section jsonb; v_line jsonb; v_total numeric:=0;
 v_price text; v_qty text; v_name text; v_mode text; v_lines integer:=0;
begin
 if TG_OP <> 'INSERT' then raise exception 'CONFIRMED_VERSIONS_ARE_IMMUTABLE'; end if;
 if new.snapshot->>'kind'<>'quotation'
 or new.snapshot->>'language' not in ('zh','en')
 or new.snapshot->>'currency'<>new.currency
 or new.snapshot->>'buyerName'<>new.buyer_name
 or btrim(coalesce(new.snapshot->>'buyerName',''))=''
 or new.snapshot->>'documentNo' is null
 or new.snapshot->>'date' !~ '^\\d{4}-\\d{2}-\\d{2}$'
 or coalesce(jsonb_typeof(new.snapshot->'sections'),'')<>'array'
 or jsonb_array_length(new.snapshot->'sections')=0
 then raise exception 'INVALID_CONFIRMED_QUOTE'; end if;
 if not exists(select 1 from public.commercial_confirmed_quotes q
   where q.id=new.quote_id and q.org_id=new.org_id
   and q.document_no=new.snapshot->>'documentNo')
 then raise exception 'CONFIRMED_QUOTE_NUMBER_MISMATCH'; end if;
 for v_section in select value from jsonb_array_elements(new.snapshot->'sections') loop
  if btrim(coalesce(v_section->>'title',''))='' or
     coalesce(jsonb_typeof(v_section->'items'),'')<>'array' or
     jsonb_array_length(v_section->'items')=0
  then raise exception 'INVALID_SECTION';end if;
  for v_line in select value from jsonb_array_elements(v_section->'items') loop
   v_lines:=v_lines+1;
   v_name:=btrim(coalesce(v_line->>'name',''));
   v_mode:=v_line->>'mode';
   v_price:=coalesce(v_line->>'unitPrice','');
   v_qty:=coalesce(v_line->>'quantity','');
   if v_name='' or v_mode not in ('amount','catalog') or
     v_price !~ '^\\d{1,11}(\\.\\d{1,3})?$'
   then raise exception 'INVALID_LINE';end if;
   if v_mode='amount' then
    if v_qty !~ '^\\d{1,9}(\\.\\d{1,3})?$' or v_qty::numeric<=0
    then raise exception 'INVALID_QUANTITY'; end if;
    v_total:=v_total+round(v_price::numeric*v_qty::numeric,3);
   end if;
  end loop;
 end loop;
 if v_lines>1000 or v_total*1000<>new.amount_thousandths or
 v_total>9007199254740.991
 then raise exception 'AMOUNT_MISMATCH';end if;
 return new;
end $guard$;
revoke all on function commercial_private.guard_confirmed_quote_version() from public,anon,authenticated;
create trigger confirmed_quote_version_guard
before insert or update or delete on public.commercial_confirmed_quote_versions
for each row execute function commercial_private.guard_confirmed_quote_version();

-- The quote header may only advance by exactly one version, and may never
-- reassign the owner or number. The confirm RPC is its sole writer.
create or replace function commercial_private.guard_confirmed_quote_header()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $header$
begin
 if TG_OP='DELETE' then raise exception 'CONFIRMED_QUOTES_ARE_IMMUTABLE';end if;
 if TG_OP='UPDATE' then
  if new.id<>old.id or new.org_id<>old.org_id
    or new.owner_profile_id<>old.owner_profile_id
    or new.document_no<>old.document_no
    or new.latest_version<>old.latest_version+1
  then raise exception 'INVALID_CONFIRMED_QUOTE_TRANSITION';end if;
 end if;
 return new;
end $header$;
revoke all on function commercial_private.guard_confirmed_quote_header() from public,anon,authenticated;
create trigger confirmed_quote_header_guard
before update or delete on public.commercial_confirmed_quotes
for each row execute function commercial_private.guard_confirmed_quote_header();
