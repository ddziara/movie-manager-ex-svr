// see: https://relay.dev/graphql/connections.htm

export default `
type PageInfo {
  hasPreviousPage: Boolean!
  hasNextPage: Boolean!
  startCursor: String!
  endCursor: String!
}
`;

export const buildCoonectionEdgeTypes = (connectionTypePrefix: string, edgeTypePrefix: string, nodeType: string) => `
type ${edgeTypePrefix}Edge {
    node: ${nodeType}!
    cursor: String!
    # here can come additional fields
}

type ${connectionTypePrefix}Connection {
    edges: [${edgeTypePrefix}Edge]
    pageInfo: PageInfo!
    totalCount: Int!            # extra field to inform about total number of rows
}
`;


