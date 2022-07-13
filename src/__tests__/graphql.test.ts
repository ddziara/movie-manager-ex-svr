import { ApolloServer } from "apollo-server-express";
import { typeDefs } from "../graphql/defs";
import {
  IDataSources,
  IMovie,
  resolvers,
  Visibility,
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

// ${"cyberlink"}
// ${"postgres"}
describe.each`
  appPlatform
  ${"cyberlink"}
  ${"postgres"}
`(
  "Testing GraphQL querries, mutations and subscriptions",
  ({ appPlatform }: { appPlatform: AppPlatformType }) => {
    let testServer: ApolloServer;
    let knex: Knex<Record<string, unknown>, unknown[]>;
    type DBConsts = { USE_FOLDER_COLUMN_IN_MOVIES: boolean };

    // ignore "cyberlink" tests on "postgres" platform
    const APP_PLATFORM = process.env["APP_PLATFORM"] as AppPlatformType;
    if (
      APP_PLATFORM === "postgres" &&
      (appPlatform as AppPlatformType) === "cyberlink"
    )
      return;

    beforeAll(async () => {
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
    });

    afterAll(() => {
      if (appPlatform === "cyberlink") {
        jest.dontMock("../database/db-path-cyberlink");
      }
    });

    beforeEach(async () => {
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
    });

    afterEach(async () => {
      await knex.destroy();
    });

    test("Adding/getting/updating/getting/deleting/getting movie", async () => {
      // adding a movie
      const title = `The Perfect Storm (2000)`;
      const folder = `Perfect Storm (2000), The `;
      const mediaFullPath = `C:\\Movies\\${folder}\\The.Perfect.Storm.(2000).mkv`;

      const result = await testServer.executeOperation({
        query:
          "mutation CreateMovie($title: String, $mediaFullPath: String!) { addMovie(movieInfo: { title: $title, mediaFullPath: $mediaFullPath } ) }",
        variables: { title, mediaFullPath },
      });

      expect(result.errors).toBeUndefined();

      if (result.data) {
        expect(result.data.addMovie).toBe(`MOVIE_${mediaFullPath}`);
      }

      // getting all movies
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

      // getting given movie
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

      // getting non-existing movie
      const result4 = await testServer.executeOperation({
        query:
          "query GetMovie($_id: ID!) { movie(_id: $_id) { _id title mediaFullPath } }",
        variables: { _id: "non-existing" },
      });

      expect(result4.data).toBeTruthy();

      if (result4.data) {
        expect(result4.data["movie"]).toBeNull();
      }

      // updating given movie
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
      const releaseDate = dateToUTCString(/*dta*/new Date(2022, 6, 13, 10, 58, 8, 0));  
      const addDate = dateToUTCString(dta);
      const modifyDate = dateToUTCString(dta);
      const playDate = dateToUTCString(dta);
      const studio = "IFC";
      const protectedVal = true;

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

      // getting given movie
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

      // adding a movie
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

      const result7 = await testServer.executeOperation({
        query: `mutation CreateMovie($title: String, $mediaFullPath: String!, $description: String, $genre: String, $mediaType: Int, $length: String!, $mediaDuration: String!,
            $mediaSize: String!, $mediaRating: Int, $mediaResume: String!, $resolutionX: Int, $resolutionY: Int, $aspectRatioX: Int, $aspectRatioY: Int,
            $thumbnailResolutionX: Int, $thumbnailResolutionY: Int, $playCount: Int, $stereoType: String, 
            $infoFilePath: String, $isMovieFolder: Boolean, $visible: Visibility, $orientation: Int, $onlineInfoVisible: Int,
            $releaseDate: String, $addDate: String, $modifyDate: String, $playDate: String, $studio: String, $protected: Boolean ) { 
            addMovie(movieInfo: { 
              title: $title, mediaFullPath: $mediaFullPath, description: $description, genre: $genre, mediaType: $mediaType, length: { bigIntStr: $length }, mediaDuration: { bigIntStr: $mediaDuration },
              mediaSize: { bigIntStr: $mediaSize }, mediaRating: $mediaRating, mediaResume: { bigIntStr: $mediaResume },
              resolutionX: $resolutionX, resolutionY: $resolutionY, aspectRatioX: $aspectRatioX, aspectRatioY: $aspectRatioY,
              thumbnailResolutionX: $thumbnailResolutionX, thumbnailResolutionY: $thumbnailResolutionY, playCount: $playCount, stereoType: $stereoType,
              infoFilePath: $infoFilePath, isMovieFolder: $isMovieFolder, visible: $visible, orientation: $orientation, onlineInfoVisible: $onlineInfoVisible,
              releaseDate: $releaseDate, addDate: $addDate, modifyDate: $modifyDate, playDate: $playDate, studio: $studio, protected: $protected
            } 
          ) 
        }`,
        variables: {
          title: title2,
          mediaFullPath: mediaFullPath2,
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

      // getting given movie
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
        expect(BigInt(row["mediaDuration"]["bigIntStr"])).toBe(mediaDuration2);
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

      // deleting given movie
      const result9 = await testServer.executeOperation({
        query: `mutation RemoveMovie($_id: ID!) { 
            deleteMovie(_id: $_id) 
        }`,
        variables: { _id: result.data?.addMovie },
      });

      expect(result9.errors).toBeUndefined();

      // getting given movie
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

    test("Paging for movies", async () => {
      // adding a movie
      const title = `The Perfect Storm (2000)`;
      const folder = `Perfect Storm (2000), The`;
      const mediaFullPath = `C:\\Movies\\${folder}\\The.Perfect.Storm.(2000).mkv`;

      const result = await testServer.executeOperation({
        query:
          "mutation CreateMovie($title: String, $mediaFullPath: String!) { addMovie(movieInfo: { title: $title, mediaFullPath: $mediaFullPath } ) }",
        variables: { title, mediaFullPath },
      });

      expect(result.errors).toBeUndefined();

      if (result.data) {
        expect(result.data.addMovie).toBe(`MOVIE_${mediaFullPath}`);
      }

      // adding a movie
      const title2 = `Star Wars: Episode VI - Return of the Jedi (1983)`;
      const folder2 = `Star Wars; Episode VI - Return of the Jedi (1983)`;
      const mediaFullPath2 = `C:\\Movies\\${folder2}\\Star.Wars.Episode.VI.Return.of.the.Jedi.(1983).mkv`;

      const result2 = await testServer.executeOperation({
        query:
          "mutation CreateMovie($title: String, $mediaFullPath: String!) { addMovie(movieInfo: { title: $title, mediaFullPath: $mediaFullPath } ) }",
        variables: { title: title2, mediaFullPath: mediaFullPath2 },
      });

      expect(result2.errors).toBeUndefined();

      if (result2.data) {
        expect(result2.data.addMovie).toBe(`MOVIE_${mediaFullPath2}`);
      }

      // adding a movie
      const title3 = `Star Wars: Episode I - Phantom Menace, The (1999)`;
      const folder3 = `Star Wars; Episode I - The Phantom Menace (1999)`;
      const mediaFullPath3 = `C:\\Movies\\${folder3}\\Star.Wars.Episode.I.The.Phantom.Menace.(1999).mkv`;

      const result3 = await testServer.executeOperation({
        query:
          "mutation CreateMovie($title: String, $mediaFullPath: String!) { addMovie(movieInfo: { title: $title, mediaFullPath: $mediaFullPath } ) }",
        variables: { title: title3, mediaFullPath: mediaFullPath3 },
      });

      expect(result3.errors).toBeUndefined();

      if (result3.data) {
        expect(result3.data.addMovie).toBe(`MOVIE_${mediaFullPath3}`);
      }

      // adding a movie
      const title4 = `Star Wars: Episode II - Attack of the Clones (2002)`;
      const folder4 = `Star Wars; Episode II - Attack of the Clones (2002)`;
      const mediaFullPath4 = `C:\\Movies\\${folder4}\\Star.Wars.Episode.II.Attack.of.the.Clones.(2002).mkv`;

      const result4 = await testServer.executeOperation({
        query:
          "mutation CreateMovie($title: String, $mediaFullPath: String!) { addMovie(movieInfo: { title: $title, mediaFullPath: $mediaFullPath } ) }",
        variables: { title: title4, mediaFullPath: mediaFullPath4 },
      });

      expect(result4.errors).toBeUndefined();

      if (result4.data) {
        expect(result4.data.addMovie).toBe(`MOVIE_${mediaFullPath4}`);
      }

      // adding a movie
      const title5 = `Star Wars: Episode III - Revenge of the Sith (2005)`;
      const folder5 = `Star Wars; Episode III - Revenge of the Sith (2005)`;
      const mediaFullPath5 = `C:\\Movies\\${folder5}\\Star.Wars.Episode.III.Revenge.of.the.Sith.(2005).mkv`;

      const result5 = await testServer.executeOperation({
        query:
          "mutation CreateMovie($title: String, $mediaFullPath: String!) { addMovie(movieInfo: { title: $title, mediaFullPath: $mediaFullPath } ) }",
        variables: { title: title5, mediaFullPath: mediaFullPath5 },
      });

      expect(result5.errors).toBeUndefined();

      if (result5.data) {
        expect(result5.data.addMovie).toBe(`MOVIE_${mediaFullPath5}`);
      }

      // getting all movies
      const result6 = await testServer.executeOperation({
        query: `query GetMovies { movies { 
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
      });

      expect(result6.data).toBeTruthy();

      if (result6.data) {
        const moviesConnection = result6.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath3}`);
          expect(row0.title).toBe(title3);
          expect(row0.mediaFullPath).toBe(mediaFullPath3);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row1.title).toBe(title4);
          expect(row1.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge2 = moviesConnection.edges[2];
          expect(edge2.cursor).toMatch(base64RegExpr);
          const row2 = edge2.node;
          expect(row2._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row2.title).toBe(title5);
          expect(row2.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge3 = moviesConnection.edges[3];
          expect(edge3.cursor).toMatch(base64RegExpr);
          const row3 = edge3.node;
          expect(row3._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row3.title).toBe(title2);
          expect(row3.mediaFullPath).toBe(mediaFullPath2);
          //===
          const edge4 = moviesConnection.edges[4];
          expect(edge4.cursor).toMatch(base64RegExpr);
          const row4 = edge4.node;
          expect(row4._id).toBe(`MOVIE_${mediaFullPath}`);
          expect(row4.title).toBe(title);
          expect(row4.mediaFullPath).toBe(mediaFullPath);
          //===
          expect(moviesConnection.pageInfo.startCursor).toBe(edge0.cursor);
          expect(moviesConnection.pageInfo.endCursor).toBe(edge4.cursor);
        }
      }

      // getting movies (fist = 2)
      const result7 = await testServer.executeOperation({
        query: `query GetMovies($first: Int) { movies(first: $first) { 
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
        variables: {
          first: 2,
        },
      });

      expect(result7.data).toBeTruthy();

      if (result7.data) {
        const moviesConnection = result7.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath3}`);
          expect(row0.title).toBe(title3);
          expect(row0.mediaFullPath).toBe(mediaFullPath3);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row1.title).toBe(title4);
          expect(row1.mediaFullPath).toBe(mediaFullPath4);
        }
      }

      // getting movies (fist = 2, after = result7.data["movies"].pageInfo.endCursor)
      const result7a = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String) { movies(first: $first, after: $after) { 
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
        variables: {
          first: 2,
          after: (
            ((result7 as GraphQLResponse).data as Record<string, unknown>)[
              "movies"
            ] as IConnection<Partial<IMovie>>
          ).pageInfo.endCursor,
        },
      });

      expect(result7a.data).toBeTruthy();

      if (result7a.data) {
        const moviesConnection = result7a.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row0.title).toBe(title5);
          expect(row0.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row1.title).toBe(title2);
          expect(row1.mediaFullPath).toBe(mediaFullPath2);
        }
      }

      // getting movies (fist = 2, after = result7a.data["movies"].pageInfo.endCursor)
      const result7b = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String) { movies(first: $first, after: $after) { 
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
        variables: {
          first: 2,
          after: (
            ((result7a as GraphQLResponse).data as Record<string, unknown>)[
              "movies"
            ] as IConnection<Partial<IMovie>>
          ).pageInfo.endCursor,
        },
      });

      expect(result7b.data).toBeTruthy();

      if (result7b.data) {
        const moviesConnection = result7b.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(1);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath}`);
          expect(row0.title).toBe(title);
          expect(row0.mediaFullPath).toBe(mediaFullPath);
        }
      }

      // getting movies (fist = 2, after = result7b.data["movies"].pageInfo.endCursor)
      const result7c = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String) { movies(first: $first, after: $after) { 
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
        variables: {
          first: 2,
          after: (
            ((result7b as GraphQLResponse).data as Record<string, unknown>)[
              "movies"
            ] as IConnection<Partial<IMovie>>
          ).pageInfo.endCursor,
        },
      });

      expect(result7c.data).toBeTruthy();

      if (result7c.data) {
        const moviesConnection = result7c.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(0);
        }
      }

      // getting movies (last = 2, before = result7b.data["movies"].pageInfo.startCursor)
      const result7d = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $before: String) { movies(last: $last, before: $before) { 
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
        variables: {
          last: 2,
          before: (
            ((result7b as GraphQLResponse).data as Record<string, unknown>)[
              "movies"
            ] as IConnection<Partial<IMovie>>
          ).pageInfo.startCursor,
        },
      });

      expect(result7d.data).toBeTruthy();

      if (result7d.data) {
        const moviesConnection = result7d.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row0.title).toBe(title5);
          expect(row0.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row1.title).toBe(title2);
          expect(row1.mediaFullPath).toBe(mediaFullPath2);
        }
      }

      // getting movies (last = 2, before = result7d.data["movies"].pageInfo.startCursor)
      const result7e = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $before: String) { movies(last: $last, before: $before) { 
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
        variables: {
          last: 2,
          before: (
            ((result7d as GraphQLResponse).data as Record<string, unknown>)[
              "movies"
            ] as IConnection<Partial<IMovie>>
          ).pageInfo.startCursor,
        },
      });

      expect(result7e.data).toBeTruthy();

      if (result7e.data) {
        const moviesConnection = result7e.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath3}`);
          expect(row0.title).toBe(title3);
          expect(row0.mediaFullPath).toBe(mediaFullPath3);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row1.title).toBe(title4);
          expect(row1.mediaFullPath).toBe(mediaFullPath4);
        }
      }

      // getting movies (last = 2, before = result7e.data["movies"].pageInfo.startCursor)
      const result7f = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $before: String) { movies(last: $last, before: $before) { 
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
        variables: {
          last: 2,
          before: (
            ((result7e as GraphQLResponse).data as Record<string, unknown>)[
              "movies"
            ] as IConnection<Partial<IMovie>>
          ).pageInfo.startCursor,
        },
      });

      expect(result7f.data).toBeTruthy();

      if (result7f.data) {
        const moviesConnection = result7f.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(0);
        }
      }

      // getting movies (fist = 7)
      const result8 = await testServer.executeOperation({
        query: `query GetMovies($first: Int) { movies(first: $first) { 
          edges { 
            node { _id title mediaFullPath }
            cursor 
          }
        }
      }`,
        variables: {
          first: 7,
        },
      });

      expect(result8.data).toBeTruthy();

      if (result8.data) {
        const moviesConnection = result8.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(5);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath3}`);
          expect(row0.title).toBe(title3);
          expect(row0.mediaFullPath).toBe(mediaFullPath3);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row1.title).toBe(title4);
          expect(row1.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge2 = moviesConnection.edges[2];
          expect(edge2.cursor).toMatch(base64RegExpr);
          const row2 = edge2.node;
          expect(row2._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row2.title).toBe(title5);
          expect(row2.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge3 = moviesConnection.edges[3];
          expect(edge3.cursor).toMatch(base64RegExpr);
          const row3 = edge3.node;
          expect(row3._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row3.title).toBe(title2);
          expect(row3.mediaFullPath).toBe(mediaFullPath2);
          //===
          const edge4 = moviesConnection.edges[4];
          expect(edge4.cursor).toMatch(base64RegExpr);
          const row4 = edge4.node;
          expect(row4._id).toBe(`MOVIE_${mediaFullPath}`);
          expect(row4.title).toBe(title);
          expect(row4.mediaFullPath).toBe(mediaFullPath);
        }
      }

      // getting movies (offset = 1)
      const result9 = await testServer.executeOperation({
        query: `query GetMovies($offset: Int) { movies(offset: $offset) { 
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
        variables: {
          offset: 1,
        },
      });

      expect(result9.data).toBeTruthy();

      if (result9.data) {
        const moviesConnection = result9.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(4);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge2 = moviesConnection.edges[2];
          expect(edge2.cursor).toMatch(base64RegExpr);
          const row2 = edge2.node;
          expect(row2._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row2.title).toBe(title2);
          expect(row2.mediaFullPath).toBe(mediaFullPath2);
          //===
          const edge3 = moviesConnection.edges[3];
          expect(edge3.cursor).toMatch(base64RegExpr);
          const row3 = edge3.node;
          expect(row3._id).toBe(`MOVIE_${mediaFullPath}`);
          expect(row3.title).toBe(title);
          expect(row3.mediaFullPath).toBe(mediaFullPath);
        }
      }

      // getting movies (first = 2 offset = 1)
      const result10 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $offset: Int) { movies(first: $first, offset: $offset) { 
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
        variables: {
          first: 2,
          offset: 1,
        },
      });

      expect(result10.data).toBeTruthy();

      if (result10.data) {
        const moviesConnection = result10.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
        }
      }

      // getting movies (last = 2, before = result10.data["movies"].pageInfo.startCursor)
      const result10a = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $before: String) { movies(last: $last, before: $before) { 
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
        variables: {
          last: 2,
          before: (
            ((result10 as GraphQLResponse).data as Record<string, unknown>)[
              "movies"
            ] as IConnection<Partial<IMovie>>
          ).pageInfo.startCursor,
        },
      });

      expect(result10a.data).toBeTruthy();

      if (result10a.data) {
        const moviesConnection = result10a.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(1);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath3}`);
          expect(row0.title).toBe(title3);
          expect(row0.mediaFullPath).toBe(mediaFullPath3);
        }
      }

      // getting movies (first = 2, after = result10.data["movies"].pageInfo.endCursor)
      const result10b = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String) { movies(first: $first, after: $after) { 
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
        variables: {
          first: 2,
          after: (
            ((result10 as GraphQLResponse).data as Record<string, unknown>)[
              "movies"
            ] as IConnection<Partial<IMovie>>
          ).pageInfo.endCursor,
        },
      });

      expect(result10b.data).toBeTruthy();

      if (result10b.data) {
        const moviesConnection = result10b.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row0.title).toBe(title2);
          expect(row0.mediaFullPath).toBe(mediaFullPath2);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath}`);
          expect(row1.title).toBe(title);
          expect(row1.mediaFullPath).toBe(mediaFullPath);
        }
      }

      // getting movies (last = 2)
      const result11 = await testServer.executeOperation({
        query: `query GetMovies($last: Int) { movies(last: $last) { 
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
        variables: {
          last: 2,
        },
      });

      expect(result11.data).toBeTruthy();

      if (result11.data) {
        const moviesConnection = result11.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row0.title).toBe(title2);
          expect(row0.mediaFullPath).toBe(mediaFullPath2);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath}`);
          expect(row1.title).toBe(title);
          expect(row1.mediaFullPath).toBe(mediaFullPath);
        }
      }

      // getting movies (last = 2 offset = 2)
      const result12 = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $offset: Int) { movies(last: $last, offset: $offset) { 
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
        variables: {
          last: 2,
          offset: 2,
        },
      });

      expect(result12.data).toBeTruthy();

      if (result12.data) {
        const moviesConnection = result12.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
        }
      }

      // getting movies (last = 2 offset = 3)
      const result13 = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $offset: Int) { movies(last: $last, offset: $offset) { 
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
        variables: {
          last: 2,
          offset: 3,
        },
      });

      expect(result13.data).toBeTruthy();

      if (result13.data) {
        const moviesConnection = result13.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath3}`);
          expect(row0.title).toBe(title3);
          expect(row0.mediaFullPath).toBe(mediaFullPath3);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row1.title).toBe(title4);
          expect(row1.mediaFullPath).toBe(mediaFullPath4);
        }
      }

      // getting movies (last = 2 offset = 4)
      const result14 = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $offset: Int) { movies(last: $last, offset: $offset) { 
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
        variables: {
          last: 2,
          offset: 4,
        },
      });

      expect(result14.data).toBeTruthy();

      if (result14.data) {
        const moviesConnection = result14.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(1);

          //===
          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath3}`);
          expect(row0.title).toBe(title3);
          expect(row0.mediaFullPath).toBe(mediaFullPath3);
        }
      }

      // getting movies (last = 2, offset = 5)
      const result15 = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $offset: Int) { movies(last: $last, offset: $offset) { 
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
        variables: {
          last: 2,
          offset: 5,
        },
      });

      expect(result15.data).toBeTruthy();

      if (result15.data) {
        const moviesConnection = result15.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(0);
        }
      }

      //=============================================
      // first/after and last/before
      //=============================================
      const refEdges = (
        ((result6 as GraphQLResponse).data as Record<string, unknown>)[
          "movies"
        ] as IConnection<Partial<IMovie>>
      ).edges as IEdge<Partial<IMovie>>[];

      // getting movies (first = 3)
      const result16 = await testServer.executeOperation({
        query: `query GetMovies($first: Int) { movies(first: $first) { 
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
        variables: {
          first: 3,
        },
      });

      expect(result16.data).toBeTruthy();

      if (result16.data) {
        const moviesConnection = result16.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(3);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath3}`);
          expect(row0.title).toBe(title3);
          expect(row0.mediaFullPath).toBe(mediaFullPath3);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row1.title).toBe(title4);
          expect(row1.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge2 = moviesConnection.edges[2];
          expect(edge2.cursor).toMatch(base64RegExpr);
          const row2 = edge2.node;
          expect(row2._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row2.title).toBe(title5);
          expect(row2.mediaFullPath).toBe(mediaFullPath5);
        }
      }

      // getting movies (after = refEdges[1].cursor)
      const result17 = await testServer.executeOperation({
        query: `query GetMovies($after: String) { movies(after: $after) { 
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
        variables: {
          after: refEdges[1].cursor,
        },
      });

      expect(result17.data).toBeTruthy();

      if (result17.data) {
        const moviesConnection = result17.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(3);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row0.title).toBe(title5);
          expect(row0.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row1.title).toBe(title2);
          expect(row1.mediaFullPath).toBe(mediaFullPath2);
          //===
          const edge2 = moviesConnection.edges[2];
          expect(edge2.cursor).toMatch(base64RegExpr);
          const row2 = edge2.node;
          expect(row2._id).toBe(`MOVIE_${mediaFullPath}`);
          expect(row2.title).toBe(title);
          expect(row2.mediaFullPath).toBe(mediaFullPath);
        }
      }

      // getting movies (first = 2, after = refEdges[0].cursor)
      const result18 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String) { movies(first: $first, after: $after) { 
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
        variables: {
          first: 2,
          after: refEdges[0].cursor,
        },
      });

      expect(result18.data).toBeTruthy();

      if (result18.data) {
        const moviesConnection = result18.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
        }
      }

      // getting movies (last = 2)
      const result19 = await testServer.executeOperation({
        query: `query GetMovies($last: Int) { movies(last: $last) { 
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
        variables: {
          last: 2,
        },
      });

      expect(result19.data).toBeTruthy();

      if (result19.data) {
        const moviesConnection = result19.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row0.title).toBe(title2);
          expect(row0.mediaFullPath).toBe(mediaFullPath2);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath}`);
          expect(row1.title).toBe(title);
          expect(row1.mediaFullPath).toBe(mediaFullPath);
        }
      }

      // getting movies (last = 2, before = refEdges[4].cursor)
      const result20 = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $before: String) { movies(last: $last, before: $before) { 
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
        variables: {
          last: 2,
          before: refEdges[4].cursor,
        },
      });

      expect(result20.data).toBeTruthy();

      if (result20.data) {
        const moviesConnection = result20.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row0.title).toBe(title5);
          expect(row0.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row1.title).toBe(title2);
          expect(row1.mediaFullPath).toBe(mediaFullPath2);
        }
      }

      // getting movies (first = 2, last = 2)
      const result21 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $last: Int) { movies(first: $first, last: $last) { 
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
        variables: {
          first: 2,
          last: 2,
        },
      });

      expect(result21.data).toBeTruthy();

      if (result21.data) {
        const moviesConnection = result21.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath3}`);
          expect(row0.title).toBe(title3);
          expect(row0.mediaFullPath).toBe(mediaFullPath3);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row1.title).toBe(title4);
          expect(row1.mediaFullPath).toBe(mediaFullPath4);
        }
      }

      // getting movies (first = 2, last = 1)
      const result22 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $last: Int) { movies(first: $first, last: $last) { 
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
        variables: {
          first: 2,
          last: 1,
        },
      });

      expect(result22.data).toBeTruthy();

      if (result22.data) {
        const moviesConnection = result22.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(1);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
        }
      }

      // getting movies (first = 2, last = 3)
      const result23 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $last: Int) { movies(first: $first, last: $last) { 
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
        variables: {
          first: 2,
          last: 3,
        },
      });

      expect(result23.data).toBeTruthy();

      if (result23.data) {
        const moviesConnection = result23.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath3}`);
          expect(row0.title).toBe(title3);
          expect(row0.mediaFullPath).toBe(mediaFullPath3);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row1.title).toBe(title4);
          expect(row1.mediaFullPath).toBe(mediaFullPath4);
        }
      }

      // getting movies (first = 2, before = refEdges[4].cursor)
      const result24 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $before: String) { movies(first: $first, before: $before) { 
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
        variables: {
          first: 2,
          before: refEdges[4].cursor,
        },
      });

      expect(result24.data).toBeTruthy();

      if (result24.data) {
        const moviesConnection = result24.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath3}`);
          expect(row0.title).toBe(title3);
          expect(row0.mediaFullPath).toBe(mediaFullPath3);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row1.title).toBe(title4);
          expect(row1.mediaFullPath).toBe(mediaFullPath4);
        }
      }

      // getting movies (first = 5, before = refEdges[4].cursor)
      const result25 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $before: String) { movies(first: $first, before: $before) { 
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
        variables: {
          first: 5,
          before: refEdges[4].cursor,
        },
      });

      expect(result25.data).toBeTruthy();

      if (result25.data) {
        const moviesConnection = result25.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(4);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath3}`);
          expect(row0.title).toBe(title3);
          expect(row0.mediaFullPath).toBe(mediaFullPath3);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row1.title).toBe(title4);
          expect(row1.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge2 = moviesConnection.edges[2];
          expect(edge2.cursor).toMatch(base64RegExpr);
          const row2 = edge2.node;
          expect(row2._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row2.title).toBe(title5);
          expect(row2.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge3 = moviesConnection.edges[3];
          expect(edge3.cursor).toMatch(base64RegExpr);
          const row3 = edge3.node;
          expect(row3._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row3.title).toBe(title2);
          expect(row3.mediaFullPath).toBe(mediaFullPath2);
        }
      }

      // getting movies (last = 2, after = refEdges[0].cursor)
      const result26 = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $after: String) { movies(last: $last, after: $after) { 
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
        variables: {
          last: 2,
          after: refEdges[0].cursor,
        },
      });

      expect(result26.data).toBeTruthy();

      if (result26.data) {
        const moviesConnection = result26.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row0.title).toBe(title2);
          expect(row0.mediaFullPath).toBe(mediaFullPath2);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath}`);
          expect(row1.title).toBe(title);
          expect(row1.mediaFullPath).toBe(mediaFullPath);
        }
      }

      // getting movies (last = 5, after = refEdges[0].cursor)
      const result27 = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $after: String) { movies(last: $last, after: $after) { 
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
        variables: {
          last: 5,
          after: refEdges[0].cursor,
        },
      });

      expect(result27.data).toBeTruthy();

      if (result27.data) {
        const moviesConnection = result27.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(4);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge2 = moviesConnection.edges[2];
          expect(edge2.cursor).toMatch(base64RegExpr);
          const row2 = edge2.node;
          expect(row2._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row2.title).toBe(title2);
          expect(row2.mediaFullPath).toBe(mediaFullPath2);
          //===
          const edge3 = moviesConnection.edges[3];
          expect(edge3.cursor).toMatch(base64RegExpr);
          const row3 = edge3.node;
          expect(row3._id).toBe(`MOVIE_${mediaFullPath}`);
          expect(row3.title).toBe(title);
          expect(row3.mediaFullPath).toBe(mediaFullPath);
        }
      }

      //#####################################################################

      // getting movies (fist = 2, after = refEdges[0].cursor, last = 3)
      const result28 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $last: Int) { movies(first: $first, after: $after, last: $last) { 
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
        variables: {
          first: 2,
          after: refEdges[0].cursor,
          last: 3,
        },
      });

      expect(result28.data).toBeTruthy();

      if (result28.data) {
        const moviesConnection = result28.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
        }
      }

      // getting movies (fist = 2, after = refEdges[0].cursor, last = 2)
      const result29 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $last: Int) { movies(first: $first, after: $after, last: $last) { 
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
        variables: {
          first: 2,
          after: refEdges[0].cursor,
          last: 2,
        },
      });

      expect(result29.data).toBeTruthy();

      if (result29.data) {
        const moviesConnection = result29.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
        }
      }

      // getting movies (fist = 2, after = refEdges[0].cursor, last = 1)
      const result30 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $last: Int) { movies(first: $first, after: $after, last: $last) { 
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
        variables: {
          first: 2,
          after: refEdges[0].cursor,
          last: 1,
        },
      });

      expect(result30.data).toBeTruthy();

      if (result30.data) {
        const moviesConnection = result30.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(1);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row0.title).toBe(title5);
          expect(row0.mediaFullPath).toBe(mediaFullPath5);
        }
      }

      // getting movies (fist = 2, after = refEdges[0].cursor, before = refEdges[4].cursor)
      const result31 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $before: String) { movies(first: $first, after: $after, before: $before) { 
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
        variables: {
          first: 2,
          after: refEdges[0].cursor,
          before: refEdges[4].cursor,
        },
      });

      expect(result31.data).toBeTruthy();

      if (result31.data) {
        const moviesConnection = result31.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
        }
      }

      // getting movies (fist = 3, after = refEdges[0].cursor, before = refEdges[4].cursor)
      const result32 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $before: String) { movies(first: $first, after: $after, before: $before) { 
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
        variables: {
          first: 3,
          after: refEdges[0].cursor,
          before: refEdges[4].cursor,
        },
      });

      expect(result32.data).toBeTruthy();

      if (result32.data) {
        const moviesConnection = result32.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(3);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge2 = moviesConnection.edges[2];
          expect(edge2.cursor).toMatch(base64RegExpr);
          const row2 = edge2.node;
          expect(row2._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row2.title).toBe(title2);
          expect(row2.mediaFullPath).toBe(mediaFullPath2);
        }
      }

      // getting movies (fist = 4, after = refEdges[0].cursor, before = refEdges[4].cursor)
      const result33 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $before: String) { movies(first: $first, after: $after, before: $before) { 
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
        variables: {
          first: 4,
          after: refEdges[0].cursor,
          before: refEdges[4].cursor,
        },
      });

      expect(result33.data).toBeTruthy();

      if (result33.data) {
        const moviesConnection = result33.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(3);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge2 = moviesConnection.edges[2];
          expect(edge2.cursor).toMatch(base64RegExpr);
          const row2 = edge2.node;
          expect(row2._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row2.title).toBe(title2);
          expect(row2.mediaFullPath).toBe(mediaFullPath2);
        }
      }

      // getting movies (fist = 2, after = refEdges[0].cursor, before = refEdges[0].cursor)
      const result34 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $before: String) { movies(first: $first, after: $after, before: $before) { 
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
        variables: {
          first: 2,
          after: refEdges[0].cursor,
          before: refEdges[0].cursor,
        },
      });

      expect(result34.data).toBeTruthy();

      if (result34.data) {
        const moviesConnection = result34.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
        }
      }

      // getting movies (last = 2, before = refEdges[4].cursor, first = 3)
      const result35 = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $before: String, $first: Int) { movies(last: $last, before: $before, first: $first) { 
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
        variables: {
          last: 2,
          before: refEdges[4].cursor,
          first: 3,
        },
      });

      expect(result35.data).toBeTruthy();

      if (result35.data) {
        const moviesConnection = result35.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
        }
      }

      // getting movies (last = 2, before = refEdges[4].cursor, first = 2)
      const result36 = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $before: String, $first: Int) { movies(last: $last, before: $before, first: $first) { 
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
        variables: {
          last: 2,
          before: refEdges[4].cursor,
          first: 2,
        },
      });

      expect(result36.data).toBeTruthy();

      if (result36.data) {
        const moviesConnection = result36.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath3}`);
          expect(row0.title).toBe(title3);
          expect(row0.mediaFullPath).toBe(mediaFullPath3);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row1.title).toBe(title4);
          expect(row1.mediaFullPath).toBe(mediaFullPath4);
        }
      }

      // getting movies (last = 2, before = refEdges[4].cursor, first = 1)
      const result37 = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $before: String, $first: Int) { movies(last: $last, before: $before, first: $first) { 
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
        variables: {
          last: 2,
          before: refEdges[4].cursor,
          first: 1,
        },
      });

      expect(result37.data).toBeTruthy();

      if (result37.data) {
        const moviesConnection = result37.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(1);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath3}`);
          expect(row0.title).toBe(title3);
          expect(row0.mediaFullPath).toBe(mediaFullPath3);
        }
      }

      // getting movies (last = 2, before = refEdges[4].cursor, after = refEdges[0].cursor)
      const result38 = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $before: String, $after: String) { movies(last: $last, before: $before, after: $after) { 
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
        variables: {
          last: 2,
          before: refEdges[4].cursor,
          after: refEdges[0].cursor,
        },
      });

      expect(result38.data).toBeTruthy();

      if (result38.data) {
        const moviesConnection = result38.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row0.title).toBe(title5);
          expect(row0.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row1.title).toBe(title2);
          expect(row1.mediaFullPath).toBe(mediaFullPath2);
        }
      }

      // getting movies (last = 3, before = refEdges[4].cursor, after = refEdges[0].cursor)
      const result39 = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $before: String, $after: String) { movies(last: $last, before: $before, after: $after) { 
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
        variables: {
          last: 3,
          before: refEdges[4].cursor,
          after: refEdges[0].cursor,
        },
      });

      expect(result39.data).toBeTruthy();

      if (result39.data) {
        const moviesConnection = result39.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(3);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge2 = moviesConnection.edges[2];
          expect(edge2.cursor).toMatch(base64RegExpr);
          const row2 = edge2.node;
          expect(row2._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row2.title).toBe(title2);
          expect(row2.mediaFullPath).toBe(mediaFullPath2);
        }
      }

      // getting movies (last = 4, before = refEdges[4].cursor, after = refEdges[0].cursor)
      const result40 = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $before: String, $after: String) { movies(last: $last, before: $before, after: $after) { 
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
        variables: {
          last: 4,
          before: refEdges[4].cursor,
          after: refEdges[0].cursor,
        },
      });

      expect(result40.data).toBeTruthy();

      if (result40.data) {
        const moviesConnection = result40.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(3);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge2 = moviesConnection.edges[2];
          expect(edge2.cursor).toMatch(base64RegExpr);
          const row2 = edge2.node;
          expect(row2._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row2.title).toBe(title2);
          expect(row2.mediaFullPath).toBe(mediaFullPath2);
        }
      }

      // getting movies (last = 2, before = refEdges[4].cursor, after = refEdges[4].cursor)
      const result41 = await testServer.executeOperation({
        query: `query GetMovies($last: Int, $before: String, $after: String) { movies(last: $last, before: $before, after: $after) { 
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
        variables: {
          last: 2,
          before: refEdges[4].cursor,
          after: refEdges[4].cursor,
        },
      });

      expect(result41.data).toBeTruthy();

      if (result41.data) {
        const moviesConnection = result41.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(false);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(0);
        }
      }

      // #####################################################

      // getting movies (first = 4, after = refEdges[0].cursor, last = 4, before = refEdges[4].cursor)
      const result42 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $last: Int, $before: String) { movies(first: $first, after: $after, last: $last, before: $before ) { 
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
        variables: {
          first: 4,
          after: refEdges[0].cursor,
          last: 4,
          before: refEdges[4].cursor,
        },
      });

      expect(result42.data).toBeTruthy();

      if (result42.data) {
        const moviesConnection = result42.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(3);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge2 = moviesConnection.edges[2];
          expect(edge2.cursor).toMatch(base64RegExpr);
          const row2 = edge2.node;
          expect(row2._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row2.title).toBe(title2);
          expect(row2.mediaFullPath).toBe(mediaFullPath2);
        }
      }

      // getting movies (first = 4, after = refEdges[0].cursor, last = 3, before = refEdges[4].cursor)
      const result43 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $last: Int, $before: String) { movies(first: $first, after: $after, last: $last, before: $before ) { 
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
        variables: {
          first: 4,
          after: refEdges[0].cursor,
          last: 3,
          before: refEdges[4].cursor,
        },
      });

      expect(result43.data).toBeTruthy();

      if (result43.data) {
        const moviesConnection = result43.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(3);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge2 = moviesConnection.edges[2];
          expect(edge2.cursor).toMatch(base64RegExpr);
          const row2 = edge2.node;
          expect(row2._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row2.title).toBe(title2);
          expect(row2.mediaFullPath).toBe(mediaFullPath2);
        }
      }

      // getting movies (first = 4, after = refEdges[0].cursor, last = 2, before = refEdges[4].cursor)
      const result44 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $last: Int, $before: String) { movies(first: $first, after: $after, last: $last, before: $before ) { 
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
        variables: {
          first: 4,
          after: refEdges[0].cursor,
          last: 2,
          before: refEdges[4].cursor,
        },
      });

      expect(result44.data).toBeTruthy();

      if (result44.data) {
        const moviesConnection = result44.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row0.title).toBe(title5);
          expect(row0.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row1.title).toBe(title2);
          expect(row1.mediaFullPath).toBe(mediaFullPath2);
        }
      }

      // getting movies (first = 3, after = refEdges[0].cursor, last = 4, before = refEdges[4].cursor)
      const result45 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $last: Int, $before: String) { movies(first: $first, after: $after, last: $last, before: $before ) { 
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
        variables: {
          first: 3,
          after: refEdges[0].cursor,
          last: 4,
          before: refEdges[4].cursor,
        },
      });

      expect(result45.data).toBeTruthy();

      if (result45.data) {
        const moviesConnection = result45.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(3);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge2 = moviesConnection.edges[2];
          expect(edge2.cursor).toMatch(base64RegExpr);
          const row2 = edge2.node;
          expect(row2._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row2.title).toBe(title2);
          expect(row2.mediaFullPath).toBe(mediaFullPath2);
        }
      }
      
      // getting movies (first = 3, after = refEdges[0].cursor, last = 3, before = refEdges[4].cursor)
      const result46 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $last: Int, $before: String) { movies(first: $first, after: $after, last: $last, before: $before ) { 
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
        variables: {
          first: 3,
          after: refEdges[0].cursor,
          last: 3,
          before: refEdges[4].cursor,
        },
      });

      expect(result46.data).toBeTruthy();

      if (result46.data) {
        const moviesConnection = result46.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(3);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge2 = moviesConnection.edges[2];
          expect(edge2.cursor).toMatch(base64RegExpr);
          const row2 = edge2.node;
          expect(row2._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row2.title).toBe(title2);
          expect(row2.mediaFullPath).toBe(mediaFullPath2);
        }
      }
      
      // getting movies (first = 3, after = refEdges[0].cursor, last = 2, before = refEdges[4].cursor)
      const result47 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $last: Int, $before: String) { movies(first: $first, after: $after, last: $last, before: $before ) { 
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
        variables: {
          first: 3,
          after: refEdges[0].cursor,
          last: 2,
          before: refEdges[4].cursor,
        },
      });

      expect(result47.data).toBeTruthy();

      if (result47.data) {
        const moviesConnection = result47.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(false);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row0.title).toBe(title5);
          expect(row0.mediaFullPath).toBe(mediaFullPath5);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath2}`);
          expect(row1.title).toBe(title2);
          expect(row1.mediaFullPath).toBe(mediaFullPath2);
        }
      }

      // getting movies (first = 2, after = refEdges[0].cursor, last = 4, before = refEdges[4].cursor)
      const result48 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $last: Int, $before: String) { movies(first: $first, after: $after, last: $last, before: $before ) { 
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
        variables: {
          first: 2,
          after: refEdges[0].cursor,
          last: 4,
          before: refEdges[4].cursor,
        },
      });

      expect(result48.data).toBeTruthy();

      if (result48.data) {
        const moviesConnection = result48.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
        }
      }

      // getting movies (first = 2, after = refEdges[0].cursor, last = 3, before = refEdges[4].cursor)
      const result49 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $last: Int, $before: String) { movies(first: $first, after: $after, last: $last, before: $before ) { 
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
        variables: {
          first: 2,
          after: refEdges[0].cursor,
          last: 3,
          before: refEdges[4].cursor,
        },
      });

      expect(result49.data).toBeTruthy();

      if (result49.data) {
        const moviesConnection = result49.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
        }
      }

      // getting movies (first = 2, after = refEdges[0].cursor, last = 2, before = refEdges[4].cursor)
      const result50 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $last: Int, $before: String) { movies(first: $first, after: $after, last: $last, before: $before ) { 
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
        variables: {
          first: 2,
          after: refEdges[0].cursor,
          last: 2,
          before: refEdges[4].cursor,
        },
      });

      expect(result50.data).toBeTruthy();

      if (result50.data) {
        const moviesConnection = result50.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(2);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath4}`);
          expect(row0.title).toBe(title4);
          expect(row0.mediaFullPath).toBe(mediaFullPath4);
          //===
          const edge1 = moviesConnection.edges[1];
          expect(edge1.cursor).toMatch(base64RegExpr);
          const row1 = edge1.node;
          expect(row1._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row1.title).toBe(title5);
          expect(row1.mediaFullPath).toBe(mediaFullPath5);
        }
      }

      // getting movies (first = 2, after = refEdges[0].cursor, last = 1, before = refEdges[4].cursor)
      const result51 = await testServer.executeOperation({
        query: `query GetMovies($first: Int, $after: String, $last: Int, $before: String) { movies(first: $first, after: $after, last: $last, before: $before ) { 
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
        variables: {
          first: 2,
          after: refEdges[0].cursor,
          last: 1,
          before: refEdges[4].cursor,
        },
      });

      expect(result51.data).toBeTruthy();

      if (result51.data) {
        const moviesConnection = result51.data["movies"] as IConnection<
          Partial<IMovie>
        >;
        expect(moviesConnection.edges).not.toBeNull();

        expect(moviesConnection.pageInfo.hasPreviousPage).toBe(true);
        expect(moviesConnection.pageInfo.hasNextPage).toBe(true);

        if (moviesConnection.edges) {
          expect(moviesConnection.edges.length).toBe(1);

          const edge0 = moviesConnection.edges[0];
          expect(edge0.cursor).toMatch(base64RegExpr);
          const row0 = edge0.node;
          expect(row0._id).toBe(`MOVIE_${mediaFullPath5}`);
          expect(row0.title).toBe(title5);
          expect(row0.mediaFullPath).toBe(mediaFullPath5);
        }
      }




    });
  }
);
