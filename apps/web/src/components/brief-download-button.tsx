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
  brief: BriefForPdf;
  dog: DogForPdf | undefined;
}) {
  const { t, locale } = useI18n();
  const model = buildBriefPdfModel({ brief, dog, locale });
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
