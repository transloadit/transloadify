[![Build Status](https://travis-ci.org/transloadit/transloadify.svg)](https://travis-ci.org/transloadit/transloadify)

# transloadify

`transloadify` is a commandline utility to convert local media using [Transloadit](https://transloadit.com), without writing a single line of code.

![transloadify](https://cloud.githubusercontent.com/assets/26752/6804908/9230d0b4-d240-11e4-9adb-01ecf0036196.gif)

`transloadify` comes as binaries for all (main) platforms and can monitor directories for incoming media files.

`transloadify` if built on top of the [Transloadit Go SDK](https://github.com/transloadit/go-sdk)

```bash
# Use -h for more help
transloadify -h

# Upload all files from ./input and process them using the steps defined in the template with the id 'tpl123id'.
# Download the results and put them into ./output.
# Watch the input directory to automatically upload all new files.
TRANSLOADIT_KEY=abc123 \
TRANSLOADIT_SECRET=abc123efg \
./transloadify \
  -input="./input" \
  -output="./output" \
  -template="tpl123id" \
  -watch
```

Instead of using a template id you can also load the steps from a local template file using the `template-file` option (see [`templates/imgresize.json`](templates/imgresize.json), for example):
```bash
TRANSLOADIT_KEY=abc123 \
TRANSLOADIT_SECRET=abc123efg \
./transloadify \
  -input="./input" \
  -output="./output" \
  -template-file="./templates/imgresize.json" \
  -watch
```

## Install

Download the tranloadify binary

```bash
curl http://releases.transloadit.com/transloadify/transloadify-linux-amd64-latest \
  -o ./transloadify && chmod 755 $_
```

Use the binary

```bash
./transloadify -h
```

## Daemonize

To run transloadify in the background as a daemon on Linux, continuously monitoring a directory for new media, and converting it according to your wishes, you can use a convenience argument that generates an [Upstart](http://upstart.ubuntu.com/) file:

```bash
TRANSLOADIT_KEY=abc123 \
TRANSLOADIT_SECRET=abc123efg \
./transloadify \
  -input="./input" \
  -output="./output" \
  -template-file="./templates/imgresize.json" \
  -watch \
  -upstart \
|sudo tee /etc/init/transloadify.conf
```

Transloadify will now start on boot, and you can control it like so:

```bash
sudo start transloadify
sudo restart transloadify
sudo stop transloadify
sudo status transloadify
```

Logs will be written to syslog under the `transloadify` tag so you can redirect them using e.g. rsyslog, but by default they're accessible in the main `syslog`

```bash
sudo tail -f /var/log/syslog
```

## Contribute

If you want to get into `transloadify` development, here are the steps:

### Set up Go

If you haven't already, [download Go](http://golang.org/dl/) for your platform.

### Paths

You [don't need GOROOT](http://dave.cheney.net/2013/06/14/you-dont-need-to-set-goroot-)

```bash
unset GOROOT
```

Set `GOPATH` to your projects directory, e.g.:

```bash
export GOPATH=~/go
```

### Get the SDK & Dependencies

```bash
mkdir -p $GOPATH/src/github.com/transloadit && \
 cd $_ && \
 git clone https://github.com/transloadit/go-sdk && \
 git clone https://github.com/transloadit/transloadify && \
 cd transloadify
```

### Run transloadify in debug mode

```bash
go run transloadify.go -h
```

### Build

```bash
make build
```

### Release

Releasing requires the [AWS Command Line Interface
](http://aws.amazon.com/cli/) and write access to the `transloadify` S3 bucket, hence this can only be done by Transloadit's staff.

Depending on [SemVer](http://semver.org/) impact, any of the following will release a new version

```bash
make release bump=major
make release bump=minor
make release bump=patch
```

This means:

 - Aborts unless working tree is clean
 - Build to `./bin`
 - Test
 - Bumps specified SemVer part in `./VERSION`
 - Commits the file with msg "Release v<version>"
 - Creates a Git tag with this version
 - Pushes commit & tag to GitHub
 - Runs gobuild.io on this tag for *most* platforms, saving to `./builds`
 - Uploads them to S3 as `s3://releases.transloadit.com/transloadify/transloadify-<platform>-<arch>-<version>` with `public-read` access, making the file accessible as e.g. http://releases.transloadit.com/transloadify/transloadify-darwin-amd64-v0.1.0 and http://releases.transloadit.com/transloadify/transloadify-darwin-amd64-latest
 - Clears the `./builds` directory

## License

[MIT Licensed](LICENSE)
