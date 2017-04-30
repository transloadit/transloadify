BASEDIR=$(dirname $0)

if [ $# -eq 0 ]; then
  input="$BASEDIR/fixtures/sample_mpeg4.mp4"
else
  input=$1
fi

output="$(basename $input)"
transloadify -i $input --steps $BASEDIR/steps.json -o $BASEDIR/output/$output
