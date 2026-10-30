-- Freeze approved payment-method metadata in every confirmed data version.
-- QR image bytes are not retained; hashes identify the original payment images.
alter table public.commercial_confirmed_quote_versions
 add column payment_snapshot jsonb not null default '{}'::jsonb
 check(jsonb_typeof(payment_snapshot)='object');

create or replace function commercial_private.freeze_confirmed_payment_method()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $freeze$
declare v_id text; v_method public.commercial_payment_methods%rowtype;
 v_members jsonb; v_count int;
begin
 v_id=coalesce(new.snapshot->>'paymentMethodId','');
 if v_id='' then
   new.payment_snapshot='{}'::jsonb;
 elsif v_id='wechat_alipay' then
   select count(*),jsonb_agg(jsonb_build_object(
     'methodKey',method_key,'labelZh',label_zh,'labelEn',label_en,
     'beneficiary',beneficiary,'qrSha256',qr_sha256) order by method_key)
   into v_count,v_members from public.commercial_payment_methods
   where org_id=new.org_id and approved=true
   and method_key in('wechat_qr','alipay_qr') and qr_sha256 is not null;
   if v_count<>2 then raise exception 'PAYMENT_METHOD_NOT_APPROVED';end if;
   new.payment_snapshot=jsonb_build_object('kind','qr_pair','members',v_members);
 else
   if v_id !~ '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
     raise exception 'INVALID_PAYMENT_METHOD';end if;
   select * into v_method from public.commercial_payment_methods
   where id=v_id::uuid and org_id=new.org_id and approved=true;
   if not found or v_method.kind<>'bank' then
     raise exception 'PAYMENT_METHOD_NOT_APPROVED';end if;
   new.payment_snapshot=jsonb_build_object(
     'kind','bank','methodKey',v_method.method_key,
     'labelZh',v_method.label_zh,'labelEn',v_method.label_en,
     'beneficiary',v_method.beneficiary,'bankName',v_method.bank_name,
     'accountNo',v_method.account_no,'notes',v_method.notes);
 end if;
 return new;
end $freeze$;
revoke all on function commercial_private.freeze_confirmed_payment_method() from public,anon,authenticated;
create trigger confirmed_quote_payment_snapshot
before insert on public.commercial_confirmed_quote_versions
for each row execute function commercial_private.freeze_confirmed_payment_method();
