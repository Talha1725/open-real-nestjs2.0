-- Create a dedicated sequence for transfer reference numbers.
-- This eliminates race conditions from COUNT(*) + 1 under concurrency.
--
-- Note: We keep this as a standalone sequence (not tied to a table default)
-- because reference strings are composed in application code.

CREATE SEQUENCE IF NOT EXISTS transfer_reference_seq;

