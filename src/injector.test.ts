import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoryStore } from "./store.js";
import { buildContextBlock } from "./injector.js";

describe("buildContextBlock", () => {
  let store: MemoryStore;
  let tmpDir: string;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-injector-test-"));
    store = new MemoryStore(join(tmpDir, "test.db"));
  });

  after(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty for empty store", () => {
    const { text, stats } = buildContextBlock(store);
    assert.equal(text, "");
    assert.equal(stats.semantic, 0);
    assert.equal(stats.lessons, 0);
  });

  it("includes preferences", () => {
    store.setSemantic("pref.editor", "vim", 0.9, "user");
    const { text, stats } = buildContextBlock(store);
    assert.ok(text.includes("User Preferences"));
    assert.ok(text.includes("editor: vim"));
    assert.ok(stats.semantic > 0);
  });

  it("includes lessons with DON'T prefix for negative", () => {
    store.addLesson("Use sed for daily notes", "vault", "user", true);
    const { text } = buildContextBlock(store);
    assert.ok(text.includes("Learned Corrections"));
    assert.ok(text.includes("DON'T:"));
  });

  it("wraps in <memory> tags", () => {
    const { text } = buildContextBlock(store);
    assert.ok(text.startsWith("<memory>"));
    assert.ok(text.endsWith("</memory>"));
  });

  it("scopes project context to cwd", () => {
    store.setSemantic("project.rosie.lang", "java", 0.9, "consolidation");
    store.setSemantic("project.other.lang", "python", 0.5, "consolidation");

    const { text } = buildContextBlock(store, "/workplace/samfp/Rosie");
    assert.ok(text.includes("rosie.lang"));
    // low-confidence non-matching project should be excluded
    assert.ok(!text.includes("other.lang"));
  });
});
