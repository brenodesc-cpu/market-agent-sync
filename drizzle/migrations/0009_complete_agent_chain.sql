-- Complete the human checkpoint and separate private companies from published services.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'commercial' CHECK(visibility IN ('private','commercial'));
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS requires_human_review boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.human_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id),
 delivery_id uuid NOT NULL REFERENCES public.deliveries(id), report_id uuid NOT NULL REFERENCES public.verification_reports(id),
 sha256 text NOT NULL, reviewed_by uuid NOT NULL, decision text NOT NULL CHECK(decision IN ('approved','rejected')),
 note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(delivery_id)
);
ALTER TABLE public.human_reviews ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS human_reviews_immutable ON public.human_reviews;
CREATE TRIGGER human_reviews_immutable BEFORE UPDATE OR DELETE ON public.human_reviews FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_changes();
GRANT ALL ON public.human_reviews TO service_role;
DROP POLICY IF EXISTS human_reviews_members ON public.human_reviews;
CREATE POLICY human_reviews_members ON public.human_reviews FOR SELECT TO authenticated USING(EXISTS(
 SELECT 1 FROM public.orders o WHERE o.id=order_id AND (public.is_company_member(o.buyer_company_id,auth.uid()) OR public.is_company_member(o.supplier_company_id,auth.uid()))
));
GRANT SELECT ON public.human_reviews TO authenticated;
CREATE TABLE IF NOT EXISTS public.private_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id),
 requested_by uuid NOT NULL, request_id uuid NOT NULL, input_hash text NOT NULL, artifact_content text NOT NULL,
 sha256 text NOT NULL, report jsonb NOT NULL, duration_ms integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,request_id)
);
ALTER TABLE public.private_runs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.private_runs TO service_role;
GRANT SELECT ON public.private_runs TO authenticated;
DROP POLICY IF EXISTS private_runs_owner ON public.private_runs;
CREATE POLICY private_runs_owner ON public.private_runs FOR SELECT TO authenticated USING(requested_by=auth.uid());

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
  INSERT INTO public.offers(id,company_id,capability_id,title,published) VALUES(offer,cid,cap,_config->>'serviceTitle',coalesce(_config->>'visibility','private')='commercial');
  INSERT INTO public.offer_versions(offer_id,version,description,price_units,deadline_hours,acceptance_criteria,revision_limit,cancellation_policy,available,required_inputs,output_format)
  VALUES(offer,1,_config->>'description',(_config->>'price')::integer,1,public.catalogue_acceptance_criteria(),1,
    'Uma correção; cancelamento antes da liquidação devolve a reserva.',true,
    '[{"name":"rows","type":"array","fields":["sku","size","priceCents"]}]', '{"mime":"text/csv","encoding":"UTF-8"}');
  UPDATE public.companies SET visibility=coalesce(_config->>'visibility','private') WHERE id=cid;
  result:=jsonb_build_object('companyId',cid,'offerId',offer);
  INSERT INTO public.a2a_requests VALUES(_user,_request,'company',payload_hash,result);
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.reserve_demo_order(
  _order_id uuid, _offer_version_id uuid, _idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; v public.offer_versions; f public.offers; a public.accounts;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF o.status <> 'draft' THEN RETURN jsonb_build_object('status',o.status); END IF;
  SELECT * INTO v FROM public.offer_versions WHERE id=_offer_version_id AND available=true;
  IF v.id IS NULL THEN RAISE EXCEPTION 'offer_unavailable'; END IF;
  SELECT * INTO f FROM public.offers WHERE id=v.offer_id AND published=true;
  IF f.id IS NULL OR f.id IS DISTINCT FROM o.offer_id THEN RAISE EXCEPTION 'offer_mismatch'; END IF;
  IF v.price_units <= 0 OR v.price_units > o.budget_cap_units THEN RAISE EXCEPTION 'invalid_contract_price'; END IF;
  IF jsonb_typeof(v.acceptance_criteria) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_acceptance_criteria'; END IF;
  IF jsonb_array_length(v.acceptance_criteria)=0 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v.acceptance_criteria) x
    WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
       OR jsonb_typeof(x->'criterion') IS DISTINCT FROM 'string'
       OR length(btrim(x->>'criterion'))=0
       OR x->'expected' IS NULL OR x->'expected'='null'::jsonb
  ) OR (SELECT count(DISTINCT x->>'criterion') FROM jsonb_array_elements(v.acceptance_criteria) x)
       <> jsonb_array_length(v.acceptance_criteria)
  THEN RAISE EXCEPTION 'invalid_acceptance_criteria'; END IF;
  SELECT * INTO a FROM public.accounts WHERE company_id=o.buyer_company_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'buyer_account_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE company_id=f.company_id)
     OR NOT EXISTS (SELECT 1 FROM public.accounts WHERE company_id='00000000-0000-0000-0000-000000000004')
  THEN RAISE EXCEPTION 'settlement_accounts_required'; END IF;
  IF a.available_units < v.price_units THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  UPDATE public.accounts SET available_units=available_units-v.price_units,
    reserved_units=reserved_units+v.price_units,updated_at=now() WHERE id=a.id;
  INSERT INTO public.contracts(order_id,offer_version_id,buyer_company_id,supplier_company_id,
    price_units,commission_bps,deadline_at,order_data,acceptance_criteria,revision_limit,cancellation_policy,requires_human_review)
  VALUES(o.id,v.id,o.buyer_company_id,f.company_id,v.price_units,1000,
    now()+(v.deadline_hours||' hours')::interval,o.brief,v.acceptance_criteria,v.revision_limit,v.cancellation_policy,coalesce((o.brief->>'humanReview')::boolean,false));
  UPDATE public.orders SET supplier_company_id=f.company_id,status='contracted',
    selected_reason='Oferta compatível com os critérios e teto autorizado.',updated_at=now() WHERE id=o.id;
  INSERT INTO public.ledger_entries(company_id,order_id,entry_type,amount_units,idempotency_key,description)
  VALUES(o.buyer_company_id,o.id,'reservation',v.price_units,'order:'||o.id||':reservation','Reserva para contrato simulado');
  INSERT INTO public.order_events(order_id,actor_type,actor_label,event_type,result)
  VALUES(o.id,'agent','Gerente comprador','contracted','Oferta escolhida e saldo reservado');
  RETURN jsonb_build_object('status','contracted','reserved_units',v.price_units);
END$$;
REVOKE ALL ON FUNCTION public.reserve_demo_order(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_demo_order(uuid,uuid,text) TO service_role;

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
CREATE OR REPLACE FUNCTION public.settle_verified_order(
  _order_id uuid, _idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; c public.contracts; r public.verification_reports; d public.deliveries;
  b public.accounts; s public.accounts; p public.accounts; fee integer; payout integer;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF o.status='settled' THEN RETURN jsonb_build_object('status','already_settled'); END IF;
  IF o.status IN ('cancelled','expired') THEN RAISE EXCEPTION 'closed_order'; END IF;
  SELECT * INTO c FROM public.contracts WHERE order_id=_order_id;
  IF c.id IS NULL OR c.buyer_company_id IS DISTINCT FROM o.buyer_company_id
      OR c.supplier_company_id IS DISTINCT FROM o.supplier_company_id
      OR c.price_units<=0 OR c.price_units>o.budget_cap_units
      OR c.commission_bps<0 OR c.commission_bps>10000 OR c.revision_limit<0
  THEN RAISE EXCEPTION 'invalid_contract'; END IF;
  IF o.status NOT IN ('delivered','verifying','accepted') OR o.current_delivery_version<=0
  THEN RAISE EXCEPTION 'order_not_ready'; END IF;
  SELECT * INTO d FROM public.deliveries
    WHERE order_id=o.id AND version=o.current_delivery_version;
  IF d.id IS NULL OR d.submitted_by_company_id IS DISTINCT FROM c.supplier_company_id
      OR d.sha256 IS NULL OR d.sha256 !~ '^[0-9a-f]{64}$'
  THEN RAISE EXCEPTION 'valid_current_delivery_required'; END IF;
  SELECT * INTO r FROM public.verification_reports WHERE delivery_id=d.id
    AND order_id=o.id AND delivery_version=d.version;
  IF r.id IS NULL OR r.decision<>'approved' THEN RAISE EXCEPTION 'approved_current_verification_required'; END IF;
  IF jsonb_typeof(c.acceptance_criteria) IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.checks) IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'invalid_verification_checks'; END IF;
  IF jsonb_array_length(c.acceptance_criteria)=0
      OR jsonb_array_length(r.checks)<>jsonb_array_length(c.acceptance_criteria)
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(c.acceptance_criteria) x
        WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
          OR jsonb_typeof(x->'criterion') IS DISTINCT FROM 'string'
          OR length(btrim(x->>'criterion'))=0
          OR x->'expected' IS NULL OR x->'expected'='null'::jsonb
      )
      OR (SELECT count(DISTINCT x->>'criterion') FROM jsonb_array_elements(c.acceptance_criteria) x)
          <>jsonb_array_length(c.acceptance_criteria)
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(r.checks) x
        WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
          OR jsonb_typeof(x->'criterion') IS DISTINCT FROM 'string'
          OR x->>'status' IS DISTINCT FROM 'passed'
          OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c.acceptance_criteria) a
            WHERE a->>'criterion'=x->>'criterion' AND a->'expected'=x->'expected')
      )
      OR (SELECT count(DISTINCT x->>'criterion') FROM jsonb_array_elements(r.checks) x)
          <>jsonb_array_length(r.checks)
  THEN RAISE EXCEPTION 'invalid_verification_checks'; END IF;
  IF c.requires_human_review AND NOT EXISTS (
    SELECT 1 FROM public.human_reviews h WHERE h.order_id=o.id AND h.delivery_id=d.id
      AND h.report_id=r.id AND h.sha256=d.sha256 AND h.decision='approved'
  ) THEN RAISE EXCEPTION 'human_approval_required'; END IF;
  PERFORM id FROM public.accounts WHERE company_id IN
    (c.buyer_company_id,c.supplier_company_id,'00000000-0000-0000-0000-000000000004'::uuid)
    ORDER BY id FOR UPDATE;
  SELECT * INTO b FROM public.accounts WHERE company_id=c.buyer_company_id;
  SELECT * INTO s FROM public.accounts WHERE company_id=c.supplier_company_id;
  SELECT * INTO p FROM public.accounts WHERE company_id='00000000-0000-0000-0000-000000000004';
  IF b.id IS NULL OR s.id IS NULL OR p.id IS NULL THEN RAISE EXCEPTION 'settlement_accounts_required'; END IF;
  IF b.reserved_units<c.price_units THEN RAISE EXCEPTION 'insufficient_reserve'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ledger_entries WHERE order_id=o.id
    AND company_id=c.buyer_company_id AND entry_type='reservation' AND amount_units=c.price_units
    AND idempotency_key='order:'||o.id||':reservation')
  THEN RAISE EXCEPTION 'order_reservation_required'; END IF;
  fee := (c.price_units::bigint*c.commission_bps/10000)::integer;
  payout := c.price_units-fee;
  UPDATE public.accounts SET reserved_units=reserved_units-c.price_units,
    paid_units=paid_units+c.price_units,updated_at=now() WHERE id=b.id;
  UPDATE public.accounts SET available_units=available_units+payout,
    received_units=received_units+payout,updated_at=now() WHERE id=s.id;
  UPDATE public.accounts SET available_units=available_units+fee,
    commission_units=commission_units+fee,received_units=received_units+fee,updated_at=now() WHERE id=p.id;
  INSERT INTO public.ledger_entries(company_id,order_id,entry_type,amount_units,idempotency_key,description)
  VALUES(c.buyer_company_id,o.id,'payment',c.price_units,'order:'||o.id||':buyer','Pagamento simulado liquidado');
  IF payout>0 THEN
    INSERT INTO public.ledger_entries(company_id,order_id,entry_type,amount_units,idempotency_key,description)
    VALUES(c.supplier_company_id,o.id,'receipt',payout,'order:'||o.id||':supplier','Recebimento líquido simulado');
  END IF;
  IF fee>0 THEN
    INSERT INTO public.ledger_entries(company_id,order_id,entry_type,amount_units,idempotency_key,description)
    VALUES(p.company_id,o.id,'commission',fee,'order:'||o.id||':platform','Comissão simulada');
  END IF;
  UPDATE public.orders SET status='settled',updated_at=now() WHERE id=o.id;
  INSERT INTO public.order_events(order_id,actor_type,actor_label,event_type,result)
  VALUES(o.id,'finance','Serviço financeiro','settled','Pagamento liquidado uma única vez');
  RETURN jsonb_build_object('status','settled','payout_units',payout,'commission_units',fee);
END$$;
REVOKE ALL ON FUNCTION public.settle_verified_order(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_verified_order(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.studio_review_delivery(_user uuid,_order uuid,_delivery uuid,_report uuid,_sha text,_decision text,_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; c public.contracts; d public.deliveries; r public.verification_reports; prior public.human_reviews;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_order FOR UPDATE;
 IF o.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=o.buyer_company_id AND owner_user_id=_user)
 THEN RAISE EXCEPTION 'review_access_denied'; END IF;
 SELECT * INTO c FROM public.contracts WHERE order_id=o.id;
 SELECT * INTO d FROM public.deliveries WHERE id=_delivery AND order_id=o.id AND version=o.current_delivery_version;
 SELECT * INTO r FROM public.verification_reports WHERE id=_report AND delivery_id=d.id AND order_id=o.id;
 IF d.id IS NULL OR r.id IS NULL OR d.sha256 IS DISTINCT FROM _sha THEN RAISE EXCEPTION 'stale_review'; END IF;
 IF _decision NOT IN ('approved','rejected') OR length(btrim(coalesce(_note,''))) NOT BETWEEN 3 AND 1500 THEN RAISE EXCEPTION 'invalid_review'; END IF;
 SELECT * INTO prior FROM public.human_reviews WHERE delivery_id=d.id;
 IF prior.id IS NOT NULL THEN
   IF prior.decision IS DISTINCT FROM _decision THEN RAISE EXCEPTION 'review_already_recorded'; END IF;
   RETURN jsonb_build_object('status',o.status,'alreadyRecorded',true);
 END IF;
 IF o.status IN ('settled','cancelled','expired') THEN RAISE EXCEPTION 'closed_order'; END IF;
 IF now()>c.deadline_at THEN RAISE EXCEPTION 'deadline_expired'; END IF;
 IF NOT c.requires_human_review THEN RAISE EXCEPTION 'human_review_not_in_contract'; END IF;
 IF _decision='approved' AND (r.decision<>'approved' OR o.status<>'accepted') THEN RAISE EXCEPTION 'objective_checks_required'; END IF;
 INSERT INTO public.human_reviews(order_id,delivery_id,report_id,sha256,reviewed_by,decision,note)
 VALUES(o.id,d.id,r.id,d.sha256,_user,_decision,btrim(_note));
 INSERT INTO public.order_events(order_id,actor_type,actor_label,event_type,result,metadata)
 VALUES(o.id,'human','Responsável comprador','human_'||_decision,left(_note,1500),jsonb_build_object('deliveryId',d.id,'reportId',r.id,'sha256',d.sha256,'userId',_user));
 IF _decision='approved' THEN
   RETURN public.settle_verified_order(o.id,'order:'||o.id);
 END IF;
 UPDATE public.orders SET status='revision_requested',updated_at=now() WHERE id=o.id;
 RETURN jsonb_build_object('status','revision_requested');
END $$;
REVOKE ALL ON FUNCTION public.studio_review_delivery(uuid,uuid,uuid,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_review_delivery(uuid,uuid,uuid,uuid,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.studio_set_commercial(_user uuid,_company uuid,_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM id FROM public.companies WHERE id=_company AND owner_user_id=_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'company_access_denied'; END IF;
 IF _enabled AND NOT EXISTS(SELECT 1 FROM public.private_runs WHERE company_id=_company AND report->>'decision'='approved')
 THEN RAISE EXCEPTION 'successful_private_run_required'; END IF;
 UPDATE public.companies SET visibility=CASE WHEN _enabled THEN 'commercial' ELSE 'private' END WHERE id=_company;
 UPDATE public.offers SET published=_enabled WHERE company_id=_company;
 RETURN jsonb_build_object('visibility',CASE WHEN _enabled THEN 'commercial' ELSE 'private' END);
END $$;
REVOKE ALL ON FUNCTION public.studio_set_commercial(uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_set_commercial(uuid,uuid,boolean) TO service_role;

-- Private company records stay private. A published offer exposes only its service metadata.
DROP POLICY IF EXISTS companies_member_select ON public.companies;
CREATE POLICY companies_member_select ON public.companies FOR SELECT TO authenticated USING(is_demo OR public.is_company_member(id,auth.uid()) OR EXISTS(SELECT 1 FROM public.offers WHERE company_id=companies.id AND published));
-- Visibility changes go through the owner-checked server transaction, not a browser table update.
DROP POLICY IF EXISTS companies_owner_update ON public.companies;
DROP POLICY IF EXISTS offers_owner ON public.offers;