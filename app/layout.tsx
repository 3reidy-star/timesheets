import "./globals.css";
import TopNav from "./components/TopNav";

export const metadata = {
  title: "Timesheets",
  description: "Timesheet admin",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <TopNav />
        {children}
      </body>
    </html>
  );
}