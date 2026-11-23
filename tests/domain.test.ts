import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  tomorrow,
  overdue,
  csvCell,
  safeUrl,
  type Task,
} from "../src/lib/domain";
test("only a manager can approve submitted work", () => {
  assert.equal(canTransition("member", "waiting_review", "approved"), false);
  assert.equal(canTransition("manager", "in_progress", "approved"), false);
  assert.equal(canTransition("manager", "waiting_review", "approved"), true);
  assert.equal(canTransition("manager", "approved", "todo"), false);
  assert.equal(canTransition("member", "waiting_review", "todo"), false);
});
test("revision resubmission is allowed", () =>
  assert.equal(
    canTransition("member", "changes_requested", "waiting_review"),
    true,
  ));
test("Tomorrow uses Cairo day boundaries and year rollover", () => {
  assert.equal(tomorrow(new Date("2026-12-31T22:30:00Z")), "2027-01-02");
  assert.equal(tomorrow(new Date("2026-11-23T10:00:00Z")), "2026-11-24");
});
test("pending review remains overdue until approved", () => {
  const task = { due_date: "2026-11-20", status: "waiting_review" } as Task;
  assert.equal(overdue(task, "2026-11-23"), true);
  assert.equal(overdue({ ...task, status: "approved" }, "2026-11-23"), false);
});
test("CSV formula injection and unsafe historical links blocked", () => {
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("https://example.com/file"), "https://example.com/file");
});
