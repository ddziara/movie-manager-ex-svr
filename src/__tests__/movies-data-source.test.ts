import { AppPlatformType } from "../common/types";
import type { IFS } from "unionfs/lib/fs";
import { DBextra } from "../database/db-db-extra";
import { DBTableMovieGroupTypes } from "../database/db-table-moviegrouptypes";
import { IBetterSQqliteRunReturn } from "../database/db-data-moviemanager-cyberlink";
import knx, { Knex } from "knex";
import type { MoviesDataSource } from "../datasources/movies-data-source";
import type { DB } from "../database/db-db";
import { convertStringCase, StringCaseMode } from "../database/utils";
import type { DBDataMovieManagerCyberlink } from "../database/db-data-moviemanager-cyberlink";
import { IPostgresRunReturn } from "../database/db-data-moviemanager-postgres";

interface DBDataMovieManagerCyberlinkPublic {
  attachDBCreateTables(db: DB, dbpath: string): Promise<void>;
}

interface DBDataMovieManagerPostgresPublic {
  createSchemaCreateTables(db: DB): Promise<void>;
}

interface IExecRetVoidPublic {
  execRetVoid(sql: string, ...params: unknown[]): Promise<void>;
}

interface IExecQueryPublic {
  execQuery(
    sql: string,
    ...params: unknown[]
  ): Promise<Record<string, unknown>[]>;
}

interface IExecRetIDPublic {
  execRetID(id: string, sql: string, ...params: unknown[]): Promise<number>;
}

interface IBetterSqliteRawExecRetIDPublic {
  _rawExecRetID(
    sql: string,
    bindings: readonly Knex.RawBinding[]
  ): Promise<Knex.Raw<IBetterSQqliteRunReturn>>;
}

interface IPostgresRawExecRetIDPublic {
  _rawExecRetID(
    sql: string,
    bindings: readonly Knex.RawBinding[]
  ): Promise<Knex.Raw<IPostgresRunReturn>>;
}

jest.setTimeout(60000);

describe.each`
  appPlatform
  ${"cyberlink"}
  ${"postgres"}
`(
  `Checking database code`,
  ({ appPlatform }: { appPlatform: AppPlatformType }) => {
    type DBConsts = { USE_FOLDER_COLUMN_IN_MOVIES: boolean };
    let dBConsts: DBConsts;
    let moviesDataSource: MoviesDataSource;
    let fs;
    let vol;
    let convertReportedColumnName: (txt: string) => string;

    // ignore "cyberlink" tests on "postgres" platform
    const APP_PLATFORM = process.env["APP_PLATFORM"] as AppPlatformType
    if (APP_PLATFORM === "postgres" && appPlatform as AppPlatformType === "cyberlink") return;

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

      dBConsts = require("../database/db-const");

      if (appPlatform === "cyberlink") {
        convertReportedColumnName = (txt: string) => {
          return convertStringCase(txt, StringCaseMode.KeepCurrent);
        };

        // import memfs & unionfs here because it is asynchronous
        // const { fs: fs_mem, vol: vol2 } = await import("memfs");
        // vol = vol2;

        // const { ufs } = await import("unionfs");

        // // mocks fs with extended fs (with memory volume)
        // jest.doMock(`fs`, () => {
        //   const org_fs = jest.requireActual("fs");

        //   ufs.use(org_fs).use(fs_mem as unknown as IFS);
        //   return ufs;
        // });

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
      } else if (appPlatform === "postgres") {
        convertReportedColumnName = (txt: string) => {
          return convertStringCase(txt, StringCaseMode.ToLowerCase);
        };
      }
    });

    afterAll(() => {
      if (appPlatform === "cyberlink") {
        jest.dontMock("fs");
        jest.dontMock("../database/db-path-cyberlink");
      } else if (appPlatform === "postgres") {
        // TODO:
      }
    });

    beforeEach(async () => {
      const { MoviesDataSource } = await import(
        "../datasources/movies-data-source"
      );

      if (appPlatform === "cyberlink") {
        const { getCyberlinkRootDBPath, getCyberlinkRootDBName } = await import(
          "../database/db-path-cyberlink"
        );

        const knexBetterSqlite = knx({
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
          knexBetterSqlite,
          DBDataMovieManagerCyberlink
        );
      } else if (appPlatform === "postgres") {
        const knexPostgres = knx({
          client: "pg",
          connection: process.env.TEST_DATABASE_URL,
          // searchPath: ['knex', 'public'],
        });

        const { DBDataMovieManagerPostgres } = await import(
          "../database/db-data-moviemanager-postgres"
        );

        moviesDataSource = new MoviesDataSource(
          knexPostgres,
          DBDataMovieManagerPostgres
        );

        // remove database content
        await moviesDataSource.init();

        let tab;
        const dbDataMovieManager = moviesDataSource["_dbDataMovieManager"];

        let indx = 0;
        while((tab = dbDataMovieManager.dbcldb.getTable(indx++)) != null) await dbDataMovieManager.clearTable(tab);
        //==
        indx = 0;
        while((tab = dbDataMovieManager.dbextra.getTable(indx++)) != null) await dbDataMovieManager.clearTable(tab);
        //==
        indx = 0;
        while((tab = dbDataMovieManager.dbmediaScannerCache.getTable(indx++)) != null) await dbDataMovieManager.clearTable(tab);
        //==
        indx = 0;
        while((tab = dbDataMovieManager.dbmoviemedia.getTable(indx++)) != null) await dbDataMovieManager.clearTable(tab);
        //==
        indx = 0;
        while((tab = dbDataMovieManager.dbplaylist.getTable(indx++)) != null) await dbDataMovieManager.clearTable(tab);

        //==
        await moviesDataSource.uninit();
      }
    });

    afterEach(async () => {
      if (appPlatform === "postgres") {
        // to forcibly disconnet clients
        await moviesDataSource["knex"].destroy();      
      }
    })

    test("checking initialization and uninitialization", async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBe(true);
      //===============================================================
      await moviesDataSource.uninit();
      expect(moviesDataSource.ready).toBe(false);
    });
    test("checking uninitialization without initialization", async () => {
      await moviesDataSource.uninit();
      expect(moviesDataSource.ready).toBe(false);
    });

    test("checking DBData.dumpTable(*) missing branches/lines/statements", async () => {
      const db = new DBextra(appPlatform);
      const table = new DBTableMovieGroupTypes(db, appPlatform);

      await expect(moviesDataSource.dumpTable(table, "label")).rejects.toThrow(
        "Database is not ready"
      );

      await moviesDataSource.init();

      if (moviesDataSource["_dbDataMovieManager"]) {
        const mocked = jest
          .spyOn(
            moviesDataSource[
              "_dbDataMovieManager"
            ] as unknown as IExecQueryPublic,
            "execQuery"
          )
          .mockImplementation(async () => {
            throw new Error("execQuery() exception");
          });
        await expect(
          moviesDataSource.dumpTable(table, "label")
        ).rejects.toThrowError("execQuery() exception");
        mocked.mockRestore();
      }
    });

    test("checking DBData.clearTable(*) missing branches/lines/statements", async () => {
      const db = new DBextra(appPlatform);
      const table = new DBTableMovieGroupTypes(db, appPlatform);

      if (moviesDataSource["_dbDataMovieManager"]) {
        await expect(moviesDataSource.clearTable(table)).rejects.toThrow(
          "Database is not ready"
        );

        await moviesDataSource.init();

        await expect(
          moviesDataSource.clearTable(table)
        ).resolves.toBeUndefined();
      }
    });

    test("checking DBDataMovieManager.getMovieGroupTypes(*) missing branches/lines/statements", async () => {
      await expect(moviesDataSource.getMovieGroupTypes(0)).rejects.toThrow(
        "Database is not ready"
      );
    });

    test("checking DBDataMovieManager.addMovieGroupType(*) missing branches/lines/statements", async () => {
      await expect(moviesDataSource.addMovieGroupType([], [])).rejects.toThrow(
        "Database is not ready"
      );
    });

    test("checking DBDataMovieManager.updateMovieGroupType(*) missing branches/lines/statements", async () => {
      await expect(
        moviesDataSource.updateMovieGroupType(0, [], [])
      ).rejects.toThrow("Database is not ready");
    });

    test("checking DBDataMovieManager.deleteMovieGroupType(*) missing branches/lines/statements", async () => {
      await expect(moviesDataSource.deleteMovieGroupType(0)).rejects.toThrow(
        "Database is not ready"
      );
    });

    test("checking DBDataMovieManager.getMovieGroups(*) missing branches/lines/statements", async () => {
      await expect(moviesDataSource.getMovieGroups(0, 0)).rejects.toThrow(
        "Database is not ready"
      );
    });

    test("checking DBDataMovieManager.addMovieGroup(*) missing branches/lines/statements", async () => {
      await expect(
        moviesDataSource.addMovieGroup(0, "", [], [])
      ).rejects.toThrow("Database is not ready");

      await moviesDataSource.init();

      if (moviesDataSource["_dbDataMovieManager"]) {
        const mocked = jest
          .spyOn(
            moviesDataSource[
              "_dbDataMovieManager"
            ] as unknown as IExecQueryPublic,
            "execQuery"
          )
          .mockImplementation(async () => {
            return [];
          });

        await expect(
          moviesDataSource.addMovieGroup(0, "", [], [])
        ).rejects.toThrow("Missing movie: ");

        mocked.mockRestore();
      }
    });

    test("checking DBDataMovieManager.updateMovieGroup(*) missing branches/lines/statements", async () => {
      await expect(
        moviesDataSource.updateMovieGroup(0, [], [])
      ).rejects.toThrow("Database is not ready");
    });

    test("checking DBDataMovieManager.deleteMovieGroup(*) missing branches/lines/statements", async () => {
      await expect(moviesDataSource.deleteMovieGroup(0)).rejects.toThrow(
        "Database is not ready"
      );

      await moviesDataSource.init();

      if (moviesDataSource["_dbDataMovieManager"]) {
        const mocked = jest
          .spyOn(
            moviesDataSource[
              "_dbDataMovieManager"
            ] as unknown as IExecQueryPublic,
            "execQuery"
          )
          .mockImplementation(async () => {
            throw new Error("execQuery() exception");
          });

        await expect(moviesDataSource.deleteMovieGroup(0)).rejects.toThrow(
          "execQuery() exception"
        );

        mocked.mockImplementation(async () => {
          return [{}];
        });

        await expect(moviesDataSource.deleteMovieGroup(0)).rejects.toThrow(
          "There are some movies referencing this group"
        );

        mocked.mockRestore();
      }
    });

    test("checking DBDataMovieManager.moveMovieGroup2AnotherType(*) missing branches/lines/statements", async () => {
      await expect(
        moviesDataSource.moveMovieGroup2AnotherType(0, 0)
      ).rejects.toThrow("Database is not ready");

      await moviesDataSource.init();

      if (moviesDataSource["_dbDataMovieManager"]) {
        const mocked = jest
          .spyOn(
            moviesDataSource[
              "_dbDataMovieManager"
            ] as unknown as IExecQueryPublic,
            "execQuery"
          )
          .mockImplementation(async (sql: string) => {
            if (sql.includes("PlayListInfo")) {
              return [{}];
            } else if (sql.includes("MovieGroupTypes")) {
              return [{}];
            } else if (sql.includes("MovieGroupTypeMovieGroups")) {
              return [{}];
            }

            return [];
          });

        await expect(
          moviesDataSource.moveMovieGroup2AnotherType(0, 1)
        ).resolves.toBeUndefined();

        mocked.mockRestore();
      }
    });

    test("checking DBDataMovieManager.moveMovieGroup2NoType(*) missing branches/lines/statements", async () => {
      await expect(
        moviesDataSource.moveMovieGroup2NoType(0, 0)
      ).rejects.toThrow("Database is not ready");
    });

    test("checking DBDataMovieManager.getMovies(*) missing branches/lines/statements", async () => {
      await expect(
        moviesDataSource.getMovies(undefined, undefined)
      ).rejects.toThrow("Database is not ready");

      await moviesDataSource.init();

      const mocked1 = jest
        .spyOn(dBConsts, "USE_FOLDER_COLUMN_IN_MOVIES", "get")
        .mockReturnValue(true);

      if (moviesDataSource["_dbDataMovieManager"]) {
        const mocked2 = jest
          .spyOn(
            moviesDataSource[
              "_dbDataMovieManager"
            ] as unknown as IExecQueryPublic,
            "execQuery"
          )
          .mockImplementation(
            async (
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              sql: string,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ...params: unknown[]
            ): Promise<Record<string, unknown>[]> => {
              return [];
            }
          );

        await expect(
          moviesDataSource.getMovies(undefined, undefined)
        ).resolves.toBeDefined();

        await expect(
          moviesDataSource.getMovies(0, undefined)
        ).resolves.toBeDefined();

        mocked1.mockRestore();
        mocked2.mockRestore();
      }
    });

    test("checking DBDataMovieManager.addMovie(*) missing branches/lines/statements", async () => {
      await expect(
        moviesDataSource.addMovie(0, undefined, [], [])
      ).rejects.toThrow("Database is not ready");

      await moviesDataSource.init();

      await expect(
        moviesDataSource.addMovie(0, undefined, [], [])
      ).rejects.toThrow("Missing mediaFullPath column");

      if (moviesDataSource["_dbDataMovieManager"]) {
        const mocked1 = jest
          .spyOn(
            moviesDataSource[
              "_dbDataMovieManager"
            ] as unknown as IExecQueryPublic,
            "execQuery"
          )
          .mockImplementation(
            async (
              sql: string,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ...params: unknown[]
            ): Promise<Record<string, unknown>[]> => {
              if (sql.includes("PlayListInfo")) {
                return [{}];
              } else if (sql.includes("PlayItemInfo")) {
                return [{ count: 0 }];
              }

              return [];
            }
          );

        const mocked2 = jest
          .spyOn(
            moviesDataSource[
              "_dbDataMovieManager"
            ] as unknown as IExecRetIDPublic,
            "execRetID"
          )
          .mockImplementation(
            async (
              id: string,
              sql: string,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ...params: unknown[]
            ): Promise<number> => {
              if (sql.includes("MediaInfo")) {
                return 1;
              }

              return 0;
            }
          );

        await expect(
          moviesDataSource.addMovie(
            1,
            undefined,
            ["mediaFullPath", "title"],
            ["", ""]
          )
        ).rejects.toThrow("Missing lastID");

        mocked1.mockRestore();
        mocked2.mockRestore();
      }
    });

    test("checking DBDataMovieManager.updateMovie(*) missing branches/lines/statements", async () => {
      await expect(moviesDataSource.updateMovie("", [], [])).rejects.toThrow(
        "Database is not ready"
      );
    });

    test("checking DBDataMovieManager.deleteMovie(*) missing branches/lines/statements", async () => {
      await expect(moviesDataSource.deleteMovie("")).rejects.toThrow(
        "Database is not ready"
      );

      await moviesDataSource.init();

      if (moviesDataSource["_dbDataMovieManager"]) {
        const mocked = jest
          .spyOn(
            moviesDataSource[
              "_dbDataMovieManager"
            ] as unknown as IExecRetVoidPublic,
            "execRetVoid"
          )
          .mockImplementation(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            async (sql: string, ...params: unknown[]): Promise<void> => {
              if (sql.includes("MediaInfo")) {
                throw new Error("_deleteRowCore() exception");
              }
            }
          );

        await expect(moviesDataSource.deleteMovie("")).rejects.toThrow(
          "_deleteRowCore() exception"
        );

        mocked.mockRestore();
      }
    });

    // test("checking DBDataMovieManager.getMovieIcon(mid(*) missing branches/lines/statements", async () => {
    //     await expect(moviesDataSource.getMovieIcon("", (() => { }) as unknown as ISendMovieIconFun, {} as express.Response)).rejects.toThrow("Database is not ready");
    // });

    // test("checking DBDataMovieManager.updateMovieIcon(mid(*) missing branches/lines/statements", async () => {
    //     let dbdata_moviemanager_instance: DBDataMovieManager = createPlatformDBDMM();

    //     await expect(dbdata_moviemanager_instance.updateMovieIcon("", (() => { }) as unknown as IStoreMovieIconFun, {} as express.Request, {} as express.Response<any>)).rejects.toThrow("Database is not ready");
    // });

    // test("checking DBDataMovieManager.deleteMovieIcon(mid(*) missing branches/lines/statements", async () => {
    //     let dbdata_moviemanager_instance: DBDataMovieManager = createPlatformDBDMM();

    //     await expect(dbdata_moviemanager_instance.deleteMovieIcon("", (() => { }) as unknown as IRemoveMovieIconFun)).rejects.toThrow("Database is not ready");
    // });

    test("checking DBDataMovieManager.markMovieGroupMember(*) missing branches/lines/statements", async () => {
      await expect(
        moviesDataSource.markMovieGroupMember("", 0)
      ).rejects.toThrow("Database is not ready");

      await moviesDataSource.init();

      if (moviesDataSource["_dbDataMovieManager"]) {
        const mocked = jest
          .spyOn(
            moviesDataSource[
              "_dbDataMovieManager"
            ] as unknown as IExecQueryPublic,
            "execQuery"
          )
          .mockImplementation(
            async (
              sql: string,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ...params: unknown[]
            ): Promise<Record<string, unknown>[]> => {
              if (sql.includes("PlayListInfo")) {
                return [];
              }

              return [];
            }
          );

        await expect(
          moviesDataSource.markMovieGroupMember("", 0)
        ).rejects.toThrow("Missing group: 0");

        jest
          .spyOn(
            moviesDataSource[
              "_dbDataMovieManager"
            ] as unknown as IExecQueryPublic,
            "execQuery"
          )
          .mockImplementation(
            async (
              sql: string,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ...params: unknown[]
            ): Promise<Record<string, unknown>[]> => {
              if (sql.includes("PlayListInfo")) {
                return [{}];
              } else if (sql.includes("MediaInfo")) {
                return [];
              }

              return [];
            }
          );

        await expect(
          moviesDataSource.markMovieGroupMember("", 0)
        ).rejects.toThrow("Missing movie");

        jest
          .spyOn(
            moviesDataSource[
              "_dbDataMovieManager"
            ] as unknown as IExecQueryPublic,
            "execQuery"
          )
          .mockImplementation(
            async (
              sql: string,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ...params: unknown[]
            ): Promise<Record<string, unknown>[]> => {
              if (sql.includes("PlayListInfo")) {
                return [{}];
              } else if (sql.includes("MediaInfo")) {
                return [{ title: "Scary Movie" }];
              } else if (sql.includes("PlayItemInfo")) {
                return [{}];
              }

              return [];
            }
          );

        await expect(
          moviesDataSource.markMovieGroupMember("", 0)
        ).resolves.toBeUndefined();

        mocked.mockRestore();
      }
    });

    test("checking DBDataMovieManager.unmarkMovieGroupMember(*) missing branches/lines/statements", async () => {
      await expect(
        moviesDataSource.unmarkMovieGroupMember(0, "")
      ).rejects.toThrow("Database is not ready");

      await moviesDataSource.init();

      if (moviesDataSource["_dbDataMovieManager"]) {
        const mocked = jest
          .spyOn(
            moviesDataSource[
              "_dbDataMovieManager"
            ] as unknown as IExecRetVoidPublic,
            "execRetVoid"
          )
          .mockImplementation(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            async (sql: string, ...params: unknown[]): Promise<void> => {
              if (sql.includes("PlayItemInfo")) {
                throw new Error("_deleteRowCore() exception");
              }
            }
          );

        await expect(
          moviesDataSource.unmarkMovieGroupMember(0, "")
        ).rejects.toThrow("_deleteRowCore() exception");

        mocked.mockRestore();
      }
    });

    test("checking DBDataMovieManager.getGroupsOfMovie(*) missing branches/lines/statements", async () => {
      await expect(moviesDataSource.getGroupsOfMovie("")).rejects.toThrow(
        "Database is not ready"
      );
    });

    // //====================================================================================================
    if (appPlatform === "cyberlink") {
      test("checking [instance of DBDataMovieManagerWindows].execRetID(*) missing branches/lines/statements", async () => {
        if (moviesDataSource["_dbDataMovieManager"]) {
          await moviesDataSource.init();

          const mocked = jest
            .spyOn(
              moviesDataSource[
                "_dbDataMovieManager"
              ] as unknown as IBetterSqliteRawExecRetIDPublic,
              "_rawExecRetID"
            )
            .mockImplementation(
              async (
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                sql: string,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                bindings: readonly Knex.RawBinding[]
              ): Promise<Knex.Raw<IBetterSQqliteRunReturn>> => {
                //  Promise<Knex.Raw<IBetterSQqliteRunReturn>>
                const info = {};
                return info as unknown as Knex.Raw<IBetterSQqliteRunReturn>;
              }
            );

          await expect(
            moviesDataSource["_dbDataMovieManager"]["execRetID"]("", "")
          ).rejects.toThrow("Missing lastInsertRowid");

          mocked.mockRestore();
        }
      });

      test("checking [instance of DBDataMovieManagerWindows].init(*) - error in 'CLDB'", async () => {
        const knx = (await import("knex")).default;
        const knex = knx({
          client: "better-sqlite3",
          connection: { filename: ":memory:" },
        });
        const { DBDataMovieManagerCyberlink } = await import(
          "../database/db-data-moviemanager-cyberlink"
        );
        const dbDataMovieManagerWindows = new DBDataMovieManagerCyberlink(knex);

        const attachDBCreateTablesOrg =
          dbDataMovieManagerWindows["attachDBCreateTables"];

          const dBName = "CLDB";
          const errMsg = `openning ${dBName} exception`;

          const mocked = jest
          .spyOn(
            dbDataMovieManagerWindows as unknown as DBDataMovieManagerCyberlinkPublic,
            "attachDBCreateTables"
          )
          .mockImplementation(async (db: DB, dbpath: string): Promise<void> => {
            if (db.name.includes(dBName)) {
              throw new Error(errMsg);
            }

            return attachDBCreateTablesOrg.call(
              dbDataMovieManagerWindows,
              db,
              dbpath
            );
          });

        await expect(dbDataMovieManagerWindows.init()).rejects.toThrow(
          errMsg
        );

        mocked.mockRestore();
      });

      test("checking [instance of DBDataMovieManagerWindows].init(*) - error in 'moviemedia'", async () => {
        const knx = (await import("knex")).default;
        const knex = knx({
          client: "better-sqlite3",
          connection: { filename: ":memory:" },
        });
        const { DBDataMovieManagerCyberlink } = await import(
          "../database/db-data-moviemanager-cyberlink"
        );
        const dbDataMovieManagerWindows = new DBDataMovieManagerCyberlink(knex);

        const attachDBCreateTablesOrg =
          dbDataMovieManagerWindows["attachDBCreateTables"];

          const dBName = "moviemedia";
          const errMsg = `openning ${dBName} exception`;

        const mocked = jest
          .spyOn(
            dbDataMovieManagerWindows as unknown as DBDataMovieManagerCyberlinkPublic,
            "attachDBCreateTables"
          )
          .mockImplementation(async (db: DB, dbpath: string): Promise<void> => {
            if (db.name.includes(dBName)) {
              throw new Error(errMsg);
            }

            return attachDBCreateTablesOrg.call(
              dbDataMovieManagerWindows,
              db,
              dbpath
            );
          });

        await expect(dbDataMovieManagerWindows.init()).rejects.toThrow(
          errMsg
        );

        mocked.mockRestore();
      });

      test("checking [instance of DBDataMovieManagerWindows].init(*) - error in 'mediaScannerCache'", async () => {
        const knx = (await import("knex")).default;
        const knex = knx({
          client: "better-sqlite3",
          connection: { filename: ":memory:" },
        });
        const { DBDataMovieManagerCyberlink } = await import(
          "../database/db-data-moviemanager-cyberlink"
        );
        const dbDataMovieManagerWindows = new DBDataMovieManagerCyberlink(knex);

        const attachDBCreateTablesOrg =
          dbDataMovieManagerWindows["attachDBCreateTables"];

          const dBName = "mediaScannerCache";
          const errMsg = `openning ${dBName} exception`;

        const mocked = jest
          .spyOn(
            dbDataMovieManagerWindows as unknown as DBDataMovieManagerCyberlinkPublic,
            "attachDBCreateTables"
          )
          .mockImplementation(async (db: DB, dbpath: string): Promise<void> => {
            if (db.name.includes(dBName)) {
              throw new Error(errMsg);
            }

            return attachDBCreateTablesOrg.call(
              dbDataMovieManagerWindows,
              db,
              dbpath
            );
          });

        await expect(dbDataMovieManagerWindows.init()).rejects.toThrow(
          errMsg
        );

        mocked.mockRestore();
      });

      test("checking [instance of DBDataMovieManagerWindows].init(*) - error in 'Playlist'", async () => {
        const knx = (await import("knex")).default;
        const knex = knx({
          client: "better-sqlite3",
          connection: { filename: ":memory:" },
        });
        const { DBDataMovieManagerCyberlink } = await import(
          "../database/db-data-moviemanager-cyberlink"
        );
        const dbDataMovieManagerWindows = new DBDataMovieManagerCyberlink(knex);

        const attachDBCreateTablesOrg =
          dbDataMovieManagerWindows["attachDBCreateTables"];

          const dBName = "Playlist";
          const errMsg = `openning ${dBName} exception`;

        const mocked = jest
          .spyOn(
            dbDataMovieManagerWindows as unknown as DBDataMovieManagerCyberlinkPublic,
            "attachDBCreateTables"
          )
          .mockImplementation(async (db: DB, dbpath: string): Promise<void> => {
            if (db.name.includes(dBName)) {
              throw new Error(errMsg);
            }

            return attachDBCreateTablesOrg.call(
              dbDataMovieManagerWindows,
              db,
              dbpath
            );
          });

        await expect(dbDataMovieManagerWindows.init()).rejects.toThrow(
          errMsg
        );

        mocked.mockRestore();
      });

      test("checking [instance of DBDataMovieManagerWindows].init(*) - error in 'Playlist'", async () => {
        const knx = (await import("knex")).default;
        const knex = knx({
          client: "better-sqlite3",
          connection: { filename: ":memory:" },
        });
        const { DBDataMovieManagerCyberlink } = await import(
          "../database/db-data-moviemanager-cyberlink"
        );
        const dbDataMovieManagerWindows = new DBDataMovieManagerCyberlink(knex);

        const attachDBCreateTablesOrg =
          dbDataMovieManagerWindows["attachDBCreateTables"];

          const dBName = "Playlist";
          const errMsg = `openning ${dBName} exception`;

        const mocked = jest
          .spyOn(
            dbDataMovieManagerWindows as unknown as DBDataMovieManagerCyberlinkPublic,
            "attachDBCreateTables"
          )
          .mockImplementation(async (db: DB, dbpath: string): Promise<void> => {
            if (db.name.includes(dBName)) {
              throw new Error(errMsg);
            }

            return attachDBCreateTablesOrg.call(
              dbDataMovieManagerWindows,
              db,
              dbpath
            );
          });

        await expect(dbDataMovieManagerWindows.init()).rejects.toThrow(
          errMsg
        );

        mocked.mockRestore();
      });

      // describe("Testing db-path-windows", () => {
      //     test("Checking getPOSIXDBPathBase()", () => {
      //         let getPOSIXDBPathBase: typeof getPOSIXDBPathBaseFun;

      //         jest.isolateModules(() => {
      //             ({ getPOSIXDBPathBase } = require('../database/db-path-windows'));
      //         });

      //         const USERPROFILEOrg = process.env["USERPROFILE"];
      //         delete process.env["USERPROFILE"];
      //         expect(() => { getPOSIXDBPathBase!(); }).toThrow("Environment variable USERPROFILE not defined");
      //         process.env["USERPROFILE"] = USERPROFILEOrg;
      //     });
      // });
    } else if (appPlatform === "postgres") {
      test("checking [instance of DBDataMovieManagerWindows].execRetID(*) missing branches/lines/statements", async () => {
        if (moviesDataSource["_dbDataMovieManager"]) {
          await moviesDataSource.init();

          const mocked = jest
            .spyOn(
              moviesDataSource[
                "_dbDataMovieManager"
              ] as unknown as IPostgresRawExecRetIDPublic,
              "_rawExecRetID"
            )
            .mockImplementation(
              async (
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                sql: string,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                bindings: readonly Knex.RawBinding[]
              ): Promise<Knex.Raw<IPostgresRunReturn>> => {
                //  Promise<Knex.Raw<IBetterSQqliteRunReturn>>
                const info = {};
                return info as unknown as Knex.Raw<IPostgresRunReturn>;
              }
            );

          await expect(
            moviesDataSource["_dbDataMovieManager"]["execRetID"]("", "")
          ).rejects.toThrow("Row id unavailable");

          mocked.mockRestore();
        }
      });

      test("checking [instance of DBDataMovieManagerPostgres].init(*) - error in 'CLDB'", async () => {
        const knexPostgres = knx({
          client: "pg",
          connection: process.env.TEST_DATABASE_URL,
          // searchPath: ['knex', 'public'],
        });
        const { DBDataMovieManagerPostgres } = await import(
          "../database/db-data-moviemanager-postgres"
        );
        const dbDataMovieManagerPostgres = new DBDataMovieManagerPostgres(knexPostgres);

        const createSchemaCreateTablesOrg =
          dbDataMovieManagerPostgres["createSchemaCreateTables"];

        const dBName = "CLDB";
        const errMsg = `openning ${dBName} exception`;

        const mocked = jest
          .spyOn(
            dbDataMovieManagerPostgres as unknown as DBDataMovieManagerPostgresPublic,
            "createSchemaCreateTables"
          )
          .mockImplementation(async (db: DB): Promise<void> => {
            if (db.name.includes(dBName)) {
              throw new Error(errMsg);
            }

            return createSchemaCreateTablesOrg.call(
              dbDataMovieManagerPostgres,
              db
            );
          });

        await expect(dbDataMovieManagerPostgres.init()).rejects.toThrow(
          errMsg
        );

        mocked.mockRestore();
        knexPostgres.destroy();
      });

      test("checking [instance of DBDataMovieManagerPostgres].init(*) - error in 'moviemedia'", async () => {
        const knexPostgres = knx({
          client: "pg",
          connection: process.env.TEST_DATABASE_URL,
          // searchPath: ['knex', 'public'],
        });
        const { DBDataMovieManagerPostgres } = await import(
          "../database/db-data-moviemanager-postgres"
        );
        const dbDataMovieManagerPostgres = new DBDataMovieManagerPostgres(knexPostgres);

        const createSchemaCreateTablesOrg =
          dbDataMovieManagerPostgres["createSchemaCreateTables"];

        const dBName = "moviemedia";
        const errMsg = `openning ${dBName} exception`;

        const mocked = jest
          .spyOn(
            dbDataMovieManagerPostgres as unknown as DBDataMovieManagerPostgresPublic,
            "createSchemaCreateTables"
          )
          .mockImplementation(async (db: DB): Promise<void> => {
            if (db.name.includes(dBName)) {
              throw new Error(errMsg);
            }

            return createSchemaCreateTablesOrg.call(
              dbDataMovieManagerPostgres,
              db
            );
          });

        await expect(dbDataMovieManagerPostgres.init()).rejects.toThrow(
          errMsg
        );

        mocked.mockRestore();
        knexPostgres.destroy();
      });

      test("checking [instance of DBDataMovieManagerPostgres].init(*) - error in 'mediaScannerCache'", async () => {
        const knexPostgres = knx({
          client: "pg",
          connection: process.env.TEST_DATABASE_URL,
          // searchPath: ['knex', 'public'],
        });
        const { DBDataMovieManagerPostgres } = await import(
          "../database/db-data-moviemanager-postgres"
        );
        const dbDataMovieManagerPostgres = new DBDataMovieManagerPostgres(knexPostgres);

        const createSchemaCreateTablesOrg =
          dbDataMovieManagerPostgres["createSchemaCreateTables"];

        const dBName = "mediaScannerCache";
        const errMsg = `openning ${dBName} exception`;

        const mocked = jest
          .spyOn(
            dbDataMovieManagerPostgres as unknown as DBDataMovieManagerPostgresPublic,
            "createSchemaCreateTables"
          )
          .mockImplementation(async (db: DB): Promise<void> => {
            if (db.name.includes(dBName)) {
              throw new Error(errMsg);
            }

            return createSchemaCreateTablesOrg.call(
              dbDataMovieManagerPostgres,
              db
            );
          });

        await expect(dbDataMovieManagerPostgres.init()).rejects.toThrow(
          errMsg
        );

        mocked.mockRestore();
        knexPostgres.destroy();
      });

      test("checking [instance of DBDataMovieManagerPostgres].init(*) - error in 'Playlist'", async () => {
        const knexPostgres = knx({
          client: "pg",
          connection: process.env.TEST_DATABASE_URL,
          // searchPath: ['knex', 'public'],
        });
        const { DBDataMovieManagerPostgres } = await import(
          "../database/db-data-moviemanager-postgres"
        );
        const dbDataMovieManagerPostgres = new DBDataMovieManagerPostgres(knexPostgres);

        const createSchemaCreateTablesOrg =
          dbDataMovieManagerPostgres["createSchemaCreateTables"];

        const dBName = "Playlist";
        const errMsg = `openning ${dBName} exception`;

        const mocked = jest
          .spyOn(
            dbDataMovieManagerPostgres as unknown as DBDataMovieManagerPostgresPublic,
            "createSchemaCreateTables"
          )
          .mockImplementation(async (db: DB): Promise<void> => {
            if (db.name.includes(dBName)) {
              throw new Error(errMsg);
            }

            return createSchemaCreateTablesOrg.call(
              dbDataMovieManagerPostgres,
              db
            );
          });

        await expect(dbDataMovieManagerPostgres.init()).rejects.toThrow(
          errMsg
        );

        mocked.mockRestore();
        knexPostgres.destroy();
      });

      test("checking [instance of DBDataMovieManagerPostgres].init(*) - error in 'extra'", async () => {
        const knexPostgres = knx({
          client: "pg",
          connection: process.env.TEST_DATABASE_URL,
          // searchPath: ['knex', 'public'],
        });
        const { DBDataMovieManagerPostgres } = await import(
          "../database/db-data-moviemanager-postgres"
        );
        const dbDataMovieManagerPostgres = new DBDataMovieManagerPostgres(knexPostgres);

        const createSchemaCreateTablesOrg =
          dbDataMovieManagerPostgres["createSchemaCreateTables"];

        const dBName = "extra";
        const errMsg = `openning ${dBName} exception`;

        const mocked = jest
          .spyOn(
            dbDataMovieManagerPostgres as unknown as DBDataMovieManagerPostgresPublic,
            "createSchemaCreateTables"
          )
          .mockImplementation(async (db: DB): Promise<void> => {
            if (db.name.includes(dBName)) {
              throw new Error(errMsg);
            }

            return createSchemaCreateTablesOrg.call(
              dbDataMovieManagerPostgres,
              db
            );
          });

        await expect(dbDataMovieManagerPostgres.init()).rejects.toThrow(
          errMsg
        );

        mocked.mockRestore();
        knexPostgres.destroy();
      });
    }

    //===============================================================================================================
    // Database operations
    //===============================================================================================================
    test(`checking adding/getting/updating/deleting a movie group for endpoint: /groups & groups/:gid`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      // add movie group
      const column_names = ["name"];
      const column_values = ["Cinema"];
      const gid = await moviesDataSource.addMovieGroup(
        undefined,
        undefined,
        column_names,
        column_values
      );

      expect(gid).toBeGreaterThanOrEqual(1);

      // get added movie group
      const result = await moviesDataSource.getMovieGroups(undefined, gid);
      expect(result.total_count).toBe(1);
      expect(
        result.rows[0][convertReportedColumnName(column_names[0])] ===
          column_values[0]
      );

      // update the movie group 'name' column
      const column_names2 = ["name"];
      const column_values2 = ["Cinema (Horror)"];

      await moviesDataSource.updateMovieGroup(
        gid,
        column_names2,
        column_values2
      );

      // get updated group
      const result2 = await moviesDataSource.getMovieGroups(undefined, gid);
      expect(result2.total_count).toBe(1);
      expect(
        result2.rows[0][convertReportedColumnName(column_names2[0])] ===
          column_values2[0]
      );

      // delete the movie group
      await moviesDataSource.deleteMovieGroup(gid);

      // get deleted group
      await expect(
        moviesDataSource.getMovieGroups(undefined, gid)
      ).rejects.toThrowError(`Missing group: ${gid}`);
    });

    test(`checking adding a movie group (missing type case)`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      const column_names = ["name"];
      const column_values = ["Cinema"];
      await expect(
        moviesDataSource.addMovieGroup(
          1,
          undefined,
          column_names,
          column_values
        )
      ).rejects.toThrowError("Missing group type: 1");
    });

    test(`checking adding/getting/updating/changing group type/removing group type/deleting a movie group`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      // get groups of non-existing type
      await expect(
        moviesDataSource.getMovieGroups(1, undefined)
      ).rejects.toThrowError("Missing group type: 1");

      // get gropus of any type (=0)
      const result = await moviesDataSource.getMovieGroups(0, undefined);
      expect(result.total_count).toBe(0);

      // removing group from non-existing type
      await expect(
        moviesDataSource.moveMovieGroup2NoType(1, 1)
      ).rejects.toThrowError("Missing group type: 1");

      // adding a new group to non-existing type
      const columns_names = ["name"];
      const column_values = ["Cinema (Drama)"];
      await expect(
        moviesDataSource.addMovieGroup(
          1,
          undefined,
          columns_names,
          column_values
        )
      ).rejects.toThrowError("Missing group type: 1");

      // adding a new group yo existing type
      const column_names2 = ["name", "description"];
      const column_values2 = ["Genres", "Movie Genres"];
      const tid = await moviesDataSource.addMovieGroupType(
        column_names2,
        column_values2
      );
      expect(tid).toBeGreaterThanOrEqual(1);

      const columns_names3 = ["name"];
      const column_values3 = ["Cinema (Horror)"];
      const gid = await moviesDataSource.addMovieGroup(
        tid,
        undefined,
        columns_names3,
        column_values3
      );
      expect(gid).toBeGreaterThanOrEqual(1);

      // adding a group to type (non-existing typeid)
      await expect(
        moviesDataSource.moveMovieGroup2AnotherType(gid, tid + 1)
      ).rejects.toThrowError(`Missing group type: ${tid + 1}`);

      // adding a no-existing group to existing type
      await expect(
        moviesDataSource.moveMovieGroup2AnotherType(gid + 1, tid)
      ).rejects.toThrowError(`Missing group: ${gid + 1}`);

      // getting type group (existing typeid/existing groupid)
      const result2 = await moviesDataSource.getMovieGroups(tid, gid);
      expect(result2.total_count).toBe(1);
      expect(result2.rows[0][convertReportedColumnName("_id")]).toBe(gid);
      expect(result2.rows[0][convertReportedColumnName("name")]).toBe(
        column_values3[0]
      );
      expect(result2.rows[0][convertReportedColumnName("gendid")]).toBe(tid);

      // getting type group (non-existing typeid/existing groupid)
      await expect(
        moviesDataSource.getMovieGroups(tid + 1, gid)
      ).rejects.toThrowError(`Missing group type: ${tid + 1}`);

      // getting type group (existing typeid/non-existing groupid)
      await expect(
        moviesDataSource.getMovieGroups(tid, gid + 1)
      ).rejects.toThrowError(`Missing group: ${gid + 1}`);

      // getting type group (non-existing typeid/non-existing groupid)
      await expect(
        moviesDataSource.getMovieGroups(tid + 1, gid + 1)
      ).rejects.toThrowError(`Missing group type: ${tid + 1}`);

      // getting type group (existing typeid)
      const result3 = await moviesDataSource.getMovieGroups(tid, undefined);
      expect(result3.total_count).toBe(1);
      expect(result3.rows[0][convertReportedColumnName("_id")]).toBe(gid);
      expect(result3.rows[0][convertReportedColumnName("name")]).toBe(
        column_values3[0]
      );
      expect(result3.rows[0][convertReportedColumnName("gendid")]).toBe(tid);

      // adding a new group (typeid=0 - always exists/means no type)
      const column_names4 = ["name"];
      const column_values4 = ["Cinema (Comedy)"];
      const gid2 = await moviesDataSource.addMovieGroup(
        0,
        undefined,
        column_names4,
        column_values4
      );
      expect(gid2).toBeGreaterThanOrEqual(1);

      // getting type group (existing typeid/existing groupid)
      const result4 = await moviesDataSource.getMovieGroups(0, gid2);
      expect(result4.total_count).toBe(1);
      expect(result4.rows[0][convertReportedColumnName("_id")]).toBe(gid2);
      expect(result4.rows[0][convertReportedColumnName("name")]).toBe(
        column_values4[0]
      );
      expect(result4.rows[0][convertReportedColumnName("gendid")]).toBeNull();

      // moving group to type (typeid=0 - always exists/means no type)
      await expect(
        moviesDataSource.moveMovieGroup2AnotherType(gid, 0)
      ).resolves.toBeUndefined();

      // moving group to type (typeid=0 - always exists/means no type; previous type=0 - imdepotent action)
      await expect(
        moviesDataSource.moveMovieGroup2AnotherType(gid, 0)
      ).resolves.toBeUndefined();

      // getting type group (existing typeid/existing groupid)
      const result5 = await moviesDataSource.getMovieGroups(0, gid);
      expect(result5.total_count).toBe(1);
      expect(result5.rows[0][convertReportedColumnName("_id")]).toBe(gid);
      expect(result5.rows[0][convertReportedColumnName("name")]).toBe(
        column_values3[0]
      );
      expect(result5.rows[0][convertReportedColumnName("gendid")]).toBeNull();

      // moving group to type (existing typeid/existing groupid)
      const column_names5 = ["name", "description"];
      const column_values5 = ["People", "Movie Directors, Writers"];
      const tid2 = await moviesDataSource.addMovieGroupType(
        column_names5,
        column_values5
      );
      expect(tid2).toBeGreaterThanOrEqual(1);

      await expect(
        moviesDataSource.moveMovieGroup2AnotherType(gid, tid2)
      ).resolves.toBeUndefined();

      // getting type group (existing typeid/existing groupid)
      const result6 = await moviesDataSource.getMovieGroups(tid2, gid);
      expect(result6.total_count).toBe(1);
      expect(result6.rows[0][convertReportedColumnName("_id")]).toBe(gid);
      expect(result6.rows[0][convertReportedColumnName("name")]).toBe(
        column_values3[0]
      );
      expect(result6.rows[0][convertReportedColumnName("gendid")]).toBe(tid2);

      // removing group from type (existing typeid)
      await expect(
        moviesDataSource.moveMovieGroup2NoType(tid2, gid)
      ).resolves.toBeUndefined();

      // removing group from type (typeid=0 - always exists/means no type)
      await expect(
        moviesDataSource.moveMovieGroup2NoType(0, gid)
      ).resolves.toBeUndefined();

      // getting type group (existing typeid/existing groupid)
      const result7 = await moviesDataSource.getMovieGroups(0, gid);
      expect(result7.total_count).toBe(1);
      expect(result7.rows[0][convertReportedColumnName("_id")]).toBe(gid);
      expect(result7.rows[0][convertReportedColumnName("name")]).toBe(
        column_values3[0]
      );
      expect(result7.rows[0][convertReportedColumnName("gendid")]).toBeNull();

      // moving group to type (existing typeid/existing groupid)
      await expect(
        moviesDataSource.moveMovieGroup2AnotherType(gid, tid2)
      ).resolves.toBeUndefined();

      // getting type group (existing typeid/existing groupid)
      const result8 = await moviesDataSource.getMovieGroups(tid2, gid);
      expect(result8.total_count).toBe(1);
      expect(result8.rows[0][convertReportedColumnName("_id")]).toBe(gid);
      expect(result8.rows[0][convertReportedColumnName("name")]).toBe(
        column_values3[0]
      );
      expect(result8.rows[0][convertReportedColumnName("gendid")]).toBe(tid2);

      // adding a new group to type (typeid=0 - always exists/means no type)
      const column_names6 = ["name"];
      const column_values6 = ["Cinema (Sci-Fi)"];
      const gid3 = await moviesDataSource.addMovieGroup(
        0,
        undefined,
        column_names6,
        column_values6
      );
      expect(gid3).toBeGreaterThanOrEqual(1);

      // getting type group (existing typeid)
      const result9 = await moviesDataSource.getMovieGroups(0, undefined);
      expect(result9.total_count).toBe(2);
      const indx_gid2 = result9.rows.findIndex(
        (row) => row[convertReportedColumnName("_id")] === gid2
      );
      const indx_gid3 = result9.rows.findIndex(
        (row) => row[convertReportedColumnName("_id")] === gid3
      );
      expect(indx_gid2).not.toBe(-1);
      expect(indx_gid3).not.toBe(-1);
      expect(result9.rows[indx_gid2][convertReportedColumnName("_id")]).toBe(
        gid2
      );
      expect(result9.rows[indx_gid2][convertReportedColumnName("name")]).toBe(
        column_values4[0]
      );
      expect(result9.rows[indx_gid2][convertReportedColumnName("gendid")])
        .toBeNull;
      expect(result9.rows[indx_gid3][convertReportedColumnName("_id")]).toBe(
        gid3
      );
      expect(result9.rows[indx_gid3][convertReportedColumnName("name")]).toBe(
        column_values6[0]
      );
      expect(result9.rows[indx_gid3][convertReportedColumnName("gendid")])
        .toBeNull;
    });

    test(`checking getting movie groups when no groups`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      const result = await moviesDataSource.getMovieGroups(
        undefined,
        undefined
      );
      expect(result.total_count).toBe(0);
    });

    test(`checking getting movie groups`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      const column_names = ["name", "description"];
      const column_values = ["Genres", "Movie Genres"];
      const tid1 = await moviesDataSource.addMovieGroupType(
        column_names,
        column_values
      );
      expect(tid1).toBeGreaterThanOrEqual(1);
      //==
      const column_names2 = ["name", "description"];
      const column_values2 = ["People", "Directors, Writers"];
      const tid2 = await moviesDataSource.addMovieGroupType(
        column_names2,
        column_values2
      );
      expect(tid2).toBeGreaterThanOrEqual(1);

      //========================================================================================================
      const column_names3 = ["name"];
      const column_values3 = ["Cinema (Action)"];
      const gid = await moviesDataSource.addMovieGroup(
        tid1,
        undefined,
        column_names3,
        column_values3
      );
      expect(gid).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const column_names4 = ["name"];
      const column_values4 = ["Cinema (Adventure)"];
      const gid2 = await moviesDataSource.addMovieGroup(
        tid1,
        undefined,
        column_names4,
        column_values4
      );
      expect(gid2).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const column_names5 = ["name"];
      const column_values5 = ["Cinema (Scott Ridley)"];
      const gid3 = await moviesDataSource.addMovieGroup(
        tid2,
        undefined,
        column_names5,
        column_values5
      );
      expect(gid3).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const column_names6 = ["name"];
      const column_values6 = ["Cinema (Star Wars)"];
      const gid4 = await moviesDataSource.addMovieGroup(
        undefined,
        undefined,
        column_names6,
        column_values6
      );
      expect(gid4).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const result = await moviesDataSource.getMovieGroups(
        undefined,
        undefined
      );
      expect(result.total_count).toBe(4);
      const indx_gid = result.rows.findIndex(
        (row) => row[convertReportedColumnName("_id")] === gid
      );
      expect(indx_gid).not.toBe(-1);
      const indx_gid2 = result.rows.findIndex(
        (row) => row[convertReportedColumnName("_id")] === gid2
      );
      expect(indx_gid2).not.toBe(-1);
      const indx_gid3 = result.rows.findIndex(
        (row) => row[convertReportedColumnName("_id")] === gid3
      );
      expect(indx_gid3).not.toBe(-1);
      const indx_gid4 = result.rows.findIndex(
        (row) => row[convertReportedColumnName("_id")] === gid4
      );
      expect(indx_gid4).not.toBe(-1);
      expect(result.rows[indx_gid][convertReportedColumnName("_id")]).toBe(gid);
      expect(result.rows[indx_gid][convertReportedColumnName("name")]).toBe(
        column_values3[0]
      );
      expect(result.rows[indx_gid][convertReportedColumnName("gendid")]).toBe(
        tid1
      );
      expect(result.rows[indx_gid2][convertReportedColumnName("_id")]).toBe(
        gid2
      );
      expect(result.rows[indx_gid2][convertReportedColumnName("name")]).toBe(
        column_values4[0]
      );
      expect(result.rows[indx_gid2][convertReportedColumnName("gendid")]).toBe(
        tid1
      );
      expect(result.rows[indx_gid3][convertReportedColumnName("_id")]).toBe(
        gid3
      );
      expect(result.rows[indx_gid3][convertReportedColumnName("name")]).toBe(
        column_values5[0]
      );
      expect(result.rows[indx_gid3][convertReportedColumnName("gendid")]).toBe(
        tid2
      );
      expect(result.rows[indx_gid4][convertReportedColumnName("_id")]).toBe(
        gid4
      );
      expect(result.rows[indx_gid4][convertReportedColumnName("name")]).toBe(
        column_values6[0]
      );
      expect(
        result.rows[indx_gid4][convertReportedColumnName("gendid")]
      ).toBeNull();

      // //========================================================================================================
      const result2 = await moviesDataSource.getMovieGroups(tid1, undefined);
      expect(result2.total_count).toBe(2);
      const indx_gida = result2.rows.findIndex(
        (row) => row[convertReportedColumnName("_id")] === gid
      );
      expect(indx_gida).not.toBe(-1);
      const indx_gid2a = result2.rows.findIndex(
        (row) => row[convertReportedColumnName("_id")] === gid2
      );
      expect(indx_gid2a).not.toBe(-1);
      expect(result2.rows[indx_gida][convertReportedColumnName("_id")]).toBe(
        gid
      );
      expect(result2.rows[indx_gida][convertReportedColumnName("name")]).toBe(
        column_values3[0]
      );
      expect(result2.rows[indx_gida][convertReportedColumnName("gendid")]).toBe(
        tid1
      );
      expect(result2.rows[indx_gid2a][convertReportedColumnName("_id")]).toBe(
        gid2
      );
      expect(result2.rows[indx_gid2a][convertReportedColumnName("name")]).toBe(
        column_values4[0]
      );
      expect(
        result2.rows[indx_gid2a][convertReportedColumnName("gendid")]
      ).toBe(tid1);

      // //========================================================================================================
      const result3 = await moviesDataSource.getMovieGroups(tid2, undefined);
      expect(result3.total_count).toBe(1);
      expect(result3.rows[0][convertReportedColumnName("_id")]).toBe(gid3);
      expect(result3.rows[0][convertReportedColumnName("name")]).toBe(
        column_values5[0]
      );
      expect(result3.rows[0][convertReportedColumnName("gendid")]).toBe(tid2);

      // //========================================================================================================
      const result4 = await moviesDataSource.getMovieGroups(0, undefined);
      expect(result4.total_count).toBe(1);
      expect(result4.rows[0][convertReportedColumnName("_id")]).toBe(gid4);
      expect(result4.rows[0][convertReportedColumnName("name")]).toBe(
        column_values6[0]
      );
      expect(result4.rows[0][convertReportedColumnName("gendid")]).toBeNull();
    });

    test(`checking getting movie groups with paging`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      const column_names = ["name", "description"];
      const column_values = ["Genres", "Movie Genres"];
      const tid1 = await moviesDataSource.addMovieGroupType(
        column_names,
        column_values
      );
      expect(tid1).toBeGreaterThanOrEqual(1);
      //==
      const column_names2 = ["name", "description"];
      const column_values2 = ["People", "Directors, Writers"];
      const tid2 = await moviesDataSource.addMovieGroupType(
        column_names2,
        column_values2
      );
      expect(tid2).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const column_names3 = ["name"];
      const column_values3 = ["Cinema (Action)"];
      const gid = await moviesDataSource.addMovieGroup(
        tid1,
        undefined,
        column_names3,
        column_values3
      );
      expect(gid).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const column_names4 = ["name"];
      const column_values4 = ["Cinema (Adventure)"];
      const gid2 = await moviesDataSource.addMovieGroup(
        tid1,
        undefined,
        column_names4,
        column_values4
      );
      expect(gid2).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const column_names5 = ["name"];
      const column_values5 = ["Cinema (Crime)"];
      const gid3 = await moviesDataSource.addMovieGroup(
        tid1,
        undefined,
        column_names5,
        column_values5
      );
      expect(gid3).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const column_names6 = ["name"];
      const column_values6 = ["Cinema (Scott Ridley)"];
      const gid4 = await moviesDataSource.addMovieGroup(
        tid2,
        undefined,
        column_names6,
        column_values6
      );
      expect(gid4).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const column_names7 = ["name"];
      const column_values7 = ["Cinema (Mel Gibson)"];
      const gid5 = await moviesDataSource.addMovieGroup(
        tid2,
        undefined,
        column_names7,
        column_values7
      );
      expect(gid5).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const column_names8 = ["name"];
      const column_values8 = ["Cinema (Star Wars)"];
      const gid6 = await moviesDataSource.addMovieGroup(
        undefined,
        undefined,
        column_names8,
        column_values8
      );
      expect(gid6).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      // Note: this is sorted alphabetically
      const result1 = await moviesDataSource.getMovieGroups(
        undefined,
        undefined,
        undefined,
        5,
        undefined,
        undefined,
        undefined,
        undefined
      );
      expect(result1.rows.length).toBe(5);
      expect(result1.rows[0][convertReportedColumnName("_id")]).toBe(gid);
      expect(result1.rows[0][convertReportedColumnName("name")]).toBe(
        column_values3[0]
      );
      expect(result1.rows[0][convertReportedColumnName("gendid")]).toBe(tid1);
      expect(result1.rows[1][convertReportedColumnName("_id")]).toBe(gid2);
      expect(result1.rows[1][convertReportedColumnName("name")]).toBe(
        column_values4[0]
      );
      expect(result1.rows[1][convertReportedColumnName("gendid")]).toBe(tid1);
      expect(result1.rows[2][convertReportedColumnName("_id")]).toBe(gid3);
      expect(result1.rows[2][convertReportedColumnName("name")]).toBe(
        column_values5[0]
      );
      expect(result1.rows[2][convertReportedColumnName("gendid")]).toBe(tid1);
      expect(result1.rows[3][convertReportedColumnName("_id")]).toBe(gid5);
      expect(result1.rows[3][convertReportedColumnName("name")]).toBe(
        column_values7[0]
      );
      expect(result1.rows[3][convertReportedColumnName("gendid")]).toBe(tid2);
      expect(result1.rows[4][convertReportedColumnName("_id")]).toBe(gid4);
      expect(result1.rows[4][convertReportedColumnName("name")]).toBe(
        column_values6[0]
      );
      expect(result1.rows[4][convertReportedColumnName("gendid")]).toBe(tid2);

      // //========================================================================================================
      // Note: this is sorted alphabetically
      const result2 = await moviesDataSource.getMovieGroups(
        undefined,
        undefined,
        undefined,
        5,
        undefined,
        undefined,
        undefined,
        1
      );
      expect(result2.rows.length).toBe(5);
      expect(result2.rows[0][convertReportedColumnName("_id")]).toBe(gid2);
      expect(result2.rows[0][convertReportedColumnName("name")]).toBe(
        column_values4[0]
      );
      expect(result2.rows[0][convertReportedColumnName("gendid")]).toBe(tid1);
      expect(result2.rows[1][convertReportedColumnName("_id")]).toBe(gid3);
      expect(result2.rows[1][convertReportedColumnName("name")]).toBe(
        column_values5[0]
      );
      expect(result2.rows[1][convertReportedColumnName("gendid")]).toBe(tid1);
      expect(result2.rows[2][convertReportedColumnName("_id")]).toBe(gid5);
      expect(result2.rows[2][convertReportedColumnName("name")]).toBe(
        column_values7[0]
      );
      expect(result2.rows[2][convertReportedColumnName("gendid")]).toBe(tid2);
      expect(result2.rows[3][convertReportedColumnName("_id")]).toBe(gid4);
      expect(result2.rows[3][convertReportedColumnName("name")]).toBe(
        column_values6[0]
      );
      expect(result2.rows[3][convertReportedColumnName("gendid")]).toBe(tid2);
      expect(result2.rows[4][convertReportedColumnName("_id")]).toBe(gid6);
      expect(result2.rows[4][convertReportedColumnName("name")]).toBe(
        column_values8[0]
      );
      expect(result2.rows[4][convertReportedColumnName("gendid")]).toBeNull();

      // //========================================================================================================
      // Note: this is sorted alphabetically
      const result3 = await moviesDataSource.getMovieGroups(
        undefined,
        undefined,
        undefined,
        5,
        undefined,
        undefined,
        undefined,
        2
      );
      expect(result3.rows.length).toBe(4);
      expect(result3.rows[0][convertReportedColumnName("_id")]).toBe(gid3);
      expect(result3.rows[0][convertReportedColumnName("name")]).toBe(
        column_values5[0]
      );
      expect(result3.rows[0][convertReportedColumnName("gendid")]).toBe(tid1);
      expect(result3.rows[1][convertReportedColumnName("_id")]).toBe(gid5);
      expect(result3.rows[1][convertReportedColumnName("name")]).toBe(
        column_values7[0]
      );
      expect(result3.rows[1][convertReportedColumnName("gendid")]).toBe(tid2);
      expect(result3.rows[2][convertReportedColumnName("_id")]).toBe(gid4);
      expect(result3.rows[2][convertReportedColumnName("name")]).toBe(
        column_values6[0]
      );
      expect(result3.rows[2][convertReportedColumnName("gendid")]).toBe(tid2);
      expect(result3.rows[3][convertReportedColumnName("_id")]).toBe(gid6);
      expect(result3.rows[3][convertReportedColumnName("name")]).toBe(
        column_values8[0]
      );
      expect(result3.rows[3][convertReportedColumnName("gendid")]).toBeNull();

      // //========================================================================================================
      // Note: this is sorted alphabetically
      const result4 = await moviesDataSource.getMovieGroups(
        undefined,
        undefined,
        undefined,
        6,
        undefined,
        undefined,
        undefined,
        undefined
      );
      expect(result4.rows.length).toBe(6);
      expect(result4.rows[0][convertReportedColumnName("_id")]).toBe(gid);
      expect(result4.rows[0][convertReportedColumnName("name")]).toBe(
        column_values3[0]
      );
      expect(result4.rows[0][convertReportedColumnName("gendid")]).toBe(tid1);
      expect(result4.rows[1][convertReportedColumnName("_id")]).toBe(gid2);
      expect(result4.rows[1][convertReportedColumnName("name")]).toBe(
        column_values4[0]
      );
      expect(result4.rows[1][convertReportedColumnName("gendid")]).toBe(tid1);
      expect(result4.rows[2][convertReportedColumnName("_id")]).toBe(gid3);
      expect(result4.rows[2][convertReportedColumnName("name")]).toBe(
        column_values5[0]
      );
      expect(result4.rows[2][convertReportedColumnName("gendid")]).toBe(tid1);
      expect(result4.rows[3][convertReportedColumnName("_id")]).toBe(gid5);
      expect(result4.rows[3][convertReportedColumnName("name")]).toBe(
        column_values7[0]
      );
      expect(result4.rows[3][convertReportedColumnName("gendid")]).toBe(tid2);
      expect(result4.rows[4][convertReportedColumnName("_id")]).toBe(gid4);
      expect(result4.rows[4][convertReportedColumnName("name")]).toBe(
        column_values6[0]
      );
      expect(result4.rows[4][convertReportedColumnName("gendid")]).toBe(tid2);
      expect(result4.rows[5][convertReportedColumnName("_id")]).toBe(gid6);
      expect(result4.rows[5][convertReportedColumnName("name")]).toBe(
        column_values8[0]
      );
      expect(result4.rows[5][convertReportedColumnName("gendid")]).toBeNull();

      // //========================================================================================================
      // Note: this is sorted alphabetically
      const result5 = await moviesDataSource.getMovieGroups(
        tid1,
        undefined,
        undefined,
        2,
        undefined,
        undefined,
        undefined,
        undefined
      );
      expect(result5.rows.length).toBe(2);
      expect(result5.rows[0][convertReportedColumnName("_id")]).toBe(gid);
      expect(result5.rows[0][convertReportedColumnName("name")]).toBe(
        column_values3[0]
      );
      expect(result5.rows[0][convertReportedColumnName("gendid")]).toBe(tid1);
      expect(result5.rows[1][convertReportedColumnName("_id")]).toBe(gid2);
      expect(result5.rows[1][convertReportedColumnName("name")]).toBe(
        column_values4[0]
      );
      expect(result5.rows[1][convertReportedColumnName("gendid")]).toBe(tid1);

      // //========================================================================================================
      // Note: this is sorted alphabetically
      const result6 = await moviesDataSource.getMovieGroups(
        tid2,
        undefined,
        undefined,
        2,
        undefined,
        undefined,
        undefined,
        undefined
      );
      expect(result6.rows.length).toBe(2);
      expect(result6.rows[0][convertReportedColumnName("_id")]).toBe(gid5);
      expect(result6.rows[0][convertReportedColumnName("name")]).toBe(
        column_values7[0]
      );
      expect(result6.rows[0][convertReportedColumnName("gendid")]).toBe(tid2);
      expect(result6.rows[1][convertReportedColumnName("_id")]).toBe(gid4);
      expect(result6.rows[1][convertReportedColumnName("name")]).toBe(
        column_values6[0]
      );
      expect(result6.rows[1][convertReportedColumnName("gendid")]).toBe(tid2);

      // //========================================================================================================
      // Note: this is sorted alphabetically
      const result7 = await moviesDataSource.getMovieGroups(
        0,
        undefined,
        undefined,
        2,
        undefined,
        undefined,
        undefined,
        undefined
      );
      expect(result7.rows.length).toBe(1);
      expect(result7.rows[0][convertReportedColumnName("_id")]).toBe(gid6);
      expect(result7.rows[0][convertReportedColumnName("name")]).toBe(
        column_values8[0]
      );
      expect(result7.rows[0][convertReportedColumnName("gendid")]).toBeNull();
    });

    test(`checking adding/getting/updating/deleting type`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      //========================================================================================================
      const column_names = ["name", "description"];
      const column_values = ["Genres", "Movie Genres"];
      const tid = await moviesDataSource.addMovieGroupType(
        column_names,
        column_values
      );
      expect(tid).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const result = await moviesDataSource.getMovieGroupTypes(tid);
      expect(result.total_count).toBe(1);
      expect(result.rows[0][convertReportedColumnName("_id")]).toBe(tid);
      expect(result.rows[0][convertReportedColumnName("name")]).toBe(
        column_values[0]
      );
      expect(result.rows[0][convertReportedColumnName("description")]).toBe(
        column_values[1]
      );

      // //========================================================================================================
      const column_names2 = ["name", "description"];
      const column_values2 = ["Genrese", "Ala ma kota"];
      await expect(
        moviesDataSource.updateMovieGroupType(
          tid,
          column_names2,
          column_values2
        )
      ).resolves.toBeUndefined();

      // //========================================================================================================
      const result2 = await moviesDataSource.getMovieGroupTypes(undefined);
      expect(result2.total_count).toBe(1);
      expect(result2.rows[0][convertReportedColumnName("_id")]).toBe(tid);
      expect(result2.rows[0][convertReportedColumnName("name")]).toBe(
        column_values2[0]
      );
      expect(result2.rows[0][convertReportedColumnName("description")]).toBe(
        column_values2[1]
      );

      // //========================================================================================================
      await expect(
        moviesDataSource.deleteMovieGroupType(tid)
      ).resolves.toBeUndefined();

      // //========================================================================================================
      const result3 = await moviesDataSource.getMovieGroupTypes(tid);
      expect(result3.total_count).toBe(0);
    });

    test(`checking removing type referenced by a group`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      // //========================================================================================================
      const column_names = ["name", "description"];
      const column_values = ["Genres", "Movie Genres"];
      const tid = await moviesDataSource.addMovieGroupType(
        column_names,
        column_values
      );
      expect(tid).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const result = await moviesDataSource.getMovieGroupTypes(tid);
      expect(result.total_count).toBe(1);
      expect(result.rows[0][convertReportedColumnName("_id")]).toBe(tid);
      expect(result.rows[0][convertReportedColumnName("name")]).toBe(
        column_values[0]
      );
      expect(result.rows[0][convertReportedColumnName("description")]).toBe(
        column_values[1]
      );

      // //========================================================================================================
      const column_names2 = ["name"];
      const column_values2 = ["Cinema (Horror)"];
      const gid = await moviesDataSource.addMovieGroup(
        tid,
        undefined,
        column_names2,
        column_values2
      );
      expect(gid).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const result2 = await moviesDataSource.getMovieGroups(tid, gid);
      expect(result2.total_count).toBe(1);
      expect(result2.rows[0][convertReportedColumnName("_id")]).toBe(gid);
      expect(result2.rows[0][convertReportedColumnName("name")]).toBe(
        column_values2[0]
      );
      expect(result2.rows[0][convertReportedColumnName("gendid")]).toBe(tid);

      // //========================================================================================================
      await expect(
        moviesDataSource.deleteMovieGroupType(tid)
      ).rejects.toThrowError(`There are some groups referencing type=${tid}`);
    });

    test(`checking getting types when no types`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      // //========================================================================================================
      const result = await moviesDataSource.getMovieGroupTypes(undefined);
      expect(result.total_count).toBe(0);
    });

    test(`checking getting types`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      //========================================================================================================
      const column_names = ["name", "description"];
      const column_values = ["Genres", "Movie Genres"];
      const tid = await moviesDataSource.addMovieGroupType(
        column_names,
        column_values
      );
      expect(tid).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const column_names2 = ["name", "description"];
      const column_values2 = ["People", "Directors, Writers"];
      const tid2 = await moviesDataSource.addMovieGroupType(
        column_names2,
        column_values2
      );
      expect(tid2).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const column_names3 = ["name", "description"];
      const column_values3 = ["Series", "Series of Programs, TV Movies"];
      const tid3 = await moviesDataSource.addMovieGroupType(
        column_names3,
        column_values3
      );
      expect(tid3).toBeGreaterThanOrEqual(1);

      //========================================================================================================
      // Note: rows are ordered alphabetically
      const result = await moviesDataSource.getMovieGroupTypes(undefined);
      expect(result.total_count).toBe(3);
      expect(result.rows[0][convertReportedColumnName("_id")]).toBe(tid);
      expect(result.rows[0][convertReportedColumnName("name")]).toBe(
        column_values[0]
      );
      expect(result.rows[0][convertReportedColumnName("description")]).toBe(
        column_values[1]
      );
      expect(result.rows[1][convertReportedColumnName("_id")]).toBe(tid2);
      expect(result.rows[1][convertReportedColumnName("name")]).toBe(
        column_values2[0]
      );
      expect(result.rows[1][convertReportedColumnName("description")]).toBe(
        column_values2[1]
      );
      expect(result.rows[2][convertReportedColumnName("_id")]).toBe(tid3);
      expect(result.rows[2][convertReportedColumnName("name")]).toBe(
        column_values3[0]
      );
      expect(result.rows[2][convertReportedColumnName("description")]).toBe(
        column_values3[1]
      );
    });

    test(`checking getting types with paging`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      //========================================================================================================
      const column_names = ["name", "description"];
      const column_values = ["Genres", "Movie Genres"];
      const tid = await moviesDataSource.addMovieGroupType(
        column_names,
        column_values
      );
      expect(tid).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const column_names2 = ["name", "description"];
      const column_values2 = ["People", "Directors, Writers"];
      const tid2 = await moviesDataSource.addMovieGroupType(
        column_names2,
        column_values2
      );
      expect(tid2).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const column_names3 = ["name", "description"];
      const column_values3 = ["Series", "Series of Programs, TV Movies"];
      const tid3 = await moviesDataSource.addMovieGroupType(
        column_names3,
        column_values3
      );
      expect(tid3).toBeGreaterThanOrEqual(1);

      //========================================================================================================
      // Note: rows are ordered alphabetically
      const result = await moviesDataSource.getMovieGroupTypes(undefined, 2, 0);
      expect(result.rows.length).toBe(2);
      expect(result.rows[0][convertReportedColumnName("_id")]).toBe(tid);
      expect(result.rows[0][convertReportedColumnName("name")]).toBe(
        column_values[0]
      );
      expect(result.rows[0][convertReportedColumnName("description")]).toBe(
        column_values[1]
      );
      expect(result.rows[1][convertReportedColumnName("_id")]).toBe(tid2);
      expect(result.rows[1][convertReportedColumnName("name")]).toBe(
        column_values2[0]
      );
      expect(result.rows[1][convertReportedColumnName("description")]).toBe(
        column_values2[1]
      );
    });

    test(`checking adding/getting/updating/deleting movie`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      // //========================================================================================================
      const folders = [`Perfect Storm (2000), The `];

      const column_names = [`title`, `mediaFullPath`];
      const column_values = [
        `The Perfect Storm (2000)`,
        `C:\\Movies\\${folders[0]}\\The.Perfect.Storm.(2000).mkv`,
      ];
      const mid = await moviesDataSource.addMovie(
        undefined,
        undefined,
        column_names,
        column_values
      );
      expect(mid).toBe(`MOVIE_${column_values[1]}`);

      //========================================================================================================
      const result = await moviesDataSource.getMovies(undefined, mid);
      expect(result.total_count).toBe(1);

      expect(result.rows[0][convertReportedColumnName("_id")]).toBe(mid);
      expect(result.rows[0][convertReportedColumnName(`title`)]).toBe(
        column_values[0]
      );
      expect(result.rows[0][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values[1]
      );

      if (dBConsts.USE_FOLDER_COLUMN_IN_MOVIES) {
        expect(result.rows[0][convertReportedColumnName(`folder`)]).toBe(
          folders[0]
        );
      }

      // //========================================================================================================
      const folders2 = [`Maverick (1994)`];

      const column_names2 = [`title`, `mediaFullPath`];
      const column_values2 = [
        `Maverick (1994)`,
        `C:\\Movies\\${folders2[0]}\\Maverick.(1994).mkv`,
      ];
      const mid2 = await moviesDataSource.addMovie(
        undefined,
        undefined,
        column_names2,
        column_values2
      );
      expect(mid2).toBe(`MOVIE_${column_values2[1]}`);

      //========================================================================================================
      const result2 = await moviesDataSource.getMovies(undefined, mid2);
      expect(result2.total_count).toBe(1);

      expect(result2.rows[0][convertReportedColumnName("_id")]).toBe(mid2);
      expect(result2.rows[0][convertReportedColumnName(`title`)]).toBe(
        column_values2[0]
      );
      expect(result2.rows[0][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values2[1]
      );

      if (dBConsts.USE_FOLDER_COLUMN_IN_MOVIES) {
        expect(result2.rows[0][convertReportedColumnName(`folder`)]).toBe(
          folders2[0]
        );
      }

      // //========================================================================================================
      await expect(moviesDataSource.deleteMovie(mid)).resolves.toBeUndefined();

      // //========================================================================================================
      const result3 = await moviesDataSource.getMovies(undefined, mid);
      expect(result3.total_count).toBe(0);
    });

    test(`checking getting movies when no movies`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      // //========================================================================================================
      const result = await moviesDataSource.getMovies(undefined, undefined);
      expect(result.total_count).toBe(0);
    });

    test(`checking getting movies`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      //========================================================================================================
      const folders = [`Stealth (2005)`];

      const column_names = [`title`, `mediaFullPath`];
      const column_values = [
        `Stealth (2005)`,
        `C:\\Movies\\${folders[0]}\\Stealth.(2005).mkv`,
      ];
      const mid = await moviesDataSource.addMovie(
        undefined,
        undefined,
        column_names,
        column_values
      );
      expect(mid).toBe(`MOVIE_${column_values[1]}`);

      //========================================================================================================
      const folders2 = [`Messenger: The Story of Joan of Arc (1999), The`];

      const column_names2 = [`title`, `mediaFullPath`];
      const column_values2 = [
        `The Messenger: The Story of Joan of Arc (1999)`,
        `C:\\Movies\\${folders2[0]}\\The.Messenger.The.Story.of.Joan.of.Arc.(1999).mkv`,
      ];
      const mid2 = await moviesDataSource.addMovie(
        undefined,
        undefined,
        column_names2,
        column_values2
      );
      expect(mid2).toBe(`MOVIE_${column_values2[1]}`);

      //========================================================================================================
      const result = await moviesDataSource.getMovies(undefined, undefined);
      expect(result.total_count).toBe(2);

      expect(result.rows[0][convertReportedColumnName("_id")]).toBe(mid);
      expect(result.rows[0][convertReportedColumnName(`title`)]).toBe(
        column_values[0]
      );
      expect(result.rows[0][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values[1]
      );
      //==
      expect(result.rows[1][convertReportedColumnName("_id")]).toBe(mid2);
      expect(result.rows[1][convertReportedColumnName(`title`)]).toBe(
        column_values2[0]
      );
      expect(result.rows[1][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values2[1]
      );

      if (dBConsts.USE_FOLDER_COLUMN_IN_MOVIES) {
        expect(result.rows[0][convertReportedColumnName(`folder`)]).toBe(
          folders[0]
        );
        //==
        expect(result.rows[1][convertReportedColumnName(`folder`)]).toBe(
          folders2[0]
        );
      }
    });

    test(`checking getting movies with paging`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      // //========================================================================================================
      const folders = [`Vampires (1998)`];

      const column_names = [`title`, `mediaFullPath`];
      const column_values = [
        `Vampires (1998)`,
        `C:\\Movies\\${folders[0]}\\Vampires.(1998).mkv`,
      ];
      const mid = await moviesDataSource.addMovie(
        undefined,
        undefined,
        column_names,
        column_values
      );
      expect(mid).toBe(`MOVIE_${column_values[1]}`);

      // //========================================================================================================
      const column_names2 = [`title`, `mediaFullPath`];
      const column_values2 = [
        "Village of the Damned (1995)",
        `C:\\Movies\\Village.of.the.Damned.(1995).mkv`,
      ];
      const mid2 = await moviesDataSource.addMovie(
        undefined,
        undefined,
        column_names2,
        column_values2
      );
      expect(mid2).toBe(`MOVIE_${column_values2[1]}`);

      // //========================================================================================================
      const result = await moviesDataSource.getMovies(
        undefined,
        undefined,
        undefined,
        1,
        undefined,
        undefined,
        undefined,
        1
      );
      expect(result.rows.length).toBe(1);

      expect(result.rows[0][convertReportedColumnName("_id")]).toBe(mid2);
      expect(result.rows[0][convertReportedColumnName(`title`)]).toBe(
        column_values2[0]
      );
      expect(result.rows[0][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values2[1]
      );

      if (dBConsts.USE_FOLDER_COLUMN_IN_MOVIES) {
        expect(result.rows[0][convertReportedColumnName(`folder`)]).toBe(
          `Movies`
        );
      }
    });

    test(`checking adding movie with a nonexisting group`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      const column_names = [`title`, `mediaFullPath`];
      const column_values = [
        "The Thing (1982)",
        "C:\\Movies\\The.Thing.(1982).mkv",
      ];
      await expect(
        moviesDataSource.addMovie(1, undefined, column_names, column_values)
      ).rejects.toThrowError("Missing group: 1");
    });

    test(`checking adding movie with a group & getting movies from given group`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      //========================================================================================================
      const column_names = ["name"];
      const column_values = ["Cinema (Horror)"];
      const gid = await moviesDataSource.addMovieGroup(
        undefined,
        undefined,
        column_names,
        column_values
      );
      expect(gid).toBeGreaterThanOrEqual(1);

      // ## check 'PlayListInfo' table content ##
      const result = await moviesDataSource.getMovieGroups(
        undefined,
        undefined,
        [
          "type",
          "place",
          "description",
          "visible",
          "addDate",
          "mediaDate",
          "modifyDate",
          "custom",
        ]
      );

      expect(result.total_count).toBe(1);
      expect(result.rows[0][convertReportedColumnName("type")]).toBe(0);
      expect(result.rows[0][convertReportedColumnName("name")]).toBe(
        column_values[0]
      );
      expect(result.rows[0][convertReportedColumnName("place")]).toBe("");
      expect(result.rows[0][convertReportedColumnName("description")]).toBe("");
      expect(result.rows[0][convertReportedColumnName("visible")]).toBe(1);
      const timestamp_regexpr = /\d\d-\d\d-\d\d \d\d:\d\d:\d\d.\d\d\d/;
      expect(result.rows[0][convertReportedColumnName("addDate")]).toMatch(
        timestamp_regexpr
      );
      expect(result.rows[0][convertReportedColumnName("mediaDate")]).toMatch(
        timestamp_regexpr
      );
      expect(result.rows[0][convertReportedColumnName("modifyDate")]).toMatch(
        timestamp_regexpr
      );
      expect(result.rows[0][convertReportedColumnName("custom")]).toBeNull();

      //---
      const folders2 = [`Thing, The (1982)`];

      const column_names2 = [`title`, `mediaFullPath`];
      const column_values2 = [
        `The Thing (1982)`,
        `C:\\Movies\\${folders2[0]}\\The.Thing.(1982).mkv`,
      ];
      const mid = await moviesDataSource.addMovie(
        gid,
        undefined,
        column_names2,
        column_values2
      );
      expect(mid).toBe(`MOVIE_${column_values2[1]}`);

      // ## check 'MediaInfo' table content ##
      const result2 = await moviesDataSource.getMovies(undefined, undefined, [
        "modifyDate",
        "thumbnailResolutionY",
        "orientation",
        "releaseDate",
        "visible",
        "mediaSize",
        "isMovieFolder",
        "stereoType",
        "OnlineInfoVisible",
        "mediaType",
        "resolutionX",
        "resolutionY",
        "playDate",
        "playDate",
        "infoFilePath",
        "description",
        "aspectRatioY",
        "aspectRatioX",
        "mediaRating",
        "studio",
        "genre",
        "playCount",
        "mediaResume",
        "addDate",
        "length",
        "protected",
        "mediaDuration",
        "thumbnailResolutionX",
      ]);

      expect(result2.total_count).toBe(1);
      expect(result2.rows[0][convertReportedColumnName("modifyDate")]).toMatch(
        timestamp_regexpr
      );
      expect(
        result2.rows[0][convertReportedColumnName("thumbnailResolutionY")]
      ).toBeNull();
      expect(
        result2.rows[0][convertReportedColumnName("orientation")]
      ).toBeNull();
      expect(
        result2.rows[0][convertReportedColumnName("releaseDate")]
      ).toBeNull();
      expect(result2.rows[0][convertReportedColumnName("visible")]).toBe(1);
      expect(result2.rows[0][convertReportedColumnName("mediaSize")]).toBe(0);
      expect(result2.rows[0][convertReportedColumnName("isMovieFolder")]).toBe(
        0
      );
      expect(
        result2.rows[0][convertReportedColumnName("stereoType")]
      ).toBeNull();
      expect(result2.rows[0][convertReportedColumnName("title")]).toBe(
        column_values2[0]
      );
      expect(
        result2.rows[0][convertReportedColumnName("OnlineInfoVisible")]
      ).toBe(1);
      expect(result2.rows[0][convertReportedColumnName("mediaType")]).toBe(1);
      expect(
        result2.rows[0][convertReportedColumnName("resolutionX")]
      ).toBeNull();
      expect(
        result2.rows[0][convertReportedColumnName("resolutionY")]
      ).toBeNull();
      expect(result2.rows[0][convertReportedColumnName("playDate")]).toMatch(
        timestamp_regexpr
      );
      expect(
        result2.rows[0][convertReportedColumnName("infoFilePath")]
      ).toBeNull();
      expect(
        result2.rows[0][convertReportedColumnName("description")]
      ).toBeNull();
      expect(
        result2.rows[0][convertReportedColumnName("aspectRatioY")]
      ).toBeNull();
      expect(
        result2.rows[0][convertReportedColumnName("aspectRatioX")]
      ).toBeNull();
      expect(
        result2.rows[0][convertReportedColumnName("mediaRating")]
      ).toBeNull();
      expect(result2.rows[0][convertReportedColumnName("studio")]).toBeNull();
      expect(result2.rows[0][convertReportedColumnName("genre")]).toBeNull();
      expect(result2.rows[0][convertReportedColumnName("playCount")]).toBe(0);
      expect(result2.rows[0][convertReportedColumnName("mediaResume")]).toBe(0);
      expect(result2.rows[0][convertReportedColumnName("addDate")]).toMatch(
        timestamp_regexpr
      );
      expect(result2.rows[0][convertReportedColumnName("mediaFullPath")]).toBe(
        column_values2[1]
      );
      expect(result2.rows[0][convertReportedColumnName("length")]).toBeNull();
      expect(result2.rows[0][convertReportedColumnName("protected")]).toBe(0);
      expect(
        result2.rows[0][convertReportedColumnName("mediaDuration")]
      ).toBeNull();
      expect(result2.rows[0][convertReportedColumnName("_id")]).toBe(mid);
      expect(
        result2.rows[0][convertReportedColumnName("thumbnailResolutionX")]
      ).toBeNull();

      // ## check 'PlayItemInfo' table content ##
      const result3 = await moviesDataSource.getMovies(gid, undefined, [
        "type",
        "playlistID",
        "mediaTitle",
        "mediaID",
      ]);
      expect(result3.total_count).toBe(1);
      expect(result3.rows[0][convertReportedColumnName("type")]).toBe(1);
      expect(result3.rows[0][convertReportedColumnName("playlistID")]).toBe(
        gid
      );
      expect(result3.rows[0][convertReportedColumnName("mediaTitle")]).toBe(
        column_values2[0]
      );
      expect(result3.rows[0][convertReportedColumnName("mediaID")]).toBe(
        `Computer_${column_values2[1]}`
      );
      expect(result3.rows[0][convertReportedColumnName("listOrder")]).toBe(1);

      // //========================================================================================================
      expect(result3.rows[0][convertReportedColumnName("_id")]).toBe(mid);
      expect(result3.rows[0][convertReportedColumnName(`title`)]).toBe(
        column_values2[0]
      );
      expect(result3.rows[0][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values2[1]
      );

      if (dBConsts.USE_FOLDER_COLUMN_IN_MOVIES) {
        expect(result3.rows[0][convertReportedColumnName(`folder`)]).toBe(
          folders2[0]
        );
      }

      //========================================================================================================
      const column_names3 = ["name"];
      const column_values3 = ["Cinema (Comedy)"];
      const gid2 = await moviesDataSource.addMovieGroup(
        undefined,
        undefined,
        column_names3,
        column_values3
      );
      expect(gid2).toBeGreaterThanOrEqual(1);

      //========================================================================================================
      const folders3 = [`Maverick (1994)`];

      const column_names4 = [`title`, `mediaFullPath`];
      const column_values4 = [
        `Maverick (1994)`,
        `C:\\Movies\\${folders3[0]}\\Maverick.(1994).mvk`,
      ];
      const mid2 = await moviesDataSource.addMovie(
        gid2,
        undefined,
        column_names4,
        column_values4
      );
      expect(mid2).toBe(`MOVIE_${column_values4[1]}`);

      //========================================================================================================
      const result4 = await moviesDataSource.getMovies(gid2, undefined);

      expect(result4.rows[0][convertReportedColumnName("_id")]).toBe(mid2);
      expect(result4.rows[0][convertReportedColumnName(`title`)]).toBe(
        column_values4[0]
      );
      expect(result4.rows[0][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values4[1]
      );

      if (dBConsts.USE_FOLDER_COLUMN_IN_MOVIES) {
        expect(result4.rows[0][convertReportedColumnName(`folder`)]).toBe(
          folders3[0]
        );
      }
    });

    test(`checking getting movies from given group when no rows`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      const result = await moviesDataSource.getMovies(1, undefined);
      expect(result.total_count).toBe(0);
    });

    test(`checking getting movies from given group with paging`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      // //========================================================================================================
      const column_names = ["name"];
      const column_values = ["Cinema (Horror)"];
      const gid = await moviesDataSource.addMovieGroup(
        undefined,
        undefined,
        column_names,
        column_values
      );
      expect(gid).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const column_names2 = [`title`, `mediaFullPath`];
      const column_values2 = [
        "The Fog (1980)",
        "C:\\Movies\\The.Fog.(1980).mkv",
      ];
      const mid = await moviesDataSource.addMovie(
        gid,
        undefined,
        column_names2,
        column_values2
      );
      expect(mid).toBe(`MOVIE_${column_values2[1]}`);

      // //========================================================================================================
      const column_names3 = ["name"];
      const column_values3 = ["Cinema (Comedy))"];
      const gid2 = await moviesDataSource.addMovieGroup(
        undefined,
        undefined,
        column_names3,
        column_values3
      );
      expect(gid2).toBeGreaterThanOrEqual(1);

      //========================================================================================================
      const column_names4 = [`title`, `mediaFullPath`];
      const column_values4 = ["Shrek (2001)", "C:\\Movies\\Shrek.(2001).mvk"];
      const mid2 = await moviesDataSource.addMovie(
        gid2,
        undefined,
        column_names4,
        column_values4
      );
      expect(mid2).toBe(`MOVIE_${column_values4[1]}`);

      //========================================================================================================
      const folders = [`Lethal Weapon 3 (1992)`];

      const column_names5 = [`title`, `mediaFullPath`];
      const column_values5 = [
        `Lethal Weapon 3 (1992)`,
        `C:\\Movies\\${folders[0]}\\Lethal.Weapon.3.(1992).mvk`,
      ];
      const mid3 = await moviesDataSource.addMovie(
        gid2,
        undefined,
        column_names5,
        column_values5
      );
      expect(mid3).toBe(`MOVIE_${column_values5[1]}`);

      //========================================================================================================
      const folders2 = [`Lethal Weapon 3 (1992)`];

      const column_names6 = [`title`, `mediaFullPath`];
      const column_values6 = [
        `Lethal Weapon 4 (1998)`,
        `C:\\Movies\\${folders2[0]}\\Lethal.Weapon.4.(1998).mvk`,
      ];
      const mid4 = await moviesDataSource.addMovie(
        gid2,
        undefined,
        column_names6,
        column_values6
      );
      expect(mid4).toBe(`MOVIE_${column_values6[1]}`);

      //========================================================================================================
      const result = await moviesDataSource.getMovies(
        gid2,
        undefined,
        undefined,
        2,
        undefined,
        undefined,
        undefined,
        1
      );
      expect(result.rows.length).toBe(2);

      expect(result.rows[0][convertReportedColumnName("_id")]).toBe(mid3);
      expect(result.rows[0][convertReportedColumnName(`title`)]).toBe(
        column_values5[0]
      );
      expect(result.rows[0][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values5[1]
      );
      expect(result.rows[0][convertReportedColumnName(`listOrder`)]).toBe(2);
      //==
      expect(result.rows[1][convertReportedColumnName("_id")]).toBe(mid4);
      expect(result.rows[1][convertReportedColumnName(`title`)]).toBe(
        column_values6[0]
      );
      expect(result.rows[1][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values6[1]
      );
      expect(result.rows[1][convertReportedColumnName(`listOrder`)]).toBe(3);

      if (dBConsts.USE_FOLDER_COLUMN_IN_MOVIES) {
        expect(result.rows[0][convertReportedColumnName(`folder`)]).toBe(
          folders[0]
        );
        expect(result.rows[1][convertReportedColumnName(`folder`)]).toBe(
          folders2[0]
        );
      }
    });

    test(`checking marking/unmarking movie a member of group`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      //========================================================================================================
      const column_names = ["name"];
      const column_values = ["Cinema (Horror)"];
      const gid = await moviesDataSource.addMovieGroup(
        undefined,
        undefined,
        column_names,
        column_values
      );
      expect(gid).toBeGreaterThanOrEqual(1);

      // //========================================================================================================
      const column_names2 = [`title`, `mediaFullPath`];
      const column_values2 = [
        "Poltergeist (1982)",
        "C:\\Movies\\Poltergeist.(1982).mkv",
      ];
      const mid = await moviesDataSource.addMovie(
        gid,
        undefined,
        column_names2,
        column_values2
      );
      expect(mid).toBe(`MOVIE_${column_values2[1]}`);

      //========================================================================================================
      await expect(
        moviesDataSource.markMovieGroupMember(mid, gid)
      ).resolves.toBeUndefined();

      // ## check 'PlayItemInfo' table content ##
      const result = await moviesDataSource.getMovies(gid, undefined, [
        "type",
        "playlistID",
        "mediaTitle",
        "mediaID",
      ]);
      expect(result.total_count).toBe(1);
      expect(result.rows[0][convertReportedColumnName("type")]).toBe(1);
      expect(result.rows[0][convertReportedColumnName("playlistID")]).toBe(gid);
      expect(result.rows[0][convertReportedColumnName("mediaTitle")]).toBe(
        column_values2[0]
      );
      expect(result.rows[0][convertReportedColumnName("mediaID")]).toBe(
        `Computer_${column_values2[1]}`
      );
      expect(result.rows[0][convertReportedColumnName("listOrder")]).toBe(1);

      //========================================================================================================
      await expect(
        moviesDataSource.unmarkMovieGroupMember(gid, mid)
      ).resolves.toBeUndefined();

      // ## check 'PlayItemInfo' table content ##
      const result2 = await moviesDataSource.getMovies(gid, undefined, [
        "type",
        "playlistID",
        "mediaTitle",
        "mediaID",
      ]);
      expect(result2.total_count).toBe(0);
    });

    test(`checking getting groups of a movie when no rows`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      //========================================================================================================
      // const result = await moviesDataSource.getGroupsOfMovie("MOVIE_Movie1");
      // expect(result.total_count).toBe(0);
    });

    test(`checking getting groups of a movie with and without paging`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      //========================================================================================================
      const column_names = ["name", "description"];
      const column_values = ["Genres", "Movie Genres"];
      const tid = await moviesDataSource.addMovieGroupType(
        column_names,
        column_values
      );
      expect(tid).toBeGreaterThanOrEqual(1);

      //========================================================================================================
      const column_names2 = ["name"];
      const column_values2 = ["Cinema (Horror)"];
      const gid = await moviesDataSource.addMovieGroup(
        tid,
        undefined,
        column_names2,
        column_values2
      );
      expect(gid).toBeGreaterThanOrEqual(1);

      //========================================================================================================
      const column_names3 = ["name"];
      const column_values3 = ["Cinema (Action)"];
      const gid2 = await moviesDataSource.addMovieGroup(
        tid,
        undefined,
        column_names3,
        column_values3
      );
      expect(gid2).toBeGreaterThanOrEqual(1);

      //========================================================================================================
      const column_names4 = ["title", "mediaFullPath"];
      const column_values4 = [
        "The Skeleton Key (2005)",
        "C:\\Movies\\The.Skeleton.Key.(2005).mkv",
      ];
      const mid = await moviesDataSource.addMovie(
        gid,
        undefined,
        column_names4,
        column_values4
      );
      expect(mid).not.toBeUndefined();

      //========================================================================================================
      const column_names5 = ["title", "mediaFullPath"];
      const column_values5 = [
        "Christine (1983)",
        "C:\\Movies\\Christine.(1983).mkv",
      ];
      const mid2 = await moviesDataSource.addMovie(
        gid,
        undefined,
        column_names5,
        column_values5
      );
      expect(mid2).not.toBeUndefined();

      //========================================================================================================
      const column_names6 = ["title", "mediaFullPath"];
      const column_values6 = [
        "Starship Troopers (1997)",
        "C:\\Movies\\Starship.Troopers.(1997).mkv",
      ];
      const mid3 = await moviesDataSource.addMovie(
        gid2,
        undefined,
        column_names6,
        column_values6
      );
      expect(mid3).not.toBeUndefined();

      //========================================================================================================
      const result = await moviesDataSource.getGroupsOfMovie(mid);
      expect(result.total_count).toBe(1);
      expect(result.rows[0][convertReportedColumnName("_id")]).toBe(gid);
      expect(result.rows[0][convertReportedColumnName("name")]).toBe(
        column_values2[0]
      );

      //========================================================================================================
      const result2 = await moviesDataSource.getGroupsOfMovie(mid);
      expect(result2.total_count).toBe(1);
      expect(result2.rows[0][convertReportedColumnName("_id")]).toBe(gid);
      expect(result2.rows[0][convertReportedColumnName("name")]).toBe(
        column_values2[0]
      );

      //========================================================================================================
      await expect(
        moviesDataSource.markMovieGroupMember(mid, gid2)
      ).resolves.toBeUndefined();

      //========================================================================================================
      const result3 = await moviesDataSource.getGroupsOfMovie(mid);
      expect(result3.total_count).toBe(2);
      expect(result3.rows[0][convertReportedColumnName("_id")]).toBe(gid2);
      expect(result3.rows[0][convertReportedColumnName("name")]).toBe(
        column_values3[0]
      );
      //==
      expect(result3.rows[1][convertReportedColumnName("_id")]).toBe(gid);
      expect(result3.rows[1][convertReportedColumnName("name")]).toBe(
        column_values2[0]
      );
    });

    test(`checking adding a new group with given movie`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      //========================================================================================================
      const column_names = ["title", "mediaFullPath"];
      const column_values = [
        "Dirty Harry (1971)",
        "C:\\Movies\\Dirty.Harry.(1971).mkv",
      ];
      const mid = await moviesDataSource.addMovie(
        undefined,
        undefined,
        column_names,
        column_values
      );
      expect(mid).not.toBeUndefined();

      //========================================================================================================
      const column_names2 = ["name"];
      const column_values2 = ["Cinema (Horror)"];
      const gid = await moviesDataSource.addMovieGroup(
        undefined,
        mid,
        column_names2,
        column_values2
      );
      expect(gid).toBeGreaterThanOrEqual(1);

      // ## check 'PlayItemInfo' table content ##
      const result = await moviesDataSource.getMovies(gid, undefined, [
        "type",
        "playlistID",
        "mediaTitle",
        "mediaID",
      ]);
      expect(result.total_count).toBe(1);
      expect(result.rows[0][convertReportedColumnName("type")]).toBe(1);
      expect(result.rows[0][convertReportedColumnName("playlistID")]).toBe(gid);
      expect(result.rows[0][convertReportedColumnName("mediaTitle")]).toBe(
        column_values[0]
      );
      expect(result.rows[0][convertReportedColumnName("mediaID")]).toBe(
        `Computer_${column_values[1]}`
      );
      expect(result.rows[0][convertReportedColumnName("listOrder")]).toBe(1);
    });

    test(`checking marking/unmarking movie a member of group`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      //========================================================================================================
      const column_names = ["name"];
      const column_values = ["Cinema (Horror)"];
      const gid = await moviesDataSource.addMovieGroup(
        undefined,
        undefined,
        column_names,
        column_values
      );
      expect(gid).toBeGreaterThanOrEqual(1);

      //========================================================================================================
      const column_names2 = ["title", "mediaFullPath"];
      const column_values2 = [
        "Apollo 13 (1995)",
        "C:\\Movies\\Apollo 13 (1995).mkv",
      ];
      const mid = await moviesDataSource.addMovie(
        undefined,
        undefined,
        column_names2,
        column_values2
      );
      expect(mid).not.toBeUndefined();

      //========================================================================================================
      await expect(
        moviesDataSource.markMovieGroupMember(mid, gid)
      ).resolves.toBeUndefined();

      // ## check 'moviesDataSource' table content ##
      const result = await moviesDataSource.getMovies(gid, undefined, [
        "type",
        "playlistID",
        "mediaTitle",
        "mediaID",
      ]);
      expect(result.total_count).toBe(1);
      expect(result.rows[0][convertReportedColumnName("type")]).toBe(1);
      expect(result.rows[0][convertReportedColumnName("playlistID")]).toBe(gid);
      expect(result.rows[0][convertReportedColumnName("mediaTitle")]).toBe(
        column_values2[0]
      );
      expect(result.rows[0][convertReportedColumnName("mediaID")]).toBe(
        `Computer_${column_values2[1]}`
      );
      expect(result.rows[0][convertReportedColumnName("listOrder")]).toBe(1);

      //========================================================================================================
      await expect(
        moviesDataSource.unmarkMovieGroupMember(gid, mid)
      ).resolves.toBeUndefined();

      // ## check 'moviesDataSource' table content ##
      const result2 = await moviesDataSource.getMovies(gid, undefined, [
        "type",
        "playlistID",
        "mediaTitle",
        "mediaID",
      ]);
      expect(result2.total_count).toBe(0);
    });

    test(`checking adding movie with a group and 'listOrder' parameter in template`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      //========================================================================================================
      const column_names = ["name"];
      const column_values = ["Cinema (Horror)"];
      const gid = await moviesDataSource.addMovieGroup(
        undefined,
        undefined,
        column_names,
        column_values
      );
      expect(gid).toBeGreaterThanOrEqual(1);

      //========================================================================================================
      const folders = [`Ultraviolet (2006)`];
      const column_names2 = ["title", "mediaFullPath"];
      const column_values2 = [
        `Ultraviolet (2006)`,
        `C:\\Movies\\${folders[0]}\\Ultraviolet.(2006).mkv`,
      ];
      const mid = await moviesDataSource.addMovie(
        gid,
        0,
        column_names2,
        column_values2
      );
      expect(mid).not.toBeUndefined();

      //========================================================================================================
      const result = await moviesDataSource.getMovies(gid, undefined);

      expect(result.rows.length).toBe(1);

      expect(result.rows[0][convertReportedColumnName("_id")]).toBe(mid);
      expect(result.rows[0][convertReportedColumnName(`title`)]).toBe(
        column_values2[0]
      );
      expect(result.rows[0][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values2[1]
      );
      expect(result.rows[0][convertReportedColumnName(`listOrder`)]).toBe(1);
      //==

      if (dBConsts.USE_FOLDER_COLUMN_IN_MOVIES) {
        expect(result.rows[0][convertReportedColumnName(`folder`)]).toBe(
          folders[0]
        );
      }

      //========================================================================================================
      const folders2 = [`Carrie (1976)`];
      const column_names3 = ["title", "mediaFullPath"];
      const column_values3 = [
        `Carrie (1976)`,
        `C:\\Movies\\${folders2[0]}\\Carrie.(1976).mkv`,
      ];
      const mid2 = await moviesDataSource.addMovie(
        gid,
        10,
        column_names3,
        column_values3
      );
      expect(mid2).not.toBeUndefined();

      //========================================================================================================
      const result2 = await moviesDataSource.getMovies(gid, undefined);

      expect(result2.rows.length).toBe(2);

      expect(result2.rows[0][convertReportedColumnName("_id")]).toBe(mid);
      expect(result2.rows[0][convertReportedColumnName(`title`)]).toBe(
        column_values2[0]
      );
      expect(result2.rows[0][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values2[1]
      );
      expect(result2.rows[0][convertReportedColumnName(`listOrder`)]).toBe(1);
      //==
      expect(result2.rows[1][convertReportedColumnName("_id")]).toBe(mid2);
      expect(result2.rows[1][convertReportedColumnName(`title`)]).toBe(
        column_values3[0]
      );
      expect(result2.rows[1][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values3[1]
      );
      expect(result2.rows[1][convertReportedColumnName(`listOrder`)]).toBe(2);

      if (dBConsts.USE_FOLDER_COLUMN_IN_MOVIES) {
        expect(result2.rows[0][convertReportedColumnName(`folder`)]).toBe(
          folders[0]
        );
        //==
        expect(result2.rows[1][convertReportedColumnName(`folder`)]).toBe(
          folders2[0]
        );
      }

      //========================================================================================================
      const column_names4 = ["name"];
      const column_values4 = ["Cinema (Comedy)"];
      const gid2 = await moviesDataSource.addMovieGroup(
        undefined,
        undefined,
        column_names4,
        column_values4
      );
      expect(gid2).toBeGreaterThanOrEqual(1);

      //========================================================================================================
      const folders3 = [`Red Planet (2000)`];
      const column_names5 = ["title", "mediaFullPath"];
      const column_values5 = [
        `Red Planet (2000)`,
        `C:\\Movies\\${folders3[0]}\\Red.Planet.(2000).mvk`,
      ];
      const mid3 = await moviesDataSource.addMovie(
        gid2,
        100,
        column_names5,
        column_values5
      );
      expect(mid3).not.toBeUndefined();

      //========================================================================================================
      const result3 = await moviesDataSource.getMovies(gid2, undefined);

      expect(result3.rows.length).toBe(1);

      expect(result3.rows[0][convertReportedColumnName("_id")]).toBe(mid3);
      expect(result3.rows[0][convertReportedColumnName(`title`)]).toBe(
        column_values5[0]
      );
      expect(result3.rows[0][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values5[1]
      );
      expect(result3.rows[0][convertReportedColumnName(`listOrder`)]).toBe(1);

      if (dBConsts.USE_FOLDER_COLUMN_IN_MOVIES) {
        expect(result3.rows[0][convertReportedColumnName(`folder`)]).toBe(
          folders3[0]
        );
      }

      //========================================================================================================
      const folders4 = [`Fifth Element, The (1997)`];
      const column_names6 = ["title", "mediaFullPath"];
      const column_values6 = [
        `Red Planet (2000)`,
        `C:\\Movies\\${folders4[0]}\\The.Fifth.Element.(1997).mvk`,
      ];
      const mid4 = await moviesDataSource.addMovie(
        gid2,
        1,
        column_names6,
        column_values6
      );
      expect(mid4).not.toBeUndefined();

      //========================================================================================================
      const result4 = await moviesDataSource.getMovies(gid2, undefined);

      expect(result4.rows.length).toBe(2);

      expect(result4.rows[0][convertReportedColumnName("_id")]).toBe(mid4);
      expect(result4.rows[0][convertReportedColumnName(`title`)]).toBe(
        column_values6[0]
      );
      expect(result4.rows[0][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values6[1]
      );
      expect(result4.rows[0][convertReportedColumnName(`listOrder`)]).toBe(1);
      //==
      expect(result4.rows[1][convertReportedColumnName("_id")]).toBe(mid3);
      expect(result4.rows[1][convertReportedColumnName(`title`)]).toBe(
        column_values5[0]
      );
      expect(result4.rows[1][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values5[1]
      );
      expect(result4.rows[1][convertReportedColumnName(`listOrder`)]).toBe(2);

      if (dBConsts.USE_FOLDER_COLUMN_IN_MOVIES) {
        expect(result4.rows[0][convertReportedColumnName(`folder`)]).toBe(
          folders4[0]
        );
        //==
        expect(result4.rows[1][convertReportedColumnName(`folder`)]).toBe(
          folders3[0]
        );
      }

      //========================================================================================================
      const folders5 = [`AEon Flux (2005)`];
      const column_names7 = ["title", "mediaFullPath"];
      const column_values7 = [
        `Æon Flux (2005)`,
        `C:\\Movies\\${folders5[0]}\\AEon Flux (2005).mvk`,
      ];
      const mid5 = await moviesDataSource.addMovie(
        gid2,
        10,
        column_names7,
        column_values7
      );
      expect(mid5).not.toBeUndefined();

      //========================================================================================================
      const result5 = await moviesDataSource.getMovies(gid2, undefined);

      expect(result5.rows.length).toBe(3);

      expect(result5.rows[0][convertReportedColumnName("_id")]).toBe(mid4);
      expect(result5.rows[0][convertReportedColumnName(`title`)]).toBe(
        column_values6[0]
      );
      expect(result5.rows[0][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values6[1]
      );
      expect(result5.rows[0][convertReportedColumnName(`listOrder`)]).toBe(1);
      //==
      expect(result5.rows[1][convertReportedColumnName("_id")]).toBe(mid3);
      expect(result5.rows[1][convertReportedColumnName(`title`)]).toBe(
        column_values5[0]
      );
      expect(result5.rows[1][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values5[1]
      );
      expect(result5.rows[1][convertReportedColumnName(`listOrder`)]).toBe(2);
      //==
      expect(result5.rows[2][convertReportedColumnName("_id")]).toBe(mid5);
      expect(result5.rows[2][convertReportedColumnName(`title`)]).toBe(
        column_values7[0]
      );
      expect(result5.rows[2][convertReportedColumnName(`mediaFullPath`)]).toBe(
        column_values7[1]
      );
      expect(result5.rows[2][convertReportedColumnName(`listOrder`)]).toBe(3);

      if (dBConsts.USE_FOLDER_COLUMN_IN_MOVIES) {
        expect(result5.rows[0][convertReportedColumnName(`folder`)]).toBe(
          folders4[0]
        );
        //==
        expect(result5.rows[1][convertReportedColumnName(`folder`)]).toBe(
          folders3[0]
        );
        //==
        expect(result5.rows[2][convertReportedColumnName(`folder`)]).toBe(
          folders5[0]
        );
      }
    });

    test(`checking marking with 'listOrder' parameter in template and unmarking as a member of group`, async () => {
      await moviesDataSource.init();
      expect(moviesDataSource.ready).toBeTruthy();

      //========================================================================================================
      const column_names = ["name"];
      const column_values = ["Cinema (Horror)"];
      const gid = await moviesDataSource.addMovieGroup(
        undefined,
        undefined,
        column_names,
        column_values
      );
      expect(gid).toBeGreaterThanOrEqual(1);

      //========================================================================================================
      const column_names2 = ["title", "mediaFullPath"];
      const column_values2 = [
        "The Good, the Bad and the Ugly (1966)",
        "C:\\Movies\\The.Good.th.Bad.and.the.Ugly.(1966).mkv",
      ];
      const mid = await moviesDataSource.addMovie(
        undefined,
        undefined,
        column_names2,
        column_values2
      );
      expect(mid).not.toBeUndefined();

      //========================================================================================================
      const column_names3 = ["title", "mediaFullPath"];
      const column_values3 = [
        "Snake Eyes (1998)",
        "C:\\Movies\\Snake.Eyes.(1998).mkv",
      ];
      const mid2 = await moviesDataSource.addMovie(
        undefined,
        undefined,
        column_names3,
        column_values3
      );
      expect(mid2).not.toBeUndefined();

      //========================================================================================================
      const column_names4 = ["title", "mediaFullPath"];
      const column_values4 = [
        "Quiz Show (1994)",
        "C:\\Movies\\Quiz.Show.(1994).mkv",
      ];
      const mid3 = await moviesDataSource.addMovie(
        undefined,
        undefined,
        column_names4,
        column_values4
      );
      expect(mid3).not.toBeUndefined();

      //========================================================================================================
      await expect(
        moviesDataSource.markMovieGroupMember(mid, gid, 10)
      ).resolves.toBeUndefined();

      // ## check 'PlayItemInfo' table content ##
      const result = await moviesDataSource.getMovies(gid, undefined, [
        "type",
        "playlistID",
        "mediaTitle",
        "mediaID",
      ]);
      expect(result.total_count).toBe(1);
      expect(result.rows[0][convertReportedColumnName("type")]).toBe(1);
      expect(result.rows[0][convertReportedColumnName("playlistID")]).toBe(gid);
      expect(result.rows[0][convertReportedColumnName("mediaTitle")]).toBe(
        column_values2[0]
      );
      expect(result.rows[0][convertReportedColumnName("mediaID")]).toBe(
        `Computer_${column_values2[1]}`
      );
      expect(result.rows[0][convertReportedColumnName("listOrder")]).toBe(1);

      //========================================================================================================
      await expect(
        moviesDataSource.markMovieGroupMember(mid2, gid, 0)
      ).resolves.toBeUndefined();

      // ## check 'PlayItemInfo' table content ##
      const result2 = await moviesDataSource.getMovies(gid, undefined, [
        "type",
        "playlistID",
        "mediaTitle",
        "mediaID",
      ]);
      expect(result2.total_count).toBe(2);
      expect(result2.rows[0][convertReportedColumnName("type")]).toBe(1);
      expect(result2.rows[0][convertReportedColumnName("playlistID")]).toBe(
        gid
      );
      expect(result2.rows[0][convertReportedColumnName("mediaTitle")]).toBe(
        column_values3[0]
      );
      expect(result2.rows[0][convertReportedColumnName("mediaID")]).toBe(
        `Computer_${column_values3[1]}`
      );
      expect(result2.rows[0][convertReportedColumnName("listOrder")]).toBe(1);
      //==
      expect(result2.rows[1][convertReportedColumnName("type")]).toBe(1);
      expect(result2.rows[1][convertReportedColumnName("playlistID")]).toBe(
        gid
      );
      expect(result2.rows[1][convertReportedColumnName("mediaTitle")]).toBe(
        column_values2[0]
      );
      expect(result2.rows[1][convertReportedColumnName("mediaID")]).toBe(
        `Computer_${column_values2[1]}`
      );
      expect(result2.rows[1][convertReportedColumnName("listOrder")]).toBe(2);

      //========================================================================================================
      await expect(
        moviesDataSource.markMovieGroupMember(mid3, gid)
      ).resolves.toBeUndefined();

      // ## check 'PlayItemInfo' table content ##
      const result3 = await moviesDataSource.getMovies(gid, undefined, [
        "type",
        "playlistID",
        "mediaTitle",
        "mediaID",
      ]);
      expect(result3.total_count).toBe(3);
      expect(result3.rows[0][convertReportedColumnName("type")]).toBe(1);
      expect(result3.rows[0][convertReportedColumnName("playlistID")]).toBe(
        gid
      );
      expect(result3.rows[0][convertReportedColumnName("mediaTitle")]).toBe(
        column_values3[0]
      );
      expect(result3.rows[0][convertReportedColumnName("mediaID")]).toBe(
        `Computer_${column_values3[1]}`
      );
      expect(result3.rows[0][convertReportedColumnName("listOrder")]).toBe(1);
      //==
      expect(result3.rows[1][convertReportedColumnName("type")]).toBe(1);
      expect(result3.rows[1][convertReportedColumnName("playlistID")]).toBe(
        gid
      );
      expect(result3.rows[1][convertReportedColumnName("mediaTitle")]).toBe(
        column_values2[0]
      );
      expect(result3.rows[1][convertReportedColumnName("mediaID")]).toBe(
        `Computer_${column_values2[1]}`
      );
      expect(result3.rows[1][convertReportedColumnName("listOrder")]).toBe(2);
      //==
      expect(result3.rows[2][convertReportedColumnName("type")]).toBe(1);
      expect(result3.rows[2][convertReportedColumnName("playlistID")]).toBe(
        gid
      );
      expect(result3.rows[2][convertReportedColumnName("mediaTitle")]).toBe(
        column_values4[0]
      );
      expect(result3.rows[2][convertReportedColumnName("mediaID")]).toBe(
        `Computer_${column_values4[1]}`
      );
      expect(result3.rows[2][convertReportedColumnName("listOrder")]).toBe(3);

      //========================================================================================================
      await expect(
        moviesDataSource.unmarkMovieGroupMember(gid, mid)
      ).resolves.toBeUndefined();

      // ## check 'PlayItemInfo' table content ##
      const result4 = await moviesDataSource.getMovies(gid, undefined, [
        "type",
        "playlistID",
        "mediaTitle",
        "mediaID",
      ]);
      expect(result4.total_count).toBe(2);
      expect(result4.rows[0][convertReportedColumnName("type")]).toBe(1);
      expect(result4.rows[0][convertReportedColumnName("playlistID")]).toBe(
        gid
      );
      expect(result4.rows[0][convertReportedColumnName("mediaTitle")]).toBe(
        column_values3[0]
      );
      expect(result4.rows[0][convertReportedColumnName("mediaID")]).toBe(
        `Computer_${column_values3[1]}`
      );
      expect(result4.rows[0][convertReportedColumnName("listOrder")]).toBe(1);
      //==
      expect(result4.rows[1][convertReportedColumnName("type")]).toBe(1);
      expect(result4.rows[1][convertReportedColumnName("playlistID")]).toBe(
        gid
      );
      expect(result4.rows[1][convertReportedColumnName("mediaTitle")]).toBe(
        column_values4[0]
      );
      expect(result4.rows[1][convertReportedColumnName("mediaID")]).toBe(
        `Computer_${column_values4[1]}`
      );
      expect(result4.rows[1][convertReportedColumnName("listOrder")]).toBe(2);
    });

    test(`checking getting movie icon when given database entry doesn't exist`, async () => {
      // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
      // //========================================================================================================
      // // RESTful API request (getting)
      // const res = await request(app).get(apipath.buildPathMovieIcon(true, ["MOVIE_SomeNonExistingMovie"])).set('Accept', 'image/*');
      // //expect(getContentTypeFromHeader(res1)).toBe('image/png');
      // expect(res.status).toBe(404);
    });

    describe(`checking getting movie icon when given database entry exists`, () => {
      // add an entry to the database
      // const folders = [`Perfect Storm (2000), The `];
      // const folder = `C:\\Movies\\${folders[0]}`;
      // const column_names = ['title', 'mediaFullPath'];
      // const column_values = [`The Perfect Storm (2000)`, `${folder}\\The.Perfect.Storm.(2000).mkv`];
      // let mid: string;

      beforeEach(async () => {
        // mid = await dbdata_moviemanager_instance.addMovie(undefined, undefined, column_names, column_values);
      });

      afterEach(() => {
        // vol.reset();
      });

      test(`checking when thumbnail directory doesn't exist`, async () => {
        // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
        // // Setup
        // await fs.promises.mkdir(`${folder}`, { recursive: true });
        // //========================================================================================================
        // // RESTful API request (getting)
        // const res = await request(app).get(apipath.buildPathMovieIcon(true, [mid])).set('Accept', 'image/*');
        // expect(res.status).toBe(404);
      });

      test(`checking when thumbnail directory is empty`, async () => {
        // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
        // // Setup
        // const fpath = `${folder}\\thumbnail`;
        // await fs.promises.mkdir(fpath, { recursive: true });
        // //========================================================================================================
        // // RESTful API request (getting)
        // const res1 = await request(app).get(apipath.buildPathMovieIcon(true, [mid])).set('Accept', 'image/*');
        // expect(res1.status).toBe(404);
      });

      test(`checking when thumbnail directory has one entry but it isn't image/*`, async () => {
        // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
        // const fpath = `${folder}\\thumbnail`;
        // vol.fromJSON({ [`${fpath}\\1.txt`]: "12345" });
        // //========================================================================================================
        // // RESTful API request (getting)
        // const res1 = await request(app).get(apipath.buildPathMovieIcon(true, [mid])).set('Accept', 'image/*');
        // //expect(getContentTypeFromHeader(res1)).toBe('text/plain');
        // expect(res1.status).toBe(200);
      });

      test(`checking when thumbnail directory has one entry image/*`, async () => {
        // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
        // const fpath = `${folder}\\thumbnail`;
        // vol.fromJSON({ [`${fpath}\\1.png`]: "12345" });
        // //========================================================================================================
        // // RESTful API request (getting)
        // const res1 = await request(app).get(apipath.buildPathMovieIcon(true, [mid])).set('Accept', 'image/*');
        // expect(getContentTypeFromHeader(res1)).toBe('image/png');
        // expect(res1.status).toBe(200);
      });

      test(`checking when thumbnail directory has one entry image/* but Accept header is text/plain`, async () => {
        // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
        // const fpath = `${folder}\\thumbnail`;
        // vol.fromJSON({ [`${fpath}\\1.png`]: "12345" });
        // //========================================================================================================
        // // RESTful API request (getting)
        // const res1 = await request(app).get(apipath.buildPathMovieIcon(true, [mid])).set('Accept', 'text/plain');
        // expect(res1.status).toBe(406);
      });

      test(`checking when thumbnail directory has more then one entry`, async () => {
        // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
        // const fpath = `${folder}\\thumbnail`;
        // vol.fromJSON({
        //     [`${fpath}\\1.png`]: "12345",
        //     [`${fpath}\\2.png`]: "12345",
        // });
        // //========================================================================================================
        // // RESTful API request (getting)
        // const res1 = await request(app).get(apipath.buildPathMovieIcon(true, [mid])).set('Accept', 'image/*');
        // expect(res1.status).toBe(404);
      });
    });

    test(`checking deleting movie icon when given database entry doesn't exist`, async () => {
      // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
      // //========================================================================================================
      // // RESTful API request (getting)
      // const res = await request(app).delete(apipath.buildPathMovieIcon(true, ["MOVIE_SomeNonExistingMovie"]));
      // expect(res.status).toBe(404);
    });

    describe(`checking deleting movie icon when given database entry exists`, () => {
      // add an entry to the database
      // const folders = [`Perfect Storm (2000), The `];
      // const folder = `C:\\Movies\\${folders[0]}`;
      // const column_names = ['title', 'mediaFullPath'];
      // const column_values = [`The Perfect Storm (2000)`, `${folder}\\The.Perfect.Storm.(2000).mkv`];
      // let mid: string;

      beforeEach(async () => {
        // mid = await dbdata_moviemanager_instance.addMovie(undefined, undefined, column_names, column_values);
      });

      afterEach(() => {
        // vol.reset();
      });

      test(`checking when thumbnail directory doesn't exist`, async () => {
        // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
        // //========================================================================================================
        // // RESTful API request (getting)
        // const res = await request(app).delete(apipath.buildPathMovieIcon(true, [mid]));
        // expect(res.status).toBe(204);
      });

      test(`checking when thumbnail directory is empty`, async () => {
        // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
        // // Setup
        // const fpath = `${folder}\\thumbnail`;
        // await fs.promises.mkdir(fpath, { recursive: true });
        // //========================================================================================================
        // // RESTful API request (getting)
        // const res1 = await request(app).delete(apipath.buildPathMovieIcon(true, [mid]));
        // expect(res1.status).toBe(204);
      });

      test(`checking when thumbnail directory has one entry but it isn't image/*`, async () => {
        // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
        // const fpath = `${folder}\\thumbnail`;
        // vol.fromJSON({ [`${fpath}\\1.txt`]: "12345" });
        // //========================================================================================================
        // // RESTful API request (getting)
        // const res1 = await request(app).delete(apipath.buildPathMovieIcon(true, [mid]));
        // expect(res1.status).toBe(204);
        // await expect(fs.promises.readdir(fpath)).resolves.toHaveLength(0);
      });

      test(`checking when thumbnail directory has one entry image/*`, async () => {
        // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
        // const fpath = `${folder}\\thumbnail`;
        // vol.fromJSON({ [`${fpath}\\1.png`]: "12345" });
        // //========================================================================================================
        // // RESTful API request (getting)
        // const res1 = await request(app).delete(apipath.buildPathMovieIcon(true, [mid]));
        // expect(res1.status).toBe(204);
        // await expect(fs.promises.readdir(fpath)).resolves.toHaveLength(0);
      });

      test(`checking when thumbnail directory has more then one entry`, async () => {
        // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
        // const fpath = `${folder}\\thumbnail`;
        // vol.fromJSON({
        //     [`${fpath}\\1.png`]: "12345",
        //     [`${fpath}\\2.png`]: "12345",
        // });
        // //========================================================================================================
        // // RESTful API request (getting)
        // const res1 = await request(app).delete(apipath.buildPathMovieIcon(true, [mid]));
        // expect(res1.status).toBe(204);
        // await expect(fs.promises.readdir(fpath)).resolves.toHaveLength(0);
      });
    });

    describe("Checking updating movie icon", () => {
      // let buf: Buffer;
      // const attachFieldName = "file";
      // const attatchOptions = { filename: "icon.png", contentType: "image/png" };

      beforeAll(async () => {
        // // 48x48 PNG of a yin-yang symbol
        // const data = 'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAACXBIWXMAAAsTAAALEwEAmpwYAAABWWlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iWE1QIENvcmUgNS40LjAiPgogICA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPgogICAgICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgICAgICAgICB4bWxuczp0aWZmPSJodHRwOi8vbnMuYWRvYmUuY29tL3RpZmYvMS4wLyI+CiAgICAgICAgIDx0aWZmOk9yaWVudGF0aW9uPjE8L3RpZmY6T3JpZW50YXRpb24+CiAgICAgIDwvcmRmOkRlc2NyaXB0aW9uPgogICA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgpMwidZAAAJYklEQVRoBbVaSWhUTRDuJBo1olGjonHfohIXlIheRBAJuN30kEMQclAEFTx4CaIicTtGPCiIgnrwInoRUVExSERR3Fc0rnEPGpeYTMb0/331Xj06M28m8yb5C2q6X/X2VXV1db9+k2Oyo7ylS5f2OnfuXFtC80I8jwaPAheBC8CkFnATuBH8HtwMdqkPHuLgf64wk3xOJpUS6uTjOebIykaNGlW+fv36RZMnT54xfPjw4pEjR5qBAwea/HxWNeb379/m/fv35ubNm6a2tvbD27dvHw4YMODqggULLly8ePGW01di305R97N51lpVmAOt3bdvX31dXZ399esXijpRHE8xcJvPzFNmf/z4YU+dOmXRXri0tLSefSH1tDWGY+SBe4xyDh061NvprWr//v0NsCjxKBFoKzj2z6OOeDxuXYa4A+X/WId137x507Zy5UpRYurUqUwbevfuXeWMwzHVYI44Wjb3ypUrvfwmJRs3bqxraGjA+EJq5TjA2Y4O4ktPrMO6ZBJmLr5mzRq6YxzuJ8rk5eXV4XmqPybHzvXzkZNcjKEWqDxx4oS4AGS0dhxgSMhmR5wdUlNTk507d24H0MXHjRvHoGBzcnK4oCt9xMQQWQm3Qc2dO3cUZasOrILupNrX7du3xfpjx461WNytVMLnGl8JJi4mR5ycdS1fC18lRpqrPYrF1VU0DVPU7W/Hjh0CesqUKUzbwZwF5mvBpIxmIsfx+RoffAwD0WXCMITK1MfdwjAZy3UWOMsAaYcNG2b79evHPBXg+mBeZ4JrQt0a2QRyok2l7zYErr7v4kmZV0VbWlos+yAzT9Iyt7Eqhr3CLlmyRJQYMmSIpIBHJXQmdE24EbGTBhp7S5wF2+4O1lVewXz69MmuXr1aQUieMpLW0b5cpdSNsDEGbYGQ7sRnKlICJilW74m/6FCmhqHS77zV7VwHTJW6dXft2iUA5s2bZ8nsnjIlty5lqtSRI0ek7vjx4yVFNJIU7XVh1xErKHAjXdn5fuWqzZs3L0QFbkh9IJPaUX7gLqa+npurMbC6MPOUsSwdFRR4R6eQcXlW4nogtiowFZOdmwpwOliYjx1264QJE5A12E+SZ4kFXREWoEEkkWoTJ040ZBJlLEtHbW3e2RCTElZNAW1FIcETc57BqZLakdb6xwPZpHS6o6TqCs+ePdOpD1LKSFrH7Vddau/evVJ/9OjRQTvg0rxsdv7zWgIGKXZjeDDzO2XYdPuPlNe2Hz9+tGfOnBFmnqRlboeqUGtrq121apWAHTp0qIJOTDWsej7qKSG/ZTxV+hQpbGojNw0DGiZjG90Hnj59KmC5B/Tv35/HiUTwfNaQynwZkcsiHjNmTPmcOXP4TOurr/E5K+IiBDaDvoSZD1mYUic3VyCYS5cuyVhwH/Pnzx8pCxlc1yuLyoPympqa87QGKFLo9Jpk/6vW5wkXYCwCh+zEzKdhDannqQDVL+SbFB9AuWGW8op69he+z1BnYrGYwR4hnU+aNMl8/fo1dLac0b0pM4aY+QprSi9fvixmRKfeQT17o3bZkmuhvd3b4Jnfs2ePWHvatGmSpvB9d0b+AbM+l1KB8idPnnBgvphkH35CoBOgMt1FXYZVf/78abdt2yZASkpKMgXPem44lXVQ0djYyD5j7gAURCWC5SQyTUW0/vXr1+3ixYsFtFoei1meHeume9ZwWsHjaYF/e8AGWREAi99y/egaooz+rem3b9/M48ePDfYGc/ToURln+vTpBrMvedaLQIq1gAp0i2BxWYzspLm52Tx48MDgDcs8evTIfP782fz9+9c8f/7c4N0iGIehkgtYwQcFWWSoQAstBYp8clPwPMOcPXvWbN++3Tx8+DAURnFxsenbt6/cEX358kVmJ7RiZkLFKqfDrBYxfZ3E81NFRUXgrzNnzrS8JuGZvqioyA4aNMjCRYNy4Eu1y3aqw3opOGkRRw6juthfv34dDIKd3KY4hEkdhscMQmTQXwrwLNcwSkUkjBaePHlSwhAMykuntKSW//79u50/f74MSKvrgIwmCpZ5fdbyHkg1AjWir0Luas0vXrxQx2X8gyicWAZAUnj48GFz48YNM2vWLFm4bvRhBdZlZCEzr+XhPUeSargiZu+SGIe5av9+s00tjEGTSMv05DhixAg7ePDgwPrETeYMYNFavMwIcz1QpuXdTOXyC31UgwPq8jgNSwYKHThwQMDA+gFg9BTkcTudBJayHlAi/DiNwW9hd7zuq5PWjXjUPX36tFRl3CdBM0lxOWvwMmLwAmOqq6vNtWvXhJmnjGWs0w1S9yFW71o+01dKnYFXr16JdfEdwCKuB5amdfU2gTOUSDprrJPlTLjhs9Mrpb7A8KW+wR846a1M/f/u3bsCWg9gsIQAKiwsFDnP9DgSSzfY4CyZRBkjEuuzbhZKqPs0oI98MCmPIYVxlYLYpk2bamBhZA3wUpxMOIyJUKMRgMhzr17eqWT58uUGr4SBTOWUrVixIpBLJtqPAqpBM4ZSYlaZ+LEgSXWxpTNw//59saLe56MTsSZulUXOZ/9OVc79evanjGVk1o04A/oWVof2JD1KeE/+r7pS6NWiroF3794JCL54u6DRh8X9vpRt2bKl02cnhmjK3DrMZ8iZXS2iM5PuclcVwOkyuP7AK2ASCL3XXLZsmT127Jgw8wSrZRkCZxv6vfp+JfKktGEs7fW6KnH8+HEBNHv2bEkT3UGjEQaTcqZhMrc8JE/gemyg35O40ELdR0r9n5QfONSf1Y0YcRhO0S5JEboT1wlZXYv1EpXVtglp1h840I+Qd+Dx8p0+MakSuIIX0DoLiDaBImgWKJQhYLetLljK1PJE4mLic5fkzkTSRz7E945169bJwFRCYzx6dcFkmtdNSs85dB/1ebpMZPCqXafPrBs2bKjjTuxTHF9VYviQIYuMmxM/0vETEY4LmQJXP5c+fOUZKkt8APT5rMH7fZjQD90a67mwDx48SMtx6rnouLl0hMwIrcwy1mFdtbYqyx22CqzEaNPlgtXKmaRJfzXYuXNnPa9IGFrv3btncUVpFy5cSEBqWYIkE7RrZQXNtB68FsydlUTQuieJIN1PNhpyIAJSKsNRuXz37t2L8O47A3/kKH758qWBQgYf+HgmkXpwO63/ARm+jFwFXwB7p0pkQIl9e9I0v9kowO7S/t2mvLy8GJ+XhuJqpcBX4H/7u81/1jKjxQy/8v0AAAAASUVORK5CYII=';
        // buf = new Buffer(data, 'base64');
      });

      test(`checking updating movie icon when Content-Type is not multipart/form-data`, async () => {
        // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
        // //========================================================================================================
        // // RESTful API request (getting)
        // const res = await request(app).put(apipath.buildPathMovieIcon(true, ["MOVIE_SomeNonExistingMovie"])).set('Content-Type', 'text/plain');
        // expect(res.status).toBe(415);
      });

      test(`checking updating movie icon when given database entry doesn't exist`, async () => {
        // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
        // //========================================================================================================
        // // RESTful API request (getting)
        // const res = await request(app).put(apipath.buildPathMovieIcon(true, ["MOVIE_SomeNonExistingMovie"])).attach(attachFieldName, buf, attatchOptions);
        // expect(res.status).toBe(404);
      });

      describe(`checking updating movie icon when given database entry exists`, () => {
        // // add an entry to the database
        // const folders = [`Perfect Storm (2000), The `];
        // const folder = `C:\\Movies\\${folders[0]}`;
        // const dpath = `${folder}\\thumbnail`;
        // const column_names = ['title', 'mediaFullPath'];
        // const column_values = [`The Perfect Storm (2000)`, `${folder}\\The.Perfect.Storm.(2000).mkv`];
        // let mid: string;

        // beforeEach(async () => {
        //     mid = await dbdata_moviemanager_instance.addMovie(undefined, undefined, column_names, column_values);
        // });

        // afterEach(() => {
        //     vol.reset();
        // })

        test(`checking updating movie icon when thumb folder doesn't exist`, async () => {
          // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
          // // Setup
          // await fs.promises.mkdir(`${folder}`, { recursive: true });
          // //========================================================================================================
          // // RESTful API request (getting)
          // const res = await request(app).put(apipath.buildPathMovieIcon(true, [mid])).attach(attachFieldName, buf, attatchOptions);
          // expect(res.status).toBe(204);
          // let files: string[];
          // files = await fs.promises.readdir(dpath);
          // expect(files).toHaveLength(1);
          // const filePath = path.format({ dir: dpath, base: files[0] });
          // const fileHandle = await fs.promises.open(filePath, 'r');
          // const bufFile = await fs.promises.readFile(fileHandle);
          // expect(bufFile.length).toBe(buf.length);
          // expect(bufFile.compare(buf, 0, buf.length, 0, buf.length)).toBe(0);
        });

        test(`checking updating movie icon when thumb folder exists`, async () => {
          // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
          // // Setup
          // await fs.promises.mkdir(`${dpath}`, { recursive: true });
          // //========================================================================================================
          // // RESTful API request (getting)
          // const res = await request(app).put(apipath.buildPathMovieIcon(true, [mid])).attach(attachFieldName, buf, attatchOptions);
          // expect(res.status).toBe(204);
          // let files: string[];
          // files = await fs.promises.readdir(dpath);
          // expect(files).toHaveLength(1);
          // const filePath = path.format({ dir: dpath, base: files[0] });
          // const fileHandle = await fs.promises.open(filePath, 'r');
          // const bufFile = await fs.promises.readFile(fileHandle);
          // expect(bufFile.length).toBe(buf.length);
          // expect(bufFile.compare(buf, 0, buf.length, 0, buf.length)).toBe(0);
        });

        test(`checking updating movie icon when thumb folder exists, one file in folder`, async () => {
          // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
          // // Setup
          // vol.fromJSON({
          //     [`${dpath}\\1.png`]: "12345",
          // });
          // //========================================================================================================
          // // RESTful API request (getting)
          // const res = await request(app).put(apipath.buildPathMovieIcon(true, [mid])).attach(attachFieldName, buf, attatchOptions);
          // expect(res.status).toBe(204);
          // let files: string[];
          // files = await fs.promises.readdir(dpath);
          // expect(files).toHaveLength(1);
          // const filePath = path.format({ dir: dpath, base: files[0] });
          // const fileHandle = await fs.promises.open(filePath, 'r');
          // const bufFile = await fs.promises.readFile(fileHandle);
          // expect(bufFile.length).toBe(buf.length);
          // expect(bufFile.compare(buf, 0, buf.length, 0, buf.length)).toBe(0);
        });

        test(`checking updating movie icon when thumb folder exists, more files in folder`, async () => {
          // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
          // // Setup
          // vol.fromJSON({
          //     [`${dpath}\\1.png`]: "12345",
          //     [`${dpath}\\2.png`]: "12345",
          // });
          // //========================================================================================================
          // // RESTful API request (getting)
          // const res = await request(app).put(apipath.buildPathMovieIcon(true, [mid])).attach(attachFieldName, buf, attatchOptions);
          // expect(res.status).toBe(204);
          // let files: string[];
          // files = await fs.promises.readdir(dpath);
          // expect(files).toHaveLength(1);
          // const filePath = path.format({ dir: dpath, base: files[0] });
          // const fileHandle = await fs.promises.open(filePath, 'r');
          // const bufFile = await fs.promises.readFile(fileHandle);
          // expect(bufFile.length).toBe(buf.length);
          // expect(bufFile.compare(buf, 0, buf.length, 0, buf.length)).toBe(0);
        });

        test(`checking updating movie icon when thumb folder exists but busboy stream error occurs and transfer error occurs`, async () => {
          // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
          // await fs.promises.mkdir(`${dpath}`, { recursive: true });
          // const org_updateMovieIcon = dbdata_moviemanager_instance.updateMovieIcon.bind(dbdata_moviemanager_instance);
          // mocked(jest.spyOn(dbdata_moviemanager_instance, "updateMovieIcon")).mockImplementation(async (mid: string, storeMovieIcon: any, req: Request, res: any): Promise<void> => {
          //     const org_req_pipe = req.pipe.bind(req);
          //     mocked(jest.spyOn(req, "pipe")).mockImplementation((destination: NodeJS.WritableStream, options?: { end?: boolean | undefined; } | undefined): NodeJS.WritableStream => {
          //         req.emit("error", new Error("Transfer error"));
          //         return org_req_pipe(destination, options);
          //     });
          //     return org_updateMovieIcon(mid, storeMovieIcon, req, res);
          // });
          // //========================================================================================================
          // // RESTful API request (getting)
          // const res = await request(app).put(apipath.buildPathMovieIcon(true, [mid])).attach(attachFieldName, buf, attatchOptions);
          // expect(res.status).toBe(500);
        });

        test(`checking updating movie icon when thumb folder exists but busboy stream error occurs and transfer is aborted`, async () => {
          // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
          // await fs.promises.mkdir(`${dpath}`, { recursive: true });
          // const org_updateMovieIcon = dbdata_moviemanager_instance.updateMovieIcon.bind(dbdata_moviemanager_instance);
          // mocked(jest.spyOn(dbdata_moviemanager_instance, "updateMovieIcon")).mockImplementation(async (mid: string, storeMovieIcon: any, req: Request, res: any): Promise<void> => {
          //     const org_req_pipe = req.pipe.bind(req);
          //     mocked(jest.spyOn(req, "pipe")).mockImplementation((destination: NodeJS.WritableStream, options?: { end?: boolean | undefined; } | undefined): NodeJS.WritableStream => {
          //         req.aborted = true;
          //         req.emit("error", new Error("Transfer error"));
          //         return org_req_pipe(destination, options);
          //     });
          //     return org_updateMovieIcon(mid, storeMovieIcon, req, res);
          // });
          // //========================================================================================================
          // // RESTful API request (getting)
          // const res = await request(app).put(apipath.buildPathMovieIcon(true, [mid])).attach(attachFieldName, buf, attatchOptions);
          // expect(res.status).toBe(500);
        });

        test(`checking updating movie icon when thumb folder exists but queued handler error occurs`, async () => {
          // expect(dbdata_moviemanager_instance.ready).toBeTruthy();
          // await fs.promises.mkdir(`${dpath}`, { recursive: true });
          // const org_updateMovieIcon = dbdata_moviemanager_instance.updateMovieIcon.bind(dbdata_moviemanager_instance);
          // mocked(jest.spyOn(dbdata_moviemanager_instance, "updateMovieIcon")).mockImplementation(async (mid: string, storeMovieIcon: any, req: Request, res: any): Promise<void> => {
          //     const org_req_pipe = req.pipe.bind(req);
          //     mocked(jest.spyOn(req, "pipe")).mockImplementation((destination: NodeJS.WritableStream, options?: { end?: boolean | undefined; } | undefined): NodeJS.WritableStream => {
          //         destination.prependListener('file', function (fieldname, file, filename, encoding, mimetype) {
          //             mocked(jest.spyOn(file as NodeJS.ReadableStream, "pipe")).mockImplementation((destination: NodeJS.WritableStream, options?: { end?: boolean | undefined; } | undefined): NodeJS.WritableStream | never => {
          //                 throw new Error("Queued event handler exception");
          //             });
          //         });
          //         return org_req_pipe(destination, options);
          //     });
          //     return org_updateMovieIcon(mid, storeMovieIcon, req, res);
          // });
          // console.log("");
          // //========================================================================================================
          // // RESTful API request (getting)
          // const res = await request(app).put(apipath.buildPathMovieIcon(true, [mid])).attach(attachFieldName, buf, attatchOptions);
          // expect(res.status).toBe(500);
        });
      });
    });
  }
);
