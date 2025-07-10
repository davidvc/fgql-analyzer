import { test } from 'node:test';
import assert from 'node:assert';
import { analyzeSchema } from '../src/analyzer.js';

test('Interface resolution in requires clauses - should resolve dependencies through interfaces to implementing types', async () => {
    const schema = `
    interface ListingV2 {
      listingId: ID!
    }
    
    type SingleSkuListing implements ListingV2 {
      listingId: ID!
      items: [Item!]!
    }
    
    type VariationListing implements ListingV2 {
      listingId: ID!
      items: [Item!]!
    }
    
    type Item {
      id: ID!
      sellerPrice: SellerPrice
    }
    
    type SellerPrice {
      fixedPrice: Price
      startingBidPrice: Price
    }
    
    type Price {
      original: Money
    }
    
    type Money {
      amount: Float
      currency: String
    }
    
    type ListingReference {
      listingId: ID!
      listing: ListingV2
    }
    
    type RealtimeSellingListingDetails {
      listingReference: ListingReference
      
      # This field has a requires clause that goes through ListingV2 interface to access items
      adsSecondaryDisplayMessages: [String] @join__field(
        graph: ADSCONTENTHUB, 
        requires: "listingReference { listing { items { sellerPrice { fixedPrice { original { amount currency } } startingBidPrice { original { amount currency } } } } } }"
      )
    }
    
    directive @join__field(
      graph: String!
      requires: String
      provides: String
      external: Boolean
    ) repeatable on FIELD_DEFINITION
    `;

    const result = await analyzeSchema(schema, "test-interface.graphql");

    // Find dependencies from adsSecondaryDisplayMessages
    const adsDeps = result.dependencies.filter(
      (d) =>
        d.dependingType === "RealtimeSellingListingDetails" &&
        d.dependingField === "adsSecondaryDisplayMessages"
    );

    // Should have dependencies on Item type fields
    const itemDeps = adsDeps.filter((d) => d.dependedType === "Item");
    
    console.log("All dependencies from adsSecondaryDisplayMessages:");
    adsDeps.forEach(d => {
      console.log(`  ${d.fieldPath} -> ${d.dependedType}.${d.dependedField}`);
    });
    
    console.log("\nItem dependencies:");
    itemDeps.forEach(d => {
      console.log(`  ${d.fieldPath} -> ${d.dependedType}.${d.dependedField}`);
    });

    // We expect to find dependencies on Item.sellerPrice fields
    assert(itemDeps.length > 0, 'Should have dependencies on Item type');
    
    // Check for specific paths
    const hasSellerPriceDep = itemDeps.some(d => d.dependedField === "sellerPrice");
    assert(hasSellerPriceDep, 'Should have dependency on Item.sellerPrice');
});