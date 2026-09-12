# SupersellScanner

A barcode scanning, inventory management, and point-of-sale (POS) app built with **Expo / React Native** and backed by **Supabase**. Scan a barcode, add it to your stock instantly, and start selling from your phone.

## Features

- 📷 **Smart Barcode Scanner** — supports QR, EAN-13, EAN-8, UPC-A, UPC-E, Code 39/93/128, Codabar, ITF-14, PDF417, Aztec and Data Matrix, with a centered scan frame and confirmation beep.
- ⚡ **Scan to Stock** — scanning a barcode opens a quick form to name the item, set a price and quantity, then saves it straight to the cloud.
- 🛒 **Sell Mode** — scan items into a live cart, adjust quantities, checkout, and the stock count is deducted automatically.
- 📦 **Inventory Dashboard (Vault)** — total units, total value, top item, search by name or barcode, quantity/price filters, and low-stock alerts.
- 🔀 **FIFO / LIFO ordering** — toggle how your inventory is arranged.
- 📴 **Offline mode** — inventory is cached locally, so you can still browse your stock without a connection.
- 🖨️ **POS Register** — local point-of-sale view with products, sales history and printed-style receipts.
- 🔐 **Accounts** — email/password sign up & sign in managed by Supabase Auth.

## Pro tier (in-app upgrade)

- Unlimited inventory items (free plan is limited to 10)
- Item photos
- Low-stock threshold alerts
- Manual barcode entry for codes the camera can't read

## Tech stack

- [Expo](https://expo.dev) / React Native
- [Supabase](https://supabase.com) — Auth, database, and Edge Functions for payment verification
- @react-native-async-storage/async-storage — local caching & settings
- expo-camera, expo-audio, expo-blur, expo-image-picker
- react-native-animatable — UI animations

## Getting started

```bash
npm install
npm start          # start Metro / Expo dev server
npm run android    # run on Android
npm run ios        # run on iOS
npm run web        # run in the browser
```

> Configure your own Supabase project: replace the `SUPABASE_URL` / `SUPABASE_ANON_KEY` in `App.js` with your project's credentials.

## Project structure

```
App.js                # main app: auth, scanner, sell mode, inventory
POSApp.js             # local POS register
supabase/             # Supabase migrations + Edge Functions (payment)
public/               # web build assets
assets/               # icons, splash, scan beep sound
```

## About payments

The `supabase/functions/payment-page` and `verify-payment` Edge Functions use Supabase environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) — no secrets are stored in this repository. Payment links in `App.js` are placeholders; replace `PRO_PAYMENT_LINK`, `MONTHLY_PAYMENT_LINK` and `SELL_PAYMENT_LINK` with your real checkout URLs.