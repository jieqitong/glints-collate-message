# glints-collate-message
To collate formatted message from Glints front end projects for translation (i18n) uses.

## Install
npm i glints-collate-message

## Usage
$ glints-collate-message command rootDirectory -c configFile -r reserveFile -d dynamicFile -l logFolder

- command
  - reserve
  - collate

- optional
  - -d (default: .i18n/dynamic.json)
  - -l (default: .i18n)

## Example
- $ glints-collate-message reserve app -d dynamic.json -l .i18n
- $ glints-collate-message collate app -c config.json -r reserve.json -l .i18n