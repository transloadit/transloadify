# Transloadify

<!--more-->

Transloadify is a command line interface for [Transloadit](https://transloadit.com)'s file uploading and encoding service.

## Intro

[Transloadit](https://transloadit.com) is a service that helps you handle file uploads, resize, crop and watermark your images, make GIFs, transcode your videos, extract thumbnails, generate audio waveforms, and so much more. In short, [Transloadit](https://transloadit.com) is the Swiss Army Knife for your files.

This is a **Command Line Interface** to make it easy to talk to the [Transloadit](https://transloadit.com) REST API.

It is a way for non-programmers to access the service, and serves as the shell script SDK. It can also be used as a
cloud-based transcoding and media processing utility.

## Features

- Create and manage assemblies, templates, notifications, and bills
- Process media in the cloud using any of Transloadit's facilities, including
  full ffmpeg and ImageMagick support
- Synchronize your Transloadit templates with local files (WIP)
- File watching
- Tab completion

## Install

```bash
$ npm install -g transloadify
```

## Usage

Transloadify needs Transloadit API authentication information. It looks for it
in the environment variables `TRANSLOADIT_KEY` and `TRANSLOADIT_SECRET`. Check
the [API credentials](https://transloadit.com/c/template-credentials/) page for
these values.

See `transloadify --help` for complete usage instructions.

### Processing media

Transloadify uses the [Transloadit API](https://transloadit.com/docs/).
Transloadit allows you to process media in the cloud by creating <dfn>Assemblies</dfn>.
An <dfn>Assembly</dfn> is an execution of processing instructions on an uploaded file. The
simplest way to create <dfn>Assemblies</dfn> using Transloadify is to put the processing
instructions (called <dfn>Assembly Instructions</dfn>) in a JSON file and give it to
Transloadify using the `--steps` option. Transloadify will then upload whatever
is passed to it via standard in, and output the result file to standard out.

```bash
$ transloadify --steps steps.json < input.jpg > output.jpg
```

Transloadit supports <dfn>Templates</dfn> which are <dfn>Assembly Instructions</dfn> stored in the
cloud. <dfn>Templates</dfn> can be created and managed through Transloadify using the
[`templates`](#user-content-templates) commands. If you have a <dfn>Template</dfn> that you
would like to use to process media, you can specify it with the `--template`
option instead of specifying a `--steps`.

```bash
$ transloadify --template TEMPLATE_ID < input.jpg > output.jpg
```

If your <dfn>Template</dfn> expects certain custom fields to be set, those can be specified
using the `--field` option.

```bash
$ transloadify --template TEMPLATE_ID --field size=100 < input.jpg > output.jpg
```

Rather than use STDIN and STDOUT, you can also pass files to Transloadify using
the `--input` and `--output` flags. These flags are also more flexible than
standard IO because they can take directories, to process media in batch,
optionally traversing subdirectories with the `--recursive` option.

```bash
$ transloadify --template TEMPLATE_ID --field size=100 \
    --input images --recursive --output thumbs
```

Transloadify also has the option to watch inputs for changes, using the
`--watch` option, and reprocessing them whenever a change is detected.

```bash
$ transloadify --template TEMPLATE_ID --field size=100 \
    --input images --recursive --output thumbs --watch
```

All of these flags support shortened versions, to avoid invocations getting too
long. See `transloadify assemblies create --help` for details. The above can be
shortened to:

```bash
$ transloadify -tTEMPLATE_ID -fsize=100 -i images -o thumbs -wr
```

### Assemblies

The `transloadify assemblies` subcommand lets you manage assemblies. Using
transloadify you can create, cancel, replay, list, and fetch <dfn>Assembly Statuses</dfn>.
See `transloadify assemblies --help` for a list of available actions, and
`transloadify assemblies ACTION --help` for specific action documentation.

#### Creation

The usage described in [Processing media](#user-content-processing-media)
implicitly uses the `transloadify assemblies create` command, which has the same
behavior as the bare `transloadify` command.

#### Listing

You can use Transloadify to list assemblies associated with the account,
optionally filtered by date and keywords. For instance:

```bash
$ transloadify assemblies list --after 2016-11-08
```

See `transloadify assemblies list --help` for a list of accepted options.

One use-case is to recover failed assemblies once the issue has been resolved.
If a <dfn>Template</dfn> definition contained an error that caused <dfn>Assemblies</dfn> to fail, you
can salvage them by fixing the <dfn>Template</dfn> and using an invocation like this, using
the [`jq`](https://stedolan.github.io/jq/) JSON utility.

```bash
$ transloadify assemblies list --json --after "$AFFECTED_DATE" \
  | jq -r 'select(.error) | .id' \
  | xargs transloadify assemblies get --json \
  | jq -r 'select(.template_id == "'$AFFECTED_TEMPLATE'") | .assembly_id' \
  | xargs transloadify assemblies replay --reparse-template
```

### Templates

`transloadify templates` is used to create and manage templates. `transloadify
templates --help` gives a list of supported actions.

#### Modification

`transloadify templates modify` will read new <dfn>Template</dfn> contents from standard in
if no file is specified. If you just want to rename a <dfn>Template</dfn> using the
`--name` option, the command will ignore empty input:

```bash
$ transloadify templates rename $TEMPLATE_ID --name my_template < /dev/null
```

### Assembly Notifications

Support for listing and replaying <dfn>Assembly Notifications</dfn> is provided by
`transloadify assembly-notifications list` and `transloadify
assembly-notifications replay` respectively.

#### Listing

`transloadify assembly-notifications list` can list, optionally
filtered by whether they succeeded or failed, either all <dfn>Notifications</dfn>
associated with an account, or for a given <dfn>Assembly</dfn>. If you would like to see
<dfn>Notifications</dfn> for a list of <dfn>Assemblies</dfn>, it must be called for each one
individually.

```bash
$ transloadify assemblies list --after 2016-11-08 \
  | xargs -n1 transloadify assembly-notifications list
```

### Bills

Monthly billing information can be fetched with `transloadify bills get
YYYY-MM...`. By default only the total charge is output, but more detailed
information can be displayed in JSON format with the `--json` flag.

```bash
$ transloadify bills get 2016-11 --json
```

### Tips

- Command names have aliases; the following are interchangeable:
  - `assemblies`, `assembly`, `a`
  - `templates`, `template`, `t`
  - `assembly-notifications`, `assembly-notification`, `notifications`,
    `notification`, `n`
  - `bills`, `bill`, `b`
  - `create`, `new`, `c`
  - `delete`, `cancel`, `d`
  - `modify`, `edit`, `alter`, `m`
  - `replay`, `r`
  - `list`, `l`
  - `get`, `info`, `view`, `display`, `g`
- All output, from any command, can also be provided in JSON format using the `--json` flag

## Example

An example script written to add a watermark to videos can be found here [`examples/`](https://github.com/transloadit/transloadify/tree/main/examples).

## Getting Started

Please see the [GETTING-STARTED.md](./GETTING-STARTED.md) file.

## Changelog

Please see the [CHANGELOG.md](./CHANGELOG.md) file.

## Frequently Asked Questions

Please see the [FAQ.md](./FAQ.md) file.

## Authors

- [Adrian Sinclair](https://transloadit.com/about/#adrian)

## License

[The MIT License](LICENSE)
