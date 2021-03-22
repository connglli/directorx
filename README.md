# Directorx

## Requirement

1. deno v1.8.2 (std v0.60.0)
2. yota v0.0.1
3. VirtualXposed (physical device), or Xposed (emulator)

## Install

1. Install deno
2. Download and install yota
3. Install recmod: `cd dxrec && ./gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk && cd ..`
4. Write your own config: `adb shell mkdir -p /data/local/tmp/directorx && adb shell push dxrec.config.json /data/local/tmp/directorx/`

## Record

```
$ ./dx rec --help

  Usage:   rec <app>
  Version: v0.2.1

  Description:

    Record as a dxpk

  Options:

    -h, --help                    - Show this help.
    -s, --serial   <type:string>  - serial no
    -o, --output   <type:string>  - output dxpk                      (Default: out.dxpk)
    -v, --verbose                 - output verbose information
    -L, --lhook    <type:string>  - path of the lifecycle hook used
    -G, --mylog    <type:string>  - path of the custom logger
```

## Replay

```
$ ./dx play --help

  Usage:   play <dxpk>
  Version: v0.2.1

  Description:

    Replay an dxpk

  Options:

    -h, --help                      - Show this help.
    -s, --serial     <type:string>  - serial no
    -p, --player     <type:string>  - which player to use, one of [px, pt, wdg, res]                    (Default: px)
    -K, --lookahead  <type:number>  - Look ahead constant                                               (Default: 1)
    -H, --nohide                    - do not automatically hide soft keyboard before firing each event
    -L, --lhook      <type:string>  - path of the lifecycle hook used
    -P, --plugin     <type:string>  - path of the plugin used
    -U, --uinorm     <type:string>  - path of the ui normalizer used
    -S, --segnorm    <type:string>  - path of the segment normalizer used
    -M, --matcher    <type:string>  - path of the segment matcher used
    -R, --recogn     <type:string>  - path of the pattern recognizer used
    -G, --mylog      <type:string>  - path of the custom logger
    -t, --topleft                   - input at topleft instead of center of a view
    -v, --verbose                   - output verbose information
```
