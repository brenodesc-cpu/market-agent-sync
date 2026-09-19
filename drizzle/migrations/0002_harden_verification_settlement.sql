-- Contract criteria: nonempty [{"criterion":"unique name","expected":<non-null JSON>}].
-- Report checks: the exact same names and expected values, each with status="passed".
-- Unsupported legacy formats fail closed. Reports are written only by the server.
REVOKE INSERT ON public.verification_reports FROM authenticated;
DROP POLICY IF EXISTS reports_verifier_insert ON public.verification_reports;

DROP POLICY IF EXISTS contracts_auth ON public.contracts;
CREATE POLICY contracts_auth ON public.contracts FOR SELECT TO authenticated USING (
  public.is_company_member(buyer_company_id,auth.uid())
  OR public.is_company_member(supplier_company_id,auth.uid())
  OR public.has_role(auth.uid(),'verifier')
  OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.is_demo)
);

DROP POLICY IF EXISTS deliveries_supplier_insert ON public.deliveries;
CREATE POLICY deliveries_supplier_insert ON public.deliveries FOR INSERT TO authenticated
WITH CHECK (
  public.is_company_member(submitted_by_company_id, auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND o.supplier_company_id = submitted_by_company_id
      AND o.status NOT IN ('draft', 'settled', 'cancelled', 'expired')
  )
);

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
    price_units,commission_bps,deadline_at,order_data,acceptance_criteria,revision_limit,cancellation_policy)
  VALUES(o.id,v.id,o.buyer_company_id,f.company_id,v.price_units,1000,
    now()+(v.deadline_hours||' hours')::interval,o.brief,v.acceptance_criteria,v.revision_limit,v.cancellation_policy);
  UPDATE public.orders SET supplier_company_id=f.company_id,status='contracted',
    selected_reason='Oferta compatível com os critérios e teto autorizado.',updated_at=now() WHERE id=o.id;
  -- Caller keys remain accepted for RPC compatibility; the order defines financial identity.
  INSERT INTO public.ledger_entries(company_id,order_id,entry_type,amount_units,idempotency_key,description)
  VALUES(o.buyer_company_id,o.id,'reservation',v.price_units,'order:'||o.id||':reservation','Reserva para contrato simulado');
  INSERT INTO public.order_events(order_id,actor_type,actor_label,event_type,result)
  VALUES(o.id,'agent','Gerente comprador','contracted','Oferta escolhida e saldo reservado');
  RETURN jsonb_build_object('status','contracted','reserved_units',v.price_units);
END$$;
REVOKE ALL ON FUNCTION public.reserve_demo_order(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_demo_order(uuid,uuid,text) TO service_role;

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

  -- Lock shared accounts in a stable order for simultaneous orders between the same companies.
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
