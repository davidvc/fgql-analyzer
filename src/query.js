import { getCache, getMostRecentCache } from "./cache.js";
import Table from "cli-table3";
import chalk from "chalk";

export async function queryDependencies(type, options = {}) {
  let analysis;

  if (options.schema) {
    analysis = await getCache(options.schema);
  } else {
    analysis = await getMostRecentCache();
  }

  const dependencies = [];
  const includeSameType = options.includeSameType || false;

  // Convert analysis.types from object to Map if it's not already
  const typesMap =
    analysis.types instanceof Map
      ? analysis.types
      : new Map(Object.entries(analysis.types));

  // Filter dependencies based on the queried type
  analysis.dependencies.forEach((dep) => {
    // When querying a type, we want to find all fields that DEPEND ON any field in that type
    // Using the enhanced type resolution logic

    // Check if this dependency is on a field of the queried type
    let isDependencyOnQueriedType = false;

    // Direct match on depended type - this is the most reliable indicator
    if (dep.dependedType === type) {
      isDependencyOnQueriedType = true;
    }

    // Use field path to determine type resolution
    if (dep.fieldPath && !isDependencyOnQueriedType) {
      // Extract path segments and analyze the path
      const pathSegments = dep.fieldPath.split(".");

      // We need to check if any segment in the path:
      // 1. Is a field directly on the queried type, OR
      // 2. Is the "items" or "item" field on some type and it refers to the queried type

      // Get the starting type (the depending type)
      let currentType = dep.dependingType;
      let pathContainsQueriedType = false;

      // Walk through the field path to check type relationships
      for (let i = 0; i < pathSegments.length; i++) {
        const segment = pathSegments[i];

        // Check if we have the current type in our schema
        if (!typesMap.has(currentType)) {
          break;
        }

        const typeInfo = typesMap.get(currentType);

        // Check if this type has the current segment as a field
        if (!typeInfo.fields || !typeInfo.fields[segment]) {
          break;
        }

        // Get the field's type
        const fieldType = typeInfo.fields[segment].type;

        // If this field's type is our queried type, we found a dependency
        if (fieldType === type) {
          pathContainsQueriedType = true;
          break;
        }

        // If this field name is 'item' or 'items' and refers to our queried type
        // (This is a special case pattern that's common in GraphQL schemas)
        if ((segment === "item" || segment === "items") && fieldType === type) {
          pathContainsQueriedType = true;
          break;
        }

        // Update current type to the field's type for next iteration
        currentType = fieldType;
      }

      // If any segment in the path refers to our type, this is a dependency
      if (pathContainsQueriedType) {
        isDependencyOnQueriedType = true;
      }
    }

    // If a specific field is requested, filter by the depended field
    const matchesField = !options.field || dep.dependedField === options.field;

    // Only include dependencies where some field depends on the queried type
    // AND ensure the dependedType matches the queried type (not just any type with the same field name)
    // By default, exclude dependencies from the same type unless includeSameType is true
    if (
      isDependencyOnQueriedType &&
      matchesField &&
      (includeSameType || dep.dependingType !== type)
    ) {
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

// Utility function to check if a field path contains a reference to a specific type
function doesFieldPathContainType(
  fieldPath,
  startingType,
  targetType,
  typesMap
) {
  if (!fieldPath || !startingType || !typesMap.has(startingType)) {
    return false;
  }

  const segments = fieldPath.split(".");
  let currentType = startingType;

  for (const segment of segments) {
    // Check if current type exists in the schema
    if (!typesMap.has(currentType)) {
      return false;
    }

    const typeInfo = typesMap.get(currentType);

    // Check if the field exists on this type
    if (!typeInfo.fields || !typeInfo.fields[segment]) {
      return false;
    }

    // Get the field's type
    const fieldType = typeInfo.fields[segment].type;

    // If this field's type matches our target, we found it
    if (fieldType === targetType) {
      return true;
    }

    // Update current type for next iteration
    currentType = fieldType;
  }

  return false;
}

function filterLeafDependencies(dependencies) {
  // Group dependencies by a unique key that includes all relevant fields
  const uniqueDeps = new Map();

  dependencies.forEach((dep) => {
    // Create a unique key for each dependency based on all its properties
    // This will help us deduplicate exact duplicates
    const key = `${dep.dependingType}.${dep.dependingField}:${dep.dependingSubgraph}:${dep.dependedType}:${dep.dependedField}:${dep.directive}`;

    if (!uniqueDeps.has(key)) {
      uniqueDeps.set(key, dep);
    } else {
      // If we already have this dependency, keep the one with the most complete path
      const existing = uniqueDeps.get(key);
      if (
        dep.fieldPath &&
        (!existing.fieldPath ||
          dep.fieldPath.length > existing.fieldPath.length)
      ) {
        uniqueDeps.set(key, dep);
      }
    }
  });

  return Array.from(uniqueDeps.values());
}

export function formatDependenciesTable(dependencies) {
  const table = new Table({
    head: [
      chalk.cyan("Depending Type"),
      chalk.cyan("Depending Field"),
      chalk.cyan("Subgraph"),
      chalk.cyan("Depended Type"),
      chalk.cyan("Depended Field"),
      chalk.cyan("Via"),
    ],
    style: {
      head: [],
      border: [],
    },
  });

  dependencies.forEach((dep) => {
    table.push([
      dep.dependingType,
      dep.dependingField,
      dep.dependingSubgraph,
      dep.dependedType || dep.dependingType,
      dep.dependedField,
      `@${dep.directive}`,
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
    dependencies: analysis.dependencies.filter(
      (dep) => dep.dependingType === typeName || dep.dependedType === typeName
    ),
  };
}
