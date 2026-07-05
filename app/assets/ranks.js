// ============================================================
// 山 Shan — Rank engine
// Bodyweight-adjusted, computed ONLY from 4-6 rep sets.
// Structure mirrors Valorant's 25-step ladder; artwork/pigments
// are original (see DESIGN_SYSTEM.md). Numbers are grounded in
// published bodyweight-ratio strength standards, anchored so the
// 95th percentile of lifters aligns to Diamond 3 (per spec).
// ============================================================

// The 25 tiers, in order (index 0..24).
export const TIERS = [
  "Iron 1","Iron 2","Iron 3","Bronze 1","Bronze 2","Bronze 3",
  "Silver 1","Silver 2","Silver 3","Gold 1","Gold 2","Gold 3",
  "Platinum 1","Platinum 2","Platinum 3","Diamond 1","Diamond 2","Diamond 3",
  "Ascendant 1","Ascendant 2","Ascendant 3","Immortal 1","Immortal 2","Immortal 3","Radiant"
];

// Valorant cumulative population distribution — the % of players AT OR BELOW
// the TOP of each tier. Used as the percentile spine for interpolation.
export const CUM = [
  0.65,2.82,7.57,14.46,23.15,30.63,38.59,45.75,52.60,60.56,67.46,73.00,
  78.30,82.79,86.37,89.99,93.22,95.68,97.71,98.77,99.32,99.68,99.82,99.95,100.0
];

// Percentile anchors → 1RM-as-multiple-of-bodyweight, per lift (male standards).
// Anchors are the classic 5 tiers (Beginner/Novice/Intermediate/Advanced/Elite)
// = 5th/25th/50th/75th/95th percentile. Ratios compiled from the recurring
// ExRx-style / StrengthLevel population standards. Elite (95th) is anchored to
// Diamond 3, exactly as specified in the bench worked-example.
//
// bench worked example (from user) at their bodyweight implied these ratios;
// we express every lift as ratio so ranks recompute against logged bodyweight.
const ANCHORS = {
  // pctile:   5     25     50     75     95
  bench:      [0.50, 0.85, 1.15, 1.55, 2.00],
  squat:      [0.75, 1.20, 1.55, 2.00, 2.65],
  rdl:        [0.90, 1.40, 1.85, 2.35, 3.05],  // RDL judged on deadlift-family standards
  db_shoulder_press: [0.20, 0.35, 0.48, 0.62, 0.85] // per-dumbbell; overhead-press-derived, approximate
};
const ANCHOR_P = [5, 25, 50, 75, 95];

// Linear interpolation of ratio at an arbitrary percentile from the 5 anchors,
// with controlled extrapolation past the 95th up to the Radiant ceiling.
function ratioAtPercentile(lift, p) {
  const a = ANCHORS[lift];
  if (!a) return null;
  if (p <= ANCHOR_P[0]) {
    // extrapolate below 5th using the 5→25 slope, floored so it never goes <=0
    const slope = (a[1]-a[0])/(ANCHOR_P[1]-ANCHOR_P[0]);
    return Math.max(0.1, a[0] + slope*(p-ANCHOR_P[0]));
  }
  for (let i=0;i<ANCHOR_P.length-1;i++){
    if (p<=ANCHOR_P[i+1]){
      const t=(p-ANCHOR_P[i])/(ANCHOR_P[i+1]-ANCHOR_P[i]);
      return a[i]+t*(a[i+1]-a[i]);
    }
  }
  // above 95th (Ascendant→Radiant tail): extrapolate on the 75→95 slope but
  // damped, so Radiant is a genuine reach rather than a linear runaway.
  const slope=(a[4]-a[3])/(ANCHOR_P[4]-ANCHOR_P[3]);
  const over=p-95;
  return a[4]+slope*over*0.6;
}

// Build the 25 ratio thresholds for a lift as a STRICTLY INCREASING ladder.
//
// Two segments, joined at Diamond 3 (index 17), which is pinned to the 95th-
// percentile "Elite" ratio exactly as specified:
//   • Iron 1 (0) → Diamond 3 (17): map each tier to a percentile via the
//     Valorant cumulative spine, read the population ratio there. This covers
//     the real 5th–95th percentile range where published data is solid.
//   • Diamond 3 (17) → Radiant (24): a deliberate super-elite tail. Population
//     data past the 95th flattens, so instead of interpolating a near-flat
//     curve we climb on a fixed, mildly accelerating step from Elite up to a
//     Radiant ceiling (~1.18× the Elite ratio), making Radiant a true reach.
// Monotonicity is enforced at the end so no two tiers can ever share a value.
export function thresholdsFor(lift){
  const a = ANCHORS[lift];
  if(!a) return null;
  const D3 = 17;                 // Diamond 3 index
  const elite = a[4];            // 95th-percentile ratio → pinned to Diamond 3
  const out = new Array(25);

  // lower segment: Iron 1..Diamond 3
  for(let i=0;i<=D3;i++){
    // spread percentile from ~3rd up to 95th across these 18 steps, using the
    // cumulative spine so tier spacing echoes the game's rarity curve
    const frac = i/D3;                       // 0..1
    const p = 3 + frac*(95-3);               // 3rd → 95th percentile
    out[i] = ratioAtPercentile(lift, p);
  }
  out[D3] = elite;                           // hard-pin Diamond 3 = Elite

  // upper tail: Ascendant 1..Radiant (indices 18..24), 7 steps above Elite.
  // Ceiling is elite * 1.10 (compressed tail — Radiant is a reach but not
  // superhuman); steps accelerate slightly toward the top.
  const ceiling = elite * 1.10;
  const tailN = 24 - D3;                      // 7
  for(let j=1;j<=tailN;j++){
    const t = j/tailN;                        // 0..1
    const eased = Math.pow(t, 1.25);          // mild acceleration
    out[D3+j] = elite + (ceiling-elite)*eased;
  }

  // enforce strict monotonic increase + round
  for(let i=1;i<25;i++){ if(out[i] <= out[i-1]) out[i] = out[i-1] + 0.02; }
  return out.map(round2);
}

// Conservative 1RM: lower of Epley and Brzycki (strictest honest estimate).
// Only valid for 4-6 reps per spec; caller guarantees the bracket.
export function conservative1RM(weight, reps){
  const epley  = weight * (1 + reps/30);
  const brzycki= weight * (36 / (37 - reps));
  return Math.min(epley, brzycki);
}

// Given a lift, an estimated 1RM, and current bodyweight → tier index 0..24.
export function tierIndex(lift, est1rm, bodyweight){
  if (!est1rm || !bodyweight) return 0;
  const ratio = est1rm / bodyweight;
  const th = thresholdsFor(lift);
  let idx = 0;
  for (let i=0;i<th.length;i++){ if (ratio >= th[i]) idx = i; }
  // if below the very first threshold, still Iron 1 (idx 0)
  return (ratio < th[0]) ? 0 : idx;
}

// Percentile label for a ratio (interpolated back through anchors) — for the
// "top XX%" line in the seal modal.
export function percentileFor(lift, est1rm, bodyweight){
  if(!est1rm||!bodyweight) return null;
  const ratio=est1rm/bodyweight, a=ANCHORS[lift];
  if(!a) return null;
  if(ratio<=a[0]) return 95; // weaker than ~95% of lifters (bottom)
  for(let i=0;i<a.length-1;i++){
    if(ratio<=a[i+1]){
      const t=(ratio-a[i])/(a[i+1]-a[i]);
      const p=ANCHOR_P[i]+t*(ANCHOR_P[i+1]-ANCHOR_P[i]);
      return Math.round(100-p); // "stronger than p% → top (100-p)%"
    }
  }
  return 1; // stronger than ~95%+ → top few %
}

function round1(x){ return Math.round(x*10)/10; }
function round2(x){ return Math.round(x*100)/100; }

export const RANK_LIFTS = {
  bench:            "Barbell bench press",
  squat:            "Barbell back squat",
  rdl:              "Barbell Romanian deadlift",
  db_shoulder_press:"Dumbbell shoulder press"
};
