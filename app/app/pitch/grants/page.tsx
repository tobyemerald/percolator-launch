"use client";

// ─── Grants deck (/pitch/grants) ────────────────────────────────────────────
//
// Audience: Solana Foundation, Superteam, ecosystem grant committees.
// Leads with the ecosystem gap and the open-source contribution story (built on
// Toly's OSS engine, gave back, everything Apache 2.0). Drops the
// investor-defensibility slides (Business Model revenue curve, Moat,
// Competition matrix) — a grant reviewer funds public goods, not a moat.
// Slides + styling are shared from ../_deck, so facts never drift between decks.

import {
  PitchDeck,
  type SlideDef,
  Slide01OneLiner,
  SlideProblem,
  SlideOrigin,
  Slide05Product,
  SlideMath,
  Slide03Traction,
  SlideRoadmapAsk,
  Slide02Team,
  Slide13Contact,
} from "../_deck";

const SLIDES: SlideDef[] = [
  { id: 1, title: "One-Liner", component: Slide01OneLiner },
  { id: 2, title: "Problem", component: SlideProblem },
  { id: 3, title: "Origin", component: SlideOrigin },
  { id: 4, title: "The Product", component: Slide05Product },
  { id: 5, title: "How the Math Works", component: SlideMath },
  { id: 6, title: "Traction", component: Slide03Traction },
  { id: 7, title: "Roadmap", component: SlideRoadmapAsk },
  { id: 8, title: "Team", component: Slide02Team },
  { id: 9, title: "Contact", component: Slide13Contact },
];

export default function PitchGrantsPage() {
  return <PitchDeck slides={SLIDES} />;
}
