A dependency is expressed through a 'requires', 'provides' or 'key' directive.

In each of these directives there is a **selection set** that follows the specification for a 
selection set here: https://spec.graphql.org/draft/#sec-Selection-Sets

If a field is referenced in a selection set, then the selection set has a *dependency* on 
that field.

This means that if that field is removed or renamed or if the type changes, the dependency
will break.

We want to measure the impact of a change like this by understanding:

- What are all the dependencies on a field? (list)
- How many dependencies are there on a field? (count)
- How many dependencies are there by subgraph? (subgraph-count)

To help us better understand each dependency, when we show a dependency in the list query, we 
should include the line number of the dependency. If the dependency is 

Examples of dependencies:

```  savedSearch: SavedSearch! @join__field(graph: FOLLOW, provides: "searchMetaData { searchName imageUrl { height id url width } marketplaceId searchFiltersDisplayString searchRequestParams { key value } searchUrl } motors { subscription { channels }}")```

Here some of the fields the `savedSearch` field depends on are:

- searchMetaData.searchName
- searchMetaData.imageUrl
- searchMetaData.imageUrl.url
- searchMetaData.searchRequestParams
- searchMetaData.searchRequestParams.key
- motors
- motors.subscription

NOTE how any field in the selection set is a dependency, even if it is only part of a path to a leaf field.

## Type dependencies

The dependencies on a type are basically the list of all dependencies of fields *directly owned* 
by that type

For example, in the selection set above, let's say searchMetaData is of type SearchMetaDataV2

This type has six dependencies:
- searchName
- imageUrl
- marketplaceId
- searchFiltersDisplayString
- searchRequestParams
- searchUrl

If the `motors` field has type `EbayMotors`, then through this selection set the `EbayMotors` has 
*one* dependency

- subscription

Again note that the dependency exists if it is included anywhere in a field path in the selection set.

If the *same* field is part of two separate field paths, then that counts as two seaprate dependencies,
and should be listed and counted separately. This is unusual but it can happen if the same field can
be reached through two different paths.

For example:

```  cartCount: Integer! @join__field(graph: FOLLOW, provides: "listing { id parentListing {id}}"```

Here Listing.id has two separate dependencies:

- listing.id
- listing.parentListing.id

They should be listed and counted separately.



