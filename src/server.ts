import { ApolloServer } from "apollo-server-express";
import { ApolloServerPluginDrainHttpServer } from "apollo-server-core";
import express from "express";
import http from "http";
import type { IExecutableSchemaDefinition } from "@graphql-tools/schema";
import { typeDefs, resolvers } from "./graphql/defs";
import { MoviesDataSource } from "./datasources/movies-data-source";
import { AppPlatformType } from "./common/types";

async function startApolloServer(
  typeDefs: IExecutableSchemaDefinition["typeDefs"],
  resolvers: IExecutableSchemaDefinition["resolvers"]
) {
  const app = express();
  const httpServer = http.createServer(app);

  // const APP_PLATFORM = process.env["APP_PLATFORM"] as AppPlatformType;

  // const knexBetterSqlite = knx({
  //   client: "better-sqlite3",
  //   connection: {
  //     filename: getCyberlinkRootDBPath().concat(getCyberlinkRootDBName()),
  //   },
  // })
    
  // const knexPostgres = knx({
  //   client: 'pg',
  //   connection: process.env.DATABASE_URL,
  //   // searchPath: ['knex', 'public'],        
  // }
  // )
  
  // const dbSource = new MoviesDataSource(APP_PLATFORM);



  const server = new ApolloServer({
    typeDefs,
    resolvers,
    csrfPrevention: true,
    cache: "bounded",
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  });
  await server.start();
  server.applyMiddleware({ app });
  await new Promise<void>((resolve) =>
    httpServer.listen({ port: 4000 }, resolve)
  );
  console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`);
}

startApolloServer(typeDefs, resolvers);
