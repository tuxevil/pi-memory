/**
 * Consolidator — extracts structured knowledge from session conversations.
 *
 * After a session ends (or on demand), reads the conversation and uses an
 * LLM to extract:
 * - Preferences (→ semantic memory, pref.*)
 * - Project patterns (→ semantic memory, project.*)
 * - Corrections/lessons (→ lessons table)
 * - Tool preferences (→ semantic memory, tool.*)
 *
 * Uses the pi SDK's createAgentSession for the LLM call, or falls back
 * to a simple extraction when no LLM is available.
 */
import type { MemoryStore } from "./store.js";

// ─── Types ───────────────────────────────────────────────────────────

export interface ConsolidationInput {
  /** User messages from the session */
  userMessages: string[];
  /** Assistant messages from the session */
  assistantMessages: string[];
  /** Working directory of the session */
  cwd?: string;
  /** Session ID for provenance */
  sessionId?: string;
}

export interface ExtractedMemory {
  semantic: Array<{ key: string; value: string; confidence: number }>;
  lessons: Array<{ rule: string; category: string; negative: boolean }>;
}

export const CONSOLIDATION_PROMPT = `You are a memory extraction system. Analyze this conversation and extract structured knowledge.

Extract ONLY concrete, reusable facts — not summaries of what happened. Focus on:

1. **User preferences** (key prefix: pref.) — coding style, tool preferences, workflow habits
   Example: { "key": "pref.commit_style", "value": "conventional commits", "confidence": 0.9 }

2. **Project patterns** (key prefix: project.<name>.) — languages, frameworks, architecture decisions
   Example: { "key": "project.rosie.di", "value": "Dagger dependency injection", "confidence": 0.95 }

3. **Tool preferences** (key prefix: tool.) — which tools to prefer/avoid, how to use them
   Example: { "key": "tool.sed", "value": "use for daily note insertion, not echo >>", "confidence": 0.9 }

4. **Corrections/lessons** — things the user corrected, mistakes to avoid
   Example: { "rule": "Use sed to insert after ## Notes heading, not echo >> which appends after Tags", "category": "vault", "negative": true }

Rules:
- Only extract if confidence >= 0.8 (you're reasonably sure this is a lasting preference, not a one-off)
- Key format: lowercase, dots as separators, no spaces
- Keep values concise (under 200 chars)
- For corrections, set negative=true if it's something to AVOID

Respond with ONLY valid JSON matching this schema:
{
  "semantic": [{ "key": "string", "value": "string", "confidence": number }],
  "lessons": [{ "rule": "string", "category": "string", "negative": boolean }]
}

If nothing worth extracting, return: { "semantic": [], "lessons": [] }`;

// ─── Consolidation ───────────────────────────────────────────────────

/**
 * Build the consolidation prompt for an LLM call.
 */
export function buildConsolidationPrompt(input: ConsolidationInput): string {
  const messages: string[] = [];

  // Interleave user/assistant messages for context
  const maxPairs = 30; // cap to avoid huge prompts
  const len = Math.min(input.userMessages.length, maxPairs);
  for (let i = 0; i < len; i++) {
    const userMsg = input.userMessages[i];
    if (userMsg) messages.push(`User: ${truncate(userMsg, 1000)}`);
    const assistantMsg = input.assistantMessages[i];
    if (assistantMsg) messages.push(`Assistant: ${truncate(assistantMsg, 500)}`);
  }

  return `${CONSOLIDATION_PROMPT}

${input.cwd ? `Working directory: ${input.cwd}\n` : ""}
## Conversation

${messages.join("\n\n")}`;
}

/**
 * Parse the LLM's JSON response into structured memory.
 */
export function parseConsolidationResponse(text: string): ExtractedMemory {
  // Extract JSON from response (may be wrapped in markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) return { semantic: [], lessons: [] };

  try {
    const parsed = JSON.parse(jsonMatch[1].trim());
    const result: ExtractedMemory = { semantic: [], lessons: [] };

    if (Array.isArray(parsed.semantic)) {
      for (const s of parsed.semantic) {
        if (typeof s.key === "string" && typeof s.value === "string" && typeof s.confidence === "number") {
          if (s.confidence >= 0.8 && isValidKey(s.key) && s.value.length <= 500) {
            result.semantic.push({ key: s.key, value: s.value, confidence: s.confidence });
          }
        }
      }
    }

    if (Array.isArray(parsed.lessons)) {
      for (const l of parsed.lessons) {
        if (typeof l.rule === "string" && l.rule.trim().length > 0) {
          result.lessons.push({
            rule: l.rule.trim(),
            category: typeof l.category === "string" ? l.category : "general",
            negative: !!l.negative,
          });
        }
      }
    }

    return result;
  } catch {
    return { semantic: [], lessons: [] };
  }
}

/**
 * Apply extracted memory to the store.
 */
export function applyExtracted(store: MemoryStore, extracted: ExtractedMemory, source: string = "consolidation"): { semantic: number; lessons: number } {
  let semanticCount = 0;
  let lessonCount = 0;

  for (const s of extracted.semantic) {
    store.setSemantic(s.key, s.value, s.confidence, "consolidation");
    semanticCount++;
  }

  for (const l of extracted.lessons) {
    const result = store.addLesson(l.rule, l.category, source, l.negative);
    if (result.success) lessonCount++;
  }

  return { semantic: semanticCount, lessons: lessonCount };
}

// ─── Helpers ─────────────────────────────────────────────────────────

const VALID_KEY_RE = /^(pref|project|user|tool|lesson)\.[a-z0-9._-]+$/;

function isValidKey(key: string): boolean {
  return VALID_KEY_RE.test(key) && key.length <= 100;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}
