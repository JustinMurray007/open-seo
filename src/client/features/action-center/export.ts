import { buildCsv, type CsvValue } from "@/client/lib/csv";

type ExportableAction = {
  status: string;
  severity: string;
  title: string;
  reason: string;
  affectedPageCount: number;
  notes: string;
  firstSeenAt: string;
  lastSeenAt: string;
  evidence: Array<{ url: string }>;
};

const HEADERS = [
  "Status",
  "Severity",
  "Action",
  "Reason",
  "Affected pages",
  "Notes",
  "First seen",
  "Last seen",
  "Evidence URLs",
];

export function actionsToCsv(actions: ExportableAction[]): string {
  const rows: CsvValue[][] = actions.map((action) => [
    action.status,
    action.severity,
    action.title,
    action.reason,
    action.affectedPageCount,
    action.notes,
    action.firstSeenAt,
    action.lastSeenAt,
    action.evidence.map((item) => item.url).join("\n"),
  ]);
  return buildCsv(HEADERS, rows);
}

export function actionsToMarkdown(actions: ExportableAction[]): string {
  const sections = actions.map((action) => {
    const evidence =
      action.evidence.length === 0
        ? "- No URL evidence"
        : action.evidence.map((item) => `- ${item.url}`).join("\n");
    const notes = action.notes.trim() || "_No notes_";
    return `## ${action.title}

- **Status:** ${action.status}
- **Severity:** ${action.severity}
- **Affected pages:** ${action.affectedPageCount}
- **First seen:** ${action.firstSeenAt}
- **Last seen:** ${action.lastSeenAt}

${action.reason}

### Notes

${notes}

### Evidence

${evidence}`;
  });
  return `# SEO Action Center\n\n${sections.join("\n\n---\n\n")}\n`;
}
