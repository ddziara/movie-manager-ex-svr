import { ApolloServer } from "apollo-server-express";
import { typeDefs } from "../graphql/defs";
import {
  IGroupType,
  IMovie,
  IMovieGroup,
  IPositionedMovie,
  resolvers,
} from "../graphql/resolvers";
import knx, { Knex } from "knex";
import type { DBDataMovieManagerCyberlink } from "../database/db-data-moviemanager-cyberlink";
import { DataSources } from "apollo-server-core/dist/graphqlOptions";
import { AppPlatformType } from "../common/types";
import { dateToUTCString } from "../database/utils";
import { IConnection } from "../graphql/connection";
import { GraphQLResponse } from "apollo-server-core";
import { IContext } from "../context";
import type { IDBDataMovieManagerKnexBaseConstr } from "../datasources/movies-data-source";

jest.setTimeout(600000);

const base64RegExpr =
  /^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{3}=|[A-Za-z\d+/]{2}==)?$/;

interface IPlatformParams {
  appPlatform: AppPlatformType;
}

type DBConsts = { USE_FOLDER_COLUMN_IN_MOVIES: boolean };

enum CursorInfoType {
  START_CURSOR,
  END_CURSOR,
  EDGE_CURSOR,
}

interface ICursorInfo {
  type: CursorInfoType;
  resOffset: number;
  edgeIndex: number;
}

interface IPagingInfo {
  first: number;
  afterInfo: ICursorInfo;
  last: number;
  beforeInfo: ICursorInfo;
  offset: number;
  expPrevPage: boolean;
  expNextPage: boolean;
  expData: unknown[][];
}

interface IVariablesObject {
  variables: Record<string, unknown>;
}

interface IVariablesParams {
  variables: string;
  params: string;
}

interface IGraphQLPagingParams extends IVariablesParams {
  variablesObj: IVariablesObject;
}

const APP_PLATFORM = process.env["APP_PLATFORM"] as AppPlatformType;

const _updateNumberParam = (
  param: number,
  paramName: string,
  variables: string,
  params: string,
  variablesObj: IVariablesObject
): IVariablesParams => {
  if (param !== undefined) {
    if (variables) {
      variables += ", ";
    }
    if (params) {
      params += ", ";
    }
    variables += `$${paramName}: Int`;
    params += `${paramName}: $${paramName}`;
    variablesObj.variables[paramName.valueOf()] = param;
  }

  return { variables, params };
};

const _updateSearchCriteria = (
  cursorInfo: ICursorInfo,
  paramName: string,
  variables: string,
  params: string,
  variablesObj: IVariablesObject,
  results: GraphQLResponse[],
  graphQLFieldName: string,
  getConnection?:
    | ((
        result: GraphQLResponse
      ) => IConnection<Partial<Record<string, unknown>>>)
    | undefined
) => {
  if (cursorInfo !== undefined) {
    let cursor;
    const resIndex =
      cursorInfo.resOffset < 0
        ? results.length + cursorInfo.resOffset
        : cursorInfo.resOffset;

    const connection = getConnection
      ? getConnection(results[resIndex])
      : ((results[resIndex].data as Record<string, unknown>)[
          graphQLFieldName
        ] as IConnection<Partial<Record<string, unknown>>>);

    if (cursorInfo.type === CursorInfoType.START_CURSOR) {
      cursor = connection.pageInfo.startCursor;
    } else if (cursorInfo.type === CursorInfoType.END_CURSOR) {
      cursor = connection.pageInfo.endCursor;
    } else if (cursorInfo.type === CursorInfoType.EDGE_CURSOR) {
      const edges = connection.edges;

      if (edges) {
        cursor = edges[cursorInfo.edgeIndex].cursor;
      }
    }

    if (variables) {
      variables += ", ";
    }
    if (params) {
      params += ", ";
    }
    variables += `$${paramName}: String`;
    params += `${paramName}: $${paramName}`;
    variablesObj.variables[paramName.valueOf()] = cursor;
  }

  return { variables, params };
};

const _getGraphQLPagingParams = (
  first: number,
  afterInfo: ICursorInfo,
  last: number,
  beforeInfo: ICursorInfo,
  offset: number,
  results: GraphQLResponse[],
  graphQLFieldName: string,
  getConnection?:
    | ((
        result: GraphQLResponse
      ) => IConnection<Partial<Record<string, unknown>>>)
    | undefined
): IGraphQLPagingParams => {
  let variables = "";
  let params = "";
  const variablesObj: IVariablesObject = {
    variables: {},
  };

  ({ variables, params } = _updateNumberParam(
    first,
    "first",
    variables,
    params,
    variablesObj
  ));
  ({ variables, params } = _updateSearchCriteria(
    afterInfo,
    "after",
    variables,
    params,
    variablesObj,
    results,
    graphQLFieldName,
    getConnection
  ));
  ({ variables, params } = _updateNumberParam(
    last,
    "last",
    variables,
    params,
    variablesObj
  ));
  ({ variables, params } = _updateSearchCriteria(
    beforeInfo,
    "before",
    variables,
    params,
    variablesObj,
    results,
    graphQLFieldName,
    getConnection
  ));
  ({ variables, params } = _updateNumberParam(
    offset,
    "offset",
    variables,
    params,
    variablesObj
  ));

  if (variables) variables = `(${variables})`;
  if (params) params = `(${params})`;

  return { variables, params, variablesObj };
};
// ${"cyberlink"}
// ${"postgres"}
describe.each`
  appPlatform
  ${"cyberlink"}
  ${"postgres"}
`(
  "Testing GraphQL querries, mutations and subscriptions",
  ({ appPlatform }: IPlatformParams) => {
    let testServer: ApolloServer;
    let knex: Knex<Record<string, unknown>, unknown[]>;

    // ignore "cyberlink" tests on "postgres" platform
    if (
      APP_PLATFORM === "postgres" &&
      (appPlatform as AppPlatformType) === "cyberlink"
    ) {
      return;
    }

    const _doMocks = () => {
      jest.doMock("../database/db-const", () => {
        const originalModule = jest.requireActual(
          "../database/db-const"
        ) as DBConsts;

        const om = {
          __esModule: true, // Depends on your setup
          ...originalModule,
        };

        // enable USE_FOLDER_COLUMN_IN_MOVIES to changed to accessor and be mocked
        Object.defineProperty(om, "USE_FOLDER_COLUMN_IN_MOVIES", {
          configurable: true,
          get: function () {
            return originalModule.USE_FOLDER_COLUMN_IN_MOVIES;
          },
        });

        return om;
      });

      if (appPlatform === "cyberlink") {
        // mocks module with function returning memory file name
        jest.doMock("../database/db-path-cyberlink", () => ({
          getCyberlinkPathBase: () => "",
          getCyberlinkRootDBPath: () => "",
          getCyberlinkRootDBName: () => ":memory:",
        }));

        jest.doMock("../database/db-data-moviemanager-cyberlink", () => {
          const orig = jest.requireActual(
            "../database/db-data-moviemanager-cyberlink"
          ) as {
            DBDataMovieManagerCyberlink: typeof DBDataMovieManagerCyberlink;
          };

          return {
            DBDataMovieManagerCyberlink: function (knex: Knex) {
              const inst = new orig.DBDataMovieManagerCyberlink(knex);

              const mockedInst = {
                ...inst,
                ["_createMapDBFile"]: jest
                  .fn()
                  .mockImplementation((): Map<string, string> => {
                    const map = new Map<string, string>();
                    map.set(inst.dbcldb.name, ":memory:");
                    map.set(inst.dbmoviemedia.name, ":memory:");
                    map.set(inst.dbmediaScannerCache.name, ":memory:");
                    map.set(inst.dbplaylist.name, ":memory:");
                    map.set(inst.dbextra.name, ":memory:");
                    return map;
                  }),
              };

              Object.setPrototypeOf(mockedInst, Object.getPrototypeOf(inst));
              return mockedInst;
            },
          };
        });
      }
    };

    const _undoMocks = () => {
      if (appPlatform === "cyberlink") {
        jest.dontMock("../database/db-path-cyberlink");
      }
    };

    const _initData = async () => {
      let dBDataMovieManagerKnexConstr: IDBDataMovieManagerKnexBaseConstr;

      if (appPlatform === "cyberlink") {
        const { getCyberlinkRootDBPath, getCyberlinkRootDBName } = await import(
          "../database/db-path-cyberlink"
        );

        knex = knx({
          client: "better-sqlite3",
          connection: {
            filename: getCyberlinkRootDBPath().concat(getCyberlinkRootDBName()),
          },
          useNullAsDefault: true,
          //          debug: true,
        });

        const { DBDataMovieManagerCyberlink } = await import(
          "../database/db-data-moviemanager-cyberlink"
        );

        dBDataMovieManagerKnexConstr = DBDataMovieManagerCyberlink;
      } else /*if (appPlatform === "postgres")*/ {
        knex = knx({
          client: "pg",
          connection: process.env.TEST_DATABASE_URL,
          // searchPath: ['knex', 'public'],
        });

        const { DBDataMovieManagerPostgres } = await import(
          "../database/db-data-moviemanager-postgres"
        );

        dBDataMovieManagerKnexConstr = DBDataMovieManagerPostgres;
      }

      const { MoviesDataSource } = await import(
        "../datasources/movies-data-source"
      );

      const moviesDataSource = new MoviesDataSource(
        knex,
        dBDataMovieManagerKnexConstr
      );

      await moviesDataSource.init();

      if (appPlatform === "postgres") {
        await moviesDataSource.clearTables();
      }

      testServer = new ApolloServer({
        typeDefs,
        resolvers,
        dataSources: (): DataSources<IContext> => ({ moviesDataSource }),
      });
    };

    const _uninitData = async () => {
      await knex.destroy();
    };

    beforeAll(() => {
      _doMocks();
    });

    afterAll(() => {
      _undoMocks();
    });

    describe("Testing movies queries/mutations/subscriptions", () => {
      const title = `The Perfect Storm (2000)`;
      const folder = `Perfect Storm (2000), The `;
      const mediaFullPath = `C:\\Movies\\${folder}\\The.Perfect.Storm.(2000).mkv`;
      //==
      const description = "This movie is about fishermen and ruthless ocean.";
      const genre = "action, drama";
      const mediaType = 17;
      const length = BigInt("5263748756");
      const mediaDuration = BigInt("576457855");
      const mediaSize = BigInt("7645485895");
      const mediaRating = 9;
      const mediaResume = BigInt("46563764");
      const resolutionX = 1920;
      const resolutionY = 1080;
      const aspectRatioX = 10;
      const aspectRatioY = 12;
      const thumbnailResolutionX = 32;
      const thumbnailResolutionY = 48;
      const playCount = 4;
      const stereoType = "left/right";
      const infoFilePath = "info.dta";
      const isMovieFolder = true;
      const visible = "INVISIBLE";
      const orientation = 1;
      const onlineInfoVisible = 0;
      const dta = new Date(2022, 6, 13, 10, 58, 8, 348);
      const releaseDate = dateToUTCString(dta);
      const addDate = dateToUTCString(dta);
      const modifyDate = dateToUTCString(dta);
      const playDate = dateToUTCString(dta);
      const studio = "IFC";
      const protectedVal = true;
      //==
      const title2 = `Star Wars: Episode IV - New Hope, A (1977)`;
      const folder2 = `Star Wars; Episode IV - A New Hope (1977)`;
      const mediaFullPath2 = `C:\\Movies\\${folder2}\\Star Wars.Episode.IV.A.New.Hope.(1977).mkv`;
      const description2 = "Wars is space, that;s all";
      const genre2 = "action, sci-fi";
      const mediaType2 = 15;
      const length2 = BigInt("5663768578");
      const mediaDuration2 = BigInt("69567546537");
      const mediaSize2 = BigInt("68797657698");
      const mediaRating2 = 10;
      const mediaResume2 = BigInt("157488567");
      const resolutionX2 = 1920;
      const resolutionY2 = 1080;
      const aspectRatioX2 = 10;
      const aspectRatioY2 = 13;
      const thumbnailResolutionX2 = 48;
      const thumbnailResolutionY2 = 32;
      const playCount2 = 13;
      const stereoType2 = "top/bottom";
      const infoFilePath2 = "info-star-wars.dta";
      const isMovieFolder2 = true;
      const visible2 = "INVISIBLE";
      const orientation2 = 1;
      const onlineInfoVisible2 = 0;
      const dta2 = new Date(2022, 6, 13, 8, 58, 8, 348); // 2022-07-13 08:58:08.348
      const releaseDate2 = dateToUTCString(dta2);
      const addDate2 = dateToUTCString(dta2);
      const modifyDate2 = dateToUTCString(dta2);
      const playDate2 = dateToUTCString(dta2);
      const studio2 = "Lucas Film";
      const protectedVal2 = true;
      //==
      let result: GraphQLResponse;
      let result7: GraphQLResponse;

      beforeAll(async () => {
        await _initData();
      });
      afterAll(async () => {
        await _uninitData();
      });
      test("Adding a movie", async () => {
        result = await testServer.executeOperation({
          query:
            "mutation CreateMovie($mediaFullPath: String!, $title: String) { addMovie(mediaFullPath: $mediaFullPath, movieInfo: { title: $title } ) }",
          variables: { mediaFullPath, title },
        });

        expect(result.errors).toBeUndefined();

        if (result.data) {
          expect(result.data.addMovie).toBe(`MOVIE_${mediaFullPath}`);
        }
      });
      test("Getting all movies", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "query GetMovies { movies { edges { node { _id title mediaFullPath } } } }",
        });

        expect(result2.data).toBeTruthy();

        if (result2.data) {
          const moviesConnection = result2.data["movies"] as IConnection<
            Partial<IMovie>
          >;
          expect(moviesConnection.edges).not.toBeNull();

          if (moviesConnection.edges) {
            const row0 = moviesConnection.edges[0].node;
            expect(row0._id).toBe(`MOVIE_${mediaFullPath}`);
            expect(row0.title).toBe(title);
            expect(row0.mediaFullPath).toBe(mediaFullPath);
          }
        }
      });
      test("Getting given movie", async () => {
        const result3 = await testServer.executeOperation({
          query:
            "query GetMovie($_id: ID!) { movie(_id: $_id) { _id title mediaFullPath } }",
          variables: { _id: result.data?.addMovie },
        });

        expect(result3.data).toBeTruthy();

        if (result3.data) {
          const row = result3.data["movie"];
          expect(row["_id"]).toBe(`MOVIE_${mediaFullPath}`);
          expect(row["title"]).toBe(title);
          expect(row["mediaFullPath"]).toBe(mediaFullPath);
        }
      });
      test("Getting non-existing movie", async () => {
        const result4 = await testServer.executeOperation({
          query:
            "query GetMovie($_id: ID!) { movie(_id: $_id) { _id title mediaFullPath } }",
          variables: { _id: "non-existing" },
        });

        expect(result4.data).toBeTruthy();

        if (result4.data) {
          expect(result4.data["movie"]).toBeNull();
        }
      });
      test("Updating given movie", async () => {
        const result5 = await testServer.executeOperation({
          query: `mutation UpdateMovie($_id: ID!, $description: String, $genre: String, $mediaType: Int, $length: String!, $mediaDuration: String!,
        $mediaSize: String!, $mediaRating: Int, $mediaResume: String!, $resolutionX: Int, $resolutionY: Int, $aspectRatioX: Int, $aspectRatioY: Int,
        $thumbnailResolutionX: Int, $thumbnailResolutionY: Int, $playCount: Int, $stereoType: String, 
        $infoFilePath: String, $isMovieFolder: Boolean, $visible: Visibility, $orientation: Int, $onlineInfoVisible: Int,
        $releaseDate: String, $addDate: String, $modifyDate: String, $playDate: String, $studio: String, $protected: Boolean ) { 
        updateMovie(_id: $_id, movieInfo: { 
          description: $description, genre: $genre, mediaType: $mediaType, length: { bigIntStr: $length }, mediaDuration: { bigIntStr: $mediaDuration },
          mediaSize: { bigIntStr: $mediaSize }, mediaRating: $mediaRating, mediaResume: { bigIntStr: $mediaResume },
          resolutionX: $resolutionX, resolutionY: $resolutionY, aspectRatioX: $aspectRatioX, aspectRatioY: $aspectRatioY,
          thumbnailResolutionX: $thumbnailResolutionX, thumbnailResolutionY: $thumbnailResolutionY, playCount: $playCount, stereoType: $stereoType,
          infoFilePath: $infoFilePath, isMovieFolder: $isMovieFolder, visible: $visible, orientation: $orientation, onlineInfoVisible: $onlineInfoVisible,
          releaseDate: $releaseDate, addDate: $addDate, modifyDate: $modifyDate, playDate: $playDate, studio: $studio, protected: $protected
        } 
      ) 
    }`,
          variables: {
            _id: result.data?.addMovie,
            description,
            genre,
            mediaType,
            length: length.toString(),
            mediaDuration: mediaDuration.toString(),
            mediaSize: mediaSize.toString(),
            mediaRating,
            mediaResume: mediaResume.toString(),
            resolutionX,
            resolutionY,
            aspectRatioX,
            aspectRatioY,
            thumbnailResolutionX,
            thumbnailResolutionY,
            playCount,
            stereoType,
            infoFilePath,
            isMovieFolder,
            visible,
            orientation,
            onlineInfoVisible,
            releaseDate,
            addDate,
            modifyDate,
            playDate,
            studio,
            protected: protectedVal,
          },
        });

        expect(result5.errors).toBeUndefined();
      });
      test("Getting given movie", async () => {
        const result6 = await testServer.executeOperation({
          query: `query GetMovie($_id: ID!) { movie(_id: $_id) { description genre mediaType length {bigIntStr} mediaDuration {bigIntStr} 
    mediaSize {bigIntStr} mediaRating mediaResume {bigIntStr} resolutionX resolutionY aspectRatioX aspectRatioY 
    thumbnailResolutionX, thumbnailResolutionY, playCount, stereoType, infoFilePath, isMovieFolder, visible, orientation, onlineInfoVisible,
    releaseDate, addDate, modifyDate, playDate, studio, protected } }`,
          variables: { _id: result.data?.addMovie },
        });

        expect(result6.data).toBeTruthy();

        if (result6.data) {
          const row = result6.data["movie"];
          expect(row["description"]).toBe(description);
          expect(row["genre"]).toBe(genre);
          expect(row["mediaType"]).toBe(mediaType);
          expect(BigInt(row["length"]["bigIntStr"])).toBe(length);
          expect(BigInt(row["mediaDuration"]["bigIntStr"])).toBe(mediaDuration);
          expect(BigInt(row["mediaSize"]["bigIntStr"])).toBe(mediaSize);
          expect(row["mediaRating"]).toBe(mediaRating);
          expect(BigInt(row["mediaResume"]["bigIntStr"])).toBe(mediaResume);
          expect(row["resolutionX"]).toBe(resolutionX);
          expect(row["resolutionY"]).toBe(resolutionY);
          expect(row["aspectRatioX"]).toBe(aspectRatioX);
          expect(row["aspectRatioY"]).toBe(aspectRatioY);
          expect(row["thumbnailResolutionX"]).toBe(thumbnailResolutionX);
          expect(row["thumbnailResolutionY"]).toBe(thumbnailResolutionY);
          expect(row["playCount"]).toBe(playCount);
          expect(row["stereoType"]).toBe(stereoType);
          expect(row["infoFilePath"]).toBe(infoFilePath);
          expect(row["isMovieFolder"]).toBe(isMovieFolder);
          expect(row["visible"]).toBe(visible);
          expect(row["orientation"]).toBe(orientation);
          expect(row["onlineInfoVisible"]).toBe(onlineInfoVisible);
          expect(row["releaseDate"]).toBe(releaseDate);
          expect(row["addDate"]).toBe(addDate);
          expect(row["modifyDate"]).toBe(modifyDate);
          expect(row["playDate"]).toBe(playDate);
          expect(row["studio"]).toBe(studio);
          expect(row["protected"]).toBe(protectedVal);
        }
      });
      test("Adding a movie", async () => {
        result7 = await testServer.executeOperation({
          query: `mutation CreateMovie($mediaFullPath: String!, $title: String, $description: String, $genre: String, $mediaType: Int, $length: String!, $mediaDuration: String!,
        $mediaSize: String!, $mediaRating: Int, $mediaResume: String!, $resolutionX: Int, $resolutionY: Int, $aspectRatioX: Int, $aspectRatioY: Int,
        $thumbnailResolutionX: Int, $thumbnailResolutionY: Int, $playCount: Int, $stereoType: String, 
        $infoFilePath: String, $isMovieFolder: Boolean, $visible: Visibility, $orientation: Int, $onlineInfoVisible: Int,
        $releaseDate: String, $addDate: String, $modifyDate: String, $playDate: String, $studio: String, $protected: Boolean ) { 
        addMovie(mediaFullPath: $mediaFullPath, movieInfo: { 
          title: $title, description: $description, genre: $genre, mediaType: $mediaType, length: { bigIntStr: $length }, mediaDuration: { bigIntStr: $mediaDuration },
          mediaSize: { bigIntStr: $mediaSize }, mediaRating: $mediaRating, mediaResume: { bigIntStr: $mediaResume },
          resolutionX: $resolutionX, resolutionY: $resolutionY, aspectRatioX: $aspectRatioX, aspectRatioY: $aspectRatioY,
          thumbnailResolutionX: $thumbnailResolutionX, thumbnailResolutionY: $thumbnailResolutionY, playCount: $playCount, stereoType: $stereoType,
          infoFilePath: $infoFilePath, isMovieFolder: $isMovieFolder, visible: $visible, orientation: $orientation, onlineInfoVisible: $onlineInfoVisible,
          releaseDate: $releaseDate, addDate: $addDate, modifyDate: $modifyDate, playDate: $playDate, studio: $studio, protected: $protected
        } 
      ) 
    }`,
          variables: {
            mediaFullPath: mediaFullPath2,
            title: title2,
            description: description2,
            genre: genre2,
            mediaType: mediaType2,
            length: length2.toString(),
            mediaDuration: mediaDuration2.toString(),
            mediaSize: mediaSize2.toString(),
            mediaRating: mediaRating2,
            mediaResume: mediaResume2.toString(),
            resolutionX: resolutionX2,
            resolutionY: resolutionY2,
            aspectRatioX: aspectRatioX2,
            aspectRatioY: aspectRatioY2,
            thumbnailResolutionX: thumbnailResolutionX2,
            thumbnailResolutionY: thumbnailResolutionY2,
            playCount: playCount2,
            stereoType: stereoType2,
            infoFilePath: infoFilePath2,
            isMovieFolder: isMovieFolder2,
            visible: visible2,
            orientation: orientation2,
            onlineInfoVisible: onlineInfoVisible2,
            releaseDate: releaseDate2,
            addDate: addDate2,
            modifyDate: modifyDate2,
            playDate: playDate2,
            studio: studio2,
            protected: protectedVal2,
          },
        });

        expect(result7.errors).toBeUndefined();
      });
      test("Getting given movie", async () => {
        const result8 = await testServer.executeOperation({
          query: `query GetMovie($_id: ID!) { movie(_id: $_id) { _id title mediaFullPath description genre mediaType length {bigIntStr} mediaDuration {bigIntStr} 
    mediaSize {bigIntStr} mediaRating mediaResume {bigIntStr} resolutionX resolutionY aspectRatioX aspectRatioY 
    thumbnailResolutionX, thumbnailResolutionY, playCount, stereoType, infoFilePath, isMovieFolder, visible, orientation, onlineInfoVisible,
    releaseDate, addDate, modifyDate, playDate, studio, protected } }`,
          variables: { _id: result7.data?.addMovie },
        });

        expect(result8.data).toBeTruthy();

        if (result8.data) {
          const row = result8.data["movie"];
          expect(row["_id"]).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row["title"]).toBe(title2);
          expect(row["mediaFullPath"]).toBe(mediaFullPath2);
          expect(row["description"]).toBe(description2);
          expect(row["genre"]).toBe(genre2);
          expect(row["mediaType"]).toBe(mediaType2);
          expect(BigInt(row["length"]["bigIntStr"])).toBe(length2);
          expect(BigInt(row["mediaDuration"]["bigIntStr"])).toBe(
            mediaDuration2
          );
          expect(BigInt(row["mediaSize"]["bigIntStr"])).toBe(mediaSize2);
          expect(row["mediaRating"]).toBe(mediaRating2);
          expect(BigInt(row["mediaResume"]["bigIntStr"])).toBe(mediaResume2);
          expect(row["resolutionX"]).toBe(resolutionX2);
          expect(row["resolutionY"]).toBe(resolutionY2);
          expect(row["aspectRatioX"]).toBe(aspectRatioX2);
          expect(row["aspectRatioY"]).toBe(aspectRatioY2);
          expect(row["thumbnailResolutionX"]).toBe(thumbnailResolutionX2);
          expect(row["thumbnailResolutionY"]).toBe(thumbnailResolutionY2);
          expect(row["playCount"]).toBe(playCount2);
          expect(row["stereoType"]).toBe(stereoType2);
          expect(row["infoFilePath"]).toBe(infoFilePath2);
          expect(row["isMovieFolder"]).toBe(isMovieFolder2);
          expect(row["visible"]).toBe(visible2);
          expect(row["orientation"]).toBe(orientation2);
          expect(row["onlineInfoVisible"]).toBe(onlineInfoVisible2);
          expect(row["releaseDate"]).toBe(releaseDate2);
          expect(row["addDate"]).toBe(addDate2);
          expect(row["modifyDate"]).toBe(modifyDate2);
          expect(row["playDate"]).toBe(playDate2);
          expect(row["studio"]).toBe(studio2);
          expect(row["protected"]).toBe(protectedVal2);
        }
      });
      test("Deleting given movie", async () => {
        const result9 = await testServer.executeOperation({
          query: `mutation RemoveMovie($_id: ID!) { 
        deleteMovie(_id: $_id) 
    }`,
          variables: { _id: result.data?.addMovie },
        });

        expect(result9.errors).toBeUndefined();
      });
      test("Getting given movie", async () => {
        const result10 = await testServer.executeOperation({
          query:
            "query GetMovie($_id: ID!) { movie(_id: $_id) { _id title mediaFullPath } }",
          variables: { _id: result.data?.addMovie },
        });

        expect(result10.data).toBeTruthy();

        if (result10.data) {
          const row = result10.data["movie"];
          expect(row).toBe(null);
        }
      });
    });

    describe("Testing movies paging", () => {
      const title = `The Perfect Storm (2000)`;
      const folder = `Perfect Storm (2000), The`;
      const mediaFullPath = `C:\\Movies\\${folder}\\The.Perfect.Storm.(2000).mkv`;
      //==
      const title2 = `Star Wars: Episode VI - Return of the Jedi (1983)`;
      const folder2 = `Star Wars; Episode VI - Return of the Jedi (1983)`;
      const mediaFullPath2 = `C:\\Movies\\${folder2}\\Star.Wars.Episode.VI.Return.of.the.Jedi.(1983).mkv`;
      //==
      const title3 = `Star Wars: Episode I - Phantom Menace, The (1999)`;
      const folder3 = `Star Wars; Episode I - The Phantom Menace (1999)`;
      const mediaFullPath3 = `C:\\Movies\\${folder3}\\Star.Wars.Episode.I.The.Phantom.Menace.(1999).mkv`;
      //==
      const title4 = `Star Wars: Episode II - Attack of the Clones (2002)`;
      const folder4 = `Star Wars; Episode II - Attack of the Clones (2002)`;
      const mediaFullPath4 = `C:\\Movies\\${folder4}\\Star.Wars.Episode.II.Attack.of.the.Clones.(2002).mkv`;
      //==
      const title5 = `Star Wars: Episode III - Revenge of the Sith (2005)`;
      const folder5 = `Star Wars; Episode III - Revenge of the Sith (2005)`;
      const mediaFullPath5 = `C:\\Movies\\${folder5}\\Star.Wars.Episode.III.Revenge.of.the.Sith.(2005).mkv`;
      //==
      const results: GraphQLResponse[] = [];

      beforeAll(async () => {
        await _initData();
      });
      afterAll(async () => {
        await _initData();
      });
      test("Adding a movie", async () => {
        const result = await testServer.executeOperation({
          query:
            "mutation CreateMovie($mediaFullPath: String!, $title: String) { addMovie(mediaFullPath: $mediaFullPath, movieInfo: { title: $title } ) }",
          variables: { title, mediaFullPath },
        });

        expect(result.errors).toBeUndefined();

        if (result.data) {
          expect(result.data.addMovie).toBe(`MOVIE_${mediaFullPath}`);
        }
      });
      test("Adding a movie", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "mutation CreateMovie($mediaFullPath: String!, $title: String) { addMovie(mediaFullPath: $mediaFullPath, movieInfo: { title: $title } ) }",
          variables: { title: title2, mediaFullPath: mediaFullPath2 },
        });

        expect(result2.errors).toBeUndefined();

        if (result2.data) {
          expect(result2.data.addMovie).toBe(`MOVIE_${mediaFullPath2}`);
        }
      });
      test("Adding a movie", async () => {
        const result3 = await testServer.executeOperation({
          query:
            "mutation CreateMovie($mediaFullPath: String!, $title: String) { addMovie(mediaFullPath: $mediaFullPath, movieInfo: { title: $title } ) }",
          variables: { title: title3, mediaFullPath: mediaFullPath3 },
        });

        expect(result3.errors).toBeUndefined();

        if (result3.data) {
          expect(result3.data.addMovie).toBe(`MOVIE_${mediaFullPath3}`);
        }
      });
      test("Adding a movie", async () => {
        const result4 = await testServer.executeOperation({
          query:
            "mutation CreateMovie($mediaFullPath: String!, $title: String) { addMovie(mediaFullPath: $mediaFullPath, movieInfo: { title: $title } ) }",
          variables: { title: title4, mediaFullPath: mediaFullPath4 },
        });

        expect(result4.errors).toBeUndefined();

        if (result4.data) {
          expect(result4.data.addMovie).toBe(`MOVIE_${mediaFullPath4}`);
        }
      });
      test("Adding a movie", async () => {
        const result5 = await testServer.executeOperation({
          query:
            "mutation CreateMovie($mediaFullPath: String!, $title: String) { addMovie(mediaFullPath: $mediaFullPath, movieInfo: { title: $title } ) }",
          variables: { title: title5, mediaFullPath: mediaFullPath5 },
        });

        expect(result5.errors).toBeUndefined();

        if (result5.data) {
          expect(result5.data.addMovie).toBe(`MOVIE_${mediaFullPath5}`);
        }
      });

      describe.each`
        first                                                                                                                                                                                                                                                                     | afterInfo                                                           | last         | beforeInfo                                                          | offset       | expPrevPage | expNextPage | expData
        ${undefined}                                                                                                                                                                                                                                                              | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${false}
        ${[[`MOVIE_${mediaFullPath3}`, title3, mediaFullPath3], [`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2], [`MOVIE_${mediaFullPath}`, title, mediaFullPath]]}
        ${2}                                                                                                                                                                                                                                                                      | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[`MOVIE_${mediaFullPath3}`, title3, mediaFullPath3], [`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4]]}
        ${2}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.END_CURSOR, resOffset: -1 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2]]}
        ${2}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.END_CURSOR, resOffset: -1 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[`MOVIE_${mediaFullPath}`, title, mediaFullPath]]}
        ${2}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.END_CURSOR, resOffset: -1 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[]}
        ${undefined}                                                                                                                                                                                                                                                              | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -2 }}             | ${undefined} | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -1 }}             | ${undefined} | ${false}    | ${true}     | ${[[`MOVIE_${mediaFullPath3}`, title3, mediaFullPath3], [`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -1 }}             | ${undefined} | ${false}    | ${false}    | ${[]}
        ${7}                                                                                                                                                                                                                                                                      | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${false}
        ${[[`MOVIE_${mediaFullPath3}`, title3, mediaFullPath3], [`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2], [`MOVIE_${mediaFullPath}`, title, mediaFullPath]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${1}         | ${true}     | ${false}
        ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2], [`MOVIE_${mediaFullPath}`, title, mediaFullPath]]}
        ${2}                                                                                                                                                                                                                                                                      | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${1}         | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -1 }}             | ${undefined} | ${false}    | ${true}     | ${[[`MOVIE_${mediaFullPath3}`, title3, mediaFullPath3]]}
        ${2}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.END_CURSOR, resOffset: -2 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2], [`MOVIE_${mediaFullPath}`, title, mediaFullPath]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2], [`MOVIE_${mediaFullPath}`, title, mediaFullPath]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${2}         | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${3}         | ${false}    | ${true}     | ${[[`MOVIE_${mediaFullPath3}`, title3, mediaFullPath3], [`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${5}         | ${false}    | ${false}    | ${[]}
        ${3}                                                                                                                                                                                                                                                                      | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[`MOVIE_${mediaFullPath3}`, title3, mediaFullPath3], [`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 1 }} | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2], [`MOVIE_${mediaFullPath}`, title, mediaFullPath]]}
        ${2}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2], [`MOVIE_${mediaFullPath}`, title, mediaFullPath]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2]]}
        ${2}                                                                                                                                                                                                                                                                      | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[`MOVIE_${mediaFullPath3}`, title3, mediaFullPath3], [`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4]]}
        ${2}                                                                                                                                                                                                                                                                      | ${undefined}                                                        | ${3}         | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[`MOVIE_${mediaFullPath3}`, title3, mediaFullPath3], [`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4]]}
        ${2}                                                                                                                                                                                                                                                                      | ${undefined}                                                        | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[`MOVIE_${mediaFullPath3}`, title3, mediaFullPath3], [`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4]]}
        ${5}                                                                                                                                                                                                                                                                      | ${undefined}                                                        | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${false}    | ${[[`MOVIE_${mediaFullPath3}`, title3, mediaFullPath3], [`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2], [`MOVIE_${mediaFullPath}`, title, mediaFullPath]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${5}         | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2], [`MOVIE_${mediaFullPath}`, title, mediaFullPath]]}
        ${2}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5]]}
        ${2}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5]]}
        ${2}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${1}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5]]}
        ${2}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5]]}
        ${3}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2]]}
        ${4}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2]]}
        ${2}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5]]}
        ${3}                                                                                                                                                                                                                                                                      | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5]]}
        ${2}                                                                                                                                                                                                                                                                      | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[`MOVIE_${mediaFullPath3}`, title3, mediaFullPath3], [`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2]]}
        ${undefined}                                                                                                                                                                                                                                                              | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${false}    | ${[]}
        ${4}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2]]}
        ${4}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2]]}
        ${4}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2]]}
        ${3}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2]]}
        ${3}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2]]}
        ${3}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5], [`MOVIE_${mediaFullPath2}`, title2, mediaFullPath2]]}
        ${2}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5]]}
        ${2}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5]]}
        ${2}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath4}`, title4, mediaFullPath4], [`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5]]}
        ${2}                                                                                                                                                                                                                                                                      | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${1}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[`MOVIE_${mediaFullPath5}`, title5, mediaFullPath5]]}
      `(
        "Getting movies (first=$first, afer=$afterInfo, last=$last, before=$beforeInfo, offset=$offset)",
        ({
          first,
          afterInfo,
          last,
          beforeInfo,
          offset,
          expPrevPage,
          expNextPage,
          expData,
        }: IPagingInfo) => {
          test("", async () => {
            const { variables, params, variablesObj } = _getGraphQLPagingParams(
              first,
              afterInfo,
              last,
              beforeInfo,
              offset,
              results,
              "movies"
            );

            const result = await testServer.executeOperation({
              query: `query GetMovies${variables} { movies${params} {
          edges {
            node { _id title mediaFullPath }
            cursor
          }
          pageInfo {
            hasPreviousPage
            hasNextPage
            startCursor
            endCursor
          }
        }
      }`,
              ...variablesObj,
            });

            results.push(result);

            expect(result.data).toBeTruthy();

            if (result.data) {
              const moviesConnection = result.data["movies"] as IConnection<
                Partial<IMovie>
              >;
              expect(moviesConnection.edges).not.toBeNull();

              expect(moviesConnection.pageInfo.hasPreviousPage).toBe(
                expPrevPage
              );
              expect(moviesConnection.pageInfo.hasNextPage).toBe(expNextPage);

              const edges = moviesConnection.edges;

              if (edges) {
                expect(edges.length).toBe(expData.length);
                //===
                for (let i = 0; i < edges.length; i++) {
                  const edge = edges[i];
                  expect(edge.cursor).toMatch(base64RegExpr);
                  const row = edge.node;
                  expect(row._id).toBe(expData[i][0]);
                  expect(row.title).toBe(expData[i][1]);
                  expect(row.mediaFullPath).toBe(expData[i][2]);
                }
                //===
                if (edges.length > 0) {
                  expect(moviesConnection.pageInfo.startCursor).toBe(
                    edges[0].cursor
                  );
                  expect(moviesConnection.pageInfo.endCursor).toBe(
                    edges[edges.length - 1].cursor
                  );
                }
              }
            }
          });
        }
      );

      test("Querying directly about nodes", async () => {
        // getting all movies
        const result = await testServer.executeOperation({
          query: `query GetMovies { movies {
          nodes {
            _id title mediaFullPath
          }
          pageInfo {
            hasPreviousPage
            hasNextPage
            startCursor
            endCursor
          }
        }
      }`,
        });

        expect(result.data).toBeTruthy();

        if (result.data) {
          const moviesConnection = result.data["movies"] as IConnection<
            Partial<IMovie>
          >;
          expect(moviesConnection.nodes).not.toBeNull();

          expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
          expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

          if (moviesConnection.nodes) {
            const node0 = moviesConnection.nodes[0];
            expect(node0._id).toBe(`MOVIE_${mediaFullPath3}`);
            expect(node0.title).toBe(title3);
            expect(node0.mediaFullPath).toBe(mediaFullPath3);
            //===
            const node1 = moviesConnection.nodes[1];
            expect(node1._id).toBe(`MOVIE_${mediaFullPath4}`);
            expect(node1.title).toBe(title4);
            expect(node1.mediaFullPath).toBe(mediaFullPath4);
            //===
            const node2 = moviesConnection.nodes[2];
            expect(node2._id).toBe(`MOVIE_${mediaFullPath5}`);
            expect(node2.title).toBe(title5);
            expect(node2.mediaFullPath).toBe(mediaFullPath5);
            //===
            const node3 = moviesConnection.nodes[3];
            expect(node3._id).toBe(`MOVIE_${mediaFullPath2}`);
            expect(node3.title).toBe(title2);
            expect(node3.mediaFullPath).toBe(mediaFullPath2);
            //===
            const node4 = moviesConnection.nodes[4];
            expect(node4._id).toBe(`MOVIE_${mediaFullPath}`);
            expect(node4.title).toBe(title);
            expect(node4.mediaFullPath).toBe(mediaFullPath);
          }
        }
      });
    });

    describe("Testing movie groups queries/mutations/subscriptions", () => {
      const name = `Horror`;
      //==
      const type = 12;
      const name2 = "Action";
      const dta = new Date(2022, 6, 13, 10, 58, 8, 347);
      const addDate = dateToUTCString(dta);
      const mediaDate = dateToUTCString(dta);
      const modifyDate = dateToUTCString(dta);
      const place = "Some place";
      const description = "Shooting, running, hiding";
      const visible = "INVISIBLE";
      const custom = "some custom text";
      //==
      const type2 = 10;
      const name3 = "Crime";
      const dta2 = new Date(2022, 6, 13, 10, 58, 8, 346);
      const addDate2 = dateToUTCString(dta2);
      const mediaDate2 = dateToUTCString(dta2);
      const modifyDate2 = dateToUTCString(dta2);
      const place2 = "Another place";
      const description2 = "Murders, Robberies and so on";
      const visible2 = "INVISIBLE";
      const custom2 = "yet another some custom text";
      //==
      let result: GraphQLResponse;
      let result7: GraphQLResponse;

      beforeAll(async () => {
        await _initData();
      });
      afterAll(async () => {
        await _uninitData();
      });
      test("Adding a movie group", async () => {
        result = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: { name },
        });

        expect(result.errors).toBeUndefined();

        if (result.data) {
          expect(parseInt(result.data.addMovieGroup)).toBeGreaterThanOrEqual(1);
        }
      });
      test("Getting all movie groups", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "query GetMovieGroups { movieGroups { edges { node { _id name } } } }",
        });

        expect(result2.data).toBeTruthy();

        if (result2.data) {
          const movieGroupsConnection = result2.data[
            "movieGroups"
          ] as IConnection<Partial<IMovieGroup>>;
          expect(movieGroupsConnection.edges).not.toBeNull();

          if (movieGroupsConnection.edges) {
            const row0 = movieGroupsConnection.edges[0].node;

            if (row0._id !== undefined) {
              expect(parseInt(row0._id)).toBeGreaterThanOrEqual(1);
            }

            expect(row0.name).toBe(name);
          }
        }
      });
      test("Getting given movie group", async () => {
        const result3 = await testServer.executeOperation({
          query:
            "query GetMovieGroup($_id: ID!) { movieGroup(_id: $_id) { _id name } }",
          variables: { _id: result.data?.addMovieGroup },
        });

        expect(result3.data).toBeTruthy();

        if (result3.data) {
          const row = result3.data["movieGroup"];
          expect(parseInt(row["_id"])).toBeGreaterThanOrEqual(1);
          expect(row["name"]).toBe(name);
        }
      });
      test("Getting non-existing movie group", async () => {
        const result4 = await testServer.executeOperation({
          query:
            "query GetMovieGroup($_id: ID!) { movieGroup(_id: $_id) { _id name } }",
          variables: { _id: "-1" },
        });

        expect(result4.data).toBeTruthy();

        if (result4.data) {
          expect(result4.data["movieGroup"]).toBeNull();
        }
      });
      test("Updating given movie group", async () => {
        const result5 = await testServer.executeOperation({
          query: `mutation UpdateMovieGroup($_id: ID!, $type: Int, $name: String, $addDate: String, $mediaDate: String, $modifyDate: String, $place: String,
          $description: String, $visible: Visibility, $custom: String) {
            updateMovieGroup(_id: $_id, movieGroupInfo: {
              type: $type, name: $name, addDate: $addDate, mediaDate: $mediaDate, modifyDate: $modifyDate, place: $place, description: $description,
              visible: $visible, custom: $custom
            }
          )
        }`,
          variables: {
            _id: result.data?.addMovieGroup,
            type,
            name: name2,
            addDate,
            mediaDate,
            modifyDate,
            place,
            description,
            visible,
            custom,
          },
        });

        expect(result5.errors).toBeUndefined();
      });
      test("Getting given movie group", async () => {
        //
        const result6 = await testServer.executeOperation({
          query: `query GetMovieGroup($_id: ID!) { movieGroup(_id: $_id) { type name addDate mediaDate modifyDate place description visible custom } }`,
          variables: { _id: result.data?.addMovieGroup },
        });

        expect(result6.data).toBeTruthy();

        if (result6.data) {
          const row = result6.data["movieGroup"];
          expect(row["type"]).toBe(type);
          expect(row["name"]).toBe(name2);
          expect(row["addDate"]).toBe(addDate);
          expect(row["mediaDate"]).toBe(mediaDate);
          expect(row["modifyDate"]).toBe(modifyDate);
          expect(row["place"]).toBe(place);
          expect(row["description"]).toBe(description);
          expect(row["visible"]).toBe(visible);
          expect(row["custom"]).toBe(custom);
        }
      });
      test("Adding a movie group", async () => {
        result7 = await testServer.executeOperation({
          query: `mutation CreateMovieGroup($type: Int, $name: String, $addDate: String, $mediaDate: String, $modifyDate: String, $place: String,
          $description: String, $visible: Visibility, $custom: String) {
            addMovieGroup(movieGroupInfo: {
              type: $type, name: $name, addDate: $addDate, mediaDate: $mediaDate, modifyDate: $modifyDate, place: $place, description: $description,
              visible: $visible, custom: $custom
            }
          )
        }`,
          variables: {
            type: type2,
            name: name3,
            addDate: addDate2,
            mediaDate: mediaDate2,
            modifyDate: modifyDate2,
            place: place2,
            description: description2,
            visible: visible2,
            custom: custom2,
          },
        });

        expect(result7.errors).toBeUndefined();
      });
      test("Getting given movie group", async () => {
        //
        const result8 = await testServer.executeOperation({
          query: `query GetMovieGroup($_id: ID!) { movieGroup(_id: $_id) { _id type name addDate mediaDate modifyDate place description visible custom } }`,
          variables: { _id: result7.data?.addMovieGroup },
        });

        expect(result8.data).toBeTruthy();

        if (result8.data) {
          const row = result8.data["movieGroup"];
          expect(parseInt(row["_id"])).toBeGreaterThanOrEqual(1);
          expect(row["type"]).toBe(type2);
          expect(row["name"]).toBe(name3);
          expect(row["addDate"]).toBe(addDate2);
          expect(row["mediaDate"]).toBe(mediaDate2);
          expect(row["modifyDate"]).toBe(modifyDate2);
          expect(row["place"]).toBe(place2);
          expect(row["description"]).toBe(description2);
          expect(row["visible"]).toBe(visible2);
          expect(row["custom"]).toBe(custom2);
        }
      });
      test("Deleting given movie", async () => {
        const result9 = await testServer.executeOperation({
          query: `mutation RemoveMovieGroup($_id: ID!) {
            deleteMovieGroup(_id: $_id)
        }`,
          variables: { _id: result.data?.addMovieGroup },
        });

        expect(result9.errors).toBeUndefined();
      });
      test("Getting given movie", async () => {
        const result10 = await testServer.executeOperation({
          query:
            "query GetMovieGroup($_id: ID!) { movieGroup(_id: $_id) { _id name } }",
          variables: { _id: result.data?.addMovieGroup },
        });

        expect(result10.data).toBeTruthy();

        if (result10.data) {
          const row = result10.data["movieGroup"];
          expect(row).toBe(null);
        }
      });
    });

    describe("Testing movie groups paging", () => {
      const name = `Horror`;
      //==
      const name2 = `Action`;
      //==
      const name3 = `Drama`;
      //==
      const name4 = `Sci-Fi`;
      //==
      const name5 = `Adventure`;
      //==
      const results: GraphQLResponse[] = [];

      beforeAll(async () => {
        await _initData();
      });
      afterAll(async () => {
        await _initData();
      });
      test("Adding a movie group", async () => {
        const result = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: { name },
        });

        expect(result.errors).toBeUndefined();

        if (result.data) {
          expect(parseInt(result.data.addMovieGroup)).toBeGreaterThanOrEqual(1);
        }
      });
      test("Adding a movie group", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: { name: name2 },
        });

        expect(result2.errors).toBeUndefined();

        if (result2.data) {
          expect(parseInt(result2.data.addMovieGroup)).toBeGreaterThanOrEqual(
            1
          );
        }
      });
      test("Adding a movie group", async () => {
        const result3 = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: { name: name3 },
        });

        expect(result3.errors).toBeUndefined();

        if (result3.data) {
          expect(parseInt(result3.data.addMovieGroup)).toBeGreaterThanOrEqual(
            1
          );
        }
      });
      test("Adding a movie group", async () => {
        const result4 = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: { name: name4 },
        });

        expect(result4.errors).toBeUndefined();

        if (result4.data) {
          expect(parseInt(result4.data.addMovieGroup)).toBeGreaterThanOrEqual(
            1
          );
        }
      });
      test("Adding a movie group", async () => {
        const result5 = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: { name: name5 },
        });

        expect(result5.errors).toBeUndefined();

        if (result5.data) {
          expect(parseInt(result5.data.addMovieGroup)).toBeGreaterThanOrEqual(
            1
          );
        }
      });

      describe.each`
        first        | afterInfo                                                           | last         | beforeInfo                                                          | offset       | expPrevPage | expNextPage | expData
        ${undefined} | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[[name2], [name5], [name3], [name], [name4]]}
        ${2}         | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[name2], [name5]]}
        ${2}         | ${{ type: CursorInfoType.END_CURSOR, resOffset: -1 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[name3], [name]]}
        ${2}         | ${{ type: CursorInfoType.END_CURSOR, resOffset: -1 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[name4]]}
        ${2}         | ${{ type: CursorInfoType.END_CURSOR, resOffset: -1 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -2 }}             | ${undefined} | ${true}     | ${true}     | ${[[name3], [name]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -1 }}             | ${undefined} | ${false}    | ${true}     | ${[[name2], [name5]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -1 }}             | ${undefined} | ${false}    | ${false}    | ${[]}
        ${7}         | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[[name2], [name5], [name3], [name], [name4]]}
        ${undefined} | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${1}         | ${true}     | ${false}    | ${[[name5], [name3], [name], [name4]]}
        ${2}         | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${1}         | ${true}     | ${true}     | ${[[name5], [name3]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -1 }}             | ${undefined} | ${false}    | ${true}     | ${[[name2]]}
        ${2}         | ${{ type: CursorInfoType.END_CURSOR, resOffset: -2 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[name], [name4]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[name], [name4]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${2}         | ${true}     | ${true}     | ${[[name5], [name3]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${3}         | ${false}    | ${true}     | ${[[name2], [name5]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${4}         | ${false}    | ${true}     | ${[[name2]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${5}         | ${false}    | ${false}    | ${[]}
        ${3}         | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[name2], [name5], [name3]]}
        ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 1 }} | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[name3], [name], [name4]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[name5], [name3]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[name], [name4]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[name3], [name]]}
        ${2}         | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[name2], [name5]]}
        ${2}         | ${undefined}                                                        | ${1}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[name5]]}
        ${2}         | ${undefined}                                                        | ${3}         | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[name2], [name5]]}
        ${2}         | ${undefined}                                                        | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[name2], [name5]]}
        ${5}         | ${undefined}                                                        | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${false}    | ${[[name2], [name5], [name3], [name]]}
        ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[name], [name4]]}
        ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${5}         | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[[name5], [name3], [name], [name4]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[name5], [name3]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[name5], [name3]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${1}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[name3]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[name5], [name3]]}
        ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[name5], [name3], [name]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${true}     | ${true}     | ${[[name5], [name3]]}
        ${3}         | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[name5], [name3]]}
        ${2}         | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[name2], [name5]]}
        ${1}         | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[name2]]}
        ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[name3], [name]]}
        ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[name5], [name3], [name]]}
        ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[name5], [name3], [name]]}
        ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${false}    | ${[]}
        ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[name5], [name3], [name]]}
        ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[name5], [name3], [name]]}
        ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[name3], [name]]}
        ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[name5], [name3], [name]]}
        ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[name5], [name3], [name]]}
        ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[name3], [name]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[name5], [name3]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[name5], [name3]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${1}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[name3]]}
      `(
        "Getting movie groups (first=$first, afer=$afterInfo, last=$last, before=$beforeInfo, offset=$offset)",
        ({
          first,
          afterInfo,
          last,
          beforeInfo,
          offset,
          expPrevPage,
          expNextPage,
          expData,
        }: IPagingInfo) => {
          test("", async () => {
            const { variables, params, variablesObj } = _getGraphQLPagingParams(
              first,
              afterInfo,
              last,
              beforeInfo,
              offset,
              results,
              "movieGroups"
            );

            const result = await testServer.executeOperation({
              query: `query GetMovieGroups${variables} { movieGroups${params} {
          edges {
            node { _id name }
            cursor
          }
          pageInfo {
            hasPreviousPage
            hasNextPage
            startCursor
            endCursor
          }
        }
      }`,
              ...variablesObj,
            });

            results.push(result);

            expect(result.data).toBeTruthy();

            if (result.data) {
              const moviesConnection = result.data[
                "movieGroups"
              ] as IConnection<Partial<IMovieGroup>>;
              expect(moviesConnection.edges).not.toBeNull();

              expect(moviesConnection.pageInfo.hasPreviousPage).toBe(
                expPrevPage
              );
              expect(moviesConnection.pageInfo.hasNextPage).toBe(expNextPage);

              const edges = moviesConnection.edges;

              if (edges) {
                expect(edges.length).toBe(expData.length);
                //===
                for (let i = 0; i < edges.length; i++) {
                  const edge = edges[i];
                  expect(edge.cursor).toMatch(base64RegExpr);
                  const row = edge.node;
                  expect(
                    row._id !== undefined ? parseInt(row._id) : undefined
                  ).toBeGreaterThanOrEqual(1);

                  expect(row.name).toBe(expData[i][0]);
                }
                //===
                if (edges.length > 0) {
                  expect(moviesConnection.pageInfo.startCursor).toBe(
                    edges[0].cursor
                  );
                  expect(moviesConnection.pageInfo.endCursor).toBe(
                    edges[edges.length - 1].cursor
                  );
                }
              }
            }
          });
        }
      );

      test("Querying directly about nodes", async () => {
        const result52 = await testServer.executeOperation({
          query: `query GetMovieGroups { movieGroups {
            nodes {
              _id name
            }
            pageInfo {
              hasPreviousPage
              hasNextPage
              startCursor
              endCursor
            }
          }
        }`,
        });

        expect(result52.data).toBeTruthy();

        if (result52.data) {
          const movieGroupsConnection = result52.data[
            "movieGroups"
          ] as IConnection<Partial<IMovieGroup>>;
          expect(movieGroupsConnection.nodes).not.toBeNull();

          expect(movieGroupsConnection.pageInfo.hasPreviousPage).toBe(false);
          expect(movieGroupsConnection.pageInfo.hasNextPage).toBe(false);

          if (movieGroupsConnection.nodes) {
            const node0 = movieGroupsConnection.nodes[0];
            expect(node0.name).toBe(name2);
            //===
            const node1 = movieGroupsConnection.nodes[1];
            expect(node1.name).toBe(name5);
            //===
            const node2 = movieGroupsConnection.nodes[2];
            expect(node2.name).toBe(name3);
            //===
            const node3 = movieGroupsConnection.nodes[3];
            expect(node3.name).toBe(name);
            //===
            const node4 = movieGroupsConnection.nodes[4];
            expect(node4.name).toBe(name4);
          }
        }
      });
    });

    describe("Testing group types queries/mutations/subscriptions", () => {
      const name = `IMDB Genre`;
      const description = `Genre in IMDB database`;
      //==
      const name2 = `Director`;
      const description2 = `Director of a movie`;
      //==
      let result: GraphQLResponse;
      let result7: GraphQLResponse;

      beforeAll(async () => {
        await _initData();
      });
      afterAll(async () => {
        await _uninitData();
      });
      test("Adding a group type", async () => {
        result = await testServer.executeOperation({
          query:
            "mutation CreateGroupType($name: String!, $description: String) { addGroupType(groupTypeInfo: { name: $name, description: $description } ) }",
          variables: { name, description },
        });

        expect(result.errors).toBeUndefined();

        if (result.data) {
          expect(parseInt(result.data.addGroupType)).toBeGreaterThanOrEqual(1);
        }
      });
      test("Getting all group types", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "query GetGroupTypes { groupTypes { edges { node { _id name description } } } }",
        });

        expect(result2.data).toBeTruthy();

        if (result2.data) {
          const groupTypesConnection = result2.data[
            "groupTypes"
          ] as IConnection<Partial<IGroupType>>;
          expect(groupTypesConnection.edges).not.toBeNull();

          if (groupTypesConnection.edges) {
            const row0 = groupTypesConnection.edges[0].node;
            if (row0._id !== undefined) {
              expect(parseInt(row0._id)).toBeGreaterThanOrEqual(1);
            }
            expect(row0.name).toBe(name);
            expect(row0.description).toBe(description);
          }
        }
      });
      test("Getting given group type", async () => {
        const result3 = await testServer.executeOperation({
          query:
            "query GetGroupType($_id: ID!) { groupType(_id: $_id) { _id name description } }",
          variables: { _id: result.data?.addGroupType },
        });

        expect(result3.data).toBeTruthy();

        if (result3.data) {
          const row = result3.data["groupType"];
          expect(parseInt(row["_id"])).toBeGreaterThanOrEqual(1);
          expect(row["name"]).toBe(name);
          expect(row["description"]).toBe(description);
        }
      });
      test("Getting non-existing group type", async () => {
        const result4 = await testServer.executeOperation({
          query:
            "query GetGroupType($_id: ID!) { groupType(_id: $_id) { _id name description } }",
          variables: { _id: "-1" },
        });

        expect(result4.data).toBeTruthy();

        if (result4.data) {
          expect(result4.data["groupType"]).toBeNull();
        }
      });
      test("Updating given group type", async () => {
        const result5 = await testServer.executeOperation({
          query: `mutation UpdateGroupType($_id: ID!, $description: String, $name: String ) {
          updateGroupType(_id: $_id, groupTypeInfo: {
            description: $description, name: $name
          }
        )
      }`,
          variables: {
            _id: result.data?.addGroupType,
            name,
            description,
          },
        });

        expect(result5.errors).toBeUndefined();
      });
      test("Getting given group type", async () => {
        const result6 = await testServer.executeOperation({
          query: `query GetGroupType($_id: ID!) { groupType(_id: $_id) { name description } }`,
          variables: { _id: result.data?.addGroupType },
        });

        expect(result6.data).toBeTruthy();

        if (result6.data) {
          const row = result6.data["groupType"];
          expect(row["name"]).toBe(name);
          expect(row["description"]).toBe(description);
        }
      });
      test("Adding a group type", async () => {
        result7 = await testServer.executeOperation({
          query: `mutation CreateGroupType($name: String, $description: String) {
          addGroupType(groupTypeInfo: {
            name: $name, description: $description
          }
        )
      }`,
          variables: {
            name: name2,
            description: description2,
          },
        });

        expect(result7.errors).toBeUndefined();
      });
      test("Getting given group type", async () => {
        const result8 = await testServer.executeOperation({
          query: `query GetGroupType($_id: ID!) { groupType(_id: $_id) { _id name description } }`,
          variables: { _id: result7.data?.addGroupType },
        });

        expect(result8.data).toBeTruthy();

        if (result8.data) {
          const row = result8.data["groupType"];
          expect(row["name"]).toBe(name2);
          expect(row["description"]).toBe(description2);
        }
      });
      test("Deleting given group type", async () => {
        const result9 = await testServer.executeOperation({
          query: `mutation RemoveGroupType($_id: ID!) {
          deleteGroupType(_id: $_id)
      }`,
          variables: { _id: result.data?.addGroupType },
        });

        expect(result9.errors).toBeUndefined();
      });
      test("Getting given group type", async () => {
        const result10 = await testServer.executeOperation({
          query:
            "query GetGroupType($_id: ID!) { groupType(_id: $_id) { _id name description } }",
          variables: { _id: result.data?.addGroupType },
        });

        expect(result10.data).toBeTruthy();

        if (result10.data) {
          const row = result10.data["groupType"];
          expect(row).toBe(null);
        }
      });
    });

    describe("Testing group types paging", () => {
      const name = `IMDB Genre`;
      const description = `Genre in IMDB database`;
      //==
      const name2 = `Director`;
      const description2 = `Director of a movie`;
      //==
      const name3 = `Serie`;
      const description3 = `Like Mandalorian or The Witcher`;
      //==
      const name4 = `Franchise`;
      const description4 = `Like Star Wars or Friday the 13th`;
      //==
      const name5 = `Writer`;
      const description5 = `Writer who's a novel or short story was made into a movie`;
      //==
      const results: GraphQLResponse[] = [];

      beforeAll(async () => {
        await _initData();
      });
      afterAll(async () => {
        await _initData();
      });
      test("Adding a group type", async () => {
        const result = await testServer.executeOperation({
          query:
            "mutation CreateGroupType($name: String, $description: String) { addGroupType(groupTypeInfo: { name: $name, description: $description } ) }",
          variables: { name, description },
        });

        expect(result.errors).toBeUndefined();

        if (result.data) {
          expect(parseInt(result.data.addGroupType)).toBeGreaterThanOrEqual(1);
        }
      });
      test("Adding a group type", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "mutation CreateGroupType($name: String, $description: String) { addGroupType(groupTypeInfo: { name: $name, description: $description } ) }",
          variables: { name: name2, description: description2 },
        });

        expect(result2.errors).toBeUndefined();

        if (result2.data) {
          expect(parseInt(result2.data.addGroupType)).toBeGreaterThanOrEqual(1);
        }
      });
      test("Adding a group type", async () => {
        const result3 = await testServer.executeOperation({
          query:
            "mutation CreateGroupType($name: String, $description: String) { addGroupType(groupTypeInfo: { name: $name, description: $description } ) }",
          variables: { name: name3, description: description3 },
        });

        expect(result3.errors).toBeUndefined();

        if (result3.data) {
          expect(parseInt(result3.data.addGroupType)).toBeGreaterThanOrEqual(1);
        }
      });
      test("Adding a group type", async () => {
        const result4 = await testServer.executeOperation({
          query:
            "mutation CreateGroupType($name: String, $description: String) { addGroupType(groupTypeInfo: { name: $name, description: $description } ) }",
          variables: { name: name4, description: description4 },
        });

        expect(result4.errors).toBeUndefined();

        if (result4.data) {
          expect(parseInt(result4.data.addGroupType)).toBeGreaterThanOrEqual(1);
        }
      });
      test("Adding a group type", async () => {
        const result5 = await testServer.executeOperation({
          query:
            "mutation CreateGroupType($name: String, $description: String) { addGroupType(groupTypeInfo: { name: $name, description: $description } ) }",
          variables: { name: name5, description: description5 },
        });

        expect(result5.errors).toBeUndefined();

        if (result5.data) {
          expect(parseInt(result5.data.addGroupType)).toBeGreaterThanOrEqual(1);
        }
      });

      describe.each`
        first        | afterInfo                                                           | last         | beforeInfo                                                          | offset       | expPrevPage | expNextPage | expData
        ${undefined} | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[[name2, description2], [name4, description4], [name, description], [name3, description3], [name5, description5]]}
        ${2}         | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[name2, description2], [name4, description4]]}
        ${2}         | ${{ type: CursorInfoType.END_CURSOR, resOffset: -1 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[name, description], [name3, description3]]}
        ${2}         | ${{ type: CursorInfoType.END_CURSOR, resOffset: -1 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[name5, description5]]}
        ${2}         | ${{ type: CursorInfoType.END_CURSOR, resOffset: -1 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -2 }}             | ${undefined} | ${true}     | ${true}     | ${[[name, description], [name3, description3]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -1 }}             | ${undefined} | ${false}    | ${true}     | ${[[name2, description2], [name4, description4]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -1 }}             | ${undefined} | ${false}    | ${false}    | ${[]}
        ${7}         | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[[name2, description2], [name4, description4], [name, description], [name3, description3], [name5, description5]]}
        ${undefined} | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${1}         | ${true}     | ${false}    | ${[[name4, description4], [name, description], [name3, description3], [name5, description5]]}
        ${2}         | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${1}         | ${true}     | ${true}     | ${[[name4, description4], [name, description]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -1 }}             | ${undefined} | ${false}    | ${true}     | ${[[name2, description2]]}
        ${2}         | ${{ type: CursorInfoType.END_CURSOR, resOffset: -2 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[name3, description3], [name5, description5]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[name3, description3], [name5, description5]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${2}         | ${true}     | ${true}     | ${[[name4, description4], [name, description]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${3}         | ${false}    | ${true}     | ${[[name2, description2], [name4, description4]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${4}         | ${false}    | ${true}     | ${[[name2, description2]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${5}         | ${false}    | ${false}    | ${[]}
        ${3}         | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[name2, description2], [name4, description4], [name, description]]}
        ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 1 }} | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[name, description], [name3, description3], [name5, description5]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[name4, description4], [name, description]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[name3, description3], [name5, description5]]}
        ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[name, description], [name3, description3]]}
        ${2}         | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[name2, description2], [name4, description4]]}
        ${2}         | ${undefined}                                                        | ${1}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[name4, description4]]}
        ${2}         | ${undefined}                                                        | ${3}         | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[name2, description2], [name4, description4]]}
        ${2}         | ${undefined}                                                        | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[name2, description2], [name4, description4]]}
        ${5}         | ${undefined}                                                        | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${false}    | ${[[name2, description2], [name4, description4], [name, description], [name3, description3]]}
        ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[name3, description3], [name5, description5]]}
        ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${5}         | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[[name4, description4], [name, description], [name3, description3], [name5, description5]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[name4, description4], [name, description]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[name4, description4], [name, description]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${1}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[name, description]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[name4, description4], [name, description]]}
        ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[name4, description4], [name, description], [name3, description3]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${true}     | ${true}     | ${[[name4, description4], [name, description]]}
        ${3}         | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[name4, description4], [name, description]]}
        ${2}         | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[name2, description2], [name4, description4]]}
        ${1}         | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[name2, description2]]}
        ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[name, description], [name3, description3]]}
        ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[name4, description4], [name, description], [name3, description3]]}
        ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[name4, description4], [name, description], [name3, description3]]}
        ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${false}    | ${[]}
        ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[name4, description4], [name, description], [name3, description3]]}
        ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[name4, description4], [name, description], [name3, description3]]}
        ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[name, description], [name3, description3]]}
        ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[name4, description4], [name, description], [name3, description3]]}
        ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[name4, description4], [name, description], [name3, description3]]}
        ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[name, description], [name3, description3]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[name4, description4], [name, description]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[name4, description4], [name, description]]}
        ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${1}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[name, description]]}
      `(
        "Getting group types (first=$first, afer=$afterInfo, last=$last, before=$beforeInfo, offset=$offset)",
        ({
          first,
          afterInfo,
          last,
          beforeInfo,
          offset,
          expPrevPage,
          expNextPage,
          expData,
        }: IPagingInfo) => {
          test("", async () => {
            const { variables, params, variablesObj } = _getGraphQLPagingParams(
              first,
              afterInfo,
              last,
              beforeInfo,
              offset,
              results,
              "groupTypes"
            );

            const result = await testServer.executeOperation({
              query: `query GetGroupTypes${variables} { groupTypes${params} {
          edges {
            node { _id name description }
            cursor
          }
          pageInfo {
            hasPreviousPage
            hasNextPage
            startCursor
            endCursor
          }
        }
      }`,
              ...variablesObj,
            });

            results.push(result);

            expect(result.data).toBeTruthy();

            if (result.data) {
              const groupTypesConnection = result.data[
                "groupTypes"
              ] as IConnection<Partial<IGroupType>>;
              expect(groupTypesConnection.edges).not.toBeNull();

              expect(groupTypesConnection.pageInfo.hasPreviousPage).toBe(
                expPrevPage
              );
              expect(groupTypesConnection.pageInfo.hasNextPage).toBe(
                expNextPage
              );

              const edges = groupTypesConnection.edges;

              if (edges) {
                expect(edges.length).toBe(expData.length);
                //===
                for (let i = 0; i < edges.length; i++) {
                  const edge = edges[i];
                  expect(edge.cursor).toMatch(base64RegExpr);
                  const row = edge.node;
                  expect(
                    row._id !== undefined ? parseInt(row._id) : undefined
                  ).toBeGreaterThanOrEqual(1);

                  expect(row.name).toBe(expData[i][0]);
                  expect(row.description).toBe(expData[i][1]);
                }
                //===
                if (edges.length > 0) {
                  expect(groupTypesConnection.pageInfo.startCursor).toBe(
                    edges[0].cursor
                  );
                  expect(groupTypesConnection.pageInfo.endCursor).toBe(
                    edges[edges.length - 1].cursor
                  );
                }
              }
            }
          });
        }
      );

      test("Querying directly about nodes", async () => {
        const result52 = await testServer.executeOperation({
          query: `query GetGroupTypes { groupTypes {
            nodes {
              _id name description
            }
            pageInfo {
              hasPreviousPage
              hasNextPage
              startCursor
              endCursor
            }
          }
        }`,
        });

        expect(result52.data).toBeTruthy();

        if (result52.data) {
          const groupTypesConnection = result52.data[
            "groupTypes"
          ] as IConnection<Partial<IMovieGroup>>;
          expect(groupTypesConnection.nodes).not.toBeNull();

          expect(groupTypesConnection.pageInfo.hasPreviousPage).toBe(false);
          expect(groupTypesConnection.pageInfo.hasNextPage).toBe(false);

          if (groupTypesConnection.nodes) {
            const node0 = groupTypesConnection.nodes[0];
            expect(node0.name).toBe(name2);
            expect(node0.description).toBe(description2);
            //===
            const node1 = groupTypesConnection.nodes[1];
            expect(node1.name).toBe(name4);
            expect(node1.description).toBe(description4);
            //===
            const node2 = groupTypesConnection.nodes[2];
            expect(node2.name).toBe(name);
            expect(node2.description).toBe(description);
            //===
            const node3 = groupTypesConnection.nodes[3];
            expect(node3.name).toBe(name3);
            expect(node3.description).toBe(description3);
            //===
            const node4 = groupTypesConnection.nodes[4];
            expect(node4.name).toBe(name5);
            expect(node4.description).toBe(description5);
          }
        }
      });
    });

    describe("Testing movies in groups", () => {
      const groupName = `Action`;
      //==
      const groupName2 = `Adventure`;
      //==
      const groupName3 = `Drama`;
      //==
      const groupName4 = `Favourive`;
      //==
      const groupName5 = `George Lucas`;
      //==
      const groupName6 = `3D`;
      //==
      const groupName7 = `Star Wars`;
      //==
      const title = `The Perfect Storm (2000)`;
      const folder = `Perfect Storm (2000), The `;
      const mediaFullPath = `C:\\Movies\\${folder}\\The.Perfect.Storm.(2000).mkv`;
      //==
      const title2 = `Star Wars: Episode IV - New Hope, A (1977)`;
      const folder2 = `Star Wars; Episode IV - A New Hope (1977)`;
      const mediaFullPath2 = `C:\\Movies\\${folder2}\\Star Wars.Episode.IV.A.New.Hope.(1977).mkv`;
      //==
      const title3 = `Star Wars: Episode V - Empire Strikes Back, The (1980)`;
      const folder3 = `Star Wars; Episode V - The Empire Strikes Back (1980)`;
      const mediaFullPath3 = `C:\\Movies\\${folder3}\\Star.Wars.Episode.V.The.Empire.Strikes.Back.(1980).mkv`;
      //==
      const title4 = `Star Wars: Episode VI - Return of the Jedi (1983)`;
      const folder4 = `Star Wars; Episode VI - Return of the Jedi (1983)`;
      const mediaFullPath4 = `C:\\Movies\\${folder4}\\Star.Wars.Episode.VI.Return.of.the.Jedi.(1983).mkv`;
      //==
      const title5 = `Star Wars: Episode I - Phantom Menace, The (1999)`;
      const folder5 = `Star Wars; Episode I - The Phantom Menace (1999)`;
      const mediaFullPath5 = `C:\\Movies\\${folder5}\\Star.Wars.Episode.I.The.Phantom.Menace.(1999).mkv`;
      //==
      const title6 = `Star Wars: Episode II - Attack of the Clones (2002)`;
      const folder6 = `Star Wars; Episode II - Attack of the Clones (2002)`;
      const mediaFullPath6 = `C:\\Movies\\${folder6}\\Star.Wars.Episode.II.Attack.of.the.Clones.(2002).mkv`;
      //==
      const title7 = `Star Wars: Episode III - Revenge of the Sith (2005)`;
      const folder7 = `Star Wars; Episode III - Revenge of the Sith (2005)`;
      const mediaFullPath7 = `C:\\Movies\\${folder7}\\Star.Wars.Episode.III.Revenge.of.the.Sith.(2005).mkv`;
      //==
      let groupResult: GraphQLResponse;
      let groupResult2: GraphQLResponse;
      let groupResult3: GraphQLResponse;
      let groupResult4: GraphQLResponse;
      let groupResult5: GraphQLResponse;
      let groupResult6: GraphQLResponse;
      let groupResult7: GraphQLResponse;
      //==
      let movieResult: GraphQLResponse;
      let movieResult2: GraphQLResponse;
      let movieResult3: GraphQLResponse;
      let movieResult4: GraphQLResponse;
      let movieResult5: GraphQLResponse;
      let movieResult6: GraphQLResponse;
      let movieResult7: GraphQLResponse;

      beforeAll(async () => {
        await _initData();
      });
      afterAll(async () => {
        await _uninitData();
      });

      test("Adding a movie group", async () => {
        groupResult = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: { name: groupName },
        });

        expect(groupResult.errors).toBeUndefined();

        if (groupResult.data) {
          expect(
            parseInt(groupResult.data.addMovieGroup)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Adding a movie to a group", async () => {
        movieResult = await testServer.executeOperation({
          query:
            "mutation CreateMovie($mediaFullPath: String!, $gid: ID, $title: String) { addMovie(mediaFullPath: $mediaFullPath, gid: $gid, movieInfo: { title: $title } ) }",
          variables: {
            mediaFullPath,
            gid: groupResult.data?.addMovieGroup,
            title,
          },
        });

        expect(movieResult.errors).toBeUndefined();

        if (movieResult.data) {
          expect(movieResult.data.addMovie).toBe(`MOVIE_${mediaFullPath}`);
        }
      });

      test("Getting all movies", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "query GetMovies { movies { edges { node { _id title mediaFullPath movieGroups { nodes { name } }} } } }",
        });

        expect(result2.data).toBeTruthy();

        if (result2.data) {
          const moviesConnection = result2.data["movies"] as IConnection<
            Partial<IMovie>
          >;
          expect(moviesConnection.edges).not.toBeNull();

          if (moviesConnection.edges) {
            const row0 = moviesConnection.edges[0].node;
            expect(row0._id).toBe(`MOVIE_${mediaFullPath}`);
            expect(row0.title).toBe(title);
            expect(row0.mediaFullPath).toBe(mediaFullPath);
            expect(row0.movieGroups).not.toBeUndefined();

            if (row0.movieGroups) {
              const movieGroupsConnection = row0.movieGroups as IConnection<
                Partial<IMovieGroup>
              >;
              expect(movieGroupsConnection.nodes).not.toBeNull();

              if (movieGroupsConnection.nodes) {
                expect(movieGroupsConnection.nodes.length).toBe(1);
                expect(movieGroupsConnection.nodes[0].name).toBe(groupName);
              }
            }
          }
        }
      });

      test("Adding a movie group", async () => {
        groupResult2 = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: { name: groupName2 },
        });

        expect(groupResult2.errors).toBeUndefined();

        if (groupResult2.data) {
          expect(
            parseInt(groupResult2.data.addMovieGroup)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Adding a movie group", async () => {
        groupResult3 = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: { name: groupName3 },
        });

        expect(groupResult3.errors).toBeUndefined();

        if (groupResult3.data) {
          expect(
            parseInt(groupResult3.data.addMovieGroup)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Adding a movie group", async () => {
        groupResult4 = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: { name: groupName4 },
        });

        expect(groupResult4.errors).toBeUndefined();

        if (groupResult4.data) {
          expect(
            parseInt(groupResult4.data.addMovieGroup)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Adding a movie group", async () => {
        groupResult5 = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: { name: groupName5 },
        });

        expect(groupResult5.errors).toBeUndefined();

        if (groupResult5.data) {
          expect(
            parseInt(groupResult5.data.addMovieGroup)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Adding a movie group", async () => {
        groupResult6 = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: { name: groupName6 },
        });

        expect(groupResult6.errors).toBeUndefined();

        if (groupResult6.data) {
          expect(
            parseInt(groupResult6.data.addMovieGroup)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Getting all movies", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "query GetMovies { movies { edges { node { _id title mediaFullPath movieGroups { nodes { name } }} } } }",
        });

        expect(result2.data).toBeTruthy();

        if (result2.data) {
          const moviesConnection = result2.data["movies"] as IConnection<
            Partial<IMovie>
          >;
          expect(moviesConnection.edges).not.toBeNull();

          if (moviesConnection.edges) {
            const row0 = moviesConnection.edges[0].node;
            expect(row0._id).toBe(`MOVIE_${mediaFullPath}`);
            expect(row0.title).toBe(title);
            expect(row0.mediaFullPath).toBe(mediaFullPath);
            expect(row0.movieGroups).not.toBeUndefined();

            if (row0.movieGroups) {
              const movieGroupsConnection = row0.movieGroups as IConnection<
                Partial<IMovieGroup>
              >;
              expect(movieGroupsConnection.nodes).not.toBeNull();

              if (movieGroupsConnection.nodes) {
                expect(movieGroupsConnection.nodes.length).toBe(1);
                expect(movieGroupsConnection.nodes[0].name).toBe(groupName);
              }
            }
          }
        }
      });

      test("Associating movie & movie group", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "mutation AssociateMovieAndMovieGroup($_mid: ID!, $_gid: ID!) { associateMovieAndMovieGroup(_mid: $_mid, _gid: $_gid) }",
          variables: {
            _mid: movieResult.data?.addMovie,
            _gid: groupResult2.data?.addMovieGroup,
          },
        });

        expect(result2.data).toBeTruthy();
      });

      test("Associating movie & movie group", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "mutation AssociateMovieAndMovieGroup($_mid: ID!, $_gid: ID!) { associateMovieAndMovieGroup(_mid: $_mid, _gid: $_gid) }",
          variables: {
            _mid: movieResult.data?.addMovie,
            _gid: groupResult3.data?.addMovieGroup,
          },
        });

        expect(result2.data).toBeTruthy();
      });

      test("Associating movie & movie group", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "mutation AssociateMovieAndMovieGroup($_mid: ID!, $_gid: ID!) { associateMovieAndMovieGroup(_mid: $_mid, _gid: $_gid) }",
          variables: {
            _mid: movieResult.data?.addMovie,
            _gid: groupResult4.data?.addMovieGroup,
          },
        });

        expect(result2.data).toBeTruthy();
      });

      test("Associating movie & movie group", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "mutation AssociateMovieAndMovieGroup($_mid: ID!, $_gid: ID!) { associateMovieAndMovieGroup(_mid: $_mid, _gid: $_gid) }",
          variables: {
            _mid: movieResult.data?.addMovie,
            _gid: groupResult5.data?.addMovieGroup,
          },
        });

        expect(result2.data).toBeTruthy();
      });

      test("Associating movie & movie group", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "mutation AssociateMovieAndMovieGroup($_mid: ID!, $_gid: ID!) { associateMovieAndMovieGroup(_mid: $_mid, _gid: $_gid) }",
          variables: {
            _mid: movieResult.data?.addMovie,
            _gid: groupResult6.data?.addMovieGroup,
          },
        });

        expect(result2.data).toBeTruthy();
      });

      test("Getting all movies", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "query GetMovies { movies { edges { node { _id title mediaFullPath movieGroups { nodes { name } }} } } }",
        });

        expect(result2.data).toBeTruthy();

        if (result2.data) {
          const moviesConnection = result2.data["movies"] as IConnection<
            Partial<IMovie>
          >;
          expect(moviesConnection.edges).not.toBeNull();

          if (moviesConnection.edges) {
            const row0 = moviesConnection.edges[0].node;
            expect(row0._id).toBe(`MOVIE_${mediaFullPath}`);
            expect(row0.title).toBe(title);
            expect(row0.mediaFullPath).toBe(mediaFullPath);
            expect(row0.movieGroups).not.toBeUndefined();

            if (row0.movieGroups) {
              const movieGroupsConnection = row0.movieGroups as IConnection<
                Partial<IMovieGroup>
              >;
              expect(movieGroupsConnection.nodes).not.toBeNull();

              if (movieGroupsConnection.nodes) {
                expect(movieGroupsConnection.nodes.length).toBe(6);
                expect(movieGroupsConnection.nodes[0].name).toBe(groupName6);
                expect(movieGroupsConnection.nodes[1].name).toBe(groupName);
                expect(movieGroupsConnection.nodes[2].name).toBe(groupName2);
                expect(movieGroupsConnection.nodes[3].name).toBe(groupName3);
                expect(movieGroupsConnection.nodes[4].name).toBe(groupName4);
                expect(movieGroupsConnection.nodes[5].name).toBe(groupName5);
              }
            }
          }
        }
      });

      test("Getting given movie", async () => {
        const result2 = await testServer.executeOperation({
          query: `query GetMovies($_id: ID!) { 
                movie(_id: $_id) { 
                  _id title mediaFullPath movieGroups { nodes { name } }
                } 
              }`,
          variables: { _id: movieResult.data?.addMovie },
        });

        expect(result2.data).toBeTruthy();

        if (result2.data) {
          const movie = result2.data["movie"] as IMovie;

          expect(movie).not.toBeNull();

          if (movie) {
            expect(movie._id).toBe(`MOVIE_${mediaFullPath}`);
            expect(movie.title).toBe(title);
            expect(movie.mediaFullPath).toBe(mediaFullPath);
            expect(movie.movieGroups).not.toBeUndefined();

            if (movie.movieGroups) {
              const movieGroupsConnection = movie.movieGroups as IConnection<
                Partial<IMovieGroup>
              >;
              expect(movieGroupsConnection.nodes).not.toBeNull();

              if (movieGroupsConnection.nodes) {
                expect(movieGroupsConnection.nodes.length).toBe(6);
                expect(movieGroupsConnection.nodes[0].name).toBe(groupName6);
                expect(movieGroupsConnection.nodes[1].name).toBe(groupName);
                expect(movieGroupsConnection.nodes[2].name).toBe(groupName2);
                expect(movieGroupsConnection.nodes[3].name).toBe(groupName3);
                expect(movieGroupsConnection.nodes[4].name).toBe(groupName4);
                expect(movieGroupsConnection.nodes[5].name).toBe(groupName5);
              }
            }
          }
        }
      });

      test("Unassociating movie & movie group", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "mutation UnassociateMovieAndMovieGroup($_mid: ID!, $_gid: ID!) { unassociateMovieAndMovieGroup(_mid: $_mid, _gid: $_gid) }",
          variables: {
            _mid: movieResult.data?.addMovie,
            _gid: groupResult6.data?.addMovieGroup,
          },
        });

        expect(result2.data).toBeTruthy();
      });

      test("Getting all movies", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "query GetMovies { movies { edges { node { _id title mediaFullPath movieGroups { nodes { name } }} } } }",
        });

        expect(result2.data).toBeTruthy();

        if (result2.data) {
          const moviesConnection = result2.data["movies"] as IConnection<
            Partial<IMovie>
          >;
          expect(moviesConnection.edges).not.toBeNull();

          if (moviesConnection.edges) {
            const row0 = moviesConnection.edges[0].node;
            expect(row0._id).toBe(`MOVIE_${mediaFullPath}`);
            expect(row0.title).toBe(title);
            expect(row0.mediaFullPath).toBe(mediaFullPath);
            expect(row0.movieGroups).not.toBeUndefined();

            if (row0.movieGroups) {
              const movieGroupsConnection = row0.movieGroups as IConnection<
                Partial<IMovieGroup>
              >;
              expect(movieGroupsConnection.nodes).not.toBeNull();

              if (movieGroupsConnection.nodes) {
                expect(movieGroupsConnection.nodes.length).toBe(5);
                expect(movieGroupsConnection.nodes[0].name).toBe(groupName);
                expect(movieGroupsConnection.nodes[1].name).toBe(groupName2);
                expect(movieGroupsConnection.nodes[2].name).toBe(groupName3);
                expect(movieGroupsConnection.nodes[3].name).toBe(groupName4);
                expect(movieGroupsConnection.nodes[4].name).toBe(groupName5);
              }
            }
          }
        }
      });

      test("Adding a movie group", async () => {
        groupResult7 = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: { name: groupName7 },
        });

        expect(groupResult7.errors).toBeUndefined();

        if (groupResult7.data) {
          expect(
            parseInt(groupResult7.data.addMovieGroup)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Adding a movie to a group", async () => {
        movieResult2 = await testServer.executeOperation({
          query:
            "mutation CreateMovie($mediaFullPath: String!, $gid: ID, $listOrder: Int, $title: String) { addMovie(mediaFullPath: $mediaFullPath, gid: $gid, listOrder: $listOrder, movieInfo: { title: $title } ) }",
          variables: {
            mediaFullPath: mediaFullPath2,
            gid: groupResult7.data?.addMovieGroup,
            listOrder: 1,
            title: title2,
          },
        });

        expect(movieResult2.errors).toBeUndefined();

        if (movieResult2.data) {
          expect(movieResult2.data.addMovie).toBe(`MOVIE_${mediaFullPath2}`);
        }
      });

      test("Adding a movie to a group", async () => {
        movieResult3 = await testServer.executeOperation({
          query:
            "mutation CreateMovie($mediaFullPath: String!, $gid: ID, $listOrder: Int, $title: String) { addMovie(mediaFullPath: $mediaFullPath, gid: $gid, listOrder: $listOrder, movieInfo: { title: $title } ) }",
          variables: {
            mediaFullPath: mediaFullPath3,
            gid: groupResult7.data?.addMovieGroup,
            listOrder: 2,
            title: title3,
          },
        });

        expect(movieResult3.errors).toBeUndefined();

        if (movieResult3.data) {
          expect(movieResult3.data.addMovie).toBe(`MOVIE_${mediaFullPath3}`);
        }
      });

      test("Adding a movie to a group", async () => {
        movieResult4 = await testServer.executeOperation({
          query:
            "mutation CreateMovie($mediaFullPath: String!, $gid: ID, $listOrder: Int, $title: String) { addMovie(mediaFullPath: $mediaFullPath, gid: $gid, listOrder: $listOrder, movieInfo: { title: $title } ) }",
          variables: {
            mediaFullPath: mediaFullPath4,
            gid: groupResult7.data?.addMovieGroup,
            listOrder: 3,
            title: title4,
          },
        });

        expect(movieResult4.errors).toBeUndefined();

        if (movieResult4.data) {
          expect(movieResult4.data.addMovie).toBe(`MOVIE_${mediaFullPath4}`);
        }
      });

      test("Adding a movie to a group", async () => {
        movieResult5 = await testServer.executeOperation({
          query:
            "mutation CreateMovie($mediaFullPath: String!, $gid: ID, $listOrder: Int, $title: String) { addMovie(mediaFullPath: $mediaFullPath, gid: $gid, listOrder: $listOrder, movieInfo: { title: $title } ) }",
          variables: {
            mediaFullPath: mediaFullPath5,
            gid: groupResult7.data?.addMovieGroup,
            listOrder: 1,
            title: title5,
          },
        });

        expect(movieResult5.errors).toBeUndefined();

        if (movieResult5.data) {
          expect(movieResult5.data.addMovie).toBe(`MOVIE_${mediaFullPath5}`);
        }
      });

      test("Adding a movie to a group", async () => {
        movieResult6 = await testServer.executeOperation({
          query:
            "mutation CreateMovie($mediaFullPath: String!, $gid: ID, $listOrder: Int, $title: String) { addMovie(mediaFullPath: $mediaFullPath, gid: $gid, listOrder: $listOrder, movieInfo: { title: $title } ) }",
          variables: {
            mediaFullPath: mediaFullPath6,
            gid: groupResult7.data?.addMovieGroup,
            listOrder: 2,
            title: title6,
          },
        });

        expect(movieResult6.errors).toBeUndefined();

        if (movieResult6.data) {
          expect(movieResult6.data.addMovie).toBe(`MOVIE_${mediaFullPath6}`);
        }
      });

      test("Adding a movie to a group", async () => {
        movieResult7 = await testServer.executeOperation({
          query:
            "mutation CreateMovie($mediaFullPath: String!, $gid: ID, $listOrder: Int, $title: String) { addMovie(mediaFullPath: $mediaFullPath, gid: $gid, listOrder: $listOrder, movieInfo: { title: $title } ) }",
          variables: {
            mediaFullPath: mediaFullPath7,
            gid: groupResult7.data?.addMovieGroup,
            listOrder: 3,
            title: title7,
          },
        });

        expect(movieResult7.errors).toBeUndefined();

        if (movieResult7.data) {
          expect(movieResult7.data.addMovie).toBe(`MOVIE_${mediaFullPath7}`);
        }
      });

      test("Getting all movie groups", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "query GetMovieGroups { movieGroups { edges { node { _id name movies { nodes { title listOrder } } } } } }",
        });

        expect(result2.data).toBeTruthy();

        if (result2.data) {
          const movieGroupsConnection = result2.data[
            "movieGroups"
          ] as IConnection<Partial<IMovieGroup>>;
          expect(movieGroupsConnection.edges).not.toBeNull();

          if (movieGroupsConnection.edges) {
            expect(movieGroupsConnection.edges.length).toBe(7);
            //==
            const row0 = movieGroupsConnection.edges[0].node;

            if (row0._id !== undefined) {
              expect(parseInt(row0._id)).toBeGreaterThanOrEqual(1);
            }

            expect(row0.name).toBe(groupName6);

            expect(row0.movies?.nodes?.length).toBe(0);
            //===
            const row1 = movieGroupsConnection.edges[1].node;

            if (row1._id !== undefined) {
              expect(parseInt(row1._id)).toBeGreaterThanOrEqual(1);
            }

            expect(row1.name).toBe(groupName);

            const moviesConnection1 = row1.movies as IConnection<
              Partial<IPositionedMovie>
            >;

            expect(moviesConnection1.nodes).not.toBeNull();
            expect(moviesConnection1.nodes?.length).toBe(1);

            //===
            if (moviesConnection1.nodes) {
              expect(moviesConnection1.nodes.length).toBe(1);
              //===
              const row1_0 = moviesConnection1.nodes[0];
              expect(row1_0.listOrder).toBe(1);
              expect(row1_0.title).toBe(title);
            }
            //===
            const row2 = movieGroupsConnection.edges[2].node;

            if (row2._id !== undefined) {
              expect(parseInt(row2._id)).toBeGreaterThanOrEqual(1);
            }

            expect(row2.name).toBe(groupName2);

            const moviesConnection2 = row2.movies as IConnection<
              Partial<IPositionedMovie>
            >;

            expect(moviesConnection2.nodes).not.toBeNull();
            expect(moviesConnection2.nodes?.length).toBe(1);

            //===
            if (moviesConnection2.nodes) {
              expect(moviesConnection2.nodes.length).toBe(1);
              //===
              const row2_0 = moviesConnection2.nodes[0];
              expect(row2_0.listOrder).toBe(1);
              expect(row2_0.title).toBe(title);
            }
            //===
            const row3 = movieGroupsConnection.edges[3].node;

            if (row3._id !== undefined) {
              expect(parseInt(row3._id)).toBeGreaterThanOrEqual(1);
            }

            expect(row3.name).toBe(groupName3);

            const moviesConnection3 = row3.movies as IConnection<
              Partial<IPositionedMovie>
            >;

            expect(moviesConnection3.nodes).not.toBeNull();
            expect(moviesConnection3.nodes?.length).toBe(1);

            //===
            if (moviesConnection3.nodes) {
              expect(moviesConnection3.nodes.length).toBe(1);
              //===
              const row3_0 = moviesConnection3.nodes[0];
              expect(row3_0.listOrder).toBe(1);
              expect(row3_0.title).toBe(title);
            }
            //===
            const row4 = movieGroupsConnection.edges[4].node;

            if (row4._id !== undefined) {
              expect(parseInt(row4._id)).toBeGreaterThanOrEqual(1);
            }

            expect(row4.name).toBe(groupName4);

            const moviesConnection4 = row3.movies as IConnection<
              Partial<IPositionedMovie>
            >;

            expect(moviesConnection4.nodes).not.toBeNull();
            expect(moviesConnection4.nodes?.length).toBe(1);

            //===
            if (moviesConnection4.nodes) {
              expect(moviesConnection4.nodes.length).toBe(1);
              //===
              const row4_0 = moviesConnection4.nodes[0];
              expect(row4_0.listOrder).toBe(1);
              expect(row4_0.title).toBe(title);
            }
            //===
            const row5 = movieGroupsConnection.edges[5].node;

            if (row5._id !== undefined) {
              expect(parseInt(row5._id)).toBeGreaterThanOrEqual(1);
            }

            expect(row5.name).toBe(groupName5);

            const moviesConnection5 = row5.movies as IConnection<
              Partial<IPositionedMovie>
            >;

            expect(moviesConnection5.nodes).not.toBeNull();
            expect(moviesConnection5.nodes?.length).toBe(1);

            //===
            if (moviesConnection5.nodes) {
              expect(moviesConnection5.nodes.length).toBe(1);
              //===
              const row5_0 = moviesConnection4.nodes[0];
              expect(row5_0.listOrder).toBe(1);
              expect(row5_0.title).toBe(title);
            }
            //===
            const row6 = movieGroupsConnection.edges[6].node;

            if (row6._id !== undefined) {
              expect(parseInt(row6._id)).toBeGreaterThanOrEqual(1);
            }

            expect(row6.name).toBe(groupName7);

            const moviesConnection6 = row6.movies as IConnection<
              Partial<IPositionedMovie>
            >;

            expect(moviesConnection6.nodes).not.toBeNull();

            //===
            if (moviesConnection6.nodes) {
              expect(moviesConnection6.nodes.length).toBe(6);
              //===
              const row6_0 = moviesConnection6.nodes[0];
              expect(row6_0.listOrder).toBe(1);
              expect(row6_0.title).toBe(title5);
              //===
              const row6_1 = moviesConnection6.nodes[1];
              expect(row6_1.listOrder).toBe(2);
              expect(row6_1.title).toBe(title6);
              //===
              const row6_2 = moviesConnection6.nodes[2];
              expect(row6_2.listOrder).toBe(3);
              expect(row6_2.title).toBe(title7);
              //===
              const row6_3 = moviesConnection6.nodes[3];
              expect(row6_3.listOrder).toBe(4);
              expect(row6_3.title).toBe(title2);
              //===
              const row6_4 = moviesConnection6.nodes[4];
              expect(row6_4.listOrder).toBe(5);
              expect(row6_4.title).toBe(title3);
              //===
              const row6_5 = moviesConnection6.nodes[5];
              expect(row6_5.listOrder).toBe(6);
              expect(row6_5.title).toBe(title4);
            }
          }
        }
      });

      test("Getting given movie group", async () => {
        const result2 = await testServer.executeOperation({
          query: `query GetMovieGroup($_id: ID!) { 
        movieGroup(_id: $_id) { 
          _id name movies { nodes { title listOrder } } 
        } 
      }`,
          variables: { _id: groupResult7.data?.addMovieGroup },
        });

        expect(result2.data).toBeTruthy();

        if (result2.data) {
          const movieGroup = result2.data["movieGroup"] as IMovieGroup;
          expect(movieGroup).not.toBeNull();

          if (movieGroup) {
            const moviesConnection = movieGroup.movies;

            //===
            if (moviesConnection.nodes) {
              expect(moviesConnection.nodes.length).toBe(6);
              //===
              const row6_0 = moviesConnection.nodes[0];
              expect(row6_0.listOrder).toBe(1);
              expect(row6_0.title).toBe(title5);
              //===
              const row6_1 = moviesConnection.nodes[1];
              expect(row6_1.listOrder).toBe(2);
              expect(row6_1.title).toBe(title6);
              //===
              const row6_2 = moviesConnection.nodes[2];
              expect(row6_2.listOrder).toBe(3);
              expect(row6_2.title).toBe(title7);
              //===
              const row6_3 = moviesConnection.nodes[3];
              expect(row6_3.listOrder).toBe(4);
              expect(row6_3.title).toBe(title2);
              //===
              const row6_4 = moviesConnection.nodes[4];
              expect(row6_4.listOrder).toBe(5);
              expect(row6_4.title).toBe(title3);
              //===
              const row6_5 = moviesConnection.nodes[5];
              expect(row6_5.listOrder).toBe(6);
              expect(row6_5.title).toBe(title4);
            }
          }
        }
      });
    });

    // Warning: Do not remove paging test 'cause it may be used in the future
    //
    // describe("Testing groups of movies paging", () => {
    //   const groupName = `Action`;
    //   //==
    //   const groupName2 = `Adventure`;
    //   //==
    //   const groupName3 = `Drama`;
    //   //==
    //   const groupName4 = `Favourive`;
    //   //==
    //   const groupName5 = `George Lucas`;
    //   //==
    //   const title = `The Perfect Storm (2000)`;
    //   const folder = `Perfect Storm (2000), The `;
    //   const mediaFullPath = `C:\\Movies\\${folder}\\The.Perfect.Storm.(2000).mkv`;
    //   //==
    //   let movieResult: GraphQLResponse;
    //   //==
    //   let groupResult: GraphQLResponse;
    //   let groupResult2: GraphQLResponse;
    //   let groupResult3: GraphQLResponse;
    //   let groupResult4: GraphQLResponse;
    //   let groupResult5: GraphQLResponse;
    //   //==
    //   const results: GraphQLResponse[] = [];

    //   beforeAll(async () => {
    //     await _initData();
    //   });
    //   afterAll(async () => {
    //     await _uninitData();
    //   });

    //   test("Adding a movie group", async () => {
    //     groupResult = await testServer.executeOperation({
    //       query:
    //         "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
    //       variables: { name: groupName },
    //     });

    //     expect(groupResult.errors).toBeUndefined();

    //     if (groupResult.data) {
    //       expect(
    //         parseInt(groupResult.data.addMovieGroup)
    //       ).toBeGreaterThanOrEqual(1);
    //     }
    //   });

    //   test("Adding a movie to a group", async () => {
    //     movieResult = await testServer.executeOperation({
    //       query:
    //         "mutation CreateMovie($mediaFullPath: String!, $gid: ID, $title: String) { addMovie(mediaFullPath: $mediaFullPath, gid: $gid, movieInfo: { title: $title } ) }",
    //       variables: {
    //         mediaFullPath,
    //         gid: groupResult.data?.addMovieGroup,
    //         title,
    //       },
    //     });

    //     expect(movieResult.errors).toBeUndefined();

    //     if (movieResult.data) {
    //       expect(movieResult.data.addMovie).toBe(`MOVIE_${mediaFullPath}`);
    //     }
    //   });

    //   test("Adding a movie group", async () => {
    //     groupResult2 = await testServer.executeOperation({
    //       query:
    //         "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
    //       variables: { name: groupName2 },
    //     });

    //     expect(groupResult2.errors).toBeUndefined();

    //     if (groupResult2.data) {
    //       expect(
    //         parseInt(groupResult2.data.addMovieGroup)
    //       ).toBeGreaterThanOrEqual(1);
    //     }
    //   });

    //   test("Adding a movie group", async () => {
    //     groupResult3 = await testServer.executeOperation({
    //       query:
    //         "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
    //       variables: { name: groupName3 },
    //     });

    //     expect(groupResult3.errors).toBeUndefined();

    //     if (groupResult3.data) {
    //       expect(
    //         parseInt(groupResult3.data.addMovieGroup)
    //       ).toBeGreaterThanOrEqual(1);
    //     }
    //   });

    //   test("Adding a movie group", async () => {
    //     groupResult4 = await testServer.executeOperation({
    //       query:
    //         "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
    //       variables: { name: groupName4 },
    //     });

    //     expect(groupResult4.errors).toBeUndefined();

    //     if (groupResult4.data) {
    //       expect(
    //         parseInt(groupResult4.data.addMovieGroup)
    //       ).toBeGreaterThanOrEqual(1);
    //     }
    //   });

    //   test("Adding a movie group", async () => {
    //     groupResult5 = await testServer.executeOperation({
    //       query:
    //         "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
    //       variables: { name: groupName5 },
    //     });

    //     expect(groupResult5.errors).toBeUndefined();

    //     if (groupResult5.data) {
    //       expect(
    //         parseInt(groupResult5.data.addMovieGroup)
    //       ).toBeGreaterThanOrEqual(1);
    //     }
    //   });

    //   test("Associating movie & movie group", async () => {
    //     const result2 = await testServer.executeOperation({
    //       query:
    //         "mutation AssociateMovieAndMovieGroup($_mid: ID!, $_gid: ID!) { associateMovieAndMovieGroup(_mid: $_mid, _gid: $_gid) }",
    //       variables: {
    //         _mid: movieResult.data?.addMovie,
    //         _gid: groupResult2.data?.addMovieGroup,
    //       },
    //     });

    //     expect(result2.data).toBeTruthy();
    //   });

    //   test("Associating movie & movie group", async () => {
    //     const result2 = await testServer.executeOperation({
    //       query:
    //         "mutation AssociateMovieAndMovieGroup($_mid: ID!, $_gid: ID!) { associateMovieAndMovieGroup(_mid: $_mid, _gid: $_gid) }",
    //       variables: {
    //         _mid: movieResult.data?.addMovie,
    //         _gid: groupResult3.data?.addMovieGroup,
    //       },
    //     });

    //     expect(result2.data).toBeTruthy();
    //   });

    //   test("Associating movie & movie group", async () => {
    //     const result2 = await testServer.executeOperation({
    //       query:
    //         "mutation AssociateMovieAndMovieGroup($_mid: ID!, $_gid: ID!) { associateMovieAndMovieGroup(_mid: $_mid, _gid: $_gid) }",
    //       variables: {
    //         _mid: movieResult.data?.addMovie,
    //         _gid: groupResult4.data?.addMovieGroup,
    //       },
    //     });

    //     expect(result2.data).toBeTruthy();
    //   });

    //   test("Associating movie & movie group", async () => {
    //     const result2 = await testServer.executeOperation({
    //       query:
    //         "mutation AssociateMovieAndMovieGroup($_mid: ID!, $_gid: ID!) { associateMovieAndMovieGroup(_mid: $_mid, _gid: $_gid) }",
    //       variables: {
    //         _mid: movieResult.data?.addMovie,
    //         _gid: groupResult5.data?.addMovieGroup,
    //       },
    //     });

    //     expect(result2.data).toBeTruthy();
    //   });

    //   describe.each`
    //     first        | afterInfo                                                           | last         | beforeInfo                                                          | offset       | expPrevPage | expNextPage | expData
    //     ${undefined} | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[[groupName], [groupName2], [groupName3], [groupName4], [groupName5]]}
    //     ${2}         | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[groupName], [groupName2]]}
    //     ${2}         | ${{ type: CursorInfoType.END_CURSOR, resOffset: -1 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[groupName3], [groupName4]]}
    //     ${2}         | ${{ type: CursorInfoType.END_CURSOR, resOffset: -1 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[groupName5]]}
    //     ${2}         | ${{ type: CursorInfoType.END_CURSOR, resOffset: -1 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -2 }}             | ${undefined} | ${true}     | ${true}     | ${[[groupName3], [groupName4]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -1 }}             | ${undefined} | ${false}    | ${true}     | ${[[groupName], [groupName2]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -1 }}             | ${undefined} | ${false}    | ${false}    | ${[]}
    //     ${7}         | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[[groupName], [groupName2], [groupName3], [groupName4], [groupName5]]}
    //     ${undefined} | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${1}         | ${true}     | ${false}    | ${[[groupName2], [groupName3], [groupName4], [groupName5]]}
    //     ${2}         | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${1}         | ${true}     | ${true}     | ${[[groupName2], [groupName3]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -1 }}             | ${undefined} | ${false}    | ${true}     | ${[[groupName]]}
    //     ${2}         | ${{ type: CursorInfoType.END_CURSOR, resOffset: -2 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[groupName4], [groupName5]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[groupName4], [groupName5]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${2}         | ${true}     | ${true}     | ${[[groupName2], [groupName3]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${3}         | ${false}    | ${true}     | ${[[groupName], [groupName2]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${4}         | ${false}    | ${true}     | ${[[groupName]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${5}         | ${false}    | ${false}    | ${[]}
    //     ${3}         | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[groupName], [groupName2], [groupName3]]}
    //     ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 1 }} | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[groupName3], [groupName4], [groupName5]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[groupName2], [groupName3]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[groupName4], [groupName5]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[groupName3], [groupName4]]}
    //     ${2}         | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[groupName], [groupName2]]}
    //     ${2}         | ${undefined}                                                        | ${1}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[groupName2]]}
    //     ${2}         | ${undefined}                                                        | ${3}         | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[groupName], [groupName2]]}
    //     ${2}         | ${undefined}                                                        | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[groupName], [groupName2]]}
    //     ${5}         | ${undefined}                                                        | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${false}    | ${[[groupName], [groupName2], [groupName3], [groupName4]]}
    //     ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[groupName4], [groupName5]]}
    //     ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${5}         | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[[groupName2], [groupName3], [groupName4], [groupName5]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[groupName2], [groupName3]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[groupName2], [groupName3]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${1}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[groupName3]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[groupName2], [groupName3]]}
    //     ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[groupName2], [groupName3], [groupName4]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${true}     | ${true}     | ${[[groupName2], [groupName3]]}
    //     ${3}         | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[groupName2], [groupName3]]}
    //     ${2}         | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[groupName], [groupName2]]}
    //     ${1}         | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[groupName]]}
    //     ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[groupName3], [groupName4]]}
    //     ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[groupName2], [groupName3], [groupName4]]}
    //     ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[groupName2], [groupName3], [groupName4]]}
    //     ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${false}    | ${[]}
    //     ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[groupName2], [groupName3], [groupName4]]}
    //     ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[groupName2], [groupName3], [groupName4]]}
    //     ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[groupName3], [groupName4]]}
    //     ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[groupName2], [groupName3], [groupName4]]}
    //     ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[groupName2], [groupName3], [groupName4]]}
    //     ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[groupName3], [groupName4]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[groupName2], [groupName3]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[groupName2], [groupName3]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${1}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[groupName3]]}
    //   `(
    //     "Getting groups of a movie (first=$first, afer=$afterInfo, last=$last, before=$beforeInfo, offset=$offset)",
    //     ({
    //       first,
    //       afterInfo,
    //       last,
    //       beforeInfo,
    //       offset,
    //       expPrevPage,
    //       expNextPage,
    //       expData,
    //     }: IPagingInfo) => {
    //       test("", async () => {
    //         const { variables, params, variablesObj } = _getGraphQLPagingParams(
    //           first,
    //           afterInfo,
    //           last,
    //           beforeInfo,
    //           offset,
    //           results,
    //           "movieGroups",
    //           (result: GraphQLResponse) => {
    //             const moviesConnection = (
    //               result.data as Record<string, unknown>
    //             )["movies"] as IConnection<Partial<IMovie>>;
    //             return moviesConnection.nodes[0].movieGroups as IConnection<
    //               Partial<IMovieGroup>
    //             >;
    //           }
    //         );

    //         const result = await testServer.executeOperation({
    //           query: `query GetMovies${variables} { movies { nodes { title movieGroups${params} { 
    //           edges { 
    //             node { name } 
    //             cursor 
    //           }
    //           pageInfo {
    //             hasPreviousPage
    //             hasNextPage
    //             startCursor
    //             endCursor
    //           }
    //         } } } }`,
    //           ...variablesObj,
    //         });

    //         results.push(result);

    //         expect(result.data).toBeTruthy();

    //         if (result.data) {
    //           const moviesConnection = result.data["movies"] as IConnection<
    //             Partial<IMovie>
    //           >;
    //           expect(moviesConnection.edges).not.toBeNull();

    //           const nodes = moviesConnection.nodes;

    //           if (nodes) {
    //             expect(nodes.length).toBe(1);
    //             //===
    //             const row = nodes[0];

    //             expect(row.title).toBe(title);
    //             expect(row.movieGroups).not.toBeNull();

    //             if (row.movieGroups) {
    //               const edges = row.movieGroups.edges;
    //               expect(edges).not.toBeNull();

    //               expect(row.movieGroups.pageInfo.hasPreviousPage).toBe(
    //                 expPrevPage
    //               );
    //               expect(row.movieGroups.pageInfo.hasNextPage).toBe(
    //                 expNextPage
    //               );

    //               if (edges) {
    //                 expect(edges.length).toBe(expData.length);
    //                 //===
    //                 for (let i = 0; i < edges.length; i++) {
    //                   const row = edges[i].node;

    //                   expect(row.name).toBe(expData[i][0]);
    //                 }
    //               }
    //             }
    //           }
    //         }
    //       });
    //     }
    //   );
    // });

    // Warning: Do not remove paging test 'cause it may be used in the future
    //
    // describe("Testing movies in group paging", () => {
    //   const groupName7 = `Star Wars`;
    //   //==
    //   const title2 = `Star Wars: Episode IV - New Hope, A (1977)`;
    //   const folder2 = `Star Wars; Episode IV - A New Hope (1977)`;
    //   const mediaFullPath2 = `C:\\Movies\\${folder2}\\Star Wars.Episode.IV.A.New.Hope.(1977).mkv`;
    //   //==
    //   const title3 = `Star Wars: Episode V - Empire Strikes Back, The (1980)`;
    //   const folder3 = `Star Wars; Episode V - The Empire Strikes Back (1980)`;
    //   const mediaFullPath3 = `C:\\Movies\\${folder3}\\Star.Wars.Episode.V.The.Empire.Strikes.Back.(1980).mkv`;
    //   //==
    //   const title5 = `Star Wars: Episode I - Phantom Menace, The (1999)`;
    //   const folder5 = `Star Wars; Episode I - The Phantom Menace (1999)`;
    //   const mediaFullPath5 = `C:\\Movies\\${folder5}\\Star.Wars.Episode.I.The.Phantom.Menace.(1999).mkv`;
    //   //==
    //   const title6 = `Star Wars: Episode II - Attack of the Clones (2002)`;
    //   const folder6 = `Star Wars; Episode II - Attack of the Clones (2002)`;
    //   const mediaFullPath6 = `C:\\Movies\\${folder6}\\Star.Wars.Episode.II.Attack.of.the.Clones.(2002).mkv`;
    //   //==
    //   const title7 = `Star Wars: Episode III - Revenge of the Sith (2005)`;
    //   const folder7 = `Star Wars; Episode III - Revenge of the Sith (2005)`;
    //   const mediaFullPath7 = `C:\\Movies\\${folder7}\\Star.Wars.Episode.III.Revenge.of.the.Sith.(2005).mkv`;
    //   //==
    //   let groupResult7: GraphQLResponse;
    //   //==
    //   let movieResult2: GraphQLResponse;
    //   let movieResult3: GraphQLResponse;
    //   let movieResult5: GraphQLResponse;
    //   let movieResult6: GraphQLResponse;
    //   let movieResult7: GraphQLResponse;
    //   //==
    //   const results: GraphQLResponse[] = [];

    //   beforeAll(async () => {
    //     await _initData();
    //   });
    //   afterAll(async () => {
    //     await _uninitData();
    //   });

    //   test("Adding a movie group", async () => {
    //     groupResult7 = await testServer.executeOperation({
    //       query:
    //         "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
    //       variables: { name: groupName7 },
    //     });

    //     expect(groupResult7.errors).toBeUndefined();

    //     if (groupResult7.data) {
    //       expect(
    //         parseInt(groupResult7.data.addMovieGroup)
    //       ).toBeGreaterThanOrEqual(1);
    //     }
    //   });

    //   test("Adding a movie to a group", async () => {
    //     movieResult2 = await testServer.executeOperation({
    //       query:
    //         "mutation CreateMovie($mediaFullPath: String!, $gid: ID, $listOrder: Int, $title: String) { addMovie(mediaFullPath: $mediaFullPath, gid: $gid, listOrder: $listOrder, movieInfo: { title: $title } ) }",
    //       variables: {
    //         mediaFullPath: mediaFullPath2,
    //         gid: groupResult7.data?.addMovieGroup,
    //         listOrder: 1,
    //         title: title2,
    //       },
    //     });

    //     expect(movieResult2.errors).toBeUndefined();

    //     if (movieResult2.data) {
    //       expect(movieResult2.data.addMovie).toBe(`MOVIE_${mediaFullPath2}`);
    //     }
    //   });

    //   test("Adding a movie to a group", async () => {
    //     movieResult3 = await testServer.executeOperation({
    //       query:
    //         "mutation CreateMovie($mediaFullPath: String!, $gid: ID, $listOrder: Int, $title: String) { addMovie(mediaFullPath: $mediaFullPath, gid: $gid, listOrder: $listOrder, movieInfo: { title: $title } ) }",
    //       variables: {
    //         mediaFullPath: mediaFullPath3,
    //         gid: groupResult7.data?.addMovieGroup,
    //         listOrder: 2,
    //         title: title3,
    //       },
    //     });

    //     expect(movieResult3.errors).toBeUndefined();

    //     if (movieResult3.data) {
    //       expect(movieResult3.data.addMovie).toBe(`MOVIE_${mediaFullPath3}`);
    //     }
    //   });

    //   test("Adding a movie to a group", async () => {
    //     movieResult5 = await testServer.executeOperation({
    //       query:
    //         "mutation CreateMovie($mediaFullPath: String!, $gid: ID, $listOrder: Int, $title: String) { addMovie(mediaFullPath: $mediaFullPath, gid: $gid, listOrder: $listOrder, movieInfo: { title: $title } ) }",
    //       variables: {
    //         mediaFullPath: mediaFullPath5,
    //         gid: groupResult7.data?.addMovieGroup,
    //         listOrder: 1,
    //         title: title5,
    //       },
    //     });

    //     expect(movieResult5.errors).toBeUndefined();

    //     if (movieResult5.data) {
    //       expect(movieResult5.data.addMovie).toBe(`MOVIE_${mediaFullPath5}`);
    //     }
    //   });

    //   test("Adding a movie to a group", async () => {
    //     movieResult6 = await testServer.executeOperation({
    //       query:
    //         "mutation CreateMovie($mediaFullPath: String!, $gid: ID, $listOrder: Int, $title: String) { addMovie(mediaFullPath: $mediaFullPath, gid: $gid, listOrder: $listOrder, movieInfo: { title: $title } ) }",
    //       variables: {
    //         mediaFullPath: mediaFullPath6,
    //         gid: groupResult7.data?.addMovieGroup,
    //         listOrder: 2,
    //         title: title6,
    //       },
    //     });

    //     expect(movieResult6.errors).toBeUndefined();

    //     if (movieResult6.data) {
    //       expect(movieResult6.data.addMovie).toBe(`MOVIE_${mediaFullPath6}`);
    //     }
    //   });

    //   test("Adding a movie to a group", async () => {
    //     movieResult7 = await testServer.executeOperation({
    //       query:
    //         "mutation CreateMovie($mediaFullPath: String!, $gid: ID, $listOrder: Int, $title: String) { addMovie(mediaFullPath: $mediaFullPath, gid: $gid, listOrder: $listOrder, movieInfo: { title: $title } ) }",
    //       variables: {
    //         mediaFullPath: mediaFullPath7,
    //         gid: groupResult7.data?.addMovieGroup,
    //         listOrder: 3,
    //         title: title7,
    //       },
    //     });

    //     expect(movieResult7.errors).toBeUndefined();

    //     if (movieResult7.data) {
    //       expect(movieResult7.data.addMovie).toBe(`MOVIE_${mediaFullPath7}`);
    //     }
    //   });

    //   describe.each`
    //     first        | afterInfo                                                           | last         | beforeInfo                                                          | offset       | expPrevPage | expNextPage | expData
    //     ${undefined} | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[[title5, 1], [title6, 2], [title7, 3], [title2, 4], [title3, 5]]}
    //     ${2}         | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[title5, 1], [title6, 2]]}
    //     ${2}         | ${{ type: CursorInfoType.END_CURSOR, resOffset: -1 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[title7, 3], [title2, 4]]}
    //     ${2}         | ${{ type: CursorInfoType.END_CURSOR, resOffset: -1 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[title3, 5]]}
    //     ${2}         | ${{ type: CursorInfoType.END_CURSOR, resOffset: -1 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -2 }}             | ${undefined} | ${true}     | ${true}     | ${[[title7, 3], [title2, 4]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -1 }}             | ${undefined} | ${false}    | ${true}     | ${[[title5, 1], [title6, 2]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -1 }}             | ${undefined} | ${false}    | ${false}    | ${[]}
    //     ${7}         | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[[title5, 1], [title6, 2], [title7, 3], [title2, 4], [title3, 5]]}
    //     ${undefined} | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${1}         | ${true}     | ${false}    | ${[[title6, 2], [title7, 3], [title2, 4], [title3, 5]]}
    //     ${2}         | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${1}         | ${true}     | ${true}     | ${[[title6, 2], [title7, 3]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.START_CURSOR, resOffset: -1 }}             | ${undefined} | ${false}    | ${true}     | ${[[title5, 1]]}
    //     ${2}         | ${{ type: CursorInfoType.END_CURSOR, resOffset: -2 }}               | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[title2, 4], [title3, 5]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[title2, 4], [title3, 5]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${2}         | ${true}     | ${true}     | ${[[title6, 2], [title7, 3]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${3}         | ${false}    | ${true}     | ${[[title5, 1], [title6, 2]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${4}         | ${false}    | ${true}     | ${[[title5, 1]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${5}         | ${false}    | ${false}    | ${[]}
    //     ${3}         | ${undefined}                                                        | ${undefined} | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[title5, 1], [title6, 2], [title7, 3]]}
    //     ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 1 }} | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[title7, 3], [title2, 4], [title3, 5]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[title6, 2], [title7, 3]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[title2, 4], [title3, 5]]}
    //     ${undefined} | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[title7, 3], [title2, 4]]}
    //     ${2}         | ${undefined}                                                        | ${2}         | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[title5, 1], [title6, 2]]}
    //     ${2}         | ${undefined}                                                        | ${1}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[title6, 2]]}
    //     ${2}         | ${undefined}                                                        | ${3}         | ${undefined}                                                        | ${undefined} | ${false}    | ${true}     | ${[[title5, 1], [title6, 2]]}
    //     ${2}         | ${undefined}                                                        | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[title5, 1], [title6, 2]]}
    //     ${5}         | ${undefined}                                                        | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${false}    | ${[[title5, 1], [title6, 2], [title7, 3], [title2, 4]]}
    //     ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${false}    | ${[[title2, 4], [title3, 5]]}
    //     ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${5}         | ${undefined}                                                        | ${undefined} | ${false}    | ${false}    | ${[[title6, 2], [title7, 3], [title2, 4], [title3, 5]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[title6, 2], [title7, 3]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[title6, 2], [title7, 3]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${1}         | ${undefined}                                                        | ${undefined} | ${true}     | ${true}     | ${[[title7, 3]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[title6, 2], [title7, 3]]}
    //     ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[title6, 2], [title7, 3], [title2, 4]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${undefined} | ${true}     | ${true}     | ${[[title6, 2], [title7, 3]]}
    //     ${3}         | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[title6, 2], [title7, 3]]}
    //     ${2}         | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[title5, 1], [title6, 2]]}
    //     ${1}         | ${undefined}                                                        | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[title5, 1]]}
    //     ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[title7, 3], [title2, 4]]}
    //     ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[title6, 2], [title7, 3], [title2, 4]]}
    //     ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${true}     | ${[[title6, 2], [title7, 3], [title2, 4]]}
    //     ${undefined} | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${false}    | ${false}    | ${[]}
    //     ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[title6, 2], [title7, 3], [title2, 4]]}
    //     ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[title6, 2], [title7, 3], [title2, 4]]}
    //     ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[title7, 3], [title2, 4]]}
    //     ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[title6, 2], [title7, 3], [title2, 4]]}
    //     ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[title6, 2], [title7, 3], [title2, 4]]}
    //     ${3}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${false}    | ${[[title7, 3], [title2, 4]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${4}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[title6, 2], [title7, 3]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[title6, 2], [title7, 3]]}
    //     ${2}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 0 }} | ${1}         | ${{ type: CursorInfoType.EDGE_CURSOR, resOffset: 0, edgeIndex: 4 }} | ${undefined} | ${true}     | ${true}     | ${[[title7, 3]]}
    //   `(
    //     "Getting movies in group (first=$first, afer=$afterInfo, last=$last, before=$beforeInfo, offset=$offset)",
    //     ({
    //       first,
    //       afterInfo,
    //       last,
    //       beforeInfo,
    //       offset,
    //       expPrevPage,
    //       expNextPage,
    //       expData,
    //     }: IPagingInfo) => {
    //       test("", async () => {
    //         const { variables, params, variablesObj } = _getGraphQLPagingParams(
    //           first,
    //           afterInfo,
    //           last,
    //           beforeInfo,
    //           offset,
    //           results,
    //           "movies",
    //           (result: GraphQLResponse) => {
    //             const movieGroupsConnection = (
    //               result.data as Record<string, unknown>
    //             )["movieGroups"] as IConnection<Partial<IMovieGroup>>;
    //             return movieGroupsConnection.nodes[0].movies as IConnection<
    //               Partial<IMovie>
    //             >;
    //           }
    //         );

    //         const result = await testServer.executeOperation({
    //           query: `query GetMovieGroups${variables} { movieGroups { nodes { name movies${params} { 
    //           edges { 
    //             node { title listOrder } 
    //             cursor 
    //           }
    //           pageInfo {
    //             hasPreviousPage
    //             hasNextPage
    //             startCursor
    //             endCursor
    //           }
    //         } } } }`,
    //           ...variablesObj,
    //         });

    //         results.push(result);

    //         expect(result.data).toBeTruthy();

    //         if (result.data) {
    //           const movieGroupsConnection = result.data[
    //             "movieGroups"
    //           ] as IConnection<Partial<IMovieGroup>>;
    //           expect(movieGroupsConnection.edges).not.toBeNull();

    //           const nodes = movieGroupsConnection.nodes;

    //           if (nodes) {
    //             expect(nodes.length).toBe(1);
    //             //===
    //             const row = nodes[0];

    //             expect(row.name).toBe(groupName7);

    //             if (row.movies) {
    //               const edges = row.movies.edges;
    //               expect(edges).not.toBeNull();

    //               expect(row.movies.pageInfo.hasPreviousPage).toBe(expPrevPage);
    //               expect(row.movies.pageInfo.hasNextPage).toBe(expNextPage);

    //               if (edges) {
    //                 expect(edges.length).toBe(expData.length);
    //                 //===
    //                 for (let i = 0; i < edges.length; i++) {
    //                   const row = edges[i].node;

    //                   expect(row.title).toBe(expData[i][0]);
    //                   expect(row.listOrder).toBe(expData[i][1]);
    //                 }
    //               }
    //             }
    //           }
    //         }
    //       });
    //     }
    //   );
    // });

    describe("Testing groups of movies & group types", () => {
      const groupTypeName = "Director";
      const groupTypeName2 = "Writer";
      //===
      const groupName = "Ridley Scott";
      const groupName2 = "Stephen King";
      //===
      const movieTitle = `Alien (1979)`;
      const movieFolder = `Alien (1979)`;
      const movieMediaFullPath = `C:\\Movies\\${movieFolder}\\Alien.(1979).mkv`;
      //===
      let groupTypeResult: GraphQLResponse;
      let groupTypeResult2: GraphQLResponse;
      let groupResult: GraphQLResponse;
      let groupResult2: GraphQLResponse;
      let movieResult: GraphQLResponse;

      beforeAll(async () => {
        await _initData();
      });
      afterAll(async () => {
        await _uninitData();
      });

      test("Adding a group type", async () => {
        groupTypeResult = await testServer.executeOperation({
          query:
            "mutation CreateGroupType($name: String!, $description: String) { addGroupType(groupTypeInfo: { name: $name, description: $description } ) }",
          variables: { name: groupTypeName },
        });

        expect(groupTypeResult.errors).toBeUndefined();

        if (groupTypeResult.data) {
          expect(
            parseInt(groupTypeResult.data.addGroupType)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Add a group of movies of given type", async () => {
        groupResult = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($tid: ID, $name: String) { addMovieGroup(tid: $tid, movieGroupInfo: { name: $name } ) }",
          variables: {
            tid: groupTypeResult.data?.addGroupType,
            name: groupName,
          },
        });

        expect(groupResult.errors).toBeUndefined();

        if (groupResult.data) {
          expect(
            parseInt(groupResult.data.addMovieGroup)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Getting all movie groups", async () => {
        const result2 = await testServer.executeOperation({
          query:
            "query GetMovieGroups { movieGroups { edges { node { _id name groupType { name } } } } }",
        });

        expect(result2.data).toBeTruthy();

        if (result2.data) {
          const movieGroupsConnection = result2.data[
            "movieGroups"
          ] as IConnection<Partial<IMovieGroup>>;
          expect(movieGroupsConnection.edges).not.toBeNull();

          if (movieGroupsConnection.edges) {
            const row0 = movieGroupsConnection.edges[0].node;

            if (row0._id !== undefined) {
              expect(parseInt(row0._id)).toBeGreaterThanOrEqual(1);
            }

            expect(row0.name).toBe(groupName);
            expect(row0.groupType).not.toBeNull();

            if (row0.groupType) {
              expect(row0.groupType.name).toBe(groupTypeName);
            }
          }
        }
      });

      test("Getting given movie group", async () => {
        const result2 = await testServer.executeOperation({
          query: `query GetMovieGroup($_id: ID!) { 
              movieGroup(_id: $_id) { 
                _id name groupType { name } 
              } 
            }`,

          variables: { _id: groupResult.data?.addMovieGroup },
        });

        expect(result2.data).toBeTruthy();

        if (result2.data) {
          const movieGroup = result2.data["movieGroup"] as Partial<IMovieGroup>;
          expect(movieGroup).not.toBeNull();

          if (movieGroup) {
            if (movieGroup._id !== undefined) {
              expect(parseInt(movieGroup._id)).toBeGreaterThanOrEqual(1);
            }

            expect(movieGroup.name).toBe(groupName);
            expect(movieGroup.groupType).not.toBeNull();

            if (movieGroup.groupType) {
              expect(movieGroup.groupType.name).toBe(groupTypeName);
            }
          }
        }
      });

      test("Adding a movie", async () => {
        movieResult = await testServer.executeOperation({
          query:
            "mutation CreateMovie($mediaFullPath: String!, $gid: ID, $title: String) { addMovie(mediaFullPath: $mediaFullPath, gid: $gid, movieInfo: { title: $title } ) }",
          variables: {
            mediaFullPath: movieMediaFullPath,
            gid: groupResult.data?.addMovieGroup,
            title: movieTitle,
          },
        });

        expect(movieResult.errors).toBeUndefined();

        if (movieResult.data) {
          expect(movieResult.data.addMovie).toBe(`MOVIE_${movieMediaFullPath}`);
        }
      });

      test("Getting given movie", async () => {
        const result = await testServer.executeOperation({
          query: `query GetMovie($_id: ID!) { 
              movie(_id: $_id) { 
                _id title mediaFullPath 
                movieGroups {
                  nodes { 
                    groupType {
                      name
                    }
                  }
                } 
              } 
            }`,
          variables: { _id: movieResult.data?.addMovie },
        });

        expect(result.data).toBeTruthy();

        if (result.data) {
          const movie = result.data["movie"] as IMovie;
          expect(movie._id).toBe(`MOVIE_${movieMediaFullPath}`);
          expect(movie.title).toBe(movieTitle);
          expect(movie.mediaFullPath).toBe(movieMediaFullPath);

          expect(movie.movieGroups).not.toBeNull();

          if (movie.movieGroups) {
            const movieGroups = movie.movieGroups.nodes;

            expect(movieGroups).not.toBeNull();

            if (movieGroups) {
              expect(movieGroups.length).toBe(1);

              const movieGroup0 = movieGroups[0];

              expect(movieGroup0.groupType).not.toBeNull();

              if (movieGroup0.groupType) {
                expect(movieGroup0.groupType.name).toBe(groupTypeName);
              }
            }
          }
        }
      });

      test("Adding a group type", async () => {
        groupTypeResult2 = await testServer.executeOperation({
          query:
            "mutation CreateGroupType($name: String!, $description: String) { addGroupType(groupTypeInfo: { name: $name, description: $description } ) }",
          variables: { name: groupTypeName2 },
        });

        expect(groupTypeResult2.errors).toBeUndefined();

        if (groupTypeResult2.data) {
          expect(
            parseInt(groupTypeResult2.data.addGroupType)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Add a group of movies of given type", async () => {
        groupResult2 = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($tid: ID, $name: String) { addMovieGroup(tid: $tid, movieGroupInfo: { name: $name } ) }",
          variables: {
            tid: groupTypeResult2.data?.addGroupType,
            name: groupName2,
          },
        });

        expect(groupResult2.errors).toBeUndefined();

        if (groupResult2.data) {
          expect(
            parseInt(groupResult2.data.addMovieGroup)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Getting all group types", async () => {
        const result = await testServer.executeOperation({
          query: `query GetGroupTypes { 
              groupTypes { 
                nodes {
                  _id name description 

                  movieGroups {
                    nodes {
                      name
                    }
                  }
                }
              } 
            }`,
        });

        expect(result.errors).toBeUndefined();
        expect(result.data).toBeTruthy();

        if (result.data) {
          const groupTypesConnection = result.data["groupTypes"] as IConnection<
            Partial<IGroupType>
          >;
          expect(groupTypesConnection.nodes).not.toBeNull();

          if (groupTypesConnection.nodes) {
            expect(groupTypesConnection.nodes.length).toBe(2);

            const groupType0 = groupTypesConnection.nodes[0];
            if (groupType0._id !== undefined) {
              expect(parseInt(groupType0._id)).toBeGreaterThanOrEqual(1);
            }
            expect(groupType0.name).toBe(groupTypeName);

            expect(groupType0.movieGroups).not.toBeNull();

            if (groupType0.movieGroups) {
              expect(groupType0.movieGroups.nodes).not.toBeNull();

              if (groupType0.movieGroups.nodes) {
                expect(groupType0.movieGroups.nodes.length).toBe(1);
                const movieGroup0 = groupType0.movieGroups.nodes[0];
                expect(movieGroup0.name).toBe(groupName);
              }
            }

            //==
            const groupType1 = groupTypesConnection.nodes[1];
            if (groupType1._id !== undefined) {
              expect(parseInt(groupType1._id)).toBeGreaterThanOrEqual(1);
            }
            expect(groupType1.name).toBe(groupTypeName2);

            expect(groupType1.movieGroups).not.toBeNull();

            if (groupType1.movieGroups) {
              expect(groupType1.movieGroups.nodes).not.toBeNull();

              if (groupType1.movieGroups.nodes) {
                expect(groupType1.movieGroups.nodes.length).toBe(1);
                const movieGroup0 = groupType1.movieGroups.nodes[0];
                expect(movieGroup0.name).toBe(groupName2);
              }
            }
          }
        }
      });

      test("Getting given group type", async () => {
        const result = await testServer.executeOperation({
          query: `query GetGroupType($_id: ID!) { 
              groupType(_id: $_id) { 
                _id name description 

                movieGroups {
                  nodes {
                    name
                  }
                }
              } 
            }`,
          variables: { _id: groupTypeResult.data?.addGroupType },
        });

        expect(result.errors).toBeUndefined();
        expect(result.data).toBeTruthy();

        if (result.data) {
          const groupType = result.data["groupType"] as Partial<IGroupType>;

          if (groupType._id !== undefined) {
            expect(parseInt(groupType._id)).toBeGreaterThanOrEqual(1);
          }
          expect(groupType.name).toBe(groupTypeName);

          expect(groupType.movieGroups).not.toBeNull();

          if (groupType.movieGroups) {
            expect(groupType.movieGroups.nodes).not.toBeNull();

            if (groupType.movieGroups.nodes) {
              expect(groupType.movieGroups.nodes.length).toBe(1);
              const movieGroup0 = groupType.movieGroups.nodes[0];
              expect(movieGroup0.name).toBe(groupName);
            }
          }
        }
      });
    });

    describe("Testing moving/removing movie group to/from group type", () => {
      const groupTypeName = "Director";
      const groupTypeName2 = "Writer";
      const groupTypeName3 = "Genre";
      //===
      const groupName = "Ridley Scott";
      const groupName2 = "Stephen King";
      const groupName3 = "Horror";
      const groupName4 = "Sci-Fi";
      //===
      let groupTypeResult: GraphQLResponse;
      let groupTypeResult2: GraphQLResponse;
      let groupTypeResult3: GraphQLResponse;
      //===
      let groupResult: GraphQLResponse;
      let groupResult2: GraphQLResponse;
      let groupResult3: GraphQLResponse;
      let groupResult4: GraphQLResponse;

      beforeAll(async () => {
        await _initData();
      });
      afterAll(async () => {
        await _uninitData();
      });

      test("Adding a group type", async () => {
        groupTypeResult = await testServer.executeOperation({
          query:
            "mutation CreateGroupType($name: String!, $description: String) { addGroupType(groupTypeInfo: { name: $name, description: $description } ) }",
          variables: { name: groupTypeName },
        });

        expect(groupTypeResult.errors).toBeUndefined();

        if (groupTypeResult.data) {
          expect(
            parseInt(groupTypeResult.data.addGroupType)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Adding a group type", async () => {
        groupTypeResult2 = await testServer.executeOperation({
          query:
            "mutation CreateGroupType($name: String!, $description: String) { addGroupType(groupTypeInfo: { name: $name, description: $description } ) }",
          variables: { name: groupTypeName2 },
        });

        expect(groupTypeResult2.errors).toBeUndefined();

        if (groupTypeResult2.data) {
          expect(
            parseInt(groupTypeResult2.data.addGroupType)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Adding a group type", async () => {
        groupTypeResult3 = await testServer.executeOperation({
          query:
            "mutation CreateGroupType($name: String!, $description: String) { addGroupType(groupTypeInfo: { name: $name, description: $description } ) }",
          variables: { name: groupTypeName3 },
        });

        expect(groupTypeResult3.errors).toBeUndefined();

        if (groupTypeResult3.data) {
          expect(
            parseInt(groupTypeResult3.data.addGroupType)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Add a group of movies", async () => {
        groupResult = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: {
            name: groupName,
          },
        });

        expect(groupResult.errors).toBeUndefined();

        if (groupResult.data) {
          expect(
            parseInt(groupResult.data.addMovieGroup)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Add a group of movies", async () => {
        groupResult2 = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: {
            name: groupName2,
          },
        });

        expect(groupResult2.errors).toBeUndefined();

        if (groupResult2.data) {
          expect(
            parseInt(groupResult2.data.addMovieGroup)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Add a group of movies", async () => {
        groupResult3 = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: {
            name: groupName3,
          },
        });

        expect(groupResult3.errors).toBeUndefined();

        if (groupResult3.data) {
          expect(
            parseInt(groupResult3.data.addMovieGroup)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Add a group of movies", async () => {
        groupResult4 = await testServer.executeOperation({
          query:
            "mutation CreateMovieGroup($name: String) { addMovieGroup(movieGroupInfo: { name: $name } ) }",
          variables: {
            name: groupName4,
          },
        });

        expect(groupResult4.errors).toBeUndefined();

        if (groupResult4.data) {
          expect(
            parseInt(groupResult4.data.addMovieGroup)
          ).toBeGreaterThanOrEqual(1);
        }
      });

      test("Move a group of movies to group type", async () => {
        const result = await testServer.executeOperation({
          query: `mutation MoveMovieGroup2Type($_gid: ID!, $_tid: ID!) { 
              moveMovieGroup2Type(_gid: $_gid, _tid: $_tid) 
            }`,
          variables: {
            _gid: groupResult.data?.addMovieGroup, // "Ridley Scott"
            _tid: groupTypeResult3.data?.addGroupType, // "Genre"
          },
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.moveMovieGroup2Type).toBe(true);
      });

      test("Getting all group types", async () => {
        const result2 = await testServer.executeOperation({
          query: `query GetGroupTypes { 
              groupTypes { 
                nodes { 
                  name 
                  movieGroups { 
                    nodes { 
                      name 
                    } 
                  } 
                } 
              } 
            }`,
        });

        expect(result2.data).toBeTruthy();

        if (result2.data) {
          const groupTypesConnection = result2.data[
            "groupTypes"
          ] as IConnection<Partial<IGroupType>>;
          expect(groupTypesConnection.nodes).not.toBeNull();

          if (groupTypesConnection.nodes) {
            expect(groupTypesConnection.nodes.length).toBe(3);

            const groupType0 = groupTypesConnection.nodes[0];
            expect(groupType0.name).toBe(groupTypeName);

            expect(groupType0.movieGroups).not.toBeNull();

            if (groupType0.movieGroups) {
              expect(groupType0.movieGroups.nodes).not.toBeNull();

              if (groupType0.movieGroups.nodes) {
                expect(groupType0.movieGroups.nodes.length).toBe(0);
              }
            }
            //===
            const groupType1 = groupTypesConnection.nodes[1];
            expect(groupType1.name).toBe(groupTypeName3);

            expect(groupType1.movieGroups).not.toBeNull();

            if (groupType1.movieGroups) {
              expect(groupType1.movieGroups.nodes).not.toBeNull();

              if (groupType1.movieGroups.nodes) {
                expect(groupType1.movieGroups.nodes.length).toBe(1);

                const movieGroups = groupType1.movieGroups.nodes;

                const movieGroup0 = movieGroups[0];
                expect(movieGroup0.name).toBe(groupName);
              }
            }
            //===
            const groupType2 = groupTypesConnection.nodes[2];
            expect(groupType2.name).toBe(groupTypeName2);

            expect(groupType2.movieGroups).not.toBeNull();

            if (groupType2.movieGroups) {
              expect(groupType2.movieGroups.nodes).not.toBeNull();

              if (groupType2.movieGroups.nodes) {
                expect(groupType2.movieGroups.nodes.length).toBe(0);
              }
            }
          }
        }
      });

      test("Move a group of movies to group type", async () => {
        const result = await testServer.executeOperation({
          query: `mutation MoveMovieGroup2Type($_gid: ID!, $_tid: ID!) { 
              moveMovieGroup2Type(_gid: $_gid, _tid: $_tid) 
            }`,
          variables: {
            _gid: groupResult.data?.addMovieGroup, // "Ridley Scott"
            _tid: groupTypeResult.data?.addGroupType, // "Director"
          },
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.moveMovieGroup2Type).toBe(true);
      });

      test("Getting all group types", async () => {
        const result2 = await testServer.executeOperation({
          query: `query GetGroupTypes { 
              groupTypes { 
                nodes { 
                  name 
                  movieGroups { 
                    nodes { 
                      name 
                    } 
                  } 
                } 
              } 
            }`,
        });

        expect(result2.data).toBeTruthy();

        if (result2.data) {
          const groupTypesConnection = result2.data[
            "groupTypes"
          ] as IConnection<Partial<IGroupType>>;
          expect(groupTypesConnection.nodes).not.toBeNull();

          if (groupTypesConnection.nodes) {
            expect(groupTypesConnection.nodes.length).toBe(3);

            const groupType0 = groupTypesConnection.nodes[0];
            expect(groupType0.name).toBe(groupTypeName);

            expect(groupType0.movieGroups).not.toBeNull();

            if (groupType0.movieGroups) {
              expect(groupType0.movieGroups.nodes).not.toBeNull();

              if (groupType0.movieGroups.nodes) {
                expect(groupType0.movieGroups.nodes.length).toBe(1);

                const movieGroups = groupType0.movieGroups.nodes;

                const movieGroup0 = movieGroups[0];
                expect(movieGroup0.name).toBe(groupName);
              }
            }
            //===
            const groupType1 = groupTypesConnection.nodes[1];
            expect(groupType1.name).toBe(groupTypeName3);

            expect(groupType1.movieGroups).not.toBeNull();

            if (groupType1.movieGroups) {
              expect(groupType1.movieGroups.nodes).not.toBeNull();

              if (groupType1.movieGroups.nodes) {
                expect(groupType1.movieGroups.nodes.length).toBe(0);
              }
            }
            //===
            const groupType2 = groupTypesConnection.nodes[2];
            expect(groupType2.name).toBe(groupTypeName2);

            expect(groupType2.movieGroups).not.toBeNull();

            if (groupType2.movieGroups) {
              expect(groupType2.movieGroups.nodes).not.toBeNull();

              if (groupType2.movieGroups.nodes) {
                expect(groupType2.movieGroups.nodes.length).toBe(0);
              }
            }
          }
        }
      });

      test("Move a group of movies to group type", async () => {
        const result = await testServer.executeOperation({
          query: `mutation MoveMovieGroup2Type($_gid: ID!, $_tid: ID!) { 
              moveMovieGroup2Type(_gid: $_gid, _tid: $_tid) 
            }`,
          variables: {
            _gid: groupResult2.data?.addMovieGroup, // "Stephen King"
            _tid: groupTypeResult2.data?.addGroupType, // "Writer"
          },
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.moveMovieGroup2Type).toBe(true);
      });

      test("Move a group of movies to group type", async () => {
        const result = await testServer.executeOperation({
          query: `mutation MoveMovieGroup2Type($_gid: ID!, $_tid: ID!) { 
              moveMovieGroup2Type(_gid: $_gid, _tid: $_tid) 
            }`,
          variables: {
            _gid: groupResult3.data?.addMovieGroup, // "Horror"
            _tid: groupTypeResult3.data?.addGroupType, // "Genre"
          },
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.moveMovieGroup2Type).toBe(true);
      });

      test("Move a group of movies to group type", async () => {
        const result = await testServer.executeOperation({
          query: `mutation MoveMovieGroup2Type($_gid: ID!, $_tid: ID!) { 
              moveMovieGroup2Type(_gid: $_gid, _tid: $_tid) 
            }`,
          variables: {
            _gid: groupResult4.data?.addMovieGroup, // "Sci-Fi"
            _tid: groupTypeResult3.data?.addGroupType, // "Genre"
          },
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.moveMovieGroup2Type).toBe(true);
      });

      test("Getting all group types", async () => {
        const result2 = await testServer.executeOperation({
          query: `query GetGroupTypes { 
              groupTypes { 
                nodes { 
                  name 
                  movieGroups { 
                    nodes { 
                      name 
                    } 
                  } 
                } 
              } 
            }`,
        });

        expect(result2.data).toBeTruthy();

        if (result2.data) {
          const groupTypesConnection = result2.data[
            "groupTypes"
          ] as IConnection<Partial<IGroupType>>;
          expect(groupTypesConnection.nodes).not.toBeNull();

          if (groupTypesConnection.nodes) {
            expect(groupTypesConnection.nodes.length).toBe(3);

            const groupType0 = groupTypesConnection.nodes[0];
            expect(groupType0.name).toBe(groupTypeName);

            expect(groupType0.movieGroups).not.toBeNull();

            if (groupType0.movieGroups) {
              expect(groupType0.movieGroups.nodes).not.toBeNull();

              if (groupType0.movieGroups.nodes) {
                expect(groupType0.movieGroups.nodes.length).toBe(1);

                const movieGroups = groupType0.movieGroups.nodes;

                const movieGroup0 = movieGroups[0];
                expect(movieGroup0.name).toBe(groupName);
              }
            }
            //===
            const groupType1 = groupTypesConnection.nodes[1];
            expect(groupType1.name).toBe(groupTypeName3);

            expect(groupType1.movieGroups).not.toBeNull();

            if (groupType1.movieGroups) {
              expect(groupType1.movieGroups.nodes).not.toBeNull();

              if (groupType1.movieGroups.nodes) {
                expect(groupType1.movieGroups.nodes.length).toBe(2);

                const movieGroups = groupType1.movieGroups.nodes;

                const movieGroup0 = movieGroups[0];
                expect(movieGroup0.name).toBe(groupName3);
                //===
                const movieGroup1 = movieGroups[1];
                expect(movieGroup1.name).toBe(groupName4);
              }
            }
            //===
            const groupType2 = groupTypesConnection.nodes[2];
            expect(groupType2.name).toBe(groupTypeName2);

            expect(groupType2.movieGroups).not.toBeNull();

            if (groupType2.movieGroups) {
              expect(groupType2.movieGroups.nodes).not.toBeNull();

              if (groupType2.movieGroups.nodes) {
                expect(groupType2.movieGroups.nodes.length).toBe(1);

                const movieGroups = groupType2.movieGroups.nodes;

                const movieGroup0 = movieGroups[0];
                expect(movieGroup0.name).toBe(groupName2);
              }
            }
          }
        }
      });

      test("Remove a group of movies from group type", async () => {
        const result = await testServer.executeOperation({
          query: `mutation RemoveMovieGroupFromType($_gid: ID!) { 
              removeMovieGroupFromType(_gid: $_gid) 
            }`,
          variables: {
            _gid: groupResult4.data?.addMovieGroup, // "Sci-Fi"
          },
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.removeMovieGroupFromType).toBe(true);
      });

      test("Getting all group types", async () => {
        const result2 = await testServer.executeOperation({
          query: `query GetGroupTypes { 
              groupTypes { 
                nodes { 
                  name 
                  movieGroups { 
                    nodes { 
                      name 
                    } 
                  } 
                } 
              } 
            }`,
        });

        expect(result2.data).toBeTruthy();

        if (result2.data) {
          const groupTypesConnection = result2.data[
            "groupTypes"
          ] as IConnection<Partial<IGroupType>>;
          expect(groupTypesConnection.nodes).not.toBeNull();

          if (groupTypesConnection.nodes) {
            expect(groupTypesConnection.nodes.length).toBe(3);

            const groupType0 = groupTypesConnection.nodes[0];
            expect(groupType0.name).toBe(groupTypeName);

            expect(groupType0.movieGroups).not.toBeNull();

            if (groupType0.movieGroups) {
              expect(groupType0.movieGroups.nodes).not.toBeNull();

              if (groupType0.movieGroups.nodes) {
                expect(groupType0.movieGroups.nodes.length).toBe(1);

                const movieGroups = groupType0.movieGroups.nodes;

                const movieGroup0 = movieGroups[0];
                expect(movieGroup0.name).toBe(groupName);
              }
            }
            //===
            const groupType1 = groupTypesConnection.nodes[1];
            expect(groupType1.name).toBe(groupTypeName3);

            expect(groupType1.movieGroups).not.toBeNull();

            if (groupType1.movieGroups) {
              expect(groupType1.movieGroups.nodes).not.toBeNull();

              if (groupType1.movieGroups.nodes) {
                expect(groupType1.movieGroups.nodes.length).toBe(1);

                const movieGroups = groupType1.movieGroups.nodes;

                const movieGroup0 = movieGroups[0];
                expect(movieGroup0.name).toBe(groupName3);
              }
            }
            //===
            const groupType2 = groupTypesConnection.nodes[2];
            expect(groupType2.name).toBe(groupTypeName2);

            expect(groupType2.movieGroups).not.toBeNull();

            if (groupType2.movieGroups) {
              expect(groupType2.movieGroups.nodes).not.toBeNull();

              if (groupType2.movieGroups.nodes) {
                expect(groupType2.movieGroups.nodes.length).toBe(1);

                const movieGroups = groupType2.movieGroups.nodes;

                const movieGroup0 = movieGroups[0];
                expect(movieGroup0.name).toBe(groupName2);
              }
            }
          }
        }
      });
    });

    /*
      const groupTypeName = "Director";
      const groupTypeName2 = "Writer";
      const groupTypeName3 = "Genre";
      //===
      const groupName = "Ridley Scott";
      const groupName2 = "Stephen King";
      const groupName3 = "Horror";
      const groupName4 = "Sci-Fi";
*/
    /*
test("", async () => {
});
*/
  }
);
