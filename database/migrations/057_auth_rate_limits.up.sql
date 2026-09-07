-- Shared across API replicas. Keys are HMAC digests, never addresses or tokens.
CREATE TABLE public.auth_rate_limits (
    key TEXT PRIMARY KEY,
    attempts BIGINT NOT NULL CHECK (attempts > 0),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX auth_rate_limits_expiry_idx ON public.auth_rate_limits (expires_at);
