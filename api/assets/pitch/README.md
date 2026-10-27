# Pitch-Präsentation

Hier liegt das statische Bundle einer eigenen Präsentation (`index.html` + `assets/`), die nur über geheime Links
`/pitch/<token>` erreichbar ist (API.md §38). Einspielen mit `node scripts/pitch-import.mjs <ordner>`.
Ohne `index.html` antworten Pitch-Links mit 404 – der Rest der Website läuft normal.
