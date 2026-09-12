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

### 1. Prerequisites

- [Node.js](https://nodejs.org) (v18 or newer) with **npm**
- The **Expo Go** app on your phone ([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) / [iOS](https://apps.apple.com/app/expo-go/id982107779)) — or an Android/iOS emulator
- A [Supabase](https://supabase.com) project (free tier is fine)

### 2. Install dependencies

Open a terminal inside the project folder and run:

```bash
npm install
```

### 3. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run `supabase/migrations/20260805000000_create_subscriptions.sql` to create the `subscriptions` table.
3. Enable the **Email** auth provider (Authentication → Providers → Email).
4. Copy your project's `URL` and `anon` key from **Project Settings → API**.
5. Open `App.js` and replace the `SUPABASE_URL` and `SUPABASE_ANON_KEY` values with your own.
6. (Optional, for payment checking) Deploy the Edge Functions in `supabase/functions/` and set the `SUPABASE_SERVICE_ROLE_KEY` secret.

### 4. Run the app

```bash
npm start          # start Metro / Expo dev server
npm run android    # run on Android (emulator)
npm run ios        # run on iOS (emulator)
npm run web        # run in the browser
```

After `npm start`, scan the QR code shown in the terminal with the **Expo Go** app on your phone.

### 5. Test the app

1. **Create an account** — open the app and tap *Make one!!!!* to sign up with an email and password (or sign in if you already have one).
2. **Scan a barcode** — point the camera at any product barcode inside the blue scan frame. A beep confirms the scan.
3. **Add an item to stock** — in the form that appears, enter a product name, price and quantity, then tap **Save Stock**. It now appears in the **Vault**.
4. **Check the dashboard** — open the **Vault** tab to see total units, total value, your top item, and use search / filters / the FIFO switch.
5. **Sell an item** — open the **Sell** tab and scan the same barcode. It joins the cart; tap **Checkout** to deduct the stock.
6. **Refresh** — pull down on the Vault list to re-sync from Supabase. Turn off your connection to see offline (cached) mode.
7. **Try the POS** — switch to the POS register tab, add products, and complete a sale to see the receipt flow.

> The free plan allows 10 items. Upgrade to Pro (via the in-app payment modal) to unlock unlimited items, photos, low-stock alerts, and manual barcode entry.

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