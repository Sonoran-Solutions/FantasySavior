#!/usr/bin/env node
/* Regenerate data/players.data.js from data/players.json.
 *
 * players.json is the human-editable source of truth. This script embeds it as
 * a browser global so the app has zero runtime network dependency (works from
 * file:// and fully offline once loaded).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "data", "players.json");
const out = path.join(root, "data", "players.data.js");

const data = JSON.parse(fs.readFileSync(src, "utf8"));
const header =
  "/* Auto-generated from data/players.json by scripts/embed-data.js. Do not edit by hand. */\n";
const body = "window.FANTASY_SAVIOR_DATA = " + JSON.stringify(data) + ";\n";

fs.writeFileSync(out, header + body);
console.log("Wrote " + path.relative(root, out) + " (" + body.length + " bytes)");
