#!/usr/bin/env node
/**
 * fake-gemini-fixture.mjs
 * Simulates the `gemini` CLI for tests. Reads args and returns canned responses.
 */

const args = process.argv.slice(2);
const isJson = args.includes("-o") && args[args.indexOf("-o") + 1] === "json";
const promptIdx = args.indexOf("-p");
const prompt = promptIdx !== -1 ? args[promptIdx + 1] ?? "" : "";

const reviewOutput = {
  verdict: "approve",
  summary: "The change looks clean with no critical issues.",
  findings: [],
  next_steps: [],
  artifacts: [],
};

const taskOutput = "Task completed successfully.";

// Detect mode from prompt content
const isReview = prompt.includes("code review") || prompt.includes("review_method") || prompt.includes("structured_output_contract");

if (isJson) {
  if (isReview) {
    process.stdout.write(JSON.stringify({ response: JSON.stringify(reviewOutput) }) + "\n");
  } else {
    process.stdout.write(JSON.stringify({ response: taskOutput }) + "\n");
  }
} else {
  process.stdout.write(isReview ? JSON.stringify(reviewOutput) : taskOutput);
  process.stdout.write("\n");
}

process.exit(0);
