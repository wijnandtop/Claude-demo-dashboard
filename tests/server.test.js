import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseAgentFile, decodeProjectPath, processAgentFreshness } from '../server/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('parseAgentFile', () => {
  const testDir = path.join(__dirname, 'temp');

  beforeEach(() => {
    // Create temp directory for test files
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should parse valid agent file with actions and messages', () => {
    const testFile = path.join(testDir, 'agent-test.jsonl');
    const jsonlContent = [
      JSON.stringify({
        type: 'assistant',
        agentId: 'agent-123',
        timestamp: '2025-12-15T10:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              id: 'tool-1',
              input: { file_path: '/path/to/file.js' }
            },
            {
              type: 'text',
              text: 'Reading the file now'
            }
          ]
        }
      }),
      JSON.stringify({
        type: 'assistant',
        agentId: 'agent-123',
        timestamp: '2025-12-15T10:01:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              id: 'tool-2',
              input: { file_path: '/path/to/output.js' }
            }
          ]
        }
      })
    ].join('\n');

    fs.writeFileSync(testFile, jsonlContent);

    const result = parseAgentFile(testFile);

    expect(result).not.toBeNull();
    expect(result.agentId).toBe('agent-123');
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].name).toBe('Read');
    expect(result.actions[0].filePath).toBe('/path/to/file.js');
    expect(result.actions[1].name).toBe('Write');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].text).toBe('Reading the file now');
  });

  it('should detect completion with stop_reason: end_turn', () => {
    const testFile = path.join(testDir, 'agent-completed.jsonl');
    const jsonlContent = [
      JSON.stringify({
        type: 'assistant',
        agentId: 'agent-456',
        timestamp: '2025-12-15T10:00:00.000Z',
        message: {
          content: [
            {
              type: 'text',
              text: 'Task completed'
            }
          ],
          stop_reason: 'end_turn'
        }
      })
    ].join('\n');

    fs.writeFileSync(testFile, jsonlContent);

    const result = parseAgentFile(testFile);

    expect(result).not.toBeNull();
    expect(result.agentId).toBe('agent-456');
    expect(result.isCompleted).toBe(true);
    expect(result.lastStopReason).toBe('end_turn');
  });

  it('should handle empty file', () => {
    const testFile = path.join(testDir, 'agent-empty.jsonl');
    fs.writeFileSync(testFile, '');

    const result = parseAgentFile(testFile);

    expect(result).not.toBeNull();
    expect(result.agentId).toBeNull();
    expect(result.actions).toHaveLength(0);
    expect(result.messages).toHaveLength(0);
    expect(result.isCompleted).toBe(false);
  });

  it('should return null for non-existent file', () => {
    const nonExistentFile = path.join(testDir, 'does-not-exist.jsonl');
    const result = parseAgentFile(nonExistentFile);
    expect(result).toBeNull();
  });

  it('should skip unparseable lines and continue parsing', () => {
    const testFile = path.join(testDir, 'agent-malformed.jsonl');
    const jsonlContent = [
      JSON.stringify({
        type: 'assistant',
        agentId: 'agent-789',
        timestamp: '2025-12-15T10:00:00.000Z',
        message: {
          content: [
            {
              type: 'text',
              text: 'Valid message'
            }
          ]
        }
      }),
      'this is not valid json',
      JSON.stringify({
        type: 'assistant',
        agentId: 'agent-789',
        timestamp: '2025-12-15T10:01:00.000Z',
        message: {
          content: [
            {
              type: 'text',
              text: 'Another valid message'
            }
          ]
        }
      })
    ].join('\n');

    fs.writeFileSync(testFile, jsonlContent);

    const result = parseAgentFile(testFile);

    expect(result).not.toBeNull();
    expect(result.agentId).toBe('agent-789');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].text).toBe('Valid message');
    expect(result.messages[1].text).toBe('Another valid message');
  });
});

describe('decodeProjectPath', () => {
  it('should decode Users-john-Projects-foo to /Users/john/Projects/foo', () => {
    const encoded = 'Users-john-Projects-foo';
    const decoded = decodeProjectPath(encoded);
    expect(decoded).toBe('/Users/john/Projects/foo');
  });

  it('should decode Users-wijnandtop-Projects-claude_dashboard', () => {
    const encoded = 'Users-wijnandtop-Projects-claude_dashboard';
    const decoded = decodeProjectPath(encoded);
    expect(decoded).toBe('/Users/wijnandtop/Projects/claude_dashboard');
  });

  it('should decode simple path Users-john-test', () => {
    const encoded = 'Users-john-test';
    const decoded = decodeProjectPath(encoded);
    expect(decoded).toBe('/Users/john/test');
  });

  it('should handle single segment', () => {
    const encoded = 'Users';
    const decoded = decodeProjectPath(encoded);
    expect(decoded).toBe('/Users');
  });

  it('should handle deep nested paths', () => {
    const encoded = 'Users-jane-Documents-Work-Projects-2025-app';
    const decoded = decodeProjectPath(encoded);
    expect(decoded).toBe('/Users/jane/Documents/Work/Projects/2025/app');
  });
});

describe('processAgentFreshness', () => {
  it('should mark agents older than 30 min as stale', () => {
    const now = Date.now();
    const thirtyOneMinutesAgo = new Date(now - 31 * 60 * 1000).toISOString();

    const agents = [
      {
        id: 'agent-1',
        name: 'test-agent',
        status: 'done',
        currentTask: 'Task description',
        startTime: thirtyOneMinutesAgo,
        endTime: thirtyOneMinutesAgo,
        lastActivityTime: thirtyOneMinutesAgo,
        actions: [{ name: 'Read', filePath: '/test.js', timestamp: thirtyOneMinutesAgo }],
        messages: [{ text: 'Test message', timestamp: thirtyOneMinutesAgo }],
        realAgentId: 'real-agent-1'
      }
    ];

    const result = processAgentFreshness(agents);

    expect(result).toHaveLength(1);
    expect(result[0].isStale).toBe(true);
    expect(result[0].status).toBe('done');
    expect(result[0].actions).toHaveLength(0); // Actions cleared for stale agents
    expect(result[0].messages).toHaveLength(0); // Messages cleared for stale agents
  });

  it('should keep recent agents fresh', () => {
    const now = Date.now();
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();

    const agents = [
      {
        id: 'agent-2',
        name: 'recent-agent',
        status: 'done',
        currentTask: 'Recent task',
        startTime: fiveMinutesAgo,
        endTime: fiveMinutesAgo,
        lastActivityTime: fiveMinutesAgo,
        actions: [{ name: 'Edit', filePath: '/recent.js', timestamp: fiveMinutesAgo }],
        messages: [{ text: 'Recent message', timestamp: fiveMinutesAgo }],
        realAgentId: 'real-agent-2'
      }
    ];

    const result = processAgentFreshness(agents);

    expect(result).toHaveLength(1);
    expect(result[0].isStale).toBeUndefined(); // Fresh agents don't have isStale flag
    expect(result[0].status).toBe('done');
    expect(result[0].actions).toHaveLength(1); // Actions preserved for fresh agents
    expect(result[0].messages).toHaveLength(1); // Messages preserved for fresh agents
  });

  it('should mark active agents without recent activity as stale', () => {
    const now = Date.now();
    const thirtyOneMinutesAgo = new Date(now - 31 * 60 * 1000).toISOString();

    const agents = [
      {
        id: 'agent-3',
        name: 'stuck-agent',
        status: 'active', // Still marked as active but no recent activity
        currentTask: 'Stuck task',
        startTime: thirtyOneMinutesAgo,
        lastActivityTime: thirtyOneMinutesAgo,
        actions: [{ name: 'Read', filePath: '/stuck.js', timestamp: thirtyOneMinutesAgo }],
        messages: [],
        realAgentId: 'real-agent-3'
      }
    ];

    const result = processAgentFreshness(agents);

    expect(result).toHaveLength(1);
    expect(result[0].isStale).toBe(true);
    expect(result[0].status).toBe('stale'); // Status changed from active to stale
    expect(result[0].actions).toHaveLength(0);
  });

  it('should keep active agents with recent activity fresh', () => {
    const now = Date.now();
    const twoMinutesAgo = new Date(now - 2 * 60 * 1000).toISOString();

    const agents = [
      {
        id: 'agent-4',
        name: 'active-agent',
        status: 'active',
        currentTask: 'Current task',
        startTime: twoMinutesAgo,
        lastActivityTime: twoMinutesAgo,
        actions: [{ name: 'Write', filePath: '/active.js', timestamp: twoMinutesAgo }],
        messages: [{ text: 'Working on it', timestamp: twoMinutesAgo }],
        realAgentId: 'real-agent-4'
      }
    ];

    const result = processAgentFreshness(agents);

    expect(result).toHaveLength(1);
    expect(result[0].isStale).toBeUndefined();
    expect(result[0].status).toBe('active');
    expect(result[0].actions).toHaveLength(1);
    expect(result[0].messages).toHaveLength(1);
  });

  it('should handle multiple agents with mixed freshness', () => {
    const now = Date.now();
    const recentTime = new Date(now - 5 * 60 * 1000).toISOString();
    const oldTime = new Date(now - 35 * 60 * 1000).toISOString();

    const agents = [
      {
        id: 'agent-fresh',
        name: 'fresh-agent',
        status: 'done',
        currentTask: 'Fresh task',
        startTime: recentTime,
        endTime: recentTime,
        lastActivityTime: recentTime,
        actions: [{ name: 'Read' }],
        messages: [{ text: 'Fresh' }],
        realAgentId: 'real-fresh'
      },
      {
        id: 'agent-stale',
        name: 'stale-agent',
        status: 'done',
        currentTask: 'Old task',
        startTime: oldTime,
        endTime: oldTime,
        lastActivityTime: oldTime,
        actions: [{ name: 'Write' }],
        messages: [{ text: 'Stale' }],
        realAgentId: 'real-stale'
      }
    ];

    const result = processAgentFreshness(agents);

    expect(result).toHaveLength(2);

    // First agent should be fresh
    expect(result[0].isStale).toBeUndefined();
    expect(result[0].actions).toHaveLength(1);
    expect(result[0].messages).toHaveLength(1);

    // Second agent should be stale
    expect(result[1].isStale).toBe(true);
    expect(result[1].actions).toHaveLength(0);
    expect(result[1].messages).toHaveLength(0);
  });
});
