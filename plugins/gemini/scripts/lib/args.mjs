const VALUE_FLAGS = new Set([
  "model", "depth", "effort", "base", "scope", "cwd", "prompt-file",
  "timeout-ms", "poll-interval-ms", "job-id", "thinking-budget", "image",
]);

// Flags that accumulate multiple values into an array when repeated.
const ARRAY_FLAGS = new Set(["image"]);

const BOOLEAN_FLAGS = new Set([
  "background", "wait", "json", "write", "resume", "resume-last",
  "fresh", "thinking", "all", "enable-review-gate", "disable-review-gate",
]);

export function parseArgs(argv) {
  const raw = typeof argv === "string" ? tokenize(argv) : [...argv];
  const flags = {};
  const positional = [];
  let i = 0;

  while (i < raw.length) {
    const token = raw[i];

    if (token === "--") {
      positional.push(...raw.slice(i + 1));
      break;
    }

    if (token.startsWith("--")) {
      const eqIdx = token.indexOf("=");
      if (eqIdx !== -1) {
        const key = token.slice(2, eqIdx);
        const rawVal = token.slice(eqIdx + 1);
        // Coerce "true"/"false" strings for boolean flags
        const val = BOOLEAN_FLAGS.has(key) && (rawVal === "true" || rawVal === "false")
          ? rawVal === "true"
          : rawVal;
        _setFlag(flags, key, val);
        i++;
      } else {
        const key = token.slice(2);
        if (BOOLEAN_FLAGS.has(key)) {
          flags[key] = true;
          i++;
        } else if (VALUE_FLAGS.has(key)) {
          const next = raw[i + 1];
          if (next !== undefined && !next.startsWith("--")) {
            _setFlag(flags, key, next);
            i += 2;
          } else {
            flags[key] = true;
            i++;
          }
        } else {
          // Unknown flag: try to consume next token as value if not a flag
          const next = raw[i + 1];
          if (next !== undefined && !next.startsWith("--")) {
            _setFlag(flags, key, next);
            i += 2;
          } else {
            flags[key] = true;
            i++;
          }
        }
      }
    } else {
      positional.push(token);
      i++;
    }
  }

  return { flags, positional };
}

function _setFlag(flags, key, value) {
  if (ARRAY_FLAGS.has(key)) {
    if (!Array.isArray(flags[key])) flags[key] = [];
    flags[key].push(value);
  } else {
    flags[key] = value;
  }
}

function tokenize(raw) {
  const tokens = [];
  let cur = "";
  let quote = null;
  for (const ch of raw.trim()) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === " " || ch === "\t") {
      if (cur) { tokens.push(cur); cur = ""; }
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}
