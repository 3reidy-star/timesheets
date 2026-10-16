This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Payroll approval (16th–15th)

- In the cutoff week, employees can **Submit up to 15th for payroll**. Administrators can submit on their behalf from **Weekly Approvals → Employee Week Totals → Submit up to 15th**.
- **Approve Day** saves approval with the reviewer and time. Accounts can download those dates while the remaining days stay open. The default payroll period is the 16th–15th, based on the London date.
- Complete normal whole-week submission and approval afterward. Previously approved dates stay approved. The existing weekly business top-up is finalized only after whole-week approval and belongs to Friday's payroll period; replace earlier downloads if final approval changes their totals.
- **Reopen day** requires a reason and removes that day from payroll until it is resubmitted and reapproved, preserving other approvals. **Reopen Week** clears every day approval. Notify Accounts and replace affected downloads after corrections.
- On **Weekly Approvals**, expand **Edit / delete** for an employee/day. **Edit times** changes work/training clocks inline in 15-minute steps; **Delete** removes one confirmed entry. Submitted/approved days require a reopening reason first. Saving or deleting refreshes totals and returns any remaining paid day for fresh approval. **Edit entry** opens the full editor and returns to the selected approval week. Time corrections and administrator deletions are audited; other entry details are preserved. **Submit day** retries resubmission, and **Submit week** sends a completed open week back for approval.
- `/approvals` redirects to `/admin/approvals`, avoiding the obsolete client screen's missing-totals error. Administrators and Accounts can use the current screen.
- Uses the existing `DayApproval` model. Deployment checks it before building. Live approval, timesheet and payroll requests also check their actual runtime database before querying it. Only a confirmed missing `DayApproval` table triggers creation of that table, enum and indexes. Existing timesheets, approvals and other tables are not modified. Checks share one promise per server instance and retry after failure. There is no database reset or general schema push.
- Run `npm run test:payroll` (mocked database; no emails) and `npm run build` before publishing.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

Bank-holiday pay is entered manually using a holiday entry. Calendar bank holidays do not add automatic core pay, including on employees' non-working days. Work entered on a bank holiday remains Sun/BH overtime. On Approvals, use **Submit employee weeks** above the daily tables to submit an open week on an employee's behalf; day approvals and full-week approval remain separate.
