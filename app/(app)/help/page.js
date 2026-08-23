import PageHeader from "@/app/_components/ui/PageHeader";
import GuideContent from "@/app/_components/committee/GuideContent";

export const metadata = { title: "Guide" };

export default function HelpPage() {
  return (
    <>
      <PageHeader
        title="Guide"
        description="How to run the month, screen by screen. In English and Urdu."
      />
      <GuideContent />
    </>
  );
}
