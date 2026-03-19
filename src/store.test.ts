import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoryStore } from "./store.js";

describe("MemoryStore", () => {
  let store: MemoryStore;
  let tmpDir: string;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-test-"));
    store = new MemoryStore(join(tmpDir, "test.db"));
  });

  after(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("semantic", () => {
    it("set and get", () => {
      store.setSemantic("pref.editor", "vim", 0.9, "user");
      const entry = store.getSemantic("pref.editor");
      assert.ok(entry);
      assert.equal(entry.value, "vim");
      assert.equal(entry.confidence, 0.9);
      assert.equal(entry.source, "user");
    });

    it("higher confidence wins", () => {
      store.setSemantic("pref.theme", "dark", 0.9, "user");
      store.setSemantic("pref.theme", "light", 0.7, "consolidation");
      assert.equal(store.getSemantic("pref.theme")!.value, "dark");
    });

    it("same or higher confidence updates", () => {
      store.setSemantic("pref.lang", "typescript", 0.8, "consolidation");
      store.setSemantic("pref.lang", "rust", 0.9, "user");
      assert.equal(store.getSemantic("pref.lang")!.value, "rust");
    });

    it("list with prefix", () => {
      store.setSemantic("project.rosie.lang", "java", 0.9, "consolidation");
      store.setSemantic("project.rosie.di", "dagger", 0.9, "consolidation");
      const results = store.listSemantic("project.rosie.");
      assert.ok(results.length >= 2);
      assert.ok(results.some(r => r.key === "project.rosie.lang"));
    });

    it("search by keyword", () => {
      store.setSemantic("tool.sed", "use for daily note insertion", 0.9, "user");
      const results = store.searchSemantic("daily note");
      assert.ok(results.length > 0);
      assert.ok(results.some(r => r.key === "tool.sed"));
    });

    it("delete", () => {
      store.setSemantic("pref.temp", "value", 0.8, "user");
      assert.ok(store.getSemantic("pref.temp"));
      assert.ok(store.deleteSemantic("pref.temp"));
      assert.equal(store.getSemantic("pref.temp"), undefined);
    });

    it("delete nonexistent returns false", () => {
      assert.equal(store.deleteSemantic("pref.nonexistent"), false);
    });
  });

  describe("lessons", () => {
    it("add and list", () => {
      const result = store.addLesson("Use sed for daily notes, not echo >>", "vault", "user", true);
      assert.ok(result.success);
      assert.ok(result.id);

      const lessons = store.listLessons("vault");
      assert.ok(lessons.some(l => l.rule.includes("sed for daily")));
    });

    it("exact dedup", () => {
      store.addLesson("Always use conventional commits", "git");
      const result = store.addLesson("always use conventional commits", "git");
      assert.equal(result.success, false);
      assert.equal(result.reason, "duplicate");
    });

    it("jaccard dedup", () => {
      store.addLesson("Never hardcode secrets in source code", "security");
      const result = store.addLesson("Never hardcode secrets in the source code files", "security");
      assert.equal(result.success, false);
      assert.equal(result.reason, "similar");
    });

    it("soft delete", () => {
      const { id } = store.addLesson("Temporary lesson to delete", "test");
      assert.ok(id);
      assert.ok(store.deleteLesson(id!));
      assert.equal(store.getLesson(id!), undefined);
    });

    it("empty rule rejected", () => {
      const result = store.addLesson("", "test");
      assert.equal(result.success, false);
      assert.equal(result.reason, "empty rule");
    });

    it("negative flag preserved", () => {
      const { id } = store.addLesson("Do not use echo >> for vault notes", "vault", "user", true);
      const lesson = store.getLesson(id!);
      assert.ok(lesson);
      assert.equal(lesson.negative, true);
    });
  });

  describe("events", () => {
    it("logs operations", () => {
      const events = store.listEvents(100);
      assert.ok(events.length > 0);
      assert.ok(events.some(e => e.event_type === "create"));
    });
  });

  describe("stats", () => {
    it("returns counts", () => {
      const stats = store.stats();
      assert.ok(stats.semantic > 0);
      assert.ok(stats.lessons > 0);
      assert.ok(stats.events > 0);
    });
  });
});
