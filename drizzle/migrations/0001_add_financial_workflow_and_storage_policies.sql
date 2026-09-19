CREATE OR REPLACE FUNCTION public.reserve_demo_order(_order_id uuid,_offer_version_id uuid,_idempotency_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; v public.offer_versions; f public.offers; a public.accounts;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF o.id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
 IF o.status<>'draft' THEN RETURN jsonb_build_object('status',o.status); END IF;
 SELECT * INTO v FROM public.offer_versions WHERE id=_offer_version_id AND available=true;
 IF v.id IS NULL THEN RAISE EXCEPTION 'offer_unavailable'; END IF;
 SELECT * INTO f FROM public.offers WHERE id=v.offer_id AND published=true;
 IF f.id IS NULL OR f.id<>o.offer_id THEN RAISE EXCEPTION 'offer_mismatch'; END IF;
 IF v.price_units>o.budget_cap_units THEN RAISE EXCEPTION 'budget_cap_exceeded'; END IF;
 SELECT * INTO a FROM public.accounts WHERE company_id=o.buyer_company_id FOR UPDATE;
 IF a.available_units<v.price_units THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
 UPDATE public.accounts SET available_units=available_units-v.price_units,reserved_units=reserved_units+v.price_units,updated_at=now() WHERE id=a.id;
 INSERT INTO public.contracts(order_id,offer_version_id,buyer_company_id,supplier_company_id,price_units,commission_bps,deadline_at,order_data,acceptance_criteria,revision_limit,cancellation_policy)
 VALUES(o.id,v.id,o.buyer_company_id,f.company_id,v.price_units,1000,now()+(v.deadline_hours||' hours')::interval,o.brief,v.acceptance_criteria,v.revision_limit,v.cancellation_policy);
 UPDATE public.orders SET supplier_company_id=f.company_id,status='contracted',selected_reason='Oferta compatível com o formato, prazo e teto autorizado.',updated_at=now() WHERE id=o.id;
 INSERT INTO public.ledger_entries(company_id,order_id,entry_type,amount_units,idempotency_key,description) VALUES(o.buyer_company_id,o.id,'reservation',v.price_units,_idempotency_key,'Reserva para contrato simulado');
 INSERT INTO public.order_events(order_id,actor_type,actor_label,event_type,result) VALUES(o.id,'agent','Gerente comprador','contracted','Oferta escolhida e saldo reservado');
 RETURN jsonb_build_object('status','contracted','reserved_units',v.price_units);
END$$;
REVOKE ALL ON FUNCTION public.reserve_demo_order(uuid,uuid,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.reserve_demo_order(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_verified_order(_order_id uuid,_idempotency_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; c public.contracts; r public.verification_reports; b public.accounts; s public.accounts; p public.accounts; fee integer; payout integer;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF o.id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
 IF o.status='settled' THEN RETURN jsonb_build_object('status','already_settled'); END IF;
 IF o.status IN ('cancelled','expired') THEN RAISE EXCEPTION 'closed_order'; END IF;
 SELECT * INTO c FROM public.contracts WHERE order_id=_order_id;
 SELECT * INTO r FROM public.verification_reports WHERE order_id=_order_id AND delivery_version=o.current_delivery_version ORDER BY created_at DESC LIMIT 1;
 IF r.id IS NULL OR r.decision<>'approved' THEN RAISE EXCEPTION 'approved_current_verification_required'; END IF;
 SELECT * INTO b FROM public.accounts WHERE company_id=c.buyer_company_id FOR UPDATE;
 SELECT * INTO s FROM public.accounts WHERE company_id=c.supplier_company_id FOR UPDATE;
 SELECT * INTO p FROM public.accounts WHERE company_id='00000000-0000-0000-0000-000000000004' FOR UPDATE;
 IF b.reserved_units<c.price_units THEN RAISE EXCEPTION 'insufficient_reserve'; END IF;
 fee := (c.price_units*c.commission_bps)/10000; payout := c.price_units-fee;
 UPDATE public.accounts SET reserved_units=reserved_units-c.price_units,paid_units=paid_units+c.price_units,updated_at=now() WHERE id=b.id;
 UPDATE public.accounts SET received_units=received_units+payout,updated_at=now() WHERE id=s.id;
 UPDATE public.accounts SET commission_units=commission_units+fee,received_units=received_units+fee,updated_at=now() WHERE id=p.id;
 INSERT INTO public.ledger_entries(company_id,order_id,entry_type,amount_units,idempotency_key,description) VALUES
 (c.buyer_company_id,_order_id,'payment',c.price_units,_idempotency_key||':buyer','Pagamento simulado liquidado'),
 (c.supplier_company_id,_order_id,'receipt',payout,_idempotency_key||':supplier','Recebimento líquido simulado'),
 ('00000000-0000-0000-0000-000000000004',_order_id,'commission',fee,_idempotency_key||':platform','Comissão simulada de 10%') ON CONFLICT(idempotency_key) DO NOTHING;
 UPDATE public.orders SET status='settled',updated_at=now() WHERE id=_order_id;
 INSERT INTO public.order_events(order_id,actor_type,actor_label,event_type,result) VALUES(_order_id,'finance','Serviço financeiro','settled','Pagamento liquidado uma única vez');
 RETURN jsonb_build_object('status','settled','payout_units',payout,'commission_units',fee);
END$$;
REVOKE ALL ON FUNCTION public.settle_verified_order(uuid,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.settle_verified_order(uuid,text) TO service_role;

CREATE POLICY "delivery_objects_read" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='deliveries' AND EXISTS(SELECT 1 FROM public.deliveries d JOIN public.orders o ON o.id=d.order_id WHERE d.storage_path=name AND (public.is_company_member(o.buyer_company_id,auth.uid()) OR public.is_company_member(o.supplier_company_id,auth.uid()) OR public.has_role(auth.uid(),'verifier'))));
CREATE POLICY "delivery_objects_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='deliveries' AND (storage.foldername(name))[1] IN (SELECT c.id::text FROM public.companies c WHERE public.is_company_member(c.id,auth.uid())));