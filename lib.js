'use strict';

module.exports = function (rootDirectory, configFile) {

  const AWS = require('aws-sdk');
  const fs = require('fs');
  const encoding = 'utf8';
  const Promise = require('bluebird');

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

  // Filter only javascript files
  const jsFiles = files.filter(x => x.endsWith('.js'));

  // Get files' contents
  const contents = jsFiles.map(x => fs.readFileSync(x, encoding));

  // Get all formatted messages
  let raw = [];
  const regex = /<FormattedH?T?M?L?Message[\s\S]+?\/>/g;
  contents.forEach(x => {
    const matches = x.match(regex);
    if (matches) {
      raw = raw.concat(matches);
    }
  });

  // Remove white spaces from formatted messages
  raw = raw.map(x => x.split('\n').map(y => y.trim()).join(' '));

  // Filter and get static id and default messages
  const results = {};
  raw.forEach(x => {
    const i = x.startsWith('<FormattedMessage id="') ? 22 : (x.startsWith('<FormattedHTMLMessage id="') ? 26 : 0);
    if (i) {
      x = x.substr(i).split('" defaultMessage=');
      results[x[0]] = x[1].startsWith('"') ? x[1].substr(1, x[1].length - 5) : x[1].substr(2, x[1].length - 6);
    }
  });

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

      // Get list of files from s3 bucket
      return Promise.all(locales
        .map(x => s3.getObjectAsync({
          Bucket: config.bucket,
          Key: x
        })));
    })
    .then(data => {
      const ids = Object.keys(results);
      const files = data.map((x, i) => {
        const key = locales[i];
        const old = JSON.parse(x.Body.toString());
        const body = {};

        ids.forEach(id => {
          if (old[id]) {
            body[id] = old[id];
          } else {
            body[id] = key.endsWith('en.json')? results[id] : '';
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
};