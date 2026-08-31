# FTC Library Management System

A frontend-only library management application for Federal Training Centre Polytechnic, Ikoyi, Lagos.

## Stack

- HTML5
- CSS3
- Vanilla JavaScript (ES modules)
- Firebase Authentication
- Cloud Firestore
- No PHP, Python, Node.js backend, or server-side application

The project uses Firebase's modular browser SDK from the official CDN. Replace the placeholders in `js/firebase-config.js` with your Firebase Web App configuration. Firebase documents CDN-based modular imports as an option for browser projects without a build tool. 

## Setup

1. Create a Firebase project.
2. Register a Web App and copy its configuration into `js/firebase-config.js`.
3. Enable **Authentication > Sign-in method > Email/Password**.
4. Create a Firestore database.
5. Deploy `firestore.rules`.
6. Create the first administrator Firebase Auth account manually.
   - The username is converted by the app to:
     `username@ftc-library.local`
   - Example username: `FTC-STAFF-01`
   - Create that exact synthetic email in Firebase Authentication.
7. Add a matching document under `users/{AUTH_UID}` with:
   - `staffId`
   - `username`
   - `fullName`
   - `email`
   - `phone`
   - `role`: `Administrator`
   - `status`: `active`
8. Serve the folder through a local web server or Firebase Hosting. Do not open `index.html` with `file://`.
9. Log in with the username and password.
10. Use Settings to configure loan period, fine rate, maximum books, and membership validity.

## Important security note

Firebase Web configuration values such as `apiKey` are not passwords. Security comes from Firebase Authentication and Firestore Security Rules. Never put Firebase Admin SDK credentials or service-account private keys in this frontend.

## Staff creation

The UI can create Firebase Authentication accounts, but because this is a browser-only architecture, account creation changes the active Firebase Auth user. The current implementation signs the administrator out after creating a new staff account. For a production deployment, create staff accounts through Firebase Console or use a trusted backend/Cloud Function if simultaneous admin-session preservation is required.

## Data integrity

Borrowing and returning use Firestore transactions to update the related book/member/loan records atomically. Sequential human-readable IDs use Firestore counter documents.

## Production hardening

For a real institutional deployment, additionally consider Firebase App Check, stricter validation rules, monitoring, periodic exports, and a trusted administrative environment for user lifecycle operations.
