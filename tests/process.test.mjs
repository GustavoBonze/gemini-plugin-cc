import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runCommand, runCommandChecked, binaryAvailable } from "../plugins/gemini/scripts/lib/process.mjs";

describe("runCommand", () => {
  it("runs a basic command", () => {
    const result = runCommand("node", ["--version"]);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.startsWith("v"));
  });

  it("captures stderr", () => {
    const result = runCommand("node", ["-e", "process.stderr.write('err')"]);
    assert.ok(result.stderr.includes("err"));
  });

  it("returns non-zero status for failing command", () => {
    const result = runCommand("node", ["-e", "process.exit(42)"]);
    assert.equal(result.status, 42);
  });
});

describe("runCommandChecked", () => {
  it("returns result on success", () => {
    const result = runCommandChecked("node", ["--version"]);
    assert.equal(result.status, 0);
  });

  it("throws on non-zero exit", () => {
    assert.throws(() => runCommandChecked("node", ["-e", "process.exit(1)"]));
  });
});

describe("binaryAvailable", () => {
  it("detects node as available", () => {
    const result = binaryAvailable("node");
    assert.equal(result.available, true);
  });

  it("detects nonexistent binary as unavailable", () => {
    const result = binaryAvailable("this-binary-does-not-exist-xyz");
    assert.equal(result.available, false);
  });
});
