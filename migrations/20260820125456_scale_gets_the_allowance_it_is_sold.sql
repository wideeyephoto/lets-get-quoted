-- Scale subscribers get Growth's credits. Give them the ones they pay for.
--
-- THE DRIFT. Both per-plan grant tables spell Scale's monthly allowance as
-- Growth's, exactly, across all four resources:
--
--                        sold (BILLING_PLANS.scale)   granted
--   text_segments                       3,000           1,500
--   marketing_email_sends               5,000           2,500
--   ai_intake_threads                   1,000             500
--   ai_writing_drafts                     500             250
--
-- Half, on every line. Scale is $329/month against Growth's $129, and the
-- pricing page sells those larger numbers in its comparison table. Solo and
-- Growth are correct in both tables and are not touched here.
--
-- HOW IT SURVIVED. The 2026-08-18 catalog change raised Scale's published
-- allowances and its feature_limits, and did not raise the grant tables. Nothing
-- errored, because the two halves are internally consistent -- the projector
-- grants 1,500 and the reset re-grants 1,500, so a subscriber simply receives
-- less than the catalogue promises, for ever, with no failure anywhere.
--
-- WHY IT HAS NOT COST ANYTHING YET. No live Scale subscription exists: base plan
-- checkout is dark and the live Stripe Prices still carry the previous catalog
-- version. This lands before the first Scale sale, not after.
--
-- TWO FUNCTIONS, because a subscription is granted twice over its life:
-- project_stripe_billing_subscription_event_v1_unchecked on activation, and
-- apply_paid_plan_monthly_allowance_reset every month after. Fixing one would
-- give a Scale customer the right first month and half of every month after, or
-- the reverse.
--
-- Patched from live source rather than restated: these are 1,000-line functions
-- and restating them to change four numbers is how unrelated logic gets lost.
-- Each edit is asserted to match exactly once, so a drifted function refuses
-- rather than being silently half-patched.

begin;

do $mig$
declare
  v_targets text[] := array[
    'public.project_stripe_billing_subscription_event_v1_unchecked(uuid,uuid,jsonb)',
    'public.apply_paid_plan_monthly_allowance_reset(uuid)'
  ];
  v_target text;
  v_before text;
  v_after text;
  v_edits text[][];
  v_pair text[];
  v_old text;
  v_new text;
begin
  -- The four edits are identical in both functions: the tables differ only in
  -- which variable holds the plan code, and that is not part of any match.
  v_edits := array[
    array[
      'when ''growth'' then 1500 when ''scale'' then 1500',
      'when ''growth'' then 1500 when ''scale'' then 3000'
    ],
    array[
      'when ''growth'' then 2500 when ''scale'' then 2500',
      'when ''growth'' then 2500 when ''scale'' then 5000'
    ],
    array[
      'when ''growth'' then 500 when ''scale'' then 500',
      'when ''growth'' then 500 when ''scale'' then 1000'
    ],
    array[
      'when ''growth'' then 250 when ''scale'' then 250',
      'when ''growth'' then 250 when ''scale'' then 500'
    ]
  ];

  foreach v_target in array v_targets
  loop
    v_before := pg_catalog.pg_get_functiondef(v_target::pg_catalog.regprocedure);
    -- Stored bodies here have held a mix of CRLF and LF, and an exact-text
    -- patch against the wrong one matches nothing. Compare on LF alone.
    v_before := pg_catalog.replace(
      v_before, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

    -- Already patched. Idempotent, so a partial run can be repeated.
    if pg_catalog.strpos(v_before, 'when ''scale'' then 3000') > 0 then
      continue;
    end if;

    v_after := v_before;
    foreach v_pair slice 1 in array v_edits
    loop
      v_old := v_pair[1];
      v_new := v_pair[2];
      -- Exactly once. Zero means the table moved; more than once means the
      -- match is not specific enough to be safe.
      if pg_catalog.length(v_after) - pg_catalog.length(pg_catalog.replace(v_after, v_old, ''))
           is distinct from pg_catalog.length(v_old) then
        raise exception 'allowance grant table drifted in % at: %',
          v_target, pg_catalog.left(v_old, 48) using errcode = '55000';
      end if;
      v_after := pg_catalog.replace(v_after, v_old, v_new);
    end loop;

    execute v_after;
  end loop;
end
$mig$;

-- Post-conditions. Assert what the numbers ARE, not merely that something
-- changed: a patch that moved a digit would satisfy "it is different".
do $post$
declare
  v_target text;
  v_def text;
begin
  foreach v_target in array array[
    'public.project_stripe_billing_subscription_event_v1_unchecked(uuid,uuid,jsonb)',
    'public.apply_paid_plan_monthly_allowance_reset(uuid)'
  ]
  loop
    v_def := pg_catalog.pg_get_functiondef(v_target::pg_catalog.regprocedure);

    if pg_catalog.strpos(v_def, 'when ''growth'' then 1500 when ''scale'' then 3000') = 0
       or pg_catalog.strpos(v_def, 'when ''growth'' then 2500 when ''scale'' then 5000') = 0
       or pg_catalog.strpos(v_def, 'when ''growth'' then 500 when ''scale'' then 1000') = 0
       or pg_catalog.strpos(v_def, 'when ''growth'' then 250 when ''scale'' then 500') = 0 then
      raise exception '% does not grant Scale its published allowance', v_target;
    end if;

    -- Growth and Solo must be untouched. The whole risk of a text patch is
    -- catching a neighbour, and these two share every line with Scale.
    if pg_catalog.strpos(v_def, 'when ''solo'' then 500 when ''growth'' then 1500') = 0
       or pg_catalog.strpos(v_def, 'when ''solo'' then 250 when ''growth'' then 500') = 0
       or pg_catalog.strpos(v_def, 'when ''solo'' then 50 when ''growth'' then 250') = 0 then
      raise exception '% lost Solo or Growth allowances', v_target;
    end if;

    -- And no stale Scale value may survive anywhere in the body.
    if pg_catalog.strpos(v_def, 'when ''scale'' then 1500') > 0
       or pg_catalog.strpos(v_def, 'when ''scale'' then 2500') > 0
       or pg_catalog.strpos(v_def, 'when ''scale'' then 250 end') > 0 then
      raise exception '% still carries a Growth-sized Scale allowance', v_target;
    end if;
  end loop;
end
$post$;

commit;
