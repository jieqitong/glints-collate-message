'use strict';
const AWS = require('aws-sdk');
const fs = require('fs');
const Promise = require('bluebird');
const encoding = 'utf8';

// Default values
let DynamicFile = '.i18n/dynamic.json';
let LogFolder = '.i18n';

function getFiles (rootDirectory) {
  // Scan through entire folder and get all file names
  const directories = [rootDirectory];
  const files = [];

  while (directories.length) {
    const dir = directories.shift();
    const res = fs.readdirSync(dir).map(x => dir + '/' + x);

    res.forEach(x => {
      const stat = fs.statSync(x);
      if (stat.isFile()) {
        files.push(x);
      } else if (stat.isDirectory()) {
        directories.push(x);
      }
    });
  }

  // Filter files based on fileType
  const fileType = '.js';
  const jsFiles = files.filter(x => x.endsWith(fileType));
  console.log(jsFiles.length + ' ' + fileType + ' files found.');

  // Get files' contents
  return jsFiles.map(x => fs.readFileSync(x, encoding));
}

function getMessages (contents) {
  const regex = /<FormattedH?T?M?L?Message[^<>]+?(?:<[^<>]+>[^<>]+)*(?:=>[^<>]+)*(?:<[^<>]+>[^<>]+)*>/g;
  const idRegex = /id="[^"]+"|id={[^{}]+}|id={`[\s\S]+?`}/g;
  const defaultMessageRegex = /defaultMessage="[^"]+"|defaultMessage={[^{}]+}|defaultMessage={`[\s\S]+?`}/g;

  // Get all formatted messages
  let messages = [], values = [];
  contents.forEach(x => {
    const matches = x.match(regex);
    if (matches) {
      messages = messages.concat(matches);
    }
  });

  // Remove white spaces, outer layer and values from formatted messages
  messages = messages
    .map(x => {
      const y = x.split('\n').map(y => y.trim()).join(' ').split('\' + \'').join('');
      const i = y.startsWith('<FormattedMessage') ? 17 : (x.startsWith('<FormattedHTMLMessage') ? 21 : 0);
      const j = y.endsWith('/>') ? y.length-2 : y.length-1;
      const z = y.substring(i,j).split('values={');
      if (z[1]) values.push(z[1]);
      return z[0].trim();
    });

  // Get formatted messages from values
  values.forEach(x => {
    const msg = x.match(regex);
    if (msg) {
      msg.forEach(y => {
        const i = y.startsWith('<FormattedMessage') ? 17 : (x.startsWith('<FormattedHTMLMessage') ? 21 : 0);
        const j = y.endsWith('/>') ? y.length-2 : y.length-1;
        messages.push(y.substring(i,j).trim());
      });
    }
  });

  console.log(messages.length + ' formatted messages found.');

  // Get id and defaultMessage from formatted messages
  const messageJSON = {}, check = {};
  messages.forEach(x => {
    let id = x.match(idRegex)[0];
    let msg = x.match(defaultMessageRegex)[0];
    let type = 'static';

    if (id.startsWith('id="')) {
      id = id.substring(4,id.length-1);
    } else if (id.startsWith('id={`')) {
      id = id.substring(5,id.length-2);
      type = 'dynamic';
    } else if (id.startsWith('id={')) {
      id = id.substring(4,id.length-1);
      type = 'dynamic';
    }

    if (msg.startsWith('defaultMessage="')) {
      msg = msg.substring(16,msg.length-1);
    } else if (msg.startsWith('defaultMessage={`')) {
      msg = msg.substring(17,msg.length-2);
    } else if (msg.startsWith('defaultMessage={')) {
      msg = msg.substring(16,msg.length-1);
    }

    messageJSON[id] = {
      id: id,
      defMsg: msg,
      type: type
    };

    if (check[id]) {
      if (check[id].indexOf(msg) === -1) {
        check[id].push(msg);
      }
    }
    else {
      check[id] = [msg];
    }
  });

  // If there are repeated id with different messages, throw error
  const repeat = Object.keys(check).map(x => ({id: x, msgs: check[x]})).filter(x => x.msgs.length > 1);
  if (repeat.length) {
    fs.writeFileSync(LogFolder + '/repeated.json', JSON.stringify(repeat, null, 2));
    throw 'There are repeated id with different default messages! Refer ' + LogFolder + '/repeated.json for more information.';
  }

  console.log(Object.keys(messageJSON).length + ' id found.');
  return messageJSON;
}

function reserve (rootDirectory) {
  const messages = getMessages(getFiles(rootDirectory));
  const dynamic = {};
  Object.keys(messages).forEach(x => {
    if (messages[x].type === 'dynamic') {
      dynamic[messages[x].id] = messages[x].defMsg;
    }
  });

  fs.writeFileSync(DynamicFile, JSON.stringify(dynamic, null, 2));
  console.log(DynamicFile + ' is created.');
}

function collate (rootDirectory, configFile, reserveFile) {
  // Filter and get static id and default messages
  const messages = getMessages(getFiles(rootDirectory));
  const results = {};
  Object.keys(messages).forEach(x => {
    if (messages[x].type === 'static') {
      results[messages[x].id] = messages[x].defMsg;
    }
  });

  console.log(Object.keys(results).length + ' static id found.');

  // Get reserve list
  const reserve = {};
  JSON.parse(fs.readFileSync(reserveFile, encoding)).forEach(x => {
    Object.keys(x.translationPairs).forEach(y => {
      if (reserve[y]) {
        console.log(y);
        throw 'The above is the repeated id in the given reserve file!'
      } else {
        reserve[y] = x.translationPairs[y];
      }
    });
  });

  // If there are repeated id between reserve and static, throw error
  const reserveIds = Object.keys(reserve);
  const repeat = reserveIds
    .map(x => ({
      id: x,
      reserveMsg: reserve[x],
      staticMsg: results[x]
    }))
    .filter(x => x.staticMsg);
  if (repeat.length) {
    fs.writeFileSync(LogFolder + '/repeatedReserveStatic.json', JSON.stringify(repeat, null, 2));
    throw 'There are repeated id between reserve and static! Refer ' + LogFolder + '/repeatedReserveStatic.json for more information.';
  }

  // AWS configurations
  const config = JSON.parse(fs.readFileSync(configFile, encoding));
  AWS.config.region = config.region;
  AWS.config.accessKeyId = config.accessKeyId;
  AWS.config.secretAccessKey = config.secretAccessKey;

  // Get list of locales from s3 bucket
  let locales;
  const s3 = new Promise.promisifyAll(new AWS.S3());
  s3.listObjectsV2Async({
    Bucket: config.bucket,
    Delimiter: '/',
    Prefix: config.folder + '/'
  })
    .then(data => {
      locales = data.Contents.filter(x => x.Key.endsWith('.json')).map(x => x.Key);
      console.log('locales: ' + locales);

      // Get list of files from s3 bucket
      return Promise.all(locales
        .map(x => s3.getObjectAsync({
          Bucket: config.bucket,
          Key: x
        })));
    })
    .then(data => {
      // Generate latest json object for each locale
      const ids = Object.keys(results);
      const files = data.map((x, i) => {
        const key = locales[i];
        const en = key.endsWith('en.json');
        const old = JSON.parse(x.Body.toString());
        const body = {};

        ids.forEach(id => {
          if (old[id]) {
            body[id] = old[id];
          } else {
            body[id] = en ? results[id] : '';
          }
        });

        reserveIds.forEach(id => {
          if (old[id]) {
            body[id] = old[id];
          } else {
            body[id] = en ? reserve[id] : '';
          }
        });

        return {
          key: key,
          body: JSON.stringify(body)
        };
      });

      // Upload list of files to s3 bucket
      return Promise.all(files
        .map((x,i) => s3.putObjectAsync({
          ACL: config.acl,
          Bucket: config.bucket,
          Key: x.key,
          Body: x.body,
          ContentType: 'application/json'
        })));
    })
    .then(() => console.log('s3 files are updated!'))
}

function error () {
  console.log('Your input is wrong!');
  console.log('Here\' the proper format: glints-collate-message command rootDirectory -c configFile -r reserveFile');
  console.log('command: reserve/collate');
  console.log('Example: ');
  console.log('$ glints-collate-message reserve app');
  console.log('$ glints-collate-message collate app -c config.json -r reserve.json');
}

module.exports = function (command, rootDirectory, configFile, reserveFile, dynamicFile, logFolder) {
  if (dynamicFile) DynamicFile = dynamicFile;
  if (logFolder) LogFolder = logFolder;

  switch (command) {
    case 'reserve':
      reserve(rootDirectory);
      break;
    case 'collate':
      if (!configFile || !reserveFile) error();
      else collate(rootDirectory, configFile, reserveFile);
      break;
    default:
      error();
      break;
  }
};