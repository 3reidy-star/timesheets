// Exercises real routes with an in-memory Prisma double; no production data or emails.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const ExcelJS = require('exceljs');
const root = path.resolve(__dirname, '..');
const date = value => new Date(`${value}T00:00:00Z`);
const owner = { id: 'u', email: 'employee@example.test', name: 'Test Employee', role: 'ENGINEER', active: true };
let actor = owner;
let writes = 0;
const entry = day => ({ id: `e${day}`, weekId: 'w', userId: 'u', date: date(`2026-10-${day}`), type: 'WORK', job: `Site ${day}`, hours: 10, regularHours: 8, otMonFriHours: 2, otSatHours: 0, otSunBhHours: 0, startTime: '08:30', finishTime: '19:00', overnight: false });
let week = { id: 'w', userId: 'u', weekStart: date('2026-10-12'), status: 'DRAFT', entries: [12,13,14,15,16,17,18].map(entry), dayApprovals: [], audits: [], user: owner };
const enriched = () => ({ ...week, dayApprovals: week.dayApprovals.map(day => ({ ...day, reviewedBy: day.reviewedById ? { name: 'Reviewer', email: 'admin@example.test' } : null })), audits: week.audits.map(audit => ({ ...audit, performedBy: { name: 'Reviewer', email: 'admin@example.test' } })) });
const prisma = {
  user: { findUnique: async ({where}) => where.email ? actor : owner, findMany: async () => [owner] },
  timesheetWeek: {
    findFirst: async ({where}) => !where.userId || where.userId === week.userId ? enriched() : null,
    findUnique: async () => enriched(), findUniqueOrThrow: async () => enriched(), findMany: async () => [enriched()], upsert: async () => enriched(),
    update: async ({data}) => { Object.assign(week,data); writes++; return enriched(); }, delete: async () => { writes++; return week; },
  },
  dayApproval: {
    findUnique: async ({where}) => week.dayApprovals.find(day => day.date.getTime() === where.weekId_date.date.getTime()) || null,
    upsert: async ({where,create,update}) => {
      let day = week.dayApprovals.find(day => day.date.getTime() === where.weekId_date.date.getTime());
      if (!day) { day = { id: `d${week.dayApprovals.length}`, ...create }; week.dayApprovals.push(day); } else Object.assign(day,update);
      writes++; return day;
    },
    deleteMany: async ({where}) => { week.dayApprovals = week.dayApprovals.filter(day => where.status ? day.status === where.status.not : false); writes++; },
  },
  weekAudit: { create: async ({data}) => { const audit = { ...data, createdAt: new Date() }; week.audits.push(audit); return audit; }, deleteMany: async () => {} },
  timesheetEntry: {
    findUnique: async ({where}) => { const found = week.entries.find(entry => entry.id === where.id); return found ? { ...found, week: enriched() } : null; },
    create: async ({data}) => { const result = { id: `new${writes}`, ...data }; week.entries.push(result); writes++; return result; },
    update: async ({where,data}) => { Object.assign(week.entries.find(entry => entry.id === where.id),data); writes++; },
    delete: async ({where}) => { week.entries = week.entries.filter(entry => entry.id !== where.id); writes++; },
    deleteMany: async () => { week.entries = []; writes++; },
  },
  $queryRaw: async () => [],
  $transaction: async callback => { const before = structuredClone(week); try { return await callback(prisma); } catch (error) { week = before; throw error; } },
};
const cache = new Map();
function load(file) {
  const filename = path.resolve(root,file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename,module);
  const source = ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const importModule = name => {
    if (name === '@/auth') return { auth: async () => actor ? {user:{email:actor.email}} : null };
    if (name === '@/app/lib/prisma') return {prisma};
    if (name === 'next/navigation') return { redirect: url => { throw new Error(`REDIRECT:${url}`); } };
    if (name.startsWith('@/')) return load(name.slice(2)+'.ts');
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`,{filename})(importModule,module,module.exports);
  return module.exports;
}
const request = body => new Request('http://localhost/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const admin = () => { actor = { id:'admin',email:'admin@example.test',name:'Reviewer',active:true,role:'ADMIN' }; };
const submit = load('app/api/week/submit/route.ts').POST;
const reviewDay = load('app/api/day/review/route.ts').POST;
const reviewWeek = load('app/api/week/review/route.ts').POST;
const payroll = load('app/lib/payrollApproval.ts');
const locks = load('app/lib/dayApprovalLock.ts');
const originalConsoleError = console.error;
console.error = (...args) => { if (!(args[1] instanceof locks.ApprovalConflict)) originalConsoleError(...args); };
async function expectStatus(handler,body,status) {
  const response = await handler(request(body)); const result = await response.json();
  assert.equal(response.status,status,JSON.stringify(result)); return result;
}
async function summary(from,to) {
  const response = await load('app/api/admin/payroll/export-summary/route.ts').GET(new Request(`http://localhost/api?from=${from}&to=${to}&userId=all`));
  assert.equal(response.status,200);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await response.arrayBuffer())); return workbook.worksheets[0].getRow(3);
}
(async () => {
  assert.throws(() => load('app/approvals/page.tsx').default(),/REDIRECT:\/admin\/approvals/,'Old crashing route must use current screen');
  assert.deepEqual(payroll.payrollPeriod(new Date('2026-10-15T12:00:00Z')),{from:'2026-09-16',to:'2026-10-15'});
  assert.deepEqual(payroll.payrollPeriod(new Date('2026-10-15T23:30:00Z')),{from:'2026-10-16',to:'2026-11-15'});
  assert.deepEqual(payroll.payrollPeriod(new Date('2026-01-01T00:00:00Z')),{from:'2025-12-16',to:'2026-01-15'});
  assert.equal(payroll.parsePayrollDate('2026-02-30'),null);
  await expectStatus(submit,{weekId:'w',through:'2026-10-16'},400);
  await expectStatus(submit,{weekId:'w',through:'2026-11-15'},409);
  await expectStatus(submit,{weekId:'w',through:'2026-10-15'},200);
  assert.equal(week.status,'DRAFT');
  assert.deepEqual(week.dayApprovals.map(day => day.date.getUTCDate()),[12,13,14,15]);
  await assert.rejects(() => locks.withEditableDays([{weekId:'w',date:date('2026-10-15')}],true,async()=>{}),locks.ApprovalConflict);
  await locks.withEditableDays([{weekId:'w',date:date('2026-10-16')}],false,async()=>{});
  const computed = load('app/lib/timesheetTotals.ts').calcWeekTotals(week.entries,week.weekStart);
  const component = load('app/admin/approvals/AdminApprovalsPageClient.tsx').default;
  const html = require('react-dom/server').renderToStaticMarkup(require('react').createElement(component,{initialWeeks:[JSON.parse(JSON.stringify({...enriched(),computed}))]}));
  assert.ok(html.includes('Approve Day')); assert.ok(html.includes('Not submitted'));
  await expectStatus(reviewDay,{weekId:'w',date:'2026-10-15',action:'APPROVE'},403);
  admin();
  await expectStatus(reviewDay,{weekId:'w',date:'2026-10-16',action:'APPROVE'},409);
  for (const day of [12,13,14,15]) await expectStatus(reviewDay,{weekId:'w',date:`2026-10-${day}`,action:'APPROVE'},200);
  const audits = week.audits.length;
  await expectStatus(reviewDay,{weekId:'w',date:'2026-10-15',action:'APPROVE'},200);
  assert.equal(week.audits.length,audits);
  assert.equal((await load('app/lib/payrollData.ts').approvedPayrollEntries(date('2026-09-16'),date('2026-10-15'))).length,4);
  assert.equal((await summary('2026-09-16','2026-10-15')).getCell(7).value,8);
  assert.equal((await summary('2026-10-16','2026-11-15')).getCell(7).value,null);
  const detailResponse = await load('app/api/admin/payroll/export/route.ts').GET(new Request('http://localhost/api?from=2026-09-16&to=2026-10-15&userId=u'));
  assert.equal(detailResponse.status,200);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await detailResponse.arrayBuffer()));
  const values = JSON.stringify(workbook.worksheets[0].getSheetValues()); assert.ok(values.includes('Site 15')); assert.ok(!values.includes('Site 16'));
  const pdf = await load('app/api/admin/payroll/export-pdf/route.ts').GET(new Request('http://localhost/api?from=2026-09-16&to=2026-10-15&userId=u'));
  assert.equal(pdf.status,200); assert.ok((await pdf.arrayBuffer()).byteLength > 1000);
  const beforeWrites = writes;
  await expectStatus(load('app/api/entry/delete/route.ts').POST,{id:'e15'},409);
  for (const [id,day] of [['e15','16'],['e16','15']]) await expectStatus(load('app/api/entry/update/route.ts').POST,{id,date:`2026-10-${day}`,job:'Moved site',startTime:'08:30',finishTime:'19:00'},409);
  await expectStatus(load('app/api/entry/route.ts').POST,{adminWeekId:'w',date:'2026-10-15',job:'Extra site',startTime:'08:30',finishTime:'19:00'},409);
  assert.equal(writes,beforeWrites);
  await expectStatus(reviewDay,{weekId:'w',date:'2026-10-15',action:'REOPEN'},400);
  await expectStatus(reviewDay,{weekId:'w',date:'2026-10-15',action:'REOPEN',comment:'Correction'},200);
  assert.equal(payroll.isPayrollDayApproved(enriched(),date('2026-10-14')),true);
  assert.equal(payroll.isPayrollDayApproved(enriched(),date('2026-10-15')),false);
  actor=owner; await expectStatus(submit,{weekId:'w'},200); admin();
  await expectStatus(reviewWeek,{weekId:'w',action:'APPROVE'},200);
  assert.ok(week.dayApprovals.every(day => day.status === 'APPROVED'));
  assert.equal((await summary('2026-10-16','2026-11-15')).getCell(7).value,5.5,'Friday OT plus weekly top-up belongs to the next period');
  week.dayApprovals=[]; // compatibility with historical whole-week approvals
  await expectStatus(reviewDay,{weekId:'w',date:'2026-10-15',action:'REOPEN',comment:'Historical correction'},200);
  assert.equal(payroll.isPayrollDayApproved(enriched(),date('2026-10-16')),true);
  await expectStatus(submit,{weekId:'w'},200);
  await expectStatus(reviewWeek,{weekId:'w',action:'REJECT',comment:'Correct returned day'},200);
  assert.ok(week.dayApprovals.every(day => day.status === 'APPROVED'));
  actor={...owner,id:'stranger'}; await expectStatus(submit,{weekId:'w'},404);
  admin(); actor.active=false; await expectStatus(reviewDay,{weekId:'w',date:'2026-10-15',action:'APPROVE'},403); admin();
  week.weekStart=date('2026-08-31'); week.dayApprovals=[];
  week.entries=[1,2,3,4].map(day => ({...entry(12),id:`bh${day}`,date:date(`2026-09-0${day}`)}));
  await expectStatus(submit,{weekId:'w'},200);
  await expectStatus(reviewDay,{weekId:'w',date:'2026-08-31',action:'APPROVE'},200);
  assert.equal(payroll.isPayrollDayApproved(enriched(),date('2026-08-31')),true,'Bank holiday without entry can be approved');
  console.error=originalConsoleError;
  console.log('Payroll checks passed: approval redirect, cutoff, persistence, locks, exports, corrections, historical approvals and bank holidays.');
})().catch(error => { originalConsoleError(error); process.exitCode=1; });
