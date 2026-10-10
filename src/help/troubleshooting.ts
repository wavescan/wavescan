// The troubleshooting guide built into the app (Help & feedback), so it works offline. Same
// advice as the README's "Troubleshooting" section: keep the two in step.

export interface HelpTopic {
  id: string;
  question: string;
  answer: string[];
  /** Extra words people might search for. */
  keywords: string;
  /** Only shown on this platform, or on both when absent. */
  platform?: "windows" | "macos";
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "not-found",
    question: "“Game window not found”",
    answer: ["Make sure Wuthering Waves is running and isn't minimised."],
    keywords: "missing running minimised minimized",
  },
  {
    id: "layout",
    question: "Echoes are misread, or “Layout not recognised”",
    answer: [
      "The game must be in English.",
      "The window must be 16:9 or 16:10 (for example 1920×1080 or 2560×1600). Ultrawide isn't supported yet.",
      "HDR must be off in the game's graphics settings.",
      "You need to be on Bag → Echoes with an echo selected.",
    ],
    keywords: "language english hdr ultrawide 21:9 resolution aspect wrong",
  },
  {
    id: "wrong-values",
    question: "Some values are wrong",
    answer: [
      "Fix them on the Review screen before exporting: values Wavescan wasn't sure about are marked “check”.",
      "Then use Report this misread, so the reader can be improved.",
    ],
    keywords: "misread incorrect substat value level fix",
  },
  {
    id: "admin",
    question: "Auto mode doesn't click anything",
    answer: [
      "Windows blocks clicks from normal apps into the game, sometimes without an error.",
      "Close Wavescan, right-click it, choose Run as administrator, and try again. Watch mode never needs this.",
    ],
    keywords: "administrator admin clicks blocked auto",
    platform: "windows",
  },
  {
    id: "f8",
    question: "F8 doesn't stop auto mode",
    answer: ["Another app is probably using F8 (the auto mode screen says so). Moving the mouse always stops it."],
    keywords: "hotkey stop key",
  },
  {
    id: "black",
    question: "Wavescan shows a black window",
    answer: [
      "Go to System Settings → Privacy & Security → Screen Recording and turn on Wavescan.",
      "Then quit and reopen Wavescan.",
    ],
    keywords: "screen recording permission black",
    platform: "macos",
  },
  {
    id: "accessibility",
    question: "“Permission needed: Accessibility”",
    answer: ["Go to System Settings → Privacy & Security → Accessibility, turn on Wavescan, then try again."],
    keywords: "permission click auto",
    platform: "macos",
  },
  {
    id: "same-echo",
    question: "Auto mode skipped an echo",
    answer: [
      "If two echoes next to each other look exactly the same on the details panel (mostly +0 echoes with no substats), Wavescan can't tell it moved and reads only the first.",
      "Echoes with substats always differ, so levelled echoes aren't affected.",
    ],
    keywords: "missing duplicate skipped +0",
  },
  {
    id: "yellow-border",
    question: "A yellow border appears around the game",
    answer: ["On Windows 10, Windows draws it while Wavescan reads the game. It's normal and doesn't affect the scan."],
    keywords: "border capture",
    platform: "windows",
  },
];

/** Topics for this platform matching every word of `query` (all topics when it's empty). */
export function searchTopics(query: string, platform: string | null): HelpTopic[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return HELP_TOPICS.filter((topic) => {
    if (topic.platform && platform && topic.platform !== platform) return false;
    const text = `${topic.question} ${topic.answer.join(" ")} ${topic.keywords}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
