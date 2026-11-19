#!/usr/bin/env node
// WOS P8 schema-only replay. NO Production writes, NO data export, NO migrations-history rewrite.
// Node 20+, psql 17. Avoid Supabase CLI version-dependent remote defaults.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/wos-p8/replay-manifest.json'), 'utf8'));
const mode = process.argv[2] || '--plan';
const source = (relative) => {
  if (!/^supabase\/migrations\/[A-Za-z0-9_]+\.sql$/.test(relative)) throw new Error('UNSAFE_MIGRATION_PATH');
  const f = path.resolve(root, relative);
  if (!f.startsWith(root + path.sep) || !fs.statSync(f).isFile()) throw new Error('MIGRATION_NOT_FOUND: ' + relative);
  return f;
};
function verifyManifest() {
  if (manifest.production_migrations.length !== 29 || manifest.early_sources.length !== 17
      || manifest.expected_public_tables !== 67) throw new Error('HISTORICAL_MANIFEST_DRIFT');
  const versions = manifest.production_migrations.map(x => x.applied_version);
  if (new Set(versions).size !== versions.length || versions.some(x => !/^\d{14}$/.test(x))
      || versions.some((x,i)=>i && x<=versions[i-1])) throw new Error('MIGRATION_VERSION_ORDER_INVALID');
  const all = [...manifest.early_sources, ...manifest.production_migrations];
  if (new Set(all.map(x=>x.file)).size !== all.length) throw new Error('DUPLICATE_SOURCE_FILE');
  for (const entry of all) source(entry.file);
  if (all.some(x=>/workshop_order_system|commercial_supplier_order/.test(x.file))) throw new Error('PRODUCTION_UNAPPLIED_MIGRATION_SELECTED');
}
verifyManifest();

if (mode === '--plan') {
  console.log('WOS_P8_P06_PLAN_ONLY: 1 legacy schema-only prelude + '
    + manifest.early_sources.length + ' untracked early migrations + '
    + manifest.production_migrations.length + ' version-mapped Production migrations.');
  for (const x of manifest.production_migrations) console.log(x.applied_version + ' -> ' + x.file);
  console.log('WOS_P8_NO_SQL_EXECUTED; PROD_MIGRATION_HISTORY_UNCHANGED');
  process.exit(0);
}

const env = { ...process.env };
if (mode === '--ci') {
  if (env.PGDATABASE !== 'wos_p8_replay_ci' || !['localhost','127.0.0.1'].includes(env.PGHOST)
      || env.PGUSER !== 'postgres' || env.DATABASE_URL || env.SUPABASE_DB_URL) {
    throw new Error('WOS_P8_CI_TARGET_NOT_DISPOSABLE');
  }
} else if (mode === '--branch') {
  const ref = env.WOS_P8_BRANCH_REF;
  if (!/^[a-z0-9]{20}$/.test(ref || '') || ref === manifest.source_project_ref
     || ref !== env.WOS_P8_EXACT_OWNER_APPROVED_REF
     || env.WOS_P8_REPLAY_ACK !== 'SCHEMA_ONLY_ZERO_BUSINESS_DATA'
     || !env.PGHOST || !env.PGUSER || !env.PGUSER.endsWith('.' + ref)
     || /(^|\.)amqpvxrurenevniilhtl(\.|$)/.test(env.PGHOST)
     || env.DATABASE_URL || env.SUPABASE_DB_URL) {
    throw new Error('WOS_P8_BRANCH_NOT_EXACTLY_AUTHORIZED_OR_CREDENTIAL_MISMATCH');
  }
  env.PGSSLMODE = 'require';
} else {
  throw new Error('MODE_MUST_BE_PLAN_CI_OR_EXPLICIT_APPROVED_BRANCH');
}

function psql(args, opts={}) {
  const result = spawnSync('psql', ['-X','-v','ON_ERROR_STOP=1', ...args], {
    cwd:root, env, encoding:'utf8', stdio:opts.capture ? ['ignore','pipe','pipe'] : 'inherit',
    timeout: 120000
  });
  if (result.error || result.status !== 0) {
    const error = opts.capture ? String(result.stderr || '').slice(0,1200) : 'see psql stderr';
    throw new Error('WOS_P8_REPLAY_SQL_FAILED: ' + error);
  }
  return String(result.stdout || '').trim();
}
function value(sql) {
  return psql(['-q','-A','-t','-c',sql],{capture:true}).trim();
}
// Fail closed: never replay on any pre-existing application schema.
if (mode === '--ci') {
  psql(['-q','-f','tests/sql/wos_p8_synthetic_supabase_ci.sql']);
}
if (value("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'") !== '0') {
  throw new Error('WOS_P8_TARGET_ALREADY_CONTAINS_BUSINESS_TABLES');
}

const initial = fs.readFileSync(source('supabase/migrations/001_initial_schema.sql'),'utf8');
const idx = initial.indexOf('-- ========== INDEXES ==========');
const rls = initial.indexOf('-- ========== RLS POLICIES');
if (idx < 0 || rls < idx || (initial.match(/CREATE TABLE IF NOT EXISTS/g)||[]).length !== 16
  || (initial.slice(idx,rls).match(/CREATE INDEX /g)||[]).length !== 41) {
  throw new Error('LEGACY_INITIAL_SQL_LAYOUT_CHANGED_REQUIRE_REVIEW');
}
const beforePolicies = initial.slice(0,rls);
if (/\bDROP TABLE\b|\bTRUNCATE\b|\bDELETE FROM\b|\bGRANT ALL\b/i.test(beforePolicies)) {
  throw new Error('UNSAFE_LEGACY_INITIAL_SQL');
}
const legacy = beforePolicies + '\n' + [
  'CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_id_org ON public.profiles(id,org_id);',
  ...['organizations','profiles','accounts','account_rules','topics','scripts','posts',
      'post_metrics','reviews','viral_teardowns','leads','lead_interactions',
      'knowledge_cards','media_assets','tasks','ai_runs'].map(x=>
        'ALTER TABLE public.' + x + ' ENABLE ROW LEVEL SECURITY;'),
  'CREATE OR REPLACE FUNCTION public.auth_user_id() RETURNS uuid LANGUAGE sql STABLE SET search_path=public AS $$ SELECT auth.uid(); $$;',
  'CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;',
  'CREATE TABLE public.site_data(key text PRIMARY KEY, data jsonb NOT NULL DEFAULT \'[]\'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());',
  'ALTER TABLE public.site_data ENABLE ROW LEVEL SECURITY;',
  'REVOKE ALL ON TABLE public.site_data FROM PUBLIC,anon,authenticated;',
  'CREATE OR REPLACE FUNCTION public.update_site_data_timestamp() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;',
  'CREATE TRIGGER set_site_data_timestamp BEFORE UPDATE ON public.site_data FOR EACH ROW EXECUTE FUNCTION public.update_site_data_timestamp();'
].join('\n');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'wos-p8-replay-'));
try {
  const preludePath = path.join(temp,'p8-legacy.sql');
  fs.writeFileSync(preludePath, 'BEGIN;\n' + legacy + '\nCOMMIT;\n', {mode:0o600});
  psql(['-q','-f',preludePath]);
  console.log('WOS_P8_LEGACY_ZERO_DATA_BOOTSTRAP=APPLIED');
  for (const x of manifest.early_sources) {
    psql(['-q','-f',source(x.file)]);
    console.log('WOS_P8_PREHISTORY_APPLIED ' + x.file);
  }
  for (const x of manifest.production_migrations) {
    psql(['-q','-f',source(x.file)]);
    console.log('WOS_P8_TRACKED_SOURCE_APPLIED ' + x.applied_version);
  }
  psql(['-q','-f','tests/sql/wos_p8_historical_profile_acl_parity.sql']);
  console.log('WOS_P8_HISTORICAL_PROFILE_ACL_RLS_RECONSTRUCTED=PASS');
  const tables = Number(value("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"));
  const wos = Number(value("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'wos_%'"));
  if (tables !== manifest.expected_public_tables || wos !== 0) {
    throw new Error('WOS_P8_SCHEMA_PARITY_GATE_FAILED tables=' + tables + ' wos=' + wos);
  }
  const businessRows = value("SELECT (SELECT count(*) FROM public.organizations) || ',' || (SELECT count(*) FROM public.profiles)");
  if (businessRows !== '0,0') throw new Error('WOS_P8_BUSINESS_DATA_PRESENT');
  console.log('WOS_P8_P06_SCHEMA_REPLAY_67_OF_67=PASS');
  console.log('WOS_P8_PRODUCTION_DATA=ABSENT; WOS_BASELINE=ABSENT');
  console.log('WOS_P8_NATIVE_MIGRATION_TRACKING=NOT_MODIFIED');
} finally {
  fs.rmSync(temp,{recursive:true,force:true});
}
