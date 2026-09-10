import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Product support dashboard",
  description: "Internal product support dashboard",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="max-w-full overflow-x-clip">
      <body className="min-h-dvh max-w-full overflow-x-clip">{children}</body>
    </html>
  );
}
