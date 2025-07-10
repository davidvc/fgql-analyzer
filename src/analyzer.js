import { parse, visit } from "graphql";
import { saveCache } from "./cache.js";

export async function analyzeSchema(schemaContent, filePath) {
  const ast = parse(schemaContent);
  const analysis = {
    types: new Map(),
    interfaces: new Map(), // Track interfaces separately
    implementations: new Map(), // Track which types implement which interfaces
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
    InterfaceTypeDefinition(node) {
      const interfaceName = node.name.value;
      const fields = new Map();

      node.fields?.forEach((field) => {
        fields.set(field.name.value, {
          name: field.name.value,
          type: extractFieldType(field.type),
          rawTypeNode: field.type,
          isListType: isListType(field.type),
          isNonNullType: isNonNullType(field.type),
          directives: field.directives || [],
        });
      });

      analysis.interfaces.set(interfaceName, {
        name: interfaceName,
        fields,
        directives: node.directives || [],
      });

      // Also add to types for compatibility
      analysis.types.set(interfaceName, {
        name: interfaceName,
        fields,
        isInterface: true,
        isExtension: false,
        directives: node.directives || [],
        keyFields: extractKeyFields(node.directives),
      });
    },

    ObjectTypeDefinition(node) {
      const typeName = node.name.value;
      const fields = new Map();
      const interfaces = node.interfaces?.map(i => i.name.value) || [];

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
        isInterface: false,
        isExtension: false,
        interfaces,
        directives: node.directives || [],
        keyFields: extractKeyFields(node.directives),
      });

      // Track interface implementations
      interfaces.forEach(interfaceName => {
        if (!analysis.implementations.has(interfaceName)) {
          analysis.implementations.set(interfaceName, []);
        }
        analysis.implementations.get(interfaceName).push(typeName);
      });
    },

    InterfaceTypeExtension(node) {
      const interfaceName = node.name.value;
      const existingInterface = analysis.interfaces.get(interfaceName) || {
        name: interfaceName,
        fields: new Map(),
        directives: [],
      };

      node.fields?.forEach((field) => {
        existingInterface.fields.set(field.name.value, {
          name: field.name.value,
          type: extractFieldType(field.type),
          rawTypeNode: field.type,
          isListType: isListType(field.type),
          isNonNullType: isNonNullType(field.type),
          directives: field.directives || [],
        });
      });

      existingInterface.directives = [
        ...existingInterface.directives,
        ...(node.directives || []),
      ];

      analysis.interfaces.set(interfaceName, existingInterface);

      // Also update in types
      const existingType = analysis.types.get(interfaceName) || {
        name: interfaceName,
        fields: new Map(),
        isInterface: true,
        isExtension: true,
        directives: [],
        keyFields: [],
      };

      node.fields?.forEach((field) => {
        existingType.fields.set(field.name.value, {
          name: field.name.value,
          type: extractFieldType(field.type),
          rawTypeNode: field.type,
          isListType: isListType(field.type),
          isNonNullType: isNonNullType(field.type),
          directives: field.directives || [],
        });
      });

      existingType.directives = [
        ...existingType.directives,
        ...(node.directives || []),
      ];
      existingType.keyFields = [
        ...existingType.keyFields,
        ...extractKeyFields(node.directives || []),
      ];

      analysis.types.set(interfaceName, existingType);
    },

    ObjectTypeExtension(node) {
      const typeName = node.name.value;
      const interfaces = node.interfaces?.map(i => i.name.value) || [];
      const existingType = analysis.types.get(typeName) || {
        name: typeName,
        fields: new Map(),
        isInterface: false,
        isExtension: true,
        interfaces: [],
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

      // Merge interfaces
      if (interfaces.length > 0) {
        existingType.interfaces = [...(existingType.interfaces || []), ...interfaces];
        
        // Track interface implementations
        interfaces.forEach(interfaceName => {
          if (!analysis.implementations.has(interfaceName)) {
            analysis.implementations.set(interfaceName, []);
          }
          if (!analysis.implementations.get(interfaceName).includes(typeName)) {
            analysis.implementations.get(interfaceName).push(typeName);
          }
        });
      }

      // Merge directives and extract key fields
      existingType.directives = [
        ...existingType.directives,
        ...(node.directives || []),
      ];
      existingType.keyFields = [
        ...existingType.keyFields,
        ...extractKeyFields(node.directives || []),
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
      // First, record the field type dependency
      if (field.type && analysis.types.has(field.type)) {
        // This field references another type in the schema
        analysis.dependencies.push({
          dependingType: typeName,
          dependingField: fieldName,
          dependingSubgraph: "NONE",
          dependedType: field.type,
          dependedField: fieldName, // For field type dependencies, the depended field is the same as the depending field
          directive: "field_type",
          fieldPath: fieldName,
        });
      }

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

            // For @provides, start from field's return type; for @requires, start from current type
            const startType = directiveName === "provides" ? 
              (field.type || typeName) : 
              typeName;

            dependencies.forEach((dep) => {
              const resolutions = resolveTypeAndCheckKeyField(
                dep,
                type,
                startType,
                analysis
              );

              // Handle multiple resolutions (e.g., when traversing through interfaces)
              const resolutionArray = Array.isArray(resolutions) ? resolutions : [resolutions];
              
              resolutionArray.forEach(({ actualType, isKeyField }) => {
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
              const resolutions = resolveTypeAndCheckKeyField(
                dep,
                type,
                typeName,
                analysis
              );

              // Handle multiple resolutions (e.g., when traversing through interfaces)
              const resolutionArray = Array.isArray(resolutions) ? resolutions : [resolutions];
              
              resolutionArray.forEach(({ actualType, isKeyField }) => {
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
            });
          }

          // Look for 'provides' argument
          const providesArg = directive.arguments?.find(
            (arg) => arg.name.value === "provides"
          );
          if (providesArg && providesArg.value.value) {
            const fieldSpec = providesArg.value.value;
            const dependencies = parseFieldSpec(fieldSpec);

            // For @provides, we need to resolve from the field's return type, not the current type
            const fieldInfo = type.fields.get(fieldName);
            const fieldReturnType = fieldInfo?.type;

            dependencies.forEach((dep) => {
              const resolutions = resolveTypeAndCheckKeyField(
                dep,
                type,
                fieldReturnType || typeName, // Start from field's return type for provides
                analysis
              );

              // Handle multiple resolutions (e.g., when traversing through interfaces)
              const resolutionArray = Array.isArray(resolutions) ? resolutions : [resolutions];
              
              resolutionArray.forEach(({ actualType, isKeyField }) => {
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
    interfaces: Object.fromEntries(
      Array.from(analysis.interfaces.entries()).map(([key, value]) => [
        key,
        {
          ...value,
          fields: Object.fromEntries(value.fields.entries()),
        },
      ])
    ),
    implementations: Object.fromEntries(analysis.implementations.entries()),
  };

  // Save to cache
  await saveCache(filePath, serializableAnalysis);

  return serializableAnalysis;
}

function parseFieldSpec(fieldSpec) {
  const dependencies = [];
  const tokens = tokenizeFieldSpec(fieldSpec);
  let currentPath = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === "{") {
      // Entering nested selection - path already has the field
    } else if (token === "}") {
      // Exiting nested selection
      currentPath.pop();
    } else {
      // Field name
      currentPath.push(token);
      dependencies.push({
        field: token,
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
      // If the current type is an interface, we need to find implementations
      // For now, we'll stop here, but mark that we hit an unresolvable type
      break;
    }

    const typeInfo = schema.types.get(currentType);

    // Make sure the field exists on this type
    if (!typeInfo.fields.has(fieldName)) {
      // If this is an interface, check implementations
      // For the purposes of dependency analysis, we'll accept that interface 
      // implementations will have these fields
      if (isInterfaceType(currentType, schema)) {
        // For interfaces, we'll add a placeholder resolution
        // The actual dependency should be on the concrete types that implement this interface
        typeResolutionChain.push({
          fieldName,
          parentType: currentType,
          fieldType: null, // Unknown type - will need to be resolved at runtime
          isInterface: true
        });
        // Can't continue resolving through interface
        break;
      }
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

// Helper to check if a type is an interface
function isInterfaceType(typeName, schema) {
  const typeInfo = schema.types.get(typeName);
  return typeInfo && typeInfo.isInterface === true;
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
  const fieldPath = dep.path;
  const pathParts = fieldPath.split('.');
  const targetField = pathParts[pathParts.length - 1];
  
  // Simple approach: traverse the path to find what type contains the target field
  let currentPosition = typeName;
  
  // Traverse all fields except the last one (which is our target)
  for (let i = 0; i < pathParts.length - 1; i++) {
    const fieldName = pathParts[i];
    const typeInfo = analysis.types.get(currentPosition);
    
    if (!typeInfo) {
      // Type not found - can't continue
      break;
    }
    
    let fieldInfo = typeInfo.fields.get(fieldName);
    
    // If field not found on current type, check if it's an interface
    if (!fieldInfo && typeInfo.isInterface) {
      // Check all implementations to find one that has this field
      const implementations = analysis.implementations.get(currentPosition) || [];
      
      for (const implTypeName of implementations) {
        const implType = analysis.types.get(implTypeName);
        if (implType && implType.fields.has(fieldName)) {
          // Found the field on an implementation
          fieldInfo = implType.fields.get(fieldName);
          // Use the field's type for next iteration
          break;
        }
      }
    }
    
    if (!fieldInfo) {
      // Field not found anywhere - stop here
      break;
    }
    
    // Move to the field's type for next iteration
    currentPosition = fieldInfo.type;
  }
  
  // currentPosition should now be the type that contains our target field
  const parentType = analysis.types.get(currentPosition);
  
  // Verify the target field exists on this type
  if (parentType && !parentType.fields.has(targetField)) {
    // If it's an interface, check implementations
    if (parentType.isInterface) {
      const implementations = analysis.implementations.get(currentPosition) || [];
      const results = [];
      
      for (const implTypeName of implementations) {
        const implType = analysis.types.get(implTypeName);
        if (implType && implType.fields.has(targetField)) {
          const isKeyField = implType.keyFields &&
            implType.keyFields.includes(targetField);
          
          results.push({
            actualType: implTypeName,
            isKeyField: isKeyField || false,
            typeResolutionChain: [],
          });
        }
      }
      
      if (results.length > 0) {
        return results;
      }
    }
  }
  
  // Check if the target field is a key field
  const isKeyField = parentType &&
    parentType.keyFields &&
    parentType.keyFields.includes(targetField);
  
  return {
    actualType: currentPosition,
    isKeyField: isKeyField || false,
    typeResolutionChain: [],
  };
}
