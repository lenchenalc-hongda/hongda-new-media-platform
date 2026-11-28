\set ON_ERROR_STOP on

SELECT encode(
  sha256(convert_to(
    jsonb_build_object(
      'schema_acl', (
        SELECT COALESCE(namespace_row.nspacl::text, '')
        FROM pg_catalog.pg_namespace namespace_row
        WHERE namespace_row.nspname = 'wos_qa_safety'
      ),
      'relations', (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'name', class_row.relname,
              'kind', class_row.relkind,
              'owner', class_row.relowner,
              'rls', class_row.relrowsecurity,
              'acl', COALESCE(class_row.relacl::text, '')
            )
            ORDER BY class_row.relname
          ),
          '[]'::jsonb
        )
        FROM pg_catalog.pg_class class_row
        JOIN pg_catalog.pg_namespace namespace_row
          ON namespace_row.oid = class_row.relnamespace
        WHERE namespace_row.nspname = 'wos_qa_safety'
      ),
      'functions', (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'name', procedure_row.proname,
              'definition', md5(pg_get_functiondef(procedure_row.oid)),
              'acl', COALESCE(procedure_row.proacl::text, '')
            )
            ORDER BY procedure_row.proname, procedure_row.oid
          ),
          '[]'::jsonb
        )
        FROM pg_catalog.pg_proc procedure_row
        JOIN pg_catalog.pg_namespace namespace_row
          ON namespace_row.oid = procedure_row.pronamespace
        WHERE namespace_row.nspname = 'wos_qa_safety'
      ),
      'triggers', (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'name', trigger_row.tgname,
              'definition', md5(pg_get_triggerdef(trigger_row.oid)),
              'enabled', trigger_row.tgenabled
            )
            ORDER BY trigger_row.tgname, trigger_row.oid
          ),
          '[]'::jsonb
        )
        FROM pg_catalog.pg_trigger trigger_row
        JOIN pg_catalog.pg_class class_row
          ON class_row.oid = trigger_row.tgrelid
        JOIN pg_catalog.pg_namespace namespace_row
          ON namespace_row.oid = class_row.relnamespace
        WHERE namespace_row.nspname = 'wos_qa_safety'
          AND trigger_row.tgisinternal = false
      ),
      'p2_open_rows', (
        SELECT md5(COALESCE(
          string_agg(to_jsonb(source_row)::text, E'\n'
            ORDER BY to_jsonb(source_row)::text),
          ''
        ))
        FROM wos_qa_safety.p2_gate_open_receipts source_row
      ),
      'p2_close_rows', (
        SELECT md5(COALESCE(
          string_agg(to_jsonb(source_row)::text, E'\n'
            ORDER BY to_jsonb(source_row)::text),
          ''
        ))
        FROM wos_qa_safety.p2_gate_close_receipts source_row
      ),
      'watchdog_rows', (
        SELECT md5(COALESCE(
          string_agg(to_jsonb(source_row)::text, E'\n'
            ORDER BY to_jsonb(source_row)::text),
          ''
        ))
        FROM wos_qa_safety.p2_gate_watchdog_receipts source_row
      ),
      'trigger_backup_rows', (
        SELECT md5(COALESCE(
          string_agg(to_jsonb(source_row)::text, E'\n'
            ORDER BY to_jsonb(source_row)::text),
          ''
        ))
        FROM wos_qa_safety.wos_trigger_backup source_row
      ),
      'guard_probe_rows', (
        SELECT md5(COALESCE(
          string_agg(to_jsonb(source_row)::text, E'\n'
            ORDER BY to_jsonb(source_row)::text),
          ''
        ))
        FROM wos_qa_safety.p2_guard_probe source_row
      )
    )::text,
    'UTF8'
  )),
  'hex'
);
