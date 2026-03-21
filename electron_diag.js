"use strict";
console.log("--- INIT DIAG ---");
console.log("process.type:", process.type);
console.log("process.argv:", process.argv);
console.log("process.env.ELECTRON_ENTRY:", process.env.ELECTRON_ENTRY);
console.log("process.env.NODE_ENV:", process.env.NODE_ENV);
// Check if Module._resolveFilename has been patched
const Module = require('module');
const orig = Module._resolveFilename.toString().substring(0, 100);
console.log("_resolveFilename starts with:", orig);
// Check process._linked bindings
try {
  const common = process._linkedBinding('electron_common_features');
  console.log("electron_common_features:", Object.keys(common).slice(0, 5));
} catch(e) {
  console.log("electron_common_features binding error:", e.message);
}
// Check if the electron module cache key exists
const cache = require.cache;
const electronKeys = Object.keys(cache).filter(k => k.includes('electron'));
console.log("electron in require.cache:", electronKeys.slice(0, 3));
