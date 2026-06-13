"use client";

// ─── VC deck ──────────────────────────────────────────────────────────────────
//
// Investor-facing order: problem + market + why-now + money + moat lead, the
// engine detail sits mid-deck. All slide components and styling come from
// ./_deck (the shared library) so facts live in exactly one place across the
// VC / technical / grants variants. Edit a slide there, every deck updates.

import {
  PitchDeck,
  type SlideDef,
  Slide01OneLiner,
  SlideProblem,
  Slide05Product,
  SlideOrigin,
  SlideMath,
  Slide02Team,
  Slide03Traction,
  Slide09WhyNow,
  SlideCompetition,
  Slide06Money,
  SlideMoat,
  SlideGTM,
  SlideRoadmapAsk,
  Slide13Contact,
} from "./_deck";

const SLIDES: SlideDef[] = [
  { id: 1, title: "One-Liner", component: Slide01OneLiner },
  { id: 2, title: "Problem", component: SlideProblem },
  { id: 3, title: "The Product", component: Slide05Product },
  { id: 4, title: "Origin", component: SlideOrigin },
  { id: 5, title: "How the Math Works", component: SlideMath },
  { id: 6, title: "Team", component: Slide02Team },
  { id: 7, title: "Traction", component: Slide03Traction },
  { id: 8, title: "Why Now", component: Slide09WhyNow },
  { id: 9, title: "Competition", component: SlideCompetition },
  { id: 10, title: "Business Model", component: Slide06Money },
  { id: 11, title: "Moat", component: SlideMoat },
  { id: 12, title: "Go-to-Market", component: SlideGTM },
  { id: 13, title: "Roadmap", component: SlideRoadmapAsk },
  { id: 14, title: "Contact", component: Slide13Contact },
];

export default function PitchVCPage() {
  return <PitchDeck slides={SLIDES} />;
}
