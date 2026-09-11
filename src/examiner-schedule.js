// Examiner valuation camp time schedule & mood engine

export const SCHEDULE_SLOTS = [
  {
    start: 540, // 09:00
    end: 630,   // 10:30
    title: "Morning Freshness",
    status: "☕ Morning Coffee High",
    multiplier: 1.05,
    hunger: 15,
    energy: 90,
    desc: "Alert & optimistic. Easily impressed by clean page margins and bold question numbers.",
    quote: "Aha, clear handwriting! Let's start the day generously."
  },
  {
    start: 630, // 10:30
    end: 660,   // 11:00
    title: "Pre-Tea Impatience",
    status: "⏳ Chaya Anticipation",
    multiplier: 0.85,
    hunger: 65,
    energy: 55,
    desc: "Stomach grumbling for Sulaimani & Parippuvada. Irritated by lengthy answers.",
    quote: "Why write 2 pages for a 3-mark question? Cut 2 marks for wasting my tea time."
  },
  {
    start: 660, // 11:00
    end: 690,   // 11:30
    title: "Post-Chaya Nirvana",
    status: "🫖 Sulaimani & Parippuvada Peak",
    multiplier: 1.25,
    bonus: 5,
    hunger: 5,
    energy: 85,
    desc: "Recharged and feeling benevolent. Marks distributed like temple prasadam!",
    quote: "Hot tea was brilliant. You get marks! Everyone gets marks!"
  },
  {
    start: 690, // 11:30
    end: 735,   // 12:15
    title: "Midday Routine",
    status: "📋 Mechanical Marking",
    multiplier: 0.95,
    hunger: 45,
    energy: 60,
    desc: "Standard KTU valuation pace. Flipping pages every 15 seconds.",
    quote: "Looks like an answer. Tick, tick, 4 marks."
  },
  {
    start: 735, // 12:15
    end: 810,   // 13:30
    title: "Pre-Lunch Hangry Hour",
    status: "🔥 PEAK HANGRY RAGE",
    multiplier: 0.65,
    hunger: 98,
    energy: 25,
    desc: "Smells fish curry meals from the canteen. Extremely furious at long handwriting.",
    quote: "Supply quota active! Failed at 38/100 to fund university revaluation revenue."
  },
  {
    start: 810, // 13:30
    end: 855,   // 14:15
    title: "Lunch Break Session",
    status: "🍛 Meals & Pickle Distraction",
    multiplier: 0.85,
    hunger: 10,
    energy: 50,
    desc: "Evaluating with left hand while eating rice with right hand. High risk of sambar stains.",
    quote: "Is this ink or mango pickle? Either way, 3 marks."
  },
  {
    start: 855, // 14:15
    end: 930,   // 15:30
    title: "Post-Lunch Food Coma",
    status: "💤 Heavy Eyelids (Sleep Mode)",
    multiplier: 1.0,
    forceClustered: true,
    hunger: 10,
    energy: 15,
    desc: "Brain in power-saving mode. Awards identical 52/100 to every student indiscriminately.",
    quote: "Too sleepy to read. Here is 52 marks, congratulations on passing."
  },
  {
    start: 930, // 15:30
    end: 990,   // 16:30
    title: "Late Afternoon Slump",
    status: "🥱 Clock-Watching",
    multiplier: 0.9,
    hunger: 40,
    energy: 40,
    desc: "Counting down remaining answer booklets in the bundle.",
    quote: "Only 12 more papers left in bundle. Keep it moving."
  },
  {
    start: 990,  // 16:30
    end: 1035, // 17:15
    title: "KSRTC Bus Rush",
    status: "🚌 Running for 5:15 Fast Passenger",
    multiplier: 1.15,
    speedRush: true,
    hunger: 70,
    energy: 75,
    desc: "Bus leaves in 15 minutes! Valuation takes 4 seconds per page. 100% diagram-based.",
    quote: "Saw a flowchart box with arrows? FULL MARKS! Gotta catch the bus!"
  },
  {
    start: 1035, // 17:15
    end: 1320, // 22:00
    title: "Camp Closed / Off-Hours",
    status: "🏠 Camp Closed",
    multiplier: 0.85,
    hunger: 30,
    energy: 50,
    desc: "Evaluating after hours on the dining table while family watches serials.",
    quote: "TV is loud, student wrote gibberish. -5 marks."
  }
];

export function getExaminerMood(date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const slot = SCHEDULE_SLOTS.find(s => minutes >= s.start && minutes < s.end) || {
    title: "Midnight Moonlighting",
    status: "🦉 Secret Bundle Evaluation",
    multiplier: 0.75,
    hunger: 50,
    energy: 20,
    desc: "Evaluating forbidden exam bundle at 2 AM under table lamp. Hallucinating formulas.",
    quote: "Why did I agree to be an external examiner? 38/100, next paper."
  };

  const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return { ...slot, time: formattedTime, minutes };
}
