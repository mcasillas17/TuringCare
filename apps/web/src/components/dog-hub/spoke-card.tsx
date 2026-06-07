import { Link } from "react-router-dom";

type Props = {
  to: string;
  title: string;
  metric: string;
  isEmpty?: boolean;
};

export function SpokeCard({ to, title, metric, isEmpty }: Props) {
  return (
    <Link
      to={to}
      className="block rounded border border-silver bg-white p-4 transition hover:border-slate hover:shadow-sm"
    >
      <div className="text-sm font-semibold text-slate">{title}</div>
      <div className={`mt-2 text-sm ${isEmpty ? "text-slate-soft italic" : "text-slate-soft"}`}>
        {metric}
      </div>
    </Link>
  );
}
