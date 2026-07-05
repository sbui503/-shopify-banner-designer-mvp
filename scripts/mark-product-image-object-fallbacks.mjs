console.error(JSON.stringify({
  ok: false,
  policy: "strict-true-source",
  message: "Object fallback promotion is disabled. Promote only matched source SVG rows."
}, null, 2));

process.exitCode = 1;
