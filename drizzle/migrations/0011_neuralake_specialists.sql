-- User-defined specialists executed through NeuraLake. Existing CSV contracts stay unchanged.
CREATE TABLE IF NOT EXISTS public.agent_trials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, definition_hash text NOT NULL,
 task text NOT NULL, artifact_content text NOT NULL, report jsonb NOT NULL, sha256 text NOT NULL,
 duration_ms integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_trials ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.agent_trials TO service_role;
CREATE TABLE IF NOT EXISTS public.agent_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id),
 definition jsonb NOT NULL, definition_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_definitions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.agent_definitions TO service_role;
DROP TRIGGER IF EXISTS agent_definitions_immutable ON public.agent_definitions;
CREATE TRIGGER agent_definitions_immutable BEFORE UPDATE OR DELETE ON public.agent_definitions FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_changes();
CREATE OR REPLACE FUNCTION public.agent_acceptance_criteria(_sections jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT jsonb_build_array(jsonb_build_object('criterion','Formato da entrega','expected','agent.result.v1'),jsonb_build_object('criterion','Seções combinadas','expected',(SELECT '[' || string_agg(to_json(value)::text, ',' ORDER BY ordinality) || ']' FROM jsonb_array_elements_text(_sections) WITH ORDINALITY)),jsonb_build_object('criterion','Conteúdo preenchido','expected',true))
$$;
CREATE OR REPLACE FUNCTION public.studio_create_specialist(_user uuid,_request uuid,_config jsonb,_hash text,_trial uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.a2a_requests; cid uuid:=gen_random_uuid(); cap uuid:=gen_random_uuid();
  offer uuid:=gen_random_uuid(); payload_hash text:=encode(sha256(convert_to(_config::text,'UTF8')),'hex'); result jsonb;
BEGIN
  IF _user IS NULL OR _request IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_user::text||_request::text,0));
  SELECT * INTO prior FROM public.a2a_requests WHERE user_id=_user AND request_id=_request;
  IF prior.request_id IS NOT NULL THEN
    IF prior.purpose<>'company' OR prior.payload_hash<>payload_hash THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN prior.result;
  END IF;
  IF _config->>'capability' IS DISTINCT FROM 'agent.task.v1'
    OR length(btrim(coalesce(_config->>'name','')))<2 OR length(_config->>'name')>70
    OR length(btrim(coalesce(_config->>'description','')))<10 OR length(_config->>'description')>1000
    OR length(btrim(coalesce(_config->>'serviceTitle','')))<4 OR length(_config->>'serviceTitle')>100
    OR coalesce((_config->>'price')::integer,0) NOT BETWEEN 1 AND 1000
  THEN RAISE EXCEPTION 'invalid_company_configuration'; END IF;
  IF length(coalesce(_config->>'instructions','')) NOT BETWEEN 30 AND 8000 OR length(coalesce(_config->>'knowledge',''))>16000
    OR jsonb_typeof(_config->'sections') IS DISTINCT FROM 'array' OR jsonb_array_length(_config->'sections') NOT BETWEEN 1 AND 8
    OR _config->>'model' NOT IN ('text','reasoning','code') THEN RAISE EXCEPTION 'invalid_agent_definition'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.agent_trials WHERE id=_trial AND user_id=_user AND definition_hash=_hash AND report->>'decision'='approved')
    THEN RAISE EXCEPTION 'successful_current_agent_trial_required'; END IF;
  INSERT INTO public.companies(id,owner_user_id,name,slug,description,kind,operational)
  VALUES(cid,_user,_config->>'name','company-'||cid,_config->>'description','ai-specialist',true);
  INSERT INTO public.company_members(company_id,user_id,role) VALUES(cid,_user,'owner');
  INSERT INTO public.accounts(company_id,available_units) VALUES(cid,100);
  INSERT INTO public.ledger_entries(company_id,entry_type,amount_units,idempotency_key,description)
    VALUES(cid,'initial_credit',100,'company:'||cid||':initial','Saldo inicial de demonstração: 100 créditos simulados');
  INSERT INTO public.agents(company_id,name,agent_type,model,instructions) VALUES
    (cid,'Gerente de '||(_config->>'name'),'buyer','reasoning','Escolha fornecedores disponíveis dentro do orçamento autorizado.'),
    (cid,_config->>'name','supplier',_config->>'model',_config->>'instructions');
  INSERT INTO public.capabilities(id,company_id,code,name,description,executor_type,integration_status)
    VALUES(cap,cid,'agent.task.v1',_config->>'serviceTitle',_config->>'description','neuralake_agent_v1','connected');
  INSERT INTO public.offers(id,company_id,capability_id,title,published) VALUES(offer,cid,cap,_config->>'serviceTitle',coalesce(_config->>'visibility','private')='commercial');
  INSERT INTO public.offer_versions(offer_id,version,description,price_units,deadline_hours,acceptance_criteria,revision_limit,cancellation_policy,available,required_inputs,output_format)
  VALUES(offer,1,_config->>'description',(_config->>'price')::integer,1,public.agent_acceptance_criteria(_config->'sections'),1,
    'Uma correção; cancelamento antes da liquidação devolve a reserva.',true,
    '[{"name":"task","type":"string"}]', jsonb_build_object('mime','application/json','category',_config->>'category','sections',_config->'sections','exampleTask',_config->>'exampleTask'));
  UPDATE public.companies SET visibility=coalesce(_config->>'visibility','private') WHERE id=cid;
  INSERT INTO public.agent_definitions(company_id,definition,definition_hash) VALUES(cid,_config,_hash);
  INSERT INTO public.private_runs(company_id,requested_by,request_id,input_hash,artifact_content,sha256,report,duration_ms)
  SELECT cid,_user,_request,definition_hash,artifact_content,sha256,report,duration_ms FROM public.agent_trials WHERE id=_trial;
  result:=jsonb_build_object('companyId',cid,'offerId',offer);
  INSERT INTO public.a2a_requests VALUES(_user,_request,'company',payload_hash,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.studio_create_specialist(uuid,uuid,jsonb,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_create_specialist(uuid,uuid,jsonb,text,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.studio_place_agent_order(_user uuid,_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.a2a_requests; cid uuid:=(_payload->>'buyerCompanyId')::uuid;
  vid uuid:=(_payload->>'offerVersionId')::uuid; rid uuid:=(_payload->>'requestId')::uuid;
  oid uuid:=gen_random_uuid(); v public.offer_versions; f public.offers; cp public.capabilities; def public.agent_definitions;
  payload_hash text:=coalesce(_payload->>'requestHash',encode(sha256(convert_to((_payload-'selectionReason')::text,'UTF8')),'hex')); result jsonb;
BEGIN
  IF _user IS NULL OR rid IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=cid AND owner_user_id=_user)
    THEN RAISE EXCEPTION 'buyer_access_denied'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_user::text||rid::text,0));
  SELECT * INTO prior FROM public.a2a_requests WHERE user_id=_user AND request_id=rid;
  IF prior.request_id IS NOT NULL THEN
    IF prior.purpose<>'order' OR prior.payload_hash<>payload_hash THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN prior.result;
  END IF;
  SELECT * INTO v FROM public.offer_versions WHERE id=vid AND available;
  SELECT * INTO f FROM public.offers WHERE id=v.offer_id AND published AND current_version=v.version;
  SELECT * INTO cp FROM public.capabilities WHERE id=f.capability_id AND code='agent.task.v1'
    AND executor_type='neuralake_agent_v1' AND integration_status='connected';
  SELECT * INTO def FROM public.agent_definitions WHERE company_id=f.company_id;
  IF def.id IS NULL OR v.id IS NULL OR f.id IS NULL OR cp.id IS NULL OR f.company_id=cid
    OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=f.company_id AND operational)
    OR v.acceptance_criteria<>public.agent_acceptance_criteria(def.definition->'sections')
  THEN RAISE EXCEPTION 'offer_unavailable'; END IF;
  IF length(btrim(coalesce(_payload->>'task',''))) NOT BETWEEN 10 AND 12000 OR octet_length(_payload::text)>262144
    OR coalesce((_payload->>'budget')::integer,0) NOT BETWEEN 1 AND 10000 OR length(btrim(coalesce(_payload->>'title','')))<3
    THEN RAISE EXCEPTION 'invalid_order'; END IF;
  _payload:=_payload||jsonb_build_object('capability','agent.task.v1','definitionId',def.id,'humanReview',true);
  INSERT INTO public.orders(id,buyer_company_id,offer_id,title,brief,budget_cap_units)
    VALUES(oid,cid,f.id,left(_payload->>'title',120),_payload,(_payload->>'budget')::integer);
  PERFORM public.reserve_demo_order(oid,vid,'order:'||oid||':reservation');
  UPDATE public.orders SET selected_reason=left(coalesce(_payload->>'selectionReason','Oferta compatível com o orçamento autorizado.'),1000) WHERE id=oid;
  result:=jsonb_build_object('orderId',oid,'status','contracted');
  INSERT INTO public.a2a_requests VALUES(_user,rid,'order',payload_hash,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.studio_place_agent_order(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_place_agent_order(uuid,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.studio_claim_execution(_user uuid,_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; c public.contracts; j public.jobs; token uuid:=gen_random_uuid();
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=_order FOR UPDATE;
  IF o.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=o.buyer_company_id AND owner_user_id=_user)
    THEN RAISE EXCEPTION 'order_access_denied'; END IF;
  IF o.status IN ('settled','cancelled','expired','accepted') THEN RETURN jsonb_build_object('status',o.status); END IF;
  SELECT * INTO c FROM public.contracts WHERE order_id=o.id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'contract_required'; END IF;
  IF now()>c.deadline_at THEN RAISE EXCEPTION 'deadline_expired'; END IF;
  IF o.current_delivery_version>c.revision_limit THEN RAISE EXCEPTION 'revision_limit_reached'; END IF;
  SELECT * INTO j FROM public.jobs WHERE idempotency_key='execute:'||o.id FOR UPDATE;
  IF j.lease_until>now() THEN RETURN jsonb_build_object('status','in_progress'); END IF;
  INSERT INTO public.jobs(order_id,kind,provider,idempotency_key,status,lease_token,lease_until,started_at)
    VALUES(o.id,coalesce(c.order_data->>'capability','catalogue'),CASE WHEN c.order_data->>'capability'='agent.task.v1' THEN 'neuralake' ELSE 'builtin_catalogue_v1' END,'execute:'||o.id,'running',token,now()+interval '2 minutes',now())
    ON CONFLICT(idempotency_key) DO UPDATE SET status='running',lease_token=token,lease_until=now()+interval '2 minutes',error_message=NULL;
  UPDATE public.orders SET status='in_progress',updated_at=now() WHERE id=o.id;
  INSERT INTO public.order_events(order_id,actor_type,actor_label,event_type,result)
    VALUES(o.id,'agent','Agente fornecedor','execution_started','O fornecedor recebeu o pedido estruturado e iniciou a execução.');
  RETURN jsonb_build_object('status','claimed','token',token,'version',o.current_delivery_version+1,'input',c.order_data,'criteria',c.acceptance_criteria);
END $$;

CREATE OR REPLACE FUNCTION public.studio_record_agent_delivery(_order uuid,_token uuid,_content text,_report jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; j public.jobs; d uuid:=gen_random_uuid(); version integer; digest text;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=_order FOR UPDATE;
  SELECT * INTO j FROM public.jobs WHERE order_id=o.id AND lease_token=_token AND lease_until>now();
  IF o.status<>'in_progress' OR j.id IS NULL THEN RAISE EXCEPTION 'stale_execution'; END IF;
  IF coalesce(octet_length(_content),0) NOT BETWEEN 1 AND 262144 OR coalesce(_report->>'decision','') NOT IN ('approved','rejected')
    OR jsonb_typeof(_report->'checks') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_delivery'; END IF;
  IF NOT EXISTS(SELECT 1 FROM contracts WHERE order_id=o.id AND order_data->>'capability'='agent.task.v1' AND requires_human_review) THEN RAISE EXCEPTION 'agent_contract_required'; END IF;
  version:=o.current_delivery_version+1; digest:=encode(sha256(convert_to(_content,'UTF8')),'hex');
  INSERT INTO public.deliveries(id,order_id,version,submitted_by_company_id,storage_path,file_name,media_type,byte_size,sha256,artifact_content,test_upload,supplier_message)
  VALUES(d,o.id,version,o.supplier_company_id,'inline/'||d,'entrega-v'||version||'.json','application/json',octet_length(_content),digest,_content,
    coalesce((o.brief->>'testFailure')::boolean,false),'Trabalho executado pelo especialista com a NeuraLake.');
  INSERT INTO public.verification_reports(order_id,delivery_id,delivery_version,rules_version,tool_name,checks,decision,summary)
  VALUES(o.id,d,version,'agent-v1','JSON + seções contratadas + SHA-256; qualidade sujeita ao aceite humano',_report->'checks',
    (_report->>'decision')::public.verification_decision,left(_report->>'summary',1000));
  UPDATE public.orders SET current_delivery_version=version,revision_count=version-1,
    status=CASE WHEN _report->>'decision'='approved' THEN 'accepted'::public.order_status ELSE 'revision_requested'::public.order_status END,
    updated_at=now() WHERE id=o.id;
  UPDATE public.jobs SET status='completed',lease_token=NULL,lease_until=NULL,completed_at=now() WHERE id=j.id;
  INSERT INTO public.order_events(order_id,actor_type,actor_label,event_type,result,metadata) VALUES
    (o.id,'agent','Agente fornecedor','delivered','Arquivo da versão '||version||' entregue.',jsonb_build_object('deliveryId',d,'sha256',digest)),
    (o.id,'verifier','Verificador independente',_report->>'decision',left(_report->>'summary',1000),jsonb_build_object('deliveryId',d,'version',version));
  RETURN jsonb_build_object('deliveryId',d,'version',version,'decision',_report->>'decision','sha256',digest);
END $$;

REVOKE ALL ON FUNCTION public.studio_record_agent_delivery(uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_record_agent_delivery(uuid,uuid,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.studio_release_execution(_user uuid,_order uuid,_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders;
BEGIN
 SELECT * INTO o FROM orders WHERE id=_order FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM companies WHERE id=o.buyer_company_id AND owner_user_id=_user) THEN RAISE EXCEPTION 'order_access_denied'; END IF;
 UPDATE jobs SET status='failed',lease_token=NULL,lease_until=NULL,error_message='O provedor não concluiu a execução.' WHERE order_id=o.id AND lease_token=_token;
 IF FOUND AND o.status='in_progress' THEN
  UPDATE orders SET status=CASE WHEN current_delivery_version>0 THEN 'revision_requested'::public.order_status ELSE 'contracted'::public.order_status END WHERE id=o.id;
  INSERT INTO order_events(order_id,actor_type,actor_label,event_type,result) VALUES(o.id,'agent','Agente fornecedor','execution_failed','A execução não foi concluída. A reserva continua vinculada ao pedido e você pode tentar novamente ou cancelar.');
 END IF;
 RETURN jsonb_build_object('status','released');
END $$;
REVOKE ALL ON FUNCTION public.studio_release_execution(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_release_execution(uuid,uuid,uuid) TO service_role;