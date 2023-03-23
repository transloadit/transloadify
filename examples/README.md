# Example Usage of the Transloadify

To run this script, simply run the following command.

```bash
$ sh watermark.sh
```

It sends [this video](https://github.com/transloadit/transloadify/blob/main/examples/fixtures/sample_mpeg4.mp4) to
the [Transloadit](https://transloadit.com) server which in turn adds
[this watermark](https://github.com/transloadit/transloadify/blob/main/examples/fixtures/watermark.png) to it and the output
is saved to the `examples/output` directory.

If you want to test this script with your own video file, you may pass the path to the video as an argument like so:

```bash
$ sh watermark.sh /PATH/TO/VIDEO.mp4
```

_Note: Before running the script, please be sure you have set your transloadit credentials to environment variables. You can set it by running_

```sh
$ export TRANSLOADIT_KEY="YOUR_TRANSLOADIT_KEY"
$ export TRANSLOADIT_SECRET="YOUR_TRANSLOADIT_SECRET"
```
