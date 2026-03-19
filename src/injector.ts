/**
 * Builds a context block from memory for injection into the system prompt.
 * Reads semantic entries, lessons, and formats them for the LLM.
 */
import type { MemoryStore, SemanticEntry } from "./store.js";

const MAX_CONTEXT_CHARS = 8000;

export interface ContextBlock {
  text: string;
  stats: { semantic: number; lessons: number };
}

export function buildContextBlock(store: MemoryStore, cwd?: string): ContextBlock {
  const sections: string[] = [];
  let semanticCount = 0;
  let lessonCount = 0;

  // ─── Preferences ───────────────────────────────────────────────
  const prefs = store.listSemantic("pref.", 50);
  if (prefs.length > 0) {
    sections.push(formatSection("User Preferences", prefs.map(formatSemantic)));
    semanticCount += prefs.length;
  }

  // ─── Project context (scoped to cwd if available) ──────────────
  const projects = store.listSemantic("project.", 50);
  const relevant = cwd
    ? projects.filter(p => p.key.includes(projectSlug(cwd)) || p.confidence >= 0.9)
    : projects;
  if (relevant.length > 0) {
    sections.push(formatSection("Project Context", relevant.map(formatSemantic)));
    semanticCount += relevant.length;
  }

  // ─── Tool preferences ─────────────────────────────────────────
  const tools = store.listSemantic("tool.", 20);
  if (tools.length > 0) {
    sections.push(formatSection("Tool Preferences", tools.map(formatSemantic)));
    semanticCount += tools.length;
  }

  // ─── Lessons (corrections) ────────────────────────────────────
  const lessons = store.listLessons(undefined, 50);
  if (lessons.length > 0) {
    const formatted = lessons.map(l =>
      `${l.negative ? "DON'T: " : ""}${l.rule}${l.category !== "general" ? ` [${l.category}]` : ""}`
    );
    sections.push(formatSection("Learned Corrections", formatted));
    lessonCount = lessons.length;
  }

  // ─── User identity ────────────────────────────────────────────
  const user = store.listSemantic("user.", 10);
  if (user.length > 0) {
    sections.push(formatSection("User", user.map(formatSemantic)));
    semanticCount += user.length;
  }

  if (sections.length === 0) {
    return { text: "", stats: { semantic: 0, lessons: 0 } };
  }

  let text = `<memory>\n${sections.join("\n")}\n</memory>`;

  // Truncate if too long
  if (text.length > MAX_CONTEXT_CHARS) {
    text = text.slice(0, MAX_CONTEXT_CHARS - 20) + "\n... (truncated)\n</memory>";
  }

  return { text, stats: { semantic: semanticCount, lessons: lessonCount } };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatSection(title: string, items: string[]): string {
  return `## ${title}\n${items.map(i => `- ${i}`).join("\n")}`;
}

function formatSemantic(entry: SemanticEntry): string {
  const key = entry.key.split(".").slice(1).join(".");
  return `${key}: ${entry.value}`;
}

function projectSlug(cwd: string): string {
  // Extract a project identifier from cwd
  // /workplace/samfp/Rosie/src/Foo → rosie
  // /local/home/samfp/scratch/pi-memory → pi-memory
  const parts = cwd.split("/").filter(Boolean);
  // Find the most meaningful segment
  const skip = new Set(["workplace", "local", "home", "src", "scratch"]);
  for (const p of parts.reverse()) {
    if (!skip.has(p.toLowerCase()) && p.length > 1) return p.toLowerCase();
  }
  return parts[parts.length - 1]?.toLowerCase() ?? "";
}
