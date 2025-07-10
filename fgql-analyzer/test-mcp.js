#!/usr/bin/env node

// Simple test to verify MCP server starts correctly
import { spawn } from 'child_process';
import path from 'path';

console.log('Testing FGQL Analyzer MCP server...\n');

const serverPath = path.join(process.cwd(), 'src', 'mcp-server.js');
const mcpServer = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit']
});

// First send initialize request
const initRequest = JSON.stringify({
  jsonrpc: '2.0',
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    }
  },
  id: 1
}) + '\n';

let messageCount = 0;

mcpServer.stdin.write(initRequest);

// Read response
mcpServer.stdout.on('data', (data) => {
  try {
    const lines = data.toString().split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      const response = JSON.parse(line);
      messageCount++;
      
      if (messageCount === 1) {
        // First response should be initialize result
        console.log('Initialize response received');
        
        // Now send list tools request
        const listToolsRequest = JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: 2
        }) + '\n';
        
        mcpServer.stdin.write(listToolsRequest);
      } else if (response.result && response.result.tools) {
        console.log('\n✅ MCP server is working correctly!');
        console.log(`Found ${response.result.tools.length} tools:`);
        response.result.tools.forEach(tool => {
          console.log(`  - ${tool.name}: ${tool.description}`);
        });
        
        mcpServer.kill();
        process.exit(0);
      }
    });
  } catch (error) {
    console.error('Error parsing response:', error);
    console.error('Raw data:', data.toString());
    mcpServer.kill();
    process.exit(1);
  }
});

mcpServer.on('error', (error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});

// Timeout after 5 seconds
setTimeout(() => {
  console.error('Timeout: No response from MCP server');
  mcpServer.kill();
  process.exit(1);
}, 5000);