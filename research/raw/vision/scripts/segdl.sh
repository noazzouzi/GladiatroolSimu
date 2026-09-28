#!/bin/bash
# usage: segdl.sh BASEURL START_SEG END_SEG OUTDIR
B=$1; S=$2; E=$3; O=$4; mkdir -p $O
seq $S $E | xargs -P 8 -I{} sh -c "[ -s $O/{}.ts ] || curl -sS -m 120 --retry 3 -o $O/{}.ts $B/{}.ts"
