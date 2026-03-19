/**
 * Builds a context block from memory for injection into the system prompt.
 *
 * Two modes:
 * - Selective (prompt provided): search semantic memory for entries relevant
 *   to the user's current prompt, plus always-inject lessons.
 * - Fallback (no prompt): dump top entries by prefix (old behavior).
 */
import type { MemoryStore, SemanticEntry } from "./store.js";

const MAX_CONTEXT_CHARS = 8000;
const SEARCH_LIMIT = 15;

export interface ContextBlock {
  text: string;
  stats: { semantic: number; lessons: number };
}

/**
 * Build context block. When `prompt` is provided, uses selective injection
 * (search-based). Otherwise falls back to prefix-based dump.
 */
export function buildContextBlock(store: MemoryStore, cwd?: string, prompt?: string): ContextBlock {
  if (prompt?.trim()) {
    return buildSelectiveBlock(store, prompt, cwd);
  }
  return buildFallbackBlock(store, cwd);
}

// ─── Selective injection ─────────────────────────────────────────────

function buildSelectiveBlock(store: MemoryStore, prompt: string, cwd?: string): ContextBlock {
  const sections: string[] = [];
  let semanticCount = 0;
  let lessonCount = 0;

  // Search semantic memory using the user's prompt
  const results = store.searchSemantic(prompt, SEARCH_LIMIT);

  // Also search with project slug if we have a cwd, to pull in project context
  const slug = cwd ? projectSlug(cwd) : "";
  if (slug) {
    const projectResults = store.searchSemantic(slug, 5);
    // Merge, dedup by key
    const seen = new Set(results.map(r => r.key));
    for (const r of projectResults) {
      if (!seen.has(r.key)) {
        results.push(r);
        seen.add(r.key);
      }
    }
  }

  if (results.length > 0) {
    sections.push(formatSection("Relevant Memory", results.map(formatSemantic)));
    semanticCount = results.length;
  }

  // Lessons are always injected — they're corrections that apply universally
  const lessons = store.listLessons(undefined, 50);
  if (lessons.length > 0) {
    const formatted = lessons.map(l =>
      `${l.negative ? "DON'T: " : ""}${l.rule}${l.category !== "general" ? ` [${l.category}]` : ""}`
    );
    sections.push(formatSection("Learned Corrections", formatted));
    lessonCount = lessons.length;
  }

  if (sections.length === 0) {
    return { text: "", stats: { semantic: 0, lessons: 0 } };
  }

  let text = `<memory>\n${sections.join("\n")}\n</memory>`;

  if (text.length > MAX_CONTEXT_CHARS) {
    text = text.slice(0, MAX_CONTEXT_CHARS - 20) + "\n... (truncated)\n</memory>";
  }

  return { text, stats: { semantic: semanticCount, lessons: lessonCount } };
}

// ─── Fallback (no prompt) ────────────────────────────────────────────

function buildFallbackBlock(store: MemoryStore, cwd?: string): ContextBlock {
  const sections: string[] = [];
  let semanticCount = 0;
  let lessonCount = 0;

  const prefs = store.listSemantic("pref.", 50);
  if (prefs.length > 0) {
    sections.push(formatSection("User Preferences", prefs.map(formatSemantic)));
    semanticCount += prefs.length;
  }

  const projects = store.listSemantic("project.", 50);
  const relevant = cwd
    ? projects.filter(p => p.key.includes(projectSlug(cwd)) || p.confidence >= 0.9)
    : projects;
  if (relevant.length > 0) {
    sections.push(formatSection("Project Context", relevant.map(formatSemantic)));
    semanticCount += relevant.length;
  }

  const tools = store.listSemantic("tool.", 20);
  if (tools.length > 0) {
    sections.push(formatSection("Tool Preferences", tools.map(formatSemantic)));
    semanticCount += tools.length;
  }

  const lessons = store.listLessons(undefined, 50);
  if (lessons.length > 0) {
    const formatted = lessons.map(l =>
      `${l.negative ? "DON'T: " : ""}${l.rule}${l.category !== "general" ? ` [${l.category}]` : ""}`
    );
    sections.push(formatSection("Learned Corrections", formatted));
    lessonCount = lessons.length;
  }

  const user = store.listSemantic("user.", 10);
  if (user.length > 0) {
    sections.push(formatSection("User", user.map(formatSemantic)));
    semanticCount += user.length;
  }

  if (sections.length === 0) {
    return { text: "", stats: { semantic: 0, lessons: 0 } };
  }

  let text = `<memory>\n${sections.join("\n")}\n</memory>`;

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
  const parts = cwd.split("/").filter(Boolean);
  const skip = new Set(["workplace", "local", "home", "src", "scratch"]);
  for (const p of parts.reverse()) {
    if (!skip.has(p.toLowerCase()) && p.length > 1) return p.toLowerCase();
  }
  return parts[parts.length - 1]?.toLowerCase() ?? "";
}
