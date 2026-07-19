-- Clean reset of the shared realm-art library. New artwork lives under the
-- versioned Tigris prefix `realm-art/v1/<seed>.png`, so any pre-existing
-- job/lease/event rows (which point at the legacy `realms/<seed>.png` prefix)
-- must be purged before the Worker can hand out fresh leases.
DELETE FROM art_events;
DELETE FROM art_jobs;
DELETE FROM realms;
