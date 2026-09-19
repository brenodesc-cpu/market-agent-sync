-- Persist autonomous plans and step results so a timed-out request can be inspected and resumed.
CREATE TABLE IF NOT EXISTS public.autonomous_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  input_hash text NOT NULL CHECK(length(input_hash)=64),
  task text NOT NULL CHECK(length(btrim(task)) BETWEEN 10 AND 6000),
  initial_budget integer NOT NULL CHECK(initial_budget BETWEEN 1 AND 10000),
  remaining_budget integer NOT NULL CHECK(remaining_budget BETWEEN 0 AND 10000),
  status text NOT NULL CHECK(status IN ('planning','running','completed','failed')),
  summary text,
  blocked_tools jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(blocked_tools)='array'),
  plan jsonb,
  error_message text,
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_id)
);

CREATE TABLE IF NOT EXISTS public.autonomous_mission_steps (
  mission_id uuid NOT NULL REFERENCES public.autonomous_missions(id) ON DELETE CASCADE,
  step_index integer NOT NULL CHECK(step_index BETWEEN 0 AND 20),
  request_id uuid NOT NULL,
  plan_step jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
  source text CHECK(source IN ('internal','network','created')),
  provider text,
  reason text,
  result jsonb,
  competition jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(competition)='array'),
  offer_version_id uuid REFERENCES public.offer_versions(id),
  order_id uuid REFERENCES public.orders(id),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(mission_id,step_index),
  UNIQUE(mission_id,request_id)
);

CREATE INDEX IF NOT EXISTS autonomous_missions_company_updated
  ON public.autonomous_missions(company_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS autonomous_mission_steps_order
  ON public.autonomous_mission_steps(order_id) WHERE order_id IS NOT NULL;

ALTER TABLE public.autonomous_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autonomous_mission_steps ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.autonomous_missions,public.autonomous_mission_steps TO service_role;
GRANT SELECT ON public.autonomous_missions,public.autonomous_mission_steps TO authenticated;

DROP POLICY IF EXISTS autonomous_missions_owner_read ON public.autonomous_missions;
CREATE POLICY autonomous_missions_owner_read ON public.autonomous_missions
  FOR SELECT TO authenticated USING(user_id=auth.uid());
DROP POLICY IF EXISTS autonomous_mission_steps_owner_read ON public.autonomous_mission_steps;
CREATE POLICY autonomous_mission_steps_owner_read ON public.autonomous_mission_steps
  FOR SELECT TO authenticated USING(EXISTS(
    SELECT 1 FROM public.autonomous_missions mission
    WHERE mission.id=mission_id AND mission.user_id=auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.studio_claim_autonomous_mission(
  _user uuid,
  _company uuid,
  _request uuid,
  _input_hash text,
  _task text,
  _budget integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE mission public.autonomous_missions; token uuid:=gen_random_uuid();
BEGIN
  IF _user IS NULL OR _request IS NULL OR length(_input_hash)<>64
    OR length(btrim(coalesce(_task,''))) NOT BETWEEN 10 AND 6000
    OR _budget NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'invalid_mission'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=_company AND owner_user_id=_user)
    THEN RAISE EXCEPTION 'mission_access_denied'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_user::text||_request::text,0));
  SELECT * INTO mission FROM public.autonomous_missions
    WHERE user_id=_user AND request_id=_request FOR UPDATE;
  IF mission.id IS NOT NULL THEN
    IF mission.company_id<>_company OR mission.input_hash<>_input_hash
      THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    IF mission.status='completed' THEN
      RETURN jsonb_build_object('missionId',mission.id,'status',mission.status,'claimed',false);
    END IF;
    IF mission.lease_until>now() THEN
      RETURN jsonb_build_object('missionId',mission.id,'status',mission.status,'claimed',false);
    END IF;
    UPDATE public.autonomous_missions SET
      status=CASE WHEN plan IS NULL THEN 'planning' ELSE 'running' END,
      error_message=NULL,lease_token=token,lease_until=now()+interval '2 minutes',updated_at=now()
      WHERE id=mission.id;
    RETURN jsonb_build_object('missionId',mission.id,'status',
      CASE WHEN mission.plan IS NULL THEN 'planning' ELSE 'running' END,'claimed',true,
      'leaseToken',token,'leaseUntil',now()+interval '2 minutes');
  END IF;
  INSERT INTO public.autonomous_missions(
    user_id,company_id,request_id,input_hash,task,initial_budget,remaining_budget,status,lease_token,lease_until
  ) VALUES(_user,_company,_request,_input_hash,_task,_budget,_budget,'planning',token,now()+interval '2 minutes')
  RETURNING * INTO mission;
  RETURN jsonb_build_object('missionId',mission.id,'status','planning','claimed',true,
    'leaseToken',token,'leaseUntil',mission.lease_until);
END $$;

REVOKE ALL ON FUNCTION public.studio_claim_autonomous_mission(uuid,uuid,uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_claim_autonomous_mission(uuid,uuid,uuid,text,text,integer) TO service_role;
