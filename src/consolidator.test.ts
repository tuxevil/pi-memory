import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildConsolidationPrompt,
  parseConsolidationResponse,
} from "./consolidator.js";

describe("buildConsolidationPrompt", () => {
  it("includes conversation messages", () => {
    const prompt = buildConsolidationPrompt({
      userMessages: ["Fix the daily note insertion"],
      assistantMessages: ["I'll use sed instead of echo >>"],
      cwd: "/workplace/samfp/Rosie",
    });
    assert.ok(prompt.includes("Fix the daily note insertion"));
    assert.ok(prompt.includes("sed instead of echo"));
    assert.ok(prompt.includes("/workplace/samfp/Rosie"));
  });

  it("truncates long messages", () => {
    const longMsg = "x".repeat(2000);
    const prompt = buildConsolidationPrompt({
      userMessages: [longMsg],
      assistantMessages: [],
    });
    assert.ok(prompt.length < longMsg.length + 5000);
  });

  it("caps at 30 message pairs", () => {
    const prompt = buildConsolidationPrompt({
      userMessages: Array(50).fill("msg"),
      assistantMessages: Array(50).fill("reply"),
    });
    const userCount = (prompt.match(/User: msg/g) || []).length;
    assert.ok(userCount <= 30);
  });
});

describe("parseConsolidationResponse", () => {
  it("parses valid JSON", () => {
    const result = parseConsolidationResponse(JSON.stringify({
      semantic: [{ key: "pref.editor", value: "vim", confidence: 0.9 }],
      lessons: [{ rule: "Use sed for daily notes", category: "vault", negative: true }],
    }));
    assert.equal(result.semantic.length, 1);
    assert.equal(result.semantic[0].key, "pref.editor");
    assert.equal(result.lessons.length, 1);
    assert.equal(result.lessons[0].negative, true);
  });

  it("parses JSON in markdown code block", () => {
    const result = parseConsolidationResponse(`Here's what I found:
\`\`\`json
{
  "semantic": [{ "key": "pref.style", "value": "functional", "confidence": 0.85 }],
  "lessons": []
}
\`\`\`
`);
    assert.equal(result.semantic.length, 1);
    assert.equal(result.semantic[0].key, "pref.style");
  });

  it("rejects low confidence", () => {
    const result = parseConsolidationResponse(JSON.stringify({
      semantic: [{ key: "pref.maybe", value: "unsure", confidence: 0.5 }],
      lessons: [],
    }));
    assert.equal(result.semantic.length, 0);
  });

  it("rejects invalid key format", () => {
    const result = parseConsolidationResponse(JSON.stringify({
      semantic: [{ key: "INVALID KEY!", value: "bad", confidence: 0.9 }],
      lessons: [],
    }));
    assert.equal(result.semantic.length, 0);
  });

  it("rejects unknown key prefix", () => {
    const result = parseConsolidationResponse(JSON.stringify({
      semantic: [{ key: "secret.password", value: "hunter2", confidence: 0.99 }],
      lessons: [],
    }));
    assert.equal(result.semantic.length, 0);
  });

  it("returns empty for garbage input", () => {
    const result = parseConsolidationResponse("not json at all");
    assert.equal(result.semantic.length, 0);
    assert.equal(result.lessons.length, 0);
  });

  it("returns empty for empty response", () => {
    const result = parseConsolidationResponse("");
    assert.equal(result.semantic.length, 0);
    assert.equal(result.lessons.length, 0);
  });

  it("handles missing fields gracefully", () => {
    const result = parseConsolidationResponse(JSON.stringify({
      semantic: [{ key: "pref.x" }], // missing value and confidence
      lessons: [{}], // missing rule
    }));
    assert.equal(result.semantic.length, 0);
    assert.equal(result.lessons.length, 0);
  });
});
