import { ApolloServer } from "apollo-server-express";
import { ApolloServerPluginDrainHttpServer } from "apollo-server-core";
import express from "express";
import http from "http";
import type { IExecutableSchemaDefinition } from "@graphql-tools/schema";
import { typeDefs } from "./graphql/defs";
// import {
//   IDBDataMovieManagerKnexBaseConstr,
// } from "./datasources/movies-data-source";
import { AppPlatformType } from "./common/types";
import { resolvers } from "./graphql/resolvers";
import knx, { Knex } from "knex";
import { DataSources } from "apollo-server-core/dist/graphqlOptions";
import { IContext } from "./context";
import { IDBDataMovieManagerKnexBaseConstr, MoviesDataSource } from "./datasources/movies-data-source";

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
      useNullAsDefault: true,
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

  const moviesDataSource = new MoviesDataSource(
    knex,
    dBDataMovieManagerKnexConstr
  );

  const getUser = (token: unknown) => {
    console.log();
  };

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => {
      // get the user token from the headers
      const token = req.headers.authorization || "";

      // try to retrieve a user with the token
      const user = getUser(token);

      // optionally block the user
      // we could also check user roles/permissions here
      // if (!user) throw new AuthorizationError("you must be logged in");

      // add the user to the context
      return { user };
    },
    dataSources: (): DataSources<IContext> => ({ moviesDataSource }),
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
