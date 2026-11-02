CREATE TABLE IF NOT EXISTS scopes (
 id text PRIMARY KEY, memory_account_id text NOT NULL, namespace text NOT NULL,
 last_allocated_sequence integer NOT NULL DEFAULT 0, last_durable_sequence integer NOT NULL DEFAULT 0,
 frozen_version text, CHECK(last_durable_sequence <= last_allocated_sequence)
);
CREATE TABLE IF NOT EXISTS events (
 event_id text PRIMARY KEY, scope_id text NOT NULL REFERENCES scopes(id), sequence integer NOT NULL,
 canonical_json text NOT NULL, event_hash text NOT NULL, text_sha256 text NOT NULL,
 durable_status text NOT NULL DEFAULT 'pending' CHECK(durable_status IN ('pending','done')),
 UNIQUE(scope_id,sequence)
);
CREATE TABLE IF NOT EXISTS memory_outbox (
 operation_id text PRIMARY KEY, event_id text NOT NULL UNIQUE REFERENCES events(event_id),
 scope_id text NOT NULL REFERENCES scopes(id), operation_key text NOT NULL, payload_hash text NOT NULL,
 namespace text NOT NULL, memory_text text NOT NULL, job_id text,
 state text NOT NULL CHECK(state IN ('prepared','submitting','accepted','pending','running','uploaded','done','retry_wait','failed','blocked','unknown')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz, lease_until timestamptz, lease_token text,
 last_error text, UNIQUE(scope_id,operation_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_mutation_per_scope ON memory_outbox(scope_id) WHERE state <> 'done';
CREATE TABLE IF NOT EXISTS memory_receipts (event_id text PRIMARY KEY REFERENCES events(event_id), receipt_json jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS request_idempotency (
 scope_id text NOT NULL REFERENCES scopes(id), operation_key text NOT NULL, request_hash text NOT NULL,
 response_json jsonb NOT NULL, status integer NOT NULL, PRIMARY KEY(scope_id,operation_key)
);
CREATE TABLE IF NOT EXISTS observations (
 id text PRIMARY KEY, scope_id text NOT NULL REFERENCES scopes(id), unique_chain_key text NOT NULL,
 normalized_json jsonb NOT NULL, raw_hash text, origin text NOT NULL CHECK(origin IN ('synthetic','live','recorded_live')),
 UNIQUE(scope_id,unique_chain_key)
);
CREATE TABLE IF NOT EXISTS rule_projections (scope_id text NOT NULL REFERENCES scopes(id), rule_version_id text NOT NULL, revision integer NOT NULL, projection_json jsonb NOT NULL, PRIMARY KEY(scope_id,rule_version_id));
CREATE TABLE IF NOT EXISTS sessions (hashed_session_id text PRIMARY KEY, role text NOT NULL CHECK(role='operator'), csrf_hash text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS frozen_manifests (manifest_version text PRIMARY KEY, manifest_json jsonb NOT NULL, manifest_hash text NOT NULL, frozen_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION recallledger_immutable_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.event_id,NEW.scope_id,NEW.sequence,NEW.canonical_json,NEW.event_hash,NEW.text_sha256) IS DISTINCT FROM ROW(OLD.event_id,OLD.scope_id,OLD.sequence,OLD.canonical_json,OLD.event_hash,OLD.text_sha256) THEN
 RAISE EXCEPTION 'event payload is immutable'; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS immutable_event ON events;
CREATE TRIGGER immutable_event BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION recallledger_immutable_event();
CREATE OR REPLACE FUNCTION recallledger_immutable_manifest() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'frozen manifest is immutable'; END $$;
DROP TRIGGER IF EXISTS immutable_manifest ON frozen_manifests;
CREATE TRIGGER immutable_manifest BEFORE UPDATE OR DELETE ON frozen_manifests FOR EACH ROW EXECUTE FUNCTION recallledger_immutable_manifest();
