import { JournalView } from "@/components/journal/journal-view";
import { useParams, useSearchParams } from "react-router-dom";

export function DogJournal() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const composeRaw = params.get("compose");
  const composeMode: "moment" | "daily_checkin" | undefined =
    composeRaw === "daily_checkin"
      ? "daily_checkin"
      : composeRaw === "moment"
        ? "moment"
        : undefined;
  return <JournalView scopedDogId={id} composeMode={composeMode} />;
}
