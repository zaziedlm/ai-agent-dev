# scripts/set-api-keys.ps1
# ここに自分のキーを直接書く（平文保存に注意）
$OPENAI_API_KEY  = "sk-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
$TAVILY_API_KEY  = "tvly-dev-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

# セッション変数に設定
$env:OPENAI_API_KEY = $OPENAI_API_KEY
$env:TAVILY_API_KEY = $TAVILY_API_KEY

# ユーザー環境変数にも保存（次回以降のシェルでも有効）
# setx OPENAI_API_KEY $OPENAI_API_KEY  | Out-Null
# setx TAVILY_API_KEY $TAVILY_API_KEY  | Out-Null

Write-Host "DONE: OPENAI_API_KEY and TAVILY_API_KEY are set."
