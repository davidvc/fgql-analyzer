import { parse, visit } from 'graphql';
import { saveCache } from './cache.js';

export async function analyzeSchema(schemaContent, filePath) {
  const ast = parse(schemaContent);
  const analysis = {
    types: new Map(),
    dependencies: [],
    metadata: {
      analyzedAt: new Date().toISOString(),
      schemaFile: filePath,
      totalTypes: 0,
      totalDependencies: 0
    }
  };

  // First pass: collect all types and their fields
  visit(ast, {
    ObjectTypeDefinition(node) {
      const typeName = node.name.value;
      const fields = new Map();
      
      node.fields?.forEach(field => {
        fields.set(field.name.value, {
          name: field.name.value,
          directives: field.directives || []
        });
      });
      
      analysis.types.set(typeName, {
        name: typeName,
        fields,
        isExtension: false,
        directives: node.directives || []
      });
    },
    
    ObjectTypeExtension(node) {
      const typeName = node.name.value;
      const existingType = analysis.types.get(typeName) || {
        name: typeName,
        fields: new Map(),
        isExtension: true,
        directives: []
      };
      
      node.fields?.forEach(field => {
        existingType.fields.set(field.name.value, {
          name: field.name.value,
          directives: field.directives || []
        });
      });
      
      analysis.types.set(typeName, existingType);
    }
  });

  // Second pass: analyze dependencies from @requires and @provides directives
  analysis.types.forEach((type, typeName) => {
    // Determine subgraph from schema comments or file path
    const subgraph = extractSubgraph(schemaContent, filePath);
    
    type.fields.forEach((field, fieldName) => {
      field.directives.forEach(directive => {
        const directiveName = directive.name.value;
        
        // Handle Federation v1 style: @requires and @provides as standalone directives
        if (directiveName === 'requires' || directiveName === 'provides') {
          const fieldsArg = directive.arguments?.find(arg => arg.name.value === 'fields');
          if (fieldsArg && fieldsArg.value.value) {
            const fieldSpec = fieldsArg.value.value;
            const dependencies = parseFieldSpec(fieldSpec);
            
            dependencies.forEach(dep => {
              analysis.dependencies.push({
                dependingType: typeName,
                dependingField: fieldName,
                dependingSubgraph: subgraph,
                dependedType: dep.type || typeName, // If no type specified, it's the same type
                dependedField: dep.field,
                directive: directiveName,
                fieldPath: dep.path
              });
            });
          }
        }
        
        // Handle Federation v2 style: @join__field with requires/provides parameters
        if (directiveName === 'join__field') {
          // Look for 'graph' argument to determine subgraph
          const graphArg = directive.arguments?.find(arg => arg.name.value === 'graph');
          const fieldSubgraph = graphArg ? graphArg.value.value : subgraph;
          
          // Look for 'requires' argument
          const requiresArg = directive.arguments?.find(arg => arg.name.value === 'requires');
          if (requiresArg && requiresArg.value.value) {
            const fieldSpec = requiresArg.value.value;
            const dependencies = parseFieldSpec(fieldSpec);
            
            dependencies.forEach(dep => {
              analysis.dependencies.push({
                dependingType: typeName,
                dependingField: fieldName,
                dependingSubgraph: fieldSubgraph,
                dependedType: dep.type || typeName,
                dependedField: dep.field,
                directive: 'requires',
                fieldPath: dep.path
              });
            });
          }
          
          // Look for 'provides' argument
          const providesArg = directive.arguments?.find(arg => arg.name.value === 'provides');
          if (providesArg && providesArg.value.value) {
            const fieldSpec = providesArg.value.value;
            const dependencies = parseFieldSpec(fieldSpec);
            
            dependencies.forEach(dep => {
              analysis.dependencies.push({
                dependingType: typeName,
                dependingField: fieldName,
                dependingSubgraph: fieldSubgraph,
                dependedType: dep.type || typeName,
                dependedField: dep.field,
                directive: 'provides',
                fieldPath: dep.path
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
          fields: Object.fromEntries(value.fields.entries())
        }
      ])
    )
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
    
    if (token === '{') {
      // Entering nested selection
      if (currentPath.length > 0) {
        currentType = currentPath[currentPath.length - 1];
      }
    } else if (token === '}') {
      // Exiting nested selection
      currentPath.pop();
      currentType = currentPath.length > 0 ? currentPath[currentPath.length - 1] : null;
    } else {
      // Field name
      currentPath.push(token);
      dependencies.push({
        field: token,
        type: currentType,
        path: [...currentPath].join('.')
      });
      
      // Check if next token is not '{', meaning this field doesn't have nested selections
      if (i + 1 >= tokens.length || tokens[i + 1] !== '{') {
        currentPath.pop();
      }
    }
  }
  
  return dependencies;
}

function tokenizeFieldSpec(fieldSpec) {
  const tokens = [];
  let current = '';
  
  for (const char of fieldSpec) {
    if (char === '{' || char === '}') {
      if (current.trim()) {
        // Split by spaces but keep '...' as a single token
        const parts = current.trim().split(/\s+/);
        parts.forEach(part => {
          if (part !== '...') {
            tokens.push(part);
          }
        });
        current = '';
      }
      tokens.push(char);
    } else if (char === ' ' || char === '\n' || char === '\t') {
      if (current.trim()) {
        // Skip '...' tokens as they represent field selections we handle elsewhere
        if (current.trim() !== '...') {
          tokens.push(current.trim());
        }
        current = '';
      }
    } else {
      current += char;
    }
  }
  
  if (current.trim()) {
    // Split by spaces but filter out '...'
    const parts = current.trim().split(/\s+/);
    parts.forEach(part => {
      if (part !== '...') {
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
  
  return 'unknown';
}