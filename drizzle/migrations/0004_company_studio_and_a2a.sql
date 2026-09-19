-- Executable catalogue businesses. All payments and initial balances are simulated.
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS artifact_content text
  CHECK (artifact_content IS NULL OR octet_length(artifact_content)<=262144);
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS lease_until timestamptz;

CREATE TABLE public.a2a_requests (
  user_id uuid NOT NULL, request_id uuid NOT NULL, purpose text NOT NULL,
  payload_hash text NOT NULL, result jsonb NOT NULL,
  PRIMARY KEY(user_id,request_id)
);
ALTER TABLE public.a2a_requests ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.a2a_requests TO service_role;
CREATE TABLE public.agent_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id),
  created_by uuid NOT NULL, token_hash text NOT NULL UNIQUE, prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
ALTER TABLE public.agent_credentials ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.agent_credentials TO service_role;

CREATE OR REPLACE FUNCTION public.catalogue_acceptance_criteria() RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT '[
 {"criterion":"Formato CSV","expected":"sku,size,priceCents"},
 {"criterion":"Produtos preservados","expected":true},
 {"criterion":"Preços preservados","expected":true},
 {"criterion":"Identificadores únicos","expected":true}
]'::jsonb $$;

CREATE OR REPLACE FUNCTION public.studio_create_company(_user uuid,_request uuid,_config jsonb)
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
  IF _config->>'capability' IS DISTINCT FROM 'catalog.normalize.v1'
    OR length(btrim(coalesce(_config->>'name','')))<2 OR length(_config->>'name')>70
    OR length(btrim(coalesce(_config->>'description','')))<10 OR length(_config->>'description')>1000
    OR length(btrim(coalesce(_config->>'serviceTitle','')))<4 OR length(_config->>'serviceTitle')>100
    OR coalesce((_config->>'price')::integer,0) NOT BETWEEN 1 AND 1000
  THEN RAISE EXCEPTION 'invalid_company_configuration'; END IF;
  INSERT INTO public.companies(id,owner_user_id,name,slug,description,kind,operational)
  VALUES(cid,_user,_config->>'name','company-'||cid,_config->>'description','catalogue',true);
  INSERT INTO public.company_members(company_id,user_id,role) VALUES(cid,_user,'owner');
  INSERT INTO public.accounts(company_id,available_units) VALUES(cid,100);
  INSERT INTO public.ledger_entries(company_id,entry_type,amount_units,idempotency_key,description)
    VALUES(cid,'initial_credit',100,'company:'||cid||':initial','Saldo inicial de demonstração: 100 créditos simulados');
  INSERT INTO public.agents(company_id,name,agent_type,model,instructions) VALUES
    (cid,'Gerente de '||(_config->>'name'),'buyer','reasoning','Escolha fornecedores disponíveis dentro do orçamento autorizado.'),
    (cid,'Especialista em catálogo','supplier','deterministic','Produza o CSV contratado preservando cada produto e preço.');
  INSERT INTO public.capabilities(id,company_id,code,name,description,executor_type,integration_status)
    VALUES(cap,cid,'catalog.normalize.v1','Padronizar catálogo','Recebe produtos e devolve um CSV verificável.','builtin_catalogue_v1','connected');
  INSERT INTO public.offers(id,company_id,capability_id,title,published) VALUES(offer,cid,cap,_config->>'serviceTitle',true);
  INSERT INTO public.offer_versions(offer_id,version,description,price_units,deadline_hours,acceptance_criteria,revision_limit,cancellation_policy,available,required_inputs,output_format)
  VALUES(offer,1,_config->>'description',(_config->>'price')::integer,1,public.catalogue_acceptance_criteria(),1,
    'Uma correção; cancelamento antes da liquidação devolve a reserva.',true,
    '[{"name":"rows","type":"array","fields":["sku","size","priceCents"]}]', '{"mime":"text/csv","encoding":"UTF-8"}');
  result:=jsonb_build_object('companyId',cid,'offerId',offer);
  INSERT INTO public.a2a_requests VALUES(_user,_request,'company',payload_hash,result);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.studio_place_order(_user uuid,_payload jsonb)
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
  SELECT * INTO cp FROM public.capabilities WHERE id=f.capability_id AND code='catalog.normalize.v1'
    AND executor_type='builtin_catalogue_v1' AND integration_status='connected';
  IF v.id IS NULL OR f.id IS NULL OR cp.id IS NULL OR f.company_id=cid
    OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=f.company_id AND operational)
    OR v.acceptance_criteria<>public.catalogue_acceptance_criteria()
  THEN RAISE EXCEPTION 'offer_unavailable'; END IF;
  IF jsonb_typeof(_payload->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_catalogue'; END IF;
  IF jsonb_array_length(_payload->'rows') NOT BETWEEN 1 AND 500 OR octet_length(_payload::text)>262144
    OR coalesce((_payload->>'budget')::integer,0) NOT BETWEEN 1 AND 10000
    OR length(btrim(coalesce(_payload->>'title','')))<3 THEN RAISE EXCEPTION 'invalid_order'; END IF;
  INSERT INTO public.orders(id,buyer_company_id,offer_id,title,brief,budget_cap_units)
    VALUES(oid,cid,f.id,left(_payload->>'title',120),_payload,(_payload->>'budget')::integer);
  PERFORM public.reserve_demo_order(oid,vid,'order:'||oid||':reservation');
  UPDATE public.orders SET selected_reason=left(coalesce(_payload->>'selectionReason','Oferta compatível com o orçamento autorizado.'),1000) WHERE id=oid;
  result:=jsonb_build_object('orderId',oid,'status','contracted');
  INSERT INTO public.a2a_requests VALUES(_user,rid,'order',payload_hash,result);
  RETURN result;
END $$;

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
    VALUES(o.id,'catalogue','builtin_catalogue_v1','execute:'||o.id,'running',token,now()+interval '2 minutes',now())
    ON CONFLICT(idempotency_key) DO UPDATE SET status='running',lease_token=token,lease_until=now()+interval '2 minutes',error_message=NULL;
  UPDATE public.orders SET status='in_progress',updated_at=now() WHERE id=o.id;
  INSERT INTO public.order_events(order_id,actor_type,actor_label,event_type,result)
    VALUES(o.id,'agent','Agente fornecedor','execution_started','O fornecedor recebeu o pedido estruturado e iniciou a execução.');
  RETURN jsonb_build_object('status','claimed','token',token,'version',o.current_delivery_version+1,'input',c.order_data,'criteria',c.acceptance_criteria);
END $$;

CREATE OR REPLACE FUNCTION public.studio_record_delivery(_order uuid,_token uuid,_content text,_report jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; j public.jobs; d uuid:=gen_random_uuid(); version integer; digest text;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=_order FOR UPDATE;
  SELECT * INTO j FROM public.jobs WHERE order_id=o.id AND lease_token=_token AND lease_until>now();
  IF o.status<>'in_progress' OR j.id IS NULL THEN RAISE EXCEPTION 'stale_execution'; END IF;
  IF coalesce(octet_length(_content),0) NOT BETWEEN 1 AND 262144 OR coalesce(_report->>'decision','') NOT IN ('approved','rejected')
    OR jsonb_typeof(_report->'checks') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_delivery'; END IF;
  version:=o.current_delivery_version+1; digest:=encode(sha256(convert_to(_content,'UTF8')),'hex');
  INSERT INTO public.deliveries(id,order_id,version,submitted_by_company_id,storage_path,file_name,media_type,byte_size,sha256,artifact_content,test_upload,supplier_message)
  VALUES(d,o.id,version,o.supplier_company_id,'inline/'||d,'catalogo-v'||version||'.csv','text/csv',octet_length(_content),digest,_content,
    coalesce((o.brief->>'testFailure')::boolean,false),'Arquivo produzido pelo executor de catálogo da empresa fornecedora.');
  INSERT INTO public.verification_reports(order_id,delivery_id,delivery_version,rules_version,tool_name,checks,decision,summary)
  VALUES(o.id,d,version,'catalog-v1','CSV parser + comparação de origem + SHA-256',_report->'checks',
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

CREATE OR REPLACE FUNCTION public.studio_cancel_order(_user uuid,_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; c public.contracts; a public.accounts;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=_order FOR UPDATE;
  IF o.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=o.buyer_company_id AND owner_user_id=_user)
    THEN RAISE EXCEPTION 'order_access_denied'; END IF;
  IF o.status IN ('cancelled','expired') THEN RETURN jsonb_build_object('status',o.status); END IF;
  IF o.status='settled' THEN RAISE EXCEPTION 'already_settled'; END IF;
  SELECT * INTO c FROM public.contracts WHERE order_id=o.id;
  SELECT * INTO a FROM public.accounts WHERE company_id=o.buyer_company_id FOR UPDATE;
  IF c.id IS NULL OR a.id IS NULL OR a.reserved_units<c.price_units
    OR NOT EXISTS(SELECT 1 FROM public.ledger_entries WHERE order_id=o.id AND entry_type='reservation'
      AND company_id=o.buyer_company_id AND amount_units=c.price_units AND idempotency_key='order:'||o.id||':reservation')
    THEN RAISE EXCEPTION 'order_reservation_required'; END IF;
  UPDATE public.accounts SET available_units=available_units+c.price_units,reserved_units=reserved_units-c.price_units,updated_at=now() WHERE id=a.id;
  INSERT INTO public.ledger_entries(company_id,order_id,entry_type,amount_units,idempotency_key,description)
    VALUES(o.buyer_company_id,o.id,'refund',c.price_units,'order:'||o.id||':refund','Reserva devolvida após cancelamento');
  UPDATE public.orders SET status=CASE WHEN now()>c.deadline_at THEN 'expired'::public.order_status ELSE 'cancelled'::public.order_status END,updated_at=now() WHERE id=o.id;
  UPDATE public.jobs SET status='cancelled',lease_until=NULL,lease_token=NULL WHERE order_id=o.id;
  INSERT INTO public.order_events(order_id,actor_type,actor_label,event_type,result)
    VALUES(o.id,'human','Responsável da empresa','cancelled','Contratação encerrada e reserva devolvida.');
  RETURN jsonb_build_object('status','cancelled','refunded',c.price_units);
END $$;

REVOKE ALL ON FUNCTION public.studio_create_company(uuid,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_place_order(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_claim_execution(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_record_delivery(uuid,uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cancel_order(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_create_company(uuid,uuid,jsonb),public.studio_place_order(uuid,jsonb),
 public.studio_claim_execution(uuid,uuid),public.studio_record_delivery(uuid,uuid,text,jsonb),public.studio_cancel_order(uuid,uuid) TO service_role;

-- The shared network starts with two real, executable providers. New companies
-- use the same registry and require no changes to the purchasing agent.
INSERT INTO public.companies(id,name,slug,description,kind,is_demo,operational) VALUES
 ('00000000-0000-0000-0000-000000000004','NeuraMarket','neuramarket-platform','Infraestrutura de contratação e verificação.','platform',true,true),
 ('00000000-0000-0000-0000-000000001001','Atlas Dados','atlas-dados','Catálogos padronizados para lojas online.','catalogue',true,true),
 ('00000000-0000-0000-0000-000000001002','Prisma Commerce','prisma-commerce','Organização de produtos e preparação de arquivos CSV.','catalogue',true,true)
 ON CONFLICT(id) DO NOTHING;
INSERT INTO public.accounts(company_id) VALUES
 ('00000000-0000-0000-0000-000000000004'),('00000000-0000-0000-0000-000000001001'),('00000000-0000-0000-0000-000000001002') ON CONFLICT(company_id) DO NOTHING;
DO $$ DECLARE cid uuid; cap uuid; offer uuid; amount integer; BEGIN
 FOR cid,amount IN SELECT * FROM (VALUES ('00000000-0000-0000-0000-000000001001'::uuid,12),('00000000-0000-0000-0000-000000001002'::uuid,18)) AS network(id,price) LOOP
  INSERT INTO public.capabilities(company_id,code,name,description,executor_type,integration_status)
    VALUES(cid,'catalog.normalize.v1','Padronizar catálogo','Produtos e preços preservados em CSV.','builtin_catalogue_v1','connected') RETURNING id INTO cap;
  INSERT INTO public.agents(company_id,name,agent_type,model,instructions)
    VALUES(cid,'Especialista em catálogo','supplier','deterministic','Entregue um CSV conforme os critérios contratados.');
  INSERT INTO public.offers(company_id,capability_id,title,published) VALUES(cid,cap,'Catálogo pronto para importar',true) RETURNING id INTO offer;
  INSERT INTO public.offer_versions(offer_id,version,description,price_units,deadline_hours,acceptance_criteria,revision_limit,cancellation_policy,available,required_inputs,output_format)
    VALUES(offer,1,'Um CSV verificado com os produtos e preços originais.',amount,1,public.catalogue_acceptance_criteria(),1,
      'Uma correção; cancelamento antes da liquidação devolve a reserva.',true,'[{"name":"rows","type":"array"}]','{"mime":"text/csv"}');
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.studio_add_clarification(_user uuid,_order uuid,_version integer,_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_order FOR UPDATE;
 IF o.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=o.buyer_company_id AND owner_user_id=_user)
 THEN RAISE EXCEPTION 'order_access_denied'; END IF;
 IF o.current_delivery_version<>_version OR o.status IN ('settled','cancelled','expired')
 THEN RAISE EXCEPTION 'stale_or_closed_review'; END IF;
 IF length(btrim(_note)) NOT BETWEEN 3 AND 1500 THEN RAISE EXCEPTION 'invalid_clarification'; END IF;
 INSERT INTO public.order_events(order_id,actor_type,actor_label,event_type,result,metadata)
 VALUES(o.id,'human','Responsável da empresa','clarification',_note,jsonb_build_object('deliveryVersion',_version,'userId',_user));
 RETURN jsonb_build_object('recorded',true,'deliveryVersion',_version);
END $$;
REVOKE ALL ON FUNCTION public.studio_add_clarification(uuid,uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_add_clarification(uuid,uuid,integer,text) TO service_role;

DROP POLICY IF EXISTS companies_demo_anon ON public.companies;
CREATE POLICY companies_demo_anon ON public.companies FOR SELECT TO anon USING(is_demo OR EXISTS(SELECT 1 FROM public.offers WHERE company_id=companies.id AND published));
DROP POLICY IF EXISTS capabilities_anon ON public.capabilities;
CREATE POLICY capabilities_anon ON public.capabilities FOR SELECT TO anon USING(EXISTS(SELECT 1 FROM public.offers WHERE capability_id=capabilities.id AND published));
