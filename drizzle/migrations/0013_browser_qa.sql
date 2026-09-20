-- Browser QA reuses contracts, immutable deliveries and the existing simulated ledger.
CREATE TABLE public.browser_workers (
 user_id uuid PRIMARY KEY, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 last_seen_at timestamptz
);
ALTER TABLE public.browser_workers ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.browser_workers TO service_role;
CREATE OR REPLACE FUNCTION public.browser_criteria() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT '[{"criterion":"desktop","expected":true},{"criterion":"mobile","expected":true},{"criterion":"evidence_integrity","expected":true}]'::jsonb
$$;
DO $$ DECLARE i integer; cid uuid; cap uuid; offer uuid; BEGIN
 FOR i IN 1..2 LOOP
 cid:=('00000000-0000-0000-0000-00000000200'||i)::uuid;
 cap:=('00000000-0000-0000-0000-00000000210'||i)::uuid;
 offer:=('00000000-0000-0000-0000-00000000220'||i)::uuid;
 INSERT INTO companies(id,name,slug,description,kind,is_demo,operational,visibility)
 VALUES(cid,CASE WHEN i=1 THEN 'PageCheck' ELSE 'BrowserQA' END,'browser-provider-'||i,'Testes de página executados em Chromium.','browser-qa',true,true,'commercial');
 INSERT INTO accounts(company_id) VALUES(cid);
 INSERT INTO capabilities(id,company_id,code,name,description,executor_type,integration_status)
 VALUES(cap,cid,'browser.qa.v1','Teste de navegador','Desktop e formulário mobile.','playwright_worker_v1','connected');
 INSERT INTO offers(id,company_id,capability_id,title,published) VALUES(offer,cid,cap,CASE WHEN i=1 THEN 'Captura desktop' ELSE 'Formulário em desktop e mobile' END,true);
 INSERT INTO offer_versions(id,offer_id,version,description,price_units,deadline_hours,acceptance_criteria,revision_limit,cancellation_policy,available,output_format)
 VALUES(('00000000-0000-0000-0000-00000000230'||i)::uuid,offer,1,
 CASE WHEN i=1 THEN 'Apenas captura desktop; não testa o formulário mobile.' ELSE 'Testa o formulário nos dois tamanhos e entrega as capturas.' END,
 CASE WHEN i=1 THEN 5 ELSE 15 END,1,public.browser_criteria(),1,'Cancelamento devolve a reserva antes do pagamento.',true,
 jsonb_build_object('desktop',true,'mobile',i=2,'form',i=2));
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.browser_buyer(_user uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid;
BEGIN
 IF _user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('browser-buyer:'||_user,0));
 SELECT id INTO cid FROM companies WHERE owner_user_id=_user AND kind='browser-buyer';
 IF cid IS NOT NULL THEN RETURN cid; END IF;
 cid:=gen_random_uuid();
 INSERT INTO companies(id,owner_user_id,name,slug,description,kind,operational,visibility)
 VALUES(cid,_user,'Meu agente comprador','browser-buyer-'||cid,'Compra testes de navegador dentro do orçamento autorizado.','browser-buyer',true,'private');
 INSERT INTO company_members(company_id,user_id,role) VALUES(cid,_user,'owner');
 INSERT INTO accounts(company_id,available_units) VALUES(cid,100);
 INSERT INTO ledger_entries(company_id,entry_type,amount_units,idempotency_key,description)
 VALUES(cid,'initial_credit',100,'company:'||cid||':initial','Saldo inicial: créditos simulados');
 RETURN cid;
END $$;
REVOKE ALL ON FUNCTION public.browser_buyer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.browser_buyer(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.studio_place_browser_order(_user uuid,_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.a2a_requests; cid uuid:=(_payload->>'buyerCompanyId')::uuid;
  vid uuid:=(_payload->>'offerVersionId')::uuid; rid uuid:=(_payload->>'requestId')::uuid;
  oid uuid:=gen_random_uuid(); v public.offer_versions; f public.offers; cp public.capabilities;
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
  SELECT * INTO cp FROM public.capabilities WHERE id=f.capability_id AND code='browser.qa.v1'
    AND executor_type='playwright_worker_v1' AND integration_status='connected';
  IF v.id IS NULL OR f.id IS NULL OR cp.id IS NULL OR f.company_id=cid
    OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=f.company_id AND operational)
    OR v.acceptance_criteria<>public.browser_criteria()
  THEN RAISE EXCEPTION 'offer_unavailable'; END IF;
  IF vid<>'00000000-0000-0000-0000-000000002302'::uuid OR _payload->>'fixture' IS DISTINCT FROM 'lead-form-v1' OR length(btrim(coalesce(_payload->>'task',''))) NOT BETWEEN 10 AND 12000 OR octet_length(_payload::text)>262144
    OR coalesce((_payload->>'budget')::integer,0) NOT BETWEEN 1 AND 10000 OR length(btrim(coalesce(_payload->>'title','')))<3
    THEN RAISE EXCEPTION 'invalid_order'; END IF;
  _payload:=_payload||jsonb_build_object('capability','browser.qa.v1','humanReview',true);
  INSERT INTO public.orders(id,buyer_company_id,offer_id,title,brief,budget_cap_units)
    VALUES(oid,cid,f.id,left(_payload->>'title',120),_payload,(_payload->>'budget')::integer);
  PERFORM public.reserve_demo_order(oid,vid,'order:'||oid||':reservation');
  UPDATE public.orders SET selected_reason=left(coalesce(_payload->>'selectionReason','Oferta compatível com o orçamento autorizado.'),1000) WHERE id=oid;
  result:=jsonb_build_object('orderId',oid,'status','contracted');
  INSERT INTO public.a2a_requests VALUES(_user,rid,'order',payload_hash,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.studio_place_browser_order(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_place_browser_order(uuid,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.studio_record_browser_delivery(_order uuid,_token uuid,_content text,_report jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; j public.jobs; d uuid:=gen_random_uuid(); version integer; digest text;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=_order FOR UPDATE;
  SELECT * INTO j FROM public.jobs WHERE order_id=o.id AND lease_token=_token AND lease_until>now();
  IF o.status<>'in_progress' OR j.id IS NULL THEN RAISE EXCEPTION 'stale_execution'; END IF;
  IF coalesce(octet_length(_content),0) NOT BETWEEN 1 AND 1048576 OR coalesce(_report->>'decision','') NOT IN ('approved','rejected')
    OR jsonb_typeof(_report->'checks') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_delivery'; END IF;
  IF NOT EXISTS(SELECT 1 FROM contracts WHERE order_id=o.id AND order_data->>'capability'='browser.qa.v1' AND requires_human_review) THEN RAISE EXCEPTION 'agent_contract_required'; END IF;
  version:=o.current_delivery_version+1; digest:=encode(sha256(convert_to(_content,'UTF8')),'hex');
  INSERT INTO public.deliveries(id,order_id,version,submitted_by_company_id,storage_path,file_name,media_type,byte_size,sha256,artifact_content,test_upload,supplier_message)
  VALUES(d,o.id,version,o.supplier_company_id,'inline/'||d,'entrega-v'||version||'.json','application/json',octet_length(_content),digest,_content,
    coalesce((o.brief->>'testFailure')::boolean,false),'Testes executados no Chromium pelo executor autorizado.');
  INSERT INTO public.verification_reports(order_id,delivery_id,delivery_version,rules_version,tool_name,checks,decision,summary)
  VALUES(o.id,d,version,'browser-v1','Evidências desktop/mobile + integridade SHA-256; não certifica ausência de bugs',_report->'checks',
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

REVOKE ALL ON FUNCTION public.studio_record_browser_delivery(uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_record_browser_delivery(uuid,uuid,text,jsonb) TO service_role;

