import { BriefPdfDocument } from "@/components/brief-pdf-document";
import { buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { type BriefForPdf, type DogForPdf, buildBriefPdfModel } from "@/lib/brief-pdf-model";
import { PDFDownloadLink } from "@react-pdf/renderer";

/**
 * Self-contained "Download PDF" control. Bundles @react-pdf/renderer so the
 * brief route can lazy-load it (keeping the heavy PDF library out of the main
 * bundle). Renders the branded brief document and downloads it with a
 * per-dog filename.
 */
export function BriefDownloadButton({
  brief,
  dog,
}: {
  // Structural subset of what `buildBriefPdfModel` actually reads. `generatedAt`
  // is optional so the public shared-brief page can pass a minimal brief that
  // omits it; the model tolerates a missing/empty value.
  brief: Omit<BriefForPdf, "generatedAt"> & { generatedAt?: string };
  dog: DogForPdf | undefined;
}) {
  const { t } = useI18n();
  const model = buildBriefPdfModel({
    brief: { ...brief, generatedAt: brief.generatedAt ?? "" },
    dog,
  });
  return (
    <PDFDownloadLink
      document={<BriefPdfDocument model={model} />}
      fileName={model.fileName}
      className={buttonVariants({ variant: "outline" })}
    >
      {({ loading }) => (loading ? t("brief.preparingPdf") : t("brief.downloadPdf"))}
    </PDFDownloadLink>
  );
}

export default BriefDownloadButton;
