import "./globals.css";
import TopNav from "./components/TopNav";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Timesheets",
  description: "Timesheet admin",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/timesheet");
  }

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <TopNav />

        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>

        <footer className="mx-auto max-w-6xl px-6 pb-10 text-xs text-slate-500">
          <div className="border-t border-slate-200 pt-6">Timesheets</div>
        </footer>
      </body>
    </html>
  );
}