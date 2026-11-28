-- The wrapper remains installed and granted, but all Gate rows are CLOSED.
SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_v1_qa_uat_m2_action(
      'WOS-V1-PRODUCTION-M2-QA-UAT-013',
      '33333333-3333-4333-8333-333333333333',
      23,
      '76000000-0000-4000-8000-000000000001',
      'MATERIAL_RECORD',
      jsonb_build_object(
        'productionVersionLabel','V1',
        'note','Independently closed Gate must deny the wrapper.',
        'resourceType','FILM',
        'resourceStatus','ARRIVED',
        'expectedAt',NULL,
        'arrivedAt',clock_timestamp()-interval '2 minutes',
        'quantityExpected',NULL,
        'quantityArrived',NULL,
        'physicalCheckAttested',true
      )
    );
    RAISE EXCEPTION 'QA_UAT_CLOSED_GATE_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM<>'QA_UAT_M2_GATE_CLOSED'
      AND SQLERRM NOT LIKE 'permission denied for function%'
    THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

SELECT 'WOS_V1_PRODUCTION_M2_QA_UAT_CLOSED_GATE_DENIED=PASS';
