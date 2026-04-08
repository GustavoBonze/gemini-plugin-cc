import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../plugins/gemini/scripts/lib/args.mjs";

describe("parseArgs", () => {
  it("parses boolean flags", () => {
    const { flags } = parseArgs(["--background", "--wait"]);
    assert.equal(flags.background, true);
    assert.equal(flags.wait, true);
  });

  it("parses value flags", () => {
    const { flags } = parseArgs(["--model", "pro", "--depth", "high", "--base", "main"]);
    assert.equal(flags.model, "pro");
    assert.equal(flags.depth, "high");
    assert.equal(flags.base, "main");
  });

  it("parses inline value with =", () => {
    const { flags } = parseArgs(["--model=flash"]);
    assert.equal(flags.model, "flash");
  });

  it("collects positional arguments", () => {
    const { positional } = parseArgs(["fix", "the", "bug"]);
    assert.deepEqual(positional, ["fix", "the", "bug"]);
  });

  it("stops at --", () => {
    const { flags, positional } = parseArgs(["--background", "--", "--not-a-flag"]);
    assert.equal(flags.background, true);
    assert.deepEqual(positional, ["--not-a-flag"]);
  });

  it("parses string input", () => {
    const { flags, positional } = parseArgs("--model pro investigate the bug");
    assert.equal(flags.model, "pro");
    assert.deepEqual(positional, ["investigate", "the", "bug"]);
  });

  it("handles --json flag", () => {
    const { flags } = parseArgs(["--json"]);
    assert.equal(flags.json, true);
  });

  it("parses --effort value flag", () => {
    const { flags } = parseArgs(["--effort", "low"]);
    assert.equal(flags.effort, "low");
  });

  it("parses --effort xhigh", () => {
    const { flags } = parseArgs(["--effort", "xhigh"]);
    assert.equal(flags.effort, "xhigh");
  });

  it("parses --thinking-budget as value flag", () => {
    const { flags } = parseArgs(["--thinking-budget", "1024"]);
    assert.equal(flags["thinking-budget"], "1024");
  });

  it("parses --thinking alongside --thinking-budget", () => {
    const { flags } = parseArgs(["--thinking", "--thinking-budget", "512"]);
    assert.equal(flags.thinking, true);
    assert.equal(flags["thinking-budget"], "512");
  });

  it("parses single --image as array", () => {
    const { flags } = parseArgs(["--image", "screenshot.png"]);
    assert.deepEqual(flags.image, ["screenshot.png"]);
  });

  it("parses multiple --image flags into array", () => {
    const { flags } = parseArgs(["--image", "a.png", "--image", "b.jpg"]);
    assert.deepEqual(flags.image, ["a.png", "b.jpg"]);
  });
});
