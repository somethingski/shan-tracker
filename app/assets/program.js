// ============================================================
// 山 Shan — program definition
// The locked 6-day PPL: Sat Push A, Mon Pull A, Tue Legs A,
// Wed Push B, Thu Pull B, Fri Legs B. (Sun rest.)
// Rep wave: wk1 10-12, wk2 7-9, wk3 4-6, wk4 10-12 (repeat).
// 6-week transitions handled by transitionState().
// ============================================================

// day_type by JS getDay(): 0 Sun,1 Mon,2 Tue,3 Wed,4 Thu,5 Fri,6 Sat
export const DAY_BY_WEEKDAY = {
  6: "push_a", 1: "pull_a", 2: "legs_a",
  3: "push_b", 4: "pull_b", 5: "legs_b", 0: "rest"
};

export const DAY_TITLES = {
  push_a: "Push · 推 A", pull_a: "Pull · 拉 A", legs_a: "Legs · 腿 A",
  push_b: "Push · 推 B", pull_b: "Pull · 拉 B", legs_b: "Legs · 腿 B",
  rest:   "Rest · 息"
};

// exercises per day. `sets` is target set count. `rank` marks rank-bearing lifts.
// `transition` flags exercises whose form/mode changes at the 6-week mark.
export const PROGRAM = {
  push_a: [
    { key:"bench",           name:"Barbell bench press",            sets:4, rank:"bench" },
    { key:"db_incline",      name:"Dumbbell incline bench press",   sets:3 },
    { key:"pec_fly",         name:"Machine pec fly",                sets:3 },
    { key:"cable_lat_raise", name:"Cable lateral raises",           sets:3 },
    { key:"face_pull",       name:"Face pulls",                     sets:3 },
    { key:"skullcrusher",    name:"Eccentric-accentuated skullcrusher", sets:3 },
    { key:"tri_pushdown",    name:"Tricep cable pushdowns",         sets:3 },
  ],
  pull_a: [
    { key:"pullup",          name:"Pull-up",                        sets:4, transition:"weighted" },
    { key:"cable_row_narrow",name:"Seated cable row, narrow grip",  sets:4 },
    { key:"lat_pulldown",    name:"Lat pulldown machine",           sets:3 },
    { key:"rear_delt",       name:"Machine rear deltoid (reverse pec-deck)", sets:3 },
    { key:"shrug",           name:"Barbell shrugs",                 sets:3 },
    { key:"ez_curl",         name:"EZ bar curls",                   sets:3 },
    { key:"wrist_curl",      name:"Behind-the-back wrist curl (superset reverse curls)", sets:3 },
  ],
  legs_a: [
    { key:"squat",           name:"Barbell back squat",             sets:4, rank:"squat" },
    { key:"leg_press",       name:"Leg press",                      sets:3 },
    { key:"bulgarian",       name:"Bulgarian split squat",          sets:3 },
    { key:"leg_ext",         name:"Machine leg extension",          sets:3 },
    { key:"seated_curl",     name:"Seated leg curl",                sets:3 },
    { key:"calf",            name:"Calf raises",                    sets:4, transition:"standing" },
    { key:"abs_a",           name:"Weighted decline sit-up / cable crunch", sets:3 },
    { key:"obliques",        name:"Hanging leg raise / oblique twist", sets:3 },
  ],
  push_b: [
    { key:"db_incline2",     name:"Dumbbell incline bench press",   sets:4 },
    { key:"db_shoulder_press",name:"Dumbbell shoulder press",       sets:4, rank:"db_shoulder_press" },
    { key:"pec_fly2",        name:"Machine pec fly",                sets:3 },
    { key:"dips",            name:"Dips",                           sets:3, transition:"weighted" },
    { key:"cable_lat_raise2",name:"Cable lateral raises",           sets:3 },
    { key:"face_pull2",      name:"Face pulls",                     sets:3 },
    { key:"tri_pushdown2",   name:"Tricep cable pushdowns",         sets:3 },
  ],
  pull_b: [
    { key:"lat_pulldown2",   name:"Lat pulldown machine",           sets:4 },
    { key:"chest_row",       name:"Chest-supported row machine",    sets:4 },
    { key:"cable_row_narrow2",name:"Seated cable row, narrow grip", sets:3 },
    { key:"rear_delt2",      name:"Machine rear deltoid (reverse pec-deck)", sets:3 },
    { key:"db_curl",         name:"Dumbbell bicep curls",           sets:3 },
    { key:"cable_curl",      name:"Cable bicep curls",              sets:3 },
  ],
  legs_b: [
    { key:"rdl",             name:"Barbell Romanian deadlift",      sets:4, rank:"rdl" },
    { key:"hack_squat",      name:"Hack squat machine",             sets:3 },
    { key:"hip_thrust",      name:"Hip thrust",                     sets:3 },
    { key:"abductor",        name:"Hip abductor/adductor machine",  sets:3 },
    { key:"seated_curl2",    name:"Seated leg curl",                sets:3 },
    { key:"single_calf",     name:"Single-leg calf raise",          sets:3 },
    { key:"abs_b",           name:"Ab machine / weighted crunches", sets:3, transition:"weighted" },
    { key:"plank",           name:"Plank + side plank",             sets:3 },
  ],
};

// Days since program start → which wave week (0-indexed within the 4-week cycle)
// and absolute week number (for 6-week transitions).
export function weekInfo(programStart, today = new Date()){
  const start = new Date(programStart + "T00:00:00");
  const ms = today - start;
  // clamp: dates before program_start (reachable via history browsing) read as week 1
  const dayNum = Math.max(0, Math.floor(ms / 86400000)); // 0-based day
  const weekNum = Math.floor(dayNum / 7);              // 0-based absolute week
  const wavePos = ((weekNum % 4) + 4) % 4;             // 0..3
  const brackets = ["10-12","7-9","4-6","10-12"];
  return { dayNum, weekNum, weekOrdinal: weekNum+1, bracket: brackets[wavePos], wavePos };
}

// Transition state at a given absolute week (0-based). Flips after 6 full weeks.
export function transitionState(weekNum){
  const past6 = weekNum >= 6;
  return {
    calf:   past6 ? "Standing calf raises"      : "Seated calf raises",
    pullup: past6 ? "Weighted pull-ups"         : "Bodyweight pull-ups",
    dips:   past6 ? "Weighted dips"             : "Bodyweight dips",
    abs:    past6 ? "Weighted crunches"         : "Bodyweight crunches",
    past6,
  };
}

// Is this bracket the heavy (rank-eligible) one? Only 4-6 feeds ranks.
export function isRankBracket(bracket){ return bracket === "4-6"; }
