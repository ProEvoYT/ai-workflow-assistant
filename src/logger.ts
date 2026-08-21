import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EmailSummary } from "./graph.js";
import type { ClassificationResult } from "./classify.js";

const LOG_DIR = "logs";

export interface RunLogEntry {
  emailId: string;
  subject: string;
  from: string;
  outcome: "filed" | "needs_review" | "classification_failed" | "action_failed";
  classification: ClassificationResult | null;
  filedTo?: string;
  attachmentsSaved?: number;
  error?: string;
}

export class RunLog {
  private entries: RunLogEntry[] = [];
  private startedAt = new Date();

  recordFiled(email: EmailSummary, result: ClassificationResult, filedTo: string, attachmentsSaved: number) {
    this.entries.push({
      emailId: email.id,
      subject: email.subject,
      from: email.from,
      outcome: result.needsReview ? "needs_review" : "filed",
      classification: result,
      filedTo,
      attachmentsSaved,
    });
  }

  recordClassificationFailure(email: EmailSummary, error: string) {
    this.entries.push({
      emailId: email.id,
      subject: email.subject,
      from: email.from,
      outcome: "classification_failed",
      classification: null,
      error,
    });
  }

  recordActionFailure(email: EmailSummary, result: ClassificationResult, error: string) {
    this.entries.push({
      emailId: email.id,
      subject: email.subject,
      from: email.from,
      outcome: "action_failed",
      classification: result,
      error,
    });
  }

  /** Prints a one-line-per-outcome summary table to the console. */
  printSummary() {
    const counts = {
      filed: this.entries.filter((e) => e.outcome === "filed").length,
      needsReview: this.entries.filter((e) => e.outcome === "needs_review").length,
      classificationFailed: this.entries.filter((e) => e.outcome === "classification_failed").length,
      actionFailed: this.entries.filter((e) => e.outcome === "action_failed").length,
    };

    console.log("\n=== Run summary ===");
    console.log(`Total processed:        ${this.entries.length}`);
    console.log(`Filed successfully:     ${counts.filed}`);
    console.log(`Flagged needs-review:   ${counts.needsReview}`);
    console.log(`Classification failed:  ${counts.classificationFailed}`);
    console.log(`Action failed:          ${counts.actionFailed}`);

    if (counts.needsReview > 0) {
      console.log(`\nNeeds-review items:`);
      for (const e of this.entries.filter((e) => e.outcome === "needs_review")) {
        console.log(`  - "${e.subject}" (confidence: ${e.classification?.confidence.toFixed(2)})`);
      }
    }
  }

  /** Writes the full run as a JSON file under logs/, gitignored. */
  async writeToDisk(mode: "mock" | "real") {
    await mkdir(LOG_DIR, { recursive: true });
    const filename = `run-${this.startedAt.toISOString().replace(/[:.]/g, "-")}.json`;
    const filePath = path.join(LOG_DIR, filename);

    await writeFile(
      filePath,
      JSON.stringify(
        {
          startedAt: this.startedAt.toISOString(),
          mode,
          totalProcessed: this.entries.length,
          entries: this.entries,
        },
        null,
        2
      )
    );

    return filePath;
  }
}