# PrivetManagerApp (Mobile)

This is a Capacitor-based Android wrapper around https://manager.privetsuper.ru/.

## Setup

```sh
npm install
npx cap add android
```

## Run (Android)

```sh
npx cap open android
```

Then sync and build in Android Studio.

## Notes

- File uploads use the system chooser; users can select Camera or Gallery.
- Permissions are declared in `android/app/src/main/AndroidManifest.xml`.
