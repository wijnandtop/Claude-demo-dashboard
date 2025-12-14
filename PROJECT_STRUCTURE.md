# Project Structuur

```
claude_dashboard/
├── cli.js                 # Hoofd CLI tool met interactief menu
├── package.json           # NPM dependencies en scripts
├── vite.config.js        # Vite configuratie
├── install.sh            # Installatie script
├── README.md             # Volledige documentatie
├── QUICKSTART.md         # Snelle start handleiding
├── .gitignore           # Git ignore rules
│
├── server/
│   └── index.js         # Express backend server (poort 3001)
│
└── frontend/
    ├── index.html       # HTML template met styling
    └── main.js          # Frontend JavaScript
```

## Bestand Overzicht

### cli.js (7.6 KB)
Hoofd entry point. Bevat:
- Session scanning via glob
- Interactief menu met inquirer
- Process management (backend + Vite)
- Health checks
- Browser automation
- Graceful shutdown handlers

### server/index.js (2.5 KB)
Express backend server:
- CORS enabled
- Health check endpoint
- Session data API
- JSONL parsing

### index.html + main.js
Frontend:
- Dark theme styling
- Session rendering
- Message timeline
- Statistics dashboard

## Data Flow

1. User runs: npm start
2. cli.js scans ~/.claude/projects/**/*.jsonl
3. Interactive menu shows sessions
4. User selects session
5. cli.js starts backend + Vite servers
6. Browser opens with session
7. Frontend fetches data from backend
8. Messages rendered with stats
