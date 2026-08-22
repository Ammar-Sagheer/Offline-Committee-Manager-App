import { redirect } from "next/navigation";
import { getSessionUser } from "@/app/_lib/helpers";
import PrintBar from "@/app/_components/committee/PrintBar";

/**
 * The sheets the other nine members actually see.
 *
 * Nobody but Arshad opens this app, and nobody can: it answers only on this
 * laptop. So the printed page IS the sharing mechanism, and it is a real screen
 * rather than a stylesheet bolted on at the end -- printed or saved as a PDF and
 * sent on.
 *
 * No navigation, no buttons in the output, and the print rules in globals.css
 * take over from there.
 */
export default async function PrintLayout({ children }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-surface-alt py-8 print:bg-white print:py-0">
      <PrintBar />
      <div className="mx-auto max-w-[210mm] bg-surface p-10 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        {children}
      </div>
    </div>
  );
}
