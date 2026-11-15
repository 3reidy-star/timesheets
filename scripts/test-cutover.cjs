const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { NextRequest } = require("next/server");
function handler(mode) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync("middleware.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext("(function(require,module,exports){" + code + "\n})", { URL, process: { env: { TIMESHEETS_CUTOVER_MODE: mode } } })(require, module, module.exports);
  return module.exports.middleware;
}
function request(path, method = "GET", headers) { return new NextRequest("https://old.example" + path, { method, headers }); }
test("normal mode keeps the old app running", () => {
  for (const mode of [undefined, "", "off"]) assert.equal(handler(mode)(request("/api/entry", "POST")).headers.get("x-middleware-next"), "1");
});
test("freeze stops pages, API writes, server actions and cron before their handlers run", async () => {
  for (const path of ["/timesheet", "/admin/payroll", "/api/entry", "/api/cron/timesheet-reminders"]) {
    const response = handler("freeze")(request(path));
    assert.equal(response.status, 503); assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(handler("freeze")(request("/api/entry", "POST")).status, 503);
  assert.equal(handler("freeze")(request("/timesheet", "POST", { "next-action": "action" })).status, 503);
});
test("moved mode redirects pages and rejects old writes and reminders", () => {
  for (const [oldPath, newPath] of [["/timesheet", "/timesheets"], ["/entry/123", "/timesheets/entry/123"], ["/admin/payroll?from=2026-10-16", "/timesheets/admin/payroll?from=2026-10-16"], ["/approvals/audit", "/timesheets/approvals/audit"], ["/login?callbackUrl=/admin&code=old", "/timesheets"]]) {
    const response = handler("moved")(request(oldPath));
    assert.equal(response.headers.get("location"), "https://app.pfgbltd.com" + newPath);
  }
  for (const [path, method] of [["/api/entry", "POST"], ["/api/cron/timesheet-reminders", "GET"], ["/api/auth/callback/microsoft-entra-id?code=old", "GET"], ["/timesheet", "POST"]]) {
    const response = handler("moved")(request(path, method)); assert.equal(response.status, 410); assert.equal(response.headers.get("location"), null);
  }
});
