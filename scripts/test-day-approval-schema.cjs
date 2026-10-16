const assert = require('node:assert/strict');
const { ensureDayApproval, isMissingDayApproval, statements } = require('./ensure-day-approval.cjs');

(async () => {
  let ddl = [];
  let probes = 0;
  const existing = {
    dayApproval: { findFirst: async () => { probes++; return { id: 'existing-approval' }; } },
    $transaction: async () => { throw new Error('Existing schema must not trigger DDL'); },
  };
  assert.deepEqual(await ensureDayApproval(existing), { created: false });
  assert.equal(probes, 1);
  const missing = { code: 'P2021', meta: { modelName: 'DayApproval', table: 'public.DayApproval' } };
  assert.equal(isMissingDayApproval(missing), true);
  assert.equal(isMissingDayApproval({ code: 'P2021', meta: { table: 'public.User' } }), false);
  assert.equal(isMissingDayApproval({ code: 'P2022', meta: { modelName: 'DayApproval' } }), false);
  const absent = {
    dayApproval: { findFirst: async () => { if (!ddl.length) throw missing; return null; } },
    $transaction: async callback => callback({ $executeRawUnsafe: async sql => { ddl.push(sql); } }),
  };
  assert.deepEqual(await ensureDayApproval(absent), { created: true });
  assert.deepEqual(ddl, statements);
  const before = ddl.length;
  assert.deepEqual(await ensureDayApproval(absent), { created: false });
  assert.equal(ddl.length, before, 'Repeated checks do not modify an existing table');
  for (const error of [{ code: 'P1001' }, { code: 'P2021', meta: { table: 'public.User' } }, { code: 'P2022', meta: { modelName: 'DayApproval' } }]) {
    await assert.rejects(() => ensureDayApproval({
      dayApproval: { findFirst: async () => { throw error; } },
      $transaction: async () => { throw new Error('Must not attempt repair for an unrelated failure'); },
    }), received => received === error);
  }
  assert.ok(statements.every(sql => !/\b(DROP|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE)\b/i.test(sql)));
  assert.ok(statements.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS "DayApproval"')));
  console.log('Schema checks passed: existing table unchanged, missing-table-only repair, repeatability, unrelated errors fail closed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
