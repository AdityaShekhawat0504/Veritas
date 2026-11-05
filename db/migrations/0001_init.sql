-- Veritas v2: initial schema.
-- Value lists in CHECK constraints mirror db/enums.ts.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE firms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  image text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('admin', 'pm', 'analyst', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, user_id)
);

CREATE TABLE securities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL UNIQUE,
  cik text UNIQUE CHECK (cik IS NULL OR cik ~ '^[0-9]{10}$'),
  isin text UNIQUE,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE theses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  security_id uuid NOT NULL REFERENCES securities(id),
  author_id uuid NOT NULL REFERENCES users(id),
  claim text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('long', 'short')),
  horizon_months integer NOT NULL CHECK (horizon_months > 0),
  conviction_pct integer NOT NULL CHECK (conviction_pct BETWEEN 0 AND 100),
  status text NOT NULL CHECK (status IN ('draft', 'open', 'closed')),
  current_version integer NOT NULL DEFAULT 0,
  memo_text text,
  draft_extraction jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX theses_firm_idx ON theses (firm_id);

CREATE TABLE thesis_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL REFERENCES theses(id),
  version integer NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thesis_id, version)
);

CREATE TABLE positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL UNIQUE REFERENCES theses(id),
  size_pct double precision NOT NULL CHECK (size_pct >= 0),
  entry_date date,
  entry_price double precision CHECK (entry_price IS NULL OR entry_price > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL REFERENCES theses(id),
  text text NOT NULL,
  falsifiable_text text NOT NULL,
  critical boolean NOT NULL,
  category text NOT NULL CHECK (category IN (
    'revenue', 'margin', 'earnings', 'cash_flow', 'balance_sheet', 'macro',
    'competition', 'product', 'management', 'regulatory', 'valuation', 'other')),
  probability double precision CHECK (probability IS NULL OR (probability >= 0 AND probability <= 1)),
  resolve_by date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired', 'resolved')),
  sort_order integer NOT NULL DEFAULT 0,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Rule: critical assumptions carry a probability and a resolution date.
  CONSTRAINT critical_needs_forecast CHECK (
    NOT critical OR (probability IS NOT NULL AND resolve_by IS NOT NULL))
);
CREATE INDEX assumptions_thesis_idx ON assumptions (thesis_id);

CREATE TABLE indicator_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  source text NOT NULL CHECK (source IN ('xbrl', 'fred', 'price')),
  source_code text NOT NULL,
  denominator_code text,
  unit text NOT NULL,
  transform text NOT NULL CHECK (transform IN (
    'level', 'yoy_pct', 'ratio_pct', 'return_from_entry_pct', 'drawdown_from_high_pct')),
  frequency text NOT NULL CHECK (frequency IN ('quarterly', 'annual', 'instant', 'daily', 'monthly')),
  description text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((transform = 'ratio_pct') = (denominator_code IS NOT NULL))
);

CREATE TABLE kill_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL REFERENCES theses(id),
  condition text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  triggered_at timestamptz,
  triggered_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assumption_id uuid REFERENCES assumptions(id),
  kill_criterion_id uuid REFERENCES kill_criteria(id),
  catalog_id uuid NOT NULL REFERENCES indicator_catalog(id),
  operator text NOT NULL CHECK (operator IN ('gt', 'gte', 'lt', 'lte')),
  threshold double precision NOT NULL,
  break_threshold double precision,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((assumption_id IS NULL) <> (kill_criterion_id IS NULL))
);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('filing', 'macro_release', 'price_move')),
  security_id uuid REFERENCES securities(id),
  source_key text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, source_key)
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id uuid REFERENCES securities(id),
  source_url text NOT NULL,
  doc_type text NOT NULL,
  accession text,
  published_at timestamptz,
  text text NOT NULL,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_url, sha256)
);

CREATE TABLE checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial NOT NULL,
  assumption_id uuid NOT NULL REFERENCES assumptions(id),
  kind text NOT NULL CHECK (kind IN ('numeric', 'text', 'override')),
  verdict text NOT NULL CHECK (verdict IN ('supported', 'weakened', 'contradicted', 'insufficient_evidence')),
  observed jsonb,
  indicator_id uuid REFERENCES indicators(id),
  model text,
  prompt_version text,
  trigger text NOT NULL CHECK (trigger IN ('event', 'sweep', 'manual', 'override')),
  event_id uuid REFERENCES events(id),
  overrides_check_id uuid REFERENCES checks(id),
  quote_verified boolean,
  note text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Rule: numeric verdicts are computed in code, never by a model.
  CONSTRAINT numeric_has_no_model CHECK (
    kind <> 'numeric' OR (model IS NULL AND prompt_version IS NULL AND indicator_id IS NOT NULL)),
  CONSTRAINT text_has_model CHECK (
    kind <> 'text' OR (model IS NOT NULL AND prompt_version IS NOT NULL)),
  CONSTRAINT override_has_reason CHECK (
    kind <> 'override' OR (overrides_check_id IS NOT NULL AND note IS NOT NULL AND created_by IS NOT NULL))
);
CREATE INDEX checks_assumption_seq_idx ON checks (assumption_id, seq DESC);

CREATE TABLE evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid REFERENCES checks(id),
  assumption_id uuid REFERENCES assumptions(id),
  document_id uuid REFERENCES documents(id),
  source_url text NOT NULL,
  doc_id text,
  quote text NOT NULL CHECK (length(btrim(quote)) > 0),
  observed_value double precision,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evidence_check_idx ON evidence (check_id);

CREATE TABLE decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL REFERENCES theses(id),
  action text NOT NULL CHECK (action IN ('add', 'trim', 'hold', 'exit')),
  size_change_pct double precision NOT NULL,
  size_after_pct double precision NOT NULL CHECK (size_after_pct >= 0),
  rationale text NOT NULL CHECK (length(btrim(rationale)) > 0),
  decided_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL REFERENCES theses(id),
  assumption_id uuid REFERENCES assumptions(id),
  kind text NOT NULL CHECK (kind IN ('assumption', 'thesis')),
  result text CHECK (result IS NULL OR result IN ('true', 'false', 'ambiguous')),
  forecast_probability double precision,
  thesis_return_pct double precision,
  benchmark_return_pct double precision,
  note text,
  resolved_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'assumption' OR (assumption_id IS NOT NULL AND result IS NOT NULL))
);
CREATE UNIQUE INDEX outcomes_one_per_assumption ON outcomes (assumption_id) WHERE assumption_id IS NOT NULL;
CREATE UNIQUE INDEX outcomes_one_per_thesis ON outcomes (thesis_id) WHERE kind = 'thesis';

CREATE TABLE alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  thesis_id uuid NOT NULL REFERENCES theses(id),
  assumption_id uuid REFERENCES assumptions(id),
  check_id uuid UNIQUE REFERENCES checks(id),
  kill_criterion_id uuid UNIQUE REFERENCES kill_criteria(id),
  kind text NOT NULL CHECK (kind IN ('verdict_change', 'kill_criterion')),
  previous_verdict text,
  new_verdict text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CHECK (kind <> 'verdict_change' OR (check_id IS NOT NULL AND new_verdict IS NOT NULL
    AND previous_verdict IS DISTINCT FROM new_verdict)),
  CHECK (kind <> 'kill_criterion' OR kill_criterion_id IS NOT NULL)
);

CREATE TABLE llm_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid REFERENCES firms(id),
  purpose text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_id text NOT NULL,
  prompt_version text NOT NULL,
  input_tokens integer NOT NULL,
  output_tokens integer NOT NULL,
  cost_usd double precision,
  latency_ms integer NOT NULL,
  ok boolean NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial NOT NULL,
  firm_id uuid REFERENCES firms(id),
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'system')),
  actor_id uuid REFERENCES users(id),
  actor_name text,
  action text NOT NULL,
  object_type text NOT NULL,
  object_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (actor_type <> 'user' OR actor_id IS NOT NULL)
);
CREATE INDEX action_log_object_idx ON action_log (object_type, object_id);
CREATE INDEX action_log_firm_seq_idx ON action_log (firm_id, seq);

-- Insert-only tables: any UPDATE, DELETE or TRUNCATE raises.
CREATE FUNCTION veritas_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is insert-only (% rejected)', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE TRIGGER action_log_no_update BEFORE UPDATE OR DELETE ON action_log
  FOR EACH ROW EXECUTE FUNCTION veritas_forbid_mutation();
CREATE TRIGGER action_log_no_truncate BEFORE TRUNCATE ON action_log
  FOR EACH STATEMENT EXECUTE FUNCTION veritas_forbid_mutation();
CREATE TRIGGER checks_no_update BEFORE UPDATE OR DELETE ON checks
  FOR EACH ROW EXECUTE FUNCTION veritas_forbid_mutation();
CREATE TRIGGER checks_no_truncate BEFORE TRUNCATE ON checks
  FOR EACH STATEMENT EXECUTE FUNCTION veritas_forbid_mutation();
CREATE TRIGGER thesis_versions_no_update BEFORE UPDATE OR DELETE ON thesis_versions
  FOR EACH ROW EXECUTE FUNCTION veritas_forbid_mutation();
CREATE TRIGGER thesis_versions_no_truncate BEFORE TRUNCATE ON thesis_versions
  FOR EACH STATEMENT EXECUTE FUNCTION veritas_forbid_mutation();
CREATE TRIGGER evidence_no_update BEFORE UPDATE OR DELETE ON evidence
  FOR EACH ROW EXECUTE FUNCTION veritas_forbid_mutation();
CREATE TRIGGER evidence_no_truncate BEFORE TRUNCATE ON evidence
  FOR EACH STATEMENT EXECUTE FUNCTION veritas_forbid_mutation();
CREATE TRIGGER llm_calls_no_update BEFORE UPDATE OR DELETE ON llm_calls
  FOR EACH ROW EXECUTE FUNCTION veritas_forbid_mutation();

-- Rule: a check with a real verdict must have evidence in the same transaction.
CREATE FUNCTION veritas_check_needs_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.verdict <> 'insufficient_evidence'
     AND NOT EXISTS (SELECT 1 FROM evidence e WHERE e.check_id = NEW.id) THEN
    RAISE EXCEPTION 'check % has verdict % but no evidence', NEW.id, NEW.verdict;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER checks_need_evidence AFTER INSERT ON checks
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION veritas_check_needs_evidence();
