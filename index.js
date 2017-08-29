#! /usr/bin/env node
'use strict';

const program = require('commander');
program
  .arguments('<command> <rootDirectory>')
  .option('-c, --config <file>', 'A config file')
  .option('-r, --reserve <file>', 'A reserve file')
  .action((command, rootDirectory) => {
    const lib = require('./lib');
    lib(command, rootDirectory, program.config, program.reserve);
  })
  .parse(process.argv);