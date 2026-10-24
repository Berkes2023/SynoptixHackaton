import type { Metadata } from "next";
import { GuidedDemo } from "@/components/marketing/GuidedDemo";

export const metadata: Metadata = {
  title: "Interactive demo",
  description: "Run a real fairness audit on fictional recruitment data: explore applications, detect a disparity, investigate it and generate a report. No sign-up.",
};

export default function DemoPage() {
  return <GuidedDemo />;
}
