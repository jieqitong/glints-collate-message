# glints-collate-message
To collate formatted message from Glints front end projects for translation (i18n) uses.

## Install
npm i glints-collate-message

## Usage
$ glints-collate-message command rootDirectory -c configFile -r reserveFile -d dynamicFile -l logFolder

- command
  - reserve (generate a file with a list of dynamic FormattedMessage id's and their corresponding defaultMessage's in .i18n/dynamic.json)
  - collate

- optional
  - -d (default: .i18n/dynamic.json)
  - -l (default: .i18n)

## Example
- $ glints-collate-message reserve app -d dynamic.json -l .i18n
- $ glints-collate-message collate app -c config.json -r reserve.json -l .i18n

## After adding new FormattedMesssages, do this:

1. run `reserve`
2. refer to .i18n/dynamic.json
3. manually update my self-maintained reserve file
4. run `collate` command
5. if error, obey the commands spewed out by the tool. Otherwise, it'll update the s3 files
6. profit!
