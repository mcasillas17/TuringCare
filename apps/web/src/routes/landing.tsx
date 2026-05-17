import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function Landing() {
  return (
    <div className="p-8 space-y-4">
      <h1 className="text-3xl font-bold">TuringCare</h1>
      <p className="text-muted-foreground">
        Humane, force-free dog-training support. Journal behavior, build a Brief.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link to="/register">Get started</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/login">Log in</Link>
        </Button>
      </div>
    </div>
  );
}
