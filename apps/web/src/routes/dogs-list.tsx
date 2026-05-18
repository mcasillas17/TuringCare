import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { signOut } from "@/lib/auth-client";
import { useDogs } from "@/lib/dogs";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function DogsList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: dogs, isLoading, isError } = useDogs();

  return (
    <div className="relative mx-auto max-w-2xl p-8 space-y-4">
      <LanguageToggle className="absolute right-4 top-4" />
      <h1 className="text-2xl font-bold text-slate">{t("dogs.listTitle")}</h1>
      {isLoading && <p>{t("common.loading")}</p>}
      {isError && <p className="text-red-600">{t("dogs.loadError")}</p>}
      {dogs && dogs.length === 0 && <p className="text-slate-soft">{t("dogs.empty")}</p>}
      <ul className="space-y-2">
        {dogs?.map((d) => (
          <li key={d.id}>
            <Link
              to={`/app/dogs/${d.id}`}
              className="block rounded border border-silver p-4 hover:bg-surface-sand"
            >
              <span className="font-semibold text-slate">{d.name}</span>
              {d.breed && <span className="text-slate-soft"> · {d.breed}</span>}
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button onClick={() => navigate("/app/dogs/new")} className="bg-slate text-cream">
          {t("dogs.add")}
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            await signOut();
            toast.success(t("app.signedOut"));
            navigate("/login");
          }}
        >
          {t("app.signOut")}
        </Button>
      </div>
    </div>
  );
}
