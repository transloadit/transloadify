Transloadit client.

Usage:
  transloadify [--register]
  transloadify [--process] (--steps FILE | --template (ID|NAME)) [(--field NAME=VALUE)...] [--watch] [--recursive] [--output FILE] [FILES...]
  transloadify --list [--after DATE] [--before DATE] [--keywords LIST] [--fields LIST]
  transloadify --info ASSEMBLY_IDS...
  transloadify --cancel ASSEMBLY_IDS...
  transloadify --replay [--reparse-template] [(--field NAME=VALUE)...] [--steps FILE] ASSEMBLY_IDS...
  transloadify --create-template NAME [FILE]
  transloadify --template-info (NAME|ID)...
  transloadify --edit-template (NAME|ID) [FILE]
  transloadify --delete-template (NAME|ID)...
  transloadify --list-templates [--after DATE] [--before DATE] [--sort (id|created|modified)] [--order (asc|desc)] [--fields LIST]
  transloadify --bill [MONTH...]

Options:
  --register         Start an interactive session to create a transloadit account.
  --process -p       Create assemblies to process media. If no FILES specified, use stdin.
  --steps            Specify a JSON file to describe assembly steps.
  --template -t      Specify a template to use for these assemblies.
  --field -f         Specify custom fields for these assemblies.
  --watch -w         Enable input file watching.
  --recursive -r     Handle input directories recursively.
  --output -o        Specify output file or directory. If multiple input files are specified, this must be a directory.
  --list -l          List assemblies on server.
  --after -a         Show only assemblies created after specified date (inclusive).
  --before -b        Show only assemblies create before specified date (inclusive).
  --keywords         Show only assemblies which match the specified keywords (see API documentation for details).
  --fields           Include specified fields for each record. Specifying fields will make transloadify output records as JSON.
  --info -i          Show the status of the specified assemblies.
  --cancel           Cancel the specified assemblies.
  --replay           Replay the specified assemblies.
  --reparse-template If an assembly's template has been modified since its creation, use the new version.
  --create-template  Create a template with specified NAME from FILE. Use stdin if FILE not specified.
  --template-info    Display the specified templates.
  --delete-template  Delete specified templates.
  --list-templates   List templates on server.
  --sort             Specify field to sort by.
  --order            Specify sort order.
  --bill             Fetch the bill for the current month or specified months.
  --verbosity -v     Specify verbosity threshold (0, 1 or 2). Default 1.
  --verbose          Alias for --verbosity 2
  --quiet -q         Alias for --verbosity 0
  --version          Display version and license information.
  --help -h          Display this message
