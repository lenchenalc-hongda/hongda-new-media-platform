-- Allow agreed per-unit prices with four decimal places in quotations/contracts.
-- Preserve archived amount scale at integer thousandths (0.001), unchanged.
-- Keep every existing validation, immutable trigger and security boundary intact.
-- IMPORTANT: run in isolated review DB first; Production requires owner authorization.
DO $verify$
BEGIN
  IF to_regclass('public.commercial_confirmed_quote_versions') IS NULL
     OR to_regprocedure('commercial_private.guard_confirmed_quote_version()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger t
       WHERE t.tgrelid = 'public.commercial_confirmed_quote_versions'::regclass
         AND t.tgname = 'confirmed_quote_version_guard'
         AND NOT t.tgisinternal
     ) THEN
    RAISE EXCEPTION 'CONFIRMED_QUOTE_GUARD_PREREQUISITE_MISSING';
  END IF;
END $verify$;

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
 or new.snapshot->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
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
     v_price !~ '^[0-9]{1,11}([.][0-9]{1,4})?
   then raise exception 'INVALID_LINE';end if;
   if v_mode='amount' then
    if v_qty !~ '^[0-9]{1,9}([.][0-9]{1,3})?$' or v_qty::numeric<=0
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
   then raise exception 'INVALID_LINE';end if;
   if v_mode='amount' then
    if v_qty !~ '^[0-9]{1,9}([.][0-9]{1,3})?$' or v_qty::numeric<=0
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
