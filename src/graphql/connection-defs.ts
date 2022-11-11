// see: https://relay.dev/graphql/connections.htm

//
// 1. Reserved Types
//   A GraphQL server which conforms to this spec must reserve certain types and type names to support the pagination model of connections. 
//   In particular, this spec creates guidelines for the following types: 
//
//   * Any object whose name ends in “Connection”.
//   * An object named PageInfo.
//
// 2. Connection Types
//   Any type whose name ends in “Connection” is considered by this spec to be a Connection Type. 
//   Connection types must be an “Object” as defined in the “Type System” section of the GraphQL Specification.
//
// 2.1 Fields
//   Connection types must have fields named 
//     edges and pageInfo. 
//   They may have additional fields related to the connection, as the schema designer sees fit.
//
// 2.1.1 Edges
//   A “Connection Type” must contain a field called 
//     edges. 
//   This field must return a list type that wraps an edge type, where the requirements of an edge type are defined 
//   in the “Edge Types” section below.
//
// 2.1.2 PageInfo
//   A “Connection Type” must contain a field called pageInfo. This field must return a non-null PageInfo object, 
//   as defined in the “PageInfo” section below.
//
// 3. Edge Types
//   A type that is returned in list form by a connection type’s edges field is considered by this spec to be an Edge Type. 
//   Edge types must be an “Object” as defined in the “Type System” section of the GraphQL Specification.
//
// 3.1 Fields
//   Edge types must have fields named 
//     node and cursor. 
//   They may have additional fields related to the edge, as the schema designer sees fit.
//
// 3.1.1 Node
//   An “Edge Type” must contain a field called node. This field must return either a Scalar, Enum, Object, Interface, Union, 
//   or a Non-Null wrapper around one of those types. Notably, this field cannot return a list.
//
// 3.1.2 Cursor
//   An “Edge Type” must contain a field called cursor. This field must return a type that serializes as a String; 
//   this may be a String, a Non-Null wrapper around a String, a custom scalar that serializes as a String, 
//   or a Non-Null wrapper around a custom scalar that serializes as a String.
//
//   Whatever type this field returns will be referred to as the cursor type in the rest of this spec.
//
//   The result of this field should be considered opaque by the client, but will be passed back to the server 
//   as described in the “Arguments” section below.
//
// 4. Arguments
//   A field that returns a Connection Type must include forward pagination arguments, backward pagination arguments, or both. 
//   These pagination arguments allow the client to slice the set of edges before it is returned.
//
// 4.1 Forward pagination arguments
//   To enable forward pagination, two arguments are required.
//
//   * first takes a non-negative integer.
//   * after takes the cursor type as described in the cursor field section.
//
//   The server should use those two arguments to modify the edges returned by the connection, returning edges after 
//   the after cursor, and returning at most first edges.
//
//   You should generally pass the cursor of the last edge in the previous page for after.
//
// 4.2 Backward pagination arguments
//   To enable backward pagination, two arguments are required.
//
//   * last takes a non-negative integer.
//   * before takes the cursor type as described in the cursor field section.
//
//   The server should use those two arguments to modify the edges returned by the connection, returning edges 
//   before the before cursor, and returning at most last edges.
//
//   You should generally pass the cursor of the first edge in the next page for before.
//
// 4.3 Edge order
//   You may order the edges however your business logic dictates, and may determine the ordering based upon 
//   additional arguments not covered by this specification. But the ordering must be consistent from page to page, 
//   and importantly, The ordering of edges should be the same when using first/after as when using last/before, 
//   all other arguments being equal. It should not be reversed when using last/before. More formally:
//
//   * When before: cursor is used, the edge closest to cursor must come last in the result edges.
//   * When after: cursor is used, the edge closest to cursor must come first in the result edges.
//
// 4.4 Pagination algorithm
//   To determine what edges to return, the connection evaluates the before and after cursors to filter the edges, 
//   then evaluates first to slice the edges, then last to slice the edges.
//
//   EdgesToReturn(allEdges, before, after, first, last):
//     1) Let edges be the result of calling ApplyCursorsToEdges(allEdges, before, after).
//     2) If first is set:
//       a) If first is less than 0:
//         i) Throw an error.
//       b) If edges has length greater than than first:
//         i) Slice edges to be of length first by removing edges from the end of edges.
//     3) If last is set:
//       a) If last is less than 0:
//         i) Throw an error.
//       b) If edges has length greater than than last:
//         i) Slice edges to be of length last by removing edges from the start of edges.
//     4) Return edges.
//
//   ApplyCursorsToEdges(allEdges, before, after):
//     1) Initialize edges to be allEdges.
//     2) If after is set:
//       a) Let afterEdge be the edge in edges whose cursor is equal to the after argument.
//       b) If afterEdge exists:
//         i) Remove all elements of edges before and including afterEdge.
//     3) If before is set:
//       a) Let beforeEdge be the edge in edges whose cursor is equal to the before argument.
//       b) If beforeEdge exists:
//         i) Remove all elements of edges after and including beforeEdge.
//     4) Return edges.
//
// 5. PageInfo
//   The server must provide a type called PageInfo.
//

export default `
type PageInfo {
  hasPreviousPage: Boolean!
  hasNextPage: Boolean!
  startCursor: String!
  endCursor: String!
}
`;

export const getEdgeType = (edgeTypePrefix: string) => `${edgeTypePrefix}Edge`;

export const buildConnectionEdgeTypes = (connectionTypePrefix: string, edgeTypePrefix: string, nodeType: string) => `
type ${edgeTypePrefix}Edge {
    node: ${nodeType}!
    cursor: String!
    # here can come additional fields
}

type ${connectionTypePrefix}Connection {
    edges: [${getEdgeType(edgeTypePrefix)}]
    nodes: [${nodeType}]
    pageInfo: PageInfo!
    totalRowsCount: BigInt!
}
`;


