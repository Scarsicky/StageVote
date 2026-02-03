# SDG-Jukebox (Firestore-only)


Gratis te draaien zonder Cloud Functions. Publiek stemt direct; Admin start/sluit rondes.


## Setup
1. `npm i`
2. Maak een Firebase project en een Web App; kopieer config naar `.env.local`.
3. `firebase init` → kies **Hosting** en **Firestore** (geen Functions). Set hosting public dir op `dist`. Rewrites naar `/index.html`.
4. **Rules & indexes** deployen:
5. **Admin aanmaken**:
- In Firebase Authentication: maak een gebruiker (email+password).
- In Firestore: maak leeg document op `/admins/{uid}` (uid zie je in Auth).
6. **Seed opties** (in Console): `/events/default/options` met velden: `title, composer, section, order, enabled:true, hasWon:false`.


## Locally
- `npm run dev`


## Deploy hosting
- `npm run build`
- `firebase deploy --only hosting`


## Gebruik
- Ga naar `/admin` → log in → **Start ronde** → publiek op `/` ziet stemopties.
- Publiek stemt (1 stem per device/ronde). Admin ziet live telling.
- **Sluit ronde** → winnaar gemarkeerd en valt weg (`hasWon:true`).