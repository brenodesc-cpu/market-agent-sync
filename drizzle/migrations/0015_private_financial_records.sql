-- Keep simulated company finances private, including demo suppliers.
-- No data is removed. Server settlement functions keep service-role access.
DROP POLICY IF EXISTS accounts_anon ON public.accounts;
DROP POLICY IF EXISTS ledger_anon ON public.ledger_entries;
REVOKE SELECT ON public.accounts FROM anon;
REVOKE SELECT ON public.ledger_entries FROM anon;

DROP POLICY IF EXISTS accounts_auth ON public.accounts;
CREATE POLICY accounts_auth ON public.accounts FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
DROP POLICY IF EXISTS ledger_auth ON public.ledger_entries;
CREATE POLICY ledger_auth ON public.ledger_entries FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
