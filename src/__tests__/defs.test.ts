import { ApolloServer } from "apollo-server-express";
import { IPlayItemInfo, IPlayListInfo } from "../graphql/defs";
import { typeDefs, resolvers } from "../graphql/defs";

// dummy data

/*const playItemInfo: IPlayItemInfo[] = [
    {
      id: 1,
      type: 0,
      playlistID: 1,
      mediaTitle: "Scream",
      mediaID: "",
      listOrder: 1,
    },
    {
      id: 2,
      type: 0,
      playlistID: 1,
      mediaTitle: "Friday the 13th",
      mediaID: "",
      listOrder: 2,
    },
    {
      id: 3,
      type: 0,
      playlistID: 2,
      mediaTitle: "Trading Places",
      mediaID: "",
      listOrder: 1,
    },
  ];
  
  const playListInfo: IPlayListInfo[] = [
    {
      id: 1,
      type: 0,
      name: "Horror",
      addDate: "",
      mediaDate: "",
      modifyDate: "",
      place: "",
      description: "",
      visible: 1,
      custom: "",
    },
    {
      id: 2,
      type: 0,
      name: "Comedy",
      addDate: "",
      mediaDate: "",
      modifyDate: "",
      place: "",
      description: "",
      visible: 1,
      custom: "",
    },
  ];  
*/  

describe("Testing GraphQL querries, mutations ans subscriptions", () => {
  test("", () => {
    // // create a test server to test against, using our production typeDefs,
    // // resolvers, and dataSources.
    // const server = new ApolloServer({
    //   typeDefs,
    //   resolvers,
    // });

    // // const result = await testServer.executeOperation({
    // //   query: "query SayHelloWorld($name: String) { hello(name: $name) }",
    // //   variables: { name: "world" },
    // // });

    // // expect(result.errors).toBeUndefined();
    // // expect(result.data?.hello).toBe("Hello world!");
  });
});