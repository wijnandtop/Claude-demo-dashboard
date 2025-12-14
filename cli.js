#!/usr/bin/env node

import inquirer from 'inquirer';
import { spawn } from 'child_process';
import open from 'open';
import path from 'path';
import fs from 'fs';
import { glob } from 'glob';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI kleuren voor mooie output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

// Format bestandsgrootte
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format datum
function formatDate(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'zojuist';
  if (minutes < 60) return `${minutes} min geleden`;
  if (hours < 24) return `${hours} uur geleden`;
  if (days < 7) return `${days} dagen geleden`;
  
  return date.toLocaleDateString('nl-NL', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  });
}

// Decode Claude project directory name to real path
function decodeProjectPath(encodedDir) {
  // Claude encodes paths like: Users-wijnandtop-Projects-foo -> /Users/wijnandtop/Projects/foo
  const decoded = '/' + encodedDir.replace(/-/g, '/');
  return decoded;
}

// Extract readable project info from encoded directory
function extractProjectInfo(encodedDir) {
  const fullPath = decodeProjectPath(encodedDir);
  const parts = fullPath.split('/').filter(Boolean);

  // Get project folder name (last part)
  const projectName = parts[parts.length - 1] || 'Unknown';

  // Get relative path from home (skip Users/username)
  const username = os.userInfo().username;
  const homeIndex = parts.findIndex(p => p === username || p === 'Users');
  let relativePath = fullPath;
  if (homeIndex >= 0 && parts[homeIndex + 1]) {
    relativePath = '~/' + parts.slice(homeIndex + 2).join('/');
  }

  return { projectName, fullPath, relativePath };
}

// Extract session ID from filename
function getSessionId(filename) {
  const basename = path.basename(filename, '.jsonl');
  return basename.substring(0, 8);
}

// Scan voor sessie bestanden
async function scanSessions() {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');
  
  if (!fs.existsSync(claudeDir)) {
    console.log(`${colors.red}Error: Directory ${claudeDir} bestaat niet${colors.reset}`);
    console.log(`${colors.dim}Zorg dat je Claude Code hebt gebruikt en sessies hebt opgeslagen${colors.reset}`);
    process.exit(1);
  }
  
  const pattern = path.join(claudeDir, '**/*.jsonl');
  const files = await glob(pattern);

  if (files.length === 0) {
    console.log(`${colors.yellow}Geen sessie bestanden gevonden in ${claudeDir}${colors.reset}`);
    process.exit(0);
  }

  // Filter out subagent files (agent-*.jsonl), keep only main orchestrator sessions
  const mainSessions = files.filter(file => {
    const filename = path.basename(file);
    return !filename.startsWith('agent-');
  });

  if (mainSessions.length === 0) {
    console.log(`${colors.yellow}Geen hoofdsessie bestanden gevonden in ${claudeDir}${colors.reset}`);
    process.exit(0);
  }

  // Verzamel bestandsinformatie
  const sessions = mainSessions.map(file => {
    const stats = fs.statSync(file);
    const parentDir = path.basename(path.dirname(file));
    const { projectName, fullPath: projectPath, relativePath } = extractProjectInfo(parentDir);
    const sessionId = getSessionId(file);

    return {
      path: file,
      projectName,
      projectPath,
      relativePath,
      sessionId,
      modified: stats.mtime,
      size: stats.size,
      stats
    };
  });
  
  // Sorteer op laatste wijziging (nieuwste eerst)
  sessions.sort((a, b) => b.modified - a.modified);
  
  return sessions;
}

// Maak menu keuze string
function formatSessionChoice(session) {
  const time = formatDate(session.modified);
  const size = formatBytes(session.size);

  return {
    name: `${colors.bright}${session.relativePath}${colors.reset} ${colors.dim}[${session.sessionId}]${colors.reset} - ${colors.cyan}${time}${colors.reset} ${colors.dim}(${size})${colors.reset}`,
    value: session,
    short: `${session.relativePath}`
  };
}

// Check of server ready is
async function waitForServer(url, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }
    } catch (error) {
      // Server nog niet ready
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

// Start server process
function startServer(name, command, args, cwd, captureOutput = false) {
  console.log(`${colors.dim}Starting ${name}...${colors.reset}`);

  const proc = spawn(command, args, {
    cwd,
    stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: true
  });

  proc.on('error', (error) => {
    console.error(`${colors.red}Error starting ${name}: ${error.message}${colors.reset}`);
  });

  return proc;
}

// Detect Vite's actual port from stdout
function detectVitePort(viteProc) {
  return new Promise((resolve, reject) => {
    let timeout;
    let output = '';

    const onData = (data) => {
      const text = data.toString();
      output += text;

      // Forward output to console
      process.stdout.write(text);

      // Look for Vite's "Local: http://localhost:XXXX/" message
      const match = text.match(/Local:\s+http:\/\/localhost:(\d+)/);
      if (match) {
        const port = match[1];
        cleanup();
        resolve(port);
      }
    };

    const onError = (data) => {
      // Forward stderr to console
      process.stderr.write(data.toString());
    };

    const onClose = (code) => {
      cleanup();
      reject(new Error(`Vite process exited with code ${code} before port could be detected`));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      viteProc.stdout.off('data', onData);
      viteProc.stderr.off('data', onError);
      viteProc.off('close', onClose);
    };

    viteProc.stdout.on('data', onData);
    viteProc.stderr.on('data', onError);
    viteProc.on('close', onClose);

    // Timeout after 30 seconds
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout waiting for Vite to report port'));
    }, 30000);
  });
}

// Hoofdfunctie
async function main() {
  console.log(`\n${colors.bright}${colors.blue}Claude Dashboard CLI${colors.reset}\n`);
  console.log(`${colors.dim}Scanning voor sessie bestanden...${colors.reset}\n`);
  
  // Scan sessies
  const sessions = await scanSessions();
  
  console.log(`${colors.green}Gevonden: ${sessions.length} sessie(s)${colors.reset}\n`);
  
  // Toon interactief menu
  const choices = sessions.map(formatSessionChoice);
  
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'session',
      message: 'Selecteer een sessie om te bekijken:',
      choices,
      pageSize: 15,
      loop: false
    }
  ]);
  
  const selectedSession = answer.session;
  
  console.log(`\n${colors.bright}${colors.green}Geselecteerd:${colors.reset} ${selectedSession.relativePath}`);
  console.log(`${colors.dim}Sessie ID: ${selectedSession.sessionId}${colors.reset}`);
  console.log(`${colors.dim}Bestand: ${selectedSession.path}${colors.reset}\n`);

  // Start backend server
  const backendProc = startServer(
    'Backend Server',
    'node',
    ['server/index.js'],
    __dirname
  );

  // Wacht tot backend ready is
  console.log(`${colors.dim}Wachten op backend server...${colors.reset}`);
  const backendReady = await waitForServer('http://localhost:3001/health');

  if (!backendReady) {
    console.error(`${colors.red}Backend server start timeout${colors.reset}`);
    backendProc.kill();
    process.exit(1);
  }

  console.log(`${colors.green}Backend server ready!${colors.reset}`);

  // Start Vite dev server with output capture
  const viteProc = startServer(
    'Vite Dev Server',
    'npm',
    ['run', 'dev'],
    __dirname,
    true // Capture output to detect port
  );

  // Detect which port Vite actually started on
  console.log(`${colors.dim}Wachten op Vite dev server...${colors.reset}`);
  let vitePort;
  try {
    vitePort = await detectVitePort(viteProc);
    console.log(`${colors.green}Vite dev server ready on port ${vitePort}!${colors.reset}\n`);
  } catch (error) {
    console.error(`${colors.red}Failed to detect Vite port: ${error.message}${colors.reset}`);
    backendProc.kill();
    viteProc.kill();
    process.exit(1);
  }

  // Build dashboard URL with detected port
  const encodedPath = encodeURIComponent(selectedSession.path);
  const dashboardUrl = `http://localhost:${vitePort}?session=${encodedPath}`;

  // Open browser
  console.log(`${colors.bright}${colors.cyan}Opening browser...${colors.reset}`);
  console.log(`${colors.dim}URL: ${dashboardUrl}${colors.reset}\n`);

  await open(dashboardUrl);
  
  console.log(`${colors.bright}${colors.green}Dashboard is nu actief!${colors.reset}`);
  console.log(`${colors.dim}Druk op Ctrl+C om te stoppen${colors.reset}\n`);
  
  // Graceful shutdown
  const cleanup = () => {
    console.log(`\n${colors.yellow}Stopping servers...${colors.reset}`);
    
    if (backendProc) {
      backendProc.kill('SIGTERM');
    }
    
    if (viteProc) {
      viteProc.kill('SIGTERM');
    }
    
    setTimeout(() => {
      console.log(`${colors.green}Goodbye!${colors.reset}\n`);
      process.exit(0);
    }, 1000);
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
  // Wacht op proces exits
  backendProc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`${colors.red}Backend server crashed with code ${code}${colors.reset}`);
      cleanup();
    }
  });

  viteProc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`${colors.red}Vite dev server crashed with code ${code}${colors.reset}`);
      cleanup();
    }
  });
}

// Run
main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
