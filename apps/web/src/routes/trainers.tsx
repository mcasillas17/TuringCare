import { useI18n } from "@/i18n";
import { useTrainers } from "@/lib/trainers";
import { useState } from "react";
import { Link } from "react-router-dom";

const input = "rounded border border-silver bg-white px-2 py-1 text-sm";

export function Trainers() {
  const { t } = useI18n();
  const [state, setState] = useState("");
  const [specialty, setSpecialty] = useState("");
  const { data: trainers, isError } = useTrainers({
    state: state || undefined,
    specialty: specialty || undefined,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-slate">{t("trainersDir.title")}</h1>
      <p className="text-slate-soft">{t("trainersDir.subtitle")}</p>
      <div className="flex gap-2">
        <input
          className={input}
          placeholder={t("trainersDir.filterState")}
          value={state}
          onChange={(e) => setState(e.target.value)}
        />
        <input
          className={input}
          placeholder={t("trainersDir.filterSpecialty")}
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
        />
        <button
          type="button"
          className={input}
          onClick={() => {
            setState("");
            setSpecialty("");
          }}
        >
          {t("trainersDir.clear")}
        </button>
      </div>
      {isError && <p className="text-red-600">{t("trainersDir.loadError")}</p>}
      {trainers?.length === 0 && <p className="text-slate-soft">{t("trainersDir.empty")}</p>}
      <ul className="space-y-2">
        {trainers?.map((tr) => (
          <li key={tr.id}>
            <Link
              to={`/app/trainers/${tr.id}`}
              className="block rounded border border-silver bg-white p-4 hover:bg-surface-sand"
            >
              <span className="font-semibold text-slate">{tr.name}</span>
              <span className="text-slate-soft">
                {" "}
                · {tr.city}, {tr.state}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
