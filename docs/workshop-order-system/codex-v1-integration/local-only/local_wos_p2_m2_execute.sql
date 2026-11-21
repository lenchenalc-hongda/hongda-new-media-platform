-- LOCAL EPHEMERAL TEST STACK ONLY. Never apply to cloud QA or Production.
GRANT EXECUTE ON FUNCTION public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)
  TO authenticated;
