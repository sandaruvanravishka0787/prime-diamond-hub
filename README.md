# PRIME DIAMOND HUB

A Node.js + Express + SQLite starter storefront with customer accounts, order submission, payment-slip upload, loyalty points and an admin dashboard.

## Included
- Customer storefront with Diamond and Membership packages
- Customer registration/sign-in and order history
- Orders require game UID, payment reference and payment slip
- Admin can approve/reject orders and view slips
- Approved orders award 1 point per Rs.100 actually paid
- 10 points redeem for Rs.20 off a future order
- Rejected orders restore any points redeemed on that order
- Admin can edit/hide/add packages, manage customer points and publish/hide offers
- SQLite database and persistent SQLite-backed sessions

## Run locally
1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Set a long random `SESSION_SECRET` and a strong `ADMIN_PASSWORD`.
4. In this folder run `npm install` then `npm start`.
5. Open `http://localhost:3000` for the store and `http://localhost:3000/admin` for admin.

The first startup creates the admin account from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Keep `.env` private. Do not upload it to GitHub or include it in a public ZIP.

## Important before going live
- The current Ez Cash notice is informational only. This app does not connect to a bank or automatically verify payments. Admin must compare the uploaded slip/reference against the actual payment before approving.
- Confirm that your top-up supply method and resale activity comply with the game publisher's rules and your payment provider's terms.
- Deploy the Node app to a Node.js host with persistent disk storage. SQLite and uploaded slips need a persistent volume. Netlify static hosting alone cannot run this Express server or persist this SQLite database; use a Node host for the backend, or migrate to a hosted database/object storage.
- Set `NODE_ENV=production`, use HTTPS, set a strong secret/password, and configure secure backups. For public production, add a CSRF protection layer and malware scanning for uploaded files.
- Uploaded payment slips contain personal/payment information. Restrict admin access and delete files when no longer needed.
- This is a starter implementation. Test registration, orders, redemption, approval, rejection and backups with test data before accepting real payments.

## Default catalogue
Prices are the package prices selected in the conversation. The Rs.30 Ez Cash note is displayed to customers. Loyalty points are awarded after an admin approves an order.
