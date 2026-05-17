import { BriefSpotlight } from "@/components/landing/brief-spotlight";
import { CtaBand } from "@/components/landing/cta-band";
import { Faq } from "@/components/landing/faq";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Philosophy } from "@/components/landing/philosophy";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { TrainersTeaser } from "@/components/landing/trainers-teaser";

export function Landing() {
  return (
    <div className="min-h-screen bg-cream text-slate">
      <SiteNav />
      <main>
        <Hero />
        <HowItWorks />
        <BriefSpotlight />
        <Philosophy />
        <TrainersTeaser />
        <Faq />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}
