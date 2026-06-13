"use client";

// ─── Technical deck (/pitch/technical) ──────────────────────────────────────
//
// Audience: engineers, protocol reviewers, Toly-grade technical diligence.
// Leads with the architecture and the engine; the math comes early, not buried.
// Drops the business-facing slides (Why Now, Business Model, Moat, GTM) — this
// audience is evaluating correctness and design, not the revenue curve.
// Slides + styling are shared from ../_deck, so facts never drift between decks.

import {
  PitchDeck,
  type SlideDef,
  Slide01OneLiner,
  SlideProblem,
  SlideMath,
  Slide05Product,
  SlideOrigin,
  SlideCompetition,
  Slide03Traction,
  SlideRoadmapAsk,
  Slide02Team,
  Slide13Contact,
} from "../_deck";

const SLIDES: SlideDef[] = [
  { id: 1, title: "One-Liner", component: Slide01OneLiner },
  { id: 2, title: "Problem", component: SlideProblem },
  { id: 3, title: "How the Math Works", component: SlideMath },
  { id: 4, title: "The Product", component: Slide05Product },
  { id: 5, title: "Origin", component: SlideOrigin },
  { id: 6, title: "Competition", component: SlideCompetition },
  { id: 7, title: "Traction", component: Slide03Traction },
  { id: 8, title: "Roadmap", component: SlideRoadmapAsk },
  { id: 9, title: "Team", component: Slide02Team },
  { id: 10, title: "Contact", component: Slide13Contact },
];

export default function PitchTechnicalPage() {
  return <PitchDeck slides={SLIDES} />;
}
