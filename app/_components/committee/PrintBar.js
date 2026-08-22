"use client";

import { useRouter } from "next/navigation";
import Icon from "@/app/_components/ui/Icon";

export default function PrintBar() {
  const router = useRouter();

  return (
    <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-2">
      <button type="button" onClick={() => router.back()} className="btn">
        Back
      </button>
      <p className="text-sm text-text-light">
        Print this, or choose &ldquo;Save as PDF&rdquo; to send it on.
      </p>
      <button type="button" onClick={() => window.print()} className="btn-primary">
        <Icon name="print" className="size-5" />
        Print
      </button>
    </div>
  );
}
