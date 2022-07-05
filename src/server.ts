import { ApolloServer } from "apollo-server-express";
import { ApolloServerPluginDrainHttpServer } from "apollo-server-core";
import express from "express";
import http from "http";
import type { IExecutableSchemaDefinition } from "@graphql-tools/schema";
import { typeDefs } from "./graphql/defs";
import {
  IDBDataMovieManagerKnexBaseConstr,
  MoviesDataSource,
} from "./datasources/movies-data-source";
import { AppPlatformType } from "./common/types";
import { IDataSources, resolvers } from "./graphql/resolvers";
import knx, { Knex } from "knex";
import { DataSources } from "apollo-server-core/dist/graphqlOptions";

async function startApolloServer(
  typeDefs: IExecutableSchemaDefinition["typeDefs"],
  resolvers: IExecutableSchemaDefinition["resolvers"]
) {
  const app = express();
  const httpServer = http.createServer(app);

  const APP_PLATFORM = process.env["APP_PLATFORM"] as AppPlatformType;

  if (
    (APP_PLATFORM as string) !== "cyberlink" &&
    (APP_PLATFORM as string) !== "posgres"
  ) {
    throw new Error(`Unsupported api platform '${APP_PLATFORM}'`);
  }

  let knex: Knex<Record<string, unknown>, unknown[]>;
  let dBDataMovieManagerKnexConstr: IDBDataMovieManagerKnexBaseConstr;

  if (APP_PLATFORM === "cyberlink") {
    const { getCyberlinkRootDBPath, getCyberlinkRootDBName } = await import(
      "./database/db-path-cyberlink"
    );

    knex = knx({
      client: "better-sqlite3",
      connection: {
        filename: getCyberlinkRootDBPath().concat(getCyberlinkRootDBName()),
      },
    });

    const { DBDataMovieManagerCyberlink } = await import(
      "./database/db-data-moviemanager-cyberlink"
    );

    dBDataMovieManagerKnexConstr = DBDataMovieManagerCyberlink;
  } /*if (APP_PLATFORM === "postgres")*/ else {
    knex = knx({
      client: "pg",
      connection: process.env.DATABASE_URL,
      // searchPath: ['knex', 'public'],
    });

    const { DBDataMovieManagerPostgres } = await import(
      "./database/db-data-moviemanager-postgres"
    );

    dBDataMovieManagerKnexConstr = DBDataMovieManagerPostgres;
  }

  const moviesDataSource = new MoviesDataSource(knex, dBDataMovieManagerKnexConstr);

  await moviesDataSource.init();

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    dataSources: (): DataSources<IDataSources> =>
      ({ moviesDataSource } as { moviesDataSource: MoviesDataSource }),
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
