// Loads code.js in a sandbox with a stubbed `figma` global so its pure
// functions (deltaE, analyze, buildGuidelines...) can be tested in Node.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadPlugin() {
  const figma = {
    mixed: Symbol("mixed"),
    showUI() {},
    on() {},
    currentPage: { selection: [] },
    ui: { postMessage() {} },
  };
  const sandbox = vm.createContext({ figma, __html__: "", Math, Set, Map });
  const file = path.join(__dirname, "..", "code.js");
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  return sandbox;
}

module.exports = loadPlugin;
