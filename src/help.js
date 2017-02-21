export default function help (output, client, { helpMode: mode, helpAction: action }) {
  if (!mode && action) return output.print(messages.default)

  let msg = messages
  if (mode) msg = msg[mode]
  if (action) msg = msg[action]
  if (typeof msg === 'object') msg = msg.default

  output.print(msg.slice(1))
}

const register = `
Command: register`

const assemblies = `
Command: assemblies
Subcommands:
  create
  delete
  replay
  list
  get`

const templates = `
Command: templates
Subcommands:
  create
  delete
  modify
  list
  get
  sync`

const bills = `
Command: bills
Subcommands:
  get`

const notifications = `
Command: assembly-notifications
Subcommands:
  replay
  list`

const main = `
Transloadit client.

Usage:
  transloadify [Options...] Command
  transloadify --help
  transloadify --version

Options:
  -v --verbose  Enable debug output
  -q --quiet    Disable warnings
  -j --json     Output in JSON format; offers more detailed results

These are the supported commands.
Refer to transloadify COMMAND [SUBCOMMAND] --help for specific usage.
${register}
${assemblies}
${templates}
${notifications}
${bills}`

const assembliesCreate = `
Create assemblies to process media.

Usage: transloadify [assemblies create] (--steps FILE | --template ID)
  [--input FILE]... [--output FILE] [--field KEY=VAL]... [--watch] [--recursive]
  [--delete-after-processing]

Options:
  -s --steps      Specify assembly instructions with a JSON file
  -t --template   Specify a template to use for these assemblies
  -i --input      Provide an input file or a directory
  -o --output     Specify an output file or directory
  -f --field      Set a template field
  -w --watch      Watch inputs for changes
  -r --recursive  Enumerate input directories recursively
  -d --delete-after-processing  Delete input files after they are processed`

const assembliesList = `
List assemblies matching given criteria.

Usage: transloadify assemblies list [--before DATE] [--after DATE]
  [--keywords LIST] [--fields list]

Options:
  -b --before  Return only assemblies created before specified date
  -a --after   Return only assemblies created after specified date
  --kewords    Specify a comma-separated list of keywords to match assemblies
  --fields     Specify a list of fields to return for each assembly`

const assembliesGet = `
Fetch assembly statuses.

Usage: transloadify assemblies get ID...`

const assembliesDelete = `
Cancel assemblies.

Usage: transloadify assemblies delete ID...`

const assembliesReplay = `
Replay assemblies.

Usage: transloadify assemblies replay [--field KEY=VAL]... [--steps FILE]
  [--notify-url URL] [--reparse-template]

Options:
  -f --field          Set a template field
  -s --steps          Override assembly instructions
  --notify-url        Specify a new url for assembly notifications
  --reparse-template  Use the most up-to-date version of the template`

const templatesCreate = `
Create a new template.

Usage: transloadify templates create NAME [FILE]

If FILE is not specified, default to STDIN.`

const templatesGet = `
Retrieve the template content as JSON.

Usage: transloadify templates get ID...`

const templatesModify = `
Change the JSON content of a template.

Usage: transloadify templates modify [--name NAME] ID [FILE]

If FILE is not specified, default to STDIN.

Options:
  -n --name  A new name for the template`

const templatesDelete = `
Delete templates.

Usage: transloadify templates delete ID...`

const templatesList = `
List templates matching given criteria.

Usage: transloadify templates list [--after DATE] [--before DATE]
  [--sort FIELD] [--order asc|desc] [--fields LIST]

Options:
  -a --after   Return only templates created after specified date
  -b --before  Return only templates created before specified date
  --sort       Field to sort by (id, name, created, or modified)
  --order      Sort ascending or descending (default: descending)
  --fields     A list of fields to return for each templates`

const templatesSync = `
Synchronize local template files with the transloadify API.

Usage: transloadify templates sync [--recursive] FILE...

Template files must be named *.json and have the key "transloadit_template_id"
and optionally "steps". If "transloadit_template_id" is an empty string, then
a new template will be created using the instructions in "steps". If "steps" is
missing then it will be filled in by the instructions of the template specified
by "transloadit_template_id". If both keys are present then the local template
file and the remote template will be synchronized to whichever was more recently
modified.

Options:
  -r --recursive  Look for template files in directories recursively`

const notificationsReplay = `
Replay notifications for assemblies.

Usage: transloadify assembly-notifications replay [--notify-url URL] ASSEMBLY...

Options:
  --notify-url  Specify a new url to send the notifications to`

const notificationsList = `
List notifications matching given criteria.

Usage: transloadify assembly-notifications list [--failed | --successful]
  [ASSEMBLY]

If ASSEMBLY is specified, return only notifications sent for that assembly.

Options:
  --failed      Return only failed notifications
  --successful  Return only successful notifications`

const billsGet = `
Fetch billing information.

Usage: transloadify bills get MONTH...

Months should be specified in YYYY-MM format.`

const messages = {
  default: main,
  register: register,
  assemblies: {
    default: assemblies,
    create: assembliesCreate,
    list: assembliesList,
    get: assembliesGet,
    delete: assembliesDelete,
    replay: assembliesReplay
  },
  templates: {
    default: templates,
    create: templatesCreate,
    get: templatesGet,
    modify: templatesModify,
    delete: templatesDelete,
    list: templatesList,
    sync: templatesSync
  },
  'assembly-notifications': {
    default: notifications,
    replay: notificationsReplay,
    list: notificationsList
  },
  bills: {
    default: bills,
    get: billsGet
  }
}
