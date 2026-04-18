#!/usr/bin/env node

const path = require("path");

const commander = require("commander");
if (commander.Command && !commander.Command.prototype.enablePositionalOptions) {
  commander.Command.prototype.enablePositionalOptions = function enablePositionalOptions() {
    return this;
  };
}
if (commander.Command && !commander.Command.prototype.addHelpText) {
  commander.Command.prototype.addHelpText = function addHelpText() {
    return this;
  };
}

require(path.resolve(__dirname, "../../../../node_modules/@react-native-community/cli/build/bin.js"));
