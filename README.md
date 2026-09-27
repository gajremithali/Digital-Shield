# Digital Shield — v12

Next-stage website prototype focused entirely on social-profile exposure analysis.

- Website-only user flow; no Android companion required.
- No device screen-time collection.
- Short authorization-style connection flow.
- Platform-level findings and personalized recommendations.
- Exposure score is calculated from stored social-profile signals; it is not hard-coded.
- Prototype authorization signals are clearly identified as simulated until live platform APIs are configured.
- Existing Supabase Auth/admin dashboard flow is retained.

Supabase RLS should remain enabled on all exposed user-data tables and grants should be limited to required operations.
