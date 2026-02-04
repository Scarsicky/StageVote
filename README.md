# StageVote – Live Voting Web App (Firebase + React PWA)

Gameshow is een real-time webapplicatie voor live evenementen zoals concerten, quizzen en interactieve shows. Publiek kan stemmen via hun telefoon, regie beheert stemrondes en een dirigent/spelleider kan live ingrijpen op de uitslag.
De app is gebouwd als Progressive Web App (PWA) met Firebase als backend en is ontworpen voor situaties met veel gelijktijdige gebruikers (100–300+).

## Features

**AUDIENCE (publiek)**

- Stemmen tijdens open rondes
- Bevestiging na stemmen
- Na sluiten alleen de winnaar zichtbaar (geen stemverdeling)

**REGIE (/regie)**

- Inloggen met e-mail/wachtwoord (Firebase Auth)
- Starten en sluiten van stemrondes
- Kiezen van categorie/genre per ronde
- Importeren van stemopties via CSV
- Reset van event / rondes
- Buildversie zichtbaar in footer

**DIRIGENT (/almer)**

- Inloggen met e-mail/wachtwoord
- Live veto op muziekstukken die niet mogen winnen
- Veto beïnvloedt uitslag zonder zichtbaar te zijn voor publiek

**BEAMER DISPLAY (/beamer)**

- QR-code naar stemapp
- Ronde-status (wachten / stemmen / uitslag)
- Winnaar van de ronde
- Totaal aantal stemmen

## Tech Stack

- Frontend: React + Vite (TypeScript)
- Backend: Firebase Firestore
- Auth: Firebase Authentication
- Hosting: Firebase Hosting
- Real-time updates: Firestore listeners
- PWA ready

## Project Structuur
```
public/
  qr.png
  index.html
  404.html
src/
  routes/
    Audience.tsx
    Admin.tsx
    Conductor.tsx
    Display.tsx
  components/
    BuildFooter.tsx
  hooks/
    useCountdown.ts
    useDeviceId.ts
    useEventData.ts
  lib/
    converters.ts
    firebase.ts
  App.tsx
  main.tsx
  styles.css
  vite-env.d.ts
  types.ts
firestore.rules
firebase.json
firestore.indexes.json
index.html
package.json
package-lock.json
tsconfig.json
vite.config.js
```
## Rollen & Rechten
|**Rol**|**Firestore collection**|**Wat mag**|
|--------|--------|--------|
|Admin|admins/{uid}|alles beheren|
|Dirigent|conductors{uid}|alleen veto aanpassen|
|Publiek|N/A|alleen stemmen|

## Lokaal draaien
1. Install Dependencies
```
npm install
```

2. Firebase config

Maak `.env.local` 
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
```
(uit Firebase Console --> Project Settings)

3. Start dev server
```
npm run dev
```
Open:
- http://localhost:5173/ --> publiek
- http://localhost:5173/almer --> dirigent
- http://localhost:5173/beamer --> beamer
- http://localhost:5173/regie --> regie

## Deploy
```
npm run build
firebase deploy
```

## Firestore structuur (kern)
```
events/{eventId}
  options/{optionId}
  rounds/
    current
    {roundId}
      votes/{deviceId}
admins/{uid}
conductors/{uid}
```

## Stemflow
1. Regie start ronde --> `rounds/current` wordt open gezet
2. Publiek stemt --> votes subcollection vult
3. Dirigent kan veto's zetten --> `vetoedOptionIds`
4. Regie sluit ronde: stemmen geteld, veto toegepast, winnar bepaald, totaal stemmen berekend
5. Beamer + publiek tonen resultaat

## CSV import
Admin kan opties in bulk toevoegen met CSV (voorbeeld):
```
title,composer,categoryId,order
Fix You,Coldplay,pop,1
Levels,Avicii,dance,2
```
## Security
- Publiek kan alleen stemmen (geen lezen)
- Resultaten individuele telling alleen zichtbaar via regie
- Veto alleen door dirigent
- Alles afgedwongen via firestore:rules

## Backlog
- Meerdere events tegelijk
- Live stemteller op /beamer
- Dirigentenstem met gewicht (aanvullend op Veto)
- Quiz/gamemodes
- Thema's per event

## Auteur
Gebouwd door Jurjen Bergsma

Voor live events, concerten en interactieve shows
