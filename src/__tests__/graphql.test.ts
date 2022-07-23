import { ApolloServer } from "apollo-server-express";
import { typeDefs } from "../graphql/defs";
import {
  IDataSources,
  IGroupType,
  IMovie,
  IMovieGroup,
  resolvers,
} from "../graphql/resolvers";
import knx, { Knex } from "knex";
import type { DBDataMovieManagerCyberlink } from "../database/db-data-moviemanager-cyberlink";
import { DataSources } from "apollo-server-core/dist/graphqlOptions";
import { AppPlatformType } from "../common/types";
import { MoviesDataSource } from "../datasources/movies-data-source";
import { dateToUTCString } from "../database/utils";
import { IConnection, IEdge } from "../graphql/connection";
import { GraphQLResponse } from "apollo-server-core";

jest.setTimeout(60000);

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
  graphQLFieldName: string
) => {
  if (cursorInfo !== undefined) {
    let cursor;
    const resIndex =
      cursorInfo.resOffset < 0
        ? results.length + cursorInfo.resOffset
        : cursorInfo.resOffset;

    if (cursorInfo.type === CursorInfoType.START_CURSOR) {
      cursor = (
        (results[resIndex].data as Record<string, unknown>)[
          graphQLFieldName
        ] as IConnection<Partial<IMovie>>
      ).pageInfo.startCursor;
    } else if (cursorInfo.type === CursorInfoType.END_CURSOR) {
      cursor = (
        (results[resIndex].data as Record<string, unknown>)[
          graphQLFieldName
        ] as IConnection<Partial<IMovie>>
      ).pageInfo.endCursor;
    } else if (cursorInfo.type === CursorInfoType.EDGE_CURSOR) {
      const edges = (
        (results[resIndex].data as Record<string, unknown>)[
          graphQLFieldName
        ] as IConnection<Partial<IMovie>>
      ).edges;

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
  graphQLFieldName: string
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
    graphQLFieldName
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
    graphQLFieldName
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
      let moviesDataSource: MoviesDataSource | undefined;

      const { MoviesDataSource } = await import(
        "../datasources/movies-data-source"
      );

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
        });

        const { DBDataMovieManagerCyberlink } = await import(
          "../database/db-data-moviemanager-cyberlink"
        );

        moviesDataSource = new MoviesDataSource(
          knex,
          DBDataMovieManagerCyberlink
        );
      } else if (appPlatform === "postgres") {
        knex = knx({
          client: "pg",
          connection: process.env.TEST_DATABASE_URL,
          // searchPath: ['knex', 'public'],
        });

        const { DBDataMovieManagerPostgres } = await import(
          "../database/db-data-moviemanager-postgres"
        );

        moviesDataSource = new MoviesDataSource(
          knex,
          DBDataMovieManagerPostgres
        );

        // remove database content
        await moviesDataSource.init();

        let tab;
        const dbDataMovieManager = moviesDataSource["_dbDataMovieManager"];

        let indx = 0;
        while ((tab = dbDataMovieManager.dbcldb.getTable(indx++)) != null)
          await dbDataMovieManager.clearTable(tab);
        //==
        indx = 0;
        while ((tab = dbDataMovieManager.dbextra.getTable(indx++)) != null)
          await dbDataMovieManager.clearTable(tab);
        //==
        indx = 0;
        while (
          (tab = dbDataMovieManager.dbmediaScannerCache.getTable(indx++)) !=
          null
        )
          await dbDataMovieManager.clearTable(tab);
        //==
        indx = 0;
        while ((tab = dbDataMovieManager.dbmoviemedia.getTable(indx++)) != null)
          await dbDataMovieManager.clearTable(tab);
        //==
        indx = 0;
        while ((tab = dbDataMovieManager.dbplaylist.getTable(indx++)) != null)
          await dbDataMovieManager.clearTable(tab);
      }

      if (moviesDataSource) {
        await moviesDataSource.init();

        testServer = new ApolloServer({
          typeDefs,
          resolvers,
          dataSources: (): DataSources<IDataSources> =>
            ({ moviesDataSource } as { moviesDataSource: MoviesDataSource }),
        });
      }
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
          variables: { _id: "non-existing" },
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
          const moviesConnection = result2.data["groupTypes"] as IConnection<
            Partial<IGroupType>
          >;
          expect(moviesConnection.edges).not.toBeNull();

          if (moviesConnection.edges) {
            const row0 = moviesConnection.edges[0].node;
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
          variables: { _id: "non-existing" },
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
          expect(parseInt(result2.data.addGroupType)).toBeGreaterThanOrEqual(
            1
          );
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
          expect(parseInt(result3.data.addGroupType)).toBeGreaterThanOrEqual(
            1
          );
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
          expect(parseInt(result4.data.addGroupType)).toBeGreaterThanOrEqual(
            1
          );
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
          expect(parseInt(result5.data.addGroupType)).toBeGreaterThanOrEqual(
            1
          );
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
              expect(groupTypesConnection.pageInfo.hasNextPage).toBe(expNextPage);

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

    /*
test("", async () => {
});
*/
  }
);
