#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { analyzeSchema } from './analyzer.js';
import { queryDependencies, queryAllDependencies, queryTypes } from './query.js';
import { getCache, hasCache, listCachedSchemas } from './cache.js';
import fs from 'fs-extra';
import path from 'path';

class FGQLAnalyzerServer {
  constructor() {
    this.server = new Server(
      {
        name: 'fgql-analyzer',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'analyze_schema',
          description: 'Analyze a Federated GraphQL schema file and store the analysis',
          inputSchema: {
            type: 'object',
            properties: {
              schemaFile: {
                type: 'string',
                description: 'Path to the GraphQL schema file to analyze',
              },
              force: {
                type: 'boolean',
                description: 'Force re-analysis even if cache exists',
                default: false,
              },
            },
            required: ['schemaFile'],
          },
        },
        {
          name: 'count_dependencies',
          description: 'Get the count of dependencies on a particular type or field',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                description: 'The GraphQL type to query dependencies for',
              },
              field: {
                type: 'string',
                description: 'Optional: specific field within the type to query',
              },
              schemaFile: {
                type: 'string',
                description: 'Optional: specific schema file to query (uses most recent if not specified)',
              },
              direct: {
                type: 'boolean',
                description: 'Optional: show only direct dependencies (no transitive dependencies)',
                default: false,
              },
            },
            required: ['type'],
          },
        },
        {
          name: 'list_dependencies',
          description: 'List all dependencies on a particular type or field',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                description: 'The GraphQL type to query dependencies for',
              },
              field: {
                type: 'string',
                description: 'Optional: specific field within the type to query',
              },
              schemaFile: {
                type: 'string',
                description: 'Optional: specific schema file to query (uses most recent if not specified)',
              },
              direct: {
                type: 'boolean',
                description: 'Optional: show only direct dependencies (no transitive dependencies)',
                default: false,
              },
            },
            required: ['type'],
          },
        },
        {
          name: 'list_analyzed_schemas',
          description: 'List all analyzed schema files with their metadata',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'list_types',
          description: 'List all types in the analyzed schema',
          inputSchema: {
            type: 'object',
            properties: {
              schemaFile: {
                type: 'string',
                description: 'Optional: specific schema file to query (uses most recent if not specified)',
              },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'analyze_schema':
          return await this.analyzeSchema(request.params.arguments);
        case 'count_dependencies':
          return await this.countDependencies(request.params.arguments);
        case 'list_dependencies':
          return await this.listDependencies(request.params.arguments);
        case 'list_analyzed_schemas':
          return await this.listAnalyzedSchemas();
        case 'list_types':
          return await this.listTypes(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  async analyzeSchema(args) {
    const { schemaFile, force = false } = args;

    try {
      const absolutePath = path.resolve(schemaFile);
      
      if (!await fs.pathExists(absolutePath)) {
        throw new Error(`Schema file not found: ${schemaFile}`);
      }

      const cacheExists = await hasCache(absolutePath);
      
      if (cacheExists && !force) {
        const cache = await getCache(absolutePath);
        return {
          content: [
            {
              type: 'text',
              text: `Schema already analyzed. Use force=true to re-analyze.\n\nAnalysis Summary:\n- Schema file: ${schemaFile}\n- Total types: ${cache.metadata.totalTypes}\n- Total dependencies: ${cache.metadata.totalDependencies}\n- Analyzed at: ${new Date(cache.metadata.analyzedAt).toLocaleString()}`,
            },
          ],
        };
      }

      const schemaContent = await fs.readFile(absolutePath, 'utf-8');
      const analysis = await analyzeSchema(schemaContent, absolutePath);
      
      return {
        content: [
          {
            type: 'text',
            text: `Analysis complete!\n- Total types analyzed: ${analysis.metadata.totalTypes}\n- Total dependencies found: ${analysis.metadata.totalDependencies}\n- Cache saved for quick queries`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to analyze schema: ${error.message}`
      );
    }
  }

  async countDependencies(args) {
    const { type, field, schemaFile, direct = false } = args;

    try {
      const options = {
        field,
        schema: schemaFile,
        direct,
      };

      const results = await queryDependencies(type, options);
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${results.length} dependencies on ${type}${field ? '.' + field : ''}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to count dependencies: ${error.message}`
      );
    }
  }

  async listDependencies(args) {
    const { type, field, schemaFile, direct = false } = args;

    try {
      const options = {
        field,
        schema: schemaFile,
        direct,
      };

      const results = await queryDependencies(type, options);
      
      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No dependencies found for type: ${type}${field ? '.' + field : ''}`,
            },
          ],
        };
      }

      // Format results as structured text
      const formattedResults = results.map(dep => {
        const dependedPath = dep.fieldPath || `${dep.dependedType || dep.dependingType}.${dep.dependedField}`;
        return {
          dependingField: `${dep.dependingType}.${dep.dependingField}`,
          subgraph: dep.dependingSubgraph,
          dependsOn: dependedPath,
          via: `@${dep.directive}`,
        };
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(formattedResults, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list dependencies: ${error.message}`
      );
    }
  }

  async listAnalyzedSchemas() {
    try {
      const schemas = await listCachedSchemas();
      
      if (schemas.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No analyzed schemas found. Use analyze_schema tool first.',
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(schemas, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list schemas: ${error.message}`
      );
    }
  }

  async listTypes(args) {
    const { schemaFile } = args;

    try {
      const options = {
        schema: schemaFile,
      };

      const types = await queryTypes(options);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(types, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list types: ${error.message}`
      );
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('FGQL Analyzer MCP server running on stdio');
  }
}

const server = new FGQLAnalyzerServer();
server.run().catch(console.error);