#! /usr/bin/env node
'use strict';

const program = require('commander');
program
  .arguments('<rootDirectory> <configFile>')
  .action((rootDirectory, configFile) => {
    const lib = require('./lib');
    lib(rootDirectory, configFile);
  })
  .parse(process.argv);