import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./auth-context";
import Header from "./header";

export const metadata: Metadata = {
  title: "Daily Reports",
  description: "Departmental daily reporting",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <AuthProvider>
          <Header />
          <main className="px-4 sm:px-6 pb-16">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
