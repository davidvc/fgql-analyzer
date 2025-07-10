# FGQL-Analyzer Design Changes

## Current Implementation Issues

The current implementation of FGQL-Analyzer has a critical flaw in how it attributes dependencies between GraphQL types. The analyzer incorrectly attributes fields to types based on field path naming conventions rather than following the GraphQL type system.

### Key Issue

When resolving nested field paths in a selection set (e.g., from an `@requires` directive), the code:

1. Doesn't properly track the actual GraphQL type of each field in the path
2. Makes assumptions about which fields belong to which types based on field names
3. Incorrectly attributes dependencies to types that don't actually have those fields

For example, in a selection set like `listing {listing {listingId creationDate}}`:

- The first `listing` field might be on a parent type (e.g., `CartLineItem`)
- This field's type might be `ListingReference` (not `Listing` or `Item`)
- The second `listing` field is on `ListingReference` and might be of type `Listing`
- Fields under this path (like `listingId` and `creationDate`) belong to `Listing`, not `Item`

## Proposed Design Changes

### 1. Enhanced Type Tracking

During schema parsing and AST traversal:

- Properly record the GraphQL type of each field (not just field names)
- Maintain a bidirectional mapping between fields and their parent types
- For nested fields, maintain the proper type lineage

```javascript
// Current field storage
fields.set(field.name.value, {
  name: field.name.value,
  type: extractFieldType(field.type),
  directives: field.directives || [],
});

// Enhanced field storage
fields.set(field.name.value, {
  name: field.name.value,
  type: extractFieldType(field.type),
  rawTypeNode: field.type, // Store the raw type node for accurate type resolution
  isListType: isListType(field.type),
  isNonNullType: isNonNullType(field.type),
  directives: field.directives || [],
});
```

### 2. Type-Aware Field Resolution

When resolving nested field paths:

- Maintain a "type context" that tracks what type we're currently analyzing
- Resolve each field's actual type according to the schema
- Create a proper type resolution chain for nested fields

```javascript
function resolveFieldTypePath(path, startingType, schema) {
  let currentType = startingType;
  const typeResolutionChain = [];

  for (const fieldName of path.split(".")) {
    if (!currentType || !schema.types[currentType]) {
      break;
    }

    const fieldInfo = schema.types[currentType].fields[fieldName];
    if (!fieldInfo) {
      break;
    }

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
```

### 3. Accurate Dependency Attribution

When recording dependencies:

- Use the type resolution chain to properly attribute fields to their actual parent types
- Only record a dependency on a type if the field truly belongs to that type

```javascript
function attributeDependency(dependency, typeResolutionChain) {
  // Only attribute to the proper parent type based on schema
  const lastResolved = typeResolutionChain[typeResolutionChain.length - 1];

  if (lastResolved) {
    dependency.dependedType = lastResolved.parentType;

    // Only consider it a dependency on the queried type if it actually
    // matches the type we're looking for
    return dependency;
  }

  return null; // Could not properly attribute
}
```

### 4. Improved Query Logic

In the `queryDependencies` function:

- Use type-aware filtering instead of path-based assumptions
- Properly check if a dependency is relevant to the queried type based on the schema
- Remove logic that relies on field name matching

```javascript
// Current problematic logic
if (pathSegments.length > 0) {
  const typeInfo = analysis.types[type];
  if (typeInfo && typeInfo.fields && typeInfo.fields[pathSegments[0]]) {
    isDependencyOnQueriedType = true;
  }
}

// Replace with type-aware logic
const typeResolutionChain = resolveFieldTypePath(
  dep.fieldPath,
  dep.dependingType,
  analysis
);
isDependencyOnQueriedType = typeResolutionChain.some(
  (resolution) =>
    resolution.parentType === type || resolution.fieldType === type
);
```

## Implementation Plan

1. Update the schema parsing logic to store more complete type information
2. Implement proper type resolution for nested field paths
3. Modify the dependency recording logic to use type-aware attribution
4. Update the query functions to properly filter dependencies based on actual types
5. Add comprehensive tests to verify correct dependency attribution
