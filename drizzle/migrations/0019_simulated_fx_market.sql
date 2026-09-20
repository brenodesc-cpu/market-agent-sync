-- Isolated financial simulator. Never writes existing accounts or real payment rails.
CREATE TABLE public.fx_wallets (
 company_id uuid PRIMARY KEY REFERENCES companies(id), available_brl bigint NOT NULL DEFAULT 1000000 CHECK(available_brl>=0),
 reserved_brl bigint NOT NULL DEFAULT 0 CHECK(reserved_brl>=0), available_usd bigint NOT NULL DEFAULT 0 CHECK(available_usd>=0),
 spent_brl bigint NOT NULL DEFAULT 0 CHECK(spent_brl>=0)
);
CREATE TABLE public.fx_suppliers (
 id text PRIMARY KEY, name text NOT NULL, rate_ppm bigint NOT NULL CHECK(rate_ppm>0), fee_brl integer NOT NULL CHECK(fee_brl>=0),
 minimum_fee_brl integer NOT NULL CHECK(minimum_fee_brl>=0 AND minimum_fee_brl<=fee_brl), settlement_minutes integer NOT NULL CHECK(settlement_minutes>0), active boolean NOT NULL DEFAULT true
);
INSERT INTO fx_suppliers VALUES ('fx-a','Câmbio A',5410000,4000,4000,1440,true),('fx-b','Câmbio B',5480000,2500,1500,5,true),('fx-c','Câmbio C',5520000,0,0,10,true);
CREATE TABLE public.fx_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), request_id uuid NOT NULL,
 input jsonb NOT NULL, data jsonb NOT NULL, inference jsonb, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes', UNIQUE(company_id,request_id)
);
CREATE TABLE public.fx_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), quote_id uuid NOT NULL UNIQUE REFERENCES fx_quotes(id),
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','delivered','rejected','corrected','approved','awaiting_approval','settled','cancelled','expired')),
 contract jsonb NOT NULL, mode text NOT NULL CHECK(mode IN ('autonomous','manual')), test_failure boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), deadline_at timestamptz NOT NULL, current_version integer NOT NULL DEFAULT 0
);
CREATE TABLE public.fx_operations (
 order_id uuid PRIMARY KEY REFERENCES fx_orders(id), company_id uuid NOT NULL REFERENCES companies(id), operation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 target_usd bigint NOT NULL, principal_brl bigint NOT NULL, status text NOT NULL CHECK(status IN ('pending','settled','cancelled')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fx_receipts (
 order_id uuid NOT NULL REFERENCES fx_orders(id), version integer NOT NULL, body jsonb NOT NULL, sha256 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(order_id,version)
);
CREATE TABLE public.fx_reports (
 order_id uuid NOT NULL, version integer NOT NULL, receipt_sha256 text NOT NULL, decision text NOT NULL CHECK(decision IN ('approved','rejected')),
 checks jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(order_id,version), FOREIGN KEY(order_id,version) REFERENCES fx_receipts(order_id,version)
);
CREATE TABLE public.fx_ledger (
 order_id uuid PRIMARY KEY REFERENCES fx_orders(id), supplier_id text NOT NULL REFERENCES fx_suppliers(id), principal_brl bigint NOT NULL CHECK(principal_brl>0),
 platform_fee_brl bigint NOT NULL CHECK(platform_fee_brl>=0), target_usd bigint NOT NULL CHECK(target_usd>0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fx_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, order_id uuid NOT NULL REFERENCES fx_orders(id), actor text NOT NULL,
 type text NOT NULL, detail jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['fx_wallets','fx_suppliers','fx_quotes','fx_orders','fx_operations','fx_receipts','fx_reports','fx_ledger','fx_events'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;
GRANT USAGE,SELECT ON SEQUENCE fx_events_id_seq TO service_role;
CREATE FUNCTION public.fx_owner(_user uuid,_company uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM companies WHERE id=_company AND owner_user_id=_user) THEN RAISE EXCEPTION 'fx_access_denied'; END IF;
 INSERT INTO fx_wallets(company_id) VALUES(_company) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION public.fx_quote(_user uuid,_company uuid,_request uuid,_target bigint,_budget bigint,_minutes integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q fx_quotes; payload jsonb; offers jsonb; selected jsonb;
BEGIN
 PERFORM fx_owner(_user,_company);
 IF _request IS NULL OR _target IS NULL OR _budget IS NULL OR _minutes IS NULL OR _target NOT BETWEEN 100 AND 1000000 OR _budget NOT BETWEEN 100 AND 10000000 OR _minutes NOT BETWEEN 1 AND 2880 THEN RAISE EXCEPTION 'fx_invalid_input'; END IF;
 payload:=jsonb_build_object('targetUsdCents',_target,'maxTotalBrlCents',_budget,'maxSettlementMinutes',_minutes);
 PERFORM pg_advisory_xact_lock(hashtextextended(_company::text||_request::text,0));
 SELECT * INTO q FROM fx_quotes WHERE company_id=_company AND request_id=_request;
 IF q.id IS NOT NULL THEN IF q.input<>payload THEN RAISE EXCEPTION 'fx_idempotency_conflict'; END IF; RETURN to_jsonb(q); END IF;
 SELECT jsonb_agg(jsonb_build_object('supplierId',id,'name',name,'ratePpm',rate_ppm,'conversionBrlCents',conversion,'listFeeBrlCents',fee_brl,'proposedFeeBrlCents',floor(fee_brl*.4)::integer,'feeBrlCents',fee,'principalBrlCents',conversion+fee,'platformFeeBrlCents',500,'totalBrlCents',conversion+fee+500,'listTotalBrlCents',conversion+fee_brl+500,'targetUsdCents',_target,'settlementMinutes',settlement_minutes,'eligible',settlement_minutes<=_minutes AND conversion+fee+500<=_budget,'reason',CASE WHEN settlement_minutes>_minutes THEN 'Fora do prazo solicitado' WHEN conversion+fee+500>_budget THEN 'Acima do orçamento total' ELSE 'Atende ao prazo e ao orçamento' END) ORDER BY id)
 INTO offers FROM (SELECT *,(_target*rate_ppm+999999)/1000000 AS conversion,greatest(minimum_fee_brl,floor(fee_brl*.4)::integer) AS fee FROM fx_suppliers WHERE active) s;
 SELECT value INTO selected FROM jsonb_array_elements(coalesce(offers,'[]')) WHERE (value->>'eligible')::boolean ORDER BY (value->>'totalBrlCents')::bigint,(value->>'settlementMinutes')::integer,value->>'supplierId' LIMIT 1;
 INSERT INTO fx_quotes(company_id,request_id,input,data) VALUES(_company,_request,payload,jsonb_build_object('offers',coalesce(offers,'[]'),'selected',selected,'simulation',true,'policy','Prazo obrigatório; menor custo total após contraproposta; desempate por prazo e identificador.')) RETURNING * INTO q;
 RETURN to_jsonb(q);
END $$;
CREATE FUNCTION public.fx_hire(_user uuid,_company uuid,_quote uuid,_authorized boolean,_test_failure boolean DEFAULT true,_mode text DEFAULT 'autonomous',_supplier text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q fx_quotes; o fx_orders; s jsonb; c jsonb; price bigint;
BEGIN
 PERFORM fx_owner(_user,_company);
 IF _authorized IS DISTINCT FROM true OR _mode NOT IN ('autonomous','manual') THEN RAISE EXCEPTION 'fx_authorization_required'; END IF;
 SELECT * INTO q FROM fx_quotes WHERE id=_quote AND company_id=_company FOR UPDATE;
 IF q.id IS NULL THEN RAISE EXCEPTION 'fx_quote_not_found'; END IF;
 SELECT * INTO o FROM fx_orders WHERE quote_id=q.id;
 IF o.id IS NOT NULL THEN
 IF o.mode<>_mode OR o.test_failure IS DISTINCT FROM _test_failure OR (_supplier IS NOT NULL AND o.contract->>'supplierId'<>_supplier) THEN RAISE EXCEPTION 'fx_idempotency_conflict'; END IF;
 RETURN o.id; END IF;
 IF q.expires_at<=now() THEN RAISE EXCEPTION 'fx_quote_expired'; END IF;
 IF _mode='autonomous' AND _supplier IS NOT NULL THEN RAISE EXCEPTION 'fx_manual_selection_not_allowed'; END IF;
 IF _mode='manual' THEN SELECT value INTO s FROM jsonb_array_elements(q.data->'offers') WHERE value->>'supplierId'=_supplier;
 ELSE s:=q.data->'selected'; END IF;
 IF s IS NULL OR s='null' OR (s->>'eligible')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'fx_no_eligible_offer'; END IF;
 IF NOT EXISTS(SELECT 1 FROM fx_suppliers WHERE id=s->>'supplierId' AND active) THEN RAISE EXCEPTION 'fx_supplier_unavailable'; END IF;
 price:=(s->>'totalBrlCents')::bigint;
 IF price>(q.input->>'maxTotalBrlCents')::bigint OR price<>(s->>'principalBrlCents')::bigint+500 THEN RAISE EXCEPTION 'fx_budget_exceeded'; END IF;
 PERFORM 1 FROM fx_wallets WHERE company_id=_company AND available_brl>=price FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'fx_insufficient_balance'; END IF;
 c:=s||jsonb_build_object('recipientCompanyId',_company,'sourceCurrency','BRL','targetCurrency','USD','quoteId',q.id,'quoteExpiresAt',q.expires_at,'maxTotalBrlCents',q.input->'maxTotalBrlCents','maxSettlementMinutes',q.input->'maxSettlementMinutes','simulation',true,'inference',q.inference,'policy',q.data->'policy');
 INSERT INTO fx_orders(company_id,quote_id,contract,mode,test_failure,deadline_at) VALUES(_company,q.id,c,_mode,_test_failure,now()+make_interval(mins=>(q.input->>'maxSettlementMinutes')::integer)) RETURNING * INTO o;
 UPDATE fx_wallets SET available_brl=available_brl-price,reserved_brl=reserved_brl+price WHERE company_id=_company;
 INSERT INTO fx_events(order_id,actor,type,detail) VALUES
 (o.id,'Comprador','offers_evaluated',q.data),
 (o.id,'Fornecedor','negotiated',s),
 (o.id,'Comprador','reserved',c||jsonb_build_object('authorized',true));
 RETURN o.id;
END $$;
CREATE FUNCTION public.fx_step(_user uuid,_company uuid,_order uuid,_human_accept boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o fx_orders; op fx_operations; r fx_receipts; vr fx_reports; b jsonb; checks jsonb; ok boolean; total bigint; target bigint;
BEGIN
 PERFORM fx_owner(_user,_company);
 SELECT * INTO o FROM fx_orders WHERE id=_order AND company_id=_company FOR UPDATE;
 IF o.id IS NULL THEN RAISE EXCEPTION 'fx_order_not_found'; END IF;
 IF o.status IN ('settled','cancelled','expired') THEN RETURN o.status; END IF;
 IF o.deadline_at<=now() THEN RETURN 'deadline_expired'; END IF;
 total:=(o.contract->>'totalBrlCents')::bigint; target:=(o.contract->>'targetUsdCents')::bigint;
 IF o.status='reserved' THEN
 INSERT INTO fx_operations(order_id,company_id,target_usd,principal_brl,status) VALUES(o.id,_company,target,(o.contract->>'principalBrlCents')::bigint,'pending') RETURNING * INTO op;
 b:=jsonb_build_object('operationId',op.operation_id,'orderId',o.id,'recipientCompanyId',_company,'targetCurrency','USD','targetUsdCents',target-CASE WHEN o.test_failure THEN 1000 ELSE 0 END,'principalBrlCents',op.principal_brl,'simulation',true);
 INSERT INTO fx_receipts VALUES(o.id,1,b,encode(sha256(convert_to(b::text,'UTF8')),'hex'),now());
 UPDATE fx_orders SET status='delivered',current_version=1 WHERE id=o.id;
 INSERT INTO fx_events(order_id,actor,type,detail) VALUES(o.id,'Simulador de liquidação','operation_pending',jsonb_build_object('operationId',op.operation_id)),(o.id,'Fornecedor','delivered',b||jsonb_build_object('version',1));
 RETURN 'delivered';
 ELSIF o.status IN ('delivered','corrected') THEN
 SELECT * INTO op FROM fx_operations WHERE order_id=o.id;
 SELECT * INTO r FROM fx_receipts WHERE order_id=o.id AND version=o.current_version;
 checks:=jsonb_build_array(
 jsonb_build_object('criterion','Identidade da operação','passed',coalesce(r.body->>'operationId'=op.operation_id::text AND r.body->>'orderId'=o.id::text,false)),
 jsonb_build_object('criterion','Carteira e moeda','passed',coalesce(r.body->>'recipientCompanyId'=_company::text AND op.company_id=_company AND r.body->>'targetCurrency'='USD',false)),
 jsonb_build_object('criterion','Valor líquido em USD','expected',target,'observed',r.body->'targetUsdCents','passed',coalesce(r.body->'targetUsdCents'=to_jsonb(target) AND op.target_usd=target,false)),
 jsonb_build_object('criterion','Custo contratado','passed',coalesce(r.body->'principalBrlCents'=o.contract->'principalBrlCents' AND op.principal_brl=(o.contract->>'principalBrlCents')::bigint AND total<=(o.contract->>'maxTotalBrlCents')::bigint,false)),
 jsonb_build_object('criterion','Registro pendente e prazo','passed',coalesce(op.status='pending' AND o.deadline_at>now(),false)),
 jsonb_build_object('criterion','Integridade do comprovante','passed',coalesce(r.sha256=encode(sha256(convert_to(r.body::text,'UTF8')),'hex'),false)));
 SELECT bool_and((value->>'passed')::boolean) INTO ok FROM jsonb_array_elements(checks);
 INSERT INTO fx_reports VALUES(o.id,o.current_version,r.sha256,CASE WHEN ok THEN 'approved' ELSE 'rejected' END,checks,now());
 UPDATE fx_orders SET status=CASE WHEN ok THEN 'approved' ELSE 'rejected' END WHERE id=o.id;
 INSERT INTO fx_events(order_id,actor,type,detail) VALUES(o.id,'Auditor','audited',jsonb_build_object('version',o.current_version,'decision',CASE WHEN ok THEN 'approved' ELSE 'rejected' END,'checks',checks,'engine','fx-record-audit-v1','tokens',0));
 RETURN CASE WHEN ok THEN 'approved' ELSE 'rejected' END;
 ELSIF o.status='rejected' THEN
 IF o.current_version>=2 THEN RETURN 'rejected'; END IF;
 SELECT * INTO op FROM fx_operations WHERE order_id=o.id;
 IF op.order_id IS NULL OR op.status<>'pending' THEN RETURN 'rejected'; END IF;
 -- Correction only repairs the document; the simulator operation never changes.
 b:=jsonb_build_object('operationId',op.operation_id,'orderId',o.id,'recipientCompanyId',_company,'targetCurrency','USD','targetUsdCents',target,'principalBrlCents',(o.contract->>'principalBrlCents')::bigint,'simulation',true);
 INSERT INTO fx_receipts VALUES(o.id,2,b,encode(sha256(convert_to(b::text,'UTF8')),'hex'),now());
 UPDATE fx_orders SET status='corrected',current_version=2 WHERE id=o.id;
 INSERT INTO fx_events(order_id,actor,type,detail) VALUES(o.id,'Comprador','correction_requested',jsonb_build_object('sameOperationId',op.operation_id,'newTransfer',false)),(o.id,'Fornecedor','delivered',b||jsonb_build_object('version',2));
 RETURN 'corrected';
 ELSIF o.status IN ('approved','awaiting_approval') THEN
 IF o.mode='manual' AND NOT _human_accept THEN UPDATE fx_orders SET status='awaiting_approval' WHERE id=o.id; RETURN 'awaiting_approval'; END IF;
 SELECT * INTO op FROM fx_operations WHERE order_id=o.id FOR UPDATE;
 SELECT * INTO r FROM fx_receipts WHERE order_id=o.id AND version=o.current_version;
 SELECT * INTO vr FROM fx_reports WHERE order_id=o.id AND version=o.current_version;
 IF vr.decision IS DISTINCT FROM 'approved' OR vr.receipt_sha256 IS DISTINCT FROM r.sha256 OR r.sha256 IS DISTINCT FROM encode(sha256(convert_to(r.body::text,'UTF8')),'hex') OR op.status IS DISTINCT FROM 'pending'
 OR op.company_id IS DISTINCT FROM _company OR op.target_usd IS DISTINCT FROM target OR op.principal_brl IS DISTINCT FROM (o.contract->>'principalBrlCents')::bigint
 OR r.body->>'operationId' IS DISTINCT FROM op.operation_id::text OR r.body->>'orderId' IS DISTINCT FROM o.id::text OR r.body->>'recipientCompanyId' IS DISTINCT FROM _company::text
 OR r.body->>'targetCurrency' IS DISTINCT FROM 'USD' OR r.body->'targetUsdCents' IS DISTINCT FROM to_jsonb(target) OR r.body->'principalBrlCents' IS DISTINCT FROM to_jsonb(op.principal_brl)
 OR total IS DISTINCT FROM op.principal_brl+500 OR total>(o.contract->>'maxTotalBrlCents')::bigint
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(vr.checks) WHERE (value->>'passed')::boolean IS DISTINCT FROM true) THEN RAISE EXCEPTION 'fx_verification_required'; END IF;
 UPDATE fx_wallets SET reserved_brl=reserved_brl-total,spent_brl=spent_brl+total,available_usd=available_usd+target WHERE company_id=_company AND reserved_brl>=total;
 IF NOT FOUND THEN RAISE EXCEPTION 'fx_reservation_missing'; END IF;
 INSERT INTO fx_ledger VALUES(o.id,o.contract->>'supplierId',op.principal_brl,500,target,now());
 UPDATE fx_operations SET status='settled' WHERE order_id=o.id;
 UPDATE fx_orders SET status='settled' WHERE id=o.id;
 INSERT INTO fx_events(order_id,actor,type,detail) VALUES(o.id,'Liquidação','settled',jsonb_build_object('totalBrlCents',total,'targetUsdCents',target,'platformFeeBrlCents',500,'humanAccepted',_human_accept,'simulation',true));
 RETURN 'settled';
 END IF;
 RETURN o.status;
END $$;
CREATE FUNCTION public.fx_cancel(_user uuid,_company uuid,_order uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o fx_orders;
BEGIN
 PERFORM fx_owner(_user,_company);
 SELECT * INTO o FROM fx_orders WHERE id=_order AND company_id=_company FOR UPDATE;
 IF o.id IS NULL THEN RAISE EXCEPTION 'fx_order_not_found'; END IF;
 IF o.status='settled' THEN RAISE EXCEPTION 'fx_already_settled'; END IF;
 IF o.status IN ('cancelled','expired') THEN RETURN o.status; END IF;
 IF EXISTS(SELECT 1 FROM fx_operations WHERE order_id=o.id AND status<>'pending') THEN RAISE EXCEPTION 'fx_operation_state_unknown'; END IF;
 UPDATE fx_wallets SET available_brl=available_brl+(o.contract->>'totalBrlCents')::bigint,reserved_brl=reserved_brl-(o.contract->>'totalBrlCents')::bigint WHERE company_id=_company;
 UPDATE fx_operations SET status='cancelled' WHERE order_id=o.id;
 UPDATE fx_orders SET status=CASE WHEN deadline_at<=now() THEN 'expired' ELSE 'cancelled' END WHERE id=o.id RETURNING * INTO o;
 INSERT INTO fx_events(order_id,actor,type,detail) VALUES(o.id,'Liquidação',o.status,jsonb_build_object('refundBrlCents',o.contract->'totalBrlCents'));
 RETURN o.status;
END $$;
CREATE FUNCTION public.fx_snapshot(_user uuid,_company uuid,_order uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o fx_orders;
BEGIN
 PERFORM fx_owner(_user,_company);
 IF _order IS NULL THEN RETURN jsonb_build_object('simulation',true,'wallet',(SELECT to_jsonb(w) FROM fx_wallets w WHERE company_id=_company),'orders',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,status,contract,created_at FROM fx_orders WHERE company_id=_company ORDER BY created_at DESC LIMIT 15) x)); END IF;
 SELECT * INTO o FROM fx_orders WHERE id=_order AND company_id=_company;
 IF o.id IS NULL THEN RAISE EXCEPTION 'fx_order_not_found'; END IF;
 RETURN jsonb_build_object('simulation',true,'order',to_jsonb(o),'wallet',(SELECT to_jsonb(w) FROM fx_wallets w WHERE company_id=_company),
 'quote',(SELECT to_jsonb(q) FROM fx_quotes q WHERE id=o.quote_id),
 'operation',(SELECT to_jsonb(p) FROM fx_operations p WHERE order_id=o.id),
 'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY version),'[]') FROM fx_receipts r WHERE order_id=o.id),
 'reports',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY version),'[]') FROM fx_reports r WHERE order_id=o.id),
 'events',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]') FROM fx_events e WHERE order_id=o.id),
 'ledger',(SELECT to_jsonb(l) FROM fx_ledger l WHERE order_id=o.id));
END $$;
REVOKE ALL ON FUNCTION fx_owner(uuid,uuid),fx_quote(uuid,uuid,uuid,bigint,bigint,integer),fx_hire(uuid,uuid,uuid,boolean,boolean,text,text),fx_step(uuid,uuid,uuid,boolean),fx_cancel(uuid,uuid,uuid),fx_snapshot(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION fx_owner(uuid,uuid),fx_quote(uuid,uuid,uuid,bigint,bigint,integer),fx_hire(uuid,uuid,uuid,boolean,boolean,text,text),fx_step(uuid,uuid,uuid,boolean),fx_cancel(uuid,uuid,uuid),fx_snapshot(uuid,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
