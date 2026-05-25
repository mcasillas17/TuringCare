import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useSession } from "@/lib/auth-client";
import { useTrainer } from "@/lib/trainers";
import { Link, useParams } from "react-router-dom";

export function TrainerDetail() {
  const { t } = useI18n();
  const { id = "" } = useParams();
  const { data: session } = useSession();
  const { data: tr, isLoading, isError } = useTrainer(id);
  if (isLoading) return <p>{t("common.loading")}</p>;
  if (isError || !tr) return <p className="text-red-600">{t("trainersDir.loadError")}</p>;
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <Link to="/trainers" className="text-sm text-slate-soft hover:underline">
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
      {tr.email && (
        <div className="pt-4">
          <Button asChild className="bg-slate text-cream">
            <Link to={`/my/brief?recipient=${encodeURIComponent(tr.email)}`}>
              {t("trainersDir.sendBriefCta")} →
            </Link>
          </Button>
        </div>
      )}
      {!session && (
        <div className="rounded border border-silver bg-white p-4">
          <p className="text-sm text-slate-soft">{t("trainersDir.signUpToContact")}</p>
          <Button asChild className="mt-2 bg-slate text-cream">
            <Link to="/register">{t("trainersDir.signUpToContactCta")}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
