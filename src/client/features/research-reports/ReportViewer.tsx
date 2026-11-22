import { REPORT_IFRAME_SANDBOX } from "@/shared/report-sandbox";
export function ReportViewer({ src, title }: { src: string; title: string }) {
  return (
    <iframe
      src={src}
      title={title}
      sandbox={REPORT_IFRAME_SANDBOX}
      referrerPolicy="no-referrer"
      className="h-full min-h-[65vh] w-full rounded-lg border border-base-300 bg-white"
    />
  );
}
