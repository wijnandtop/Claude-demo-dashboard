// Get session path from URL
const urlParams = new URLSearchParams(window.location.search);
const sessionPath = urlParams.get('session');

const app = document.getElementById('app');

if (\!sessionPath) {
  app.innerHTML = `
    <header>
      <h1>Claude Dashboard</h1>
      <p class="subtitle">Session Viewer</p>
    </header>
    <div class="error">
      <h2>No session selected</h2>
      <p>Please run the CLI tool to select a session: <code>npm start</code></p>
    </div>
  `;
} else {
  loadSession(sessionPath);
}

async function loadSession(path) {
  try {
    const response = await fetch(`http://localhost:3001/api/session?path=${encodeURIComponent(path)}`);
    
    if (\!response.ok) {
      throw new Error(`HTTP error\! status: ${response.status}`);
    }
    
    const data = await response.json();
    renderSession(data);
  } catch (error) {
    console.error('Error loading session:', error);
    app.innerHTML = `
      <header>
        <h1>Claude Dashboard</h1>
        <p class="subtitle">Session Viewer</p>
      </header>
      <div class="error">
        <h2>Error loading session</h2>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('nl-NL', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function renderSession(data) {
  const { path, messageCount, messages } = data;
  
  // Calculate stats
  const userMessages = messages.filter(m => m.role === 'user').length;
  const assistantMessages = messages.filter(m => m.role === 'assistant').length;
  
  const sessionName = path.split('/').pop().replace('.jsonl', '');
  
  app.innerHTML = `
    <header>
      <h1>Claude Dashboard</h1>
      <p class="subtitle">Session Viewer</p>
    </header>
    
    <div class="session-info">
      <h2>Session Info</h2>
      <div class="session-meta">
        <div class="meta-item">
          <span class="meta-label">Session</span>
          <span class="meta-value">${sessionName}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Total Messages</span>
          <span class="meta-value">${messageCount}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Path</span>
          <span class="meta-value" style="font-size: 0.75rem; word-break: break-all;">${path}</span>
        </div>
      </div>
    </div>
    
    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">${messageCount}</div>
        <div class="stat-label">Total Messages</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${userMessages}</div>
        <div class="stat-label">User Messages</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${assistantMessages}</div>
        <div class="stat-label">Assistant Messages</div>
      </div>
    </div>
    
    <div class="messages" style="margin-top: 2rem;">
      ${messages.map(message => renderMessage(message)).join('')}
    </div>
  `;
}

function renderMessage(message) {
  const roleClass = `role-${message.role}`;
  const timestamp = message.timestamp ? formatDate(message.timestamp) : 'Unknown time';
  
  // Extract text content from message
  let content = '';
  if (typeof message.content === 'string') {
    content = message.content;
  } else if (Array.isArray(message.content)) {
    content = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n\n');
  }
  
  return `
    <div class="message">
      <div class="message-header">
        <span class="message-role ${roleClass}">${message.role}</span>
        <span class="message-timestamp">${timestamp}</span>
      </div>
      <div class="message-content">${escapeHtml(content)}</div>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
