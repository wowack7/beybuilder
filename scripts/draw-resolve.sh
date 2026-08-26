#!/bin/sh
# 解析單一 lin.ee code 的轉址目標，輸出 TSV: code<TAB>location
# 用法: resolve.sh <code>
code="$1"
loc=$(curl -sI --max-time 15 "https://lin.ee/${code}" | tr -d '\r' | awk -F': ' 'tolower($1)=="location"{print $2; exit}')
if [ -n "$loc" ]; then
  printf '%s\t%s\n' "$code" "$loc"
else
  printf '%s\tFAIL\n' "$code"
fi
