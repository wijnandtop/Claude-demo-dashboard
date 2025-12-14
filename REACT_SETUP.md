# Claude Dashboard - React Setup

Een interactieve real-time dashboard voor het visualiseren van Claude AI sessies met React en Socket.IO.

## Project Structuur

```
/Users/wijnandtop/Projects/claude_dashboard/
├── index.html              # React HTML entry point
├── vite.config.js          # Vite configuratie met React plugin
├── package.json            # Dependencies inclusief React en Socket.IO
├── src/
│   ├── main.jsx           # React entry point
│   ├── App.jsx            # Hoofdcomponent met WebSocket logica
│   ├── index.css          # Dark theme styling
│   └── components/
│       ├── Orchestrator.jsx   # Master controller component
│       ├── Agent.jsx          # Individual agent component
│       ├── SessionSelector.jsx # Session dropdown
│       └── Timeline.jsx       # Event timeline
└── server/                # Backend (nog te implementeren)
```

## Installatie

1. Installeer dependencies:
```bash
npm install
```

2. Start de development server:
```bash
npm run dev
```

De applicatie draait op: http://localhost:5173

## Features

### Componenten

**App.jsx** - Hoofdcomponent
- WebSocket connectie naar http://localhost:3001
- State management voor sessies, agents, orchestrator
- Live/Playback modes
- Narrator mode toggle (Raw/Haiku)

**Orchestrator.jsx** - Master Controller
- DiceBear avatar met seed '''orchestrator'''
- Tekstwolk met huidige status
- Speciale '''master''' styling met gradient
- Pulse animatie

**Agent.jsx** - Agent Cards
- Unieke DiceBear avatars per agent
- Status indicators (active=groen, waiting=grijs, done=blauw)
- Laatste 5 acties met icons (📖 Read, ✍️ Write, ✏️ Edit, ⚡ Bash)
- Tekstwolk met current task
- Narrator mode support

**SessionSelector.jsx** - Sessie Kiezer
- Dropdown met beschikbare sessies
- Project naam + laatste update tijd
- Nederlandse tijdformat

**Timeline.jsx** - Event Timeline
- Horizontale tijdlijn met klikbare markers
- Error markers (rood), Save markers (groen)
- Live indicator badge
- Hover tooltips met event details
- Seek functionaliteit

### Styling (index.css)

- **Dark theme**: Background #1a1a2e, Cards #16213e
- **Flexbox grid** voor responsive agent layout
- **Speech bubbles** met CSS triangles
- **Smooth animations** op hover en status changes
- **Status colors**: Success (#44ff44), Error (#ff4444), Warning (#ffaa44)
- **Responsive** design voor mobile

## WebSocket Events

De app luistert naar:
- `connect` - Verbinding gemaakt
- `sessions` - Lijst van beschikbare sessies
- `update` - Real-time updates voor agents/orchestrator
- `disconnect` - Verbinding verbroken

## Backend Vereisten

De backend moet draaien op http://localhost:3001 en de volgende events sturen:

```javascript
// Sessions event
{
  id: string,
  projectName: string,
  lastUpdate: timestamp
}

// Update event
{
  sessionId: string,
  type: '''error''' | '''save''' | other,
  agents: [{
    name: string,
    status: '''active''' | '''waiting''' | '''done''',
    currentTask: string,
    narratedTask: string,  // optional haiku versie
    actions: [{
      type: '''Read''' | '''Write''' | '''Edit''' | '''Bash''',
      file: string  // optional
    }]
  }],
  orchestrator: {
    currentTask: string,
    narratedStatus: string,  // optional haiku versie
    activeAgents: number,
    tasksCompleted: number
  }
}
```

## Development

- `npm run dev` - Start Vite dev server (http://localhost:5173)
- `npm run build` - Build voor productie
- `npm run preview` - Preview production build

## Status

✅ React + Vite configuratie
✅ Alle componenten aangemaakt
✅ Dark theme styling
✅ Socket.IO client integratie
⏳ Backend server implementatie
⏳ npm install (handmatig uit te voeren)

## Volgende Stappen

1. Run `npm install` om packages te installeren
2. Implementeer backend WebSocket server op poort 3001
3. Test de connectie met `npm run dev`
