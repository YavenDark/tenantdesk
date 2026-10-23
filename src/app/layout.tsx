import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TenantDesk",
  description: "Multi-tenant project desk",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
