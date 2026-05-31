import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "OXY AI",
  description:
    "OXY AI — Your intelligent, natural conversational assistant with multimodal capabilities.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}