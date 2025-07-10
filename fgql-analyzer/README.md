# FGQL Analyzer

A CLI tool for analyzing Federated GraphQL (FGQL) schema dependencies. It parses schema files to find field dependencies created by `@requires` and `@provides` directives, caching the analysis for fast subsequent queries.

## Features

- **One-time Analysis**: Analyze a schema once and cache the results
- **Fast Queries**: Query dependencies without re-parsing the schema
- **Comprehensive Detection**: Finds all field dependencies including nested field specifications
- **Multiple Schema Support**: Analyze and query multiple schemas
- **Pretty Output**: Formatted tables and colored output, or JSON for scripting

## Installation

```bash
npm install -g fgql-analyzer
```

Or run locally:

```bash
npm install
npm link
```

## Usage

### 1. Analyze a Schema

First, analyze your FGQL schema file to build the dependency cache:

```bash
fgql-analyzer analyze path/to/schema.graphql
```

Options:
- `-f, --force` - Force re-analysis even if cache exists

### 2. Query Dependencies

Query which fields from other types depend on a specific type:

```bash
# Query all fields from other types that depend on any field in the Product type
fgql-analyzer query Product

# Query fields that depend on a specific field
fgql-analyzer query Product --field price

# Output as JSON for scripting
fgql-analyzer query Product --json

# Query a specific schema file
fgql-analyzer query Product --schema path/to/schema.graphql
```

Note: 
- The query excludes dependencies within the same type (e.g., Product fields depending on other Product fields) to focus on cross-type dependencies.
- Only leaf field dependencies are shown (e.g., `listing.amount.original` but not `listing.amount`) to reduce clutter.

### 3. List Analyzed Schemas

See all schemas that have been analyzed:

```bash
fgql-analyzer list
```

### 4. Clear Cache

Remove all cached analyses:

```bash
fgql-analyzer clear
```

## Example

Given this federated schema:

```graphql
# Subgraph: inventory
extend type Product @key(fields: "id") {
  id: ID! @external
  price: Float! @external
  weight: Float @external
  dimensions: Dimensions @external
  
  # Requires price to calculate inventory value
  inventoryValue: Float! @requires(fields: "price")
  
  # Requires weight and dimensions for shipping
  shippingClass: String! @requires(fields: "weight dimensions { length width height }")
}

type Warehouse {
  id: ID!
  # Provides product name when fetching inventory
  inventory: [Product!]! @provides(fields: "name price")
}
```

Running `fgql-analyzer query Product` would show:

```
Fields that depend on Product:

Depending Field: Warehouse.inventory
Subgraph: inventory
Depends on: name
Via: @provides

Depending Field: Warehouse.inventory
Subgraph: inventory
Depends on: price
Via: @provides

Depending Field: InventoryItem.totalValue
Subgraph: inventory
Depends on: product.price
Via: @requires

Depending Field: InventoryItem.estimatedWeight
Subgraph: inventory
Depends on: product.weight
Via: @requires

[... more fields from other types that depend on Product ...]
```

## How It Works

1. **Analysis Phase**: The tool parses the GraphQL schema using the official GraphQL parser, extracting all types, fields, and directives. It identifies dependencies from `@requires` and `@provides` directives, including nested field specifications.

2. **Caching**: Analysis results are stored in `~/.fgql-analyzer/cache/` as JSON files, indexed by schema file path.

3. **Query Phase**: Queries read from the cache without re-parsing, making repeated queries instant.

## Field Specification Syntax

The tool understands GraphQL field specifications in directives:

- Simple fields: `"price weight"`
- Nested fields: `"dimensions { length width height }"`
- Deep nesting: `"order { items { product { id name } } }"`

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run the CLI locally
node src/cli.js analyze examples/inventory-schema.graphql
```

## License

MIT