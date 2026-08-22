import "@/app/_styles/globals.css";
import { siteConfig } from "@/app/_lib/siteConfig";

export const metadata = {
  title: {
    default: `${siteConfig.committeeName} — ${siteConfig.name}`,
    template: `%s — ${siteConfig.name}`,
  },
  description: "Committee accounts, kept on one laptop.",
};

// Every page reads the database and every figure has to be current. There is
// exactly one user on one machine, so there is nothing to gain from caching a
// page and a great deal to lose from showing yesterday's balance.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
