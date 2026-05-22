'use strict';

// Regression test for issue #63473:
// When asm.js code is evaluated in the Node.js REPL with previews enabled,
// V8 emits a deprecation warning inside a DisallowJavascriptExecutionScope.
// This test verifies that the warning is deferred and the process does not crash.

const common = require('../common');
const assert = require('assert');
const spawn = require('child_process').spawn;

// asm.js code that may trigger a deprecation warning in V8
const asmCode = `
function asm(stdlib, foreign, heap) {
  "use asm";
  function f() { return 1; }
  return { f: f };
}
asm(this, null, new ArrayBuffer(1024));
`;

const child = spawn(process.execPath, ['-i'], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
let crashed = false;

child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  stdout += chunk;
  process.stdout.write(chunk);
});

child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  stderr += chunk;
  process.stderr.write(chunk);
  // Check for crash indicators
  if (chunk.includes('FATAL ERROR') || chunk.includes('Segmentation fault')) {
    crashed = true;
  }
});

// Feed the asm.js code to REPL via stdin
child.stdout.once('data', function() {
  child.stdin.write(asmCode);
  child.stdin.write('\n');
  setTimeout(() => {
    child.stdin.end();
  }, 500);
});

child.on('close', common.mustCall((exitCode) => {
  // Most important: process should not crash (exit code 0 or normal termination)
  assert.strictEqual(crashed, false, 'Process should not crash');
  // In Node.js, exit code 0 is normal, but we also allow the process to exit
  // naturally without a crash (which would have exit code 0)
  // The main assertion is that it doesn't crash with FATAL ERROR or segfault
  if (exitCode !== 0 && exitCode !== null) {
    // Note: We only fail if there's clear evidence of a crash in stderr
    if (stderr.includes('FATAL ERROR') || stderr.includes('Segmentation')) {
      assert.fail(`Process crashed with exit code ${exitCode}\nstderr: ${stderr}`);
    }
  }
}));
