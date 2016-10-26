export default function help(output, client, { helpMode: mode, helpAction: action }) {
    if (!mode && action) return output.print(messages.default);

    let msg = messages;
    if (mode) msg = msg[mode];
    if (action) msg = msg[action];
    if (typeof msg === "object") msg = msg.default;

    output.print(msg.slice(1));
}

const register = `
Command: register`;

const assemblies = `
Command: assemblies
Subcommands:
  create
  delete
  replay
  list
  get`;

const templates = `
Command: templates
Subcommands:
  create
  delete
  modify
  list
  get`;

const bills = `
Command: bills
Subcommands:
  get`;

const notifications = `
Command: assembly-notifications
Subcommands:
  replay
  list`;

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
${bills}`;

const assembliesCreate = `
Create assemblies to process media.

Usage: transloadify [assemblies create] (--steps FILE | --template ID)
  [--input FILE]... [--output FILE] [--field KEY=VAL]... [--watch] [--recursive]

Options:
  -s --steps      Specify assembly instructions with a JSON file
  -t --template   Specify a template to use for these assemblies
  -i --input      Provide an input file or a directory; uses STDIN if absent
  -o --output     Specify an output file or directory; uses STDOUT if absent
  -f --field      Set a template field
  -w --watch      Watch inputs for changes
  -r --recursive  Enumerate input directories recursively`;

const assembliesList = `
List assemblies matching given criteria.

Usage: transloadify assemblies list [--before DATE] [--after DATE]
  [--keywords LIST] [--fields list]

Options:
  -b --before  Return only assemblies created before specified date
  -a --after   Return only assemblies created after specified date
  --kewords    Specify a comma-separated list of keywords to match assemblies
  --fields     Specify a list of fields to return for each assembly`;

const messages = {
    default: main,
    register: register,
    assemblies: {
        default: assemblies,
        create: assembliesCreate,
        list: assembliesList
    },
    templates: {
        default: templates
    },
    notifications: {
        default: notifications
    },
    bills: {
        default: bills
    }
};
