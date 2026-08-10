# Translation worker

- Starts with every server process; no worker environment switch is required.
- Draining is controlled only by `SiteSettings.translation.enabled`.
- Admin console: open `/admin/translations`, toggle **Translation worker**, then save settings.
- Safe across multiple processes:
  - `claimNext()` atomically claims one row and reclaims translating rows after 15 minutes.
  - `reserveQuota()` increments each model's day/minute counter before checking its RPD/RPM cap, so concurrent processes cannot oversubscribe a slot.
- Admin status: `GET /api/admin/translations/status` includes process liveness, last drain/claim timestamps, current claims, and expired-lock indicators.
