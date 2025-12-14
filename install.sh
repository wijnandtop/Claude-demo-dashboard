#\!/bin/bash
# Claude Dashboard - Installatie Script

echo ""
echo "Claude Dashboard - Installatie"
echo "==============================="
echo ""

# Check Node.js versie
if \! command -v node &> /dev/null; then
    echo "Error: Node.js is niet geïnstalleerd"
    echo "Download Node.js >= 18.0.0 van https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ $NODE_VERSION -lt 18 ]; then
    echo "Error: Node.js versie moet >= 18.0.0 zijn"
    echo "Huidige versie: $(node -v)"
    exit 1
fi

echo "Node.js versie: $(node -v)"
echo ""

# Installeer dependencies
echo "Installeren van dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo ""
    echo "Error: npm install mislukt"
    exit 1
fi

echo ""
echo "Installatie succesvol\!"
echo ""
echo "Start het dashboard met: npm start"
echo ""
