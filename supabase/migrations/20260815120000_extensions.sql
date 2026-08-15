-- Extensions
--
-- btree_gist is not optional. It is what lets a single GiST index mix an equality operator on a
-- scalar (gown_id) with an overlap operator on a range (period), which is the whole mechanism
-- behind non-negotiable #1: a gown cannot be reserved twice for overlapping dates.

create extension if not exists btree_gist;

-- gen_random_uuid() is built into Postgres 13+, so pgcrypto is not required for ids.
