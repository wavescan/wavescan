import { reactive } from "vue";
import type { ReportKind } from "@/feedback/issue";
import type { FieldId } from "@/review/fields";

// Which screen is showing, plus what the Report screen should be about when another screen
// sends the user there ("Report this misread" on echo #35). A plain reactive object instead
// of a router: the app has a handful of screens and no URLs.

export type View = "home" | "scan" | "review" | "diagnostics" | "help" | "report";

export interface ReportTarget {
  kind: ReportKind;
  /** The echo and field for a misread report. */
  echoId?: string;
  field?: FieldId | null;
}

export interface Navigation {
  view: View;
  /** Scan screen tab. */
  scanMode: "watch" | "auto";
  report: ReportTarget;
  /** How the last auto scan ended (its message), for an auto-mode report. */
  lastAutoResult: string | null;
  /** True while a scan runs: leaving the Scan screen is blocked. */
  busy: boolean;
}

export const navigation = reactive<Navigation>({
  view: "home",
  scanMode: "watch",
  report: { kind: "misread" },
  lastAutoResult: null,
  busy: false,
});

/** Shows a screen. Ignored while a scan is running, except to stay on Scan. */
export function go(view: View): void {
  if (navigation.busy && view !== "scan") return;
  navigation.view = view;
}

/** Opens the Scan screen on a tab. */
export function goScan(mode: "watch" | "auto"): void {
  if (navigation.busy) return;
  navigation.scanMode = mode;
  navigation.view = "scan";
}

/** Opens the Report screen about something specific. */
export function goReport(target: ReportTarget): void {
  if (navigation.busy) return;
  navigation.report = target;
  navigation.view = "report";
}
