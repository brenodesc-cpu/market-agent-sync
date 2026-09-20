-- New, explicitly authorized simulated contracts only. Existing contracts remain immutable.
CREATE TABLE public.browser_supplier_terms (
 offer_version_id uuid PRIMARY KEY REFERENCES public.offer_versions(id),
 minimum_price integer NOT NULL CHECK(minimum_price>0), estimated_ms integer NOT NULL CHECK(estimated_ms>0)
);
ALTER TABLE public.browser_supplier_terms ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.browser_supplier_terms TO service_role;
INSERT INTO public.browser_supplier_terms VALUES
 ('00000000-0000-0000-0000-000000002301',4,5000),
 ('00000000-0000-0000-0000-000000002302',13,20000);
CREATE TABLE public.browser_mission_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id),
 requested_by uuid NOT NULL, request_id uuid NOT NULL, input_hash text NOT NULL,
 objective text NOT NULL, budget integer NOT NULL CHECK(budget>0), test_failure boolean NOT NULL DEFAULT false,
 scope jsonb NOT NULL, quote jsonb NOT NULL, inference jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
 UNIQUE(company_id,request_id)
);
ALTER TABLE public.browser_mission_quotes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.browser_mission_quotes TO service_role;
CREATE TRIGGER browser_quotes_immutable BEFORE UPDATE OR DELETE ON public.browser_mission_quotes FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_changes();
CREATE OR REPLACE FUNCTION public.browser_market_suppliers() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',c.name,'listPrice',v.price_units,'minimumPrice',t.minimum_price,
 'desktop',coalesce((v.output_format->>'desktop')::boolean,false),'mobile',coalesce((v.output_format->>'mobile')::boolean,false),
 'form',coalesce((v.output_format->>'form')::boolean,false),'estimatedMs',t.estimated_ms)),'[]'::jsonb)
 FROM browser_supplier_terms t JOIN offer_versions v ON v.id=t.offer_version_id
 JOIN offers f ON f.id=v.offer_id AND f.current_version=v.version AND f.published
 JOIN companies c ON c.id=f.company_id AND c.operational
 JOIN capabilities cp ON cp.id=f.capability_id AND cp.code='browser.qa.v1' AND cp.integration_status='connected'
 WHERE v.available AND t.minimum_price<=v.price_units
$$;
REVOKE ALL ON FUNCTION public.browser_market_suppliers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.browser_market_suppliers() TO service_role;

CREATE OR REPLACE FUNCTION public.studio_place_browser_mission(_user uuid,_company uuid,_quote uuid,_mode text,_offer uuid,_authorized boolean,_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.browser_mission_quotes; v public.offer_versions; f public.offers; a public.accounts;
 terms public.browser_supplier_terms; proposal jsonb; criteria jsonb; brief jsonb; result jsonb; prior public.a2a_requests;
 vid uuid; oid uuid:=gen_random_uuid(); price integer; payload_hash text;
BEGIN
 IF _user IS NULL OR NOT EXISTS(SELECT 1 FROM companies WHERE id=_company AND owner_user_id=_user) THEN RAISE EXCEPTION 'buyer_access_denied'; END IF;
 IF _mode IS NULL OR _mode NOT IN ('autonomous','manual') OR _source IS NULL OR _source NOT IN ('studio','mcp') THEN RAISE EXCEPTION 'invalid_mode'; END IF;
 IF _mode='autonomous' AND _authorized IS DISTINCT FROM true THEN RAISE EXCEPTION 'automatic_payment_authorization_required'; END IF;
 SELECT * INTO q FROM browser_mission_quotes WHERE id=_quote AND company_id=_company AND requested_by=_user;
 IF q.id IS NULL THEN RAISE EXCEPTION 'quote_access_denied'; END IF;
 vid:=CASE WHEN _mode='autonomous' THEN (q.quote->>'selectedOffer')::uuid ELSE _offer END;
 payload_hash:=encode(sha256(convert_to(jsonb_build_object('quote',_quote,'offer',vid,'mode',_mode,'authorized',_authorized)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(_user::text||q.request_id::text,0));
 SELECT * INTO prior FROM a2a_requests WHERE user_id=_user AND request_id=q.request_id;
 IF prior.request_id IS NOT NULL THEN
   IF prior.purpose<>'order' OR prior.payload_hash<>payload_hash THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
   RETURN prior.result;
 END IF;
 IF q.expires_at<=now() THEN RAISE EXCEPTION 'quote_expired'; END IF;
 IF q.scope->>'supported' IS DISTINCT FROM 'true' OR jsonb_typeof(q.scope->'viewports') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'unsupported_scope'; END IF;
 IF jsonb_array_length(q.scope->'viewports') NOT BETWEEN 1 AND 2 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(q.scope->'viewports') x WHERE x NOT IN ('desktop','mobile')) THEN RAISE EXCEPTION 'unsupported_scope'; END IF;
 SELECT * INTO v FROM offer_versions WHERE id=vid AND available;
 SELECT * INTO f FROM offers WHERE id=v.offer_id AND published AND current_version=v.version;
 SELECT * INTO terms FROM browser_supplier_terms WHERE offer_version_id=vid;
 IF v.id IS NULL OR f.id IS NULL OR terms.offer_version_id IS NULL OR f.company_id=_company OR NOT EXISTS(SELECT 1 FROM companies WHERE id=f.company_id AND operational) THEN RAISE EXCEPTION 'offer_unavailable'; END IF;
 SELECT x INTO proposal FROM jsonb_array_elements(q.quote->'offers') x WHERE x->>'id'=vid::text;
 price:=greatest(terms.minimum_price,greatest(1,floor(v.price_units*.8)::integer));
 IF proposal IS NULL OR (proposal->>'listPrice')::integer IS DISTINCT FROM v.price_units OR (proposal->>'minimumPrice')::integer IS DISTINCT FROM terms.minimum_price OR price IS DISTINCT FROM (proposal->>'price')::integer THEN RAISE EXCEPTION 'quote_stale'; END IF;
 IF price>q.budget OR price>v.price_units OR price<1 THEN RAISE EXCEPTION 'invalid_contract_price'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(q.scope->'viewports') x WHERE v.output_format->>x IS DISTINCT FROM 'true') OR (q.scope->>'form'='true' AND v.output_format->>'form' IS DISTINCT FROM 'true') THEN RAISE EXCEPTION 'offer_does_not_cover_goal'; END IF;
 SELECT jsonb_agg(jsonb_build_object('criterion',x,'expected',true)) INTO criteria FROM (SELECT DISTINCT jsonb_array_elements_text(q.scope->'viewports') x) p;
 criteria:=criteria||'[{"criterion":"evidence_integrity","expected":true}]'::jsonb;
 brief:=jsonb_build_object('capability','browser.qa.v1','fixture','lead-form-v1','source',_source,'task',q.objective,'scope',q.scope,'testFailure',q.test_failure,'humanReview',_mode='manual','autoCorrect',_mode='autonomous','settlementPolicy',CASE WHEN _mode='autonomous' THEN 'verified-browser-v1' ELSE 'human-review' END,'quoteId',q.id,'market',q.quote,'inference',q.inference);
 SELECT * INTO a FROM accounts WHERE company_id=_company FOR UPDATE;
 IF a.id IS NULL OR a.available_units<price THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
 IF NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=f.company_id) OR NOT EXISTS(SELECT 1 FROM accounts WHERE company_id='00000000-0000-0000-0000-000000000004') THEN RAISE EXCEPTION 'settlement_accounts_required'; END IF;
 INSERT INTO orders(id,buyer_company_id,supplier_company_id,offer_id,title,brief,budget_cap_units,status,selected_reason)
 VALUES(oid,_company,f.company_id,f.id,left(q.objective,120),brief,q.budget,'contracted',CASE WHEN _mode='manual' THEN 'Fornecedor escolhido pelo humano após comparar a cotação.' ELSE q.quote->>'reason' END);
 INSERT INTO contracts(order_id,offer_version_id,buyer_company_id,supplier_company_id,price_units,commission_bps,deadline_at,order_data,acceptance_criteria,revision_limit,cancellation_policy,requires_human_review)
 VALUES(oid,vid,_company,f.company_id,price,1000,now()+interval '1 hour',brief,criteria,1,'Uma correção. Cancelamento antes do pagamento devolve a reserva.',_mode='manual');
 UPDATE accounts SET available_units=available_units-price,reserved_units=reserved_units+price,updated_at=now() WHERE id=a.id;
 INSERT INTO ledger_entries(company_id,order_id,entry_type,amount_units,idempotency_key,description)
 VALUES(_company,oid,'reservation',price,'order:'||oid||':reservation','Reserva do preço negociado, créditos simulados');
 INSERT INTO order_events(order_id,actor_type,actor_label,event_type,result,metadata) VALUES
 (oid,'agent','Comprador · NeuraLake','goal_interpreted',q.scope->>'reason',q.inference),
 (oid,'agent','Assessor de fornecedores','offers_evaluated',q.quote->>'reason',q.quote),
 (oid,'agent','Fornecedor · política de preços','price_negotiated',proposal->>'negotiation',proposal),
 (oid,'agent','Agente comprador','contracted',price||' créditos reservados. Política: '||(brief->>'settlementPolicy'),jsonb_build_object('mode',_mode,'price',price,'authorization',_authorized));
 result:=jsonb_build_object('orderId',oid,'status','contracted','price',price,'automaticPayment',_mode='autonomous');
 INSERT INTO a2a_requests VALUES(_user,q.request_id,'order',payload_hash,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.studio_place_browser_mission(uuid,uuid,uuid,text,uuid,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_place_browser_mission(uuid,uuid,uuid,text,uuid,boolean,text) TO service_role;

CREATE OR REPLACE FUNCTION public.advance_browser_contract(_user uuid,_order uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; c public.contracts; r public.verification_reports;
BEGIN
 SELECT * INTO o FROM orders WHERE id=_order FOR UPDATE;
 IF o.id IS NULL OR NOT EXISTS(SELECT 1 FROM companies WHERE id=o.buyer_company_id AND owner_user_id=_user) THEN RAISE EXCEPTION 'order_access_denied'; END IF;
 SELECT * INTO c FROM contracts WHERE order_id=o.id;
 IF c.requires_human_review OR c.order_data->>'settlementPolicy' IS DISTINCT FROM 'verified-browser-v1' THEN RETURN jsonb_build_object('status',o.status); END IF;
 IF o.status='settled' THEN RETURN jsonb_build_object('status','already_settled'); END IF;
 IF c.deadline_at<now() THEN RETURN jsonb_build_object('status','deadline_expired'); END IF;
 IF o.status='accepted' THEN RETURN settle_verified_order(o.id,'order:'||o.id); END IF;
 IF o.status='revision_requested' AND o.current_delivery_version<=c.revision_limit THEN
   SELECT vr.* INTO r FROM verification_reports vr JOIN deliveries d ON d.id=vr.delivery_id WHERE d.order_id=o.id AND d.version=o.current_delivery_version AND vr.order_id=o.id AND vr.delivery_version=d.version;
   IF r.decision='rejected' THEN
     UPDATE orders SET status='contracted',updated_at=now() WHERE id=o.id;
     INSERT INTO order_events(order_id,actor_type,actor_label,event_type,result,metadata) VALUES(o.id,'agent','Agente comprador','correction_requested','Correção solicitada automaticamente no mesmo contrato. Sem nova reserva.',jsonb_build_object('version',o.current_delivery_version,'model','contract-policy-v1','tokens',0));
     RETURN jsonb_build_object('status','contracted');
   END IF;
 END IF;
 RETURN jsonb_build_object('status',o.status);
END $$;
REVOKE ALL ON FUNCTION public.advance_browser_contract(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_browser_contract(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.studio_record_browser_delivery(_order uuid,_token uuid,_content text,_report jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; j public.jobs; d uuid:=gen_random_uuid(); version integer; digest text;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=_order FOR UPDATE;
  SELECT * INTO j FROM public.jobs WHERE order_id=o.id AND lease_token=_token AND lease_until>now();
  IF o.status<>'in_progress' OR j.id IS NULL THEN RAISE EXCEPTION 'stale_execution'; END IF;
  IF coalesce(octet_length(_content),0) NOT BETWEEN 1 AND 1048576 OR coalesce(_report->>'decision','') NOT IN ('approved','rejected')
    OR jsonb_typeof(_report->'checks') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_delivery'; END IF;
  IF NOT EXISTS(SELECT 1 FROM contracts WHERE order_id=o.id AND order_data->>'capability'='browser.qa.v1' AND (requires_human_review OR order_data->>'settlementPolicy'='verified-browser-v1')) THEN RAISE EXCEPTION 'agent_contract_required'; END IF;
  version:=o.current_delivery_version+1; digest:=encode(sha256(convert_to(_content,'UTF8')),'hex');
  INSERT INTO public.deliveries(id,order_id,version,submitted_by_company_id,storage_path,file_name,media_type,byte_size,sha256,artifact_content,test_upload,supplier_message)
  VALUES(d,o.id,version,o.supplier_company_id,'inline/'||d,'entrega-v'||version||'.json','application/json',octet_length(_content),digest,_content,
    coalesce((o.brief->>'testFailure')::boolean,false),'Testes executados no Chromium pelo executor autorizado.');
  INSERT INTO public.verification_reports(order_id,delivery_id,delivery_version,rules_version,tool_name,checks,decision,summary)
  VALUES(o.id,d,version,'browser-v2','Cobertura contratada + integridade SHA-256; executor autorizado, sem certificação de ausência de bugs',_report->'checks',
    (_report->>'decision')::public.verification_decision,left(_report->>'summary',1000));
  UPDATE public.orders SET current_delivery_version=version,revision_count=version-1,
    status=CASE WHEN _report->>'decision'='approved' THEN 'accepted'::public.order_status ELSE 'revision_requested'::public.order_status END,
    updated_at=now() WHERE id=o.id;
  UPDATE public.jobs SET status='completed',lease_token=NULL,lease_until=NULL,completed_at=now() WHERE id=j.id;
  INSERT INTO public.order_events(order_id,actor_type,actor_label,event_type,result,metadata) VALUES
    (o.id,'agent','Agente fornecedor','delivered','Arquivo da versão '||version||' entregue.',jsonb_build_object('deliveryId',d,'sha256',digest)),
    (o.id,'verifier','Verificador independente',_report->>'decision',left(_report->>'summary',1000),jsonb_build_object('deliveryId',d,'version',version,'model','browser-contract-v2','tokens',0));
  RETURN jsonb_build_object('deliveryId',d,'version',version,'decision',_report->>'decision','sha256',digest);
END $$;

REVOKE ALL ON FUNCTION public.studio_record_browser_delivery(uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_record_browser_delivery(uuid,uuid,text,jsonb) TO service_role;

