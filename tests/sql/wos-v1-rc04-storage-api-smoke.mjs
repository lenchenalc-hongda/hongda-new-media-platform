import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const container = process.env.WOS_PG_DOCKER_CONTAINER;
const database = process.env.WOS_RC04_STORAGE_DB;
const storageImage =
  process.env.WOS_STORAGE_API_IMAGE
  || 'public.ecr.aws/supabase/storage-api:v1.96.4';
const storageName = `codex-wos-rc04-storage-${process.pid}`;
const jwtSecret = 'rc04-storage-local-secret-32-bytes-minimum';
const storagePolicyMode =
  process.env.WOS_STORAGE_POLICY_MODE || 'rc04';

if (!container || !database) {
  throw new Error('WOS_RC04_STORAGE_CONTEXT_REQUIRED');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

function mustRun(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    throw new Error(
      `RC04_STORAGE_COMMAND_FAILED:${command}:${result.stderr || result.stdout}`,
    );
  }
  return result;
}

function inspectValue(format) {
  return mustRun('docker', [
    'inspect',
    '--format',
    format,
    container,
  ]).stdout.trim();
}

function psqlScalar(sql) {
  const result = run('docker', [
    'exec',
    '-i',
    container,
    'psql',
    '-X',
    '-qAt',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    database,
    '-c',
    sql,
  ]);
  if (result.status !== 0) {
    throw new Error(`RC04_STORAGE_DB_QUERY_FAILED:${result.stderr}`);
  }
  return result.stdout.trim();
}

function psqlExec(sql) {
  const result = run('docker', [
    'exec',
    '-i',
    container,
    'psql',
    '-X',
    '-q',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    database,
    '-c',
    sql,
  ]);
  if (result.status !== 0) {
    throw new Error(`RC04_STORAGE_DB_EXEC_FAILED:${result.stderr}`);
  }
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function token(role, sub, seconds = 600) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    role,
    ...(sub ? { sub } : {}),
    exp: Math.floor(Date.now() / 1000) + seconds,
  }));
  const signature = crypto
    .createHmac('sha256', jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function storageFetchInContainer(path, options = {}) {
  const bodyBase64 = options.body === undefined
    ? undefined
    : Buffer.from(options.body).toString('base64');
  const request = {
    method: options.method ?? 'GET',
    headers: options.headers ?? {},
    ...(bodyBase64 === undefined
      ? {}
      : { body: { base64: bodyBase64 } }),
  };
  const script = `
    const request = ${JSON.stringify(request)};
    if (request.body?.base64) {
      request.body = Buffer.from(request.body.base64, 'base64');
    }
    const response = await fetch(
      ${JSON.stringify(`http://127.0.0.1:5000${path}`)},
      request
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    console.log(JSON.stringify({
      status: response.status,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
      bodyBase64: Buffer.from(bytes).toString('base64')
    }));
  `;
  const result = run('docker', [
    'exec',
    '-i',
    storageName,
    'node',
    '--input-type=module',
    '-e',
    script,
  ]);
  if (result.status !== 0) {
    throw new Error(`RC04_STORAGE_HTTP_FAILED:${result.stderr}`);
  }
  const parsed = JSON.parse(result.stdout.trim());
  return {
    ...parsed,
    bytes: Buffer.from(parsed.bodyBase64, 'base64'),
  };
}

const containerId = inspectValue('{{.Id}}');
const rawEnvironment = JSON.parse(inspectValue('{{json .Config.Env}}'));
const passwordEntry = rawEnvironment.find(value =>
  value.startsWith('POSTGRES_PASSWORD='));
if (!passwordEntry) {
  throw new Error('RC04_STORAGE_DB_PASSWORD_UNAVAILABLE');
}
const password = passwordEntry.slice('POSTGRES_PASSWORD='.length);
const serviceKey = token('service_role');
const anonKey = token('anon');
const officeJwt = token(
  'authenticated',
  '10101010-1010-4010-8010-101010101010',
);
const operatorJwt = token(
  'authenticated',
  '20202020-2020-4020-8020-202020202020',
);
const viewerJwt = token(
  'authenticated',
  '30303030-3030-4030-8030-303030303030',
);
const foreignJwt = token(
  'authenticated',
  '40404040-4040-4040-8040-404040404040',
);
const seedPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ'
    + 'AAAADUlEQVR42mP8/x8AAusB9Y9Zl2kAAAAASUVORK5CYII=',
  'base64',
);

let started = false;
try {
  mustRun('docker', ['rm', '-f', storageName]);
  const start = run('docker', [
    'run',
    '-d',
    '--name',
    storageName,
    '--network',
    `container:${containerId}`,
    '--tmpfs',
    '/var/lib/storage',
    '-e',
    `ANON_KEY=${anonKey}`,
    '-e',
    `SERVICE_KEY=${serviceKey}`,
    '-e',
    `PGRST_JWT_SECRET=${jwtSecret}`,
    '-e',
    `DATABASE_URL=postgres://postgres:${encodeURIComponent(password)}@127.0.0.1:5432/${database}`,
    '-e',
    'DB_ANON_ROLE=anon',
    '-e',
    'DB_SERVICE_ROLE=service_role',
    '-e',
    'DB_AUTHENTICATED_ROLE=authenticated',
    '-e',
    'STORAGE_BACKEND=file',
    '-e',
    'FILE_STORAGE_BACKEND_PATH=/var/lib/storage',
    '-e',
    'TENANT_ID=rc04-storage-test',
    '-e',
    'REGION=local',
    '-e',
    'GLOBAL_S3_BUCKET=rc04-local',
    '-e',
    'FILE_SIZE_LIMIT=20971520',
    '-e',
    'ENABLE_IMAGE_TRANSFORMATION=false',
    storageImage,
  ]);
  if (start.status !== 0) {
    throw new Error(`RC04_STORAGE_START_FAILED:${start.stderr}`);
  }
  started = true;

  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const probe = run('docker', [
      'exec',
      storageName,
      'wget',
      '-q',
      '-O',
      '-',
      'http://127.0.0.1:5000/status',
    ]);
    if (probe.status === 0) {
      ready = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) {
    const logs = run('docker', ['logs', '--tail', '120', storageName]);
    throw new Error(
      `RC04_STORAGE_NOT_READY:${logs.stdout}:${logs.stderr}`,
    );
  }

  const status = storageFetchInContainer('/status');
  if (status.status !== 200) {
    throw new Error(`RC04_STORAGE_STATUS_FAILED:${status.status}`);
  }

  if (storagePolicyMode === 'qa_uat_compat') {
    psqlExec(`
      CREATE POLICY wos_guard_test_authenticated_allow_all
      ON storage.objects AS PERMISSIVE FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
    `);
    const authId = 'WOS-V1-PRODUCTION-M2-QA-UAT-013';
    const organizationId = '0ff53d93-2b9e-48b9-8113-a4768c39cdd2';
    const orderId = psqlScalar(`
      SELECT id::text
      FROM public.wos_production_orders
      WHERE organization_id = '${organizationId}'
      ORDER BY created_at, id
      LIMIT 1
    `);
    if (!orderId) {
      throw new Error('WOS_QA_UAT_STORAGE_ORDER_FIXTURE_MISSING');
    }
    const officeProfileId = '11111111-1111-4111-8111-111111111111';
    const operatorProfileId = '22222222-2222-4222-8222-222222222222';
    const viewerProfileId = '33333333-3333-4333-8333-333333333333';
    const foreignProfileId = '44444444-4444-4444-8444-444444444444';
    const categories = [
      ['PRODUCT', 'product'],
      ['FILM_PATTERN', 'film-pattern'],
      ['CUSTOMER_APPROVED_SAMPLE', 'customer-approved-sample'],
      ['SIGNED_SAMPLE', 'signed-sample'],
    ];
    const imageIds = [
      'a1000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000003',
      'a1000000-0000-4000-8000-000000000004',
    ];
    const pathFor = (versionLabel, categorySlug, imageId, filename = 'source.png') =>
      `organizations/${organizationId}/wos/production-order/${orderId}`
        + `/images/${categorySlug}/versions/${versionLabel}/${imageId}/${filename}`;
    const currentPaths = categories.map(([, slug], index) =>
      pathFor('V2', slug, imageIds[index]));
    const imageIdArrayLiteral =
      `ARRAY[${imageIds.map(id => `'${id}'::uuid`).join(',')}]`;
    const oldImageId = 'a1000000-0000-4000-8000-000000000005';
    const oldPath = pathFor(
      'V1',
      'product',
      oldImageId,
    );
    const encodedObjectPath = objectName =>
      objectName.split('/').map(encodeURIComponent).join('/');
    const upload = (
      jwt,
      objectName,
      bytes = seedPng,
      contentType = 'image/png',
    ) =>
      storageFetchInContainer(
        `/object/wos-private/${encodedObjectPath(objectName)}`,
        {
          method: 'POST',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${jwt}`,
            'Content-Type': contentType,
          },
          body: bytes,
        },
      );
    const expectUpload = (label, response) => {
      if (![200, 201].includes(response.status)) {
        throw new Error(
          `WOS_QA_UAT_UPLOAD_${label}_DENIED:${response.status}:`
          + response.bytes.toString(),
        );
      }
    };
    const expectUploadDenied = (label, response) => {
      if (![400, 401, 403].includes(response.status)) {
        throw new Error(
          `WOS_QA_UAT_UPLOAD_${label}_NOT_DENIED:${response.status}`,
        );
      }
    };
    const download = (jwt, objectName) =>
      storageFetchInContainer(
        `/object/authenticated/wos-private/${encodedObjectPath(objectName)}`,
        {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${jwt}`,
          },
        },
      );
    const expectRead = (label, response, expectedDigest) => {
      if (response.status !== 200) {
        throw new Error(
          `WOS_QA_UAT_READ_${label}_DENIED:${response.status}:`
          + response.bytes.toString(),
        );
      }
      const digest = crypto.createHash('sha256')
        .update(response.bytes)
        .digest('hex');
      if (digest !== expectedDigest) {
        throw new Error(`WOS_QA_UAT_READ_${label}_BYTES_MISMATCH`);
      }
    };
    const expectReadDenied = (label, response) => {
      if (![400, 401, 403, 404].includes(response.status)) {
        throw new Error(
          `WOS_QA_UAT_READ_${label}_NOT_DENIED:${response.status}`,
        );
      }
    };
    const setOrderState = (workflowStatus, versionLabel = 'V2') =>
      psqlExec(`
        ALTER TABLE public.wos_production_orders
          DISABLE TRIGGER USER;
        UPDATE public.wos_production_orders
        SET workflow_status = '${workflowStatus}',
            version = 5,
            version_label = '${versionLabel}',
            created_by_profile_id = '${officeProfileId}',
            sales_owner_profile_id = '${officeProfileId}'
        WHERE id = '${orderId}';
        ALTER TABLE public.wos_production_orders
          ENABLE TRIGGER USER;
      `);
    const setGateState = (dbState, edgeState) =>
      psqlExec(`
        UPDATE wos_v1_qa_uat.closeout_controls
        SET db_state = '${dbState}',
            edge_state = '${edgeState}',
            db_closed_at = CASE WHEN '${dbState}' = 'CLOSED'
              THEN clock_timestamp() ELSE NULL END,
            edge_closed_at = CASE WHEN '${edgeState}' = 'CLOSED'
              THEN clock_timestamp() ELSE NULL END,
            db_last_heartbeat_at = clock_timestamp(),
            edge_last_heartbeat_at = clock_timestamp()
        WHERE authorization_id = '${authId}';
      `);
    const refreshGateHeartbeat = () =>
      psqlExec(`
        UPDATE wos_v1_qa_uat.closeout_controls
        SET db_last_heartbeat_at = clock_timestamp(),
            edge_last_heartbeat_at = clock_timestamp()
        WHERE authorization_id = '${authId}';
      `);

    psqlExec(`
      ALTER TABLE public.wos_production_orders
        DISABLE TRIGGER USER;
      UPDATE public.wos_production_orders
      SET organization_id = '${organizationId}',
          workflow_status = 'NEEDS_INFORMATION',
          version = 5,
          version_label = 'V2',
          created_by_profile_id = '${officeProfileId}',
          sales_owner_profile_id = '${officeProfileId}'
      WHERE id = '${orderId}';
      ALTER TABLE public.wos_production_orders
        ENABLE TRIGGER USER;
      DELETE FROM wos_v1_qa_uat.closeout_controls
      WHERE authorization_id = '${authId}';
      WITH control_time AS (
        SELECT clock_timestamp() AS opened_at
      )
      INSERT INTO wos_v1_qa_uat.closeout_controls(
        execution_id,
        authorization_id,
        project_ref,
        code_sha256,
        arm_token,
        opened_at,
        write_deadline_at,
        db_cleanup_deadline_at,
        edge_cleanup_deadline_at,
        authorized_order_id,
        authorized_organization_id,
        authorized_actor_profile_id,
        authorized_order_number,
        db_last_heartbeat_at,
        edge_last_heartbeat_at,
        edge_process_nonce
      )
      SELECT
        'a2000000-0000-4000-8000-000000000001',
        '${authId}',
        'xulmpqaknlwqqculbsek',
        repeat('a',64),
        'a2000000-0000-4000-8000-000000000002',
        control_time.opened_at,
        control_time.opened_at + interval '480 seconds',
        control_time.opened_at + interval '540 seconds',
        control_time.opened_at + interval '840 seconds',
        '${orderId}',
        '${organizationId}',
        '${officeProfileId}',
        'QA-NONPROD-STORAGE-COMPAT',
        control_time.opened_at,
        control_time.opened_at,
        'a2000000-0000-4000-8000-000000000003'
      FROM control_time;
    `);

    const uploadedDigests = new Map();
    for (const [index, objectName] of currentPaths.entries()) {
      const bytes = Buffer.concat([seedPng, Buffer.from([index + 1])]);
      refreshGateHeartbeat();
      expectUpload(
        `OFFICE_${categories[index][0]}`,
        upload(officeJwt, objectName, bytes),
      );
      uploadedDigests.set(
        objectName,
        crypto.createHash('sha256').update(bytes).digest('hex'),
      );
    }
    expectUploadDenied(
      'VIEWER',
      upload(
        viewerJwt,
        pathFor(
          'V2',
          'product',
          'a1000000-0000-4000-8000-000000000010',
        ),
      ),
    );
    expectUploadDenied(
      'ANON',
      upload(
        anonKey,
        pathFor(
          'V2',
          'product',
          'a1000000-0000-4000-8000-0000000000a1',
        ),
      ),
    );
    expectUploadDenied(
      'OPERATOR',
      upload(
        operatorJwt,
        pathFor(
          'V2',
          'product',
          'a1000000-0000-4000-8000-000000000011',
        ),
      ),
    );
    expectUploadDenied(
      'CROSS_ORG',
      upload(
        foreignJwt,
        pathFor(
          'V2',
          'product',
          'a1000000-0000-4000-8000-000000000012',
        ),
      ),
    );
    expectUploadDenied(
      'OLD_VERSION',
      upload(
        officeJwt,
        pathFor(
          'V1',
          'product',
          'a1000000-0000-4000-8000-000000000013',
        ),
      ),
    );
    expectUploadDenied(
      'WRONG_CATEGORY',
      upload(
        officeJwt,
        pathFor(
          'V2',
          'other',
          'a1000000-0000-4000-8000-000000000014',
        ),
      ),
    );
    expectUploadDenied(
      'WRONG_FILENAME',
      upload(
        officeJwt,
        pathFor(
          'V2',
          'product',
          'a1000000-0000-4000-8000-000000000015',
          'upload.png',
        ),
      ),
    );
    expectUploadDenied(
      'WRONG_MIME',
      upload(
        officeJwt,
        pathFor(
          'V2',
          'product',
          'a1000000-0000-4000-8000-000000000018',
        ),
        seedPng,
        'image/jpeg',
      ),
    );
    setOrderState('WAITING_MATERIAL');
    expectUploadDenied(
      'WRONG_STATUS',
      upload(
        officeJwt,
        pathFor(
          'V2',
          'product',
          'a1000000-0000-4000-8000-000000000016',
        ),
      ),
    );
    setOrderState('NEEDS_INFORMATION');

    const digestValues = [...uploadedDigests.entries()]
      .map(([objectName, digest]) =>
        `('${objectName.replaceAll("'", "''")}', '${digest}')`)
      .join(',');
    psqlExec(`
      ALTER TABLE public.wos_reference_images
        DISABLE TRIGGER USER;
      ALTER TABLE public.wos_qa_trusted_proof_receipts
        DISABLE TRIGGER USER;
      INSERT INTO public.wos_reference_images(
        id,
        organization_id,
        entity_type,
        entity_id,
        category,
        version_label,
        image_status,
        storage_bucket,
        storage_path,
        file_name,
        mime_type,
        file_size,
        uploaded_by_profile_id
      )
      SELECT
        (${imageIdArrayLiteral})[value.ordinal],
        '${organizationId}',
        'PRODUCTION_ORDER',
        '${orderId}',
        value.category,
        'V2',
        'READY',
        'wos-private',
        object.name,
        'source.png',
        'image/png',
        (object.metadata->>'size')::bigint,
        '${officeProfileId}'
      FROM (
        VALUES
          ${categories.map(([category, slug], index) =>
            `(${index + 1}, '${category}', '${slug}')`).join(',\n          ')}
      ) value(ordinal, category, slug)
      JOIN storage.objects object
        ON object.bucket_id = 'wos-private'
        AND object.name LIKE
          'organizations/${organizationId}/wos/production-order/${orderId}'
          || '/images/' || value.slug
          || '/versions/V2/%/source.png';
      INSERT INTO public.wos_qa_trusted_proof_receipts(
        request_id,
        organization_id,
        order_id,
        image_id,
        actor_user_id,
        actor_profile_id,
        expected_version,
        payload_fingerprint,
        proof_status,
        after_sha256,
        storage_object_id,
        storage_object_version,
        storage_object_updated_at,
        result_json,
        created_at
      )
      SELECT
        ('a3000000-0000-4000-8000-00000000000'
          || value.ordinal)::uuid,
        '${organizationId}',
        '${orderId}',
        image.id,
        '10101010-1010-4010-8010-101010101010',
        '${officeProfileId}',
        5,
        repeat('b',64),
        'VERIFIED',
        digest.digest,
        object.id,
        object.version,
        object.updated_at,
        jsonb_build_object(
          'expiresAt',clock_timestamp() + interval '600 seconds'
        ),
        clock_timestamp()
      FROM public.wos_reference_images image
      JOIN storage.objects object
        ON object.name = image.storage_path
      JOIN (
        VALUES ${digestValues}
      ) digest(path, digest)
        ON digest.path = image.storage_path
      JOIN (
        VALUES
          ${categories.map(([category], index) =>
            `(${index + 1}, '${category}')`).join(',\n          ')}
      ) value(ordinal, category)
        ON value.category = image.category;
      ALTER TABLE public.wos_qa_trusted_proof_receipts
        ENABLE TRIGGER USER;
      ALTER TABLE public.wos_reference_images
        ENABLE TRIGGER USER;
    `);

    const oldBytes = Buffer.concat([seedPng, Buffer.from([0x51])]);
    const oldUpload = storageFetchInContainer(
      `/object/wos-private/${encodedObjectPath(oldPath)}`,
      {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'image/png',
        },
        body: oldBytes,
      },
    );
    expectUpload('SERVICE_OLD_VERSION_SEED', oldUpload);
    psqlExec(`
      ALTER TABLE public.wos_reference_images
        DISABLE TRIGGER USER;
      ALTER TABLE public.wos_qa_trusted_proof_receipts
        DISABLE TRIGGER USER;
      INSERT INTO public.wos_reference_images(
        id,
        organization_id,
        entity_type,
        entity_id,
        category,
        version_label,
        image_status,
        storage_bucket,
        storage_path,
        file_name,
        mime_type,
        file_size,
        uploaded_by_profile_id
      )
      SELECT
        '${oldImageId}',
        '${organizationId}',
        'PRODUCTION_ORDER',
        '${orderId}',
        'PRODUCT',
        'V1',
        'SUPERSEDED',
        'wos-private',
        object.name,
        'source.png',
        'image/png',
        (object.metadata->>'size')::bigint,
        '${officeProfileId}'
      FROM storage.objects object
      WHERE object.bucket_id = 'wos-private'
        AND object.name = '${oldPath}';
      ALTER TABLE public.wos_qa_trusted_proof_receipts
        ENABLE TRIGGER USER;
      ALTER TABLE public.wos_reference_images
        ENABLE TRIGGER USER;
    `);

    setOrderState('WAITING_MATERIAL');
    for (const [index, objectName] of currentPaths.entries()) {
      refreshGateHeartbeat();
      expectRead(
        `OPERATOR_WAITING_MATERIAL_${categories[index][0]}`,
        download(operatorJwt, objectName),
        uploadedDigests.get(objectName),
      );
    }
    expectReadDenied('VIEWER', download(viewerJwt, currentPaths[0]));
    expectReadDenied('ANON', download(anonKey, currentPaths[0]));
    expectReadDenied('CROSS_ORG', download(foreignJwt, currentPaths[0]));
    expectReadDenied('OLD_VERSION', download(operatorJwt, oldPath));

    psqlExec(`
      ALTER TABLE public.wos_qa_trusted_proof_receipts
        DISABLE TRIGGER USER;
      UPDATE public.wos_qa_trusted_proof_receipts
      SET created_at = clock_timestamp() - interval '601 seconds'
      WHERE image_id = '${imageIds[0]}';
      ALTER TABLE public.wos_qa_trusted_proof_receipts
        ENABLE TRIGGER USER;
    `);
    expectReadDenied('EXPIRED_PROOF', download(operatorJwt, currentPaths[0]));
    psqlExec(`
      ALTER TABLE public.wos_qa_trusted_proof_receipts
        DISABLE TRIGGER USER;
      UPDATE public.wos_qa_trusted_proof_receipts
      SET created_at = clock_timestamp()
      WHERE image_id = '${imageIds[0]}';
      ALTER TABLE public.wos_qa_trusted_proof_receipts
        ENABLE TRIGGER USER;
      ALTER TABLE public.wos_reference_images
        DISABLE TRIGGER USER;
      UPDATE public.wos_reference_images
      SET image_status = 'SUPERSEDED',
          superseded_at = clock_timestamp()
      WHERE id = '${imageIds[1]}';
      ALTER TABLE public.wos_reference_images
        ENABLE TRIGGER USER;
    `);
    expectReadDenied(
      'SUPERSEDED_IMAGE',
      download(operatorJwt, currentPaths[1]),
    );
    psqlExec(`
      ALTER TABLE public.wos_reference_images
        DISABLE TRIGGER USER;
      UPDATE public.wos_reference_images
      SET image_status = 'READY',
          superseded_at = NULL
      WHERE id = '${imageIds[1]}';
      ALTER TABLE public.wos_reference_images
        ENABLE TRIGGER USER;
    `);
    setGateState('CLOSED', 'CLOSED');
    setOrderState('NEEDS_INFORMATION');
    expectUploadDenied(
      'GATE_CLOSED',
      upload(
        officeJwt,
        pathFor(
          'V2',
          'product',
          'a1000000-0000-4000-8000-000000000017',
        ),
      ),
    );
    setOrderState('WAITING_MATERIAL');
    expectReadDenied(
      'OPERATOR_GATE_CLOSED',
      download(operatorJwt, currentPaths[2]),
    );
    expectReadDenied(
      'OFFICE_GATE_CLOSED',
      download(officeJwt, currentPaths[2]),
    );
    psqlExec(`
      DROP POLICY wos_guard_test_authenticated_allow_all ON storage.objects;
    `);

    console.log('WOS_V1_QA_UAT_STORAGE_OFFICE_V2_UPLOAD=PASS');
    console.log('WOS_V1_QA_UAT_STORAGE_OPERATOR_WAITING_MATERIAL=PASS');
    console.log('WOS_V1_QA_UAT_STORAGE_OLD_VERSION_AND_PROOF_EXPIRY=PASS');
    console.log('WOS_V1_QA_UAT_STORAGE_GATE_CLOSED_DENIAL=PASS');
    console.log('WOS_V1_QA_UAT_STORAGE_POLICY_COMPOSITION=PASS');
  } else {

  const fixture = JSON.parse(psqlScalar(`
    SELECT jsonb_build_object(
      'orderId', ord.id,
      'currentPaths', (
        SELECT jsonb_agg(object.name ORDER BY object.name)
        FROM storage.objects object
        WHERE object.bucket_id = 'wos-private'
          AND object.name LIKE
            'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2'
            || '/wos/production-order/' || ord.id
            || '/images/%/versions/V2/%/source.png'
      ),
      'oldPath', (
        SELECT object.name
        FROM storage.objects object
        WHERE object.bucket_id = 'wos-private'
          AND object.name LIKE
            'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2'
            || '/wos/production-order/' || ord.id
            || '/images/%/versions/V1/%/source.png'
        ORDER BY object.name
        LIMIT 1
      ),
      'nonWosPath', (
        SELECT object.name
        FROM storage.objects object
        WHERE object.bucket_id = 'commercial-quotation-item-images'
        ORDER BY object.name
        LIMIT 1
      )
    )::text
    FROM public.wos_production_orders ord
    WHERE ord.order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'
  `));
  if (
    fixture.currentPaths?.length !== 4
    || !fixture.oldPath
    || !fixture.nonWosPath
  ) {
    throw new Error('RC04_STORAGE_FIXTURE_PATHS_INVALID');
  }

  psqlExec(`
    DELETE FROM wos_v1_rc02_safety.rc02_business_grants
    WHERE created_order_id = '${fixture.orderId}';
    INSERT INTO wos_v1_rc02_safety.rc02_business_grants(
      authorization_id, request_id, organization_id,
      office_user_id, office_profile_id,
      operator_user_id, operator_profile_id,
      order_number, customer_id, project_id,
      create_payload_fingerprint, state, created_order_id,
      enabled_until, approval_reference, created_at, bound_at
    )
    SELECT
      'WOS-V1-RC04-STORAGE-API',
      '74600000-0000-4000-8000-000000000001',
      ord.organization_id,
      '10101010-1010-4010-8010-101010101010',
      '11111111-1111-4111-8111-111111111111',
      '20202020-2020-4020-8020-202020202020',
      '22222222-2222-4222-8222-222222222222',
      ord.order_number,
      ord.customer_id,
      ord.project_id,
      repeat('d', 64),
      'ORDER_BOUND',
      ord.id,
      clock_timestamp() + interval '10 minutes',
      'RC04-STORAGE-API-LOCAL-TEST',
      clock_timestamp(),
      clock_timestamp()
    FROM public.wos_production_orders ord
    WHERE ord.id = '${fixture.orderId}';
  `);

  const uploadedBytes = new Map();
  const encodedObjectPath = objectName =>
    objectName.split('/').map(encodeURIComponent).join('/');
  for (const [index, objectName] of fixture.currentPaths.entries()) {
    const bytes = Buffer.concat([seedPng, Buffer.from([index + 1])]);
    const upload = storageFetchInContainer(
      `/object/wos-private/${encodedObjectPath(objectName)}`,
      {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'image/png',
          'x-upsert': 'true',
        },
        body: bytes,
      },
    );
    if (![200, 201].includes(upload.status)) {
      throw new Error(
        `RC04_STORAGE_UPLOAD_FAILED:${upload.status}:${upload.bytes.toString()}`,
      );
    }
    uploadedBytes.set(
      objectName,
      crypto.createHash('sha256').update(bytes).digest('hex'),
    );
  }

  const digestValues = [...uploadedBytes.entries()]
    .map(([objectName, digest]) =>
      `('${objectName.replaceAll("'", "''")}', '${digest}')`)
    .join(',');
  psqlExec(`
    ALTER TABLE storage.objects DISABLE TRIGGER USER;
    UPDATE storage.objects object
    SET owner_id = '10101010-1010-4010-8010-101010101010',
        owner = '10101010-1010-4010-8010-101010101010'
    WHERE object.bucket_id = 'wos-private'
      AND object.name IN (
        SELECT path FROM (VALUES ${digestValues}) value(path, digest)
      );
    ALTER TABLE public.wos_verified_image_proofs DISABLE TRIGGER USER;
    ALTER TABLE public.wos_qa_verified_image_proofs DISABLE TRIGGER USER;
    UPDATE public.wos_verified_image_proofs proof
    SET storage_object_id = object.id,
        storage_object_version = object.version,
        storage_object_updated_at = object.updated_at,
        actor_user_id = '10101010-1010-4010-8010-101010101010',
        verified_sha256 = digest.digest,
        verified_at = clock_timestamp(),
        expires_at = clock_timestamp() + interval '10 minutes'
    FROM storage.objects object,
      (VALUES ${digestValues}) digest(path, digest)
    WHERE object.bucket_id = 'wos-private'
      AND object.name = digest.path
      AND proof.storage_path = object.name
      AND proof.order_id = '${fixture.orderId}';
    UPDATE public.wos_qa_verified_image_proofs proof
    SET storage_object_id = object.id,
        storage_object_version = object.version,
        storage_object_updated_at = object.updated_at,
        actor_user_id = '10101010-1010-4010-8010-101010101010',
        verified_sha256 = digest.digest,
        verified_at = clock_timestamp(),
        expires_at = clock_timestamp() + interval '10 minutes'
    FROM storage.objects object,
      (VALUES ${digestValues}) digest(path, digest)
    WHERE object.bucket_id = 'wos-private'
      AND object.name = digest.path
      AND proof.storage_path = object.name
      AND proof.order_id = '${fixture.orderId}';
    ALTER TABLE public.wos_qa_verified_image_proofs ENABLE TRIGGER USER;
    ALTER TABLE public.wos_verified_image_proofs ENABLE TRIGGER USER;
    ALTER TABLE storage.objects ENABLE TRIGGER USER;
  `);

  const nonWosBytes = Buffer.concat([seedPng, Buffer.from([0xff])]);
  const nonWosUpload = storageFetchInContainer(
    `/object/commercial-quotation-item-images/${encodedObjectPath(fixture.nonWosPath)}`,
    {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'image/png',
        'x-upsert': 'true',
      },
      body: nonWosBytes,
    },
  );
  if (![200, 201].includes(nonWosUpload.status)) {
    throw new Error(
      `RC04_NON_WOS_STORAGE_UPLOAD_FAILED:${nonWosUpload.status}:${nonWosUpload.bytes.toString()}`,
    );
  }
  uploadedBytes.set(
    fixture.nonWosPath,
    crypto.createHash('sha256').update(nonWosBytes).digest('hex'),
  );

  const download = (
    jwt,
    objectName,
    bucket = 'wos-private',
  ) => storageFetchInContainer(
    `/object/authenticated/${bucket}/${encodedObjectPath(objectName)}`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${jwt}`,
      },
    },
  );
  const setOrderStatus = workflowStatus => psqlExec(`
    ALTER TABLE public.wos_production_orders
      DISABLE TRIGGER rc02_order_update_guard;
    UPDATE public.wos_production_orders
    SET workflow_status = '${workflowStatus}'
    WHERE id = '${fixture.orderId}';
    ALTER TABLE public.wos_production_orders
      ENABLE TRIGGER rc02_order_update_guard;
  `);
  const expectRead = (label, response, objectName) => {
    if (response.status !== 200) {
      throw new Error(
        `RC04_OPERATOR_${label}_DENIED:${response.status}:${response.bytes.toString()}`,
      );
    }
    const digest = crypto.createHash('sha256')
      .update(response.bytes)
      .digest('hex');
    if (digest !== uploadedBytes.get(objectName)) {
      throw new Error(`RC04_OPERATOR_${label}_BYTES_MISMATCH`);
    }
  };
  const expectDenied = (label, response) => {
    if (![400, 401, 403, 404].includes(response.status)) {
      throw new Error(`RC04_STORAGE_${label}_NOT_DENIED:${response.status}`);
    }
  };

  for (const workflowStatus of [
    'SUBMITTED',
    'WORKSHOP_REVIEW',
    'NEEDS_INFORMATION',
    'WAITING_MATERIAL',
  ]) {
    setOrderStatus(workflowStatus);
    for (const objectName of fixture.currentPaths) {
      expectRead(
        `READ_${workflowStatus}`,
        download(operatorJwt, objectName),
        objectName,
      );
    }
  }

  expectDenied('VIEWER', download(viewerJwt, fixture.currentPaths[0]));
  expectDenied('CROSS_ORG', download(foreignJwt, fixture.currentPaths[0]));
  expectDenied('OLD_VERSION', download(operatorJwt, fixture.oldPath));
  expectDenied(
    'NON_WOS_OPERATOR',
    download(
      operatorJwt,
      fixture.nonWosPath,
      'commercial-quotation-item-images',
    ),
  );
  expectDenied(
    'NON_WOS_VIEWER',
    download(
      viewerJwt,
      fixture.nonWosPath,
      'commercial-quotation-item-images',
    ),
  );
  expectRead(
    'COMMERCIAL_POLICY_OFFICE_ADMIN',
    download(
      officeJwt,
      fixture.nonWosPath,
      'commercial-quotation-item-images',
    ),
    fixture.nonWosPath,
  );

  const expiredPath = fixture.currentPaths[0];
  psqlExec(`
    ALTER TABLE public.wos_verified_image_proofs DISABLE TRIGGER USER;
    UPDATE public.wos_verified_image_proofs
    SET verified_at = clock_timestamp() - interval '20 minutes',
        expires_at = clock_timestamp() - interval '10 minutes'
    WHERE order_id = '${fixture.orderId}' AND storage_path = '${expiredPath}';
    ALTER TABLE public.wos_verified_image_proofs ENABLE TRIGGER USER;
  `);
  expectDenied('EXPIRED_PROOF', download(operatorJwt, expiredPath));
  psqlExec(`
    ALTER TABLE public.wos_verified_image_proofs DISABLE TRIGGER USER;
    UPDATE public.wos_verified_image_proofs
    SET verified_at = clock_timestamp(),
        expires_at = clock_timestamp() + interval '10 minutes'
    WHERE order_id = '${fixture.orderId}' AND storage_path = '${expiredPath}';
    ALTER TABLE public.wos_verified_image_proofs ENABLE TRIGGER USER;
  `);

  const supersededPath = fixture.currentPaths[1];
  psqlExec(`
    ALTER TABLE public.wos_reference_images
      DISABLE TRIGGER rc02_reference_image_guard;
    UPDATE public.wos_reference_images
    SET superseded_at = clock_timestamp()
    WHERE entity_id = '${fixture.orderId}'
      AND storage_path = '${supersededPath}';
    ALTER TABLE public.wos_reference_images
      ENABLE TRIGGER rc02_reference_image_guard;
  `);
  expectDenied('SUPERSEDED_IMAGE', download(operatorJwt, supersededPath));
  psqlExec(`
    ALTER TABLE public.wos_reference_images
      DISABLE TRIGGER rc02_reference_image_guard;
    UPDATE public.wos_reference_images
    SET superseded_at = NULL
    WHERE entity_id = '${fixture.orderId}'
      AND storage_path = '${supersededPath}';
    ALTER TABLE public.wos_reference_images
      ENABLE TRIGGER rc02_reference_image_guard;
  `);

  const driftedPath = fixture.currentPaths[2];
  const originalVersion = psqlScalar(`
    SELECT version FROM storage.objects
    WHERE bucket_id = 'wos-private' AND name = '${driftedPath}'
  `);
  psqlExec(`
    ALTER TABLE storage.objects DISABLE TRIGGER USER;
    UPDATE storage.objects
    SET version = '${originalVersion}-rc04-drift'
    WHERE bucket_id = 'wos-private' AND name = '${driftedPath}';
    ALTER TABLE storage.objects ENABLE TRIGGER USER;
  `);
  expectDenied('WRONG_STORAGE_VERSION', download(operatorJwt, driftedPath));
  psqlExec(`
    ALTER TABLE storage.objects DISABLE TRIGGER USER;
    UPDATE storage.objects
    SET version = '${originalVersion}'
    WHERE bucket_id = 'wos-private' AND name = '${driftedPath}';
    ALTER TABLE storage.objects ENABLE TRIGGER USER;
    UPDATE wos_v1_rc02_safety.rc02_business_grants
    SET state = 'CLOSED',
        enabled_until = NULL,
        closed_at = clock_timestamp()
    WHERE authorization_id = 'WOS-V1-RC04-STORAGE-API';
  `);
  expectDenied('GATE_OFF', download(operatorJwt, fixture.currentPaths[3]));
  expectRead(
    'OFFICE_ADMIN_AFTER_GATE_OFF',
    download(officeJwt, fixture.currentPaths[3]),
    fixture.currentPaths[3],
  );

  psqlExec(`
    DELETE FROM wos_v1_rc02_safety.rc02_business_grants
    WHERE authorization_id = 'WOS-V1-RC04-STORAGE-API';
  `);
  console.log('WOS_V1_RC04_STORAGE_API_START=PASS');
  console.log('WOS_V1_RC04_OPERATOR_STORAGE_RLS_COMPOSITION=PASS');
  console.log('WOS_V1_RC04_STORAGE_BYTE_DOWNLOADS=PASS');
  console.log('WOS_V1_RC04_STORAGE_NEGATIVE_MATRIX=PASS');
  console.log('WOS_V1_RC04_OFFICE_PRIVATE_STORAGE_ACCESS=PASS');
  console.log('WOS_V1_RC04_NON_WOS_STORAGE_SCOPE=PASS');
  }
} finally {
  if (started) {
    run('docker', ['rm', '-f', storageName]);
  }
}
