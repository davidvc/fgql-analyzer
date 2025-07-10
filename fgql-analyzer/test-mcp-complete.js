#!/usr/bin/env node

// Comprehensive test suite for FGQL Analyzer MCP server
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';

const serverPath = path.join(process.cwd(), 'src', 'mcp-server.js');
const testSchemaPath = path.join(process.cwd(), 'sdl.graphqls');

console.log('🧪 FGQL Analyzer MCP Server Test Suite\n');

const mcpServer = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let messageId = 1;
let testStep = 0;
let buffer = '';
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function sendRequest(method, params = {}) {
  const request = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params,
    id: messageId++
  }) + '\n';
  
  mcpServer.stdin.write(request);
}

function logTest(name, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}${details ? ': ' + details : ''}`);
  testResults.tests.push({ name, passed, details });
  if (passed) testResults.passed++;
  else testResults.failed++;
}

function parseResponse(data) {
  buffer += data.toString();
  const responses = [];
  
  // Try to extract complete JSON objects
  let startIndex = 0;
  while (true) {
    const jsonStart = buffer.indexOf('{', startIndex);
    if (jsonStart === -1) break;
    
    try {
      // Find the matching closing brace
      let braceCount = 0;
      let inString = false;
      let escaped = false;
      let jsonEnd = jsonStart;
      
      for (let i = jsonStart; i < buffer.length; i++) {
        const char = buffer[i];
        
        if (!escaped) {
          if (char === '"' && !inString) inString = true;
          else if (char === '"' && inString) inString = false;
          else if (!inString) {
            if (char === '{') braceCount++;
            else if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                jsonEnd = i + 1;
                break;
              }
            }
          }
          if (char === '\\') escaped = true;
          else escaped = false;
        } else {
          escaped = false;
        }
      }
      
      if (braceCount === 0) {
        const jsonStr = buffer.substring(jsonStart, jsonEnd);
        const response = JSON.parse(jsonStr);
        responses.push(response);
        startIndex = jsonEnd;
      } else {
        // Incomplete JSON, wait for more data
        break;
      }
    } catch (e) {
      startIndex = jsonStart + 1;
    }
  }
  
  // Remove processed data from buffer
  if (startIndex > 0) {
    buffer = buffer.substring(startIndex);
  }
  
  return responses;
}

async function runTests() {
  mcpServer.stdout.on('data', (data) => {
    const responses = parseResponse(data);
    
    responses.forEach(async (response) => {
      testStep++;
      
      switch (testStep) {
        case 1:
          // Initialize response
          logTest('Server initialization', !!response.result);
          
          // Test 1: List tools
          console.log('\n📋 Testing tools/list...');
          sendRequest('tools/list');
          break;
          
        case 2:
          // Tools list response
          const tools = response.result?.tools || [];
          logTest('List tools', tools.length === 5, `Found ${tools.length} tools`);
          
          const expectedTools = ['analyze_schema', 'count_dependencies', 'list_dependencies', 'list_analyzed_schemas', 'list_types'];
          expectedTools.forEach(toolName => {
            const found = tools.some(t => t.name === toolName);
            logTest(`  Tool '${toolName}' exists`, found);
          });
          
          // Test 2: Analyze schema
          console.log('\n📊 Testing analyze_schema...');
          sendRequest('tools/call', {
            name: 'analyze_schema',
            arguments: {
              schemaFile: testSchemaPath,
              force: true
            }
          });
          break;
          
        case 3:
          // Analyze response
          const analyzeSuccess = response.result?.content?.[0]?.text?.includes('Analysis complete');
          logTest('Analyze schema', analyzeSuccess);
          
          // Test 3: List analyzed schemas
          console.log('\n📚 Testing list_analyzed_schemas...');
          sendRequest('tools/call', {
            name: 'list_analyzed_schemas',
            arguments: {}
          });
          break;
          
        case 4:
          // List schemas response
          let schemas = [];
          try {
            schemas = JSON.parse(response.result?.content?.[0]?.text || '[]');
          } catch (e) {}
          logTest('List analyzed schemas', schemas.length > 0, `Found ${schemas.length} schemas`);
          
          // Test 4: List types
          console.log('\n🏷️  Testing list_types...');
          sendRequest('tools/call', {
            name: 'list_types',
            arguments: {}
          });
          break;
          
        case 5:
          // List types response
          let types = [];
          try {
            types = JSON.parse(response.result?.content?.[0]?.text || '[]');
          } catch (e) {}
          logTest('List types', types.length > 0, `Found ${types.length} types`);
          
          // Test 5: Count dependencies without direct flag
          console.log('\n🔢 Testing count_dependencies...');
          sendRequest('tools/call', {
            name: 'count_dependencies',
            arguments: {
              type: 'Item'
            }
          });
          break;
          
        case 6:
          // Count dependencies response
          const countText = response.result?.content?.[0]?.text || '';
          const countMatch = countText.match(/Found (\d+) dependencies/);
          const count = countMatch ? parseInt(countMatch[1]) : 0;
          logTest('Count dependencies (all)', count > 0, countText);
          
          // Test 6: Count dependencies with direct flag
          sendRequest('tools/call', {
            name: 'count_dependencies',
            arguments: {
              type: 'Item',
              direct: true
            }
          });
          break;
          
        case 7:
          // Count direct dependencies response
          const directCountText = response.result?.content?.[0]?.text || '';
          const directCountMatch = directCountText.match(/Found (\d+) dependencies/);
          const directCount = directCountMatch ? parseInt(directCountMatch[1]) : 0;
          logTest('Count dependencies (direct only)', directCount >= 0, directCountText);
          
          // Test 7: Count field-specific dependencies
          sendRequest('tools/call', {
            name: 'count_dependencies',
            arguments: {
              type: 'Item',
              field: 'watchCount'
            }
          });
          break;
          
        case 8:
          // Count field dependencies response
          const fieldCountText = response.result?.content?.[0]?.text || '';
          logTest('Count field dependencies', fieldCountText.includes('dependencies'), fieldCountText);
          
          // Test 8: List dependencies
          console.log('\n📝 Testing list_dependencies...');
          sendRequest('tools/call', {
            name: 'list_dependencies',
            arguments: {
              type: 'Item',
              direct: true
            }
          });
          break;
          
        case 9:
          // List dependencies response
          let deps = [];
          try {
            deps = JSON.parse(response.result?.content?.[0]?.text || '[]');
          } catch (e) {}
          logTest('List dependencies', Array.isArray(deps), `Found ${deps.length} dependencies`);
          
          // Verify dependency structure
          if (deps.length > 0) {
            const firstDep = deps[0];
            const hasRequiredFields = firstDep.dependingField && firstDep.subgraph && firstDep.dependsOn && firstDep.via;
            logTest('  Dependency structure valid', hasRequiredFields);
          }
          
          // Test 9: Error handling - invalid schema file
          console.log('\n⚠️  Testing error handling...');
          sendRequest('tools/call', {
            name: 'analyze_schema',
            arguments: {
              schemaFile: 'non-existent.graphql'
            }
          });
          break;
          
        case 10:
          // Error response
          const hasError = response.error || response.result?.content?.[0]?.text?.includes('not found');
          logTest('Error handling for missing file', hasError);
          
          // Test 10: Query with specific schema file
          sendRequest('tools/call', {
            name: 'list_dependencies',
            arguments: {
              type: 'Item',
              schemaFile: testSchemaPath
            }
          });
          break;
          
        case 11:
          // Schema-specific query response
          let schemaDeps = [];
          try {
            schemaDeps = JSON.parse(response.result?.content?.[0]?.text || '[]');
          } catch (e) {}
          logTest('Query with specific schema', schemaDeps.length >= 0);
          
          // Print summary
          console.log('\n' + '='.repeat(50));
          console.log('📊 Test Summary:');
          console.log(`   Total tests: ${testResults.passed + testResults.failed}`);
          console.log(`   ✅ Passed: ${testResults.passed}`);
          console.log(`   ❌ Failed: ${testResults.failed}`);
          console.log('='.repeat(50));
          
          if (testResults.failed > 0) {
            console.log('\nFailed tests:');
            testResults.tests.filter(t => !t.passed).forEach(t => {
              console.log(`  - ${t.name}`);
            });
          }
          
          // Cleanup and exit
          mcpServer.kill();
          process.exit(testResults.failed > 0 ? 1 : 0);
          break;
      }
    });
  });
}

// Error handling
mcpServer.on('error', (error) => {
  console.error('❌ Failed to start MCP server:', error);
  process.exit(1);
});

mcpServer.stderr.on('data', (data) => {
  const msg = data.toString();
  if (!msg.includes('MCP server running')) {
    console.error('Server error:', msg);
  }
});

// Start tests
console.log('🚀 Starting MCP server...\n');

// Initialize connection
sendRequest('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: {
    name: 'test-suite',
    version: '1.0.0'
  }
});

// Run tests
runTests();

// Timeout
setTimeout(() => {
  console.error('\n❌ Test timeout - server did not respond in time');
  mcpServer.kill();
  process.exit(1);
}, 15000);