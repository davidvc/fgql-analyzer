import { describe, it, before } from "node:test";
import assert from "node:assert";
import fs from "fs-extra";
import path from "path";
import { analyzeSchema } from "../src/analyzer.js";
import { queryDependencies } from "../src/query.js";

describe("Dependency Resolution", async () => {
  let analysis;
  const testSchemaContent = `
    # Simple test schema for dependency resolution testing using Federation v2 syntax
    schema
      @link(url: "https://specs.apollo.dev/link/v1.0")
      @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
    {
      query: Query
    }
    
    directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
    
    directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR
    
    type Query {
      getCart: Cart
      getUser: User
    }
    
    type Cart
      @join__type(graph: CARTGRAPHSVC)
    {
      id: ID!
      items: [CartItem!]!
      owner: User
    }
    
    type CartItem
      @join__type(graph: CARTGRAPHSVC)
    {
      id: ID!
      product: Product!
      quantity: Int!
      listing: ListingReference @join__field(graph: CARTGRAPHSVC, requires: "product { id }")
    }
    
    type ListingReference
      @join__type(graph: LISTINGSVC)
    {
      id: ID!
      listing: Listing @join__field(graph: LISTINGSVC, requires: "id")
    }
    
    type Listing
      @join__type(graph: LISTINGSVC)
    {
      id: ID!
      title: String!
      price: Price!
      items: [Item!]!
      seller: User!
    }
    
    type Item
      @join__type(graph: ITEMSVC)
    {
      id: ID!
      sku: String
      name: String
      description: String
      price: Price
      quantityAvailable: Int
      watchCount: Int
    }
    
    type Product
      @join__type(graph: PRODUCTSVC)
    {
      id: ID!
      name: String!
      description: String
      price: Price
    }
    
    type User
      @join__type(graph: USERSVC)
    {
      id: ID!
      name: String!
      email: String!
    }
    
    type Price
      @join__type(graph: PRICESVC)
    {
      amount: Float!
      currency: String!
    }
  `;

  before(async () => {
    // Create a temporary file for testing
    const tempFilePath = path.join(process.cwd(), "temp-test-schema.graphql");
    await fs.writeFile(tempFilePath, testSchemaContent);

    // Analyze the schema
    analysis = await analyzeSchema(testSchemaContent, tempFilePath);

    // Clean up
    await fs.remove(tempFilePath);
  });

  it("should properly identify direct dependencies on the Item type", async () => {
    const dependencies = await queryDependencies("Item", { direct: true });

    // Debug the dependencies
    console.log("Item dependencies:", JSON.stringify(dependencies, null, 2));

    // Check if the dependencies are correct
    assert.ok(
      dependencies && Array.isArray(dependencies),
      "Dependencies should be an array"
    );
    assert.ok(dependencies.length > 0, "Should have dependencies");

    // There should be no dependency from CartItem.listing on Item
    // as the path doesn't actually contain the Item type
    const cartItemDeps = dependencies.filter(
      (dep) =>
        dep.dependingType === "CartItem" && dep.dependingField === "listing"
    );
    assert.strictEqual(
      cartItemDeps.length,
      0,
      "CartItem.listing should not depend on Item"
    );

    // There should be dependencies from Listing.items on Item
    const listingItemDeps = dependencies.filter(
      (dep) => dep.dependingType === "Listing" && dep.dependingField === "items"
    );
    assert.ok(
      listingItemDeps.length > 0,
      "Listing.items should depend on Item"
    );
  });

  it("should properly identify dependencies on the Product type", async () => {
    const dependencies = await queryDependencies("Product", { direct: true });

    // There should be dependencies from CartItem.product on Product
    const cartItemDeps = dependencies.filter(
      (dep) =>
        dep.dependingType === "CartItem" && dep.dependingField === "product"
    );
    assert.ok(
      cartItemDeps.length > 0,
      "CartItem.product should depend on Product"
    );

    // Check if the @requires directive from CartItem.listing is associated with Product
    // Since it requires "product { id }"
    const cartItemListingDeps = dependencies.filter(
      (dep) =>
        dep.dependingType === "CartItem" &&
        dep.dependingField === "listing" &&
        dep.dependedType === "Product"
    );
    assert.ok(
      cartItemListingDeps.length > 0,
      "CartItem.listing should have a dependency on Product"
    );
  });

  it("should properly identify nested dependencies via field paths", async () => {
    // Test that a dependency like "listing { listing { items } }" is attributed to Listing, not Item
    const listingDeps = await queryDependencies("Listing", { direct: false });

    // There should be a dependency from ListingReference.listing on Listing
    const listingRefDeps = listingDeps.filter(
      (dep) =>
        dep.dependingType === "ListingReference" &&
        dep.dependingField === "listing"
    );
    assert.ok(
      listingRefDeps.length > 0,
      "ListingReference.listing should depend on Listing"
    );

    // CartItem.listing should NOT have a direct dependency on Listing
    // It depends on ListingReference, which in turn depends on Listing
    // These are separate, not transitive dependencies
    const cartItemDeps = listingDeps.filter(
      (dep) =>
        dep.dependingType === "CartItem" && dep.dependingField === "listing"
    );
    assert.strictEqual(
      cartItemDeps.length,
      0,
      "CartItem.listing should NOT have a direct dependency on Listing (it depends on ListingReference)"
    );
  });

  it('should properly handle the "item" and "items" field patterns', async () => {
    const itemDeps = await queryDependencies("Item", { direct: false });

    // There should be a dependency from Listing.items on Item
    const listingItemsDeps = itemDeps.filter(
      (dep) => dep.dependingType === "Listing" && dep.dependingField === "items"
    );
    assert.ok(
      listingItemsDeps.length > 0,
      "Listing.items should depend on Item"
    );

    // But not from CartItem.product as that references Product, not Item
    const cartItemDeps = itemDeps.filter(
      (dep) =>
        dep.dependingType === "CartItem" && dep.dependingField === "product"
    );
    assert.strictEqual(
      cartItemDeps.length,
      0,
      "CartItem.product should not depend on Item"
    );
  });
});
