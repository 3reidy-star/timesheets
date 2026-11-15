# Timesheets cutover controls

The standalone app is unchanged unless TIMESHEETS_CUTOVER_MODE is set to freeze or moved and the deployment is rebuilt.

- freeze: pages return a maintenance response; all APIs, cron routes, server actions and non-GET/HEAD requests return 503 before their handlers run.
- moved: page links redirect to https://app.pfgbltd.com/timesheets and the corresponding entry/admin/approval routes. Old API calls, reminders and writes return 410. Login callback query values are not forwarded.
- unset/off: normal standalone operation.

Stage this code with the flag unset. Confirm the integrated preview and latest payroll comparison before starting the maintenance window. Set freeze on the standalone production deployment and redeploy; verify the old entry and reminder endpoints are blocked before taking the final source snapshot. Transfer and verify all records while the source remains frozen. Enable the integrated production app and verify sign-in, history, approvals and exports. Only then change the standalone flag to moved and redeploy. Enable reminders in the destination after the source reminders are blocked.

Before the destination accepts any writes, rollback is to disable the integrated app and redeploy the standalone app with its cutover flag unset. Once the destination accepts new entries or approvals, reconcile those changes before any rollback. Never allow both apps to accept payroll writes.

Validation: node --test scripts/test-cutover.cjs. The checks cover normal operation, blocking old pages/APIs/cron/actions during maintenance, route mapping, stale write rejection and keeping old authentication callback values away from the new app.
