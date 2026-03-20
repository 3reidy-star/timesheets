import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}