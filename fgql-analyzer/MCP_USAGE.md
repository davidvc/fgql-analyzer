# FGQL Analyzer MCP Tool Usage

The FGQL Analyzer is now available as an MCP (Model Context Protocol) tool, allowing AI assistants to analyze Federated GraphQL schemas and query dependencies.

## Installation

First, install the dependencies:

```bash
npm install
```

## Running as MCP Server

The FGQL Analyzer MCP server can be started using stdio transport:

```bash
npx fgql-analyzer-mcp
```

Or directly:

```bash
node src/mcp-server.js
```

## Available Tools

### 1. `analyze_schema`
Analyzes a Federated GraphQL schema file and stores the analysis in cache.

**Parameters:**
- `schemaFile` (required): Path to the GraphQL schema file to analyze
- `force` (optional): Force re-analysis even if cache exists (default: false)

**Example:**
```json
{
  "schemaFile": "./examples/products-schema.graphql",
  "force": false
}
```

### 2. `count_dependencies`
Gets the count of dependencies on a particular type or field.

**Parameters:**
- `type` (required): The GraphQL type to query dependencies for
- `field` (optional): Specific field within the type to query
- `schemaFile` (optional): Specific schema file to query (uses most recent if not specified)
- `direct` (optional): Show only direct dependencies (no transitive dependencies), default: false

**Example:**
```json
{
  "type": "Product",
  "field": "id",
  "direct": true
}
```

### 3. `list_dependencies`
Lists all dependencies on a particular type or field with detailed information.

**Parameters:**
- `type` (required): The GraphQL type to query dependencies for
- `field` (optional): Specific field within the type to query
- `schemaFile` (optional): Specific schema file to query (uses most recent if not specified)
- `direct` (optional): Show only direct dependencies (no transitive dependencies), default: false

**Example:**
```json
{
  "type": "Product",
  "direct": true
}
```

**Returns:** A JSON array with dependency details including:
- `dependingField`: The field that has the dependency
- `subgraph`: The subgraph containing the depending field
- `dependsOn`: The field being depended upon
- `via`: The directive creating the dependency (@requires, @provides, @key, @external)

### 4. `list_analyzed_schemas`
Lists all analyzed schema files with their metadata.

**Parameters:** None

**Returns:** A JSON array of analyzed schemas with:
- `file`: Path to the schema file
- `analyzedAt`: Timestamp of analysis
- `totalTypes`: Number of types in the schema
- `totalDependencies`: Number of dependencies found

### 5. `list_types`
Lists all types in the analyzed schema.

**Parameters:**
- `schemaFile` (optional): Specific schema file to query (uses most recent if not specified)

**Returns:** A JSON array of type names

## Integration with AI Assistants

To integrate with Claude Desktop or other MCP-compatible AI assistants, add the following to your MCP configuration:

```json
{
  "mcpServers": {
    "fgql-analyzer": {
      "command": "npx",
      "args": ["fgql-analyzer-mcp"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "fgql-analyzer": {
      "command": "fgql-analyzer-mcp"
    }
  }
}
```

## Example Workflow

1. First, analyze a schema:
   ```
   Tool: analyze_schema
   Args: { "schemaFile": "./examples/products-schema.graphql" }
   ```

2. List all types in the schema:
   ```
   Tool: list_types
   Args: {}
   ```

3. Query dependencies for a specific type:
   ```
   Tool: list_dependencies
   Args: { "type": "Product" }
   ```

4. Count dependencies on a specific field:
   ```
   Tool: count_dependencies
   Args: { "type": "Product", "field": "id" }
   ```

## Cache Location

Analyzed schemas are cached in `~/.fgql-analyzer/cache/` for quick access. The cache persists between sessions, allowing you to query previously analyzed schemas without re-analysis.