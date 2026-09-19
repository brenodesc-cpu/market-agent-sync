-- Keep drafts private while allowing discovery of published, executable services.
DROP POLICY IF EXISTS offer_versions_auth ON public.offer_versions;
CREATE POLICY offer_versions_auth ON public.offer_versions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.offers o WHERE o.id=offer_versions.offer_id
    AND (o.published OR public.is_company_member(o.company_id,auth.uid()))
));
DROP POLICY IF EXISTS capabilities_auth ON public.capabilities;
CREATE POLICY capabilities_auth ON public.capabilities FOR SELECT TO authenticated
USING (public.is_company_member(company_id,auth.uid()) OR EXISTS (
  SELECT 1 FROM public.offers o WHERE o.capability_id=capabilities.id AND o.published
));