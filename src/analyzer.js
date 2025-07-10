import { parse, visit } from "graphql";
import { saveCache } from "./cache.js";

export async function analyzeSchema(schemaContent, filePath) {
  const ast = parse(schemaContent);
  const analysis = {
    types: new Map(),
    dependencies: [],
    metadata: {
      analyzedAt: new Date().toISOString(),
      schemaFile: filePath,
      totalTypes: 0,
      totalDependencies: 0,
    },
  };

  // First pass: collect all types and their fields
  visit(ast, {
    ObjectTypeDefinition(node) {
      const typeName = node.name.value;
      const fields = new Map();

      node.fields?.forEach((field) => {
        fields.set(field.name.value, {
          name: field.name.value,
          type: extractFieldType(field.type),
          rawTypeNode: field.type, // Store the raw type node for accurate resolution
          isListType: isListType(field.type),
          isNonNullType: isNonNullType(field.type),
          directives: field.directives || [],
        });
      });

      analysis.types.set(typeName, {
        name: typeName,
        fields,
        isExtension: false,
        directives: node.directives || [],
        keyFields: extractKeyFields(node.directives),
      });
    },

    ObjectTypeExtension(node) {
      const typeName = node.name.value;
      const existingType = analysis.types.get(typeName) || {
        name: typeName,
        fields: new Map(),
        isExtension: true,
        directives: [],
        keyFields: [],
      };

      node.fields?.forEach((field) => {
        existingType.fields.set(field.name.value, {
          name: field.name.value,
          type: extractFieldType(field.type),
          rawTypeNode: field.type, // Store the raw type node for accurate resolution
          isListType: isListType(field.type),
          isNonNullType: isNonNullType(field.type),
          directives: field.directives || [],
        });
      });

      // Merge directives and extract key fields
      existingType.directives = [
        ...existingType.directives,
        ...node.directives,
      ];
      existingType.keyFields = [
        ...existingType.keyFields,
        ...extractKeyFields(node.directives),
      ];

      analysis.types.set(typeName, existingType);
    },
  });

  // Second pass: analyze dependencies from @requires and @provides directives
  analysis.types.forEach((type, typeName) => {
    // Determine subgraph from schema comments or file path
    const subgraph = extractSubgraph(schemaContent, filePath);

    // Add dependencies for @key fields
    // Track key fields as dependencies for entity resolution
    if (type.keyFields.length > 0) {
      type.keyFields.forEach((keyField) => {
        // Check if this field exists in the current type
        const fieldExists = type.fields.has(keyField);

        // For extensions, create dependencies on key fields from the base type
        if (type.isExtension) {
          analysis.dependencies.push({
            dependingType: typeName,
            dependingField: "_entity", // Special field representing entity resolution
            dependingSubgraph: subgraph,
            dependedType: typeName,
            dependedField: keyField,
            directive: "key",
            fieldPath: keyField,
          });
        }

        // If the key field is marked as @external, it's a dependency on another subgraph
        if (fieldExists) {
          const field = type.fields.get(keyField);
          const isExternal = field.directives.some(
            (d) => d.name.value === "external"
          );
          if (isExternal) {
            analysis.dependencies.push({
              dependingType: typeName,
              dependingField: keyField,
              dependingSubgraph: subgraph,
              dependedType: typeName,
              dependedField: keyField,
              directive: "external",
              fieldPath: keyField,
            });
          }
        }
      });
    }

    type.fields.forEach((field, fieldName) => {
      field.directives.forEach((directive) => {
        const directiveName = directive.name.value;

        // Handle Federation v1 style: @requires and @provides as standalone directives
        if (directiveName === "requires" || directiveName === "provides") {
          const fieldsArg = directive.arguments?.find(
            (arg) => arg.name.value === "fields"
          );
          if (fieldsArg && fieldsArg.value.value) {
            const fieldSpec = fieldsArg.value.value;
            const dependencies = parseFieldSpec(fieldSpec);

            dependencies.forEach((dep) => {
              const { actualType, isKeyField } = resolveTypeAndCheckKeyField(
                dep,
                type,
                typeName,
                analysis
              );

              analysis.dependencies.push({
                dependingType: typeName,
                dependingField: fieldName,
                dependingSubgraph: subgraph,
                dependedType: actualType,
                dependedField: dep.field,
                directive: isKeyField ? "key" : directiveName,
                fieldPath: dep.path,
              });
            });
          }
        }

        // Handle Federation v2 style: @join__field with requires/provides parameters
        if (directiveName === "join__field") {
          // Look for 'graph' argument to determine subgraph
          const graphArg = directive.arguments?.find(
            (arg) => arg.name.value === "graph"
          );
          const fieldSubgraph = graphArg ? graphArg.value.value : subgraph;

          // Look for 'requires' argument
          const requiresArg = directive.arguments?.find(
            (arg) => arg.name.value === "requires"
          );
          if (requiresArg && requiresArg.value.value) {
            const fieldSpec = requiresArg.value.value;
            const dependencies = parseFieldSpec(fieldSpec);

            dependencies.forEach((dep) => {
              const { actualType, isKeyField } = resolveTypeAndCheckKeyField(
                dep,
                type,
                typeName,
                analysis
              );

              analysis.dependencies.push({
                dependingType: typeName,
                dependingField: fieldName,
                dependingSubgraph: fieldSubgraph,
                dependedType: actualType,
                dependedField: dep.field,
                directive: isKeyField ? "key" : "requires",
                fieldPath: dep.path,
              });
            });
          }

          // Look for 'provides' argument
          const providesArg = directive.arguments?.find(
            (arg) => arg.name.value === "provides"
          );
          if (providesArg && providesArg.value.value) {
            const fieldSpec = providesArg.value.value;
            const dependencies = parseFieldSpec(fieldSpec);

            dependencies.forEach((dep) => {
              const { actualType, isKeyField } = resolveTypeAndCheckKeyField(
                dep,
                type,
                typeName,
                analysis
              );

              analysis.dependencies.push({
                dependingType: typeName,
                dependingField: fieldName,
                dependingSubgraph: fieldSubgraph,
                dependedType: actualType,
                dependedField: dep.field,
                directive: isKeyField ? "key" : "provides",
                fieldPath: dep.path,
              });
            });
          }
        }
      });
    });
  });

  analysis.metadata.totalTypes = analysis.types.size;
  analysis.metadata.totalDependencies = analysis.dependencies.length;

  // Convert Maps to objects for JSON serialization
  const serializableAnalysis = {
    ...analysis,
    types: Object.fromEntries(
      Array.from(analysis.types.entries()).map(([key, value]) => [
        key,
        {
          ...value,
          fields: Object.fromEntries(value.fields.entries()),
        },
      ])
    ),
  };

  // Save to cache
  await saveCache(filePath, serializableAnalysis);

  return serializableAnalysis;
}

function parseFieldSpec(fieldSpec) {
  const dependencies = [];
  const tokens = tokenizeFieldSpec(fieldSpec);
  let currentPath = [];
  let currentType = null;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === "{") {
      // Entering nested selection
      if (currentPath.length > 0) {
        currentType = currentPath[currentPath.length - 1];
      }
    } else if (token === "}") {
      // Exiting nested selection
      currentPath.pop();
      currentType =
        currentPath.length > 0 ? currentPath[currentPath.length - 1] : null;
    } else {
      // Field name
      currentPath.push(token);
      dependencies.push({
        field: token,
        type: currentType,
        path: [...currentPath].join("."),
      });

      // Check if next token is not '{', meaning this field doesn't have nested selections
      if (i + 1 >= tokens.length || tokens[i + 1] !== "{") {
        currentPath.pop();
      }
    }
  }

  return dependencies;
}

// Resolves the full type path for a field selection path
function resolveFieldTypePath(path, startingType, schema) {
  const typeResolutionChain = [];

  if (!path || !startingType) {
    return typeResolutionChain;
  }

  let currentType = startingType;
  const fieldNames = path.split(".");

  for (let i = 0; i < fieldNames.length; i++) {
    const fieldName = fieldNames[i];

    // Make sure the current type exists in the schema
    if (!currentType || !schema.types.has(currentType)) {
      break;
    }

    const typeInfo = schema.types.get(currentType);

    // Make sure the field exists on this type
    if (!typeInfo.fields.has(fieldName)) {
      break;
    }

    const fieldInfo = typeInfo.fields.get(fieldName);

    typeResolutionChain.push({
      fieldName,
      parentType: currentType,
      fieldType: fieldInfo.type,
    });

    // Update current type for next iteration
    currentType = fieldInfo.type;
  }

  return typeResolutionChain;
}

function tokenizeFieldSpec(fieldSpec) {
  const tokens = [];
  let current = "";

  for (const char of fieldSpec) {
    if (char === "{" || char === "}") {
      if (current.trim()) {
        // Split by spaces but keep '...' as a single token
        const parts = current.trim().split(/\s+/);
        parts.forEach((part) => {
          if (part !== "...") {
            tokens.push(part);
          }
        });
        current = "";
      }
      tokens.push(char);
    } else if (char === " " || char === "\n" || char === "\t") {
      if (current.trim()) {
        // Skip '...' tokens as they represent field selections we handle elsewhere
        if (current.trim() !== "...") {
          tokens.push(current.trim());
        }
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    // Split by spaces but filter out '...'
    const parts = current.trim().split(/\s+/);
    parts.forEach((part) => {
      if (part !== "...") {
        tokens.push(part);
      }
    });
  }

  return tokens;
}

function extractSubgraph(schemaContent, filePath) {
  // Try to extract subgraph name from comments
  const subgraphComment = schemaContent.match(/#\s*Subgraph:\s*(\S+)/i);
  if (subgraphComment) {
    return subgraphComment[1];
  }

  // Try to extract from file path
  const pathParts = filePath.split(/[/\\]/);
  const fileName = pathParts[pathParts.length - 1];

  // Common patterns: products.graphql, products-schema.graphql, etc.
  const match = fileName.match(/^([^.-]+)/);
  if (match) {
    return match[1];
  }

  return "unknown";
}

function extractKeyFields(directives) {
  const keyFields = [];

  if (!directives) return keyFields;

  directives.forEach((directive) => {
    if (directive.name.value === "key") {
      const fieldsArg = directive.arguments?.find(
        (arg) => arg.name.value === "fields"
      );
      if (fieldsArg && fieldsArg.value.value) {
        // Parse the fields string (e.g., "id", "id sku", etc.)
        const fields = fieldsArg.value.value.trim().split(/\s+/);
        keyFields.push(...fields);
      }
    }
  });

  return keyFields;
}

function extractFieldType(typeNode) {
  if (!typeNode) return null;

  // Handle NonNullType (e.g., String!)
  if (typeNode.kind === "NonNullType") {
    return extractFieldType(typeNode.type);
  }

  // Handle ListType (e.g., [String])
  if (typeNode.kind === "ListType") {
    return extractFieldType(typeNode.type);
  }

  // Handle NamedType (e.g., String, Product, etc.)
  if (typeNode.kind === "NamedType") {
    return typeNode.name.value;
  }

  return null;
}

function isListType(typeNode) {
  if (!typeNode) return false;

  if (typeNode.kind === "NonNullType") {
    return isListType(typeNode.type);
  }

  return typeNode.kind === "ListType";
}

function isNonNullType(typeNode) {
  if (!typeNode) return false;

  return typeNode.kind === "NonNullType";
}

function resolveTypeAndCheckKeyField(dep, currentType, typeName, analysis) {
  // Use the more accurate type resolution logic
  const fieldPath = dep.path;
  const typeResolutionChain = resolveFieldTypePath(
    fieldPath,
    typeName,
    analysis
  );

  // If we can resolve the full path, use the last resolved type
  if (typeResolutionChain.length > 0) {
    const lastResolution = typeResolutionChain[typeResolutionChain.length - 1];
    const lastFieldName = dep.field;

    // Check if the last field is a key field on its parent type
    const parentTypeInfo = analysis.types.get(lastResolution.parentType);
    const isKeyField =
      parentTypeInfo &&
      parentTypeInfo.keyFields &&
      parentTypeInfo.keyFields.includes(lastFieldName);

    return {
      actualType: lastResolution.parentType,
      isKeyField: isKeyField || false,
      typeResolutionChain,
    };
  }

  // Fall back to the old logic if we can't resolve the path
  let dependedTypeInfo = currentType;
  let actualType = typeName;

  if (dep.type) {
    // First try exact match (the type might already be resolved)
    dependedTypeInfo = analysis.types.get(dep.type);
    actualType = dep.type;

    // If not found, the dep.type might be a field name
    if (!dependedTypeInfo && dep.type !== typeName) {
      // Look up the field in the current type to find its actual type
      const field = currentType.fields.get(dep.type);
      if (field && field.type) {
        // Found the field, use its declared type
        dependedTypeInfo = analysis.types.get(field.type);
        actualType = field.type;
      } else {
        // Try to find the field in other types (for nested paths)
        for (const [typeName, typeInfo] of analysis.types) {
          if (typeInfo.fields.has(dep.type)) {
            const fieldInfo = typeInfo.fields.get(dep.type);
            if (fieldInfo.type) {
              dependedTypeInfo = analysis.types.get(fieldInfo.type);
              actualType = fieldInfo.type;
              break;
            }
          }
        }
      }

      // Last resort: try capitalization
      if (!dependedTypeInfo) {
        const capitalizedType =
          dep.type.charAt(0).toUpperCase() + dep.type.slice(1);
        dependedTypeInfo = analysis.types.get(capitalizedType);
        if (dependedTypeInfo) {
          actualType = capitalizedType;
        }
      }
    }
  }

  const isKeyField =
    dependedTypeInfo &&
    dependedTypeInfo.keyFields &&
    dependedTypeInfo.keyFields.includes(dep.field);

  return {
    actualType,
    isKeyField: isKeyField || false,
    typeResolutionChain: [], // Empty chain since we couldn't resolve properly
  };
}
