# glints-collate-message
To collate formatted message from Glints front end projects for translation (i18n) uses.

## Install
npm i glints-collate-message

## Usage
$ glints-collate-message command rootDirectory -c configFile -r reserveFile

- command
  - reserve
  - collate

## Example
- $ glints-collate-message reserve app
- $ glints-collate-message collate app -c config.json -r reserve.json