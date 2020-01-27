# Getting Started

> Transloadify is not ready for use and some of the steps described in this guide
– such as the Registration & Authentication section – **will not** work yet.

Transloadify is a tool for accessing Transloadit from the command line. It can
be used to create tooling for applications already using Transloadit, or to 
encode local media on their cloud platform. This guide will focus on the latter, giving you
a step-by-step rundown of everything you need to do in order to get Transloadify running 
on your system, and how to get your own automated video processing going.

## Introduction 

Let's say you are working on *the* revolutionary new Internet-of-Things project, and you want
your Raspberry Pi devices to release videos as part of that. You would prefer to apply a 
watermark to these videos before posting them to YouTube, but there is a problem: 
your Raspberry Pi needs its resources for other things than encoding video. 

That is a problem no longer! With Transloadify, you will be able to take full advantage of your 
internet connection to make up for what you are lacking in processing power.

Of course, the same principle holds true even for very beefy machines, when they are
confronted with *even beefier* media libraries. When you put Transloadit's datacenters 
to good use, your machines won't have to break a sweat and can focus on serving your app!

Additionally, you can leverage Transloadit's presets, such as "optimized for iPad", meaning you
won't have to figure out the many encoding settings required for that yourself. You will also have access to
powerful scaling algorithms that will allow you to encode large libraries swiftly.

However, we are trying keeping things small and simple in this walkthrough, so we'll circle back to our
Raspberry Pi example now.

Let's take a look at how to go from zero to having a robust video processing system in just a 
few steps.

## Installation

First things first. Transloadify can be installed on any platform using 
[npm](https://npmjs.com).

```bash
$ npm install -g transloadify
```

### Other sources

Transloadify is also distributed for Arch Linux in the
[AUR](https://aur.archlinux.org/packages/transloadify).

We are planning to add a docker container for this in the near future as well.

## Registration & Authentication

Before being able to use Transloadify, you will need a Transloadit account.
Fortunately, Transloadify makes this as quick and painless as possible. Simply run `transloadify register`
and you will be able to log in using your Github or Google account. If you
already have a Transloadit account, you can log in using `transloadify
authenticate`. After successfully running either of these commands, you should
see a `.transloadify` file containing your credentials in your home directory.
Transloadify will save these credentials for subsequent uses, so you will only have to log in once.

Alternatively, you can populate this file yourself, or pass the `TRANSLOADIT_AUTH_KEY`
and `TRANSLOADIT_AUTH_SECRET` environment variables to Transloadify.

## Specifying assembly instructions

The [Transloadit documentation](https://transloadit.com/docs/) describes how to
write assembly instructions for processing your media. Especially important here are
the sections on [terminology](https://transloadit.com/docs/#terminology) and
[assembly instructions](https://transloadit.com/docs/#assembly-instructions).

For our purposes, we will be using the following instructions:

```json
{
  "video_encode": {
    "robot": "/video/encode",
    "use": ":original",
    "watermark_url": "https://example.org/watermark.png",
    "result": true
  }
}
```

We will now save this in a file called `steps.json`.

## Processing a video

With just that, our watermarking solution is already nearly good to go. Just run `transloadify -i
path/to/original.webm -o path/to/watermarked.webm --steps steps.json` and once
the video finishes uploading and processing, you should find a watermarked
version of your video in `watermarked.webm`. Depending on the size of the video,
the command might take a while to complete. It shouldn't print anything. If the file
exits without any error messages, then you know it has succeeded.

## Automation

Now that we have got basic video processing up and running (wasn't that easy?) we will
need a way to automatically send a video to be processed. If you already have tools in place
that record the video, then you may just want to invoke
Transloadify from there, as soon as the video has finished recording. If you need tighter
integration into your app, consider using an SDK such as the one for 
[Ruby](https://github.com/transloadit/ruby-sdk) or 
[Go](https://github.com/transloadit/go-sdk). Our SDKs offer a more ergonomic API
for integrating into projects written in those respective languages. 

But perhaps there is no SDK for your programming language and you don't feel like writing the boilerplate to 
interface with Transloadit's REST API directly. Or perhaps you're not using a
programming language at all, because you're an ops person that just has to deal
with (incoming) files in a directory. Maybe you're just going for a more loosely coupled solution.
For all of those cases, we recommend you to take advantage of Transloadify's file-watching capabilities.

If you run `transloadify --watch --steps steps.json -i originals/ -o
watermarked/` Transloadify will automatically process all videos placed in
`originals/` and output the watermarked version to `watermarked/`. This way, you
can configure your recording script to output video files to `originals/` and
Transloadify will take care of the rest.

You could use this, for instance, to monitor a `~/Dropbox/incoming` folder. Someone on the 
other end of the world could be adding videos to it, while you have
Transloadify monitoring that folder and immediately watermarking any incoming videos. The results 
will then be made available again in `~/Dropbox/watermarked` and Dropbox will notify the other person of any newly watermarked
file. Isn't that great? A fully functioning automated video processing system. And, apart from setting up Transloadify once, neither of you has to spend any brain or computing power on setting it up! :smile: 

So you see, by leveraging Transloadify's automation capabilites, you can easily and
effectively augment the workflow of creators, and enable them to focus on their content, rather than
struggle with video editors on the spot.

## Templates

If you are recording video on just one device then it is acceptable to store the assembly
instructions in a steps file. However, when you find yourself managing multiple
instances, or in cases where you want to use embedded secrets because you cannot trust the requesting device or its connection, 
you could really benefit from using Transloadit's template facilities. By
managing your assembly instructions with templates, you will no longer have to worry
about distributing changes to your assembly instructions. Using templates is
also useful for more advanced assembly instructions, such as those that accept
parameters to modify the desired encoding behavior.

Templates can be created using the Transloadit 
[web interface](https://transloadit.com/templates/add/), but Transloadify
will also let you create them from the command line. Running `transloadify templates
create <name> <file>` will create a template with the given name, using the
assembly instructions in the given file. The name is just to help you keep your
template list organized, it can easily be changed later. In our case:

```bash
$ transloadify templates create watermarker steps.json
```

This command will produce a hexadecimal string which is the ID of the new
template. Now, instead of giving transloadify the `--steps` option, we can pass
the template ID to the `--template` option. For example:

```bash
$ transloadify --watch --template 656cfd70ab4a11e6bbc7bd5c371617df \
    -i originals/ -o watermarked/
```

## Making the most of Transloadit

We now have video processing working smoothly, but the benefit of having lower 
CPU usage through offloading watermarking process to Transloadit comes at a price 
– a price paid in bandwith. The good news is: we can easily fix this as well! 
Since we would otherwise already have to upload the video once anyway — the final video, to YouTube — 
rather than uploading the video to Transloadit, then downloading the watermarked version, then uploading
the watermarked version to YouTube, we can instruct Transloadit to upload the
watermarked video directly to YouTube, thereby skipping the download process entirely.

In order for Transloadit to be able to upload video to your YouTube account, you
will need to use the template credentials 
[admin interface](https://transloadit.com/template-credentials/) and authorize
Transloadit to upload to your account. Due to security considerations, only
assembly instructions contained in templates can make use of template
credentials, so make sure to use `--template` instead of `--steps`.

Next, we must modify the "watermarker" template to upload to YouTube with the
credentials we just created.

```json
{
  "video_encode": {
    "robot": "/video/encode",
    "use": ":original",
    "watermark_url": "https://example.org/watermark.png"
  },
  "youtube": {
    "robot": "/youtube/store",
    "use": "video_encode",
    "credentials": "my_youtube_credentials"
  }
}
```

The changes to the template can be effected either with the `transloadify templates
modify watermarker steps.json` command or through the web interface. 

In order to avoid needlessly downloading the watermarked videos that now
directly go to YouTube, we should drop the output option from our file-watching command:

```bash
$ transloadify --watch --template 656cfd70ab4a11e6bbc7bd5c371617df -i originals/
```

And there you go! Fully automated video processing and uploading to YouTube, all from the comfort of your own command line. With Transloadify, you can do a lot more than just this, of course. See [Transloadit's documentation](https://transloadit.com/docs/) for the many other features they have to offer. 

We hope that this tutorial has succeeded in teaching you the basics of setting up your own video processing with Transloadify. If you have any more question about how to this tool, let us know on [Twitter](https://twitter.com/transloadit) or via [email](mailto:hello@transloadit.com).
