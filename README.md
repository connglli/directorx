# Directorx (dx)

## Requirements

1. [Deno](https://deno.land) v1.9.2+ (std v0.60.0)
2. [Yota](https://github.com/connglli/yota) v0.0.1
3. [VirtualXposed](https://github.com/android-hacker/VirtualXposed) (if you'd like to use dx on physical device), or [Xposed](https://github.com/rovo89/Xposed) (if emulator)

## Install

1. [Install Deno](https://github.com/denoland/deno_install#install-specific-version): dx is tested on Deno v1.9.2 with std v0.60.0
1. [Download and install Yota](https://github.com/connglli/yota)
1. [Install VirtualXposed](https://github.com/android-hacker/VirtualXposed) if you'd like to use dx on a physical device, or [Xposed](https://github.com/rovo89/XposedInstaller) if you'd like to use it on an emulator (must be a rooted emulator, see [here](https://github.com/connglli/root_avd))
1. Install dx's recmod (Virtual)Xposed module to the phone by issuing
   ```
   $ cd dxrec && ./gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk && cd ..
   ```
1. Activate the recmod from (Virtual)Xposed's module list
1. Put the package name of the app you'd like to record and replay into `dxrec.config.json`'s `whitelist` field
1. Push the config file (`dxrec.config.json`) to the phone by issuing
   ```
   $ adb shell mkdir -p /data/local/tmp/directorx && adb shell push dxrec.config.json /data/local/tmp/directorx/
   ```
1. Start recording and replaying

## Record

The record module will record a sequence of user actions in to a `.dxpk` file that is defined by dx.

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

The replay module will replay a user sequence recorded in a `.dxpk`.

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
