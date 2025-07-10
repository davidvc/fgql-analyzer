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
    // AND exclude dependencies within the same type (where depending type equals queried type)
    if (isDependencyOnQueriedType && matchesField && dep.dependingType !== type) {
      dependencies.push(dep);
    }
  });
  
  // Filter to keep only leaf dependencies (remove intermediate paths)
  const leafDependencies = filterLeafDependencies(dependencies);
  
  return leafDependencies;
}

function filterLeafDependencies(dependencies) {
  // Group dependencies by depending field and subgraph to process each group separately
  const grouped = {};
  
  dependencies.forEach(dep => {
    const key = `${dep.dependingType}.${dep.dependingField}:${dep.dependingSubgraph}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(dep);
  });
  
  const leafDependencies = [];
  
  // For each group, keep only the leaf paths
  Object.values(grouped).forEach(group => {
    // Sort by path length to process longer paths first
    const sortedGroup = group.sort((a, b) => {
      const pathA = a.fieldPath || '';
      const pathB = b.fieldPath || '';
      return pathB.length - pathA.length;
    });
    
    // Keep track of which paths are leaf paths
    const leafPaths = new Set();
    
    sortedGroup.forEach(dep => {
      const currentPath = dep.fieldPath || `${dep.dependedType || dep.dependingType}.${dep.dependedField}`;
      
      // Check if this path is a prefix of any existing leaf path
      let isPrefix = false;
      for (const leafPath of leafPaths) {
        if (leafPath.startsWith(currentPath + '.')) {
          isPrefix = true;
          break;
        }
      }
      
      // If it's not a prefix of any leaf path, it's a leaf itself
      if (!isPrefix) {
        leafPaths.add(currentPath);
        leafDependencies.push(dep);
      }
    });
  });
  
  return leafDependencies;
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