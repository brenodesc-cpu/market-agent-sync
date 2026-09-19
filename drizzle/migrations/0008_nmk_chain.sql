-- NMK is an additive signed record, operated by one PoA authority.
-- The existing financial functions and ledger remain the source of truth.
CREATE TABLE IF NOT EXISTS public.chain_blocks (
  height integer PRIMARY KEY CHECK (height >= 0),
  chain_id text NOT NULL CHECK (chain_id = 'nmk-devnet-1'),
  prev_hash text NOT NULL CHECK (prev_hash ~ '^[0-9a-f]{64}$'),
  merkle_root text NOT NULL CHECK (merkle_root ~ '^[0-9a-f]{64}$'),
  block_hash text NOT NULL UNIQUE CHECK (block_hash ~ '^[0-9a-f]{64}$'),
  tx_count integer NOT NULL CHECK (tx_count >= 0),
  validator text NOT NULL CHECK (validator ~ '^nmk1[0-9a-f]{44}$'),
  sealed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.chain_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('company','treasury','custody')),
  address text NOT NULL UNIQUE CHECK (address ~ '^nmk1[0-9a-f]{44}$'),
  public_key text NOT NULL UNIQUE CHECK (public_key ~ '^([0-9a-f]{2})+$'),
  key_version integer NOT NULL DEFAULT 1 CHECK (key_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'company') = (company_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS chain_wallets_system_kind ON public.chain_wallets(kind) WHERE company_id IS NULL;
CREATE TABLE IF NOT EXISTS public.chain_wallet_keys (
  wallet_id uuid PRIMARY KEY REFERENCES public.chain_wallets(id) ON DELETE CASCADE,
  encrypted_private_key text NOT NULL CHECK (encrypted_private_key ~ '^([0-9a-f]{2})+$'),
  iv text NOT NULL CHECK (iv ~ '^[0-9a-f]{24}$'),
  auth_tag text NOT NULL CHECK (auth_tag ~ '^[0-9a-f]{32}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.chain_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txid text NOT NULL UNIQUE CHECK (txid ~ '^[0-9a-f]{64}$'),
  chain_id text NOT NULL CHECK (chain_id = 'nmk-devnet-1'),
  type text NOT NULL CHECK (type IN ('MINT','TRANSFER','FEE','RESERVE','RELEASE','ANCHOR')),
  from_address text CHECK (from_address ~ '^nmk1[0-9a-f]{44}$'),
  to_address text CHECK (to_address ~ '^nmk1[0-9a-f]{44}$'),
  amount_units bigint NOT NULL CHECK (amount_units BETWEEN 0 AND 9007199254740991),
  nonce integer NOT NULL CHECK (nonce >= 0),
  ref_kind text CHECK (ref_kind IN ('genesis','order','delivery','report','treasury')),
  ref_id text,
  payload_hash text CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  memo text NOT NULL CHECK (char_length(memo) <= 200),
  issued_at timestamptz NOT NULL,
  signature text NOT NULL CHECK (signature ~ '^([0-9a-f]{2})+$'),
  public_key text NOT NULL CHECK (public_key ~ '^([0-9a-f]{2})+$'),
  canonical text NOT NULL,
  block_height integer REFERENCES public.chain_blocks(height),
  block_index integer CHECK (block_index >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sealed')),
  idempotency_key text NOT NULL UNIQUE CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(public_key, nonce),
  UNIQUE(block_height, block_index),
  CHECK ((status = 'pending' AND block_height IS NULL AND block_index IS NULL)
    OR (status = 'sealed' AND block_height IS NOT NULL AND block_index IS NOT NULL)),
  CHECK (
    (type = 'MINT' AND from_address IS NULL AND to_address IS NOT NULL AND amount_units > 0)
    OR (type IN ('TRANSFER','FEE','RESERVE','RELEASE') AND from_address IS NOT NULL
      AND to_address IS NOT NULL AND from_address <> to_address AND amount_units > 0)
    OR (type = 'ANCHOR' AND from_address IS NOT NULL AND to_address IS NULL
      AND amount_units = 0 AND payload_hash IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS chain_transactions_pending ON public.chain_transactions(created_at, id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS chain_transactions_from ON public.chain_transactions(from_address);
CREATE INDEX IF NOT EXISTS chain_transactions_to ON public.chain_transactions(to_address);
CREATE INDEX IF NOT EXISTS chain_transactions_reference ON public.chain_transactions(ref_kind, ref_id);
CREATE TABLE IF NOT EXISTS public.chain_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_height integer NOT NULL REFERENCES public.chain_blocks(height),
  network text NOT NULL,
  external_tx_hash text,
  status text NOT NULL CHECK (status IN ('unavailable','pending','submitted','confirmed','failed')),
  safe_message text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('submitted','confirmed') OR (external_tx_hash IS NOT NULL AND length(btrim(external_tx_hash)) > 0))
);
CREATE INDEX IF NOT EXISTS chain_anchors_height ON public.chain_anchors(block_height, created_at DESC);

ALTER TABLE public.chain_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_wallet_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_anchors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chain_blocks, public.chain_transactions, public.chain_wallets,
  public.chain_wallet_keys, public.chain_anchors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.chain_blocks, public.chain_transactions, public.chain_anchors TO anon, authenticated;
GRANT SELECT ON public.chain_wallets TO authenticated;
GRANT ALL ON public.chain_blocks, public.chain_transactions, public.chain_wallets,
  public.chain_wallet_keys, public.chain_anchors TO service_role;
DROP POLICY IF EXISTS chain_blocks_public ON public.chain_blocks;
CREATE POLICY chain_blocks_public ON public.chain_blocks FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS chain_transactions_public ON public.chain_transactions;
CREATE POLICY chain_transactions_public ON public.chain_transactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS chain_anchors_public ON public.chain_anchors;
CREATE POLICY chain_anchors_public ON public.chain_anchors FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS chain_wallets_member ON public.chain_wallets;
CREATE POLICY chain_wallets_member ON public.chain_wallets FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, (SELECT auth.uid())));
-- Deliberately NO policies on chain_wallet_keys, including after a repeat application.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='chain_wallet_keys'
  LOOP EXECUTE format('DROP POLICY %I ON public.chain_wallet_keys', p.policyname); END LOOP;
END $$;
DROP TRIGGER IF EXISTS chain_blocks_immutable ON public.chain_blocks;
CREATE TRIGGER chain_blocks_immutable BEFORE UPDATE OR DELETE ON public.chain_blocks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_changes();
DROP TRIGGER IF EXISTS chain_transactions_immutable ON public.chain_transactions;
CREATE TRIGGER chain_transactions_immutable BEFORE UPDATE OR DELETE ON public.chain_transactions
  FOR EACH ROW WHEN (OLD.status='sealed') EXECUTE FUNCTION public.prevent_immutable_changes();

-- All chain writers share this transaction lock, including wallet creation and finance wrappers.
-- Functions are SECURITY INVOKER and only service_role has EXECUTE.
CREATE OR REPLACE FUNCTION public.chain_create_wallet(
  _company_id uuid, _kind text, _address text, _public_key text,
  _encrypted_private_key text, _iv text, _auth_tag text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE w public.chain_wallets; body text;
BEGIN
  PERFORM pg_advisory_xact_lock(784551);
  SELECT * INTO w FROM public.chain_wallets
    WHERE kind=_kind AND company_id IS NOT DISTINCT FROM _company_id;
  IF w.id IS NOT NULL THEN RETURN w.id; END IF;
  body := left(encode(sha256(decode(_public_key,'hex')),'hex'),40);
  IF _address IS DISTINCT FROM 'nmk1'||body||left(encode(sha256(convert_to(body,'UTF8')),'hex'),4)
  THEN RAISE EXCEPTION 'Endereço NMK inválido.'; END IF;
  INSERT INTO public.chain_wallets(company_id,kind,address,public_key)
    VALUES(_company_id,_kind,_address,_public_key) RETURNING * INTO w;
  INSERT INTO public.chain_wallet_keys(wallet_id,encrypted_private_key,iv,auth_tag)
    VALUES(w.id,_encrypted_private_key,_iv,_auth_tag);
  RETURN w.id;
END $$;

CREATE OR REPLACE FUNCTION public.chain_append_transactions(_chain_txs jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE x jsonb; p jsonb; expected jsonb; canonical_text text; w public.chain_wallets;
  old public.chain_transactions; next_nonce bigint; balance numeric; destination_balance numeric;
  inserted jsonb := '[]'::jsonb; inserted_at timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(784551);
  IF _chain_txs IS NULL THEN RETURN inserted; END IF;
  IF jsonb_typeof(_chain_txs) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Lista de transações NMK inválida.'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(_chain_txs) LOOP
    IF jsonb_typeof(x) IS DISTINCT FROM 'object'
      OR jsonb_typeof(x->'canonical') IS DISTINCT FROM 'string'
      OR jsonb_typeof(x->'public_key') IS DISTINCT FROM 'string'
      OR jsonb_typeof(x->'signature') IS DISTINCT FROM 'string'
      OR jsonb_typeof(x->'txid') IS DISTINCT FROM 'string'
      OR jsonb_typeof(x->'idempotency_key') IS DISTINCT FROM 'string'
      OR length(btrim(x->>'idempotency_key')) NOT BETWEEN 1 AND 300
    THEN RAISE EXCEPTION 'Envelope NMK inválido.'; END IF;
    p := (x->>'canonical')::jsonb;
    IF jsonb_typeof(p) IS DISTINCT FROM 'object'
      OR jsonb_typeof(p->'amount') IS DISTINCT FROM 'number'
      OR jsonb_typeof(p->'nonce') IS DISTINCT FROM 'number'
      OR jsonb_typeof(p->'memo') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p->'issued_at') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p->'type') IS DISTINCT FROM 'string'
      OR p->>'chain_id' IS DISTINCT FROM 'nmk-devnet-1'
      OR (p->>'amount') !~ '^(0|[1-9][0-9]*)$'
      OR (p->>'nonce') !~ '^(0|[1-9][0-9]*)$'
      OR (p->>'issued_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      OR jsonb_typeof(p->'from') NOT IN ('string','null')
      OR jsonb_typeof(p->'to') NOT IN ('string','null')
      OR jsonb_typeof(p->'payload_hash') NOT IN ('string','null')
      OR jsonb_typeof(p->'ref_kind') NOT IN ('string','null')
      OR jsonb_typeof(p->'ref_id') NOT IN ('string','null')
    THEN RAISE EXCEPTION 'Conteúdo NMK inválido.'; END IF;
    expected := jsonb_build_object('amount',p->'amount','chain_id',p->'chain_id','from',p->'from',
      'issued_at',p->'issued_at','memo',p->'memo','nonce',p->'nonce','payload_hash',p->'payload_hash',
      'ref_id',p->'ref_id','ref_kind',p->'ref_kind','to',p->'to','type',p->'type');
    SELECT '{'||string_agg(to_json(key)::text||':'||value::text,',' ORDER BY key COLLATE "C")||'}'
      INTO canonical_text FROM jsonb_each(expected);
    IF p IS DISTINCT FROM expected OR canonical_text IS DISTINCT FROM x->>'canonical'
      OR encode(sha256(convert_to(canonical_text,'UTF8')),'hex') IS DISTINCT FROM x->>'txid'
      OR x->>'chain_id' IS DISTINCT FROM p->>'chain_id'
      OR x->>'type' IS DISTINCT FROM p->>'type'
      OR x->'amount_units' IS DISTINCT FROM p->'amount'
      OR x->'from_address' IS DISTINCT FROM p->'from'
      OR x->'to_address' IS DISTINCT FROM p->'to'
      OR x->'nonce' IS DISTINCT FROM p->'nonce'
      OR x->'ref_kind' IS DISTINCT FROM p->'ref_kind'
      OR x->'ref_id' IS DISTINCT FROM p->'ref_id'
      OR x->'payload_hash' IS DISTINCT FROM p->'payload_hash'
      OR x->'memo' IS DISTINCT FROM p->'memo'
      OR x->'issued_at' IS DISTINCT FROM p->'issued_at'
    THEN RAISE EXCEPTION 'Forma canônica NMK inconsistente.'; END IF;
    SELECT * INTO old FROM public.chain_transactions WHERE idempotency_key=x->>'idempotency_key';
    IF old.id IS NOT NULL THEN
      IF old.txid IS DISTINCT FROM x->>'txid' OR old.public_key IS DISTINCT FROM x->>'public_key'
      THEN RAISE EXCEPTION 'Conflito de idempotência NMK.'; END IF;
      inserted := inserted || jsonb_build_array(old.txid);
      CONTINUE;
    END IF;
    SELECT * INTO w FROM public.chain_wallets WHERE public_key=x->>'public_key';
    IF w.id IS NULL OR (p->>'type'='MINT' AND w.kind<>'treasury')
      OR (p->>'type'<>'MINT' AND w.address IS DISTINCT FROM p->>'from')
      OR (p->>'type'='RESERVE' AND (w.kind<>'company' OR NOT EXISTS (
        SELECT 1 FROM public.chain_wallets WHERE kind='custody' AND address=p->>'to')))
      OR (p->>'type'='RELEASE' AND (w.kind<>'custody' OR NOT EXISTS (
        SELECT 1 FROM public.chain_wallets WHERE kind='company' AND address=p->>'to')))
    THEN RAISE EXCEPTION 'Autoridade da transação NMK inválida.'; END IF;
    SELECT coalesce(max(nonce)::bigint+1,0) INTO next_nonce FROM public.chain_transactions WHERE public_key=w.public_key;
    IF next_nonce IS DISTINCT FROM (p->>'nonce')::bigint THEN RAISE EXCEPTION 'NMK_NONCE_CONFLICT'; END IF;
    IF p->>'type' NOT IN ('MINT','ANCHOR') THEN
      SELECT coalesce(sum(CASE WHEN to_address=w.address THEN amount_units ELSE 0 END
        - CASE WHEN from_address=w.address THEN amount_units ELSE 0 END),0) INTO balance
        FROM public.chain_transactions WHERE from_address=w.address OR to_address=w.address;
      IF balance < (p->>'amount')::numeric THEN RAISE EXCEPTION 'Saldo NMK insuficiente.'; END IF;
    END IF;
    IF p->>'to' IS NOT NULL THEN
      SELECT coalesce(sum(CASE WHEN to_address=p->>'to' THEN amount_units ELSE 0 END
        - CASE WHEN from_address=p->>'to' THEN amount_units ELSE 0 END),0) INTO destination_balance
        FROM public.chain_transactions WHERE from_address=p->>'to' OR to_address=p->>'to';
      IF destination_balance+(p->>'amount')::numeric > 9007199254740991
      THEN RAISE EXCEPTION 'Saldo NMK fora do limite seguro.'; END IF;
    END IF;
    -- Preserve commit order even for multiple entries sharing a timestamp or a clock adjustment.
    SELECT greatest(clock_timestamp(),coalesce(max(created_at)+interval '1 microsecond',clock_timestamp()))
      INTO inserted_at FROM public.chain_transactions;
    INSERT INTO public.chain_transactions(txid,chain_id,type,from_address,to_address,amount_units,nonce,
      ref_kind,ref_id,payload_hash,memo,issued_at,signature,public_key,canonical,idempotency_key,created_at)
    VALUES(x->>'txid',p->>'chain_id',p->>'type',p->>'from',p->>'to',(p->>'amount')::bigint,(p->>'nonce')::integer,
      p->>'ref_kind',p->>'ref_id',p->>'payload_hash',p->>'memo',(p->>'issued_at')::timestamptz,
      x->>'signature',x->>'public_key',canonical_text,x->>'idempotency_key',inserted_at);
    inserted := inserted || jsonb_build_array(x->>'txid');
  END LOOP;
  RETURN inserted;
END $$;

CREATE OR REPLACE FUNCTION public.reserve_demo_order_nmk(
  _order_id uuid, _offer_version_id uuid, _idempotency_key text, _chain_txs jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; c public.contracts; buyer text; custody text; x jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(784551);
  result := public.reserve_demo_order(_order_id,_offer_version_id,_idempotency_key);
  IF _chain_txs IS NULL OR _chain_txs='[]'::jsonb THEN RETURN result; END IF;
  IF jsonb_typeof(_chain_txs) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Lista de transações NMK inválida.'; END IF;
  IF jsonb_array_length(_chain_txs)<>1 THEN RAISE EXCEPTION 'A contratação exige uma reserva NMK.'; END IF;
  SELECT * INTO c FROM public.contracts WHERE order_id=_order_id;
  SELECT address INTO buyer FROM public.chain_wallets WHERE company_id=c.buyer_company_id;
  SELECT address INTO custody FROM public.chain_wallets WHERE kind='custody';
  x := _chain_txs->0;
  IF result->>'status' IS DISTINCT FROM 'contracted' OR buyer IS NULL OR custody IS NULL
    OR x->>'type' IS DISTINCT FROM 'RESERVE' OR x->>'from_address' IS DISTINCT FROM buyer
    OR x->>'to_address' IS DISTINCT FROM custody OR (x->>'amount_units')::bigint IS DISTINCT FROM c.price_units::bigint
    OR x->>'ref_kind' IS DISTINCT FROM 'order' OR x->>'ref_id' IS DISTINCT FROM _order_id::text
    OR x->>'idempotency_key' IS DISTINCT FROM 'order:'||_order_id||':reservation'
  THEN RAISE EXCEPTION 'A reserva NMK não corresponde ao contrato.'; END IF;
  PERFORM public.chain_append_transactions(_chain_txs);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.settle_verified_order_nmk(
  _order_id uuid, _idempotency_key text, _chain_txs jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; c public.contracts; supplier text; platform text; custody text;
  fee bigint; payout bigint; x jsonb; transfers integer:=0; fees integer:=0;
BEGIN
  PERFORM pg_advisory_xact_lock(784551);
  result := public.settle_verified_order(_order_id,_idempotency_key);
  IF _chain_txs IS NULL OR _chain_txs='[]'::jsonb THEN RETURN result; END IF;
  IF jsonb_typeof(_chain_txs) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Lista de transações NMK inválida.'; END IF;
  SELECT * INTO c FROM public.contracts WHERE order_id=_order_id;
  SELECT address INTO supplier FROM public.chain_wallets WHERE company_id=c.supplier_company_id;
  SELECT address INTO platform FROM public.chain_wallets WHERE company_id='00000000-0000-0000-0000-000000000004';
  SELECT address INTO custody FROM public.chain_wallets WHERE kind='custody';
  fee := c.price_units::bigint*c.commission_bps/10000;
  payout := c.price_units-fee;
  IF custody IS NULL OR (payout>0 AND supplier IS NULL) OR (fee>0 AND platform IS NULL)
  THEN RAISE EXCEPTION 'Carteiras de liquidação NMK indisponíveis.'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(_chain_txs) LOOP
    IF x->>'from_address' IS DISTINCT FROM custody OR x->>'ref_kind' IS DISTINCT FROM 'order'
      OR x->>'ref_id' IS DISTINCT FROM _order_id::text
    THEN RAISE EXCEPTION 'Referência de liquidação NMK inválida.'; END IF;
    IF x->>'type'='TRANSFER' AND payout>0 AND x->>'to_address'=supplier
      AND (x->>'amount_units')::bigint=payout AND x->>'idempotency_key'='order:'||_order_id||':settlement:transfer'
    THEN transfers := transfers+1;
    ELSIF x->>'type'='FEE' AND fee>0 AND x->>'to_address'=platform
      AND (x->>'amount_units')::bigint=fee AND x->>'idempotency_key'='order:'||_order_id||':settlement:fee'
    THEN fees := fees+1;
    ELSE RAISE EXCEPTION 'Valor ou destino de liquidação NMK inválido.';
    END IF;
  END LOOP;
  IF transfers<>(CASE WHEN payout>0 THEN 1 ELSE 0 END) OR fees<>(CASE WHEN fee>0 THEN 1 ELSE 0 END)
  THEN RAISE EXCEPTION 'A liquidação NMK deve registrar repasse e comissão uma única vez.'; END IF;
  PERFORM public.chain_append_transactions(_chain_txs);
  RETURN result;
END $$;

-- One MVCC statement returns a complete audit snapshot, without PostgREST's row-page limit.
CREATE OR REPLACE FUNCTION public.studio_cancel_order_nmk(_user uuid, _order uuid, _chain_txs jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; c public.contracts; buyer text; custody text; x jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(784551);
  result := public.studio_cancel_order(_user,_order);
  -- A repeat or an already expired order did not perform a refund. Never append another RELEASE.
  IF NOT (result ? 'refunded') OR coalesce((result->>'refunded')::bigint,0)<=0 THEN RETURN result; END IF;
  IF _chain_txs IS NULL OR _chain_txs='[]'::jsonb THEN RETURN result; END IF;
  IF jsonb_typeof(_chain_txs) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Lista de transações NMK inválida.'; END IF;
  IF jsonb_array_length(_chain_txs)<>1 THEN RAISE EXCEPTION 'O cancelamento exige uma devolução NMK.'; END IF;
  SELECT * INTO c FROM public.contracts WHERE order_id=_order;
  SELECT address INTO buyer FROM public.chain_wallets WHERE company_id=c.buyer_company_id;
  SELECT address INTO custody FROM public.chain_wallets WHERE kind='custody';
  x:=_chain_txs->0;
  IF buyer IS NULL OR custody IS NULL OR x->>'type' IS DISTINCT FROM 'RELEASE'
    OR x->>'from_address' IS DISTINCT FROM custody OR x->>'to_address' IS DISTINCT FROM buyer
    OR (x->>'amount_units')::bigint IS DISTINCT FROM (result->>'refunded')::bigint
    OR x->>'ref_kind' IS DISTINCT FROM 'order' OR x->>'ref_id' IS DISTINCT FROM _order::text
    OR x->>'idempotency_key' IS DISTINCT FROM 'order:'||_order||':release'
  THEN RAISE EXCEPTION 'A devolução NMK não corresponde ao cancelamento.'; END IF;
  PERFORM public.chain_append_transactions(_chain_txs);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.chain_snapshot()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object(
    'blocks',coalesce((SELECT jsonb_agg(b ORDER BY height) FROM public.chain_blocks b),'[]'::jsonb),
    'transactions',coalesce((SELECT jsonb_agg(t ORDER BY created_at,id) FROM public.chain_transactions t),'[]'::jsonb),
    'wallets',coalesce((SELECT jsonb_agg(jsonb_build_object('company_id',company_id,'address',address,'kind',kind)) FROM public.chain_wallets),'[]'::jsonb),
    'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('company_id',a.company_id,'available_units',a.available_units,'reserved_units',a.reserved_units))
      FROM public.accounts a JOIN public.chain_wallets w ON w.company_id=a.company_id),'[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.chain_seal_block(_block jsonb, _txids jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE head public.chain_blocks; expected_ids jsonb; treasury text; x text; i integer:=0;
  header jsonb; canonical_header text; nodes bytea[]; next_nodes bytea[]; j integer; root text;
BEGIN
  PERFORM pg_advisory_xact_lock(784551);
  SELECT * INTO head FROM public.chain_blocks ORDER BY height DESC LIMIT 1;
  SELECT address INTO treasury FROM public.chain_wallets WHERE kind='treasury';
  IF treasury IS NULL OR _block->>'validator' IS DISTINCT FROM treasury
    OR _block->>'chain_id' IS DISTINCT FROM 'nmk-devnet-1'
    OR (_block->>'height')::integer IS DISTINCT FROM coalesce(head.height+1,0)
    OR _block->>'prev_hash' IS DISTINCT FROM coalesce(head.block_hash,repeat('0',64))
  THEN RAISE EXCEPTION 'A cadeia mudou durante a selagem. Tente novamente.'; END IF;
  IF jsonb_typeof(_txids) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Transações de bloco inválidas.'; END IF;
  SELECT coalesce(jsonb_agg(txid ORDER BY created_at,id),'[]'::jsonb) INTO expected_ids
    FROM public.chain_transactions WHERE status='pending';
  -- Empty genesis precedes pending entries. Subsequent blocks consume the complete pending snapshot.
  IF head.height IS NULL THEN
    IF _txids<>'[]'::jsonb THEN RAISE EXCEPTION 'A gênese deve iniciar vazia.'; END IF;
  ELSIF _txids IS DISTINCT FROM expected_ids OR _txids='[]'::jsonb
  THEN RAISE EXCEPTION 'As transações pendentes mudaram durante a selagem. Tente novamente.'; END IF;
  IF (_block->>'tx_count')::integer IS DISTINCT FROM jsonb_array_length(_txids)
  THEN RAISE EXCEPTION 'Quantidade de transações inválida.'; END IF;
  SELECT array_agg(decode(value,'hex') ORDER BY ord) INTO nodes
    FROM jsonb_array_elements_text(_txids) WITH ORDINALITY AS t(value,ord);
  WHILE coalesce(array_length(nodes,1),0)>1 LOOP
    next_nodes := ARRAY[]::bytea[];
    j:=1;
    WHILE j<=array_length(nodes,1) LOOP
      next_nodes:=array_append(next_nodes,sha256(nodes[j]||coalesce(nodes[j+1],nodes[j])));
      j:=j+2;
    END LOOP;
    nodes:=next_nodes;
  END LOOP;
  root:=coalesce(encode(nodes[1],'hex'),repeat('0',64));
  IF _block->>'merkle_root' IS DISTINCT FROM root THEN RAISE EXCEPTION 'Raiz Merkle inválida.'; END IF;
  header:=jsonb_build_object('chain_id',_block->'chain_id','height',_block->'height','merkle_root',_block->'merkle_root',
    'prev_hash',_block->'prev_hash','sealed_at',_block->'sealed_at','tx_count',_block->'tx_count','validator',_block->'validator');
  SELECT '{'||string_agg(to_json(key)::text||':'||value::text,',' ORDER BY key COLLATE "C")||'}'
    INTO canonical_header FROM jsonb_each(header);
  IF _block->>'block_hash' IS DISTINCT FROM encode(sha256(convert_to(canonical_header,'UTF8')),'hex')
  THEN RAISE EXCEPTION 'Hash de bloco inválido.'; END IF;
  INSERT INTO public.chain_blocks(height,chain_id,prev_hash,merkle_root,block_hash,tx_count,validator,sealed_at)
    VALUES((_block->>'height')::integer,_block->>'chain_id',_block->>'prev_hash',_block->>'merkle_root',
      _block->>'block_hash',(_block->>'tx_count')::integer,treasury,(_block->>'sealed_at')::timestamptz);
  FOR x IN SELECT value FROM jsonb_array_elements_text(_txids) LOOP
    UPDATE public.chain_transactions SET status='sealed',block_height=(_block->>'height')::integer,block_index=i
      WHERE txid=x AND status='pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'Transação pendente indisponível.'; END IF;
    i:=i+1;
  END LOOP;
  RETURN jsonb_build_object('sealed',true,'height',(_block->>'height')::integer);
END $$;

REVOKE ALL ON FUNCTION public.chain_create_wallet(uuid,text,text,text,text,text,text),
  public.chain_append_transactions(jsonb), public.chain_snapshot(), public.chain_seal_block(jsonb,jsonb),
  public.reserve_demo_order_nmk(uuid,uuid,text,jsonb), public.settle_verified_order_nmk(uuid,text,jsonb), public.studio_cancel_order_nmk(uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chain_create_wallet(uuid,text,text,text,text,text,text),
  public.chain_append_transactions(jsonb), public.chain_snapshot(), public.chain_seal_block(jsonb,jsonb),
  public.reserve_demo_order_nmk(uuid,uuid,text,jsonb), public.settle_verified_order_nmk(uuid,text,jsonb), public.studio_cancel_order_nmk(uuid,uuid,jsonb)
  TO service_role;
