# Session Context

## User Prompts

### Prompt 1

pre-commit の shellcheck で以下エラーで怒られてる
In .zshrc line 93:
function chpwd() { ls -F }
^-- SC1009 (info): The mentioned syntax error was in this function.
                 ^-- SC1073 (error): Couldn't parse this brace group. Fix to allow more checks.
                         ^-- SC1083 (warning): This } is literal. Check expression (missing ;/\n?) or quote it.


In .zshrc line 107:

^-- SC1056 (error): Expected a '}'. If you have one, try a ; or \n in front of it.
^-- SC107...

### Prompt 2

commit, push, PR作成、CI走ってる場合は通ったらSquashマージまでして

