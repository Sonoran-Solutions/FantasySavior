#!/usr/bin/env node
/* Fail if the checked-in browser payload is not exactly regenerated from the source JSON. */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const source = JSON.parse(fs.readFileSync(path.join(root, "data", "players.json"), "utf8"));
const expected =
  "/* Auto-generated from data/players.json by scripts/embed-data.js. Do not edit by hand. */\n" +
  "window.FANTASY_SAVIOR_DATA = " + JSON.stringify(source) + ";\n";
const actual = fs.readFileSync(path.join(root, "data", "players.data.js"), "utf8");

if (actual !== expected) {
  console.error("Embedded player data is stale. Run: node scripts/embed-data.js");
  process.exit(1);
}

console.log("Embedded player data matches data/players.json.");
