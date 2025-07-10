#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { analyzeSchema } from './analyzer.js';
import { queryDependencies } from './query.js';
import { getCache, hasCache } from './cache.js';
import fs from 'fs-extra';
import path from 'path';

const program = new Command();

program
  .name('fgq')
  .description('Analyze Federated GraphQL schemas for field dependencies')
  .version('1.0.0')
  .addHelpText('after', `
Commands:
  analyze <schema-file> [options]  Analyze a GraphQL schema file
    -f, --force                    Force re-analysis even if cache exists

  query <type> [options]           Query dependencies for a type
    -f, --field <field>            Query specific field only
    -s, --schema <file>            Use specific schema file (default: most recent)
    -j, --json                     Output as JSON

  list                             List all analyzed schemas

  clear                            Clear all cached analyses

Examples:
  $ fgq analyze schema.graphql
  $ fgq analyze schema.graphql --force
  $ fgq query Product
  $ fgq query Item --field watchCount
  $ fgq query Product --json
  $ fgq query Product -s myschema.graphql

For more information, run any command with --help`);

program
  .command('analyze <schema-file>')
  .description('Analyze a FGQL schema file and cache the results')
  .option('-f, --force', 'Force re-analysis even if cache exists')
  .addHelpText('after', `
Examples:
  $ fgq analyze schema.graphql              # Analyze schema and cache results
  $ fgq analyze schema.graphql --force      # Re-analyze even if already cached
  $ fgq analyze ./examples/products.graphql # Analyze schema from examples directory`)
  .action(async (schemaFile, options) => {
    try {
      const absolutePath = path.resolve(schemaFile);
      
      if (!await fs.pathExists(absolutePath)) {
        console.error(chalk.red(`Error: Schema file not found: ${schemaFile}`));
        process.exit(1);
      }

      const cacheExists = await hasCache(absolutePath);
      
      if (cacheExists && !options.force) {
        console.log(chalk.yellow('Schema already analyzed. Use --force to re-analyze.'));
        const cache = await getCache(absolutePath);
        console.log(chalk.green(`\nAnalysis Summary:`));
        console.log(`- Schema file: ${schemaFile}`);
        console.log(`- Total types: ${cache.metadata.totalTypes}`);
        console.log(`- Total dependencies: ${cache.metadata.totalDependencies}`);
        console.log(`- Analyzed at: ${new Date(cache.metadata.analyzedAt).toLocaleString()}`);
        return;
      }

      console.log(chalk.blue(`Analyzing schema: ${schemaFile}...`));
      
      const schemaContent = await fs.readFile(absolutePath, 'utf-8');
      const analysis = await analyzeSchema(schemaContent, absolutePath);
      
      console.log(chalk.green('\n✓ Analysis complete!'));
      console.log(`- Total types analyzed: ${analysis.metadata.totalTypes}`);
      console.log(`- Total dependencies found: ${analysis.metadata.totalDependencies}`);
      console.log(`- Cache saved for quick queries`);
      
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('query <type>')
  .description('Query field dependencies for a specific type')
  .option('-s, --schema <file>', 'Schema file to query (uses most recent if not specified)')
  .option('-f, --field <field>', 'Query dependencies for a specific field')
  .option('-j, --json', 'Output results as JSON')
  .addHelpText('after', `
Examples:
  $ fgq query Product                    # All fields that depend on any Product field
  $ fgq query Item --field watchCount    # Only fields that depend on Item.watchCount
  $ fgq query Product --json             # Output as JSON for scripting
  $ fgq query Product -s myschema.graphql # Query specific schema file`)
  .action(async (type, options) => {
    try {
      const results = await queryDependencies(type, options);
      
      if (results.length === 0) {
        console.log(chalk.yellow(`No dependencies found for type: ${type}`));
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        // Pretty print results
        console.log(chalk.green(`\nFields that depend on ${type}:`));
        results.forEach(dep => {
          // Build the full path for the depended field
          const dependedPath = dep.fieldPath || `${dep.dependedType || dep.dependingType}.${dep.dependedField}`;
          
          console.log(`\n${chalk.cyan('Depending Field:')} ${dep.dependingType}.${dep.dependingField}`);
          console.log(`${chalk.gray('Subgraph:')} ${dep.dependingSubgraph}`);
          console.log(`${chalk.gray('Depends on:')} ${dependedPath}`);
          if (dep.directive) {
            console.log(`${chalk.gray('Via:')} @${dep.directive}`);
          }
        });
      }
      
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all analyzed schemas')
  .action(async () => {
    try {
      const { listCachedSchemas } = await import('./cache.js');
      const schemas = await listCachedSchemas();
      
      if (schemas.length === 0) {
        console.log(chalk.yellow('No analyzed schemas found. Run "fgql-analyzer analyze <schema-file>" first.'));
        return;
      }

      console.log(chalk.green('\nAnalyzed Schemas:'));
      schemas.forEach(schema => {
        console.log(`\n${chalk.cyan(schema.file)}`);
        console.log(`  Analyzed: ${new Date(schema.analyzedAt).toLocaleString()}`);
        console.log(`  Types: ${schema.totalTypes}, Dependencies: ${schema.totalDependencies}`);
      });
      
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('clear')
  .description('Clear all cached analyses')
  .action(async () => {
    try {
      const { clearCache } = await import('./cache.js');
      await clearCache();
      console.log(chalk.green('✓ Cache cleared successfully'));
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);