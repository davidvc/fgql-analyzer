import { getCache, getMostRecentCache } from './cache.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export async function queryDependencies(type, options = {}) {
  let analysis;
  
  if (options.schema) {
    analysis = await getCache(options.schema);
  } else {
    analysis = await getMostRecentCache();
  }
  
  const dependencies = [];
  const includeSameType = options.includeSameType || false;
  
  // Filter dependencies based on the queried type
  analysis.dependencies.forEach(dep => {
    // When querying a type, we want to find all fields that DEPEND ON any field in that type
    // This means we're looking for dependencies where:
    // 1. The depended type exactly matches our query
    // 2. The field path shows it's a field within the queried type (e.g., "Item.listing" when querying Item)
    
    // Check if this dependency is on a field of the queried type
    let isDependencyOnQueriedType = false;
    
    // Direct match on depended type
    if (dep.dependedType === type) {
      isDependencyOnQueriedType = true;
    }
    
    // Check if the dependency path starts with the queried type
    // The fieldPath might be like "listing.listing.items" but we need to check
    // if this is actually a field starting from the queried type
    if (dep.fieldPath) {
      // For dependencies within the same type
      if (dep.dependedType === null && dep.dependingType === type) {
        isDependencyOnQueriedType = true;
      }
      
      // Check if the first segment of the path matches a field of the queried type
      // We need to check if this field path originates from the queried type
      const pathSegments = dep.fieldPath.split('.');
      if (pathSegments.length > 0) {
        // Check if the queried type has this field
        const typeInfo = analysis.types[type];
        if (typeInfo && typeInfo.fields && typeInfo.fields[pathSegments[0]]) {
          isDependencyOnQueriedType = true;
        }
      }
    }
    
    // If a specific field is requested, filter by the depended field
    const matchesField = !options.field || dep.dependedField === options.field;
    
    // Only include dependencies where some field depends on the queried type
    // AND ensure the dependedType matches the queried type (not just any type with the same field name)
    // By default, exclude dependencies from the same type unless includeSameType is true
    if (isDependencyOnQueriedType && matchesField && (includeSameType || dep.dependingType !== type)) {
      // For field-specific queries, also check that the dependedType matches
      if (options.field && dep.dependedType && dep.dependedType !== type) {
        // Skip this dependency - it's for a different type's field with the same name
        return;
      }
      
      // For direct-only queries, filter out transitive dependencies
      if (options.direct && dep.dependedType !== type) {
        // Skip this dependency - it's not a direct dependency on the queried type
        return;
      }
      
      dependencies.push(dep);
    }
  });
  
  // Filter to keep only leaf dependencies (remove intermediate paths)
  const leafDependencies = filterLeafDependencies(dependencies);
  
  return leafDependencies;
}

function filterLeafDependencies(dependencies) {
  // Group dependencies by a unique key that includes all relevant fields
  const uniqueDeps = new Map();
  
  dependencies.forEach(dep => {
    // Create a unique key for each dependency based on all its properties
    // This will help us deduplicate exact duplicates
    const key = `${dep.dependingType}.${dep.dependingField}:${dep.dependingSubgraph}:${dep.dependedType}:${dep.dependedField}:${dep.directive}`;
    
    if (!uniqueDeps.has(key)) {
      uniqueDeps.set(key, dep);
    } else {
      // If we already have this dependency, keep the one with the most complete path
      const existing = uniqueDeps.get(key);
      if (dep.fieldPath && (!existing.fieldPath || dep.fieldPath.length > existing.fieldPath.length)) {
        uniqueDeps.set(key, dep);
      }
    }
  });
  
  return Array.from(uniqueDeps.values());
}

export function formatDependenciesTable(dependencies) {
  const table = new Table({
    head: [
      chalk.cyan('Depending Type'),
      chalk.cyan('Depending Field'),
      chalk.cyan('Subgraph'),
      chalk.cyan('Depended Type'),
      chalk.cyan('Depended Field'),
      chalk.cyan('Via')
    ],
    style: {
      head: [],
      border: []
    }
  });
  
  dependencies.forEach(dep => {
    table.push([
      dep.dependingType,
      dep.dependingField,
      dep.dependingSubgraph,
      dep.dependedType || dep.dependingType,
      dep.dependedField,
      `@${dep.directive}`
    ]);
  });
  
  return table.toString();
}

export async function queryAllDependencies(options = {}) {
  let analysis;
  
  if (options.schema) {
    analysis = await getCache(options.schema);
  } else {
    analysis = await getMostRecentCache();
  }
  
  return analysis.dependencies;
}

export async function queryTypes(options = {}) {
  let analysis;
  
  if (options.schema) {
    analysis = await getCache(options.schema);
  } else {
    analysis = await getMostRecentCache();
  }
  
  return Object.keys(analysis.types);
}

export async function queryTypeDetails(typeName, options = {}) {
  let analysis;
  
  if (options.schema) {
    analysis = await getCache(options.schema);
  } else {
    analysis = await getMostRecentCache();
  }
  
  const type = analysis.types[typeName];
  if (!type) {
    throw new Error(`Type "${typeName}" not found in schema`);
  }
  
  return {
    ...type,
    dependencies: analysis.dependencies.filter(dep => 
      dep.dependingType === typeName || dep.dependedType === typeName
    )
  };
}