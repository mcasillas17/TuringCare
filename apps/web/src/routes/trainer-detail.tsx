import { useI18n } from "@/i18n";
import { useTrainer } from "@/lib/trainers";
import { Link, useParams } from "react-router-dom";

export function TrainerDetail() {
  const { t } = useI18n();
  const { id = "" } = useParams();
  const { data: tr, isLoading, isError } = useTrainer(id);
  if (isLoading) return <p>{t("common.loading")}</p>;
  if (isError || !tr) return <p className="text-red-600">{t("trainersDir.loadError")}</p>;
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <Link to="/app/trainers" className="text-sm text-slate-soft hover:underline">
        ← {t("trainersDir.back")}
      </Link>
      <h1 className="text-2xl font-bold text-slate">{tr.name}</h1>
      <p className="text-slate-soft">
        {tr.businessName ? `${tr.businessName} · ` : ""}
        {tr.city}, {tr.state}
      </p>
      <div className="text-sm text-slate">
        {tr.specialties.length > 0 && (
          <div>
            {t("trainersDir.filterSpecialty")}: {tr.specialties.join(", ")}
          </div>
        )}
        {tr.methodologyTags.length > 0 && (
          <div>
            {t("trainersDir.filterMethodology")}: {tr.methodologyTags.join(", ")}
          </div>
        )}
        {tr.certifications.length > 0 && <div>{tr.certifications.join(", ")}</div>}
        {tr.website && (
          <div>
            {t("trainersDir.website")}: {tr.website}
          </div>
        )}
        {tr.email && (
          <div>
            {t("trainersDir.email")}: {tr.email}
          </div>
        )}
        {tr.phone && (
          <div>
            {t("trainersDir.phone")}: {tr.phone}
          </div>
        )}
      </div>
    </div>
  );
}
