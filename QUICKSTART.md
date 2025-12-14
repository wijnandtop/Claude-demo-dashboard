# Quick Start Guide

## 1. Installatie

```bash
./install.sh
```

Of handmatig:

```bash
npm install
```

## 2. Start het Dashboard

```bash
npm start
```

Dit zal:
1. Scannen naar sessie bestanden in ~/.claude/projects/
2. Een interactief menu tonen
3. Backend server starten (poort 3001)
4. Vite dev server starten (poort 5173)
5. Browser openen met het dashboard

## 3. Navigatie

- Gebruik **pijltjestoetsen** om door sessies te navigeren
- Druk op **Enter** om een sessie te selecteren
- Druk op **Ctrl+C** om te stoppen

## Voorbeeld Gebruik

```bash
$ npm start

Claude Dashboard CLI

Scanning voor sessie bestanden...

Gevonden: 5 sessie(s)

? Selecteer een sessie om te bekijken: (Use arrow keys)
❯ my-project [a1b2c3d4] - 2 uur geleden (145 KB)
  test-app [e5f6g7h8] - 1 dag geleden (89 KB)
  backend-api [i9j0k1l2] - 3 dagen geleden (234 KB)
```

## Vereisten

- Node.js >= 18.0.0
- Claude Code sessies in ~/.claude/projects/
- Poorten 3001 en 5173 moeten vrij zijn

## Troubleshooting

**Q: Geen sessies gevonden?**
A: Zorg dat je Claude Code hebt gebruikt en check ~/.claude/projects/

**Q: Poort al in gebruik?**
A: Stop andere servers op poort 3001 of 5173

**Q: Browser opent niet automatisch?**
A: Open handmatig: http://localhost:5173

## Scripts

- `npm start` - Start CLI tool (aanbevolen)
- `npm run dev` - Start alleen Vite server
- `npm run server` - Start alleen backend server
- `npm run build` - Build voor productie
